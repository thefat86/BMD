/**
 * Routes Meetings · Procès-verbaux audio (Sprint AC-2).
 *
 *   POST   /groups/:id/meetings           multipart audio + meta → start pipeline
 *   GET    /groups/:id/meetings           liste (membres du groupe)
 *   GET    /meetings/:id                  détail (transcript + extracted decisions)
 *   POST   /meetings/:id/apply            valide les décisions corrigées → crée expenses/etc.
 *   POST   /meetings/:id/cancel           annule (organisateur ou admin)
 *   POST   /meetings/:id/retry            relance le pipeline si FAILED
 *   DELETE /meetings/:id/audio            purge l'audio (RGPD)
 *   GET    /groups/:id/meetings/usage     état du quota (pour l'UI : combien il reste)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../../lib/errors.js";
import { getMeetingUsage } from "../../lib/plan-limits.js";
import { prisma } from "../../lib/db.js";
import {
  uploadMeeting,
  applyMeeting,
  cancelMeeting,
  retryMeeting,
  listMeetings,
  getMeeting,
  purgeMeetingAudio,
  type MeetingDecision,
} from "./meetings.service.js";

// Zod schema pour valider les décisions venant du frontend (l'organisateur
// peut éditer chaque ligne avant validation — on doit re-checker le payload).
const decisionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("EXPENSE"),
    description: z.string().min(1).max(200),
    amount: z.number().positive(),
    currency: z.string().length(3).nullable(),
    paidByUserId: z.string().uuid().nullable(),
    participantIds: z.array(z.string().uuid()).min(1),
    splitMode: z.enum(["EQUAL", "UNEQUAL", "PERCENTAGE"]),
    shares: z.record(z.string().uuid(), z.number().nonnegative()).optional(),
    payers: z
      .array(
        z.object({
          userId: z.string().uuid(),
          amount: z.number().nonnegative().optional(),
          percent: z.number().min(0).max(100).optional(),
        }),
      )
      .optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("SETTLEMENT"),
    fromUserId: z.string().uuid(),
    toUserId: z.string().uuid(),
    amount: z.number().positive(),
    currency: z.string().length(3).nullable(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("TONTINE_CONTRIBUTION"),
    contributorUserId: z.string().uuid(),
    amount: z.number().positive(),
    paymentMethod: z.string().max(60).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("NOTE"),
    text: z.string().min(1).max(500),
  }),
]);

/** Sérialise un MeetingRecord (cast any en attendant la regen Prisma). */
function serialize(m: any) {
  return {
    id: m.id,
    title: m.title,
    occurredAt: m.occurredAt?.toISOString?.() ?? m.occurredAt,
    status: m.status,
    summary: m.summary,
    durationSeconds: m.durationSeconds,
    addonCents: m.addonCents,
    createdAt: m.createdAt?.toISOString?.() ?? m.createdAt,
    appliedAt: m.appliedAt?.toISOString?.() ?? m.appliedAt ?? null,
    createdBy: m.createdBy,
  };
}

function serializeDetail(m: any) {
  return {
    ...serialize(m),
    transcript: m.transcript ?? null,
    language: m.language ?? null,
    extractedJson: m.extractedJson ?? null,
    errorMessage: m.errorMessage ?? null,
    audioMimeType: m.audioMimeType,
    audioSizeBytes: m.audioSizeBytes,
    audioPurged: !m.audioStorageKey,
    group: { id: m.group.id, name: m.group.name },
  };
}

export async function meetingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /groups/:id/meetings/usage — l'UI utilise ça pour afficher
   * "il te reste 2/4 réunions ce mois-ci" + le coût de l'addon si dépassé.
   * Le quota se calcule sur l'admin du groupe (= celui qui paie).
   */
  app.get("/groups/:id/meetings/usage", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const group = await prisma.group.findUnique({
      where: { id: params.id },
      select: { createdById: true, members: { select: { userId: true } } },
    });
    if (!group) throw Errors.notFound("Ce groupe est introuvable 🤔");
    const me = (req.user as any).sub;
    if (!group.members.some((m) => m.userId === me)) {
      throw Errors.forbidden("Tu n'es pas membre de ce groupe");
    }
    return getMeetingUsage(group.createdById);
  });

  /**
   * GET /groups/:id/meetings — liste des réunions du groupe.
   */
  app.get("/groups/:id/meetings", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const items = await listMeetings(params.id, (req.user as any).sub);
    return items.map(serialize);
  });

  /**
   * POST /groups/:id/meetings — upload d'un nouvel enregistrement.
   *
   * Multipart :
   *   - file (audio) : webm / mp4 / m4a / mp3 / wav / ogg (≤ 80 Mo)
   *   - title (text) : titre de la réunion
   *   - occurredAt (text, optionnel) : ISO date
   *   - acceptAddon (text, optionnel) : "true" si l'utilisateur a confirmé
   *     qu'il accepte de payer l'addon (au-delà du quota mensuel)
   */
  app.post("/groups/:id/meetings", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = await (req as any).file();
    if (!data) {
      throw Errors.badRequest(
        "Aucun fichier audio reçu (utilise multipart/form-data avec un champ 'file')",
      );
    }
    const buffer = await data.toBuffer();
    const fields = data.fields as Record<string, any>;
    const title =
      typeof fields?.title?.value === "string"
        ? fields.title.value
        : "Réunion";
    const occurredAtStr =
      typeof fields?.occurredAt?.value === "string"
        ? fields.occurredAt.value
        : null;
    const acceptAddon = fields?.acceptAddon?.value === "true";

    const meeting = await uploadMeeting({
      groupId: params.id,
      actorUserId: (req.user as any).sub,
      title,
      occurredAt: occurredAtStr ? new Date(occurredAtStr) : undefined,
      buffer,
      mimeType: data.mimetype,
      fileName: data.filename ?? "meeting.webm",
      acceptAddon,
    });
    return reply.code(201).send(serialize(meeting));
  });

  /**
   * GET /meetings/:id — détail (transcript + decisions). Membres du groupe.
   */
  app.get("/meetings/:id", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const meeting = await getMeeting(params.id, (req.user as any).sub);
    return serializeDetail(meeting);
  });

  /**
   * POST /meetings/:id/apply — applique les décisions validées.
   *
   * Body : { decisions: MeetingDecision[] }
   * (le frontend renvoie la liste éventuellement éditée par l'organisateur)
   */
  app.post("/meetings/:id/apply", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ decisions: z.array(decisionSchema).max(50) })
      .parse(req.body);
    const result = await applyMeeting({
      meetingId: params.id,
      actorUserId: (req.user as any).sub,
      decisions: body.decisions as MeetingDecision[],
    });
    return result;
  });

  /**
   * POST /meetings/:id/cancel — annule la réunion (avant ou après extraction).
   * Si la réunion était APPLIED, on refuse — il faut supprimer manuellement
   * les Expenses créées pour rollback.
   */
  app.post("/meetings/:id/cancel", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    await cancelMeeting(params.id, (req.user as any).sub);
    return reply.code(204).send();
  });

  /**
   * POST /meetings/:id/retry — relance le pipeline en cas de FAILED.
   */
  app.post("/meetings/:id/retry", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    await retryMeeting(params.id, (req.user as any).sub);
    return { retrying: true };
  });

  /**
   * DELETE /meetings/:id/audio — purge le fichier audio (RGPD / cleanup).
   * La row MeetingRecord reste pour l'audit, mais audioStorageKey="" indique
   * que l'audio n'est plus disponible.
   */
  app.delete("/meetings/:id/audio", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    await purgeMeetingAudio(params.id, (req.user as any).sub);
    return reply.code(204).send();
  });
}
