/**
 * Routes /voice — transcription voix → texte (spec §3.8 saisie vocale).
 */
import type { FastifyInstance } from "fastify";
import { Errors } from "../../lib/errors.js";
import {
  isWhisperAvailable,
  transcribeAudio,
} from "./voice.service.js";
import {
  assertCanUseOcr,
  assertCanUseVoice,
  getVoiceUsage,
} from "../../lib/plan-limits.js";
// V72 — Tracking LIVE Whisper
import { trackWhisperTranscription } from "../../lib/usage-tracker.js";

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
  // V70.1 — capacitor-voice-recorder iOS retourne "audio/aac" alors que
  // le container est en réalité MP4/M4A (AAC encapsulé MP4). Le front
  // normalise déjà à audio/m4a, mais on tolère aussi audio/aac en
  // defense in depth pour les futurs clients natifs.
  "audio/aac",
  "audio/x-aac",
];

export async function voiceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /voice/availability
   * Le frontend appelle ça au montage du composant VoiceInput pour décider
   * s'il propose le bouton micro (Whisper) ou tombe sur l'API Web Speech
   * native du navigateur (gratuit mais moins précis).
   */
  app.get("/voice/availability", async () => {
    return { available: isWhisperAvailable() };
  });

  /**
   * POST /voice/transcribe
   * Body: multipart/form-data
   *   - file: l'audio (webm / mp4 / wav / ogg / mp3 / m4a)
   *   - language (optionnel): code ISO 2 lettres pour améliorer la précision
   *
   * Note : on partage le quota avec l'OCR scan IA (assertCanUseOcr) parce
   * que les deux consomment du crédit IA et qu'on ne veut pas qu'un user
   * FREE bypass son quota OCR en utilisant la voix.
   */
  /**
   * GET /me/voice-usage · V47
   * Compteur affiché sur le dashboard et l'UI scan/voix pour montrer
   * la consommation Whisper en cours.
   */
  app.get("/me/voice-usage", async (req) => {
    return getVoiceUsage((req.user as any).sub);
  });

  app.post("/voice/transcribe", async (req) => {
    const userId = (req.user as any).sub;
    // V47 — quota voix Whisper dédié (voicePerMonth du plan) + quota OCR
    // global gardé en garde-fou anti-abus FREE.
    await assertCanUseVoice(userId);
    await assertCanUseOcr(userId);

    const data = await (req as any).file();
    if (!data) {
      throw Errors.badRequest(
        "Aucun fichier audio reçu (utilise multipart/form-data avec un champ 'file')",
      );
    }
    const mime = (data.mimetype as string) ?? "";
    if (!SUPPORTED_AUDIO_MIME.includes(mime.split(";")[0])) {
      throw Errors.badRequest(
        `Format audio non supporté : ${mime}. Utilise WebM, MP4, MP3, WAV, OGG ou M4A.`,
      );
    }
    const buffer = await data.toBuffer();
    // language vient des fields multipart (optionnel)
    const language =
      typeof data.fields?.language?.value === "string"
        ? data.fields.language.value
        : undefined;
    const transcription = await transcribeAudio(buffer, mime, language);
    // V72 — Tracking LIVE : log la transcription avec sa durée réelle.
    // duration peut être null si Whisper n'a pas renvoyé verbose_json,
    // fallback à 30s pour ne pas avoir 0 (sous-estimation grossière).
    trackWhisperTranscription({
      userId,
      durationSeconds: transcription.duration ?? 30,
      kind: "VOICE_TRANSCRIBE",
    });
    return transcription;
  });
}
