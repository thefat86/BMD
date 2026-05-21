/**
 * V53.A1 — Catalogue i18n APP, code-splitté par locale.
 *
 * Avant : un fichier monolithique de 36 592 lignes (~2.1 MB texte) qui
 * contenait les 25 locales × 1440 clés et était importé par 100+ fichiers
 * via `useT()`. Résultat : ~150 KB gzip injectés dans chaque page.
 *
 * Maintenant :
 *  - FR est importé STATIQUEMENT (locale de référence + fallback ultime).
 *    C'est un fast-path pour le 1er render : tant que la locale active
 *    n'est pas chargée, on rend en FR (la majorité des users sont FR).
 *  - Les 24 autres locales sont chargées via `import()` dynamic — Next.js
 *    génère un chunk distinct par locale, chargé uniquement quand l'user
 *    a sélectionné cette langue.
 *
 * Gain bundle initial estimé : ~95 KB gzip → ~5 KB gzip (FR seul).
 *
 * API publique inchangée : `useT()` retourne toujours `(key, vars?) → string`
 * synchrone. Le LocaleProvider charge async le dict de la locale active et
 * le met dans le context React.
 */

import { useCallback } from "react";
import { useLocale } from "../locale-provider";
import frDict from "./locales/fr";

/**
 * Liste des locales supportées par l'app. Doit rester en phase avec :
 *  - Les fichiers présents dans `lib/i18n/locales/`
 *  - La table `Locale` côté backend (model Prisma)
 *  - La fanout du script i18n:check
 */
export type LocaleCode =
  | "fr" | "en" | "es" | "pt" | "ar" | "sw" | "wo" | "ln" | "am"
  | "de" | "it" | "lb" | "ru" | "ja" | "ko" | "hi" | "zh" | "pcm"
  | "ha" | "yo" | "om" | "ig" | "ff" | "zu" | "ak"
  | "fr-cm" | "fr-ci";

/**
 * Loaders dynamic — un par locale (sauf FR qui est statique).
 *
 * Chaque entrée est une fonction qui fait `import()` (lazy). Next.js
 * détecte ce pattern et émet un chunk JS séparé par locale. Quand
 * `loadLocaleDict("en")` est appelé pour la 1re fois, le navigateur
 * télécharge `_next/static/chunks/i18n-en-xxxxx.js` (~25 KB gzip), pas avant.
 */
const loaders: Record<
  Exclude<LocaleCode, "fr">,
  () => Promise<{ default: Record<string, string> }>
> = {
  en: () => import(/* webpackChunkName: "i18n-en" */ "./locales/en"),
  es: () => import(/* webpackChunkName: "i18n-es" */ "./locales/es"),
  pt: () => import(/* webpackChunkName: "i18n-pt" */ "./locales/pt"),
  ar: () => import(/* webpackChunkName: "i18n-ar" */ "./locales/ar"),
  sw: () => import(/* webpackChunkName: "i18n-sw" */ "./locales/sw"),
  wo: () => import(/* webpackChunkName: "i18n-wo" */ "./locales/wo"),
  ln: () => import(/* webpackChunkName: "i18n-ln" */ "./locales/ln"),
  am: () => import(/* webpackChunkName: "i18n-am" */ "./locales/am"),
  de: () => import(/* webpackChunkName: "i18n-de" */ "./locales/de"),
  it: () => import(/* webpackChunkName: "i18n-it" */ "./locales/it"),
  lb: () => import(/* webpackChunkName: "i18n-lb" */ "./locales/lb"),
  ru: () => import(/* webpackChunkName: "i18n-ru" */ "./locales/ru"),
  ja: () => import(/* webpackChunkName: "i18n-ja" */ "./locales/ja"),
  ko: () => import(/* webpackChunkName: "i18n-ko" */ "./locales/ko"),
  hi: () => import(/* webpackChunkName: "i18n-hi" */ "./locales/hi"),
  zh: () => import(/* webpackChunkName: "i18n-zh" */ "./locales/zh"),
  pcm: () => import(/* webpackChunkName: "i18n-pcm" */ "./locales/pcm"),
  ha: () => import(/* webpackChunkName: "i18n-ha" */ "./locales/ha"),
  yo: () => import(/* webpackChunkName: "i18n-yo" */ "./locales/yo"),
  om: () => import(/* webpackChunkName: "i18n-om" */ "./locales/om"),
  ig: () => import(/* webpackChunkName: "i18n-ig" */ "./locales/ig"),
  ff: () => import(/* webpackChunkName: "i18n-ff" */ "./locales/ff"),
  zu: () => import(/* webpackChunkName: "i18n-zu" */ "./locales/zu"),
  ak: () => import(/* webpackChunkName: "i18n-ak" */ "./locales/ak"),
  "fr-cm": () => import(/* webpackChunkName: "i18n-fr-cm" */ "./locales/fr_cm"),
  "fr-ci": () => import(/* webpackChunkName: "i18n-fr-ci" */ "./locales/fr_ci"),
};

/**
 * Cache mémoire des dicts déjà chargés. Permet d'éviter de re-fetcher le
 * chunk JS quand on switch entre 2 locales (rare mais possible).
 */
const cache = new Map<LocaleCode, Record<string, string>>();
cache.set("fr", frDict);

/**
 * Charge async le dict d'une locale. Retourne le dict (depuis le cache si
 * déjà chargé). Sur erreur (chunk manquant, network down), fallback FR.
 *
 * Utilisé par LocaleProvider au mount + au switch de locale.
 */
export async function loadLocaleDict(
  code: LocaleCode,
): Promise<Record<string, string>> {
  const cached = cache.get(code);
  if (cached) return cached;
  if (code === "fr") return frDict;
  const loader = loaders[code as Exclude<LocaleCode, "fr">];
  if (!loader) return frDict;
  try {
    const mod = await loader();
    const dict = mod.default;
    cache.set(code, dict);
    return dict;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] failed to load locale "${code}", fallback fr`, err);
    }
    return frDict;
  }
}

/**
 * Dict de la locale FR — toujours en mémoire, utilisé comme fast-path et
 * fallback ultime quand une clé manque dans la locale active.
 */
export const FR_DICT = frDict;

/**
 * Type des clés i18n. Avant V53 c'était `keyof typeof APP_STRINGS_FR_KEYS`
 * (strict via inférence du literal géant). Comme le bloc FR a été
 * déplacé dans `locales/fr.ts` typé `Record<string, string>`, on perd
 * l'inférence stricte mais on garde la même DX (autocomplete possible via
 * scripts/check-i18n-coverage.mjs en CI).
 */
export type AppStringKey = string;

/**
 * Hook qui retourne une fonction de traduction `t(key, vars?)`.
 *
 * V53.A1 — Lit le dict actif depuis le LocaleProvider (chargé async).
 * Tant que le dict n'est pas chargé (1er render après mount), on utilise
 * frDict comme fast-path → l'app rend immédiatement en FR sans flash.
 *
 * V84.1 — useCallback(active) : la fonction retournée est désormais
 * STABLE entre les renders tant que le dict ne change pas (= même locale).
 *
 * Avant V84.1, `t` était recréée à chaque render → chaque useEffect qui
 * la mettait en deps re-runnait à chaque render, ce qui pouvait causer
 * des boucles `setState → render → effect → setState → ...` (cf. crash
 * "Maximum update depth exceeded" sur MobileAttachmentViewer en mobile).
 *
 * Avec ce fix :
 *  - Les useEffect avec `t` en deps ne re-run plus à chaque render.
 *  - Les composants memoizés (React.memo) ne re-render plus à cause de t.
 *  - Gain de perf général dans toute l'app sur les chemins chauds.
 */
export function useT(): (
  key: AppStringKey,
  vars?: Record<string, string>,
) => string {
  const { dict } = useLocale();
  const active = dict ?? frDict;
  return useCallback(
    (key, vars) => {
      // V41.3 — Quand la clé n'existe NI dans la locale active NI dans FR,
      // on retourne une chaîne VIDE (et non la clé brute) afin que les
      // patterns `t("key") || "fallback FR"` fonctionnent correctement.
      const tpl = active[key] ?? frDict[key] ?? "";
      if (!tpl && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] Missing key: "${key}"`);
      }
      if (!vars) return tpl;
      return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    },
    [active],
  );
}

/**
 * @deprecated V53.A1 — Conservé pour compat ascendante avec le script
 * `check-i18n-coverage.mjs` qui inspecte le fichier en statique pour
 * collecter les clés FR. Le script a été mis à jour pour lire
 * `locales/fr.ts` directement, mais on garde cet export au cas où des
 * outils externes l'utilisent. Retourne seulement le bloc FR.
 */
export const APP_STRINGS = { fr: frDict } as Record<string, Record<string, string>>;
