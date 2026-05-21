"use client";

/**
 * <ThemeProvider> · gestion clair/sombre, persistance, anti-FOUC.
 *
 * Ce module fournit :
 *  - useTheme() hook → { theme, setTheme, toggle }
 *  - <ThemeProvider> qui maintient l'état + écrit `data-theme` sur <html>
 *  - <ThemeBootScript /> à inliner dans <head> AVANT toute hydratation pour
 *    éviter le flash de mauvais thème (FOUC) au premier rendu.
 *
 * Politique de défaut :
 *  1. Si l'utilisateur a déjà choisi → on respecte (localStorage `bmd-theme`)
 *  2. Sinon, on suit la préférence système (prefers-color-scheme)
 *  3. Sinon → "dark" (la marque BMD est nuit-saffran par défaut)
 *
 * Mécanique sans flash :
 *  - <ThemeBootScript /> est un inline <script> qui exécute la résolution AVANT
 *    le paint, en lisant localStorage + matchMedia, puis pose `data-theme=...`
 *    sur <html> dès le SSR.
 *  - Le ThemeProvider côté React se contente ensuite de SYNCHRONISER son state
 *    avec ce qui est déjà sur <html> (pas de re-flicker).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Themes supportés :
 *  - `dark` : palette V44 historique (par défaut) — cream/cocoa-night/saffron
 *  - `light` : mode clair user-toggleable historique (V13, peu utilisé)
 *  - `v45-light` : palette V45 cible (ivory/paper/cocoa/saffron #C58A2E) —
 *    introduite V52, en migration. Quand toute l'app sera validée V45 light
 *    on basculera le default ici et on supprimera `dark`.
 */
export type Theme = "light" | "dark" | "v45-light";

const STORAGE_KEY = "bmd-theme";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

/**
 * <ThemeBootScript /> — inline script à mettre DANS <head>.
 * Doit s'exécuter avant tout paint pour éviter FOUC.
 *
 * Stratégie :
 *  - Lit localStorage (clé "bmd-theme")
 *  - Sinon prefers-color-scheme
 *  - Sinon "dark"
 *  - Pose data-theme="..." sur <html>
 *  - Mémorise __BMD_THEME__ pour que le Provider React puisse re-sync sans IO
 *
 * On ne fait pas confiance au SSR (qui par défaut rend "dark") : ce script
 * tourne synchrone côté client à chaque load et corrige `data-theme` AVANT
 * que React n'hydrate.
 */
export function ThemeBootScript(): JSX.Element {
  // V52.D1 — Le mode `v45-light` (nouvelle palette ivory/paper/cocoa V45)
  // est maintenant ÉLIGIBLE à la persistance, en plus de `dark` (default).
  // L'ancien `light` (toggle user historique V13) est mappé vers `dark`
  // pour propreté — c'était un mode inachevé qui n'avait pas reçu d'audit
  // visuel complet, contrairement au `v45-light` qui suit la spec V45.
  //
  // Ordre de résolution :
  //  1. localStorage `bmd-theme` = "v45-light" → applique
  //  2. localStorage `bmd-theme` = "light" → upgrade vers "dark" (purge legacy)
  //  3. Sinon → "dark" (palette V44 historique, default)
  //
  // Anti-FOUC : script inline synchrone exécuté avant le 1er paint.
  const code = `
(function() {
  try {
    var saved = localStorage.getItem('${STORAGE_KEY}');
    // V52.D3 — Default = v45-light (palette V45 livrée). Le user peut
    // basculer en dark via le toggle showcase, le choix est persisté.
    var theme = 'v45-light';
    if (saved === 'dark') {
      theme = 'dark';
    } else if (saved === 'v45-light') {
      theme = 'v45-light';
    } else if (saved === 'light') {
      // Legacy: l'ancien mode clair toggle V13 → on l'upgrade vers v45-light
      // qui est le nouveau mode clair propre.
      localStorage.setItem('${STORAGE_KEY}', 'v45-light');
      theme = 'v45-light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme === 'v45-light' || theme === 'light' ? 'light' : 'dark';
    window.__BMD_THEME__ = theme;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'v45-light');
  }
})();
  `.trim();
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR : on assume "v45-light" (le nouveau default V52.D3). Le BootScript
  // aura corrigé côté client si l'user a persisté un autre choix.
  const [theme, setThemeState] = useState<Theme>("v45-light");

  // Sync initial : lis ce que le BootScript a déjà posé sur <html>
  useEffect(() => {
    if (typeof document === "undefined") return;
    const fromHtml = document.documentElement.getAttribute("data-theme");
    if (
      fromHtml === "light" ||
      fromHtml === "dark" ||
      fromHtml === "v45-light"
    ) {
      setThemeState(fromHtml);
    }
  }, []);

  // Synchronise <meta name="theme-color"> pour que la barre du navigateur
  // mobile (statusbar PWA) suive aussi le thème.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    // V52.D1 — Theme color statusbar PWA / Safari mobile :
    //  - v45-light : ivory clair (statusbar barre haut iPhone en ton crème)
    //  - light : ancien light désactivé mais valeur préservée
    //  - dark : night-deep BMD
    meta.content =
      theme === "v45-light"
        ? "#FBF6EC"
        : theme === "light"
          ? "#FBF6E9"
          : "#0E0B14";
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", t);
    // colorScheme `light` pour v45-light (les contrôles natifs scrollbar/
    // form-fields/input rendent en mode clair OS), sinon `dark`.
    document.documentElement.style.colorScheme =
      t === "v45-light" || t === "light" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, t);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__BMD_THEME__ = t;
    } catch {
      /* localStorage indispo (private mode Safari par ex.) — on continue en RAM */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  return (
    <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>
  );
}

/**
 * Hook d'accès au thème. Utilisable n'importe où sous <ThemeProvider>.
 *
 * Retourne un fallback "dark" si appelé hors Provider — pratique pour les
 * composants partagés (marketing page) qui peuvent être rendus sans Provider.
 */
export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // Fallback hors-provider : on lit/écrit directement sur <html>
  // V52.D1 — supporte aussi `v45-light` en plus de `light`/`dark`.
  const readCurrent = (): Theme => {
    if (typeof document === "undefined") return "dark";
    const v = document.documentElement.getAttribute("data-theme");
    if (v === "v45-light" || v === "light" || v === "dark") return v;
    return "dark";
  };
  return {
    theme: readCurrent(),
    setTheme: (t) => {
      if (typeof document === "undefined") return;
      document.documentElement.setAttribute("data-theme", t);
      document.documentElement.style.colorScheme =
        t === "v45-light" || t === "light" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        /* ignore */
      }
    },
    toggle: () => {
      if (typeof document === "undefined") return;
      const cur = readCurrent();
      // V52.D1 — Toggle 2 modes : dark ↔ v45-light (ignore le legacy "light")
      const next: Theme = cur === "v45-light" ? "dark" : "v45-light";
      document.documentElement.setAttribute("data-theme", next);
      document.documentElement.style.colorScheme =
        next === "v45-light" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    },
  };
}
