"use client";

/**
 * V178.C — <DiscoveryTour /> · Tour découverte spotlight au premier login.
 *
 * Différent de <OnboardingTour /> (modale plein écran avec illustrations
 * abstraites) : ce composant projette un OVERLAY sombre avec un TROU clair
 * (spotlight SVG) sur chaque élément d'intérêt, et une tooltip narrative
 * positionnée à côté.
 *
 * Trigger : premier login après onboarding/intent (`bmd_discovery_tour_seen`
 * absent du localStorage). Ne se relance jamais après dismiss.
 *
 * Architecture :
 *  - Composant générique qui prend une liste de steps (selector CSS, title,
 *    body, placement). Mesure la position du target via getBoundingClientRect.
 *  - Si target introuvable, on saute au step suivant (résilience aux
 *    différences de DOM mobile/desktop).
 *  - Tooltip auto-placée : si target en bas de l'écran → tooltip au-dessus,
 *    sinon en dessous.
 *  - Skippable à tout moment via bouton "Passer".
 *  - Persiste dismiss via localStorage.
 *
 * V45-light strict (ivory, cocoa, saffron). Compatible mobile + desktop.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/app-strings";
import { haptic } from "../platform";

/** Clé localStorage. Différente de `bmd_tour_done` (OnboardingTour) pour
 *  permettre de coexister sans interférence. */
const TOUR_SEEN_KEY = "bmd_discovery_tour_seen";

export interface DiscoveryStep {
  /** Sélecteur CSS du DOM cible. Si absent ou introuvable → step "intro"
   *  centré plein écran (sans spotlight). */
  targetSelector?: string;
  /** Clé i18n du titre. */
  titleKey: string;
  /** Clé i18n du corps narratif. */
  bodyKey: string;
  /** Placement de la tooltip par rapport au target. Si "auto", on choisit
   *  selon la position verticale (top si target dans le bas, bottom sinon). */
  placement?: "top" | "bottom" | "auto" | "center";
  /** Icône optionnelle au-dessus du titre (emoji ou SVG inline). */
  icon?: React.ReactNode;
}

interface DiscoveryTourProps {
  /** Si true, force le tour à se lancer même s'il a déjà été vu (debug). */
  force?: boolean;
  /** Steps à parcourir. */
  steps: DiscoveryStep[];
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Hook d'orchestration du tour. Retourne l'état + callbacks pour le
 * monter conditionnellement.
 */
export function useDiscoveryTour() {
  const [seen, setSeen] = useState<boolean>(true); // par défaut "vu" pour éviter le flash
  useEffect(() => {
    try {
      setSeen(Boolean(window.localStorage.getItem(TOUR_SEEN_KEY)));
    } catch {
      /* mode privé Safari — on considère "vu" pour ne pas spammer */
    }
  }, []);
  return {
    seen,
    dismiss() {
      try {
        window.localStorage.setItem(TOUR_SEEN_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      setSeen(true);
    },
  };
}

export function DiscoveryTour({ force = false, steps }: DiscoveryTourProps) {
  const t = useT();
  const { seen, dismiss } = useDiscoveryTour();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const visible = force || !seen;
  const step = steps[stepIndex];

  // Mesure du target courant à chaque step (et au resize).
  useEffect(() => {
    if (!visible || !step) return;
    function measure() {
      if (!step.targetSelector) {
        setTargetRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(step.targetSelector);
      if (!el) {
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTargetRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    }
    measure();
    // Re-mesure sur resize / scroll (le target peut bouger).
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    // Re-mesure légère après 200ms pour laisser le DOM se stabiliser
    // (animations entrée page).
    const t = setTimeout(measure, 200);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      clearTimeout(t);
    };
  }, [visible, step, stepIndex]);

  // Détermine le placement effectif de la tooltip.
  const placement = useMemo<"top" | "bottom" | "center">(() => {
    if (!step) return "center";
    if (step.placement === "center" || !targetRect) return "center";
    if (step.placement === "top") return "top";
    if (step.placement === "bottom") return "bottom";
    // auto : si target dans le tiers bas → tooltip au-dessus, sinon en dessous
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    if (targetRect.top > vh * 0.55) return "top";
    return "bottom";
  }, [step, targetRect]);

  if (!visible || !step) return null;

  const isLast = stepIndex === steps.length - 1;

  function next() {
    haptic("tap");
    if (isLast) {
      haptic("success");
      dismiss();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function skip() {
    haptic("tap");
    dismiss();
  }

  // === Géométrie du spotlight ===
  // On dessine une grande forme SVG qui couvre tout l'écran SAUF le rect
  // du target (trou clair pour mettre en valeur). Padding 8px autour du
  // target pour respirer.
  const PAD = 8;
  const radius = 14;
  const overlayBg = "rgba(43,31,21,0.62)"; // cocoa transparent — palette V45

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bmd-discovery-tour-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1600,
        pointerEvents: "auto",
        animation: "bmd-discovery-fade 0.25s ease-out",
      }}
    >
      {/* Overlay sombre + spotlight SVG */}
      {targetRect ? (
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <defs>
            <mask id="discovery-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.left - PAD}
                y={targetRect.top - PAD}
                width={targetRect.width + PAD * 2}
                height={targetRect.height + PAD * 2}
                rx={radius}
                ry={radius}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill={overlayBg}
            mask="url(#discovery-spotlight-mask)"
          />
          {/* Ring saffron animé autour du spotlight pour guider l'œil */}
          <rect
            x={targetRect.left - PAD}
            y={targetRect.top - PAD}
            width={targetRect.width + PAD * 2}
            height={targetRect.height + PAD * 2}
            rx={radius}
            ry={radius}
            fill="none"
            stroke="rgba(197,138,46,0.75)"
            strokeWidth={2}
            style={{ filter: "drop-shadow(0 0 6px rgba(197,138,46,0.55))" }}
          />
        </svg>
      ) : (
        // Pas de target → overlay plein écran sombre uni (steps "intro/final")
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: overlayBg,
          }}
        />
      )}

      {/* Bouton "Passer" en haut à droite, toujours visible */}
      <button
        type="button"
        onClick={skip}
        aria-label={t("discoveryTour.skip")}
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 14px)",
          right: 14,
          padding: "8px 14px",
          background: "rgba(251,246,236,0.92)",
          color: "var(--cocoa, #2B1F15)",
          border: "1px solid rgba(43,31,21,0.10)",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          boxShadow: "0 2px 8px rgba(43,31,21,0.12)",
        }}
      >
        {t("discoveryTour.skip")}
      </button>

      {/* Tooltip narrative */}
      <div
        ref={tooltipRef}
        style={tooltipStyle(placement, targetRect)}
      >
        {step.icon && (
          <div
            style={{
              fontSize: 28,
              lineHeight: 1,
              marginBottom: 10,
            }}
          >
            {step.icon}
          </div>
        )}
        <div
          id="bmd-discovery-tour-title"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            marginBottom: 8,
            lineHeight: 1.2,
          }}
        >
          {t(step.titleKey)}
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--cocoa-soft, #6B5A47)",
            marginBottom: 18,
          }}
        >
          {t(step.bodyKey)}
        </div>

        {/* Progression + actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 5,
              flex: "0 0 auto",
            }}
            aria-hidden
          >
            {steps.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === stepIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 6,
                  background:
                    i === stepIndex
                      ? "var(--v45-saffron, #C58A2E)"
                      : "rgba(43,31,21,0.18)",
                  transition: "width 0.25s ease",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            style={{
              padding: "10px 18px",
              background: "var(--v45-saffron, #C58A2E)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              boxShadow: "0 4px 14px rgba(197,138,46,0.32)",
            }}
          >
            {isLast ? t("discoveryTour.finish") : t("discoveryTour.next")}
          </button>
        </div>
      </div>

      {/* Keyframes */}
      <style jsx>{`
        @keyframes bmd-discovery-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Géométrie tooltip
// ---------------------------------------------------------------------------

function tooltipStyle(
  placement: "top" | "bottom" | "center",
  targetRect: TargetRect | null,
): React.CSSProperties {
  // Largeur visée : 92% de la viewport en mobile, max 380px desktop.
  const base: React.CSSProperties = {
    position: "absolute",
    background:
      "linear-gradient(140deg, var(--paper, #FFFFFF) 0%, var(--ivory, #FBF6EC) 100%)",
    border: "1px solid rgba(197,138,46,0.30)",
    borderRadius: 20,
    padding: "20px 22px 18px",
    width: "min(92vw, 380px)",
    maxWidth: "calc(100vw - 24px)",
    color: "var(--cocoa, #2B1F15)",
    boxShadow: "0 24px 60px rgba(43,31,21,0.32)",
    animation: "bmd-discovery-fade 0.28s ease-out",
    boxSizing: "border-box",
  };

  if (placement === "center" || !targetRect) {
    return {
      ...base,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  // Tooltip alignée horizontalement sur le center du target, clampée au
  // viewport (12px de marge de sécurité).
  const SAFE = 12;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const tooltipMaxWidth =
    typeof window !== "undefined"
      ? Math.min(380, window.innerWidth - SAFE * 2)
      : 360;
  let left = targetCenterX - tooltipMaxWidth / 2;
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  if (left < SAFE) left = SAFE;
  if (left + tooltipMaxWidth > vw - SAFE) left = vw - SAFE - tooltipMaxWidth;

  if (placement === "top") {
    // Au-dessus du target.
    return {
      ...base,
      bottom:
        (typeof window !== "undefined" ? window.innerHeight : 800) -
        targetRect.top +
        14,
      left,
      width: tooltipMaxWidth,
      transform: "none",
    };
  }
  // bottom
  return {
    ...base,
    top: targetRect.top + targetRect.height + 14,
    left,
    width: tooltipMaxWidth,
    transform: "none",
  };
}

// ---------------------------------------------------------------------------
// Steps "stock" pour le dashboard premier login
// ---------------------------------------------------------------------------

/** Steps par défaut pour le tour découverte BMD. */
export const DEFAULT_DISCOVERY_STEPS: DiscoveryStep[] = [
  {
    // Étape 1 — Bienvenue plein écran (pas de target)
    titleKey: "discoveryTour.step1.title",
    bodyKey: "discoveryTour.step1.body",
    placement: "center",
  },
  {
    // Étape 2 — Bouton "Créer un groupe"
    targetSelector: "[data-tour='create-group']",
    titleKey: "discoveryTour.step2.title",
    bodyKey: "discoveryTour.step2.body",
    placement: "auto",
  },
  {
    // Étape 3 — Onglet RDD du bottom-nav
    targetSelector: "[data-tour='nav-debts']",
    titleKey: "discoveryTour.step3.title",
    bodyKey: "discoveryTour.step3.body",
    placement: "top",
  },
  {
    // Étape 4 — FAB IA central
    targetSelector: "[data-tour='fab-ia']",
    titleKey: "discoveryTour.step4.title",
    bodyKey: "discoveryTour.step4.body",
    placement: "top",
  },
  {
    // Étape 5 — Cloche notifications
    targetSelector: "[data-tour='notif-bell']",
    titleKey: "discoveryTour.step5.title",
    bodyKey: "discoveryTour.step5.body",
    placement: "bottom",
  },
  {
    // Étape 6 — Avatar header
    targetSelector: "[data-tour='header-avatar']",
    titleKey: "discoveryTour.step6.title",
    bodyKey: "discoveryTour.step6.body",
    placement: "bottom",
  },
  {
    // Étape 7 — Final plein écran
    titleKey: "discoveryTour.step7.title",
    bodyKey: "discoveryTour.step7.body",
    placement: "center",
  },
];
