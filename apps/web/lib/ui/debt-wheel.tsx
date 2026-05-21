"use client";

/**
 * V149.B — Roue de remboursement BMD (composant phare du module RDD).
 *
 * Conçue avec Fabrice (mai 2026). Idée : remplacer la barre de progression
 * banale par une roue circulaire où chaque segment représente une échéance.
 * C'est la même densité d'information qu'un tableau de bord de voiture :
 * un regard suffit pour savoir où on en est.
 *
 * Principes :
 *  1. Chaque échéance = un segment égal sur la couronne (s'adapte au contrat)
 *  2. État coloré encode tout :
 *      - vert plein     : payée + confirmée
 *      - saffron pulse  : en cours (prochaine échéance attendue)
 *      - gris           : à venir
 *      - terracotta     : en retard / défaut
 *  3. Pastilles sur le contour cliquables → ouvre détail échéance (écran 13)
 *
 * Tailles supportées :
 *  - small  (24-60 px)   : utilisée dans le Hub /dashboard/debts (carte liste)
 *  - large  (200-280 px) : utilisée dans le détail /dashboard/debts/[id]
 *
 * Le SVG s'adapte automatiquement au prop `size` (px).
 */

import type { CSSProperties } from "react";

export type DebtSegmentState =
  | "paid" // payée + confirmée (vert)
  | "current" // en cours / prochaine échéance (saffron pulsant)
  | "upcoming" // à venir (gris)
  | "late"; // en retard / manquée (terracotta)

export interface DebtWheelProps {
  /** Liste ordonnée des segments. Chaque entrée = 1 échéance. */
  segments: DebtSegmentState[];
  /** Taille du SVG (px). 24-60 = mini (hub), 200-280 = grand (détail). */
  size: number;
  /** Label optionnel au centre — gros chiffre / montant. */
  centerLabel?: string;
  /** Sous-label optionnel sous le label. */
  centerSubLabel?: string;
  /** Étiquette du label (au-dessus). */
  centerCaption?: string;
  /** Callback au tap d'un segment (index de l'échéance, 0-based). */
  onSegmentTap?: (index: number) => void;
  /** Style additionnel sur le wrapper. */
  style?: CSSProperties;
  /** ARIA label pour accessibilité. */
  ariaLabel?: string;
}

const COLORS = {
  paid: "#1F7A57", // emerald V45
  current: "#C58A2E", // saffron V45
  upcoming: "rgba(43,31,21,0.18)", // cocoa pâle
  late: "#9F4628", // terracotta V45
  trackBg: "rgba(43,31,21,0.06)", // fond de la couronne (sous les segments)
} as const;

/**
 * Convertit l'index d'un segment en coordonnées (x, y) sur le cercle.
 * Le segment 0 démarre en haut (12h) et tourne dans le sens horaire.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

/**
 * Trace l'arc SVG d'un segment entre deux angles.
 */
function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export function DebtWheel({
  segments,
  size,
  centerLabel,
  centerSubLabel,
  centerCaption,
  onSegmentTap,
  style,
  ariaLabel,
}: DebtWheelProps): JSX.Element {
  const n = Math.max(1, segments.length);
  const isLarge = size >= 120;
  // Stroke épaisseur proportionnelle à la taille : 4-14 px
  const strokeWidth = Math.max(4, Math.round(size * 0.06));
  const radius = size / 2 - strokeWidth / 2 - (isLarge ? 6 : 2);
  const cx = size / 2;
  const cy = size / 2;
  // Gap visuel entre segments (en degrés). Plus gros sur grande roue.
  const gapDeg = isLarge ? 4 : 2;
  const segDeg = 360 / n;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
        flexShrink: 0,
        ...style,
      }}
      role="img"
      aria-label={ariaLabel ?? `Suivi de remboursement : ${segments.filter((s) => s === "paid").length} sur ${n} échéances payées`}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        style={{ display: "block" }}
      >
        {/* Fond translucide de la couronne pour qu'on voie toujours l'anneau */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={COLORS.trackBg}
          strokeWidth={strokeWidth}
        />

        {/* Segments */}
        {segments.map((state, i) => {
          const startAngle = i * segDeg + gapDeg / 2;
          const endAngle = (i + 1) * segDeg - gapDeg / 2;
          const color = COLORS[state];
          const isCurrent = state === "current";
          const path = describeArc(cx, cy, radius, startAngle, endAngle);
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={
                isCurrent
                  ? {
                      animation: "bmd-wheel-pulse 2s ease-in-out infinite",
                    }
                  : undefined
              }
              onClick={onSegmentTap ? () => onSegmentTap(i) : undefined}
              cursor={onSegmentTap ? "pointer" : undefined}
            />
          );
        })}

        {/* Pastilles cliquables sur le contour (uniquement grande taille) */}
        {isLarge &&
          segments.map((state, i) => {
            const midAngle = i * segDeg + segDeg / 2;
            const { x, y } = polarToCartesian(cx, cy, radius, midAngle);
            const color = COLORS[state];
            const dotRadius = state === "current" ? 5 : 4;
            return (
              <circle
                key={`dot-${i}`}
                cx={x}
                cy={y}
                r={dotRadius}
                fill={state === "upcoming" ? "#FBF6EC" : color}
                stroke={state === "upcoming" ? color : color}
                strokeWidth={2}
                onClick={onSegmentTap ? () => onSegmentTap(i) : undefined}
                cursor={onSegmentTap ? "pointer" : undefined}
              />
            );
          })}
      </svg>

      {/* Centre : label + caption (uniquement grand size sinon trop chargé) */}
      {isLarge && (centerLabel || centerCaption || centerSubLabel) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            pointerEvents: "none",
            padding: strokeWidth + 12,
          }}
        >
          {centerCaption && (
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "#C58A2E",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {centerCaption}
            </div>
          )}
          {centerLabel && (
            <div
              className="bmd-num"
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: Math.round(size * 0.18),
                fontWeight: 500,
                color: "#2B1F15",
                lineHeight: 1,
              }}
            >
              {centerLabel}
            </div>
          )}
          {centerSubLabel && (
            <div
              style={{
                fontSize: 11,
                color: "#6B5A47",
                marginTop: 4,
                lineHeight: 1.3,
              }}
            >
              {centerSubLabel}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes bmd-wheel-pulse {
          0% { stroke-opacity: 1; }
          50% { stroke-opacity: 0.45; }
          100% { stroke-opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * Helper : à partir d'un tableau de schedules (issus de l'API), calcule le
 * tableau de DebtSegmentState attendu par DebtWheel.
 * Le segment "current" est attribué à la prochaine échéance PENDING
 * (la plus proche dans le futur, ou la plus récente si toutes en retard).
 */
export function schedulesToSegments(
  schedules: Array<{
    sequenceNumber: number;
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
    dueDate: string;
  }>,
): DebtSegmentState[] {
  if (!schedules.length) return [];
  const sorted = [...schedules].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber,
  );
  // Trouve l'index du "current" : 1ère échéance PENDING ou LATE
  const currentIdx = sorted.findIndex(
    (s) => s.status === "PENDING" || s.status === "LATE",
  );
  return sorted.map((s, i) => {
    if (s.status === "PAID" || s.status === "CONFIRMED") return "paid";
    if (s.status === "MISSED" || s.status === "LATE") return "late";
    if (i === currentIdx) return "current";
    return "upcoming";
  });
}
