/**
 * V52.A2 — Composant <Icon /> SVG outline 1.5px stroke (Lucide-style).
 *
 * Style V45 strict :
 *  - SVG outline, pas de fill par défaut
 *  - stroke-width 1.5px (overrideable)
 *  - currentColor par défaut → hérite de la couleur CSS du parent
 *  - viewBox 24×24 standard Lucide
 *
 * Usage :
 *   import { Icon } from "../../lib/ui/icons/icon";
 *   <Icon name="coins" size={20} />
 *   <Icon name="check" size={18} color="var(--v45-emerald)" />
 *   <Icon name="receipt" strokeWidth={2} className="some-class" />
 *
 * À ajouter une icône : éditer icon-paths.ts (jamais ce fichier).
 *
 * Migration emoji → SVG (cf. AUDIT-V45-VS-PROD.md § Inventaire) :
 *   🪙 → coins · 🏠 → home · ✈️ → plane · 🎉 → party-popper
 *   👥 → users · 📞 → phone · ✉️ → mail · 💱 → repeat
 *   📊 → bar-chart-2 · ✨ → sparkles · 🎁 → gift · 🌍 → globe
 *   etc.
 */
import type { CSSProperties } from "react";
import { ICON_PATHS, type IconName } from "./icon-paths";

export interface IconProps {
  name: IconName;
  /** Taille en pixels (carré). Défaut : 20px. */
  size?: number;
  /** Couleur du stroke. Défaut : currentColor. */
  color?: string;
  /** Épaisseur du stroke. Défaut : 1.5px (V45 standard). */
  strokeWidth?: number;
  /** Classe CSS optionnelle. */
  className?: string;
  /** Style inline optionnel. */
  style?: CSSProperties;
  /** ARIA label pour accessibilité. Si absent, l'icône est `aria-hidden`. */
  ariaLabel?: string;
}

/**
 * Icône SVG V45. Utilise `dangerouslySetInnerHTML` car les paths sont
 * stockés comme strings dans icon-paths.ts (plus compact que JSX, plus
 * facile à copier depuis lucide.dev / svgrepo).
 *
 * Sécurité : les paths sont des constantes statiques contrôlées par
 * nous, jamais des inputs user → XSS impossible.
 */
export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 1.5,
  className,
  style,
  ariaLabel,
}: IconProps) {
  const inner = ICON_PATHS[name];
  if (!inner) {
    // En dev, log un warning si le nom est invalide (le typage TS devrait
    // empêcher ça, mais en cas de cast `as any` ou de migration runtime).
    if (typeof console !== "undefined") {
      console.warn(`[Icon] Unknown icon name: "${name}"`);
    }
    return null;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      role={ariaLabel ? "img" : undefined}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

/**
 * Helper : composant prêt-à-l'emploi pour une icône de "type de groupe".
 * Mappe un type BMD (TONTINE/COLOC/TRAVEL/etc.) vers l'icône V45 correspondante.
 *
 * Usage : `<GroupTypeIcon type={group.type} size={20} />`
 */
export function GroupTypeIcon({
  type,
  size = 20,
  color,
}: {
  type: string;
  size?: number;
  color?: string;
}) {
  const map: Record<string, IconName> = {
    TONTINE: "coins",
    COLOC: "home",
    TRAVEL: "plane",
    EVENT: "party-popper",
    PARISH: "users",
    CLUB: "users",
    GENERIC: "folder",
    OTHER: "folder",
  };
  const iconName = map[type?.toUpperCase?.()] ?? "folder";
  return <Icon name={iconName} size={size} color={color} />;
}
