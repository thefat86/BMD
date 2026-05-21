/**
 * Détection du pays du visiteur côté client.
 *
 * Stratégie en cascade (premier qui répond gagne) :
 *  1. Override local : sessionStorage["bmd:country"] (mis par /pay sur tag QR)
 *  2. URL query string (?country=FR) — debug + lien partageable
 *  3. Profil utilisateur (User.defaultCurrency → mapping pays)
 *     [non implémenté ici car pas async — utilisé par les routes serveur]
 *  4. Intl.DateTimeFormat().resolvedOptions().timeZone
 *     (Africa/Douala → CM, Europe/Paris → FR, Asia/Shanghai → CN)
 *  5. navigator.language (en-NG, fr-CI…) — second choix
 *  6. fallback : null (le serveur appliquera EUROPE_NA par défaut)
 *
 * IMPORTANT — la détection UI est purement informative. Le serveur fait
 * sa propre résolution avec le header CF-IPCountry de Cloudflare en prod,
 * qui est la source autoritative pour le pricing (anti-VPN naïve via IP +
 * vérification du moyen de paiement au moment du paiement réel).
 */

const TZ_TO_COUNTRY: Record<string, string> = {
  // Europe
  "Europe/Paris": "FR",
  "Europe/Brussels": "BE",
  "Europe/Berlin": "DE",
  "Europe/Vienna": "AT",
  "Europe/Amsterdam": "NL",
  "Europe/Rome": "IT",
  "Europe/Madrid": "ES",
  "Europe/Lisbon": "PT",
  "Europe/Dublin": "IE",
  "Europe/Athens": "GR",
  "Europe/Helsinki": "FI",
  "Europe/Stockholm": "SE",
  "Europe/Copenhagen": "DK",
  "Europe/Oslo": "NO",
  "Europe/Zurich": "CH",
  "Europe/London": "GB",
  // Afrique francophone
  "Africa/Douala": "CM",
  "Africa/Bangui": "CF",
  "Africa/Ndjamena": "TD",
  "Africa/Brazzaville": "CG",
  "Africa/Libreville": "GA",
  "Africa/Malabo": "GQ",
  "Africa/Dakar": "SN",
  "Africa/Abidjan": "CI",
  "Africa/Bamako": "ML",
  "Africa/Ouagadougou": "BF",
  "Africa/Niamey": "NE",
  "Africa/Cotonou": "BJ",
  "Africa/Lome": "TG",
  "Africa/Bissau": "GW",
  "Africa/Casablanca": "MA",
  "Africa/Algiers": "DZ",
  "Africa/Tunis": "TN",
  "Africa/Kinshasa": "CD",
  "Africa/Lubumbashi": "CD",
  "Africa/Bujumbura": "BI",
  "Africa/Kigali": "RW",
  "Africa/Djibouti": "DJ",
  "Africa/Luanda": "AO",
  "Africa/Maputo": "MZ",
  "Indian/Antananarivo": "MG",
  "Indian/Mauritius": "MU",
  "Indian/Comoro": "KM",
  // Afrique anglophone
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Accra": "GH",
  "Africa/Johannesburg": "ZA",
  "Africa/Kampala": "UG",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Lusaka": "ZM",
  "Africa/Addis_Ababa": "ET",
  "Africa/Blantyre": "MW",
  "Africa/Windhoek": "NA",
  "Africa/Gaborone": "BW",
  "Africa/Maseru": "LS",
  "Africa/Mbabane": "SZ",
  "Africa/Freetown": "SL",
  "Africa/Monrovia": "LR",
  "Africa/Banjul": "GM",
  "Africa/Harare": "ZW",
  // Asie / Amériques
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Singapore": "SG",
  "Asia/Hong_Kong": "HK",
  "Asia/Shanghai": "CN",
  "Asia/Kolkata": "IN",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Dhaka": "BD",
  "Asia/Karachi": "PK",
  "Asia/Bangkok": "TH",
  "Asia/Kuala_Lumpur": "MY",
  "Australia/Sydney": "AU",
  "Pacific/Auckland": "NZ",
};

/**
 * Détecte le pays du visiteur. Retourne un code ISO 3166-1 alpha-2 (ex: "FR")
 * ou null si on n'a pas pu déterminer.
 *
 * Safe à appeler côté SSR : retourne null pendant l'hydratation, le composant
 * appellera de nouveau au mount client.
 */
export function detectCountry(): string | null {
  if (typeof window === "undefined") return null;

  // 1. Override session
  try {
    const stored = window.sessionStorage.getItem("bmd:country");
    if (stored && stored.length === 2) return stored.toUpperCase();
  } catch {
    /* ignore */
  }

  // 2. Query string ?country=XX (utile pour debug + lien partageable)
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("country");
    if (q && q.length === 2) return q.toUpperCase();
  } catch {
    /* ignore */
  }

  // 3. Timezone IANA → pays
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_TO_COUNTRY[tz]) return TZ_TO_COUNTRY[tz]!;
  } catch {
    /* ignore */
  }

  // 4. navigator.language (en-NG → NG, fr-CI → CI, fr-FR → FR)
  try {
    const lang = navigator.language || (navigator.languages ?? [])[0];
    if (lang) {
      const parts = lang.split("-");
      if (parts.length >= 2) {
        const cc = parts[parts.length - 1]!.toUpperCase();
        if (cc.length === 2) return cc;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Permet à l'utilisateur de forcer un pays (override pour test, ou "voir
 * les prix de mon pays d'origine" pour un expat). Persistance sessionStorage
 * uniquement (pas localStorage) pour respect RGPD : on ne garde pas l'info
 * entre sessions.
 */
export function setCountryOverride(country: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (country) {
      window.sessionStorage.setItem("bmd:country", country.toUpperCase());
    } else {
      window.sessionStorage.removeItem("bmd:country");
    }
  } catch {
    /* ignore quota errors */
  }
}
