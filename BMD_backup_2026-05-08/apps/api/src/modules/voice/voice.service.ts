/**
 * Service de transcription voix → texte (spec §3.8 — saisie vocale).
 *
 * Provider principal : WhisperAPI (https://whisper-api.com — cloud Whisper
 * managé, plus simple que self-host).
 *
 * Si WHISPER_API_KEY n'est pas défini, l'endpoint répond avec une erreur
 * gracieuse et le frontend tombe sur l'API Web Speech du navigateur (gratuit
 * mais qualité moindre, indisponible sur Safari iOS).
 *
 * Format audio supporté côté WhisperAPI : MP3, WAV, M4A, OGG, WebM.
 * Le navigateur enregistre généralement en `audio/webm` (Chrome/Firefox)
 * ou `audio/mp4` (Safari) — les deux sont acceptés.
 */
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";

export interface TranscriptionResult {
  text: string;
  language: string | null; // code ISO (ex: "fr", "en") détecté par Whisper
  confidence: number; // 0..1
  duration: number | null; // secondes
}

/**
 * Indique si le service Whisper est configuré et prêt à être appelé.
 * Le frontend peut appeler GET /voice/availability pour savoir s'il faut
 * proposer le bouton micro ou rester sur l'API Web Speech navigateur.
 */
export function isWhisperAvailable(): boolean {
  const env = loadEnv();
  return !!env.WHISPER_API_KEY;
}

/**
 * Transcrit un fichier audio en texte via WhisperAPI.
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
  if (!env.WHISPER_API_KEY) {
    throw Errors.badRequest(
      "Le service de transcription voix n'est pas configuré sur ce serveur. " +
        "Utilise la dictée native de ton navigateur ou contacte l'admin.",
    );
  }

  // Détermine l'extension du fichier depuis le mimetype
  const ext = mimetype.split("/")[1]?.split(";")[0] ?? "webm";
  const filename = `audio.${ext}`;
  const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
  const form = new FormData();
  form.append("file", blob, filename);
  // Modèle Whisper turbo : 8x plus rapide que le large, qualité quasi équivalente
  form.append("model", "whisper-1");
  if (language) form.append("language", language);
  // Format détaillé pour récupérer la confiance + durée
  form.append("response_format", "verbose_json");

  const r = await fetch(`${env.WHISPER_API_URL}/transcribe`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHISPER_API_KEY}` },
    body: form,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    // 401 / 403 : clé API invalide → erreur explicite pour l'admin
    if (r.status === 401 || r.status === 403) {
      throw Errors.internal(
        "WhisperAPI a refusé la requête (clé invalide ou quota dépassé). Vérifie WHISPER_API_KEY.",
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
      "Aucun texte n'a été détecté dans l'audio. Réessaie en parlant plus fort ou plus près du micro.",
    );
  }

  // Whisper retourne avg_logprob par segment (log-probability ∈ [-∞, 0]).
  // On approxime une "confidence 0..1" via exp(moyenne) — pas parfait
  // mais donne une indication exploitable côté UI (si <0.4 on warn l'user).
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
  };
}
