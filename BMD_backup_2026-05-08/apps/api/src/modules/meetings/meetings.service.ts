/**
 * Meetings service · Procès-verbaux de réunions de tontine (Sprint AC-2).
 *
 * Le pipeline complet d'une réunion :
 *
 *   [1] uploadMeeting()
 *       L'organisateur (secrétaire / trésorier) enregistre l'audio puis
 *       upload via multipart. On vérifie le quota du plan de l'admin du
 *       groupe, on stocke le fichier sur disque, on crée un MeetingRecord
 *       en status PENDING. La transcription part en arrière-plan.
 *
 *   [2] processMeeting() (background)
 *       PENDING → TRANSCRIBING : Whisper API
 *       TRANSCRIBING → EXTRACTING : GPT-4o-mini avec contexte du groupe
 *       EXTRACTING → REVIEW : prêt à être validé par l'organisateur
 *       En cas d'échec → FAILED (errorMessage rempli pour l'UI).
 *
 *   [3] applyMeeting()
 *       L'organisateur valide / corrige chaque ligne dans l'UI (chaque
 *       décision peut être acceptée, modifiée, ou supprimée). À la
 *       validation, on crée les Expenses / Settlements / TontineContribution
 *       correspondants en base, avec `meetingRecordId` pour audit trail.
 *       Status passe à APPLIED.
 *
 * Coût d'une réunion (~30 min) :
 *   - Whisper : 0,006 $/min × 30 = ~0,18 $ ≈ 0,17 €
 *   - GPT-4o-mini : ~0,01 € pour 5k tokens entrée + 1k sortie
 *   Total : ~0,18 € — très rentable face à 1,99-2,99 € l'addon.
 *
 * Audit / sécurité :
 *   - Tous les membres du groupe peuvent voir une réunion en REVIEW pour
 *     contester avant application.
 *   - Seul l'organisateur OU un admin peut applyMeeting() (anti-fraude :
 *     évite qu'un membre simple modifie unilatéralement les comptes).
 *   - Les Expenses créées portent `meetingRecordId` pour pouvoir être
 *     retrouvées si besoin de rollback.
 */
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { loadEnv } from "../../lib/env.js";
import {
  isWhisperAvailable,
  transcribeAudio,
} from "../voice/voice.service.js";
import { assertCanCreateMeeting, getMeetingUsage } from "../../lib/plan-limits.js";
import { JobQueue } from "../../lib/job-queue.js";
import { createExpense } from "../expenses/expenses.service.js";
import { events } from "../../lib/event-stream.js";
import { notifyGroupMembers } from "../notifications/notifications.service.js";

const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.BMD_UPLOAD_DIR ?? "uploads",
);

// Audio plus volumineux que les pièces jointes classiques (réunions = 30-60 min).
const MAX_MEETING_AUDIO_BYTES = 80 * 1024 * 1024; // 80 Mo (~ 1h en m4a)
const SUPPORTED_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
]);

async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Sprint AC-3 · Queue bornée pour le pipeline Whisper + LLM.
 *
 * Limite à 4 réunions traitées en parallèle pour ne pas saturer Whisper
 * (rate-limit ~10 req/s en pratique) ni la mémoire du process Node (chaque
 * job charge un buffer audio en RAM).
 *
 * Retry exponentiel : 30s → 2min → 10min. Au final, on marque la réunion
 * en FAILED avec un message clair pour que l'organisateur puisse réessayer
 * manuellement quand le service Whisper sera revenu.
 */
const meetingQueue = new JobQueue<{ meetingId: string }>({
  name: "meeting-pipeline",
  concurrency: 4,
  worker: async ({ meetingId }) => {
    await processMeetingInternal(meetingId);
  },
  onFinalFailure: async ({ meetingId }, lastError) => {
    try {
      await (prisma as any).meetingRecord.update({
        where: { id: meetingId },
        data: {
          status: "FAILED",
          errorMessage:
            `Le pipeline a échoué après plusieurs tentatives. Dernière erreur : ${lastError.message.slice(0, 300)}`,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[meetings] failed to mark FAILED:", (err as Error).message);
    }
  },
});

function extFromMime(mime: string): string {
  const m: Record<string, string> = {
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
  };
  return m[mime] ?? ".bin";
}

/**
 * Décision extraite d'une réunion par le LLM. Chaque type de décision donne
 * lieu à une action métier différente quand on `applyMeeting()`.
 *
 * On reste large dans la modélisation pour pouvoir évoluer sans migration —
 * stocké en JSON dans `MeetingRecord.extractedJson`.
 */
export type MeetingDecision =
  | {
      kind: "EXPENSE";
      description: string;
      amount: number;
      currency: string | null;
      paidByUserId: string | null;
      participantIds: string[];
      splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE";
      shares?: Record<string, number>;
      payers?: Array<{ userId: string; amount?: number; percent?: number }>;
      notes?: string;
    }
  | {
      kind: "SETTLEMENT";
      fromUserId: string;
      toUserId: string;
      amount: number;
      currency: string | null;
      notes?: string;
    }
  | {
      kind: "TONTINE_CONTRIBUTION";
      contributorUserId: string;
      amount: number;
      paymentMethod?: string;
      notes?: string;
    }
  | { kind: "NOTE"; text: string };

export interface MeetingExtraction {
  summary: string;
  decisions: MeetingDecision[];
}

/**
 * Vérifie l'accès "lecture" d'un user à une réunion (membre du groupe).
 */
async function getMeetingForRead(meetingId: string, actorUserId: string) {
  const meeting = await (prisma as any).meetingRecord.findUnique({
    where: { id: meetingId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          createdById: true,
          defaultCurrency: true,
          members: {
            select: {
              userId: true,
              role: true,
              // Sprint AC-3 · Pour permettre à l'UI de présenter
              // un dropdown éditable de payeurs/participants.
              user: { select: { id: true, displayName: true } },
            },
          },
        },
      },
      createdBy: { select: { id: true, displayName: true } },
    },
  });
  if (!meeting) throw Errors.notFound("Cette réunion est introuvable 🤔");
  const isMember = meeting.group.members.some(
    (m: any) => m.userId === actorUserId,
  );
  if (!isMember) {
    throw Errors.forbidden("Tu n'es pas membre du groupe de cette réunion");
  }
  return meeting;
}

/**
 * Permission "écriture" : créateur OU admin du groupe OU créateur du groupe.
 * Anti-fraude : un membre simple ne peut pas valider/annuler les comptes.
 */
function canModifyMeeting(meeting: any, actorUserId: string): boolean {
  if (meeting.createdById === actorUserId) return true;
  if (meeting.group.createdById === actorUserId) return true;
  const member = meeting.group.members.find(
    (m: any) => m.userId === actorUserId,
  );
  return member?.role === "ADMIN";
}

// ============================================================
// 1) Upload + démarrage du pipeline
// ============================================================

export interface UploadMeetingInput {
  groupId: string;
  actorUserId: string;
  title: string;
  occurredAt?: Date;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  /** Si true, l'utilisateur accepte l'addon facturé (au-delà du quota mensuel) */
  acceptAddon?: boolean;
}

/**
 * Crée une nouvelle réunion (audio uploadé + meta) puis lance le pipeline
 * Whisper + LLM en arrière-plan. Retourne immédiatement le MeetingRecord
 * en status PENDING — le frontend pollse / écoute SSE pour suivre l'avancée.
 */
export async function uploadMeeting(input: UploadMeetingInput) {
  if (!isWhisperAvailable()) {
    throw Errors.badRequest(
      "Le service de transcription n'est pas configuré sur ce serveur. " +
        "Contacte l'admin pour activer Whisper.",
    );
  }
  if (input.buffer.length === 0) {
    throw Errors.badRequest("Fichier audio vide");
  }
  if (input.buffer.length > MAX_MEETING_AUDIO_BYTES) {
    throw Errors.badRequest(
      `Fichier audio trop gros (max ${Math.round(MAX_MEETING_AUDIO_BYTES / 1024 / 1024)} Mo). ` +
        "Coupe l'enregistrement ou utilise une réunion plus courte.",
    );
  }
  const baseMime = input.mimeType.split(";")[0]!.trim().toLowerCase();
  if (!SUPPORTED_AUDIO_MIMES.has(baseMime)) {
    throw Errors.badRequest(
      `Format audio non supporté : ${input.mimeType}. Utilise WebM, MP4/M4A, MP3, WAV ou OGG.`,
    );
  }

  // Vérifie le quota du plan de l'admin (qui paie). Lève si bloqué.
  const { addonCents, usage } = await assertCanCreateMeeting(
    input.groupId,
    input.acceptAddon === true,
  );

  // Sprint AC-3 · Avertissement préventif si l'audio est trop volumineux
  // pour rentrer dans la fenêtre de durée du plan. On approxime 1 Mo ≈ 60 s
  // d'audio compressé (m4a/webm-opus) — c'est conservateur, en réalité on
  // est plus proche de 0,5-1 Mo/min selon la qualité. Si dépassement clair,
  // on refuse côté serveur. Le client doit aussi enforce ça côté UI pour
  // éviter d'uploader pour rien.
  const approxSeconds = Math.round(input.buffer.length / (1024 * 1024) * 60);
  if (
    usage.maxDurationSeconds > 0 &&
    approxSeconds > usage.maxDurationSeconds * 1.5
  ) {
    throw Errors.badRequest(
      `Cet enregistrement (~${Math.floor(approxSeconds / 60)} min estimé) dépasse la durée max autorisée pour ton plan (${Math.floor(usage.maxDurationSeconds / 60)} min). Découpe-le en plusieurs réunions plus courtes.`,
    );
  }

  // Vérifie que l'actor est bien membre du groupe
  const member = await prisma.groupMember.findFirst({
    where: { groupId: input.groupId, userId: input.actorUserId },
    select: { id: true },
  });
  if (!member) {
    throw Errors.forbidden("Tu n'es pas membre de ce groupe");
  }

  await ensureUploadDir();
  const ext = extFromMime(baseMime);
  const storageKey = `meetings/${randomUUID()}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, input.buffer);

  const meeting = await (prisma as any).meetingRecord.create({
    data: {
      groupId: input.groupId,
      createdById: input.actorUserId,
      title: input.title.trim().slice(0, 200) || "Réunion",
      occurredAt: input.occurredAt ?? new Date(),
      status: "PENDING",
      audioStorageKey: storageKey,
      audioMimeType: baseMime,
      audioSizeBytes: input.buffer.length,
      addonCents,
    },
  });

  // Sprint AC-3 · Si addon > 0, on tente le charge Stripe immédiatement.
  // Si la carte est refusée → on FAIL la réunion AVANT de consommer Whisper
  // (économise les tokens). Si OK → on stocke le payment intent ID.
  if (addonCents > 0) {
    try {
      const { chargeAddon, isStripeConfigured } = await import("../../lib/stripe.js");
      // Récupère le customer Stripe de l'admin du groupe (= celui qui paie).
      // Group n'a pas de relation `createdBy` modélisée — on fetche en deux
      // requêtes : groupe puis user.
      const group = await prisma.group.findUnique({
        where: { id: input.groupId },
        select: { createdById: true, name: true },
      });
      const admin = group
        ? await prisma.user.findUnique({
            where: { id: group.createdById },
            select: { stripeCustomerId: true },
          })
        : null;
      if (isStripeConfigured() && admin?.stripeCustomerId && group) {
        const result = await chargeAddon({
          customerId: admin.stripeCustomerId,
          amountCents: addonCents,
          currency: "eur", // tariff stocké en EUR pivot
          description: `Réunion supplémentaire — ${group.name}`,
          idempotencyKey: `meeting_${meeting.id}`,
          metadata: {
            kind: "meeting_addon",
            meetingId: meeting.id,
            groupId: input.groupId,
          },
        });
        await (prisma as any).meetingRecord.update({
          where: { id: meeting.id },
          data: { addonStripeId: result.paymentIntentId },
        });
      }
      // Si Stripe pas configuré OU pas de customer, on log mais on continue.
      // L'admin pourra réconcilier manuellement (le `addonCents` reste tracé).
    } catch (err) {
      // Sprint AC-4 · Stripe a refusé (carte expirée, fonds insuffisants,
      // 3DS échoué). On crée une billing portal session pour que l'orga
      // puisse réparer sa carte en 1 clic, et on injecte le lien dans le
      // message d'erreur. Si la création de portal échoue (Stripe down ?),
      // on retombe sur un message générique.
      let portalNote = "";
      try {
        const { createBillingPortalSession } = await import("../../lib/stripe.js");
        const groupForPortal = await prisma.group.findUnique({
          where: { id: input.groupId },
          select: { createdById: true },
        });
        const adminForPortal = groupForPortal
          ? await prisma.user.findUnique({
              where: { id: groupForPortal.createdById },
              select: { stripeCustomerId: true },
            })
          : null;
        if (adminForPortal?.stripeCustomerId) {
          const baseUrl =
            process.env.WEB_BASE_URL ?? "https://www.backmesdo.com";
          const portal = await createBillingPortalSession({
            customerId: adminForPortal.stripeCustomerId,
            returnUrl: `${baseUrl}/dashboard/groups/${input.groupId}`,
          });
          portalNote = ` Mets à jour ta carte ici : ${portal.url}`;
        }
      } catch {
        portalNote = " Va dans tes paramètres pour mettre à jour ta carte.";
      }
      await (prisma as any).meetingRecord.update({
        where: { id: meeting.id },
        data: {
          status: "FAILED",
          errorMessage:
            `Le paiement de l'addon (${addonCents} centimes) a été refusé par la banque : ${(err as Error).message.slice(0, 200)}.${portalNote}`,
        },
      });
      events.meetingUpdated?.(input.groupId, meeting.id);
      return meeting;
    }
  }

  // Sprint AC-3 · Enqueue dans la queue bornée plutôt que fire & forget
  // direct. Si 50 réunions arrivent en même temps, seulement 4 tournent
  // en parallèle, les autres attendent. Si Whisper renvoie une 5xx, retry
  // exponentiel automatique. Si 3 échecs consécutifs → status FAILED +
  // message clair pour l'organisateur.
  meetingQueue.enqueue(meeting.id, { meetingId: meeting.id });

  return meeting;
}

// ============================================================
// 2) Pipeline background : Whisper + LLM
// ============================================================

/**
 * Sprint AC-3 · Wrapper public qui ENQUEUE le job au lieu de l'exécuter
 * directement. Garde la rétrocompat des appels existants (retry, etc).
 */
export function processMeeting(meetingId: string): void {
  meetingQueue.enqueue(meetingId, { meetingId });
}

/**
 * Sprint AC-3 · Expose les stats de la queue pour /health.
 */
export function getMeetingQueueStats() {
  return meetingQueue.stats();
}

/**
 * Transcrit puis extrait les décisions d'une réunion. Met à jour le statut
 * au fur et à mesure pour que l'UI puisse refléter la progression.
 *
 * Idempotent : si on ré-appelle après un FAILED, ça repart depuis le début.
 *
 * NOTE Sprint AC-3 : cette fonction n'est plus appelée directement depuis
 * l'extérieur. Elle est pilotée par `meetingQueue` qui gère la concurrence
 * + le retry. Garde-la `async` car la queue worker l'attend en Promise.
 */
async function processMeetingInternal(meetingId: string): Promise<void> {
  const meeting = await (prisma as any).meetingRecord.findUnique({
    where: { id: meetingId },
    include: {
      group: {
        select: {
          id: true,
          createdById: true,
          defaultCurrency: true,
          members: {
            select: { user: { select: { id: true, displayName: true } } },
          },
        },
      },
    },
  });
  if (!meeting) return;
  if (meeting.status === "APPLIED" || meeting.status === "CANCELLED") return;

  const fullPath = path.join(UPLOAD_DIR, meeting.audioStorageKey);

  try {
    // ----- ÉTAPE 1 : Whisper -----
    await (prisma as any).meetingRecord.update({
      where: { id: meetingId },
      data: { status: "TRANSCRIBING", errorMessage: null },
    });
    events.meetingUpdated?.(meeting.groupId, meetingId);

    const buffer = await import("fs/promises").then((m) => m.readFile(fullPath));
    const transcription = await transcribeAudio(
      buffer,
      meeting.audioMimeType,
      undefined, // auto-detect
    );

    // Sprint AC-3 · Vérifie la durée réelle contre le plan de l'admin du
    // groupe une fois Whisper passé. Si dépassement, on FAIL la réunion
    // pour ne pas consommer de tokens LLM sur un transcript trop long.
    // On garde quand même la transcription pour que l'organisateur puisse
    // la copier-coller manuellement dans une dépense / note.
    const actualDuration = transcription.duration
      ? Math.round(transcription.duration)
      : null;
    let durationOk = true;
    let durationErrorMsg: string | null = null;
    if (actualDuration && actualDuration > 0) {
      const adminUsage = await getMeetingUsage(meeting.group.createdById ?? meeting.createdById);
      if (adminUsage.maxDurationSeconds > 0 && actualDuration > adminUsage.maxDurationSeconds) {
        durationOk = false;
        durationErrorMsg = `Cette réunion dure ${Math.floor(actualDuration / 60)} min, le plan autorise max ${Math.floor(adminUsage.maxDurationSeconds / 60)} min. La transcription est conservée mais l'extraction IA est annulée pour limiter les coûts.`;
      }
    }

    await (prisma as any).meetingRecord.update({
      where: { id: meetingId },
      data: durationOk
        ? {
            status: "EXTRACTING",
            transcript: transcription.text,
            language: transcription.language,
            durationSeconds: actualDuration,
          }
        : {
            status: "FAILED",
            transcript: transcription.text,
            language: transcription.language,
            durationSeconds: actualDuration,
            errorMessage: durationErrorMsg,
          },
    });
    events.meetingUpdated?.(meeting.groupId, meetingId);
    if (!durationOk) return;

    // ----- ÉTAPE 2 : LLM extraction -----
    const members = meeting.group.members.map((m: any) => ({
      id: m.user.id,
      displayName: m.user.displayName,
    }));
    const extraction = await extractDecisionsWithLLM(
      transcription.text,
      members,
      meeting.group.defaultCurrency,
    );

    // ----- ÉTAPE 3 : prêt pour review -----
    await (prisma as any).meetingRecord.update({
      where: { id: meetingId },
      data: {
        status: "REVIEW",
        summary: extraction.summary.slice(0, 500),
        extractedJson: extraction as any,
      },
    });
    events.meetingUpdated?.(meeting.groupId, meetingId);

    // Notifie les admins du groupe que la réunion est prête à être validée.
    // (cast `any` car la regen du client Prisma se fait après migration)
    void notifyGroupMembers({
      groupId: meeting.groupId,
      excludeUserId: undefined,
      notification: {
        kind: "MEETING_READY" as any,
        title: `Réunion à valider — ${meeting.title}`,
        body: `${extraction.decisions.length} décision(s) extraite(s) de l'enregistrement. Vérifie et applique pour mettre à jour les comptes du groupe.`,
        link: `/dashboard/groups/${meeting.groupId}/meetings/${meetingId}`,
        payload: { groupId: meeting.groupId, meetingId },
      },
    });

    // Sprint AC-3 · Email premium chaleureux + WhatsApp aux admins du groupe.
    // Fire-and-forget — un échec ici ne doit pas bloquer le pipeline.
    void notifyMeetingReady({
      meetingId,
      groupId: meeting.groupId,
      meetingTitle: meeting.title,
      decisionsCount: extraction.decisions.length,
      summary: extraction.summary,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[meetings] notifyMeetingReady failed:", (err as Error).message);
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Erreur inconnue";
    // eslint-disable-next-line no-console
    console.error("[meetings] pipeline failed:", msg);
    await (prisma as any).meetingRecord.update({
      where: { id: meetingId },
      data: { status: "FAILED", errorMessage: msg.slice(0, 500) },
    });
    events.meetingUpdated?.(meeting.groupId, meetingId);
  }
}

/**
 * Appelle GPT-4o-mini avec la transcription + le contexte des membres pour
 * extraire les décisions structurées. Anti-hallucination : on filtre les
 * userIds renvoyés contre la liste des membres connus.
 */
async function extractDecisionsWithLLM(
  transcript: string,
  members: Array<{ id: string; displayName: string }>,
  defaultCurrency: string,
): Promise<MeetingExtraction> {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY) {
    // Fallback : on renvoie un résumé vide + une simple NOTE avec la transcription
    return {
      summary:
        "Le service IA n'est pas configuré, voici la transcription brute. Tu peux ajouter les dépenses manuellement.",
      decisions: [{ kind: "NOTE", text: transcript.slice(0, 1000) }],
    };
  }

  const memberList = members
    .map((m) => `  - "${m.displayName}" (id: ${m.id})`)
    .join("\n");

  const systemPrompt = `Tu es un assistant qui analyse une réunion de tontine / coloc / association de la diaspora africaine et asiatique.
La réunion est tenue à l'oral (français, anglais, ou pidgin) et le secrétaire enregistre tout.
Ton rôle : extraire UNIQUEMENT les décisions financières concrètes (qui a payé quoi, qui doit qui, qui touche le pot, etc.).

Membres du groupe :
${memberList}

Devise par défaut : ${defaultCurrency}

Réponds UNIQUEMENT en JSON sans markdown, structure stricte :
{
  "summary": string (1-2 phrases résumant la réunion en français),
  "decisions": [
    // type EXPENSE : une dépense partagée que le groupe a constatée
    { "kind": "EXPENSE", "description": string, "amount": number, "currency": string|null,
      "paidByUserId": string|null, "participantIds": string[],
      "splitMode": "EQUAL"|"UNEQUAL"|"PERCENTAGE",
      "shares": { userId: number }|null,
      "payers": [{"userId": string, "amount"?: number, "percent"?: number}]|null,
      "notes": string|null },
    // type SETTLEMENT : un membre a remboursé un autre
    { "kind": "SETTLEMENT", "fromUserId": string, "toUserId": string,
      "amount": number, "currency": string|null, "notes": string|null },
    // type TONTINE_CONTRIBUTION : un membre a versé au pot collectif
    { "kind": "TONTINE_CONTRIBUTION", "contributorUserId": string,
      "amount": number, "paymentMethod": string|null, "notes": string|null },
    // type NOTE : une décision non-financière à conserver pour l'historique
    { "kind": "NOTE", "text": string }
  ]
}

Règles :
 - Pour les noms ("Karim", "Aïcha", "le président") → trouve l'id correspondant dans la liste.
 - Si un nom est ambigu ou absent, mets paidByUserId=null ou contributorUserId=null mais garde la décision.
 - "On a partagé à 4 le repas de 80 €" → EXPENSE avec splitMode=EQUAL et 4 participantIds.
 - "Aïcha doit 30€ à Karim" → SETTLEMENT (fromUserId=Aïcha, toUserId=Karim).
 - "Yacine a versé 50€ au pot" → TONTINE_CONTRIBUTION.
 - Ignore les bavardages — n'extrait QUE les décisions financières concrètes.
 - Si la réunion ne contient aucune décision → decisions=[] et summary explique pourquoi.`;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcript.slice(0, 12000) }, // garde-fou contexte
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2500,
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
  }
  const json = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = json.choices[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM JSON parse failed");
  }

  const validIds = new Set(members.map((m) => m.id));
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : "";
  const decisions: MeetingDecision[] = [];
  for (const d of Array.isArray(parsed.decisions) ? parsed.decisions : []) {
    if (!d || typeof d !== "object") continue;
    if (d.kind === "EXPENSE") {
      const participantIds = Array.isArray(d.participantIds)
        ? d.participantIds.filter(
            (id: any) => typeof id === "string" && validIds.has(id),
          )
        : [];
      if (typeof d.amount !== "number" || !(d.amount > 0)) continue;
      if (participantIds.length === 0) continue;
      decisions.push({
        kind: "EXPENSE",
        description: String(d.description ?? "Dépense").slice(0, 200),
        amount: d.amount,
        currency:
          typeof d.currency === "string" && /^[A-Z]{3}$/.test(d.currency)
            ? d.currency
            : null,
        paidByUserId:
          typeof d.paidByUserId === "string" && validIds.has(d.paidByUserId)
            ? d.paidByUserId
            : null,
        participantIds,
        splitMode: ["EQUAL", "UNEQUAL", "PERCENTAGE"].includes(d.splitMode)
          ? d.splitMode
          : "EQUAL",
        shares:
          d.shares && typeof d.shares === "object"
            ? Object.fromEntries(
                Object.entries(d.shares).filter(
                  ([k, v]) => validIds.has(k) && typeof v === "number",
                ) as Array<[string, number]>,
              )
            : undefined,
        payers: Array.isArray(d.payers)
          ? d.payers
              .filter(
                (p: any) =>
                  p &&
                  typeof p.userId === "string" &&
                  validIds.has(p.userId) &&
                  (typeof p.amount === "number" || typeof p.percent === "number"),
              )
              .map((p: any) => ({
                userId: p.userId,
                ...(typeof p.amount === "number" ? { amount: p.amount } : {}),
                ...(typeof p.percent === "number" ? { percent: p.percent } : {}),
              }))
          : undefined,
        notes: typeof d.notes === "string" ? d.notes.slice(0, 200) : undefined,
      });
    } else if (d.kind === "SETTLEMENT") {
      if (
        typeof d.fromUserId !== "string" ||
        !validIds.has(d.fromUserId) ||
        typeof d.toUserId !== "string" ||
        !validIds.has(d.toUserId) ||
        d.fromUserId === d.toUserId
      )
        continue;
      if (typeof d.amount !== "number" || !(d.amount > 0)) continue;
      decisions.push({
        kind: "SETTLEMENT",
        fromUserId: d.fromUserId,
        toUserId: d.toUserId,
        amount: d.amount,
        currency:
          typeof d.currency === "string" && /^[A-Z]{3}$/.test(d.currency)
            ? d.currency
            : null,
        notes: typeof d.notes === "string" ? d.notes.slice(0, 200) : undefined,
      });
    } else if (d.kind === "TONTINE_CONTRIBUTION") {
      if (
        typeof d.contributorUserId !== "string" ||
        !validIds.has(d.contributorUserId)
      )
        continue;
      if (typeof d.amount !== "number" || !(d.amount > 0)) continue;
      decisions.push({
        kind: "TONTINE_CONTRIBUTION",
        contributorUserId: d.contributorUserId,
        amount: d.amount,
        paymentMethod:
          typeof d.paymentMethod === "string"
            ? d.paymentMethod.slice(0, 60)
            : undefined,
        notes: typeof d.notes === "string" ? d.notes.slice(0, 200) : undefined,
      });
    } else if (d.kind === "NOTE") {
      if (typeof d.text === "string" && d.text.trim().length > 0) {
        decisions.push({ kind: "NOTE", text: d.text.slice(0, 500) });
      }
    }
  }
  return { summary, decisions };
}

// ============================================================
// 3) Apply / Cancel / List / Detail
// ============================================================

export interface ApplyMeetingInput {
  meetingId: string;
  actorUserId: string;
  /**
   * Liste finale des décisions à appliquer (peut être différente de
   * extractedJson.decisions si l'organisateur a corrigé / supprimé des
   * lignes dans l'UI). Indices implicites par ordre du tableau.
   */
  decisions: MeetingDecision[];
}

/**
 * Applique les décisions validées d'une réunion : crée les Expenses /
 * Settlements / TontineContribution correspondants. Idempotent côté UI :
 * on bloque si la réunion est déjà APPLIED.
 */
export async function applyMeeting(input: ApplyMeetingInput): Promise<{
  meetingId: string;
  expensesCreated: number;
  settlementsCreated: number;
  contributionsCreated: number;
  notesCount: number;
}> {
  const meeting = await getMeetingForRead(input.meetingId, input.actorUserId);
  if (!canModifyMeeting(meeting, input.actorUserId)) {
    throw Errors.forbidden(
      "Seul l'organisateur de la réunion ou un admin du groupe peut appliquer les décisions.",
    );
  }
  if (meeting.status === "APPLIED") {
    throw Errors.badRequest(
      "Cette réunion a déjà été appliquée — toutes les décisions ont été enregistrées.",
    );
  }
  if (meeting.status === "CANCELLED") {
    throw Errors.badRequest("Cette réunion a été annulée.");
  }
  if (meeting.status !== "REVIEW") {
    throw Errors.badRequest(
      `La réunion n'est pas encore prête (status : ${meeting.status}). Patiente quelques secondes le temps de la transcription.`,
    );
  }

  let expensesCreated = 0;
  let settlementsCreated = 0;
  let contributionsCreated = 0;
  let notesCount = 0;

  for (const d of input.decisions) {
    try {
      if (d.kind === "EXPENSE") {
        // Construit l'input createExpense à partir de la décision
        const participants = d.participantIds.map((uid) => ({
          userId: uid,
          ...(d.splitMode === "PERCENTAGE" || d.splitMode === "UNEQUAL"
            ? { share: d.shares?.[uid] ?? 0 }
            : {}),
        }));
        await createExpense({
          groupId: meeting.groupId,
          actorUserId: input.actorUserId,
          description: d.description,
          amount: String(d.amount),
          currency: d.currency ?? meeting.group.defaultCurrency,
          paidByUserId: d.paidByUserId ?? input.actorUserId,
          splitMode: d.splitMode as any,
          participants,
          payers: d.payers?.map((p) => ({
            userId: p.userId,
            ...(p.amount !== undefined ? { amount: String(p.amount) } : {}),
            ...(p.percent !== undefined ? { percent: p.percent } : {}),
          })),
          meetingRecordId: input.meetingId,
        });
        expensesCreated++;
      } else if (d.kind === "SETTLEMENT") {
        await prisma.settlement.create({
          data: {
            groupId: meeting.groupId,
            fromUserId: d.fromUserId,
            toUserId: d.toUserId,
            amount: String(d.amount),
            currency: d.currency ?? meeting.group.defaultCurrency,
            // Marqué CONFIRMED car validé en réunion physique par les deux parties.
            // (Le flow normal serait PROPOSED → PAID → CONFIRMED, mais ici la
            // réunion sert d'attestation collective).
            status: "CONFIRMED",
            confirmedByPayerAt: new Date(),
            confirmedByPayeeAt: new Date(),
          },
        });
        settlementsCreated++;
      } else if (d.kind === "TONTINE_CONTRIBUTION") {
        // On cherche le tour actif de la tontine du groupe.
        // Sprint AC-3 — Si pas de tour actif, on ne skip plus silencieusement :
        // on convertit la décision en NOTE explicite pour que l'organisateur
        // sache que cette cotisation a été détectée mais pas appliquée
        // (et puisse activer la tontine manuellement avant de retenter).
        const tontine = await prisma.tontine.findUnique({
          where: { groupId: meeting.groupId },
          select: { id: true, status: true },
        });
        if (!tontine || tontine.status !== "ACTIVE") {
          notesCount++;
          // eslint-disable-next-line no-console
          console.info(
            `[meetings] tontine contribution skipped (no active tontine): user=${d.contributorUserId}, amount=${d.amount}`,
          );
          continue;
        }
        const activeTurn = await prisma.tontineTurn.findFirst({
          where: { tontineId: tontine.id, status: "IN_PROGRESS" },
          select: { id: true },
          orderBy: { turnNumber: "asc" },
        });
        if (!activeTurn) {
          notesCount++;
          // eslint-disable-next-line no-console
          console.info(
            `[meetings] tontine contribution skipped (no IN_PROGRESS turn): user=${d.contributorUserId}, amount=${d.amount}`,
          );
          continue;
        }
        // Upsert (anti-doublon si la même cotisation est extraite 2 fois)
        await prisma.tontineContribution.upsert({
          where: {
            turnId_contributorUserId: {
              turnId: activeTurn.id,
              contributorUserId: d.contributorUserId,
            },
          },
          create: {
            turnId: activeTurn.id,
            contributorUserId: d.contributorUserId,
            amount: String(d.amount),
            status: "CONFIRMED",
            paidAt: new Date(),
            confirmedAt: new Date(),
            paymentMethod: d.paymentMethod ?? null,
          },
          update: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            paymentMethod: d.paymentMethod ?? undefined,
          },
        });
        contributionsCreated++;
      } else if (d.kind === "NOTE") {
        notesCount++;
      }
    } catch (err) {
      // On continue sur les autres décisions — un échec individuel ne doit
      // pas bloquer toute la réunion.
      // eslint-disable-next-line no-console
      console.warn(
        `[meetings] decision skipped (${d.kind}):`,
        (err as Error).message,
      );
    }
  }

  await (prisma as any).meetingRecord.update({
    where: { id: input.meetingId },
    data: {
      status: "APPLIED",
      appliedAt: new Date(),
      // On persiste la liste finale (potentiellement éditée par l'organisateur)
      extractedJson: {
        summary: meeting.summary ?? "",
        decisions: input.decisions,
      } as any,
    },
  });
  events.meetingUpdated?.(meeting.groupId, input.meetingId);

  return {
    meetingId: input.meetingId,
    expensesCreated,
    settlementsCreated,
    contributionsCreated,
    notesCount,
  };
}

/**
 * Annule une réunion (avant ou après extraction). Le fichier audio est
 * conservé pour audit, on ne fait que marquer le status. Les Expenses
 * éventuellement déjà créées ne sont PAS supprimées (on ne fait jamais
 * de suppression silencieuse en finance — l'organisateur doit le faire
 * manuellement s'il veut rollback).
 */
export async function cancelMeeting(
  meetingId: string,
  actorUserId: string,
): Promise<void> {
  const meeting = await getMeetingForRead(meetingId, actorUserId);
  if (!canModifyMeeting(meeting, actorUserId)) {
    throw Errors.forbidden(
      "Seul l'organisateur ou un admin du groupe peut annuler cette réunion.",
    );
  }
  if (meeting.status === "APPLIED") {
    throw Errors.badRequest(
      "Cette réunion a déjà été appliquée. Pour rollback, supprime manuellement les dépenses créées.",
    );
  }
  await (prisma as any).meetingRecord.update({
    where: { id: meetingId },
    data: { status: "CANCELLED" },
  });
  events.meetingUpdated?.(meeting.groupId, meetingId);
}

/**
 * Liste les réunions d'un groupe (du plus récent au plus ancien). Tous les
 * membres peuvent voir l'historique pour transparence.
 */
export async function listMeetings(groupId: string, actorUserId: string) {
  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId: actorUserId },
    select: { id: true },
  });
  if (!member) {
    throw Errors.forbidden("Tu n'es pas membre de ce groupe");
  }
  return (prisma as any).meetingRecord.findMany({
    where: { groupId },
    select: {
      id: true,
      title: true,
      occurredAt: true,
      status: true,
      summary: true,
      durationSeconds: true,
      addonCents: true,
      createdAt: true,
      appliedAt: true,
      createdBy: { select: { id: true, displayName: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
}

/**
 * Détail complet d'une réunion (transcription + décisions). Membres du
 * groupe uniquement.
 */
export async function getMeeting(meetingId: string, actorUserId: string) {
  return getMeetingForRead(meetingId, actorUserId);
}

/**
 * Permet à l'organisateur de relancer le pipeline en cas de FAILED (par
 * exemple si Whisper a hoqueté). Idempotent.
 */
export async function retryMeeting(
  meetingId: string,
  actorUserId: string,
): Promise<void> {
  const meeting = await getMeetingForRead(meetingId, actorUserId);
  if (!canModifyMeeting(meeting, actorUserId)) {
    throw Errors.forbidden("Seul l'organisateur ou un admin peut relancer.");
  }
  if (meeting.status !== "FAILED" && meeting.status !== "PENDING") {
    throw Errors.badRequest(
      "Cette réunion n'est pas en échec — pas besoin de relancer.",
    );
  }
  // Sprint AC-3 · Re-enqueue dans la queue (gère concurrence + retry)
  processMeeting(meetingId);
}

/**
 * Supprime physiquement le fichier audio d'une réunion (RGPD / nettoyage).
 * Réservé à l'organisateur. La row MeetingRecord reste pour l'audit, mais
 * on flag `audioStorageKey = ""` pour signaler que l'audio est purgé.
 */
export async function purgeMeetingAudio(
  meetingId: string,
  actorUserId: string,
): Promise<void> {
  const meeting = await getMeetingForRead(meetingId, actorUserId);
  if (!canModifyMeeting(meeting, actorUserId)) {
    throw Errors.forbidden("Seul l'organisateur ou un admin peut purger.");
  }
  if (!meeting.audioStorageKey) return;
  const fullPath = path.join(UPLOAD_DIR, meeting.audioStorageKey);
  try {
    await unlink(fullPath);
  } catch {
    /* ignore — fichier déjà absent */
  }
  await (prisma as any).meetingRecord.update({
    where: { id: meetingId },
    data: { audioStorageKey: "" },
  });
}

// ============================================================
// Sprint AC-3 · Notifications email premium + WhatsApp pour MEETING_READY
// ============================================================

/**
 * Envoie un email branded + un message WhatsApp à tous les ADMINS du groupe
 * (et au créateur de la réunion s'il n'est pas admin) quand une réunion
 * passe à REVIEW.
 *
 * - Email : template `meetingReady` traduit dans 14 locales (FR/EN/ES/PT/AR/DE/IT/SW/WO/LN/AM/JA/KO/ZH).
 *   Pour les 11 autres locales, fallback FR (cohérent avec le reste du
 *   système email).
 * - WhatsApp : message texte court pour les destinataires qui ont un
 *   contact PHONE_VERIFIED. Optionnel — ne s'envoie que si WhatsApp Cloud
 *   API est configuré (sinon log silent).
 *
 * Anti-doublon : on ne notifie que les admins (rôle ADMIN) + le créateur,
 * pas tous les membres. Sinon on inonderait l'inbox des grosses paroisses.
 */
async function notifyMeetingReady(input: {
  meetingId: string;
  groupId: string;
  meetingTitle: string;
  decisionsCount: number;
  summary: string | null;
}): Promise<void> {
  const { sendTemplatedEmail } = await import("../../lib/messaging.js");
  const { sendWhatsAppText } = await import("../whatsapp/whatsapp.routes.js");

  // Récupère tous les admins + le créateur (avec leurs contacts)
  const meeting = await (prisma as any).meetingRecord.findUnique({
    where: { id: input.meetingId },
    select: {
      createdBy: { select: { id: true, displayName: true } },
      group: {
        select: {
          name: true,
          members: {
            where: { role: "ADMIN" },
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  defaultLocale: true,
                  contacts: {
                    where: { verifiedAt: { not: null } },
                    select: { type: true, value: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!meeting?.group?.members) return;

  // Dédupe créateur (souvent admin)
  const recipients = new Map<string, any>();
  for (const m of meeting.group.members) {
    recipients.set(m.user.id, m.user);
  }
  // Aussi le créateur de la réunion s'il n'est pas dans les admins
  // (il a uploadé l'audio, il a envie de savoir que c'est prêt)
  const creator = await prisma.user.findUnique({
    where: { id: meeting.createdBy.id },
    select: {
      id: true,
      displayName: true,
      defaultLocale: true,
      contacts: {
        where: { verifiedAt: { not: null } },
        select: { type: true, value: true },
      },
    },
  });
  if (creator && !recipients.has(creator.id)) {
    recipients.set(creator.id, creator);
  }

  const groupName = meeting.group.name;
  const organizerName = meeting.createdBy.displayName;

  // Pour chaque destinataire : email + WhatsApp en parallèle
  await Promise.allSettled(
    Array.from(recipients.values()).flatMap((user: any) => {
      const tasks: Promise<unknown>[] = [];
      const emailContact = user.contacts.find(
        (c: any) => c.type === "EMAIL",
      );
      if (emailContact) {
        tasks.push(
          sendTemplatedEmail(
            emailContact.value,
            {
              kind: "meetingReady",
              payload: {
                recipientName: user.displayName,
                groupName,
                meetingTitle: input.meetingTitle,
                meetingId: input.meetingId,
                groupId: input.groupId,
                decisionsCount: input.decisionsCount,
                summary: input.summary,
                organizerName,
              },
            },
            user.defaultLocale,
          ),
        );
      }
      const phoneContact = user.contacts.find(
        (c: any) => c.type === "PHONE",
      );
      if (phoneContact) {
        // Message WhatsApp court — on évite le copywriting long sur WhatsApp,
        // c'est mieux d'envoyer un lien vers l'app pour la review.
        const baseUrl =
          process.env.WEB_BASE_URL ?? "https://www.backmesdo.com";
        const link = `${baseUrl}/dashboard/groups/${input.groupId}/meetings/${input.meetingId}`;
        tasks.push(
          sendWhatsAppText(
            phoneContact.value,
            `📋 *${groupName}* — Réunion prête à valider\n\n${organizerName} vient d'enregistrer "${input.meetingTitle}". ${input.decisionsCount} décision(s) attendent ta vérification.\n\nValide ici : ${link}`,
          ),
        );
      }
      return tasks;
    }),
  );
}
