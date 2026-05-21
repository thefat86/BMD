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
  // Import dynamique pour éviter la dépendance circulaire au boot
  void import("./api-client").then(({ api }) => {
    void api.getGroup(groupId).catch(() => {
      /* ignore : c'est juste un warm-up */
    });
    void api.getBalance(groupId).catch(() => {
      /* ignore */
    });
  });
}
