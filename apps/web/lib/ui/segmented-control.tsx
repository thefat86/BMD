"use client";

/**
 * <SegmentedControl> · V59
 *
 * Toggle pill animé style iOS Segmented Control — saffron solide,
 * impossible d'avoir les segments tous désélectionnés (le pill est
 * toujours physiquement à une position).
 *
 * Design system V45-light :
 *  - Pill saffron solide `#E8A33D → #C58A2E` avec box-shadow marqué
 *  - Texte actif : cocoa `#2B1F15` weight 800 + text-shadow blanc subtle
 *  - Texte inactif : cocoa-soft `#6B5A47` weight 600
 *  - Fond container cocoa-alpha → contraste max sur le pill
 *
 * Garanties :
 *  - Le segment actif est TOUJOURS visible (pill toujours dans le DOM
 *    à gauche ou à droite, pas de transparence/no-bg pour l'inactif)
 *  - Animation slide cubic-bezier 220ms
 *  - `safeValue` : si la prop value n'est pas dans la liste, on retombe
 *    sur le 1er segment → impossible d'avoir un état "rien"
 *  - Min-height 44px (iOS touch target)
 *  - touch-action manipulation + tap-highlight transparent
 *
 * Usage :
 *   <SegmentedControl
 *     value={view}
 *     onChange={setView}
 *     segments={[
 *       { value: "byGroup", label: "Par groupe" },
 *       { value: "byPerson", label: "Par personne" },
 *     ]}
 *     ariaLabel="Vue dashboard"
 *   />
 */

import type { ReactNode } from "react";

export interface SegmentDef<T extends string> {
  value: T;
  label: ReactNode;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  ariaLabel,
  fullWidth = true,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  segments: SegmentDef<T>[];
  ariaLabel?: string;
  /** Étend le composant à la largeur 100% (default) ou taille auto (chips) */
  fullWidth?: boolean;
  /** "sm" = onglets denses (32px), "md" = standard 44px iOS */
  size?: "sm" | "md";
}): JSX.Element {
  // Garde-fou : value DOIT être dans segments. Sinon fallback sur le 1er.
  const safeValue: T =
    segments.find((s) => s.value === value)?.value ?? segments[0]!.value;
  const activeIndex = segments.findIndex((s) => s.value === safeValue);
  const minHeight = size === "sm" ? 32 : 44;
  const padY = size === "sm" ? 6 : 10;

  // Largeur du pill = 1/N segments. Translation = activeIndex * 100%.
  const pillWidthPct = 100 / segments.length;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${segments.length}, 1fr)`,
        background: "rgba(43,31,21,0.06)",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 12,
        padding: 4,
        isolation: "isolate",
        overflow: "hidden",
        width: fullWidth ? "100%" : "fit-content",
      }}
    >
      {/* Pill glissant — toujours visible */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 4,
          width: `calc(${pillWidthPct}% - 4px)`,
          background: "linear-gradient(135deg, #E8A33D 0%, #C58A2E 100%)",
          borderRadius: 9,
          transform: `translateX(${activeIndex * 100}%)`,
          transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow:
            "0 3px 10px rgba(197,138,46,0.45), 0 1px 2px rgba(43,31,21,0.18), inset 0 1px 0 rgba(255,255,255,0.25)",
          border: "1px solid rgba(197,138,46,0.55)",
          zIndex: 0,
        }}
      />
      {segments.map((seg) => {
        const isActive = safeValue === seg.value;
        return (
          <button
            key={seg.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(seg.value)}
            style={{
              position: "relative",
              zIndex: 1,
              padding: `${padY}px 12px`,
              borderRadius: 9,
              border: "none",
              background: "transparent",
              color: isActive ? "#2B1F15" : "#6B5A47",
              fontSize: size === "sm" ? 11 : 13,
              fontWeight: isActive ? 800 : 600,
              fontFamily: "inherit",
              minHeight,
              letterSpacing: 0.3,
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              userSelect: "none",
              WebkitUserSelect: "none",
              transition: "color 0.18s ease, font-weight 0.18s ease",
              textShadow: isActive
                ? "0 1px 0 rgba(255,255,255,0.18)"
                : "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
