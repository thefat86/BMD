/**
 * Routes /voice — transcription voix → texte (spec §3.8 saisie vocale).
 */
import type { FastifyInstance } from "fastify";
import { Errors } from "../../lib/errors.js";
import {
  isWhisperAvailable,
  transcribeAudio,
} from "./voice.service.js";
import { assertCanUseOcr } from "../../lib/plan-limits.js";

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
  app.post("/voice/transcribe", async (req) => {
    await assertCanUseOcr((req.user as any).sub);

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
    return transcribeAudio(buffer, mime, language);
  });
}
