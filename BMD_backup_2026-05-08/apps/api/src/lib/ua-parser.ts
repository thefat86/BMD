/**
 * Parser User-Agent minimaliste (sans dépendance npm).
 *
 * Extrait UNIQUEMENT la famille du navigateur + l'OS — pas de version,
 * pas de fingerprint avancé. Volontairement RGPD-friendly :
 *  - aucune empreinte canvas / WebGL
 *  - aucun stockage d'IP brute (juste le pays dérivé via header proxy)
 *  - les valeurs sont stables dans le temps (pas de granularité par version)
 *
 * 6 navigateurs reconnus + 6 OS. Tout le reste tombe en "Other".
 */

export interface ParsedUserAgent {
  browser: "Chrome" | "Firefox" | "Safari" | "Edge" | "Opera" | "Other";
  os: "macOS" | "iOS" | "Android" | "Windows" | "Linux" | "Other";
}

export function parseUserAgent(ua: string | undefined | null): ParsedUserAgent {
  const u = (ua ?? "").toLowerCase();

  // OS — ordre important : iOS doit être détecté avant macOS car Safari iOS
  // peut contenir "Mac OS X" dans le UA
  let os: ParsedUserAgent["os"] = "Other";
  if (/iphone|ipad|ipod|ios/.test(u)) os = "iOS";
  else if (/android/.test(u)) os = "Android";
  else if (/macintosh|mac os x/.test(u)) os = "macOS";
  else if (/windows/.test(u)) os = "Windows";
  else if (/linux/.test(u)) os = "Linux";

  // Browser — ordre important : Edge contient "Chrome" dans son UA, Opera aussi
  let browser: ParsedUserAgent["browser"] = "Other";
  if (/\bedg\b|edge\//.test(u)) browser = "Edge";
  else if (/\bopr\b|opera/.test(u)) browser = "Opera";
  else if (/firefox/.test(u)) browser = "Firefox";
  else if (/chrome/.test(u)) browser = "Chrome";
  else if (/safari/.test(u)) browser = "Safari"; // après Chrome car Chrome contient "Safari"

  return { browser, os };
}

/**
 * Récupère le pays depuis les headers proxy / CDN courants.
 * Ordre de priorité :
 *  - CF-IPCountry (Cloudflare)
 *  - X-Vercel-IP-Country (Vercel)
 *  - X-Country-Code (générique)
 *  - "??" si rien trouvé
 *
 * Pas d'appel à un service GeoIP externe (RGPD-friendly + pas de dep).
 * Si l'app n'est pas derrière Cloudflare/Vercel, on retourne "??" et la
 * détection "nouveau pays" est désactivée — pas de faux positifs.
 */
export function extractCountryFromHeaders(
  headers: Record<string, unknown> | undefined,
): string {
  if (!headers) return "??";
  const get = (k: string): string | undefined => {
    const v = headers[k] ?? headers[k.toLowerCase()];
    return typeof v === "string" ? v.trim() : undefined;
  };
  const country =
    get("cf-ipcountry") ||
    get("x-vercel-ip-country") ||
    get("x-country-code");
  if (!country || country.length !== 2) return "??";
  return country.toUpperCase();
}
