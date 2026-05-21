/**
 * BMD · Service Worker v5 (Y1 — refonte stratégie)
 *
 * **Pourquoi cette refonte (Y1)** : la version v3/v4 utilisait
 * `staleWhileRevalidate` pour les pages HTML, ce qui causait :
 *   1. Un "flash d'ancien contenu" à chaque navigation (l'utilisateur voit
 *      l'ancienne version HTML pendant que le SW va chercher la nouvelle)
 *   2. Quand on bumpait CACHE_VERSION pour fixer un bug, l'utilisateur
 *      restait bloqué sur l'ancien bundle plusieurs heures
 *   3. Une impression de lenteur générale : double rendu (cache puis network),
 *      flash, hydratation, scroll position perdu, etc.
 *
 * **Nouvelle stratégie (v5)** :
 *
 *  1. **STATIC ASSETS HASHÉS** (`/_next/static/*`) → cache-first, IMMUTABLE
 *     Next.js met un hash dans le nom de fichier (ex: `chunks/app/page-1a2b.js`).
 *     Quand le hash change, c'est une nouvelle URL → pas besoin d'invalider.
 *     Cache-first = ultra rapide, pas de network sur les assets stables.
 *
 *  2. **HTML PAGES** (`/`, `/login`, `/dashboard/*`) → **NETWORK-FIRST**
 *     On essaie le réseau avec un timeout court (3s). Si succès → on cache et
 *     on sert. Si timeout → on tombe sur le cache. Ça garantit la fraîcheur
 *     SANS sacrifier l'offline.
 *
 *  3. **PUBLIC API** (currencies, locales, plans, fx-rates) → SWR
 *     OK pour ces données peu changeantes (cache 5 min côté serveur de toute
 *     façon, donc on ne sert jamais > 5 min stale en pratique).
 *
 *  4. **PRIVATE API** (auth, me, groups, etc.) → bypass SW (network direct)
 *
 *  5. **IMAGES** → cache-first 7j (rare changement)
 *
 *  6. **OFFLINE FALLBACK** → /offline.html si tout casse
 *
 * **Auto-update agressif** : combiné à `pwa-register.tsx` qui appelle
 * `registration.update()` au mount + `SKIP_WAITING` + reload-on-controllerchange,
 * un nouveau SW prend le contrôle dans la seconde qui suit la 1ère page load
 * post-déploiement.
 */

// IMPORTANT : bump cette version à chaque déploiement qui touche au SW
// ou aux stratégies de cache. Le `activate` event supprime tous les caches
// dont le nom ne match pas la version courante.
const CACHE_VERSION = "v5";
const STATIC_CACHE = `bmd-static-${CACHE_VERSION}`;
const ROUTES_CACHE = `bmd-routes-${CACHE_VERSION}`;
const IMAGES_CACHE = `bmd-images-${CACHE_VERSION}`;
const API_PUBLIC_CACHE = `bmd-api-public-${CACHE_VERSION}`;
const OFFLINE_FALLBACK = "/offline.html";

// Timeout pour la stratégie network-first des pages HTML.
// 3s est un compromis : assez long pour réseau correct, mais pas trop pour
// fallback rapide sur 3G/dégradée.
const NETWORK_TIMEOUT_MS = 3000;

// Routes pré-cachées dès l'install pour navigation offline immédiate
const PRECACHE_ROUTES = ["/", "/login"];

const PRECACHE_STATIC = [
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/bmd-logo.svg",
  OFFLINE_FALLBACK,
];

// ============================================================
// INSTALL : pré-cache + skipWaiting immédiat
// Le skipWaiting permet au nouveau SW de prendre le contrôle SANS attendre
// la fermeture des onglets. Combiné à clients.claim() dans `activate` et
// au reload-on-controllerchange côté pwa-register, c'est seamless.
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((c) =>
        c.addAll(PRECACHE_STATIC).catch(() => {}),
      ),
      caches.open(ROUTES_CACHE).then((c) =>
        c.addAll(PRECACHE_ROUTES).catch(() => {}),
      ),
    ]).then(() => self.skipWaiting()),
  );
});

// ============================================================
// ACTIVATE : nettoyage des anciens caches versionnés + claim immédiat
// ============================================================
self.addEventListener("activate", (event) => {
  const validCaches = new Set([
    STATIC_CACHE,
    ROUTES_CACHE,
    IMAGES_CACHE,
    API_PUBLIC_CACHE,
  ]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("bmd-") && !validCaches.has(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ============================================================
// MESSAGE : permet au client (pwa-register.tsx) de forcer l'activation
// d'une nouvelle version qui serait en WAITING. Sans ça, le nouveau SW
// reste bloqué tant que tous les onglets ne sont pas fermés (cas mobile
// PWA où ça n'arrive jamais).
// ============================================================
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ============================================================
// FETCH : routing par type de ressource
// ============================================================
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Bypass total pour requêtes cross-origin (CDN externes, analytics, etc.)
  if (url.origin !== self.location.origin) return;

  // === API privée : NEVER cache, network only ===
  // Données utilisateur, auth, etc. — fraîcheur critique + jamais en cache
  // (PII). On laisse passer sans intercepter pour minimiser l'overhead.
  if (
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/me/") ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/groups/") ||
    url.pathname.startsWith("/expenses/") ||
    url.pathname.startsWith("/settlements/") ||
    url.pathname.startsWith("/cross-settlements/") ||
    url.pathname.startsWith("/webhooks/") ||
    url.pathname.startsWith("/nps/") ||
    url.pathname.startsWith("/ads/")
  ) {
    return;
  }

  // === API publique safe-list : stale-while-revalidate ===
  // Données peu changeantes (déjà cachées 5 min côté serveur), pas de PII.
  const publicApiPaths = ["/currencies", "/locales", "/plans", "/fx-rates"];
  if (
    publicApiPaths.some(
      (p) => url.pathname === p || url.pathname.startsWith(p + "?"),
    )
  ) {
    event.respondWith(staleWhileRevalidate(request, API_PUBLIC_CACHE));
    return;
  }

  // === Hot-reload Next.js dev → bypass ===
  if (
    url.pathname.includes("/_next/webpack-hmr") ||
    url.search.includes("hot-update")
  ) {
    return;
  }

  // === Static assets hashés (immutable) → cache-first ===
  // Next.js met un hash dans les noms de fichiers. Quand le hash change,
  // c'est une nouvelle URL → pas besoin d'invalider. Cache-first = pas de
  // network sur les chunks stables, ultra rapide.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // === Images publiques → cache-first ===
  if (/\.(png|jpe?g|svg|webp|gif|ico|avif)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGES_CACHE));
    return;
  }

  // === HTML pages (navigation) → NETWORK-FIRST avec timeout 3s ===
  // Y1 — On essaie d'abord le réseau pour garantir la fraîcheur. Si > 3s,
  // on tombe sur le cache (offline-aware). Plus de "flash d'ancien contenu" :
  // l'utilisateur voit toujours la dernière version disponible.
  if (
    request.mode === "navigate" ||
    request.destination === "document" ||
    url.pathname === "/" ||
    url.pathname.startsWith("/dashboard") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/legal") ||
    url.pathname.startsWith("/cms") ||
    url.pathname.startsWith("/profile") ||
    url.pathname.startsWith("/join") ||
    url.pathname.startsWith("/pay")
  ) {
    event.respondWith(networkFirstWithTimeout(request, ROUTES_CACHE));
    return;
  }

  // === Fallback : network direct (pas de cache) ===
  // Tout ce qui n'a pas été matché ci-dessus. Better safe than sorry —
  // on évite de cacher quoi que ce soit qu'on n'a pas explicitement listé.
});

// ============================================================
// Stratégies de cache
// ============================================================

/**
 * Cache-first : on tente le cache, fallback réseau.
 * Idéal pour assets stables avec hash dans l'URL (immutable).
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok && fresh.type === "basic") {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    return caches.match(OFFLINE_FALLBACK) ?? Response.error();
  }
}

/**
 * Network-first avec timeout : tente le réseau (avec timeout), fallback cache.
 * Garantit la fraîcheur en cas de réseau OK, sans bloquer l'utilisateur en
 * cas de réseau dégradé ou offline.
 */
async function networkFirstWithTimeout(request, cacheName) {
  const cache = await caches.open(cacheName);

  // Course entre fetch et timeout. Si le fetch gagne → on cache + on sert.
  // Si le timeout gagne → on tombe sur le cache.
  const networkPromise = fetch(request).then((res) => {
    if (res.ok) {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
  });

  try {
    const winner = await Promise.race([networkPromise, timeoutPromise]);
    if (winner) return winner;
    // Timeout : tente le cache
    const cached = await cache.match(request);
    if (cached) {
      // Le fetch continue en arrière-plan (peut update le cache pour la
      // prochaine fois). Pas besoin de await.
      networkPromise.catch(() => {});
      return cached;
    }
    // Pas de cache + timeout réseau → on attend le réseau (peut-être lent)
    return await networkPromise;
  } catch {
    // Erreur réseau (offline) → tente le cache
    const cached = await cache.match(request);
    if (cached) return cached;
    return caches.match(OFFLINE_FALLBACK) ?? Response.error();
  }
}

/**
 * Stale-while-revalidate : sert le cache instantanément, refresh en BG.
 * Idéal pour données qu'on accepte de voir un peu stales (max 5 min en
 * pratique grâce au cache serveur).
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  return cached ?? (await networkPromise) ?? Response.error();
}

// ============================================================
// PUSH NOTIFICATIONS (préservé de v3)
// ============================================================
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "BMD", body: event.data.text() };
  }
  const title = payload.title ?? "BMD";
  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/icon-192.png",
    data: payload.data ?? {},
    tag: payload.tag,
    renotify: payload.renotify ?? false,
    requireInteraction: payload.requireInteraction ?? false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
