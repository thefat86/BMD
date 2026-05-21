/**
 * Service de transcription voix → texte (spec §3.8 — saisie vocale).
 *
 * V41.5 — Refonte pour utiliser PRIORITAIREMENT l'API OpenAI Whisper officielle
 * (https://api.openai.com/v1/audio/transcriptions) avec OPENAI_API_KEY.
 *
 * Hiérarchie de providers :
 *  1. **OpenAI Whisper officiel** (recommandé, fiable, multi-langues)
 *     - Endpoint : https://api.openai.com/v1/audio/transcriptions
 *     - Auth : Bearer OPENAI_API_KEY
 *     - Modèle : whisper-1 (turbo, 8x plus rapide que large)
 *     - Tarif : ~$0.006/minute (transparent, factura OpenAI)
 *  2. **WhisperAPI.com** (legacy — service tiers commercial)
 *     - Activé uniquement si `WHISPER_API_KEY` est défini ET pointe vers
 *       whisper-api.com (override explicite admin).
 *     - Conservé pour rétrocompatibilité.
 *  3. **Web Speech API navigateur** (fallback frontend, gratuit, qualité moindre)
 *
 * Format audio supporté : MP3, WAV, M4A, OGG, WebM (l'API OpenAI les accepte
 * tous). Le navigateur enregistre généralement en `audio/webm` ou `audio/mp4`.
 */
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";

/**
 * V70.1 — Mappe un mimeType → extension de fichier valide pour Whisper.
 *
 * OpenAI Whisper API officielle ne supporte que ces extensions :
 *   mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg.
 *
 * Sans cette table, le calcul naïf `mimetype.split("/")[1]` produisait
 * "x-m4a" pour audio/x-m4a, ou "aac" pour audio/aac — extensions que
 * Whisper rejette parfois. capacitor-voice-recorder iOS retourne
 * audio/aac alors que le container est en réalité MP4/M4A, donc on
 * mappe vers .m4a (extension supportée).
 */
function whisperFilenameForMime(mimetype: string): string {
  const base = (mimetype || "").split(";")[0].toLowerCase().trim();
  switch (base) {
    case "audio/webm":
      return "audio.webm";
    case "audio/mp4":
      return "audio.mp4";
    case "audio/m4a":
    case "audio/x-m4a":
    case "audio/aac":
    case "audio/x-aac":
      // Container M4A (MP4 atom) — extension supportée par Whisper.
      return "audio.m4a";
    case "audio/mpeg":
    case "audio/mp3":
      return "audio.mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "audio.wav";
    case "audio/ogg":
      return "audio.ogg";
    case "audio/flac":
      return "audio.flac";
    default:
      // Fallback : webm est largement supporté par les navigateurs.
      return "audio.webm";
  }
}

export interface TranscriptionResult {
  text: string;
  language: string | null; // code ISO (ex: "fr", "en") détecté par Whisper
  confidence: number; // 0..1
  duration: number | null; // secondes
  provider: "openai" | "whisperapi"; // V41.5 — pour debug + UX
}

/**
 * Indique si le service de transcription est configuré et prêt à être appelé.
 * Le frontend peut appeler GET /voice/availability pour savoir s'il faut
 * proposer le bouton micro ou rester sur l'API Web Speech navigateur.
 *
 * V41.5 — On considère le service dispo si OPENAI_API_KEY ou WHISPER_API_KEY
 * est défini (l'un OU l'autre). On privilégie OpenAI à l'usage.
 */
export function isWhisperAvailable(): boolean {
  const env = loadEnv();
  return !!(env.OPENAI_API_KEY || env.WHISPER_API_KEY);
}

/**
 * Transcrit un fichier audio en texte.
 *
 * V41.5 — Pipeline :
 *  - Si OPENAI_API_KEY → utilise l'API OpenAI Whisper officielle (priorité)
 *  - Sinon si WHISPER_API_KEY → utilise WhisperAPI.com (legacy)
 *  - Sinon → erreur 400 explicite pour l'admin
 *
 * @param buffer Buffer du fichier audio (multipart upload)
 * @param mimetype MIME type (ex: "audio/webm", "audio/mp4")
 * @param language Code ISO 2 lettres (ex: "fr") — si fourni, force la langue
 *                 et améliore la précision. Sinon Whisper auto-détecte.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimetype: string,
  language?: string,
): Promise<TranscriptionResult> {
  const env = loadEnv();

  // V41.5 — Priorité : OpenAI Whisper officiel (clé partagée OPENAI_API_KEY)
  if (env.OPENAI_API_KEY) {
    return transcribeViaOpenAI(buffer, mimetype, language, env.OPENAI_API_KEY);
  }

  // Fallback legacy : WhisperAPI.com (service tiers commercial)
  if (env.WHISPER_API_KEY) {
    return transcribeViaWhisperApiCom(
      buffer,
      mimetype,
      language,
      env.WHISPER_API_KEY,
      env.WHISPER_API_URL,
    );
  }

  throw Errors.badRequest(
    "Aucun service de transcription voix configuré sur ce serveur. " +
      "Définis OPENAI_API_KEY (recommandé) ou WHISPER_API_KEY dans .env, " +
      "ou utilise la dictée native de ton navigateur.",
  );
}

/**
 * V41.5 — Implémentation OpenAI Whisper officielle.
 *
 * Endpoint : POST https://api.openai.com/v1/audio/transcriptions
 * Doc : https://platform.openai.com/docs/api-reference/audio/createTranscription
 */
async function transcribeViaOpenAI(
  buffer: Buffer,
  mimetype: string,
  language: string | undefined,
  apiKey: string,
): Promise<TranscriptionResult> {
  // V70.1 — extension dérivée d'une whitelist Whisper (audio/aac → .m4a).
  const filename = whisperFilenameForMime(mimetype);
  const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", "whisper-1"); // seul modèle Whisper dispo via API
  // Format détaillé : récupère language + confiance + duration
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);
  // Prompt optionnel : améliore la précision pour les domaines spécifiques
  // (ex: noms de marques, dialectes africains, etc.). Court car compte dans
  // les tokens facturés.
  form.append(
    "prompt",
    "Dépense partagée, tontine, FCFA, francs CFA, mobile money, " +
      "groupe d'amis, restaurant, courses, transport.",
  );

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    if (r.status === 401 || r.status === 403) {
      throw Errors.internal(
        "OpenAI Whisper a refusé la requête (clé invalide ou quota dépassé). " +
          "Vérifie OPENAI_API_KEY dans .env et le solde sur platform.openai.com.",
      );
    }
    if (r.status === 429) {
      throw Errors.internal(
        "OpenAI Whisper : rate-limit atteint. Réessaie dans quelques secondes " +
          "ou augmente ton tier sur platform.openai.com/account/limits.",
      );
    }
    throw Errors.internal(
      `OpenAI Whisper a refusé la requête (${r.status}) : ${txt.slice(0, 200)}`,
    );
  }

  const body = (await r.json()) as {
    text?: string;
    language?: string;
    duration?: number;
    segments?: Array<{ avg_logprob?: number }>;
  };

  if (!body.text || body.text.trim().length === 0) {
    throw Errors.badRequest(
      "Aucun texte n'a été détecté dans l'audio. Réessaie en parlant plus fort, " +
        "plus près du micro, ou dans un endroit moins bruyant.",
    );
  }

  // Whisper retourne avg_logprob par segment (log-probability ∈ [-∞, 0])
  // → on approxime confiance 0..1 via exp(moyenne).
  let confidence = 0.85;
  if (body.segments && body.segments.length > 0) {
    const logprobs = body.segments
      .map((s) => s.avg_logprob)
      .filter((p): p is number => typeof p === "number");
    if (logprobs.length > 0) {
      const avg = logprobs.reduce((a, b) => a + b, 0) / logprobs.length;
      confidence = Math.max(0, Math.min(1, Math.exp(avg)));
    }
  }

  return {
    text: body.text.trim(),
    language: body.language ?? language ?? null,
    confidence,
    duration: body.duration ?? null,
    provider: "openai",
  };
}

/**
 * Legacy — WhisperAPI.com (service tiers commercial).
 *
 * Conservé pour rétrocompatibilité avec les anciennes configs `.env`.
 * Nouvelle config recommandée : retirer WHISPER_API_KEY et utiliser
 * OPENAI_API_KEY uniquement.
 */
async function transcribeViaWhisperApiCom(
  buffer: Buffer,
  mimetype: string,
  language: string | undefined,
  apiKey: string,
  baseUrl: string,
): Promise<TranscriptionResult> {
  // V70.1 — extension dérivée d'une whitelist Whisper (audio/aac → .m4a).
  const filename = whisperFilenameForMime(mimetype);
  const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", "whisper-1");
  if (language) form.append("language", language);
  form.append("response_format", "verbose_json");

  const r = await fetch(`${baseUrl}/transcribe`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    if (r.status === 401 || r.status === 403) {
      throw Errors.internal(
        "WhisperAPI a refusé la requête (clé invalide ou quota dépassé). " +
          "Astuce : retire WHISPER_API_KEY de ton .env et définis " +
          "uniquement OPENAI_API_KEY pour utiliser le Whisper officiel d'OpenAI.",
      );
    }
    throw Errors.internal(
      `WhisperAPI a refusé la requête (${r.status}) : ${txt.slice(0, 120)}`,
    );
  }

  const body = (await r.json()) as {
    text?: string;
    language?: string;
    duration?: number;
    segments?: Array<{ avg_logprob?: number }>;
  };
  if (!body.text || body.text.trim().length === 0) {
    throw Errors.badRequest(
      "Aucun texte n'a été détecté dans l'audio. Réessaie en parlant plus fort.",
    );
  }
  let confidence = 0.85;
  if (body.segments && body.segments.length > 0) {
    const logprobs = body.segments
      .map((s) => s.avg_logprob)
      .filter((p): p is number => typeof p === "number");
    if (logprobs.length > 0) {
      const avg = logprobs.reduce((a, b) => a + b, 0) / logprobs.length;
      confidence = Math.max(0, Math.min(1, Math.exp(avg)));
    }
  }
  return {
    text: body.text.trim(),
    language: body.language ?? language ?? null,
    confidence,
    duration: body.duration ?? null,
    provider: "whisperapi",
  };
}
