"use client";

/**
 * Onboarding contextuel · "Tu es ici pour quoi ?"
 *
 * Spec §3.1 : à la première connexion (ou si l'utilisateur n'a aucun groupe),
 * on lui demande son cas d'usage principal pour pré-sélectionner le type de
 * groupe et adapter le vocabulaire à son contexte.
 *
 * Choix : 6 cartes (tontine / coloc / voyage / mariage / club / paroisse)
 *  + 1 carte "autre / explorer" pour les indécis.
 *
 * Au clic sur un type :
 *  - on dismiss l'onboarding (localStorage flag, ne réapparaît plus)
 *  - on appelle onChoose(type) → le parent ouvre le formulaire de création
 *    de groupe avec ce type pré-sélectionné
 *
 * UX : carte saffron + halo, fullscreen mobile, modal centré desktop.
 */
import { useEffect, useState } from "react";
import { useBreakpoint } from "../use-breakpoint";

const ONBOARDING_DONE_KEY = "bmd_onboarding_done_v1";

export function shouldShowOnboarding(hasGroups: boolean): boolean {
  if (typeof window === "undefined") return false;
  if (hasGroups) return false; // si l'user a déjà au moins 1 groupe, pas besoin
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (groupType: string) => void;
  userName?: string;
}

interface Choice {
  type: string; // matche enum GroupType backend
  icon: string;
  title: string;
  desc: string;
}

const CHOICES: Choice[] = [
  {
    type: "TONTINE",
    icon: "🪙",
    title: "Une tontine",
    desc: "Épargne collective rotative entre amis ou famille",
  },
  {
    type: "COLOC",
    icon: "🏠",
    title: "Une coloc",
    desc: "Loyer, factures, courses partagées au mois",
  },
  {
    type: "TRAVEL",
    icon: "✈️",
    title: "Un voyage",
    desc: "Vacances en groupe avec dépenses à splitter",
  },
  {
    type: "EVENT",
    icon: "💍",
    title: "Un mariage / événement",
    desc: "Comité d'organisation avec partages flexibles",
  },
  {
    type: "CLUB",
    icon: "⚽",
    title: "Un club / asso",
    desc: "Cotisations sportives, culturelles, étudiantes",
  },
  {
    type: "PARISH",
    icon: "⛪",
    title: "Une paroisse",
    desc: "Quêtes, projets, reçus pour les membres",
  },
];

export function OnboardingModal({
  open,
  onClose,
  onChoose,
  userName,
}: Props): JSX.Element | null {
  const [show, setShow] = useState(false);
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    if (open) {
      // Petit fade-in à l'ouverture
      requestAnimationFrame(() => setShow(true));
    } else {
      setShow(false);
    }
  }, [open]);

  if (!open) return null;

  function handlePick(type: string) {
    markOnboardingDone();
    onChoose(type);
  }

  function handleSkip() {
    markOnboardingDone();
    onClose();
  }

  // === Variant MOBILE : full-screen, gros tap targets, scrollable ===
  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(900px 600px at 10% -10%, rgba(232,163,61,0.18), transparent 60%), " +
            "linear-gradient(180deg, #0E0B14 0%, #1F1429 100%)",
          zIndex: 9990,
          display: "flex",
          flexDirection: "column",
          padding:
            "calc(env(safe-area-inset-top, 0) + 24px) 20px calc(env(safe-area-inset-bottom, 0) + 24px)",
          overflowY: "auto",
          opacity: show ? 1 : 0,
          transition: "opacity 0.25s ease",
          color: "#F4E4C1",
          fontFamily:
            "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Logo BMD signature en haut */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.20), rgba(181,70,46,0.10))",
              border: "1.5px solid rgba(232,163,61,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bmd-logo.svg" alt="BMD" width={44} height={44} />
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              color: "#C9A24A",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Bienvenue {userName ? `· ${userName}` : ""}
          </div>
          <h2
            id="onboarding-title"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 30,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Tu es ici pour quoi&nbsp;?
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "#E8D5B7",
              marginTop: 10,
              lineHeight: 1.6,
              maxWidth: 320,
              margin: "10px auto 0",
            }}
          >
            Choisis ton cas d'usage — on adapte BMD pour toi.
          </p>
        </div>

        {/* Liste verticale de cards larges (= tap-friendly mobile) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flex: 1,
          }}
        >
          {CHOICES.map((c) => (
            <button
              key={c.type}
              type="button"
              onClick={() => handlePick(c.type)}
              style={{
                background: "rgba(232,163,61,0.06)",
                border: "1px solid rgba(244,228,193,0.10)",
                borderRadius: 16,
                padding: "16px 14px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: "pointer",
                color: "inherit",
                fontFamily: "inherit",
                textAlign: "left",
                minHeight: 76,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div
                style={{
                  fontSize: 32,
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.15), rgba(181,70,46,0.08))",
                  border: "1px solid rgba(232,163,61,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {c.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#F4E4C1",
                    marginBottom: 2,
                  }}
                >
                  {c.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#A89A85",
                    lineHeight: 1.45,
                  }}
                >
                  {c.desc}
                </div>
              </div>
              <div
                aria-hidden
                style={{
                  fontSize: 18,
                  color: "var(--saffron, #e8a33d)",
                  opacity: 0.6,
                  flexShrink: 0,
                }}
              >
                →
              </div>
            </button>
          ))}
        </div>

        {/* Skip discret en bas */}
        <button
          type="button"
          onClick={handleSkip}
          style={{
            display: "block",
            margin: "20px auto 0",
            background: "transparent",
            border: "1px solid rgba(244,228,193,0.10)",
            color: "#8A7B6B",
            fontSize: 13,
            cursor: "pointer",
            padding: "12px 24px",
            borderRadius: 12,
            fontFamily: "inherit",
            minHeight: 44,
          }}
        >
          Pas tout de suite · explorer
        </button>
      </div>
    );
  }

  // === Variant DESKTOP : modal centré, grille 2-3 cols, plus aéré ===

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,11,20,0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 9990,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "calc(env(safe-area-inset-top, 0) + 24px) 16px calc(env(safe-area-inset-bottom, 0) + 24px)",
        overflowY: "auto",
        opacity: show ? 1 : 0,
        transition: "opacity 0.25s ease",
      }}
    >
      <div
        style={{
          background: "linear-gradient(180deg, #16111E 0%, #1F1429 100%)",
          border: "1px solid rgba(232,163,61,0.18)",
          borderRadius: 24,
          width: "100%",
          maxWidth: 580,
          padding: 28,
          color: "#F4E4C1",
          fontFamily:
            "'Inter', system-ui, -apple-system, sans-serif",
          maxHeight: "calc(100dvh - 48px)",
          overflowY: "auto",
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(232,163,61,0.05)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              color: "#C9A24A",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Bienvenue {userName ? `· ${userName}` : ""}
          </div>
          <h2
            id="onboarding-title"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 28,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.15,
              color: "#F4E4C1",
            }}
          >
            Tu es ici pour quoi&nbsp;?
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#E8D5B7",
              marginTop: 8,
              lineHeight: 1.6,
            }}
          >
            Choisis ton cas d'usage — on adapte tout : vocabulaire,
            suggestions, et type de groupe.
          </p>
        </div>

        {/* Grille des choix */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          {CHOICES.map((c) => (
            <button
              key={c.type}
              type="button"
              onClick={() => handlePick(c.type)}
              style={{
                background: "rgba(232,163,61,0.05)",
                border: "1px solid rgba(244,228,193,0.08)",
                borderRadius: 16,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                color: "inherit",
                fontFamily: "inherit",
                textAlign: "center",
                minHeight: 130,
                transition: "all 0.15s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "#E8A33D";
                e.currentTarget.style.background =
                  "rgba(232,163,61,0.1)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor =
                  "rgba(244,228,193,0.08)";
                e.currentTarget.style.background =
                  "rgba(232,163,61,0.05)";
              }}
            >
              <div style={{ fontSize: 32 }}>{c.icon}</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#F4E4C1",
                }}
              >
                {c.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#8A7B6B",
                  lineHeight: 1.4,
                }}
              >
                {c.desc}
              </div>
            </button>
          ))}
        </div>

        {/* Skip — pour les utilisateurs qui veulent juste explorer */}
        <button
          type="button"
          onClick={handleSkip}
          style={{
            display: "block",
            margin: "24px auto 0",
            background: "transparent",
            border: "none",
            color: "#8A7B6B",
            fontSize: 12,
            cursor: "pointer",
            textDecoration: "underline",
            padding: 8,
            minHeight: 36,
            fontFamily: "inherit",
          }}
        >
          Pas tout de suite · explorer d'abord
        </button>
      </div>
    </div>
  );
}
