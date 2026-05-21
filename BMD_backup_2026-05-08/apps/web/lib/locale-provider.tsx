"use client";

/**
 * LocaleProvider · gère la langue active + le sens de lecture (spec §6.6 §9.3).
 *
 * Sources de la langue active (priorité décroissante) :
 *  1. `User.defaultLocale` côté serveur (si l'utilisateur est connecté)
 *  2. localStorage `bmd_locale` (préférence anonyme persistée)
 *  3. `navigator.language` (détection navigateur)
 *  4. "fr" (fallback ultime)
 *
 * Quand l'utilisateur change la langue via `setLocale(code)` :
 *  - Mise à jour immédiate de l'UI (state + <html dir lang>)
 *  - Persiste dans localStorage
 *  - Si connecté : PATCH `/auth/me { defaultLocale }` pour synchroniser
 *
 * Si la langue préférée n'est plus active (admin l'a désactivée) → fallback FR.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken } from "./api-client";

interface LocaleInfo {
  code: string;
  name: string;
  flag: string;
  direction: "ltr" | "rtl";
}

interface LocaleContextValue {
  /** Code actif (ex: "fr", "ar") */
  code: string;
  /** "ltr" ou "rtl" */
  direction: "ltr" | "rtl";
  /** Liste des langues actives (chargée depuis le backend) */
  available: LocaleInfo[];
  /** Change la langue active (persiste local + sync serveur si connecté) */
  setLocale: (code: string) => Promise<void>;
  /** Indique si le provider a fini son chargement initial */
  ready: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "bmd_locale";

function readStoredLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function detectBrowserLocale(): string {
  if (typeof window === "undefined") return "fr";
  const lang = navigator.language?.toLowerCase() ?? "fr";
  return lang.slice(0, 2);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<string>("fr");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [available, setAvailable] = useState<LocaleInfo[]>([]);
  const [ready, setReady] = useState(false);

  // Chargement initial : récupère les langues actives + applique la pref
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Récupère la liste des langues actives
      let list: LocaleInfo[] = [];
      try {
        const rows = await api.listLocales();
        list = rows.map((r) => ({
          code: r.code,
          name: r.name,
          flag: r.flag,
          direction: (r.direction === "rtl" ? "rtl" : "ltr") as "ltr" | "rtl",
        }));
      } catch {
        list = [{ code: "fr", name: "Français", flag: "🇫🇷", direction: "ltr" }];
      }
      if (cancelled) return;
      setAvailable(list);

      // 2. Détermine la locale préférée par ordre de priorité
      let preferred: string | null = null;

      // Si connecté, essaie de lire User.defaultLocale (priorité absolue)
      if (getToken()) {
        try {
          const me = await api.me();
          const fromUser = (me as any)?.user?.defaultLocale;
          if (fromUser && typeof fromUser === "string") {
            preferred = fromUser;
          }
        } catch {
          /* token invalide → on continue avec localStorage */
        }
      }

      if (!preferred) preferred = readStoredLocale();
      if (!preferred) preferred = detectBrowserLocale();
      if (!preferred) preferred = "fr";

      const found = list.find((l) => l.code === preferred);
      if (cancelled) return;
      if (found) {
        setCodeState(found.code);
        setDirection(found.direction);
      } else {
        // Langue désactivée → fallback FR
        const fr = list.find((l) => l.code === "fr") ?? list[0];
        if (fr) {
          setCodeState(fr.code);
          setDirection(fr.direction);
        }
      }
      setReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Applique lang + dir sur <html> à chaque changement
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = code;
    document.documentElement.dir = direction;
  }, [code, direction]);

  const setLocale = useCallback(
    async (newCode: string) => {
      const found = available.find((l) => l.code === newCode);
      if (!found) return;
      // 1. Applique localement IMMÉDIATEMENT (UI réactive)
      setCodeState(newCode);
      setDirection(found.direction);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, newCode);
        // Synchro IMMÉDIATE de <html lang dir> (au cas où le useEffect
        // ne serait pas encore exécuté avant une navigation immédiate)
        document.documentElement.lang = newCode;
        document.documentElement.dir = found.direction;
      }
      // 2. Sync serveur si l'utilisateur est connecté
      if (getToken()) {
        try {
          await api.updateMe({ defaultLocale: newCode });
        } catch {
          /* échec serveur : la pref locale reste appliquée localement */
        }
      }
    },
    [available],
  );

  return (
    <LocaleContext.Provider
      value={{ code, direction, available, setLocale, ready }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

/**
 * Hook pour lire la locale active + changer de langue.
 * Retourne des défauts safe si appelé hors d'un Provider.
 */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      code: "fr",
      direction: "ltr",
      available: [],
      setLocale: async () => {
        /* noop */
      },
      ready: false,
    };
  }
  return ctx;
}

/**
 * Sélecteur de langue compact à insérer dans une nav ou un footer.
 */
export function LocaleSwitcher() {
  const { code, available, setLocale } = useLocale();
  if (available.length === 0) return null;
  return (
    <select
      value={code}
      onChange={(e) => {
        void setLocale(e.target.value);
      }}
      aria-label="Changer de langue"
      style={{
        padding: "4px 8px",
        fontSize: 12,
        background: "var(--overlay-2)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        color: "var(--cream)",
        cursor: "pointer",
      }}
    >
      {available.map((l) => (
        <option key={l.code} value={l.code}>
          {l.flag} {l.name}
        </option>
      ))}
    </select>
  );
}
