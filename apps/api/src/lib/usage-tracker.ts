/**
 * V72 — Tracking en LIVE de la consommation BMD vs coût réel.
 *
 * Chaque appel à un service externe payant (OpenAI, Mindee, Twilio, Resend,
 * WhatsApp) doit appeler `recordUsage()` après l'appel pour persister :
 *   - qui (userId)
 *   - quoi (kind)
 *   - chez qui (provider, model)
 *   - combien (units, costCents calculé via les tarifs ci-dessous)
 *   - metadata libre
 *
 * Le helper est fire-and-forget : il catche toutes ses erreurs internes
 * (DB down, FK violation…) pour ne JAMAIS faire échouer l'appel métier
 * qui l'a déclenché. Si le tracking rate, on log mais on laisse passer.
 *
 * Les tarifs sont centralisés ici. Pour ajuster :
 *   - OpenAI : https://openai.com/api/pricing/
 *   - Mindee : https://platform.mindee.com/pricing
 *   - Twilio : https://www.twilio.com/sms/pricing/ (par pays)
 *   - Resend : https://resend.com/pricing
 *
 * Tous les prix sont en CENTIMES EUR (pivot interne BMD).
 */
import { prisma } from "./db.js";

// ============================================================
// TARIFS RÉELS (au 2026-05) — en centimes EUR
// ============================================================
//
// Pour rester précis : 1 USD ≈ 0.93 EUR. On stocke directement en c€.
// Modifie cette table pour refléter les évolutions de pricing.
//
// Note : ces tarifs servent UNIQUEMENT au tracking interne (rentabilité
// admin). Ils n'affectent ni la tarification utilisateur ni les quotas
// (ceux-là sont dans Plan.limits).

export const USAGE_COSTS = {
  // -------- OpenAI Vision (OCR scans, modèle gpt-4o-mini-vision) --------
  // ~3000 tokens input pour image 800x600 + ~150 tokens output JSON
  // Tarif gpt-4o-mini : $0.15/M input + $0.60/M output
  // = 3000*0.15/1M + 150*0.60/1M ≈ $0.00054 ≈ 0,05 c€ par scan
  openai_vision_scan: 0.05, // 0,05 c€ par scan (gpt-4o-mini)

  // -------- OpenAI Whisper (transcription voix + meetings) --------
  // Tarif : $0.006/minute = 0,56 c€/minute = 0,0093 c€/seconde
  openai_whisper_per_second: 0.0093, // 0,93 c€ pour 100 secondes

  // -------- OpenAI Chat (parsing LLM des résultats OCR + voice-to-expense) --------
  // gpt-4o-mini : $0.15/M tokens. Une requête de parsing ≈ 500 in + 200 out
  // = ~$0.0002 ≈ 0,02 c€
  openai_chat_per_call: 0.02, // approx forfait par appel court

  // -------- Mindee (OCR receipt premium) --------
  // Plan Mindee : ~$0.10 par scan receipt = ~9,3 c€
  mindee_scan: 9.3,

  // -------- Twilio SMS (varie selon pays) --------
  // Par défaut : tarif France 0.075 €. Map par préfixe pays pour précision.
  twilio_sms_default: 7.5, // 7,5 c€ ≈ 0.075 €
  twilio_sms_by_prefix: {
    "+33": 7.5, // France
    "+32": 7.0, // Belgique
    "+352": 7.5, // Luxembourg
    "+1": 0.79, // US/Canada
    "+44": 4.8, // UK
    "+49": 8.2, // Allemagne
    "+34": 6.5, // Espagne
    "+39": 5.5, // Italie
    "+237": 8.0, // Cameroun
    "+225": 8.0, // Côte d'Ivoire
    "+221": 8.0, // Sénégal
    "+243": 9.0, // RDC
    "+212": 7.0, // Maroc
    "+216": 7.0, // Tunisie
    "+213": 8.0, // Algérie
    "+86": 5.0, // Chine
    "+91": 1.5, // Inde
  } as Record<string, number>,

  // -------- Twilio Verify (OTP géré bout-en-bout) --------
  // Tarif : $0.05 par vérif réussie (que le user soumette ou non le code,
  // c'est la création qui est facturée). ≈ 4,6 c€
  twilio_verify_session: 4.6,

  // -------- WhatsApp Cloud API (Meta) --------
  // OTP authentication template : ~$0.0085 par conv ≈ 0,8 c€
  whatsapp_otp_message: 0.8,

  // -------- Resend (emails transactionnels) --------
  // Tarif : pas de coût par email sur free tier (3k/mois), puis $0.001/email
  // sur le plan Pro = 0,09 c€. On met 0,1 c€ pour overhead conservateur.
  resend_email: 0.1,
} as const;

// ============================================================
// TYPES PUBLICS
// ============================================================

export type UsageKind =
  | "OCR_SCAN"
  | "VOICE_TRANSCRIBE"
  | "MEETING_TRANSCRIBE"
  | "LLM_PARSE"
  | "SMS_SENT"
  | "OTP_VERIFY"
  | "WHATSAPP_SENT"
  | "EMAIL_SENT";

export type UsageProvider =
  | "openai_vision"
  | "openai_whisper"
  | "openai_chat"
  | "mindee"
  | "tesseract"
  | "twilio_sms"
  | "twilio_verify"
  | "whatsapp_cloud"
  | "resend";

interface RecordUsageInput {
  userId: string;
  kind: UsageKind;
  provider: UsageProvider;
  /** Modèle précis si applicable (whisper-1, gpt-4o-mini, etc.) */
  model?: string;
  /** Unités consommées (1 par défaut, ou secondes audio, ou parts SMS). */
  units?: number;
  /** Tokens output (LLM uniquement) */
  outputUnits?: number;
  /** Coût en centimes EUR — si non fourni, on le calcule via computeCost(). */
  costCents?: number;
  /** Metadata libre : groupId, expenseId, destinationCountry, etc. */
  metadata?: Record<string, unknown>;
  /** True si l'appel a échoué (mais on log quand-même). */
  hadError?: boolean;
}

// ============================================================
// CALCUL DE COÛT — utility helpers
// ============================================================

/** Calcule le coût d'un appel OCR selon le provider. */
export function computeOcrCost(provider: "mindee" | "openai_vision" | "tesseract"): number {
  switch (provider) {
    case "mindee":
      return USAGE_COSTS.mindee_scan;
    case "openai_vision":
      return USAGE_COSTS.openai_vision_scan;
    case "tesseract":
      return 0; // local, gratuit
  }
}

/** Calcule le coût d'une transcription audio Whisper en fonction de la durée. */
export function computeWhisperCost(durationSeconds: number): number {
  return USAGE_COSTS.openai_whisper_per_second * Math.max(1, durationSeconds);
}

/** Coût d'un appel LLM de parsing (estimation forfaitaire courte). */
export function computeChatCost(): number {
  return USAGE_COSTS.openai_chat_per_call;
}

/** Coût d'un SMS Twilio en fonction du préfixe pays. */
export function computeSmsCost(phoneE164: string, parts = 1): number {
  // Trouve le préfixe le plus long qui matche (greedy)
  const prefixes = Object.keys(USAGE_COSTS.twilio_sms_by_prefix).sort(
    (a, b) => b.length - a.length,
  );
  for (const p of prefixes) {
    if (phoneE164.startsWith(p)) {
      return USAGE_COSTS.twilio_sms_by_prefix[p] * parts;
    }
  }
  return USAGE_COSTS.twilio_sms_default * parts;
}

/** Coût d'une session Twilio Verify (création de Verification). */
export function computeVerifyCost(): number {
  return USAGE_COSTS.twilio_verify_session;
}

/** Coût d'un message WhatsApp OTP via Cloud API. */
export function computeWhatsAppCost(): number {
  return USAGE_COSTS.whatsapp_otp_message;
}

/** Coût d'un email Resend. */
export function computeEmailCost(): number {
  return USAGE_COSTS.resend_email;
}

// ============================================================
// ÉCRITURE — fire-and-forget, jamais throw
// ============================================================

/**
 * Persiste un événement de consommation. Ne throw JAMAIS — si l'écriture
 * en DB échoue, on log et on continue, pour ne pas faire planter l'appel
 * métier (envoi SMS, transcription, etc.) à cause d'un problème de
 * tracking secondaire.
 *
 * À appeler typiquement avec `void recordUsage(...)` (pas de await) sauf
 * si tu veux attendre la persistence pour une raison spécifique (tests).
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    await (prisma as any).usageEvent.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        provider: input.provider,
        model: input.model ?? null,
        units: input.units ?? 1,
        outputUnits: input.outputUnits ?? null,
        costCents: input.costCents ?? 0,
        metadata: input.metadata ?? {},
        hadError: input.hadError ?? false,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `[usage-tracker] échec écriture event (${input.kind}/${input.provider})`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Helper de convenance : enregistre un OCR scan avec calcul auto du coût.
 *
 * V78 — Retourne désormais Promise<void> (au lieu de void) pour que l'appelant
 * PUISSE await la persistence si le quota dépend de cette event. Le caller
 * peut toujours faire `void trackOcrScan(...)` pour fire-and-forget.
 */
export async function trackOcrScan(opts: {
  userId: string;
  provider: "mindee" | "openai_vision" | "tesseract";
  model?: string;
  iaTier?: string;
  groupId?: string;
  hadError?: boolean;
}): Promise<void> {
  await recordUsage({
    userId: opts.userId,
    kind: "OCR_SCAN",
    provider: opts.provider,
    model: opts.model,
    units: 1,
    costCents: computeOcrCost(opts.provider),
    metadata: {
      ...(opts.iaTier ? { iaTier: opts.iaTier } : {}),
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    },
    hadError: opts.hadError ?? false,
  });
}

/** Helper de convenance : transcription Whisper. */
export function trackWhisperTranscription(opts: {
  userId: string;
  durationSeconds: number;
  model?: string;
  kind?: "VOICE_TRANSCRIBE" | "MEETING_TRANSCRIBE";
  groupId?: string;
  hadError?: boolean;
}): void {
  void recordUsage({
    userId: opts.userId,
    kind: opts.kind ?? "VOICE_TRANSCRIBE",
    provider: "openai_whisper",
    model: opts.model ?? "whisper-1",
    units: opts.durationSeconds,
    costCents: computeWhisperCost(opts.durationSeconds),
    metadata: {
      durationSeconds: opts.durationSeconds,
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    },
    hadError: opts.hadError ?? false,
  });
}

/** Helper : SMS envoyé via Twilio (basé sur le préfixe pour le tarif). */
export function trackSmsSent(opts: {
  userId: string;
  to: string;
  parts?: number;
  hadError?: boolean;
  metadata?: Record<string, unknown>;
}): void {
  void recordUsage({
    userId: opts.userId,
    kind: "SMS_SENT",
    provider: "twilio_sms",
    units: opts.parts ?? 1,
    costCents: computeSmsCost(opts.to, opts.parts ?? 1),
    metadata: {
      // Ne stocke pas le numéro complet (RGPD) — juste le préfixe +XX
      // suffit pour analyser les coûts par pays.
      toPrefix: extractCountryPrefix(opts.to),
      ...(opts.metadata ?? {}),
    },
    hadError: opts.hadError ?? false,
  });
}

/** Helper : Twilio Verify (session OTP). */
export function trackOtpVerifySession(opts: {
  userId: string;
  channel?: "sms" | "whatsapp" | "email";
  to: string;
  hadError?: boolean;
}): void {
  void recordUsage({
    userId: opts.userId,
    kind: "OTP_VERIFY",
    provider: "twilio_verify",
    units: 1,
    costCents: computeVerifyCost(),
    metadata: {
      channel: opts.channel ?? "sms",
      toPrefix: extractCountryPrefix(opts.to),
    },
    hadError: opts.hadError ?? false,
  });
}

/** Helper : WhatsApp Cloud API. */
export function trackWhatsAppSent(opts: {
  userId: string;
  to: string;
  hadError?: boolean;
}): void {
  void recordUsage({
    userId: opts.userId,
    kind: "WHATSAPP_SENT",
    provider: "whatsapp_cloud",
    units: 1,
    costCents: computeWhatsAppCost(),
    metadata: { toPrefix: extractCountryPrefix(opts.to) },
    hadError: opts.hadError ?? false,
  });
}

/** Helper : Email Resend. */
export function trackEmailSent(opts: {
  userId: string;
  subject?: string;
  hadError?: boolean;
}): void {
  void recordUsage({
    userId: opts.userId,
    kind: "EMAIL_SENT",
    provider: "resend",
    units: 1,
    costCents: computeEmailCost(),
    metadata: opts.subject ? { subject: opts.subject.slice(0, 80) } : {},
    hadError: opts.hadError ?? false,
  });
}

/** Extrait le préfixe pays d'un numéro E.164 (ex: "+33651..." → "+33"). */
function extractCountryPrefix(e164: string): string {
  const prefixes = Object.keys(USAGE_COSTS.twilio_sms_by_prefix).sort(
    (a, b) => b.length - a.length,
  );
  for (const p of prefixes) {
    if (e164.startsWith(p)) return p;
  }
  return "+?";
}
