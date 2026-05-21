"use client";

/**
 * V223.B — DebtConstellationView · « Carte des dettes » polish lisibilité
 * ============================================================================
 * Composant SVG inventif (option A maquette validée) pour visualiser d'un coup
 * d'œil les soldes nets et les transferts optimaux d'un groupe.
 *
 *  - Centre : cercle cream `var(--cream)` (r=48) + texte "SOLDE GROUPE"
 *    + montant total à équilibrer (= somme des |dettes nettes|).
 *  - Autour : les membres avec balance non nulle, positionnés en cercle :
 *    `angle = (i / N) * 2π`. Fond avatar par signe :
 *      • positif (créditeur) → sage `#1F7A57`
 *      • négatif (débiteur)  → terracotta `#9F4628`
 *      • neutre              → masqué (réduit le bruit)
 *  - Arcs de Bézier quadratique entre membres pour chaque transfert optimal
 *    fourni par `settlements` (sortie de l'algo greedy). Épaisseur ∝ √montant.
 *    Couleur : saffron pour les petits flux, terracotta pour les gros. Une
 *    flèche `marker-end` indique le sens fromUser → toUser. Le montant est
 *    inscrit en monospace au milieu de la courbe.
 *
 * V223.B — Amélioration lisibilité :
 *   - Légende en haut : "→ doit" (terracotta) · "← est dû" (sage).
 *   - Tooltip HTML au survol d'un avatar : nom + balance + résumé flèches.
 *     Style cocoa sur cream pour rester light-friendly (le tooltip lui-même
 *     est foncé pour contraster sur le fond clair de la carte — le seul
 *     endroit où on accepte ce contraste, c'est un overlay temporaire).
 *   - Au survol, les arcs non connectés passent à opacity 0.3.
 *   - Petits numéros (1, 2, 3…) à côté de chaque arc, en sync avec le plan
 *     optimal à droite.
 *
 * V45-light only. Pas de dépendance externe (pas de d3, etc.) — tout SVG inline.
 */

import { useMemo, useState, useRef } from "react";
import { AvatarColored } from "./avatar-colored";

export interface ConstellationMember {
  id: string;
  displayName: string;
  photoUrl?: string | null;
}

export interface ConstellationSettlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export function DebtConstellationView({
  members,
  balances,
  settlements,
  currency,
  formatAmount,
  emptyLabel,
  centerLabel,
  showAllLabel,
  collapseLabel,
  legendOwesLabel,
  legendOwedLabel,
  formatOwesText,
  formatOwedText,
}: {
  members: ConstellationMember[];
  balances: Map<string, number>;
  settlements: ConstellationSettlement[];
  currency: string;
  formatAmount: (amount: number, currency: string) => string;
  /** Texte affiché si rien à régler. */
  emptyLabel: string;
  /** Petit label cocoa centre du cercle. */
  centerLabel: string;
  /** Bouton "Voir tout" (mode dense). */
  showAllLabel: string;
  /** Bouton "Réduire". */
  collapseLabel: string;
  /** V223.B — Légende "→ doit" */
  legendOwesLabel?: string;
  /** V223.B — Légende "← est dû" */
  legendOwedLabel?: string;
  /**
   * V225.A — Callbacks qui retournent le texte « Doit à <Nom> » prêt à
   * afficher. Plus de template à interpoler ici : c'est le parent qui appelle
   * `t("group.debts.tooltipOwes", { to, amount })` et passe la fonction.
   * Single-source-of-truth pour le système d'i18n BMD (`{x}` single-brace).
   */
  formatOwesText?: (toName: string, amount: string) => string;
  /** V225.A — Idem pour « Reçoit de <Nom> ». */
  formatOwedText?: (fromName: string, amount: string) => string;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  // V223.B — Hover state (id du membre survolé)
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // V223.B — Position du tooltip (relative au conteneur)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Ne garder que les membres avec un solde net non nul (epsilon < 0.01)
  const EPS = 0.005;
  const activeMembers = useMemo(
    () =>
      members.filter((m) => {
        const b = balances.get(m.id) ?? 0;
        return Math.abs(b) >= EPS;
      }),
    [members, balances],
  );

  // V222.F — Détermine quels transferts on rend. Si > 6 actifs et pas
  // expanded → top-5 par montant décroissant.
  const transfersToRender = useMemo(() => {
    const sorted = [...settlements].sort((a, b) => b.amount - a.amount);
    if (activeMembers.length > 6 && !expanded) return sorted.slice(0, 5);
    return sorted;
  }, [settlements, activeMembers.length, expanded]);

  const totalToBalance = useMemo(() => {
    // Somme des dettes nettes (= somme des balances positives = -somme négatives)
    let s = 0;
    for (const b of balances.values()) if (b > 0) s += b;
    return s;
  }, [balances]);

  // === Layout SVG ===
  const SIZE = 360; // viewBox 360×360 px (responsive via 100%)
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RING_RADIUS = 130; // distance centre → avatar
  const CENTER_RADIUS = 48; // cercle solde groupe
  const AVATAR_SIZE = 44;

  // Calcule positions (id → {x, y, angle, balance})
  const positions = useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; angle: number; balance: number; name: string }
    >();
    const N = activeMembers.length;
    if (N === 0) return map;
    activeMembers.forEach((m, i) => {
      // -π/2 pour démarrer en haut
      const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
      const x = CX + RING_RADIUS * Math.cos(angle);
      const y = CY + RING_RADIUS * Math.sin(angle);
      map.set(m.id, {
        x,
        y,
        angle,
        balance: balances.get(m.id) ?? 0,
        name: m.displayName,
      });
    });
    return map;
  }, [activeMembers, balances]);

  // V223.B — Pré-calcul des flux entrants/sortants par membre pour tooltip.
  const flowsByMember = useMemo(() => {
    const out = new Map<
      string,
      { owes: ConstellationSettlement[]; owed: ConstellationSettlement[] }
    >();
    for (const m of activeMembers) {
      out.set(m.id, { owes: [], owed: [] });
    }
    for (const s of settlements) {
      const fromBucket = out.get(s.fromUserId);
      if (fromBucket) fromBucket.owes.push(s);
      const toBucket = out.get(s.toUserId);
      if (toBucket) toBucket.owed.push(s);
    }
    return out;
  }, [activeMembers, settlements]);

  // V223.B — Numéros 1..N par transfert (= ordre du plan optimal à droite)
  const transferNumberById = useMemo(() => {
    const map = new Map<string, number>();
    transfersToRender.forEach((s, i) => {
      map.set(`${s.fromUserId}-${s.toUserId}`, i + 1);
    });
    return map;
  }, [transfersToRender]);

  function nameOf(userId: string): string {
    return (
      members.find((m) => m.id === userId)?.displayName ??
      activeMembers.find((m) => m.id === userId)?.displayName ??
      "—"
    );
  }

  // V223.B — Hover handlers : track la souris pour positionner le tooltip
  // près du curseur sans dépasser le container.
  function handleAvatarMouseEnter(memberId: string, evt: React.MouseEvent) {
    setHoveredId(memberId);
    updateTooltipPos(evt);
  }

  function updateTooltipPos(evt: React.MouseEvent) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    setTooltipPos({ x, y });
  }

  function handleAvatarMouseLeave() {
    setHoveredId(null);
    setTooltipPos(null);
  }

  // Empty state
  if (activeMembers.length === 0) {
    return (
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid #D9C8A6",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "#6B5A47",
          fontSize: 14,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        {emptyLabel}
      </div>
    );
  }

  // Épaisseur ∝ √amount, normalisée sur le max
  const maxAmount = Math.max(1, ...transfersToRender.map((s) => s.amount));
  function strokeWidthFor(amount: number): number {
    const ratio = Math.sqrt(amount / maxAmount);
    return Math.max(1.5, ratio * 6);
  }

  const hoveredFlows = hoveredId ? flowsByMember.get(hoveredId) : null;
  const hoveredBalance = hoveredId ? (balances.get(hoveredId) ?? 0) : 0;
  const hoveredName = hoveredId ? nameOf(hoveredId) : "";

  return (
    <div
      ref={containerRef}
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #D9C8A6",
        borderRadius: 12,
        padding: 14,
        position: "relative",
      }}
    >
      {/* V223.B — Légende compacte en haut */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          fontSize: 10,
          color: "#6B5A47",
          marginBottom: 6,
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 2,
              background: "#9F4628",
              borderRadius: 1,
              display: "inline-block",
            }}
          />
          <span style={{ color: "#9F4628", fontWeight: 600 }}>
            {legendOwesLabel || "→ doit"}
          </span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 2,
              background: "#1F7A57",
              borderRadius: 1,
              display: "inline-block",
            }}
          />
          <span style={{ color: "#1F7A57", fontWeight: 600 }}>
            {legendOwedLabel || "← est dû"}
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Carte des dettes du groupe"
        style={{ display: "block", maxHeight: 360 }}
      >
        {/* Marker flèche pour les arcs (sens fromUser → toUser) */}
        <defs>
          <marker
            id="arrow-saffron"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#C58A2E" />
          </marker>
          <marker
            id="arrow-terracotta"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9F4628" />
          </marker>
        </defs>

        {/* Anneau de fond pâle */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_RADIUS}
          fill="none"
          stroke="#D9C8A6"
          strokeWidth={0.5}
          strokeDasharray="2 4"
          opacity={0.6}
        />

        {/* Arcs de Bézier pour chaque transfert */}
        {transfersToRender.map((s, idx) => {
          const from = positions.get(s.fromUserId);
          const to = positions.get(s.toUserId);
          if (!from || !to) return null;
          // V223.B — Si un membre est survolé, on dim les arcs non connectés.
          const isDimmed =
            hoveredId !== null &&
            s.fromUserId !== hoveredId &&
            s.toUserId !== hoveredId;
          // Courbe : control point au tiers vers le centre pour effet "arc"
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          const dx = midX - CX;
          const dy = midY - CY;
          // Pull vers le centre (60%) pour un arc visible
          const ctrlX = CX + dx * 0.35;
          const ctrlY = CY + dy * 0.35;
          // Couleur selon poids (gros transferts = terracotta, petits = saffron)
          const isHeavy = s.amount >= maxAmount * 0.6;
          const color = isHeavy ? "#9F4628" : "#C58A2E";
          const markerId = isHeavy ? "arrow-terracotta" : "arrow-saffron";
          // Point de label : milieu de la courbe quadratique
          const labelX = 0.25 * from.x + 0.5 * ctrlX + 0.25 * to.x;
          const labelY = 0.25 * from.y + 0.5 * ctrlY + 0.25 * to.y;
          // V223.B — Numéro de cet arc dans le plan optimal
          const arcNumber = transferNumberById.get(
            `${s.fromUserId}-${s.toUserId}`,
          );

          // Position du numéro : décalé du label vers le from (côté début de l'arc)
          const numX = 0.6 * from.x + 0.3 * ctrlX + 0.1 * to.x;
          const numY = 0.6 * from.y + 0.3 * ctrlY + 0.1 * to.y;

          return (
            <g
              key={`${s.fromUserId}-${s.toUserId}-${idx}`}
              style={{
                opacity: isDimmed ? 0.18 : 1,
                transition: "opacity 0.2s ease",
              }}
            >
              <path
                d={`M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidthFor(s.amount)}
                strokeLinecap="round"
                markerEnd={`url(#${markerId})`}
                opacity={0.85}
              />
              {/* V223.B — Pastille numéro d'arc (en lien avec plan optimal) */}
              {arcNumber !== undefined && (
                <g transform={`translate(${numX}, ${numY})`}>
                  <circle r={9} fill="#FFFFFF" stroke={color} strokeWidth={1} />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill={color}
                    fontFamily="ui-monospace, Menlo, monospace"
                  >
                    {arcNumber}
                  </text>
                </g>
              )}
              {/* Label montant */}
              <g transform={`translate(${labelX}, ${labelY})`}>
                <rect
                  x={-26}
                  y={-9}
                  width={52}
                  height={18}
                  rx={9}
                  fill="#FAF6EE"
                  stroke={color}
                  strokeWidth={0.5}
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="ui-monospace, Menlo, monospace"
                  fill="#2B1F15"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatAmount(s.amount, currency)}
                </text>
              </g>
            </g>
          );
        })}

        {/* Centre : cercle solde groupe */}
        <circle
          cx={CX}
          cy={CY}
          r={CENTER_RADIUS}
          fill="#F4ECD9"
          stroke="#D9C8A6"
          strokeWidth={0.5}
        />
        <text
          x={CX}
          y={CY - 8}
          textAnchor="middle"
          fontSize={9}
          fill="#8B6F47"
          fontWeight={500}
          letterSpacing="0.08em"
        >
          {centerLabel.toUpperCase()}
        </text>
        <text
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          fontSize={14}
          fontWeight={600}
          fill="#2B1F15"
          fontFamily="ui-monospace, Menlo, monospace"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatAmount(totalToBalance, currency)}
        </text>

        {/* Avatars des membres autour */}
        {activeMembers.map((m) => {
          const p = positions.get(m.id);
          if (!p) return null;
          const isCreditor = p.balance > 0;
          const isDebtor = p.balance < 0;
          const isHovered = hoveredId === m.id;
          // V223.A — Halo selon signe : sage (créditeur) / terracotta (débiteur)
          const haloColor = isCreditor
            ? "#1F7A57"
            : isDebtor
              ? "#9F4628"
              : "#2B1F15";

          const labelBelow = p.angle > -Math.PI / 2 && p.angle < Math.PI / 2;
          const balLabelY = labelBelow
            ? p.y + AVATAR_SIZE / 2 + 14
            : p.y - AVATAR_SIZE / 2 - 6;
          const nameLabelY = labelBelow
            ? p.y - AVATAR_SIZE / 2 - 6
            : p.y + AVATAR_SIZE / 2 + 14;

          return (
            <g
              key={m.id}
              style={{
                cursor: "default",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => handleAvatarMouseEnter(m.id, e)}
              onMouseMove={(e) => updateTooltipPos(e)}
              onMouseLeave={handleAvatarMouseLeave}
            >
              {/* Halo */}
              <circle
                cx={p.x}
                cy={p.y}
                r={AVATAR_SIZE / 2 + (isHovered ? 5 : 3)}
                fill={haloColor}
                opacity={isHovered ? 0.32 : 0.18}
                style={{ transition: "opacity 0.15s ease, r 0.15s ease" }}
              />
              {/* Avatar via foreignObject pour réutiliser AvatarColored React */}
              <foreignObject
                x={p.x - AVATAR_SIZE / 2}
                y={p.y - AVATAR_SIZE / 2}
                width={AVATAR_SIZE}
                height={AVATAR_SIZE}
                style={{ pointerEvents: "none" }}
              >
                <AvatarColored
                  userId={m.id}
                  initials={m.displayName}
                  size={AVATAR_SIZE}
                  photoUrl={m.photoUrl ?? null}
                />
              </foreignObject>
              {/* Nom */}
              <text
                x={p.x}
                y={nameLabelY}
                textAnchor="middle"
                fontSize={10}
                fill="#2B1F15"
                fontWeight={isHovered ? 700 : 500}
              >
                {m.displayName.length > 12
                  ? m.displayName.slice(0, 11) + "…"
                  : m.displayName}
              </text>
              {/* Solde */}
              <text
                x={p.x}
                y={balLabelY}
                textAnchor="middle"
                fontSize={10}
                fontFamily="ui-monospace, Menlo, monospace"
                fontWeight={600}
                fill={isCreditor ? "#1F7A57" : "#9F4628"}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {isCreditor ? "+" : ""}
                {formatAmount(p.balance, currency)}
              </text>
              {/* V225.A — <title> SVG natif retiré : il créait un double tooltip
                  (browser natif + overlay HTML riche). Le tooltip overlay
                  ci-dessous est suffisamment riche et accessible (role="tooltip"). */}
              {/* Hit area transparente pour mouse events fiables */}
              <circle
                cx={p.x}
                cy={p.y}
                r={AVATAR_SIZE / 2 + 8}
                fill="transparent"
                style={{ pointerEvents: "all" }}
              />
            </g>
          );
        })}
      </svg>

      {/* V223.B — Tooltip HTML overlay (cocoa sur fond clair = contraste OK
          car overlay temporaire, c'est l'exception du contraste inverse) */}
      {hoveredId && tooltipPos && hoveredFlows && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: Math.min(
              Math.max(8, tooltipPos.x + 14),
              (containerRef.current?.clientWidth ?? 360) - 232,
            ),
            top: Math.max(8, tooltipPos.y - 12),
            maxWidth: 220,
            background: "#2B1F15",
            color: "#FAF6EE",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 11,
            lineHeight: 1.45,
            boxShadow: "0 6px 18px rgba(43,31,21,0.25)",
            pointerEvents: "none",
            zIndex: 10,
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{hoveredName}</span>
            <span
              style={{
                color: hoveredBalance > 0 ? "#A6E2C2" : "#F6B89F",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {hoveredBalance > 0 ? "+" : ""}
              {formatAmount(hoveredBalance, currency)}
            </span>
          </div>
          {hoveredFlows.owes.length === 0 && hoveredFlows.owed.length === 0 && (
            <div style={{ opacity: 0.7, fontSize: 10.5 }}>
              {emptyLabel}
            </div>
          )}
          {hoveredFlows.owes.map((s, i) => (
            <div
              key={`o-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
                color: "#F6B89F",
                fontSize: 10.5,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatOwesText
                  ? formatOwesText(
                      nameOf(s.toUserId),
                      formatAmount(s.amount, currency),
                    )
                  : `Doit à ${nameOf(s.toUserId)}`}
              </span>
              <span
                style={{
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {formatAmount(s.amount, currency)}
              </span>
            </div>
          ))}
          {hoveredFlows.owed.map((s, i) => (
            <div
              key={`r-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
                color: "#A6E2C2",
                fontSize: 10.5,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatOwedText
                  ? formatOwedText(
                      nameOf(s.fromUserId),
                      formatAmount(s.amount, currency),
                    )
                  : `Reçoit de ${nameOf(s.fromUserId)}`}
              </span>
              <span
                style={{
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {formatAmount(s.amount, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bouton "Voir tout" si > 5 transferts cachés */}
      {activeMembers.length > 6 && settlements.length > 5 && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              padding: "6px 14px",
              background: "transparent",
              color: "#8B6F47",
              border: "0.5px solid #D9C8A6",
              borderRadius: 7,
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {expanded ? collapseLabel : showAllLabel}
          </button>
        </div>
      )}
    </div>
  );
}
