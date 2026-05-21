"use client";

/**
 * <PremiumVoiceCapture> · V41.4 — Pipeline IA premium qualité maximale.
 *
 * Contrairement à <VoiceInput> qui privilégie Web Speech API (rapide mais
 * médiocre), ce composant utilise SYSTÉMATIQUEMENT le backend Whisper +
 * OpenAI pour bénéficier de la meilleure qualité possible peu importe le
 * device/navigateur :
 *
 *  1. MediaRecorder → enregistre audio WebM/MP4
 *  2. POST /ai/voice-to-expense → Whisper (transcription multilingue)
 *     + OpenAI gpt-4o-mini (parsing intelligent avec contexte groupe)
 *  3. Retourne { transcript, parsed } pré-rempli
 *
 * UX captivante :
 *  - 4 stages visuels : IDLE → RECORDING (waveform pulsé) → THINKING
 *    (orbital loader) → DONE (succès)
 *  - Affiche en temps réel le transcript pendant le thinking
 *  - Score de confiance final avec barres
 *  - Bouton stop manuel + auto-stop après 30s
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { haptic } from "../platform";
import { startVoiceRecording, type VoiceRecorderHandle } from "../voice-recorder";

interface VoiceResult {
  transcript: string;
  language: string | null;
  duration: number | null;
  amount: string | null;
  description: string | null;
  currency: string | null;
  category: string | null;
  confidence: number;
  source: "llm" | "heuristic";
  paidByUserId?: string | null;
  participantIds?: string[];
  splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED" | null;
}

interface Props {
  /** Code ISO 2 lettres pour boost Whisper (ex: "fr"). Optionnel. */
  language?: string;
  /** Contexte groupe : permet à OpenAI de matcher les prénoms cités → userId. */
  groupId?: string;
  /** Callback avec le résultat complet (transcript + parsing). */
  onResult: (result: VoiceResult) => void;
  /** Callback annulation. */
  onCancel?: () => void;
  /** Auto-stop après N ms (default 30000 = 30s). */
  maxDurationMs?: number;
}

type Stage = "idle" | "recording" | "thinking" | "error";

export function PremiumVoiceCapture({
  language = "fr",
  groupId,
  onResult,
  onCancel,
  maxDurationMs = 30000,
}: Props) {
  const t = useT();

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [thinkingMessage, setThinkingMessage] = useState("");

  // V68 — Plus de MediaRecorder direct. On utilise le wrapper `voice-recorder`
  // qui choisit la meilleure stratégie selon la plateforme (Capacitor natif iOS,
  // MediaRecorder web, ou file picker en dernier recours).
  const recorderHandleRef = useRef<VoiceRecorderHandle | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** V65 — Envoie un blob audio (peu importe sa source) à Whisper + parsing. */
  async function processAudioBlob(blob: Blob) {
    setStage("thinking");
    const messages = [
      t("voice.stageWhisper") || "Transcription Whisper…",
      t("voice.stageParse") || "OpenAI analyse le sens…",
      t("voice.stageDetectMembers") || "Identification des membres…",
      t("voice.stageDetectAmount") || "Détection du montant…",
    ];
    let idx = 0;
    setThinkingMessage(messages[0]!);
    thinkingTimerRef.current = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setThinkingMessage(messages[idx]!);
    }, 1500);
    try {
      const result = await api.voiceToExpense(blob, { language, groupId });
      haptic("success");
      onResult({
        transcript: result.transcript,
        language: result.language,
        duration: result.duration,
        amount:
          result.parsed.amount !== null
            ? String(result.parsed.amount)
            : null,
        description: result.parsed.description || null,
        currency: result.parsed.currency,
        category: result.parsed.category,
        confidence: result.parsed.confidence,
        source: result.parsed.source,
        paidByUserId: result.parsed.paidByUserId ?? null,
        participantIds: result.parsed.participantIds ?? [],
        splitMode: result.parsed.splitMode ?? null,
      });
    } catch (e) {
      haptic("error");
      setError(
        e instanceof Error
          ? e.message
          : t("voice.parseError") || "Analyse IA impossible",
      );
      setStage("error");
    } finally {
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
    }
  }

  /** V68 — Plus utilisé : on passe par le wrapper voice-recorder. */

  // Cleanup à l'unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
      // V68 — Best-effort stop si l'utilisateur quitte pendant un enregistrement
      try {
        recorderHandleRef.current?.stop().catch(() => {});
      } catch {
        /* déjà stop */
      }
    };
  }, []);

  async function startRecording() {
    setError(null);

    // V68 — Démarrage via wrapper unifié : Capacitor natif iOS (AVAudioRecorder)
    // ou MediaRecorder web. Si l'utilisateur refuse la permission micro,
    // on affiche un message clair.
    try {
      const handle = await startVoiceRecording();
      recorderHandleRef.current = handle;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setStage("recording");
      haptic("tap");

      // Compteur visuel
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
      }, 100);

      // Auto-stop après maxDurationMs
      autoStopRef.current = setTimeout(() => {
        stopRecording();
      }, maxDurationMs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.warn("[voice] startVoiceRecording failed:", msg);
      setError(
        msg === "MIC_PERMISSION_DENIED"
          ? t("voice.micDenied") ||
              "Micro refusé. Va dans Réglages iOS → BMD → Autoriser le micro."
          : msg === "VOICE_RECORDING_UNSUPPORTED"
            ? t("voice.micUnsupported") ||
                "Ce navigateur ne permet pas l'enregistrement vocal."
            : (t("voice.cantStart") || "Impossible de démarrer le micro.") +
              (msg ? ` (${msg})` : ""),
      );
      setStage("error");
    }
  }

  async function stopRecording() {
    const handle = recorderHandleRef.current;
    if (!handle) return;
    recorderHandleRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    try {
      const blob = await handle.stop();
      if (!blob || blob.size === 0) {
        setStage("idle");
        return;
      }
      await processAudioBlob(blob);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[voice] stop failed:", e);
      setError(
        t("voice.parseError") || "Analyse IA impossible (erreur enregistrement)",
      );
      setStage("error");
    }
  }

  // ============ RENDER ============

  // V68 — Plus besoin d'input file caché : le wrapper voice-recorder gère
  // toutes les stratégies (Capacitor natif iOS + MediaRecorder web).
  const hiddenFileInput = null;

  if (stage === "thinking") {
    return <ThinkingState message={thinkingMessage} />;
  }

  if (stage === "error") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          padding: "20px 14px",
        }}
      >
        {hiddenFileInput}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "rgba(217,113,74,0.18)",
            border: "1px solid rgba(217,113,74,0.40)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
          }}
        >
          ⚠️
        </div>
        <p
          style={{
            fontSize: 13,
            color: "#FFB89A",
            textAlign: "center",
            margin: 0,
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              setStage("idle");
              setError(null);
            }}
            style={{
              padding: "10px 18px",
              background:
                "linear-gradient(135deg, var(--saffron), var(--terracotta))",
              color: "#16111E",
              border: "none",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("common.retry") || "Réessayer"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "10px 18px",
                background: "transparent",
                color: "var(--cream-soft)",
                border: "1px solid rgba(244,228,193,0.18)",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("common.cancel") || "Annuler"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const isRecording = stage === "recording";
  const secondsElapsed = Math.floor(elapsedMs / 1000);
  const secondsRemaining = Math.max(
    0,
    Math.ceil((maxDurationMs - elapsedMs) / 1000),
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "10px 14px",
      }}
    >
      {hiddenFileInput}
      {/* Halo signature pulsant pendant écoute */}
      <div
        aria-hidden
        style={{
          position: "relative",
          width: 140,
          height: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isRecording && (
          <>
            <span
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(217,113,74,0.45), transparent 60%)",
                animation: "bmd-pvc-pulse 1.4s ease-out infinite",
              }}
            />
            <span
              style={{
                position: "absolute",
                inset: 12,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(232,163,61,0.40), transparent 60%)",
                animation: "bmd-pvc-pulse 1.4s ease-out infinite 0.35s",
              }}
            />
          </>
        )}
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          aria-label={
            isRecording
              ? t("voice.stopRecording") || "Arrêter l'enregistrement"
              : t("voice.startRecording") || "Démarrer l'enregistrement"
          }
          style={{
            position: "relative",
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: isRecording
              ? "linear-gradient(135deg, #D9714A, #B54732)"
              : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            border: "2px solid rgba(244,228,193,0.30)",
            color: isRecording ? "var(--cream)" : "#16111E",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            cursor: "pointer",
            boxShadow: isRecording
              ? "0 14px 40px rgba(217,113,74,0.55)"
              : "0 10px 30px rgba(232,163,61,0.50)",
            fontFamily: "inherit",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {isRecording ? "■" : "🎙"}
        </button>
      </div>

      {/* Compteur / hint */}
      {isRecording ? (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--cream)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {String(Math.floor(secondsElapsed / 60)).padStart(1, "0")}:
            {String(secondsElapsed % 60).padStart(2, "0")}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--cream-soft)",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            {t("voice.recording") || "Enregistrement"} ·{" "}
            {t("voice.secondsLeft", { s: String(secondsRemaining) }) ||
              `${secondsRemaining}s restantes`}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--cream)",
              margin: "0 0 6px",
              lineHeight: 1.2,
            }}
          >
            {t("voice.tapToStart") || "Tape pour parler"}
          </p>
          <p
            style={{
              fontSize: 11.5,
              color: "var(--cream-soft)",
              margin: 0,
              maxWidth: 280,
              lineHeight: 1.5,
              opacity: 0.85,
            }}
          >
            {t("voice.premiumHint") ||
              "Whisper IA + OpenAI · multilingue & dialectes supportés"}
          </p>
        </div>
      )}

      {/* Badge IA premium */}
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(91,108,255,0.10)",
          border: "1px solid rgba(91,108,255,0.30)",
          fontSize: 10,
          color: "#9eabff",
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        <span aria-hidden>⬢</span>
        <span>
          {t("voice.poweredBy") || "Whisper · OpenAI"}
        </span>
      </div>

      {onCancel && !isRecording && (
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "10px 20px",
            background: "transparent",
            color: "var(--cream-soft)",
            border: "1px solid rgba(244,228,193,0.18)",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("common.cancel") || "Annuler"}
        </button>
      )}

      <style jsx>{`
        @keyframes bmd-pvc-pulse {
          0% {
            transform: scale(0.85);
            opacity: 0.85;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

// ============ THINKING STATE — animation orbital captivante ============

function ThinkingState({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        padding: "20px 14px",
        minHeight: 240,
      }}
    >
      {/* Orbital loader IA — 3 points qui tournent autour d'un noyau */}
      <div
        aria-hidden
        style={{
          position: "relative",
          width: 120,
          height: 120,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <linearGradient id="bmd-think-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--saffron, #e8a33d)" />
              <stop offset="100%" stopColor="var(--terracotta, #b54732)" />
            </linearGradient>
          </defs>
          {/* Noyau central */}
          <circle cx="60" cy="60" r="14" fill="url(#bmd-think-grad)" />
          {/* 3 orbites en rotation */}
          <g
            style={{
              transformOrigin: "60px 60px",
              animation: "bmd-think-rotate 2.5s linear infinite",
            }}
          >
            <circle cx="60" cy="20" r="5" fill="#5B6CFF" opacity="0.9" />
          </g>
          <g
            style={{
              transformOrigin: "60px 60px",
              animation: "bmd-think-rotate 2.5s linear infinite 0.83s",
            }}
          >
            <circle cx="60" cy="20" r="5" fill="#7DC59E" opacity="0.85" />
          </g>
          <g
            style={{
              transformOrigin: "60px 60px",
              animation: "bmd-think-rotate 2.5s linear infinite 1.66s",
            }}
          >
            <circle cx="60" cy="20" r="5" fill="#E8A33D" opacity="0.9" />
          </g>
        </svg>
      </div>
      <p
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--cream)",
          margin: 0,
          textAlign: "center",
          maxWidth: 300,
          lineHeight: 1.2,
        }}
      >
        {message}
      </p>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--cream-soft)",
          textAlign: "center",
          margin: 0,
          maxWidth: 260,
          opacity: 0.85,
          lineHeight: 1.5,
        }}
      >
        L'IA travaille pour toi…
      </p>
      <style jsx>{`
        @keyframes bmd-think-rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
