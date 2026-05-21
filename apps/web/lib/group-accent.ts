/**
 * V224.C — Helper « accent du groupe » pour le hub et la liste des groupes.
 *
 * Fabrice a remonté en test prod que la charte (couleurs primaire/accent)
 * et le logo personnalisé d'un groupe ne se répercutaient nulle part hors
 * de l'écran de réglages. La cause root : `getGroupForMember` côté backend
 * ne sélectionnait pas la relation `theme` ni le scalar `customLogoUrl`,
 * et les vues hub/liste ne consultaient jamais ces valeurs.
 *
 * Ce helper centralise la lecture en mode défensif :
 *   - lit `group.theme.primaryColor` / `accentColor` / `logoUrl` (relation
 *     GroupTheme alimentée par GroupThemeBlock + endpoint PUT /theme).
 *   - fallback sur `group.customLogoUrl` (logo PDF payant V163.C) si pas
 *     de logo défini dans la charte (les deux peuvent coexister selon
 *     l'usage : la charte logo est visible app-side, customLogoUrl est
 *     conçu pour les PDF mais reste un excellent fallback visuel).
 *   - palette par défaut : V45-light saffron `#C58A2E` + terracotta
 *     `#9F4628` + ivoire `#FAF6EE` pour les contrastes calmes.
 *
 * Couvre les 3 cas remontés :
 *   1. Hub groupe — header avec accent + logo en haut à gauche.
 *   2. Liste des groupes — card avec border accent + logo en avatar.
 *   3. Mobile — même logique appliquée à la vue groupe.
 */

const DEFAULT_PRIMARY = "#C58A2E"; // saffron V45
const DEFAULT_ACCENT = "#9F4628"; // terracotta V45
const DEFAULT_SURFACE = "#FAF6EE"; // ivoire V45

export interface GroupAccent {
  /** Couleur primaire (CTA, badges, surlignages). */
  color: string;
  /** Couleur d'accent (hover, sub-CTA, séparateurs). */
  accent: string;
  /** URL absolue ou data URL du logo (null si pas de logo custom). */
  logoUrl: string | null;
  /** True si le groupe a une charte custom (≠ défaut BMD). */
  hasCustom: boolean;
  /** Couleur de surface tintée — utile pour les fonds de card. */
  surfaceTint: string;
}

/**
 * Retourne les couleurs et le logo d'un groupe. Tolère `group` partiel ou
 * `null` (ex. en mode loading). Toujours non-null en sortie.
 */
export function getGroupAccent(
  group?: {
    theme?: {
      primaryColor?: string | null;
      accentColor?: string | null;
      logoUrl?: string | null;
    } | null;
    customLogoUrl?: string | null;
  } | null,
): GroupAccent {
  const themePrimary = group?.theme?.primaryColor ?? null;
  const themeAccent = group?.theme?.accentColor ?? null;
  const themeLogo = group?.theme?.logoUrl ?? null;
  const customLogo = group?.customLogoUrl ?? null;

  const color = themePrimary || DEFAULT_PRIMARY;
  const accent = themeAccent || DEFAULT_ACCENT;
  // Priorité : logo charte > logo PDF (fallback visuel).
  const logoUrl = themeLogo || customLogo || null;
  const hasCustom = Boolean(themePrimary || themeAccent || logoUrl);

  // Surface tintée à 8 % de la primaire (alpha hex « 14 » ≈ 0.078).
  // Compatible navigateurs modernes (CSS Color Module 4).
  const surfaceTint = hasCustom ? `${color}14` : DEFAULT_SURFACE;

  return { color, accent, logoUrl, hasCustom, surfaceTint };
}
