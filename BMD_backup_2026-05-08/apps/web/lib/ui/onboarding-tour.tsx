"use client";

/**
 * <OnboardingTour /> · Tour guidé 4 étapes pour les nouveaux utilisateurs.
 *
 * Apparaît au premier login (détecté via localStorage `bmd_tour_done`).
 * Le tour est volontairement court (4 étapes) pour ne pas être chiant —
 * on couvre les 4 actions clés de BMD :
 *  1. Créer un groupe
 *  2. Ajouter une dépense
 *  3. Inviter / partager
 *  4. Activer Face ID / Touch ID
 *
 * Skipable à tout moment via la croix. Ne se relance jamais sauf si
 * l'utilisateur clique « Refaire le tour » dans les paramètres
 * (à brancher si besoin plus tard).
 *
 * Rendu : modal fullscreen blur + carte centrée. Pas de spotlight DOM
 * (trop fragile selon les changements de layout) : on illustre chaque
 * étape avec un mini-screenshot SVG inline et un texte court.
 */

import { useEffect, useState } from "react";
import { haptic } from "../platform";
import { useT } from "../i18n/app-strings";

const TOUR_DONE_KEY = "bmd_tour_done";

interface Step {
  emoji: string;
  title: string;
  body: string;
  /** SVG illustratif (mini-screenshot dessiné à la main). */
  illustration: React.ReactNode;
}

const STEPS: Step[] = [
  {
    emoji: "🪙",
    title: "Crée ton 1er groupe",
    body: "Tontine, voyage, coloc, événement — choisis un modèle ou pars de zéro. Tes amis te rejoignent par lien d'invitation.",
    illustration: <IllustrationGroup />,
  },
  {
    emoji: "💸",
    title: "Ajoute des dépenses",
    body: "Tape le montant et qui doit quoi. Mode égal, parts inégales, %, ou par article. BMD calcule les soldes en temps réel.",
    illustration: <IllustrationExpense />,
  },
  {
    emoji: "🔗",
    title: "Partage & invite",
    body: "Lien WhatsApp / SMS pour rejoindre le groupe en 1 tap. Pas besoin de créer un compte avant — l'invitation amène à BMD.",
    illustration: <IllustrationShare />,
  },
  {
    emoji: "🔐",
    title: "Active Face ID / Touch ID",
    body: "Plus rapide qu'un OTP, sécurité bancaire. Va dans Profil → Passkeys → + Ajouter. Ton appareil garde la clé privée, BMD ne l'a jamais.",
    illustration: <IllustrationPasskey />,
  },
];

export function OnboardingTour() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // 1. Auth requis
    try {
      if (!localStorage.getItem("bmd_token")) return;
      // 2. Pas déjà fait
      if (localStorage.getItem(TOUR_DONE_KEY)) return;
    } catch {
      return;
    }
    // Délai léger pour laisser le dashboard render avant le tour
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function complete() {
    try {
      localStorage.setItem(TOUR_DONE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    haptic("success");
    setShow(false);
  }

  function next() {
    haptic("tap");
    if (stepIndex >= STEPS.length - 1) {
      complete();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function prev() {
    haptic("tap");
    setStepIndex((i) => Math.max(0, i - 1));
  }

  if (!show) return null;
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bmd-tour-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        background: "rgba(14,11,20,0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "bmd-tour-fade 0.25s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) complete();
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(140deg, #2A2244 0%, #1E1830 100%)",
          border: "1px solid rgba(232,163,61,0.30)",
          borderRadius: 22,
          padding: "24px 22px 18px",
          maxWidth: 420,
          width: "100%",
          color: "var(--cream)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          animation: "bmd-tour-pop 0.3s ease-out",
        }}
      >
        {/* Header avec progress + close */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 4,
            }}
            aria-label={`Étape ${stepIndex + 1} sur ${STEPS.length}`}
          >
            {STEPS.map((_, i) => (
              <div
                key={i}
                aria-hidden
                style={{
                  width: i === stepIndex ? 22 : 8,
                  height: 4,
                  borderRadius: 2,
                  background:
                    i <= stepIndex
                      ? "var(--saffron, #e8a33d)"
                      : "rgba(244,228,193,0.18)",
                  transition: "all 0.25s",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={complete}
            aria-label={t("onboarding.skipTour")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(244,228,193,0.06)",
              border: "1px solid rgba(244,228,193,0.10)",
              color: "var(--cream-soft)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* Illustration */}
        <div
          style={{
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 16,
            padding: "20px 16px",
            marginBottom: 16,
            minHeight: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {step.illustration}
        </div>

        {/* Titre + body */}
        <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 6 }}>
          {step.emoji}
        </div>
        <h2
          id="bmd-tour-title"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 24,
            fontWeight: 700,
            margin: "0 0 8px",
            color: "var(--cream)",
          }}
        >
          {step.title}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--cream-soft)",
            lineHeight: 1.5,
            margin: "0 0 20px",
          }}
        >
          {step.body}
        </p>

        {/* Boutons */}
        <div style={{ display: "flex", gap: 10 }}>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={prev}
              className="btn-ghost"
              style={{
                flex: "0 0 auto",
                padding: "12px 18px",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ← Préc
            </button>
          )}
          <button
            type="button"
            onClick={next}
            style={{
              flex: 1,
              padding: "13px 18px",
              fontSize: 14,
              fontWeight: 700,
              background:
                "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
              color: "#16111E",
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
              minHeight: 48,
              boxShadow: "0 6px 18px rgba(181,70,46,0.25)",
            }}
          >
            {isLast ? `✓ ${t("onboarding.done")}` : `${t("onboarding.next")} →`}
          </button>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={complete}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--cream-muted, #888)",
              fontSize: 12,
              cursor: "pointer",
              padding: "10px 0 0",
              width: "100%",
              textAlign: "center",
            }}
          >
            {t("onboarding.skipTour")}
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes bmd-tour-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bmd-tour-pop {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// ILLUSTRATIONS SVG (chacune ~150x100, dessinée à la main)
// =====================================================================

function IllustrationGroup() {
  return (
    <svg width="160" height="100" viewBox="0 0 160 100" aria-hidden>
      {/* Carte groupe */}
      <rect
        x="20"
        y="14"
        width="120"
        height="72"
        rx="12"
        fill="rgba(232,163,61,0.10)"
        stroke="var(--saffron, #e8a33d)"
        strokeWidth="1.2"
      />
      <text
        x="32"
        y="36"
        fill="var(--cream, #f4e4c1)"
        fontSize="11"
        fontWeight="700"
        fontFamily="Inter, sans-serif"
      >
        🪙 Tontine Bamiléké
      </text>
      <rect x="32" y="42" width="60" height="6" rx="3" fill="var(--saffron, #e8a33d)" opacity="0.6"/>
      <rect x="32" y="52" width="40" height="6" rx="3" fill="var(--cream-soft, #e8d5b7)" opacity="0.4"/>
      {/* Avatars empilés */}
      <circle cx="115" cy="68" r="9" fill="var(--saffron, #e8a33d)"/>
      <circle cx="103" cy="68" r="9" fill="var(--terracotta, #b54732)" stroke="#1E1830" strokeWidth="1.5"/>
      <circle cx="91" cy="68" r="9" fill="var(--emerald-soft, #66cdaa)" stroke="#1E1830" strokeWidth="1.5"/>
    </svg>
  );
}

function IllustrationExpense() {
  return (
    <svg width="160" height="100" viewBox="0 0 160 100" aria-hidden>
      {/* Champ amount */}
      <rect x="20" y="20" width="120" height="22" rx="6" fill="rgba(244,228,193,0.06)" stroke="rgba(244,228,193,0.18)" strokeWidth="1"/>
      <text x="28" y="35" fill="var(--saffron, #e8a33d)" fontSize="14" fontWeight="800" fontFamily="Inter">
        60,00 €
      </text>
      <text x="105" y="35" fill="var(--cream-soft, #e8d5b7)" fontSize="9" fontFamily="Inter">
        Resto
      </text>
      {/* Split bar */}
      <rect x="20" y="50" width="120" height="6" rx="3" fill="rgba(244,228,193,0.10)"/>
      <rect x="20" y="50" width="40" height="6" rx="3" fill="var(--saffron, #e8a33d)"/>
      <rect x="60" y="50" width="40" height="6" rx="3" fill="var(--terracotta, #b54732)"/>
      <rect x="100" y="50" width="40" height="6" rx="3" fill="var(--emerald-soft, #66cdaa)"/>
      {/* 3 names */}
      <text x="20" y="74" fill="var(--cream-soft, #e8d5b7)" fontSize="9" fontFamily="Inter">Marie · 20€</text>
      <text x="60" y="74" fill="var(--cream-soft, #e8d5b7)" fontSize="9" fontFamily="Inter">Aïcha · 20€</text>
      <text x="100" y="74" fill="var(--cream-soft, #e8d5b7)" fontSize="9" fontFamily="Inter">Karim · 20€</text>
    </svg>
  );
}

function IllustrationShare() {
  return (
    <svg width="160" height="100" viewBox="0 0 160 100" aria-hidden>
      <circle cx="40" cy="50" r="20" fill="rgba(232,163,61,0.18)" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5"/>
      <text x="33" y="56" fontSize="20" fontFamily="Inter">🔗</text>
      {/* Connector */}
      <line x1="62" y1="50" x2="98" y2="50" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5" strokeDasharray="4 3"/>
      {/* Phones group */}
      <rect x="100" y="32" width="20" height="36" rx="3" fill="rgba(244,228,193,0.06)" stroke="var(--cream-soft, #e8d5b7)" strokeWidth="1"/>
      <rect x="124" y="32" width="20" height="36" rx="3" fill="rgba(244,228,193,0.06)" stroke="var(--cream-soft, #e8d5b7)" strokeWidth="1"/>
      <text x="106" y="55" fontSize="12">📱</text>
      <text x="130" y="55" fontSize="12">📱</text>
    </svg>
  );
}

function IllustrationPasskey() {
  return (
    <svg width="160" height="100" viewBox="0 0 160 100" aria-hidden>
      {/* Phone with face id */}
      <rect x="55" y="14" width="50" height="72" rx="8" fill="rgba(244,228,193,0.06)" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5"/>
      {/* Face ID brackets */}
      <path d="M70 32 L70 28 Q70 24 74 24 L78 24" fill="none" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M82 24 L86 24 Q90 24 90 28 L90 32" fill="none" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M90 60 L90 64 Q90 68 86 68 L82 68" fill="none" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M78 68 L74 68 Q70 68 70 64 L70 60" fill="none" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Eyes + mouth */}
      <circle cx="76" cy="42" r="1.5" fill="var(--saffron, #e8a33d)"/>
      <circle cx="84" cy="42" r="1.5" fill="var(--saffron, #e8a33d)"/>
      <path d="M75 56 Q80 60 85 56" fill="none" stroke="var(--saffron, #e8a33d)" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Lock check */}
      <circle cx="120" cy="50" r="14" fill="var(--emerald-soft, #66cdaa)" opacity="0.85"/>
      <path d="M114 50 L118 54 L126 46" fill="none" stroke="#16111E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
