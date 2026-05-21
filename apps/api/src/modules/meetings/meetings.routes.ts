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
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
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
  editMeeting,
  type MeetingDecision,
} from "./meetings.service.js";
import { generateMeetingMinutesPdf } from "./meeting-minutes-pdf.service.js";

const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.BMD_UPLOAD_DIR ?? "uploads",
);

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
  // V218.H — On expose `detailedReport` (champ moderne) + `minutes` (alias
  // historique). Le client moderne lit detailedReport ; ancien front continue
  // sur minutes. Idem pour nextSteps (Json, null si non rempli).
  const detailedReport =
    typeof m.detailedReport === "string" && m.detailedReport.length > 0
      ? m.detailedReport
      : typeof m.minutes === "string"
        ? m.minutes
        : null;
  return {
    ...serialize(m),
    transcript: m.transcript ?? null,
    language: m.language ?? null,
    extractedJson: m.extractedJson ?? null,
    // V162 — Compte rendu narratif détaillé + horodatage édition manuelle
    minutes: m.minutes ?? null,
    // V218.H — Sections refondues (Partie 3 + Partie 4)
    detailedReport,
    nextSteps: Array.isArray(m.nextSteps) ? m.nextSteps : [],
    manuallyEditedAt: m.manuallyEditedAt?.toISOString?.() ?? m.manuallyEditedAt ?? null,
    errorMessage: m.errorMessage ?? null,
    audioMimeType: m.audioMimeType,
    audioSizeBytes: m.audioSizeBytes,
    audioPurged: !m.audioStorageKey,
    group: {
      id: m.group.id,
      name: m.group.name,
      // V162 — Inclus pour permettre au front d'afficher la liste des membres
      // dans le DecisionEditor (lookup userId → displayName).
      members: Array.isArray(m.group.members)
        ? m.group.members.map((mem: any) => ({
            userId: mem.userId,
            role: mem.role,
            user: mem.user,
          }))
        : [],
    },
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
   * V221 — GET /meetings/:id/audio — streame le fichier audio brut pour lecture
   * dans un <audio controls> côté front. Token Bearer requis (header
   * Authorization classique OU query param ?token=… pour les balises audio
   * qui ne savent pas envoyer de header). Vérifie l'appartenance au groupe.
   *
   * Si l'audio a été purgé (RGPD) → 404. Sinon stream avec le bon Content-Type
   * et un en-tête Accept-Ranges pour permettre le seek dans le lecteur.
   */
  app.get("/meetings/:id/audio", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const meeting = await getMeeting(params.id, (req.user as any).sub);
    if (!meeting.audioStorageKey) {
      throw Errors.notFound(
        "Le fichier audio de cette réunion a été purgé (RGPD).",
      );
    }
    const fullPath = path.join(UPLOAD_DIR, meeting.audioStorageKey);
    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      throw Errors.notFound(
        "Le fichier audio est introuvable sur le serveur.",
      );
    }
    return reply
      .header("Content-Type", meeting.audioMimeType || "audio/webm")
      .header("Content-Length", String(fileStat.size))
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "private, max-age=300")
      .send(createReadStream(fullPath));
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

  /**
   * V162 — PATCH /meetings/:id — édite manuellement les outputs IA.
   *
   * Body (tous les champs optionnels — n'envoie que ce qui change) :
   *   { summary?: string, minutes?: string, decisions?: MeetingDecision[] }
   *
   * Cas d'usage : l'IA s'est trompée sur le compte rendu ou un montant —
   * l'organisateur corrige à la main avant validation. La transcription
   * brute Whisper n'est PAS éditable (référence audit immuable).
   *
   * Bloqué si status = APPLIED (les Expenses créées doivent rester
   * cohérentes avec extractedJson).
   */
  app.patch("/meetings/:id", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        // V221 — Titre éditable de la réunion
        title: z.string().min(1).max(200).optional(),
        summary: z.string().max(500).optional(),
        // V218.H — `minutes` (alias historique) + `detailedReport` (canal moderne)
        // sont tous deux acceptés. Le service les synchronise.
        minutes: z.string().max(20000).optional(),
        detailedReport: z.string().max(20000).optional(),
        nextSteps: z
          .array(
            z.object({
              text: z.string().min(1).max(400),
              ownerUserId: z.string().uuid().nullable().optional(),
              ownerName: z.string().max(120).nullable().optional(),
              dueHint: z.string().max(160).nullable().optional(),
            }),
          )
          .max(12)
          .optional(),
        // V221 — Transcription verbatim éditable (correction Whisper)
        transcript: z.string().max(200000).optional(),
        decisions: z.array(decisionSchema).max(50).optional(),
      })
      .parse(req.body);
    await editMeeting({
      meetingId: params.id,
      actorUserId: (req.user as any).sub,
      title: body.title,
      summary: body.summary,
      minutes: body.minutes,
      detailedReport: body.detailedReport,
      nextSteps: body.nextSteps,
      transcript: body.transcript,
      decisions: body.decisions as MeetingDecision[] | undefined,
    });
    const meeting = await getMeeting(params.id, (req.user as any).sub);
    return serializeDetail(meeting);
  });

  /**
   * V162 — POST /meetings/:id/export-pdf — génère et télécharge un PDF
   * brandé BMD avec les sections sélectionnées par l'utilisateur.
   *
   * Body : { sections: { decisions?: boolean, summary?: boolean,
   *                      minutes?: boolean, transcript?: boolean } }
   *
   * Au moins une section doit être sélectionnée. Retourne application/pdf.
   * Tous les membres du groupe peuvent télécharger (lecture seule).
   */
  app.post("/meetings/:id/export-pdf", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        sections: z
          .object({
            // V218.H — 5 sections structurées (Partie 1 → 5)
            summary: z.boolean().optional().default(true),
            decisions: z.boolean().optional().default(true),
            nextSteps: z.boolean().optional().default(true),
            minutes: z.boolean().optional().default(true),
            transcript: z.boolean().optional().default(false),
          })
          .default({}),
      })
      .parse(req.body ?? {});

    const sectionsAny =
      body.sections.summary ||
      body.sections.decisions ||
      body.sections.nextSteps ||
      body.sections.minutes ||
      body.sections.transcript;
    if (!sectionsAny) {
      throw Errors.badRequest(
        "Sélectionne au moins une section à exporter dans le PDF.",
      );
    }

    const bytes = await generateMeetingMinutesPdf({
      meetingId: params.id,
      actorUserId: (req.user as any).sub,
      sections: body.sections,
    });

    // Slug stable basé sur le titre pour le filename. ASCII safe.
    const meeting = await getMeeting(params.id, (req.user as any).sub);
    const slug =
      (meeting.title ?? "reunion")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) || "reunion";
    const filename = `bmd-compte-rendu-${slug}.pdf`;

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("Cache-Control", "no-store")
      .send(Buffer.from(bytes));
  });
}
