"use client";

/**
 * <VoiceInput> · Saisie vocale des dépenses (spec §3.8).
 *
 * Utilise la Web Speech API native du navigateur (SpeechRecognition) — aucun
 * appel à un service externe (ni Whisper ni Google Cloud STT). 100% local.
 *
 * Workflow :
 *  1. L'utilisateur clique sur le micro
 *  2. On lance SpeechRecognition (langue = "fr-FR")
 *  3. Au stop, on parse le texte avec voice-parser.ts
 *  4. On appelle onParsed avec le résultat → le parent pré-remplit le form
 *
 * Compatibilité :
 *  - Chrome / Edge : ✅ (utilise webkitSpeechRecognition)
 *  - Safari / Firefox : partiel (Safari récent OK, Firefox non)
 *  - Si non supporté : on cache le composant
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import {
  parseVoiceCommand,
  type ParsedVoiceCommand,
} from "../voice-parser";

interface Props {
  onParsed: (result: ParsedVoiceCommand) => void;
  /** Langue ISO ("fr-FR" par défaut). Adaptable selon l'utilisateur. */
  lang?: string;
  /** Petit hint placé sous le bouton ("Dis-moi ce que tu veux ajouter…"). */
  hint?: string;
  /**
   * Sprint AC · ID du groupe courant. Si fourni, le parser LLM connaît la
   * liste des membres et matche directement les noms cités → resolved
   * paidByUserId, participantIds, splitMode, shares.
   */
  groupId?: string;
}

// Type minimal pour SpeechRecognition (l'API W3C, pas typée par défaut dans TS)
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition ??
    null
  );
}

export function VoiceInput({
  onParsed,
  lang = "fr-FR",
  hint,
  groupId,
}: Props) {
  const t = useT();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Sprint AC · Whisper fallback pour iOS Safari / Firefox où Web Speech
  // n'existe pas. On vérifie au mount si le serveur expose /voice/transcribe.
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
    // Probe l'API pour savoir si Whisper est dispo (utilisé en fallback)
    api
      .voiceAvailability()
      .then((r) => setWhisperAvailable(r.available))
      .catch(() => {
        /* Si la route n'existe pas (vieux serveur) → false par défaut */
      });
  }, []);

  /**
   * Sprint AC · Mode Whisper : enregistre un audio via MediaRecorder puis
   * l'envoie à /ai/voice-to-expense. Utilisé quand Web Speech n'est pas dispo.
   *
   * Format : audio/webm (Chrome/Firefox/Safari macOS) ou audio/mp4 (Safari iOS)
   * — le navigateur choisit le mimetype dispo.
   */
  async function startWhisperRecording() {
    setError(null);
    setInterim("");
    recordedChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Auto-pick mimetype (webm > mp4 > ogg)
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
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        // Stoppe les tracks pour éteindre le voyant micro du navigateur
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (recordedChunksRef.current.length === 0) return;
        setTranscribing(true);
        try {
          const blob = new Blob(recordedChunksRef.current, {
            type: mr.mimeType || "audio/webm",
          });
          // Code langue ISO 2 lettres (ex: "fr" depuis "fr-FR")
          const langCode = lang.split("-")[0];
          const result = await api.voiceToExpense(blob, {
            language: langCode,
            groupId, // Sprint AC · contexte groupe pour matcher les membres
          });
          setInterim(result.transcript);
          onParsed({
            description: result.parsed.description ?? null,
            amount: result.parsed.amount !== null ? String(result.parsed.amount) : null,
            currency: result.parsed.currency ?? null,
            category: result.parsed.category ?? null,
            participantsHints: result.parsed.participantsHints,
            confidence: result.parsed.confidence,
            rawText: result.transcript,
            paidByUserId: result.parsed.paidByUserId ?? null,
            participantIds: result.parsed.participantIds ?? [],
            splitMode: result.parsed.splitMode ?? null,
            shares: result.parsed.shares ?? {},
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : t("voice.parseError"));
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      const code = (e as any)?.name;
      if (code === "NotAllowedError" || code === "PermissionDeniedError") {
        setError(t("voice.micDenied"));
      } else {
        setError(e instanceof Error ? e.message : t("voice.cantStart"));
      }
    }
  }

  function stopWhisperRecording() {
    mediaRecorderRef.current?.stop();
  }

  function start() {
    setError(null);
    setInterim("");
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Ton navigateur ne supporte pas la saisie vocale.");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = "";

    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(finalText + interimText);
    };

    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === "no-speech") {
        setError(t("voice.noSpeech"));
      } else if (code === "not-allowed" || code === "service-not-allowed") {
        setError(t("voice.micDenied"));
      } else {
        setError(t("voice.micError", { code: code ?? "unknown" }));
      }
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      const text = finalText.trim();
      if (!text) return;

      // 1ère passe : parser local (instant + offline-friendly).
      const parsed = parseVoiceCommand(text);

      // Si le parser local est confiant (> 0.5) on utilise direct.
      if (parsed && parsed.confidence > 0.5) {
        onParsed(parsed);
        return;
      }

      // Sinon fallback LLM (spec §3.8) — on tente le parsing IA.
      // Sprint AC · si groupId fourni, le LLM matche les membres et
      // retourne paidByUserId, participantIds, splitMode, shares.
      void (async () => {
        try {
          const ai = await api.parseExpenseAi(text, groupId);
          const aiAsVoice = {
            description: ai.description ?? null,
            amount: ai.amount !== null ? String(ai.amount) : null,
            currency: ai.currency ?? null,
            category: ai.category ?? null,
            participantsHints: ai.participantsHints,
            confidence: ai.confidence,
            rawText: text,
            // Champs enrichis (peuvent être undefined si pas de groupId)
            paidByUserId: ai.paidByUserId ?? null,
            participantIds: ai.participantIds ?? [],
            splitMode: ai.splitMode ?? null,
            shares: ai.shares ?? {},
          };
          onParsed(aiAsVoice);
        } catch {
          if (parsed) {
            onParsed(parsed);
          } else {
            setError(t("voice.parseError"));
          }
        }
      })();
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("voice.cantStart"));
    }
  }

  function stop() {
    recognitionRef.current?.stop();
  }

  // Sprint AC · Si Web Speech n'est pas supporté MAIS Whisper l'est côté
  // serveur, on bascule sur le mode MediaRecorder + Whisper. Couvre iOS Safari
  // et Firefox qui n'implémentent pas l'API Web Speech.
  if (!supported && whisperAvailable) {
    const isActive = recording || transcribing;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
        <button
          type="button"
          onClick={recording ? stopWhisperRecording : startWhisperRecording}
          disabled={transcribing}
          aria-label={recording ? t("voice.stopListening") : t("voice.dictateExpense")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--saffron, #E8A33D)",
            background: isActive
              ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
              : "transparent",
            color: isActive ? "#16111E" : "var(--saffron)",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: transcribing ? "wait" : "pointer",
            minHeight: 44,
            opacity: transcribing ? 0.7 : 1,
          }}
        >
          {transcribing
            ? `🤖 ${t("voice.parseError")?.includes("…") ? t("voice.parseError") : "Transcription IA…"}`
            : recording
              ? `🔴 ${t("voice.stopListening")}`
              : `🎙️ ${t("voice.dictateExpense")} (IA)`}
        </button>
        {hint && !error && (
          <p style={{ fontSize: 11, color: "var(--muted, #999)", margin: 0, fontStyle: "italic" }}>
            {hint}
          </p>
        )}
        {interim && (
          <p style={{ fontSize: 12, color: "var(--cream-soft, #d4c4a8)", margin: 0, fontStyle: "italic" }}>
            « {interim} »
          </p>
        )}
        {error && (
          <p style={{ fontSize: 11, color: "var(--rose, #ef4444)", margin: 0 }}>
            ⚠ {error}
          </p>
        )}
      </div>
    );
  }

  if (!supported) {
    return (
      <p
        style={{
          fontSize: 11,
          color: "var(--muted, #999)",
          fontStyle: "italic",
          margin: 0,
        }}
      >
        {t("voice.notSupported")}
      </p>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: "100%",
      }}
    >
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? t("voice.stopListening") : t("voice.dictateExpense")}
        title={
          listening
            ? t("voice.listeningMsg")
            : hint ?? t("voice.talkMsg")
        }
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          // UX mobile : largeur 100% + hauteur tactile généreuse (≥48px)
          width: "100%",
          padding: "14px 18px",
          minHeight: 52,
          borderRadius: 14,
          border: listening
            ? "2px solid #ef4444"
            : "1.5px dashed var(--saffron, #e8a33d)",
          background: listening
            ? "linear-gradient(135deg, #ef4444, #b54732)"
            : "linear-gradient(135deg, rgba(232,163,61,0.08), rgba(181,70,46,0.04))",
          color: listening ? "white" : "var(--saffron, #e8a33d)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
          // touch-action : autorise le tap sans délai sur mobile
          touchAction: "manipulation",
          // Désactive la sélection du texte pour éviter les highlight au tap long
          userSelect: "none",
          WebkitTapHighlightColor: "transparent",
          transition: "all 0.15s",
          fontFamily: "inherit",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: listening ? "white" : "#ef4444",
            animation: listening ? "voice-pulse 1.2s infinite" : undefined,
            flexShrink: 0,
          }}
        />
        {listening
          ? t("voice.listening")
          : t("voice.dictate")}
      </button>

      {interim && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--cream-soft, #574a6e)",
            fontStyle: "italic",
            padding: "4px 10px",
            background: "rgba(239,68,68,0.08)",
            borderRadius: 8,
          }}
        >
          « {interim} »
        </p>
      )}

      {error && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: "#b54732",
          }}
        >
          ⚠️ {error}
        </p>
      )}

      <style jsx>{`
        @keyframes voice-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
