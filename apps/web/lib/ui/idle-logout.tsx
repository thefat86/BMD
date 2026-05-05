"use client";

/**
 * Auto-déconnexion après 30 minutes d'inactivité (spec §8.6).
 *
 * On surveille les évènements user (mousemove, keydown, scroll, touchstart)
 * et on reset un timer à chaque interaction. Si pas d'activité pendant
 * 30 min, on déclenche un avertissement modal puis on logout 60s plus tard
 * si l'user ne réagit pas.
 *
 * Utilisable comme composant qui ne rend rien — juste enregistre les
 * listeners. À monter dans le layout après auth.
 *
 * Configurable :
 *  - timeout par défaut : 30 minutes
 *  - warning durée : 60 secondes (countdown visible)
 *  - bypass via prop `disabled` (utile en mode dev/tests)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken } from "../api-client";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const WARNING_MS = 60 * 1000; // 1 min de countdown avant logout

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

export function IdleLogout({
  disabled = false,
}: {
  disabled?: boolean;
}): JSX.Element | null {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const idleTimerRef = useRef<number | null>(null);
  const warnTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const doLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    clearToken();
    setShowWarning(false);
    router.replace("/");
  }, [router]);

  const stayConnected = useCallback(() => {
    setShowWarning(false);
    setSecondsLeft(60);
    if (warnTimerRef.current != null) {
      clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (countdownRef.current != null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    resetIdle();
  }, []);

  const startWarning = useCallback(() => {
    setShowWarning(true);
    setSecondsLeft(60);
    // Countdown visible
    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    // Auto-logout après 60s sans réaction
    warnTimerRef.current = window.setTimeout(() => {
      void doLogout();
    }, WARNING_MS);
  }, [doLogout]);

  const resetIdle = useCallback(() => {
    if (idleTimerRef.current != null) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      startWarning();
    }, IDLE_TIMEOUT_MS - WARNING_MS); // démarre le warning avant la fin
  }, [startWarning]);

  useEffect(() => {
    if (disabled) return;
    resetIdle();
    const handler = () => {
      // Si le warning est affiché, on ne reset pas — l'user doit cliquer
      // explicitement "Rester connecté" pour confirmer sa présence
      if (showWarning) return;
      resetIdle();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handler);
      }
      if (idleTimerRef.current != null) clearTimeout(idleTimerRef.current);
      if (warnTimerRef.current != null) clearTimeout(warnTimerRef.current);
      if (countdownRef.current != null) clearInterval(countdownRef.current);
    };
  }, [disabled, resetIdle, showWarning]);

  if (!showWarning) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,11,20,0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "linear-gradient(180deg, #16111E 0%, #1F1429 100%)",
          border: "1px solid rgba(232,163,61,0.3)",
          borderRadius: 18,
          maxWidth: 380,
          width: "100%",
          padding: 24,
          color: "#F4E4C1",
          textAlign: "center",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>⏱</div>
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 24,
            margin: 0,
            marginBottom: 8,
          }}
        >
          Tu es toujours là&nbsp;?
        </h2>
        <p style={{ fontSize: 13, color: "#E8D5B7", lineHeight: 1.6 }}>
          Pour ta sécurité, tu seras déconnecté automatiquement dans
          <strong style={{ color: "#E8A33D", marginLeft: 4 }}>
            {secondsLeft}s
          </strong>
          .
        </p>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            type="button"
            onClick={() => void doLogout()}
            style={{
              flex: 1,
              padding: "12px",
              background: "rgba(255,255,255,0.05)",
              color: "#F4E4C1",
              border: "1px solid rgba(244,228,193,0.08)",
              borderRadius: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              minHeight: 44,
            }}
          >
            Me déconnecter
          </button>
          <button
            type="button"
            onClick={stayConnected}
            style={{
              flex: 2,
              padding: "12px",
              background: "linear-gradient(135deg, #E8A33D, #B5462E)",
              color: "#16111E",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 700,
              minHeight: 44,
            }}
          >
            Je suis là
          </button>
        </div>
      </div>
    </div>
  );
}
