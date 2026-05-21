/**
 * <voice-recorder> — wrapper unifié V68
 *
 * Encapsule 3 stratégies pour enregistrer du son inline (sans picker système) :
 *
 *  1. **Capacitor natif** (iPhone via Xcode/TestFlight) : utilise le plugin
 *     `capacitor-voice-recorder` qui appelle AVAudioRecorder iOS natif.
 *     Demande la permission micro la 1re fois, retourne base64 → Blob.
 *
 *  2. **MediaRecorder web** (Safari/Chrome desktop, certains Android) : utilise
 *     `navigator.mediaDevices.getUserMedia` + `MediaRecorder`. Le contrôle de
 *     démarrage/arrêt est manuel.
 *
 *  3. **Fallback file picker** (très rare — Capacitor sans plugin, vieux iOS) :
 *     `<input type="file" accept="audio/*">` qui ouvre Voice Memos système.
 *
 * Le composant UI (PremiumVoiceCapture) appelle juste `startRecording()` /
 * `stopRecording()` et reçoit un Blob audio à envoyer à Whisper. Il ne sait
 * PAS quelle stratégie a été choisie.
 */

let cachedStrategy: "capacitor" | "mediaRecorder" | "filePicker" | null = null;
let cachedPlugin: unknown = null;

/**
 * V69.2 — Détecte si on tourne dans une app native Capacitor.
 * On utilise l'API officielle `@capacitor/core` qui est plus fiable que
 * `window.Capacitor` (objet global peut être initialisé après notre check).
 * En cas d'échec d'import (web sans Capacitor), retourne false.
 */
async function isNativeCapacitor(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    // eslint-disable-next-line no-console
    console.info(
      "[voice] Capacitor.getPlatform() =",
      Capacitor.getPlatform(),
      "isNative =",
      Capacitor.isNativePlatform(),
    );
    return Capacitor.isNativePlatform();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.info("[voice] @capacitor/core unavailable (web) :", e);
    return false;
  }
}

/** Détecte la stratégie disponible (cache pour ne pas re-tester à chaque tap). */
async function detectStrategy(): Promise<
  "capacitor" | "mediaRecorder" | "filePicker"
> {
  if (cachedStrategy) return cachedStrategy;

  // Stratégie 1 : Capacitor natif iOS/Android via le plugin voice-recorder
  if (await isNativeCapacitor()) {
    try {
      const mod = await import("capacitor-voice-recorder").catch((e) => {
        // eslint-disable-next-line no-console
        console.warn("[voice] capacitor-voice-recorder import failed:", e);
        return null;
      });
      if (!mod) {
        throw new Error("plugin import returned null");
      }
      const VoiceRecorder = (mod as any).VoiceRecorder;
      if (!VoiceRecorder) {
        throw new Error("VoiceRecorder export missing from plugin module");
      }
      const can = await VoiceRecorder.canDeviceVoiceRecord();
      // eslint-disable-next-line no-console
      console.info("[voice] canDeviceVoiceRecord =", can?.value);
      if (can?.value) {
        cachedPlugin = VoiceRecorder;
        cachedStrategy = "capacitor";
        return cachedStrategy;
      }
      throw new Error("device cannot record");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[voice] capacitor strategy failed → fallback web",
        e,
      );
    }
  }

  // Stratégie 2 : navigator.mediaDevices (web standard / Safari iOS)
  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  ) {
    cachedStrategy = "mediaRecorder";
    return cachedStrategy;
  }

  // Stratégie 3 : pas de support — throw clean
  cachedStrategy = "filePicker";
  return cachedStrategy;
}

export interface VoiceRecorderHandle {
  /** Stratégie utilisée — pour info / UX. */
  strategy: "capacitor" | "mediaRecorder" | "filePicker";
  /** Stoppe l'enregistrement et retourne le blob audio capturé. */
  stop: () => Promise<Blob | null>;
}

/**
 * Démarre un enregistrement. Demande la permission micro si pas déjà accordée.
 * Sur Capacitor : popup système iOS de permission micro.
 * Retourne un handle pour stopper et récupérer le blob.
 *
 * Throws si l'utilisateur refuse la permission ou si tout fail.
 */
export async function startVoiceRecording(): Promise<VoiceRecorderHandle> {
  const strategy = await detectStrategy();

  if (strategy === "capacitor" && cachedPlugin) {
    const VR = cachedPlugin as {
      requestAudioRecordingPermission: () => Promise<{ value: boolean }>;
      hasAudioRecordingPermission: () => Promise<{ value: boolean }>;
      startRecording: () => Promise<{ value: boolean }>;
      stopRecording: () => Promise<{
        value: { recordDataBase64: string; mimeType: string; msDuration: number };
      }>;
    };
    // Demande la permission si pas déjà accordée
    const has = await VR.hasAudioRecordingPermission();
    if (!has.value) {
      const req = await VR.requestAudioRecordingPermission();
      if (!req.value) {
        throw new Error("MIC_PERMISSION_DENIED");
      }
    }
    await VR.startRecording();
    return {
      strategy: "capacitor",
      async stop() {
        const r = await VR.stopRecording();
        const { recordDataBase64, mimeType } = r.value;
        // V72.1 — Le plugin capacitor-voice-recorder écrit le fichier iOS
        // avec l'extension `.aac`, ce qui force AVAudioRecorder à produire
        // un stream AAC ADTS BRUT (pas un container MP4/M4A). OpenAI
        // Whisper rejette ce format même renommé en .m4a/.mp4 car il
        // inspecte les bytes du fichier.
        //
        // Solution : on décode l'AAC en PCM via WebAudio API puis on
        // ré-encode en WAV (PCM 16-bit non compressé) côté client avant
        // upload. WAV est universellement accepté par Whisper et lisible
        // par tous les backends.
        //
        // Trade-off : WAV est ~10× plus gros que AAC, mais pour des
        // enregistrements courts (<60s) ça reste <2 MB. Acceptable.
        // eslint-disable-next-line no-console
        console.info("[voice] capacitor plugin mimeType (raw) =", mimeType);
        const aacBlob = base64ToBlob(recordDataBase64, "audio/aac");
        try {
          const wavBlob = await convertAudioBlobToWav(aacBlob);
          // eslint-disable-next-line no-console
          console.info(
            "[voice] AAC →  WAV remux OK, taille =",
            wavBlob.size,
            "bytes",
          );
          return wavBlob;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(
            "[voice] AAC → WAV remux failed, falling back to raw AAC :",
            e instanceof Error ? e.message : e,
          );
          // Fallback : on retag en audio/m4a et on espère que le backend
          // arrive à le traiter (peu probable mais évite de bloquer
          // totalement l'utilisateur).
          return base64ToBlob(
            recordDataBase64,
            normalizeMimeForWhisper(mimeType || "audio/aac"),
          );
        }
      },
    };
  }

  if (strategy === "mediaRecorder") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const mimeType =
      candidates.find((m) =>
        typeof MediaRecorder.isTypeSupported === "function"
          ? MediaRecorder.isTypeSupported(m)
          : true,
      ) ?? "";
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    mr.start();
    return {
      strategy: "mediaRecorder",
      stop() {
        return new Promise<Blob | null>((resolve) => {
          mr.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            if (chunks.length === 0) resolve(null);
            else resolve(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
          };
          if (mr.state === "recording") mr.stop();
          else resolve(null);
        });
      },
    };
  }

  // Fallback file picker : on ne peut pas vraiment "démarrer" — c'est l'user
  // qui choisit un fichier via le picker. La couche UI doit appeler
  // `pickAudioFile()` séparément.
  throw new Error("VOICE_RECORDING_UNSUPPORTED");
}

/** Indique si l'enregistrement live est dispo (pour décider de l'UX UI). */
export async function isLiveRecordingSupported(): Promise<boolean> {
  const s = await detectStrategy();
  return s === "capacitor" || s === "mediaRecorder";
}

/** Décode base64 → Blob (utile pour Capacitor qui retourne base64). */
function base64ToBlob(b64: string, mimeType: string): Blob {
  const byteString = atob(b64);
  const len = byteString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * V70.1 — Normalise le mimeType retourné par capacitor-voice-recorder pour
 * qu'il soit compris par Whisper backend.
 *
 * Le plugin retourne "audio/aac" sur iOS, mais le fichier livré est en
 * réalité un container MP4/M4A (AAC encodé via AVAudioRecorder dans un
 * atom MP4). Whisper accepte "audio/m4a" / "audio/mp4" mais pas
 * "audio/aac". On normalise à "audio/m4a" qui correspond au container
 * réel et qui est dans la liste SUPPORTED_AUDIO_MIME backend.
 *
 * Pour les autres mimeType (webm, ogg, mp3, wav…), on passe la valeur
 * telle quelle.
 */
function normalizeMimeForWhisper(mime: string): string {
  const base = (mime || "").split(";")[0].toLowerCase().trim();
  if (base === "audio/aac" || base === "audio/x-aac" || base === "audio/x-m4a") {
    return "audio/m4a";
  }
  return mime;
}

/** Export utilitaire (réutilisable côté upload attachments audio). */
export function normalizeAudioMime(mime: string): string {
  return normalizeMimeForWhisper(mime);
}

// ============================================================
// V72.1 — Remux audio côté client (AAC ADTS → WAV)
// ============================================================
//
// Le plugin capacitor-voice-recorder produit du AAC ADTS brut sur iOS
// (pas un container MP4/M4A). OpenAI Whisper refuse ce format. Pour
// rester compatible sans dépendance serveur, on décode l'audio via
// WebAudio API (codec AAC supporté nativement par Safari WKWebView)
// puis on le ré-encode en WAV (PCM 16-bit non compressé), format
// universellement accepté.

/**
 * Convertit n'importe quel Blob audio décodable par le navigateur en
 * Blob WAV (PCM 16-bit). Utile pour bypasser les container types que
 * Whisper rejette (raw AAC notamment).
 */
async function convertAudioBlobToWav(audioBlob: Blob): Promise<Blob> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("WebAudio API non disponible");
  }
  const ctx: AudioContext = new AudioCtx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    // Ferme le contexte dès la fin du decode pour libérer les ressources
    ctx.close().catch(() => {
      /* noop */
    });
  }
  const wavBytes = audioBufferToWav(audioBuffer);
  return new Blob([wavBytes], { type: "audio/wav" });
}

/**
 * Encode un AudioBuffer en WAV PCM 16-bit little-endian.
 *
 * Format WAV (RIFF) : 44 octets de header + samples interleavés.
 * Référence : http://soundfile.sapp.org/doc/WaveFormat/
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // PCM 16-bit
  const bitsPerSample = 16;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const length = buffer.length;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const out = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(out);

  // "RIFF"
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // file size minus 8
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Samples : interleave channels, float32 [-1, 1] → int16 LE
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  let offset = headerSize;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      // Clamp puis convertit en int16
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample | 0, true);
      offset += 2;
    }
  }
  return out;
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}
