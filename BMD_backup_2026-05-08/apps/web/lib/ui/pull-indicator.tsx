"use client";

/**
 * <PullIndicator> · Indicateur visuel du geste pull-to-refresh.
 *
 * Affiche une zone fixe en haut de la liste qui :
 *  - Apparait quand l'utilisateur tire vers le bas
 *  - Une icône qui rotate selon `progress` (0..1)
 *  - Dès que `armed` devient true, change de couleur (saffron) — feedback
 *    "tu peux lâcher maintenant"
 *  - Pendant `refreshing`, devient un spinner avec le logo BMD pulsant
 *
 * Conçu MOBILE-ONLY → utiliser conjointement avec usePullToRefresh().
 *
 * UX inspirée banque mobile : minimal, non-intrusif, signature BMD.
 */

import type { PullState } from "../use-pull-to-refresh";

interface Props extends PullState {
  /** Hauteur de l'indicateur — défaut 60px (~ standard iOS) */
  height?: number;
}

export function PullIndicator({
  pulling,
  progress,
  armed,
  refreshing,
  pullDistance,
  height = 60,
}: Props): JSX.Element | null {
  // Si rien ne se passe, on rend un placeholder à 0 px pour éviter de
  // décaler le layout
  if (!pulling && !refreshing) return null;

  const visibleHeight = Math.min(pullDistance, height);
  const opacity = Math.min(progress, 1);

  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: "100%",
        height: visibleHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transition: refreshing ? "height 0.2s" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          opacity,
          transition: "opacity 0.2s",
        }}
      >
        {refreshing ? (
          // Spinner pendant le fetch — petit logo BMD pulsant
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.20), rgba(181,70,46,0.10))",
              border: "1px solid rgba(232,163,61,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "bmd-ptr-spin 0.8s linear infinite",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bmd-logo.svg" alt="" width={22} height={22} />
          </div>
        ) : (
          // Flèche qui rotate — vers le bas au début, vers le haut une
          // fois armed (= "lâche pour rafraîchir")
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1.5px solid ${
                armed ? "var(--saffron, #e8a33d)" : "rgba(244,228,193,0.30)"
              }`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: armed ? "rotate(180deg)" : `rotate(${progress * 90}deg)`,
              transition: "transform 0.15s, border-color 0.15s",
              color: armed ? "var(--saffron)" : "var(--cream-soft)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: armed
              ? "var(--saffron, #e8a33d)"
              : "var(--cream-soft, #d4c4a8)",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontWeight: 700,
            transition: "color 0.15s",
          }}
        >
          {refreshing
            ? "Mise à jour…"
            : armed
              ? "Lâche pour rafraîchir"
              : "Tire pour rafraîchir"}
        </div>
      </div>
      <style jsx>{`
        @keyframes bmd-ptr-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
