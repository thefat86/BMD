/**
 * BMD · Service Worker minimal
 *
 * Stratégie : "network-first" avec cache de fallback offline.
 * - Les requêtes réseau passent en priorité (données fraîches)
 * - Si offline, on sert les ressources en cache (page de fallback)
 * - L'app reste utilisable en lecture même sans connexion
 */

const CACHE_NAME = "bmd-v1";
const OFFLINE_FALLBACK = "/offline.html";

const PRECACHE_URLS = [
  "/",
  "/login",
  "/dashboard",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

// Installation : pré-cache des routes critiques
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Stratégie de fetch : network-first
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Ne JAMAIS cacher les appels API (auth, données privées)
  const url = new URL(request.url);
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) {
    return;
  }
  // Ne pas intercepter les hot-reload Next.js en dev
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Mettre à jour le cache silencieusement avec les ressources statiques
        if (
          response.ok &&
          response.type === "basic" &&
          (url.pathname.startsWith("/_next/static/") ||
            PRECACHE_URLS.includes(url.pathname))
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((r) => r ?? caches.match(OFFLINE_FALLBACK))),
  );
});
