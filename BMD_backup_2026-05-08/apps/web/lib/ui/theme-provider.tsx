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

export type Theme = "light" | "dark";

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
  // ⚠️ Mode clair désactivé pour le moment (V13) — l'identité brand BMD
  // (nuit + saffran) est conçue pour le sombre, et les rgba() hardcodés
  // dans les composants ne rendent pas correctement en clair sans audit
  // visuel approfondi. On force `dark` en attendant un design sytem
  // light complet. Le code de bascule reste en place (theme-provider) au
  // cas où on réactive plus tard, mais le toggle UI est caché.
  const code = `
(function() {
  try {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
    // Nettoie une éventuelle préférence "light" persistée d'avant
    var saved = localStorage.getItem('${STORAGE_KEY}');
    if (saved === 'light') localStorage.setItem('${STORAGE_KEY}', 'dark');
    window.__BMD_THEME__ = 'dark';
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
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
  // SSR : on assume "dark" mais le BootScript aura déjà corrigé côté client.
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sync initial : lis ce que le BootScript a déjà posé sur <html>
  useEffect(() => {
    if (typeof document === "undefined") return;
    const fromHtml = document.documentElement.getAttribute("data-theme");
    if (fromHtml === "light" || fromHtml === "dark") {
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
    meta.content = theme === "light" ? "#FBF6E9" : "#0E0B14";
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.colorScheme = t;
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
  return {
    theme:
      typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark",
    setTheme: (t) => {
      if (typeof document === "undefined") return;
      document.documentElement.setAttribute("data-theme", t);
      document.documentElement.style.colorScheme = t;
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        /* ignore */
      }
    },
    toggle: () => {
      if (typeof document === "undefined") return;
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      document.documentElement.style.colorScheme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    },
  };
}
