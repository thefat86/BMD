/**
 * <AuthBootScript /> · gate auth synchrone avant l'hydratation React.
 *
 * V88.A — Sur Pixel 5 (Playwright) en dev cold-start, la compilation Next.js
 * de /dashboard prend >15s. La page atteint enfin `domcontentloaded`, mais
 * `router.replace("/login")` dans le useEffect ne s'exécute qu'APRÈS l'hydratation
 * React, qui prend encore plusieurs secondes. Conséquence : le test
 * `waitForURL(/\/login/, { timeout: 15_000 })` timeout, même si la page va
 * finalement rediriger.
 *
 * Ce composant inline un <script> synchrone dans <head> qui :
 *  1. Vérifie si l'URL actuelle est une route protégée (/dashboard, /admin, ...)
 *  2. Si oui, et qu'il n'y a pas de bmd_token en localStorage → location.replace("/login")
 *  3. Exécution AVANT le 1er paint, AVANT React hydration → instantané
 *
 * Effets secondaires positifs (au-delà du fix E2E) :
 *  - UX prod : plus de flash dashboard vide avant redirect (le navigateur
 *    affiche directement /login).
 *  - Sentry : moins d'erreurs API 401 sur cold-load car on évite le tentative
 *    de fetch /me sans token.
 *  - Mobile cold-start : sur réseau lent + bundle JS qui rame, la redirection
 *    arrive sans attendre que React ait fini de monter le tree.
 *
 * Le useEffect dans /dashboard/page.tsx reste comme défense en profondeur
 * (cas extrême où JS s'exécute mais localStorage devient indisponible
 * entre-temps, mode privé Safari, etc.).
 */

const TOKEN_KEY = "bmd_token";

/**
 * Routes protégées qui nécessitent un token pour être affichées.
 * Toute route hors de cette liste est considérée publique (login, legal,
 * marketing, join/pay tokens).
 *
 * IMPORTANT : on utilise des prefixes plutôt qu'une regex pour garder le
 * script ultra-court (KB envoyé inline dans chaque page).
 */
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

export function AuthBootScript(): JSX.Element {
  // Le script est compact pour minimiser l'inline payload. Try/catch global
  // pour qu'une exception (ex. localStorage bloqué) ne brique pas le boot —
  // on laisse alors le useEffect prendre le relais comme avant.
  //
  // V90 — Skip sur Capacitor : sur iOS WebView, `window.location.replace`
  // peut être interprété comme une nav externe et OUVRIR Safari par-dessus
  // l'app native (bug observé en dev avec server.url=http://LAN-IP:3000).
  // Le useEffect React dans /dashboard/page.tsx fait déjà le redirect côté
  // client de toute façon — on garde le bootscript UNIQUEMENT pour les
  // browsers web où le cold-start Next.js dev compile prend >15s (Pixel 5
  // Playwright). Sur Capacitor, l'app est embed donc le timing est OK.
  const code = `
(function() {
  try {
    // V90 — Bail out sur Capacitor (window.Capacitor injecté par le runtime
    // natif iOS/Android). Sur ces plateformes, le redirect synchrone peut
    // ouvrir Safari/Chrome au lieu de naviguer dans la WebView.
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;
    var p = window.location.pathname;
    var needsAuth = false;
    ${PROTECTED_PREFIXES.map(
      (prefix) =>
        `if (p === '${prefix}' || p.indexOf('${prefix}/') === 0) needsAuth = true;`,
    ).join("\n    ")}
    if (!needsAuth) return;
    var token = null;
    try { token = window.localStorage.getItem('${TOKEN_KEY}'); } catch (e) {}
    if (!token) {
      // V88.A — replace (pas href) pour ne pas polluer l'historique
      // (back button doit retourner d'où l'utilisateur venait, pas
      // sur /dashboard qu'il n'a jamais vraiment "visité").
      window.location.replace('/login');
    }
  } catch (e) {
    // Si localStorage / location indisponible, on laisse le useEffect
    // prendre le relais (filet de sécurité). Pas de log : ce script
    // tourne avant que Sentry soit chargé.
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
