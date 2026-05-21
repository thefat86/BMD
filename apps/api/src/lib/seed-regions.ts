/**
 * Seed des régions tarifaires (spec §6.3 — pricing PPA).
 *
 * Quatre régions de référence, calquées sur le modèle Spotify/Netflix :
 *
 *   EUROPE_NA  — Tier 1 (€/£/$/CHF/CAD) — prix plein (PPA index 100)
 *   AFRICA_FR  — Tier 2 (XAF/XOF/MAD/DZD/TND/MGA/MUR/CDF) — ~36% (index 36)
 *   AFRICA_EN  — Tier 3 (NGN/KES/GHS/ZAR/UGX/TZS/ETB) — ~18% (index 18)
 *   ASIA_PPP   — Tier 4 (CNY/INR/IDR/PHP/VND/BDT/PKR) — ~22% (index 22)
 *
 * Les codes pays sont stockés en JSON (Json column Prisma) pour faciliter
 * l'édition admin (ajout/retrait d'un pays = update du champ countryCodes).
 *
 * Idempotent (upsert sur code). Au démarrage, ne ré-écrase PAS les
 * countryCodes / ppaIndex modifiés en admin — seuls name/description sont
 * mis à jour.
 */
import { prisma } from "./db.js";

interface RegionSeed {
  code: string;
  name: string;
  defaultCurrency: string;
  countryCodes: string[];
  description: string;
  ppaIndex: number;
  displayOrder: number;
}

const REGIONS: RegionSeed[] = [
  {
    code: "EUROPE_NA",
    name: "Europe & Amérique du Nord",
    defaultCurrency: "EUR",
    countryCodes: [
      // Zone euro
      "FR", "BE", "LU", "MC", "DE", "AT", "NL", "IT", "ES", "PT", "IE",
      "GR", "FI", "EE", "LV", "LT", "SK", "SI", "MT", "CY",
      // Europe non-euro mais comparable
      "GB", "CH", "NO", "SE", "DK", "IS",
      "PL", "CZ", "HU", "RO", "BG", "HR",
      // Amérique du Nord + Océanie
      "US", "CA", "AU", "NZ",
      // Asie haute (Japon / Corée / Singapour / Hong Kong)
      "JP", "KR", "SG", "HK", "TW",
      // Israël + Émirats Arabes Unis (revenus comparables)
      "IL", "AE", "QA", "SA",
    ],
    description: "Tier 1 — prix plein. Pays à fort pouvoir d'achat.",
    ppaIndex: 100,
    displayOrder: 1,
  },
  {
    code: "AFRICA_FR",
    name: "Afrique francophone & lusophone & Maghreb",
    defaultCurrency: "XAF",
    countryCodes: [
      // CEMAC (XAF)
      "CM", "CF", "TD", "CG", "GA", "GQ",
      // UEMOA (XOF)
      "SN", "CI", "ML", "BF", "NE", "BJ", "TG", "GW",
      // Maghreb
      "MA", "DZ", "TN",
      // Océan Indien francophone
      "MG", "MU", "KM", "DJ",
      // Lusophone
      "AO", "MZ", "CV", "ST",
      // Reste francophone
      "CD", "BI", "RW", "GA",
    ],
    description: "Tier 2 — Afrique francophone, lusophone, Maghreb. PPA ~36%.",
    ppaIndex: 36,
    displayOrder: 2,
  },
  {
    code: "AFRICA_EN",
    name: "Afrique anglophone & subsaharienne",
    defaultCurrency: "NGN",
    countryCodes: [
      "NG", "KE", "GH", "ZA", "UG", "TZ", "ZM", "ET", "MW", "NA",
      "BW", "LS", "SZ", "SL", "LR", "GM", "ZW", "SS", "SO", "ER",
    ],
    description: "Tier 3 — Afrique anglophone. PPA ~18% (forte hétérogénéité monétaire).",
    ppaIndex: 18,
    displayOrder: 3,
  },
  {
    code: "ASIA_PPP",
    name: "Asie émergente",
    defaultCurrency: "CNY",
    countryCodes: [
      "CN", "IN", "ID", "PH", "VN", "BD", "PK", "LK", "MM", "KH",
      "LA", "MY", "TH", "NP",
    ],
    description: "Tier 4 — Asie émergente (hors JP/KR/SG/HK qui sont en EUROPE_NA). PPA ~22%.",
    ppaIndex: 22,
    displayOrder: 4,
  },
];

/**
 * Tarifs initiaux pour chaque combinaison plan × région.
 *
 * Calcul : prix de base EUR (FREE=0, PREMIUM=2.99€, COMMUNITY=10€) ×
 *          ppaIndex / 100, converti dans la devise locale via taux moyen
 *          approximatif (ne nécessite PAS le service FX live — c'est un
 *          point de départ que l'admin peut affiner ensuite).
 *
 * On pourrait calculer dynamiquement avec FX, mais pour le seed on hard-code
 * pour rester déterministe et lisible.
 */
interface TierSeed {
  planCode: string;
  regionCode: string;
  currency: string;
  priceCents: number;
  priceCentsYearly?: number;
}

const TIERS: TierSeed[] = [
  // === EUROPE_NA — prix plein ===
  { planCode: "FREE", regionCode: "EUROPE_NA", currency: "EUR", priceCents: 0 },
  {
    planCode: "PREMIUM",
    regionCode: "EUROPE_NA",
    currency: "EUR",
    priceCents: 299,
    priceCentsYearly: 2900,
  },
  {
    planCode: "COMMUNITY",
    regionCode: "EUROPE_NA",
    currency: "EUR",
    priceCents: 1000,
    priceCentsYearly: 10000,
  },
  // === AFRICA_FR — PPA 36% — devise XAF (CFA) ===
  // Conversion: 2.99 EUR × 0.36 ≈ 1.08 EUR ≈ 700 XAF (taux fixe 655.957)
  // 10 EUR × 0.36 = 3.60 EUR ≈ 2360 XAF
  {
    planCode: "FREE",
    regionCode: "AFRICA_FR",
    currency: "XAF",
    priceCents: 0,
  },
  {
    planCode: "PREMIUM",
    regionCode: "AFRICA_FR",
    currency: "XAF",
    priceCents: 700, // ~1.07 EUR
    priceCentsYearly: 7000, // ~10.67 EUR (vs 12 mois × 700 = 8400 → 17% éco)
  },
  {
    planCode: "COMMUNITY",
    regionCode: "AFRICA_FR",
    currency: "XAF",
    priceCents: 2400, // ~3.66 EUR
    priceCentsYearly: 24000, // ~36.6 EUR (vs 28800 → 17% éco)
  },
  // === AFRICA_EN — PPA 18% — devise NGN (Naira) ===
  // 2.99 EUR × 0.18 = 0.54 EUR ≈ 850 NGN (taux ~1580 NGN/EUR fin 2025)
  // 10 EUR × 0.18 = 1.80 EUR ≈ 2840 NGN
  {
    planCode: "FREE",
    regionCode: "AFRICA_EN",
    currency: "NGN",
    priceCents: 0,
  },
  {
    planCode: "PREMIUM",
    regionCode: "AFRICA_EN",
    currency: "NGN",
    priceCents: 90000, // 900 NGN (Naira a 2 décimales)
    priceCentsYearly: 900000, // 9000 NGN
  },
  {
    planCode: "COMMUNITY",
    regionCode: "AFRICA_EN",
    currency: "NGN",
    priceCents: 300000, // 3000 NGN
    priceCentsYearly: 3000000, // 30000 NGN
  },
  // === ASIA_PPP — PPA 22% — devise INR (Inde, marché le plus large) ===
  // 2.99 EUR × 0.22 = 0.66 EUR ≈ 60 INR (taux ~92 INR/EUR)
  // 10 EUR × 0.22 = 2.20 EUR ≈ 200 INR
  {
    planCode: "FREE",
    regionCode: "ASIA_PPP",
    currency: "INR",
    priceCents: 0,
  },
  {
    planCode: "PREMIUM",
    regionCode: "ASIA_PPP",
    currency: "INR",
    priceCents: 6000, // 60 INR
    priceCentsYearly: 60000, // 600 INR
  },
  {
    planCode: "COMMUNITY",
    regionCode: "ASIA_PPP",
    currency: "INR",
    priceCents: 20000, // 200 INR
    priceCentsYearly: 200000, // 2000 INR
  },
];

export async function seedRegionsAndTiers(): Promise<void> {
  // 1. Régions — upsert idempotent
  for (const r of REGIONS) {
    try {
      await prisma.region.upsert({
        where: { code: r.code },
        create: {
          code: r.code,
          name: r.name,
          defaultCurrency: r.defaultCurrency,
          countryCodes: r.countryCodes as any,
          description: r.description,
          ppaIndex: r.ppaIndex,
          displayOrder: r.displayOrder,
        },
        update: {
          // Ne ré-écrase PAS countryCodes / ppaIndex (l'admin a peut-être
          // modifié) — on met à jour juste les libellés.
          name: r.name,
          description: r.description,
        },
      });
    } catch (err) {
      console.warn("[seed-regions] skip", r.code, (err as Error).message);
    }
  }

  // 2. Tarifs régionalisés — upsert sur (planCode, regionCode)
  for (const t of TIERS) {
    try {
      await prisma.planPriceTier.upsert({
        where: {
          planCode_regionCode: {
            planCode: t.planCode,
            regionCode: t.regionCode,
          },
        },
        create: {
          planCode: t.planCode,
          regionCode: t.regionCode,
          currency: t.currency,
          priceCents: t.priceCents,
          priceCentsYearly: t.priceCentsYearly ?? null,
        },
        update: {
          // Ne ré-écrase PAS le prix si l'admin l'a modifié — on met juste
          // la devise/devise de référence à jour si elle a changé en seed.
          // Pour modifier les prix : passer par l'admin UI.
          currency: t.currency,
        },
      });
    } catch (err) {
      console.warn(
        "[seed-tiers] skip",
        t.planCode,
        t.regionCode,
        (err as Error).message,
      );
    }
  }
}
