/**
 * Seed des 25 devises supportées par BMD (spec §4.2 + §4.3).
 *
 * 18 devises africaines + 7 majeures internationales.
 * Pour les zones CFA : `fixedRateToEur` est défini (parité fixe historique).
 * Pour les autres : `null` → taux dynamique via FxRate (cache 60s).
 *
 * Idempotent : upsert sur le code. Les modifications admin (isActive, displayOrder)
 * ne sont pas réécrasées.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

interface CurrencySeed {
  code: string;
  name: string;
  symbol: string;
  fixedRateToEur?: string; // ex: "655.957" pour XAF
  region: string;
  flag: string;
  decimals?: number;
  displayOrder: number;
}

const CURRENCIES: CurrencySeed[] = [
  // === Devises majeures (displayOrder 1-10) ===
  { code: "EUR", name: "Euro", symbol: "€", region: "Zone Euro", flag: "🇪🇺", displayOrder: 1 },
  { code: "USD", name: "Dollar US", symbol: "$", region: "États-Unis", flag: "🇺🇸", displayOrder: 2 },
  { code: "GBP", name: "Livre sterling", symbol: "£", region: "Royaume-Uni", flag: "🇬🇧", displayOrder: 3 },
  { code: "CHF", name: "Franc suisse", symbol: "CHF", region: "Suisse", flag: "🇨🇭", displayOrder: 4 },
  { code: "CAD", name: "Dollar canadien", symbol: "C$", region: "Canada", flag: "🇨🇦", displayOrder: 5 },
  { code: "AUD", name: "Dollar australien", symbol: "A$", region: "Australie", flag: "🇦🇺", displayOrder: 6 },
  { code: "CNY", name: "Yuan", symbol: "¥", region: "Chine", flag: "🇨🇳", displayOrder: 7 },

  // === Zone CFA (taux fixes) ===
  {
    code: "XAF",
    name: "Franc CFA BEAC",
    symbol: "FCFA",
    fixedRateToEur: "655.957",
    region: "CEMAC (Cameroun, Tchad, Centrafrique, Congo, Gabon, Guinée Éq.)",
    flag: "🇨🇲",
    decimals: 0,
    displayOrder: 11,
  },
  {
    code: "XOF",
    name: "Franc CFA BCEAO",
    symbol: "FCFA",
    fixedRateToEur: "655.957",
    region: "UEMOA (Sénégal, Côte d'Ivoire, Mali, Burkina, Bénin, Togo, Niger, Guinée-Bissau)",
    flag: "🇸🇳",
    decimals: 0,
    displayOrder: 12,
  },

  // === Maghreb ===
  { code: "MAD", name: "Dirham marocain", symbol: "DH", region: "Maroc", flag: "🇲🇦", displayOrder: 20 },
  { code: "TND", name: "Dinar tunisien", symbol: "DT", region: "Tunisie", flag: "🇹🇳", displayOrder: 21, decimals: 3 },
  { code: "DZD", name: "Dinar algérien", symbol: "DA", region: "Algérie", flag: "🇩🇿", displayOrder: 22 },
  { code: "EGP", name: "Livre égyptienne", symbol: "E£", region: "Égypte", flag: "🇪🇬", displayOrder: 23 },

  // === Afrique de l'Ouest anglophone ===
  { code: "NGN", name: "Naira", symbol: "₦", region: "Nigeria", flag: "🇳🇬", displayOrder: 30 },
  { code: "GHS", name: "Cedi", symbol: "GH₵", region: "Ghana", flag: "🇬🇭", displayOrder: 31 },

  // === Afrique de l'Est ===
  { code: "KES", name: "Shilling kényan", symbol: "KSh", region: "Kenya", flag: "🇰🇪", displayOrder: 40, decimals: 0 },
  { code: "TZS", name: "Shilling tanzanien", symbol: "TSh", region: "Tanzanie", flag: "🇹🇿", displayOrder: 41, decimals: 0 },
  { code: "UGX", name: "Shilling ougandais", symbol: "USh", region: "Ouganda", flag: "🇺🇬", displayOrder: 42, decimals: 0 },
  { code: "RWF", name: "Franc rwandais", symbol: "FRw", region: "Rwanda", flag: "🇷🇼", displayOrder: 43, decimals: 0 },
  { code: "ETB", name: "Birr", symbol: "Br", region: "Éthiopie", flag: "🇪🇹", displayOrder: 44 },

  // === Afrique centrale + australe ===
  { code: "CDF", name: "Franc congolais", symbol: "FC", region: "RDC", flag: "🇨🇩", displayOrder: 50, decimals: 0 },
  { code: "ZAR", name: "Rand", symbol: "R", region: "Afrique du Sud", flag: "🇿🇦", displayOrder: 51 },
];

export async function seedCurrencies(): Promise<void> {
  for (const c of CURRENCIES) {
    try {
      await prisma.currency.upsert({
        where: { code: c.code },
        create: {
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          region: c.region,
          flag: c.flag,
          decimals: c.decimals ?? 2,
          displayOrder: c.displayOrder,
          fixedRateToEur: c.fixedRateToEur
            ? new Prisma.Decimal(c.fixedRateToEur)
            : null,
        },
        // À la mise à jour, on ne touche pas à isActive ni displayOrder
        // (l'admin peut les avoir modifiés depuis la console).
        update: {
          name: c.name,
          symbol: c.symbol,
          region: c.region,
          flag: c.flag,
          decimals: c.decimals ?? 2,
          fixedRateToEur: c.fixedRateToEur
            ? new Prisma.Decimal(c.fixedRateToEur)
            : null,
        },
      });

      // Si zone CFA : seed aussi le FxRate avec source "fixed" (parité historique)
      if (c.fixedRateToEur) {
        await prisma.fxRate.upsert({
          where: { code: c.code },
          create: {
            code: c.code,
            rateToEur: new Prisma.Decimal(c.fixedRateToEur),
            source: "fixed",
          },
          update: {
            rateToEur: new Prisma.Decimal(c.fixedRateToEur),
            source: "fixed",
          },
        });
      }
    } catch (err) {
      // Si la table n'existe pas encore (avant migration), log et continue
      // eslint-disable-next-line no-console
      console.warn("[seed-currencies] skip", c.code, (err as Error).message);
    }
  }
  // Toujours seed EUR avec rate 1.0 (devise pivot)
  try {
    await prisma.fxRate.upsert({
      where: { code: "EUR" },
      create: { code: "EUR", rateToEur: new Prisma.Decimal("1"), source: "fixed" },
      update: { rateToEur: new Prisma.Decimal("1"), source: "fixed" },
    });
  } catch {
    /* ignore */
  }
}
