"use client";

/**
 * V52.B8 — SplitDonut · composant signature V45 (cf. AUDIT-V45-VS-PROD.md
 * écran 9 « Donut split interactif » — game-changer identifié).
 *
 * Visualisation interactive de la répartition d'une dépense entre N
 * participants :
 *  - SVG 240×240 avec arcs colorés (palette 4-couleurs V45 saffron/indigo/
 *    emerald/rose, cycle au-delà de 4 participants)
 *  - Poignées circulaires draggables (pointer events) sur le pourtour qui
 *    permettent de redistribuer entre arcs adjacents en glissant
 *  - Centre : "Total partagé" + valeur Cormorant Garamond 32px + sub
 *    "÷ N personnes"
 *  - Légende verticale 1 row par participant : dot couleur + nom +
 *    montant tabular + pct muted
 *  - Tap sur un nom (légende) → exclure le participant (callback)
 *
 * Le composant est CONTROLLED : il ne stocke rien, juste calcule l'UI à
 * partir des props et notifie l'appelant via `onChange` quand l'user
 * drag une poignée ou tap-pour-exclure.
 *
 * Spec maquette V45 lignes 3061-3143 (`BMD-V45-mockups-clair.html`).
 *
 * Usage :
 *   <SplitDonut
 *     members={[{id:"a",name:"Linda",isActive:true},...]}
 *     total={87.4}
 *     shares={{ a: 25, b: 25, c: 25, d: 25 }}  // pct, somme = 100
 *     currency="EUR"
 *     onChange={(next) => setShares(next)}
 *     onToggleExclude={(id) => toggleParticipant(id)}
 *   />
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";

/** Palette 4-couleurs V45 pour les arcs (rotation au-delà de 4 participants). */
const ARC_COLORS = [
  "var(--v45-saffron, #C58A2E)",
  "var(--v45-indigo, #4458B5)",
  "var(--v45-emerald, #4F8E6E)",
  "var(--v45-rose, #C2563D)",
] as const;

/** Hex versions explicites des couleurs (pour les `fill` SVG qui ne supportent pas `var()`). */
const ARC_COLORS_HEX = ["#C58A2E", "#4458B5", "#4F8E6E", "#C2563D"] as const;

/** Configuration géométrique du donut (en unités SVG, viewBox 240×240). */
const DONUT = {
  size: 240,
  cx: 120,
  cy: 120,
  outerRadius: 96,
  innerRadius: 70, // épaisseur de l'anneau : 26 unités
  handleRadius: 8,
} as const;

/** Constante : circonférence du cercle pour calcul des dash-arrays. */
const CIRCUMFERENCE = 2 * Math.PI * ((DONUT.outerRadius + DONUT.innerRadius) / 2);

export interface SplitDonutMember {
  /** Identifiant stable du membre. */
  id: string;
  /** Nom affiché dans la légende. */
  name: string;
  /** false = participant exclu de la répartition (gardé dans la liste mais grisé). */
  isActive: boolean;
}

export interface SplitDonutProps {
  /** Liste complète des membres (actifs et exclus). Au moins 1 actif requis. */
  members: SplitDonutMember[];
  /** Montant total à répartir, en unité monétaire (ex : 87.4 pour 87,40 €). */
  total: number;
  /** Map userId → pct (somme des pcts des actifs doit valoir 100, normalisée automatiquement). */
  shares: Record<string, number>;
  /** Devise pour formater les montants (ex : "EUR", "XAF"). Utilise useCurrency() si absent. */
  currency?: string;
  /** Appelé à chaque drag end avec les nouveaux shares normalisés à 100 %. */
  onChange: (nextShares: Record<string, number>) => void;
  /** Optionnel : appelé au tap sur un nom dans la légende pour basculer isActive. */
  onToggleExclude?: (userId: string) => void;
  /** Désactive l'interaction drag (preview only, busy state). */
  disabled?: boolean;
  /** Classe CSS sur le wrapper. */
  className?: string;
  /** Style inline sur le wrapper. */
  style?: CSSProperties;
}

/**
 * Calcule pour chaque membre actif :
 *  - sa part en pct (normalisée)
 *  - son arc start/end (en radians, 0 = top = 12h, sens horaire)
 *  - sa couleur (rotation 4-tons)
 *  - son montant en devise
 */
interface ArcInfo {
  member: SplitDonutMember;
  pct: number;
  startRad: number;
  endRad: number;
  midRad: number;
  color: string;
  colorHex: string;
  amount: number;
}

function buildArcs(
  members: SplitDonutMember[],
  shares: Record<string, number>,
  total: number,
): ArcInfo[] {
  const active = members.filter((m) => m.isActive);
  if (active.length === 0) return [];

  // Somme des shares actifs (pour normaliser à 100%).
  const sum =
    active.reduce((acc, m) => acc + Math.max(0, shares[m.id] ?? 0), 0) || 1;

  // Construit les arcs en commençant à -π/2 (top du cercle, 12h).
  let cursor = -Math.PI / 2;
  const arcs: ArcInfo[] = [];
  active.forEach((member, idx) => {
    const rawPct = ((shares[member.id] ?? 0) / sum) * 100;
    const pct = Math.max(0, rawPct);
    const arcLen = (pct / 100) * 2 * Math.PI;
    const startRad = cursor;
    const endRad = cursor + arcLen;
    const midRad = (startRad + endRad) / 2;
    const colorIdx = idx % ARC_COLORS.length;
    arcs.push({
      member,
      pct,
      startRad,
      endRad,
      midRad,
      color: ARC_COLORS[colorIdx],
      colorHex: ARC_COLORS_HEX[colorIdx],
      amount: (pct / 100) * total,
    });
    cursor = endRad;
  });
  return arcs;
}

/**
 * Convertit (angle en radians, rayon) → coordonnée (x, y) sur le SVG.
 * Origine au centre, sens horaire (CSS canvas convention).
 */
function polarToCartesian(rad: number, radius: number): { x: number; y: number } {
  return {
    x: DONUT.cx + radius * Math.cos(rad),
    y: DONUT.cy + radius * Math.sin(rad),
  };
}

/**
 * Construit l'attribut SVG `d` d'un arc (path commands : M, A, ...).
 *
 * Cas spécial : si l'arc fait 100% (un seul participant), on dessine un
 * cercle complet via 2 arcs A consécutifs (SVG ne supporte pas un arc
 * de 360° en une seule commande).
 */
function buildArcPath(startRad: number, endRad: number, radius: number): string {
  const start = polarToCartesian(startRad, radius);
  const end = polarToCartesian(endRad, radius);
  const arcSweep = endRad - startRad;
  const largeArc = arcSweep > Math.PI ? 1 : 0;

  // Cas dégénéré : arc complet (>= 2π−ε) → on coupe en 2 demi-cercles
  if (arcSweep >= 2 * Math.PI - 0.0001) {
    const mid = polarToCartesian(startRad + Math.PI, radius);
    return [
      `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
      `A ${radius} ${radius} 0 0 1 ${mid.x.toFixed(3)} ${mid.y.toFixed(3)}`,
      `A ${radius} ${radius} 0 0 1 ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    ].join(" ");
  }

  return [
    `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
  ].join(" ");
}

/** Format pct avec 0 ou 1 décimale (selon valeur). */
function formatPct(pct: number): string {
  if (Math.abs(pct - Math.round(pct)) < 0.05) return `${Math.round(pct)} %`;
  return `${pct.toFixed(1)} %`;
}

export function SplitDonut({
  members,
  total,
  shares,
  currency,
  onChange,
  onToggleExclude,
  disabled = false,
  className,
  style,
}: SplitDonutProps) {
  const t = useT();
  const { formatAmount, code: defaultCurrency } = useCurrency();
  const activeCurrency = currency ?? defaultCurrency;
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Index du handle actuellement draggé (entre les arcs i et i+1).
  const [dragHandleIdx, setDragHandleIdx] = useState<number | null>(null);

  // Recompute arcs à chaque changement de shares.
  const arcs = useMemo(
    () => buildArcs(members, shares, total),
    [members, shares, total],
  );

  /**
   * Convertit (clientX, clientY) en angle radian relatif au centre du SVG.
   * Le SVG peut être à n'importe quelle position de page — on lit son bbox.
   */
  function clientPointToAngle(clientX: number, clientY: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    // Conversion px → unités SVG : on suppose viewBox 240×240, scale uniforme.
    const scaleX = DONUT.size / rect.width;
    const scaleY = DONUT.size / rect.height;
    const svgX = (clientX - rect.left) * scaleX;
    const svgY = (clientY - rect.top) * scaleY;
    const dx = svgX - DONUT.cx;
    const dy = svgY - DONUT.cy;
    return Math.atan2(dy, dx); // [-π, π]
  }

  /**
   * Démarre un drag d'un handle (frontière entre l'arc `idx` et `idx+1`).
   * Capture les pointer events sur le SVG pour suivre le mouvement même
   * si le pointeur sort de la handle (UX standard).
   */
  function handlePointerDown(e: React.PointerEvent<SVGCircleElement>, idx: number): void {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    setDragHandleIdx(idx);
  }

  /**
   * Pointer move : recalcule le pct redistribué entre arc `i` et `i+1`
   * en fonction de l'angle courant.
   */
  function handlePointerMove(e: React.PointerEvent<SVGCircleElement>): void {
    if (dragHandleIdx === null || disabled) return;
    const idx = dragHandleIdx;
    const angle = clientPointToAngle(e.clientX, e.clientY);
    if (angle === null) return;

    // L'angle de la handle correspond à la fin de l'arc `idx`.
    // On veut donc déplacer cette fin → ajuster les pcts des arcs i et i+1.
    const idxNext = (idx + 1) % arcs.length;
    const arcI = arcs[idx];
    const arcJ = arcs[idxNext];
    if (!arcI || !arcJ) return;

    // Total des 2 pcts qu'on va redistribuer (constant pendant le drag).
    const combinedPct = arcI.pct + arcJ.pct;
    const totalArcRad = ((arcI.pct + arcJ.pct) / 100) * 2 * Math.PI;

    // Position de la frontière draggée : entre arcI.startRad et arcJ.endRad
    // On clamp angle dans [arcI.startRad + ε, arcJ.endRad - ε] pour éviter
    // qu'un arc disparaisse complètement (UX : minimum 1% par participant).
    const minSlice = (1 / 100) * 2 * Math.PI; // 1% mini
    const lo = arcI.startRad + minSlice;
    const hi = arcJ.endRad - minSlice;
    // Normalise `angle` dans le segment angulaire concerné (gestion du wrap)
    let normalized = angle;
    while (normalized < lo - Math.PI) normalized += 2 * Math.PI;
    while (normalized > hi + Math.PI) normalized -= 2 * Math.PI;
    const clamped = Math.max(lo, Math.min(hi, normalized));

    // Calcul des nouveaux pcts proportionnels au nouvel angle frontière
    const newArcILen = clamped - arcI.startRad;
    const newPctI = (newArcILen / totalArcRad) * combinedPct;
    const newPctJ = combinedPct - newPctI;

    // Reconstruit le map shares en remplaçant les 2 valeurs touchées.
    const next: Record<string, number> = { ...shares };
    next[arcI.member.id] = newPctI;
    next[arcJ.member.id] = newPctJ;
    onChange(next);
  }

  function handlePointerUp(e: React.PointerEvent<SVGCircleElement>): void {
    if (dragHandleIdx === null) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragHandleIdx(null);
  }

  // Empêche le scroll de page pendant un drag sur le SVG (mobile).
  useEffect(() => {
    if (dragHandleIdx === null) return;
    const preventScroll = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", preventScroll, { passive: false });
    return () => document.removeEventListener("touchmove", preventScroll);
  }, [dragHandleIdx]);

  const activeCount = members.filter((m) => m.isActive).length;
  const centerLabel = t("donut.title") || "Total partagé";
  const centerSub =
    t("donut.subtitle", { count: String(activeCount) }) ||
    `÷ ${activeCount} ${activeCount === 1 ? "personne" : "personnes"}`;
  const hint =
    t("donut.hint") ||
    "Drag les poignées pour redistribuer · Tap un nom pour exclure";

  return (
    <div className={className} style={{ width: "100%", ...style }}>
      <div
        style={{
          position: "relative",
          width: DONUT.size,
          maxWidth: "100%",
          margin: "0 auto",
        }}
      >
        <svg
          ref={svgRef}
          width={DONUT.size}
          height={DONUT.size}
          viewBox={`0 0 ${DONUT.size} ${DONUT.size}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{
            display: "block",
            touchAction: dragHandleIdx !== null ? "none" : "manipulation",
            userSelect: "none",
          }}
          aria-label={centerLabel}
        >
          {/* Anneau de fond (donut total) */}
          <circle
            cx={DONUT.cx}
            cy={DONUT.cy}
            r={(DONUT.outerRadius + DONUT.innerRadius) / 2}
            fill="none"
            stroke="var(--v45-line, rgba(43,31,21,0.08))"
            strokeWidth={DONUT.outerRadius - DONUT.innerRadius}
          />

          {/* Arcs colorés par participant */}
          {arcs.map((arc) => (
            <path
              key={`arc-${arc.member.id}`}
              d={buildArcPath(
                arc.startRad,
                arc.endRad,
                (DONUT.outerRadius + DONUT.innerRadius) / 2,
              )}
              fill="none"
              stroke={arc.colorHex}
              strokeWidth={DONUT.outerRadius - DONUT.innerRadius}
              strokeLinecap="butt"
              opacity={arc.pct < 0.5 ? 0.5 : 1}
            />
          ))}

          {/* Poignées draggables aux frontières des arcs (entre arc i et i+1) */}
          {arcs.length > 1 &&
            arcs.map((arc, idx) => {
              const handlePos = polarToCartesian(
                arc.endRad,
                (DONUT.outerRadius + DONUT.innerRadius) / 2,
              );
              const isDragging = dragHandleIdx === idx;
              return (
                <circle
                  key={`handle-${idx}`}
                  cx={handlePos.x}
                  cy={handlePos.y}
                  r={isDragging ? DONUT.handleRadius + 2 : DONUT.handleRadius}
                  fill="var(--paper, #FFFFFF)"
                  stroke={arc.colorHex}
                  strokeWidth={2.5}
                  style={{
                    cursor: disabled ? "default" : "grab",
                    filter:
                      "drop-shadow(0 2px 4px rgba(43,31,21,0.15)) drop-shadow(0 1px 2px rgba(43,31,21,0.08))",
                    transition: isDragging ? "none" : "r 0.15s ease",
                  }}
                  onPointerDown={(e) => handlePointerDown(e, idx)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  role="slider"
                  aria-label={`Redistribuer entre ${arc.member.name} et ${arcs[(idx + 1) % arcs.length].member.name}`}
                  aria-valuenow={Math.round(arc.pct)}
                  aria-valuemin={1}
                  aria-valuemax={99}
                />
              );
            })}

          {/* Centre : label + montant Cormorant + sub */}
          <text
            x={DONUT.cx}
            y={DONUT.cy - 14}
            textAnchor="middle"
            fontSize={10}
            fontWeight={500}
            fill="var(--cocoa-mute, #A99580)"
            style={{
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          >
            {centerLabel}
          </text>
          <text
            x={DONUT.cx}
            y={DONUT.cy + 14}
            textAnchor="middle"
            fontSize={32}
            fontWeight={600}
            fill="var(--cocoa, #2B1F15)"
            style={{
              fontFamily: "Cormorant Garamond, Georgia, serif",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatAmount(total, activeCurrency)}
          </text>
          <text
            x={DONUT.cx}
            y={DONUT.cy + 32}
            textAnchor="middle"
            fontSize={11}
            fontWeight={500}
            fill="var(--v45-saffron, #C58A2E)"
            style={{ letterSpacing: 0.3, fontFamily: "inherit" }}
          >
            {centerSub}
          </text>
        </svg>
      </div>

      {/* Hint italique sous le donut */}
      <p
        style={{
          marginTop: 12,
          marginBottom: 12,
          textAlign: "center",
          fontSize: 12,
          color: "var(--cocoa-soft, #6B5A47)",
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
      >
        {hint}
      </p>

      {/* Légende stack : 1 row par membre (actif ou exclu) */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {members.map((member, memberIdx) => {
          const arc = arcs.find((a) => a.member.id === member.id);
          const colorHex =
            ARC_COLORS_HEX[memberIdx % ARC_COLORS_HEX.length];
          const isClickable =
            !disabled && typeof onToggleExclude === "function";
          return (
            <li
              key={member.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 4px",
                cursor: isClickable ? "pointer" : "default",
                opacity: member.isActive ? 1 : 0.45,
                transition: "opacity 0.15s ease",
              }}
              onClick={() => {
                if (isClickable) onToggleExclude?.(member.id);
              }}
              role={isClickable ? "button" : undefined}
              aria-pressed={isClickable ? !member.isActive : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (isClickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onToggleExclude?.(member.id);
                }
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: member.isActive ? colorHex : "transparent",
                  border: `2px solid ${colorHex}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--cocoa, #2B1F15)",
                  textDecoration: member.isActive ? "none" : "line-through",
                }}
              >
                {member.name}
              </span>
              {arc ? (
                <>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--cocoa, #2B1F15)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAmount(arc.amount, activeCurrency)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--cocoa-mute, #A99580)",
                      minWidth: 44,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatPct(arc.pct)}
                  </span>
                </>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--cocoa-mute, #A99580)",
                    fontStyle: "italic",
                  }}
                >
                  {t("donut.excluded") || "Exclu"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
