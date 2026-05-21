/**
 * V151.F — Mapping pays ISO 3166-1 alpha-2 → devise ISO 4217.
 *
 * Utilisé pour afficher les prix dans la devise locale de l'utilisateur final
 * sur la page tarifs publique (signature électronique), conversion automatique
 * depuis EUR via le service FX.
 *
 * Les devises sans décimales (XOF, XAF, JPY, KRW, etc.) sont gérées au niveau
 * formatting front (helpers.ts → ZERO_DECIMAL).
 */

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // Zone Euro
  FR: "EUR", DE: "EUR", IT: "EUR", ES: "EUR", PT: "EUR", BE: "EUR",
  LU: "EUR", NL: "EUR", AT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR",
  CY: "EUR", MT: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR",
  LT: "EUR", HR: "EUR",

  // Europe hors zone Euro
  CH: "CHF", GB: "GBP", NO: "NOK", SE: "SEK", DK: "DKK", IS: "ISK",
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD",
  TR: "TRY", UA: "UAH", RU: "RUB",

  // Amériques
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP",
  CO: "COP", PE: "PEN",

  // Afrique de l'Ouest CFA (BCEAO)
  CI: "XOF", SN: "XOF", BJ: "XOF", BF: "XOF", ML: "XOF", NE: "XOF",
  TG: "XOF", GW: "XOF",

  // Afrique Centrale CFA (BEAC)
  CM: "XAF", GA: "XAF", CG: "XAF", CF: "XAF", TD: "XAF", GQ: "XAF",

  // Afrique anglophone / autres
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", UG: "UGX", TZ: "TZS",
  RW: "RWF", ET: "ETB", SD: "SDG", EG: "EGP", MA: "MAD", DZ: "DZD",
  TN: "TND", LY: "LYD", MU: "MUR", MG: "MGA", CD: "CDF", AO: "AOA",
  MZ: "MZN", BW: "BWP", NA: "NAD", ZM: "ZMW", ZW: "ZWL", SL: "SLL",
  LR: "LRD", GM: "GMD", GN: "GNF", CV: "CVE",

  // Moyen-Orient
  SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  JO: "JOD", LB: "LBP", IL: "ILS", IR: "IRR", IQ: "IQD",

  // Asie
  CN: "CNY", JP: "JPY", KR: "KRW", IN: "INR", PK: "PKR", BD: "BDT",
  ID: "IDR", VN: "VND", TH: "THB", PH: "PHP", MY: "MYR", SG: "SGD",
  HK: "HKD", TW: "TWD",

  // Océanie
  AU: "AUD", NZ: "NZD",
};

/**
 * Renvoie la devise locale d'un pays (code ISO 4217), ou EUR par défaut.
 * Accepte le wildcard "*" qui retourne aussi EUR.
 */
export function getLocalCurrencyForCountry(countryCode: string): string {
  const cc = countryCode.toUpperCase();
  if (cc === "*") return "EUR";
  return COUNTRY_TO_CURRENCY[cc] ?? "EUR";
}
