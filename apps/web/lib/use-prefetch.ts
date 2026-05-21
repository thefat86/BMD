"use client";

/**
 * Hook utilitaire pour déclencher un pré-fetch au survol d'un lien.
 *
 * Pattern : `<Link onMouseEnter={() => prefetch(href)}>`
 *
 * Effet : le service worker met l'URL en cache en arrière-plan dès le
 * survol → la navigation au clic est INSTANTANÉE (déjà cachée). Gain
 * mesurable sur les liens vers les groupes / settings / tontines.
 *
 * SSR-safe : si pas de SW (browser sans support, ou pas encore enregistré),
 * la fonction est un no-op gracieux.
 */
export function usePrefetch() {
  return (url: string) => {
    if (typeof navigator === "undefined") return;
    if (!navigator.serviceWorker?.controller) return;
    try {
      navigator.serviceWorker.controller.postMessage({
        type: "prefetch",
        urls: [url],
      });
    } catch {
      /* ignore — le SW n'est pas dispo, on ne casse rien */
    }
  };
}

/** Variante batch : pré-cache plusieurs URLs d'un coup. */
export function prefetchBatch(urls: string[]) {
  if (typeof navigator === "undefined") return;
  if (!navigator.serviceWorker?.controller) return;
  try {
    navigator.serviceWorker.controller.postMessage({
      type: "prefetch",
      urls,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Pré-warm le cache API d'un groupe au touchstart/hover. À appeler depuis
 * les cartes de groupe dans le dashboard (mobile + desktop). Effet : quand
 * l'utilisateur tape la carte, getGroup() retourne instant grâce à la
 * mémoization (15s TTL) → la page de détail s'affiche sans flash de skeleton.
 *
 * Throttle interne : on ne re-prewarm pas le même id dans la dernière seconde
 * pour éviter les rafales (mobile = touchstart + click peuvent tirer 2x).
 */
const lastPrewarmAt = new Map<string, number>();
const PREWARM_COOLDOWN_MS = 1000;

export function prewarmGroupApi(groupId: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const last = lastPrewarmAt.get(groupId) ?? 0;
  if (now - last < PREWARM_COOLDOWN_MS) return;
  lastPrewarmAt.set(groupId, now);
  // V119.#5 — Élargi à 4 endpoints : `MobileGroupView` au mount appelle
  // `getGroup`, `listExpenses`, `getBalance`, `listActivity`. Si on
  // prewarm tout ça au touchstart, les fetches sont déjà terminés au
  // moment où le composant monte → première frame "instantanée"
  // (les memoize 15-30 s d'api-client retournent direct le résultat).
  // Avant V119 on ne préchauffait que getGroup + getBalance.
  // requestIdleCallback (avec fallback setTimeout) pour ne pas
  // concurrencer le tap immédiat.
  const launch = () => {
    void import("./api-client").then(({ api }) => {
      void api.getGroup(groupId).catch(() => {});
      void api.getBalance(groupId).catch(() => {});
      void api.listExpenses(groupId).catch(() => {});
      void api.listActivity(groupId).catch(() => {});
    });
  };
  if (typeof (window as any).requestIdleCallback === "function") {
    (window as any).requestIdleCallback(launch, { timeout: 200 });
  } else {
    setTimeout(launch, 0);
  }
}

/**
 * V119.#6 — Préchauffe les endpoints critiques de la page profil.
 *
 * Appelé au mount du dashboard et au touchstart de l'icône profil
 * dans le header. La page profil fait `api.me()` + `api.listGroups()`
 * + (selon contexte) `listCurrencies` / `listSessions`. On précharge
 * les 2 premiers (les plus impactants — cf. ProfilePage), les autres
 * étant déclenchés à l'ouverture de leurs sheets respectifs.
 *
 * Throttle identique à `prewarmGroupApi` pour éviter les rafales sur
 * mobile (touchstart + click).
 */
export function prewarmProfileApi() {
  if (typeof window === "undefined") return;
  const key = "__profile__";
  const now = Date.now();
  const last = lastPrewarmAt.get(key) ?? 0;
  if (now - last < PREWARM_COOLDOWN_MS) return;
  lastPrewarmAt.set(key, now);
  const launch = () => {
    void import("./api-client").then(({ api }) => {
      void api.me().catch(() => {});
      void api.listGroups().catch(() => {});
    });
  };
  if (typeof (window as any).requestIdleCallback === "function") {
    (window as any).requestIdleCallback(launch, { timeout: 200 });
  } else {
    setTimeout(launch, 0);
  }
}
