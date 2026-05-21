"use client";

/**
 * <NpsSurvey /> · Survey Net Promoter Score in-app (spec §9.3).
 *
 * Au mount du dashboard, appelle `/nps/should-show` qui répond true si :
 *  - L'user n'a pas répondu depuis > 90 jours
 *  - ET il a un compte > 14 jours
 *  - ET il a au moins 1 expense créée
 *
 * Si oui, affiche un mini-banner discret en bas du dashboard avec :
 *  - "Tu recommanderais BMD à un ami ?" + 11 boutons (0-10)
 *  - Au clic d'une note, on demande optionnellement un commentaire
 *  - À l'envoi, message de remerciement adapté au score
 *
 * Cache local 24h après affichage : pas de re-check serveur en boucle.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { haptic } from "../platform";

const CACHE_KEY = "bmd_nps_check_at";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function NpsSurvey() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<"score" | "comment" | "thanks">("score");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [thanks, setThanks] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Cache 24h pour ne pas spam le serveur à chaque mount
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const t = parseInt(cached, 10);
        if (!isNaN(t) && Date.now() - t < CACHE_TTL_MS) return;
      }
    } catch {
      /* ignore */
    }
    void (async () => {
      try {
        const r = await api.npsShouldShow();
        if (r.shouldShow) {
          // Délai 4s avant d'afficher pour ne pas perturber l'arrivée sur dashboard
          setTimeout(() => setShow(true), 4000);
        }
        try {
          localStorage.setItem(CACHE_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      } catch {
        /* silencieux */
      }
    })();
  }, []);

  async function submit(s: number, withComment: string) {
    setBusy(true);
    try {
      const r = await api.npsSubmit(s, withComment || undefined);
      setThanks(r.thankYou);
      setStep("thanks");
      haptic("success");
      // Auto-dismiss après 4s
      setTimeout(() => setShow(false), 4000);
    } catch {
      // Silencieux : ne pas embêter l'utilisateur s'il y a une erreur
      setShow(false);
    } finally {
      setBusy(false);
    }
  }

  function pickScore(s: number) {
    setScore(s);
    haptic("tap");
    // Score 9-10 = on remercie direct sans demander de commentaire
    // Score 0-8 = on propose un commentaire pour comprendre
    if (s >= 9) {
      void submit(s, "");
    } else {
      setStep("comment");
    }
  }

  function dismiss() {
    setShow(false);
    // On marque comme "vu" pour ne pas redemander avant 24h, mais on
    // n'enregistre pas de NPS — donc ça reviendra dans 24h.
    try {
      localStorage.setItem(CACHE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Sondage de satisfaction"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        left: 16,
        right: 16,
        maxWidth: 460,
        margin: "0 auto",
        zIndex: 800,
        background: "linear-gradient(135deg, #2A2244 0%, #1E1830 100%)",
        border: "1px solid rgba(232,163,61,0.30)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        animation: "bmd-nps-slidein 0.3s ease-out",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: step === "score" ? 12 : 8,
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {step === "score" && (
            <>
              <div
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--cream)",
                  marginBottom: 4,
                }}
              >
                Tu recommanderais BMD à un ami ?
              </div>
              <div style={{ fontSize: 11, color: "var(--cream-soft)" }}>
                De 0 (jamais) à 10 (carrément)
              </div>
            </>
          )}
          {step === "comment" && (
            <>
              <div
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--cream)",
                  marginBottom: 4,
                }}
              >
                Merci ! Note : {score}/10
              </div>
              <div style={{ fontSize: 11, color: "var(--cream-soft)" }}>
                {score !== null && score <= 6
                  ? "Qu'est-ce qu'on pourrait améliorer ?"
                  : "Une raison particulière (optionnel) ?"}
              </div>
            </>
          )}
          {step === "thanks" && (
            <div
              style={{
                fontSize: 13,
                color: "var(--cream)",
                lineHeight: 1.5,
              }}
            >
              {thanks}
            </div>
          )}
        </div>
        {step !== "thanks" && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--cream-soft)",
              fontSize: 16,
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {step === "score" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(11, 1fr)",
            gap: 4,
          }}
        >
          {Array.from({ length: 11 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickScore(i)}
              disabled={busy}
              style={{
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 700,
                background:
                  i <= 6
                    ? "rgba(217,113,74,0.12)"
                    : i <= 8
                      ? "rgba(232,163,61,0.12)"
                      : "rgba(102,205,170,0.18)",
                border:
                  i <= 6
                    ? "1px solid rgba(217,113,74,0.30)"
                    : i <= 8
                      ? "1px solid rgba(232,163,61,0.30)"
                      : "1px solid rgba(102,205,170,0.40)",
                color: "var(--cream)",
                borderRadius: 6,
                cursor: busy ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {i}
            </button>
          ))}
        </div>
      )}

      {step === "comment" && score !== null && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optionnel"
            maxLength={500}
            autoFocus
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "rgba(244,228,193,0.06)",
              border: "1px solid rgba(244,228,193,0.18)",
              color: "var(--cream)",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={() => submit(score, comment)}
            disabled={busy}
            className="btn"
            style={{ padding: "10px 18px", fontSize: 13 }}
          >
            {busy ? "…" : "✓ Envoyer"}
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes bmd-nps-slidein {
          from {
            transform: translateY(120%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
