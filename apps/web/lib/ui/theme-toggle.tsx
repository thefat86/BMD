"use client";

/**
 * <ThemeToggle> · DÉSACTIVÉ EN V13.
 *
 * Le mode clair n'a pas été finalisé visuellement (les rgba() hardcodés
 * dans les composants nécessitent un audit pixel-perfect que nous n'avons
 * pas fait). On garde le composant exporté avec la même signature pour
 * éviter de casser les imports, mais il rend `null` — donc aucun bouton
 * n'apparaît dans la nav du site vitrine, le mobile-shell ou le
 * desktop-shell.
 *
 * Pour réactiver plus tard :
 *  1. Remettre le code de l'implémentation (cf. git log de ce fichier).
 *  2. Restaurer la lecture localStorage dans theme-provider.ThemeBootScript.
 *  3. Auditer les rgba() hardcodés en clair (cf. globals.css overrides).
 */

interface Props {
  variant?: "ghost" | "pill" | "icon-only";
  size?: number;
  labelDark?: string;
  labelLight?: string;
  className?: string;
}

// `_props` préfixé pour signaler intentionnellement non-utilisé.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ThemeToggle(_props: Props): JSX.Element | null {
  return null;
}
