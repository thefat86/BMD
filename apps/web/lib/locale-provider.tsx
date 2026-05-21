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
 *  - Charge async le dict de la nouvelle locale (chunk JS séparé)
 *  - Persiste dans localStorage
 *  - Si connecté : PATCH `/auth/me { defaultLocale }` pour synchroniser
 *
 * V53.A1 — Charge le dict i18n de la locale active de façon ASYNC pour
 * que le bundle initial ne contienne que FR (~5 KB gzip au lieu de
 * ~150 KB gzip pour les 25 locales). Le 1er render se fait en FR
 * (fast-path), puis swap silencieux quand le dict de la locale est prêt.
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
import {
  FR_DICT,
  loadLocaleDict,
  type LocaleCode,
} from "./i18n/app-strings";

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
  /**
   * V53.A1 — Dict i18n de la locale active. Null tant que le chunk async
   * n'est pas chargé (1er render). useT() utilise FR_DICT en fallback.
   */
  dict: Record<string, string> | null;
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
  /**
   * V53.A1 — Dict de la locale active.
   * Démarre à FR_DICT (fast-path) puis swap quand chargement async OK.
   */
  const [dict, setDict] = useState<Record<string, string> | null>(FR_DICT);

  // Chargement initial : récupère les langues actives + applique la pref
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // V118 — Avant : `await api.listLocales()` PUIS `await api.me()`
      // séquentiellement, alors qu'elles sont indépendantes. Sur 4G
      // mobile : ~150 ms × 2 = 300 ms bloquants avant que le provider
      // ne libère l'arbre. Désormais on lance les deux en parallèle.
      // Le provider est wrappé autour de TOUT l'arbre (cf. layout.tsx),
      // donc tout gain ici se répercute sur le TTI global.
      const hasToken = !!getToken();
      const [listResult, meResult] = await Promise.allSettled([
        api.listLocales(),
        hasToken ? api.me() : Promise.resolve(null),
      ]);

      // 1. Liste des langues — fallback FR si échec.
      let list: LocaleInfo[];
      if (listResult.status === "fulfilled") {
        list = listResult.value.map((r) => ({
          code: r.code,
          name: r.name,
          flag: r.flag,
          direction: (r.direction === "rtl" ? "rtl" : "ltr") as "ltr" | "rtl",
        }));
      } else {
        list = [{ code: "fr", name: "Français", flag: "🇫🇷", direction: "ltr" }];
      }
      if (cancelled) return;
      setAvailable(list);

      // 2. Détermine la locale préférée par ordre de priorité.
      let preferred: string | null = null;

      // Si connecté ET fetch /me OK, on prend la préférence serveur.
      if (meResult.status === "fulfilled" && meResult.value) {
        const fromUser = (meResult.value as any)?.user?.defaultLocale;
        if (fromUser && typeof fromUser === "string") {
          preferred = fromUser;
        }
      }
      if (!preferred) preferred = readStoredLocale();
      if (!preferred) preferred = detectBrowserLocale();
      if (!preferred) preferred = "fr";

      const found = list.find((l) => l.code === preferred);
      if (cancelled) return;
      const effectiveCode = found
        ? found.code
        : list.find((l) => l.code === "fr")?.code ?? "fr";
      const effectiveDir =
        found?.direction ??
        list.find((l) => l.code === effectiveCode)?.direction ??
        "ltr";

      setCodeState(effectiveCode);
      setDirection(effectiveDir);

      // V118 — Libère l'arbre IMMÉDIATEMENT en `ready: true` même si le
      // dict de la locale non-FR n'est pas encore chargé. Le state
      // `dict` reste sur FR_DICT (fallback) et sera swap en async dès
      // que `loadLocaleDict` revient. Avantage : l'UI s'affiche dans
      // <300 ms au lieu d'attendre +200-500 ms supplémentaires.
      setReady(true);
      if (effectiveCode !== "fr") {
        loadLocaleDict(effectiveCode as LocaleCode)
          .then((loadedDict) => {
            if (!cancelled) setDict(loadedDict);
          })
          .catch(() => {
            /* fallback FR_DICT déjà en place */
          });
      }
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
      // V53.A1 — Charge async le dict de la nouvelle locale.
      // Pendant le chargement, useT() retombe sur FR_DICT (fallback gracieux,
      // pas de flash de clés brutes).
      const loadedDict = await loadLocaleDict(newCode as LocaleCode);
      setDict(loadedDict);

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
      value={{ code, direction, available, setLocale, ready, dict }}
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
      dict: FR_DICT,
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
