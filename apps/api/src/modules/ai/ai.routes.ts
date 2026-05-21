/**
 * Routes AI · parsing langage naturel d'une dépense (spec §3.8).
 *
 *   POST /ai/parse-expense       → texte libre → JSON structuré
 *   POST /ai/voice-to-expense    → audio → Whisper → JSON structuré (un seul appel)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  parseExpenseSmart,
  type GroupMemberContext,
  generateReminderMessage,
} from "./ai.service.js";
import { Errors } from "../../lib/errors.js";
import { transcribeAudio, isWhisperAvailable } from "../voice/voice.service.js";
import { assertCanUseOcr } from "../../lib/plan-limits.js";
import { prisma } from "../../lib/db.js";
// V72 — Tracking LIVE Whisper + LLM
import {
  trackWhisperTranscription,
  recordUsage,
  computeChatCost,
} from "../../lib/usage-tracker.js";

const SUPPORTED_AUDIO_MIME = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
  // V70.1 — Voir voice.routes.ts pour le détail Capacitor iOS.
  "audio/aac",
  "audio/x-aac",
];

/**
 * Sprint AC · Récupère les membres d'un groupe pour les passer au LLM
 * comme contexte de matching. Marque l'utilisateur courant avec `isMe`.
 */
async function fetchGroupMembers(
  groupId: string,
  meId: string,
): Promise<GroupMemberContext[]> {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: {
      user: { select: { id: true, displayName: true } },
    },
  });
  return members.map((m) => ({
    id: m.user.id,
    displayName: m.user.displayName,
    isMe: m.user.id === meId,
  }));
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /ai/parse-expense
   * Body: { text: string }
   * Réponse: ParsedExpense (description, amount, currency, participantsHints, category, confidence, source)
   *
   * Auth requise pour rate-limit naturel par user (l'OPENAI_API_KEY est partagé).
   */
  app.post("/ai/parse-expense", async (req) => {
    const body = z
      .object({
        text: z.string().min(1).max(500),
        // Sprint AC · groupId optionnel pour enrichir le LLM avec les membres
        groupId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const meId = (req.user as any).sub;
    const members = body.groupId
      ? await fetchGroupMembers(body.groupId, meId)
      : undefined;
    // Sprint AC-3 · locale de l'user pour adapter les sorties LLM
    const me = await prisma.user.findUnique({
      where: { id: meId },
      select: { defaultLocale: true },
    });
    const result = await parseExpenseSmart(body.text, members, me?.defaultLocale);
    // V72 — Tracking LIVE du parsing LLM
    void recordUsage({
      userId: meId,
      kind: "LLM_PARSE",
      provider: "openai_chat",
      model: "gpt-4o-mini",
      costCents: computeChatCost(),
      metadata: {
        flow: "parse-expense",
        ...(body.groupId ? { groupId: body.groupId } : {}),
      },
    });
    return result;
  });

  /**
   * Sprint AC · POST /ai/voice-to-expense
   * Body: multipart/form-data
   *   - file: l'audio (webm / mp4 / wav / ogg / mp3 / m4a)
   *   - language (optionnel): code ISO 2 lettres pour booster Whisper
   *
   * Pipeline complet en un seul appel :
   *   audio → Whisper → texte transcrit → parseExpenseSmart → ParsedExpense
   *
   * Réponse :
   *   {
   *     transcript: string,   // texte brut transcrit (debug + affichage)
   *     language: string|null,// langue détectée par Whisper
   *     parsed: ParsedExpense // structure pré-remplie pour le formulaire
   *   }
   *
   * Quota partagé avec OCR scan (assertCanUseOcr) — un user FREE ne peut
   * pas bypass son quota IA en utilisant la voix.
   */
  app.post("/ai/voice-to-expense", async (req) => {
    if (!isWhisperAvailable()) {
      throw Errors.badRequest(
        "Le service de transcription voix n'est pas configuré sur ce serveur. " +
          "Utilise la dictée native de ton navigateur ou contacte l'admin.",
      );
    }
    const meId = (req.user as any).sub;
    // Sprint AC · groupId via query string (multipart ne permet pas de passer
    // facilement un autre champ texte sans complexifier le client).
    const groupId = (req.query as any)?.groupId;
    await assertCanUseOcr(meId, typeof groupId === "string" ? groupId : undefined);

    const data = await (req as any).file();
    if (!data) {
      throw Errors.badRequest(
        "Aucun fichier audio reçu (utilise multipart/form-data avec un champ 'file')",
      );
    }
    const mime = (data.mimetype as string) ?? "";
    const baseMime = mime.split(";")[0];
    if (!SUPPORTED_AUDIO_MIME.includes(baseMime)) {
      throw Errors.badRequest(
        `Format audio non supporté : ${mime}. Utilise WebM, MP4, MP3, WAV, OGG ou M4A.`,
      );
    }
    const buffer = await data.toBuffer();
    const language =
      typeof data.fields?.language?.value === "string"
        ? data.fields.language.value
        : undefined;

    // Étape 1 — transcription Whisper
    const transcription = await transcribeAudio(buffer, mime, language);

    // V72 — Tracking LIVE de la transcription voix
    trackWhisperTranscription({
      userId: meId,
      durationSeconds: transcription.duration ?? 30,
      kind: "VOICE_TRANSCRIBE",
      groupId: typeof groupId === "string" ? groupId : undefined,
    });

    // Étape 2 — parsing LLM avec contexte du groupe si fourni
    const members =
      typeof groupId === "string" && groupId
        ? await fetchGroupMembers(groupId, meId)
        : undefined;
    // Sprint AC-3 · locale de l'user pour adapter le prompt LLM
    const me = await prisma.user.findUnique({
      where: { id: meId },
      select: { defaultLocale: true },
    });
    const parsed = await parseExpenseSmart(
      transcription.text,
      members,
      me?.defaultLocale,
    );

    // V72 — Tracking LIVE du parsing LLM (gpt-4o-mini, coût forfaitaire)
    void recordUsage({
      userId: meId,
      kind: "LLM_PARSE",
      provider: "openai_chat",
      model: "gpt-4o-mini",
      costCents: computeChatCost(),
      metadata: {
        flow: "voice-to-expense",
        ...(typeof groupId === "string" ? { groupId } : {}),
      },
    });

    return {
      transcript: transcription.text,
      language: transcription.language,
      duration: transcription.duration,
      parsed,
    };
  });

  /**
   * V56 · POST /ai/reminder-message
   * Génère un message de relance personnalisé via GPT-4o-mini.
   *
   * Body:
   *   debtorName      : prénom du débiteur
   *   debtorUserId    : (optionnel) id user pour vérifier qu'il existe vraiment
   *                     dans un groupe partagé avec moi (anti-spam)
   *   amount          : montant dû (string)
   *   currency        : devise ISO
   *   tone            : "sympa" | "ferme" | "humour" | "pro"
   *   locale          : code ISO 2 lettres (langue du message à générer)
   *   groupNames      : (optionnel) noms des groupes partagés pour contexte
   *
   * Réponse: { message: string }
   *
   * Quota partagé avec OCR (assertCanUseOcr) — on évite l'abus de l'IA.
   */
  app.post("/ai/reminder-message", async (req) => {
    const meId = (req.user as any).sub;

    const body = z
      .object({
        debtorName: z.string().min(1).max(80),
        debtorUserId: z.string().uuid().optional(),
        amount: z.string().min(1).max(20),
        currency: z.string().min(3).max(6),
        tone: z.enum(["sympa", "ferme", "humour", "pro"]),
        locale: z.string().min(2).max(10),
        groupNames: z.array(z.string().max(80)).max(5).optional(),
      })
      .parse(req.body);

    // V56 — Récupère le creditorName depuis le profil de l'utilisateur connecté
    const me = await prisma.user.findUnique({
      where: { id: meId },
      select: { displayName: true },
    });
    if (!me) throw Errors.unauthorized("Utilisateur introuvable");

    // V56 — Quota IA partagé (même bucket que OCR/voice) — anti-spam
    await assertCanUseOcr(meId);

    const creditorName = me.displayName.split(" ")[0] ?? me.displayName;

    const message = await generateReminderMessage({
      debtorName: body.debtorName,
      creditorName,
      amount: body.amount,
      currency: body.currency,
      tone: body.tone,
      locale: body.locale,
      groupNames: body.groupNames,
    });

    // V72 — Tracking LIVE du message de relance (gpt-4o-mini)
    void recordUsage({
      userId: meId,
      kind: "LLM_PARSE",
      provider: "openai_chat",
      model: "gpt-4o-mini",
      costCents: computeChatCost(),
      metadata: { flow: "reminder-message", tone: body.tone },
    });

    return { message };
  });
}
