"use client";

/**
 * V215.F3 — Roue circulaire de tontine, parité visuelle avec la vue mobile.
 *
 * Affiche les N membres en cercle, avec leur ordre de tour. Le bénéficiaire
 * du tour courant est mis en avant (saffron + pulsation). Les tours déjà
 * distribués sont marqués (vert). Cliquer sur un siège sélectionne le tour
 * correspondant (sortie callback).
 *
 * Self-contained — pas de dépendance externe, SVG pur, fonctionne en SSR.
 */

import { memo } from "react";

export interface WheelTurn {
  id: string;
  turnNumber: number;
  status: "PENDING" | "IN_PROGRESS" | "DISTRIBUTED" | "CANCELLED";
  beneficiary: { id: string; displayName: string };
}

export const TontineWheel = memo(function TontineWheel({
  turns,
  selectedTurnId,
  onSelectTurn,
  onHoverTurn,
  size = 280,
  meId,
}: {
  turns: WheelTurn[];
  selectedTurnId?: string | null;
  onSelectTurn?: (turnId: string) => void;
  // V233.B — Hover sur un siège : notifie le parent pour afficher le popover.
  // turnId=null = mouseleave d'un siège (le parent gère le delay close).
  onHoverTurn?: (turnId: string | null) => void;
  size?: number;
  meId?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const wheelRadius = size * 0.38;
  const seatRadius = size * 0.082;

  // Trouve le tour en cours (priorité IN_PROGRESS, sinon premier PENDING)
  const activeIdx =
    turns.findIndex((t) => t.status === "IN_PROGRESS") !== -1
      ? turns.findIndex((t) => t.status === "IN_PROGRESS")
      : turns.findIndex((t) => t.status === "PENDING");

  if (turns.length === 0) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--cream-soft)",
          fontSize: 13,
          opacity: 0.5,
        }}
      >
        Aucun tour
      </div>
    );
  }

  // Position de chaque siège sur le cercle (commence en haut, sens horaire)
  function seatPosition(idx: number) {
    const angle = (idx / turns.length) * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + wheelRadius * Math.cos(angle),
      y: cy + wheelRadius * Math.sin(angle),
    };
  }

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="Roue de tontine"
        style={{ display: "block" }}
      >
        {/* Anneau du fond */}
        <circle
          cx={cx}
          cy={cy}
          r={wheelRadius}
          fill="none"
          stroke="var(--line-soft, rgba(244,228,193,0.10))"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {/* Lignes reliant chaque siège au centre (effet rayons) */}
        {turns.map((_t, i) => {
          const p = seatPosition(i);
          return (
            <line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="rgba(244,228,193,0.04)"
              strokeWidth={0.8}
            />
          );
        })}

        {/* Sièges */}
        {turns.map((turn, i) => {
          const p = seatPosition(i);
          const isActive = i === activeIdx;
          const isDone = turn.status === "DISTRIBUTED";
          const isSelected = selectedTurnId === turn.id;
          const isMe = meId === turn.beneficiary.id;
          const fill = isDone
            ? "#10b981"
            : isActive
              ? "var(--saffron, #E8A33D)"
              : "rgba(244,228,193,0.08)";
          const stroke = isSelected
            ? "var(--saffron, #E8A33D)"
            : isActive
              ? "var(--gold, #C9A14A)"
              : "var(--line-soft, rgba(244,228,193,0.10))";
          return (
            <g
              key={turn.id}
              data-turn-id={turn.id}
              onClick={() => onSelectTurn?.(turn.id)}
              onMouseEnter={() => onHoverTurn?.(turn.id)}
              onMouseLeave={() => onHoverTurn?.(null)}
              style={{
                cursor: onSelectTurn ? "pointer" : "default",
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={seatRadius}
                fill={fill}
                stroke={stroke}
                strokeWidth={isSelected ? 2.5 : 1.5}
                style={{
                  transition: "all 0.18s ease",
                  filter: isActive
                    ? "drop-shadow(0 0 8px rgba(232,163,61,0.55))"
                    : undefined,
                }}
              />
              {isActive && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={seatRadius + 4}
                  fill="none"
                  stroke="var(--saffron, #E8A33D)"
                  strokeWidth={1}
                  opacity={0.5}
                >
                  <animate
                    attributeName="r"
                    from={seatRadius + 4}
                    to={seatRadius + 12}
                    dur="1.8s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.5"
                    to="0"
                    dur="1.8s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <text
                x={p.x}
                y={p.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={seatRadius * 0.85}
                fontWeight={700}
                fill={
                  isDone || isActive
                    ? "#16111e"
                    : "var(--cream, #f0e6d8)"
                }
                fontFamily="Cormorant Garamond, serif"
                style={{ pointerEvents: "none" }}
              >
                {turn.turnNumber}
              </text>
              {/* Label du nom sous le siège */}
              <text
                x={p.x}
                y={p.y + seatRadius + 12}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill={
                  isActive
                    ? "var(--saffron, #E8A33D)"
                    : "var(--cream-soft, #c9bfae)"
                }
                fontWeight={isActive ? 700 : 500}
                style={{ pointerEvents: "none" }}
              >
                {turn.beneficiary.displayName.split(" ")[0]}
                {isMe ? " (moi)" : ""}
              </text>
            </g>
          );
        })}

        {/* Centre : nombre de tours */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fill="var(--cream-soft, #c9bfae)"
          fontWeight={500}
          letterSpacing={1.5}
        >
          TONTINE
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={28}
          fontFamily="Cormorant Garamond, serif"
          fontWeight={700}
          fill="var(--saffron, #E8A33D)"
        >
          {turns.filter((t) => t.status === "DISTRIBUTED").length}/{turns.length}
        </text>
      </svg>
    </div>
  );
});
