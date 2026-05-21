/**
 * Service FX (Foreign Exchange) — spec §4.
 *
 * Architecture :
 *  - EUR est la devise pivot. On stocke "1 EUR = N {currency}" pour chaque devise.
 *  - Conversion A → B : amount × (rateA → EUR) / (rateB → EUR)
 *      (équivalent à : "passer par EUR au milieu")
 *  - Cache mémoire 60s pour éviter de spammer le provider externe.
 *  - Source par défaut : exchangerate.host (gratuit, sans clé). Si une clé
 *    OPENEXCHANGERATES_KEY est configurée, on switch automatiquement.
 *  - Devises de zone CFA : taux fixe (655.957 EUR), jamais touchées par le provider.
 *
 * Marge BMD : configurable via la console admin (par défaut 0.4%, spec §6.5).
 * Pour l'instant on ne l'applique pas dans `convert()` — on retourne le mid-rate.
 * Une future itération exposera `convertWithFee()` pour les vrais transferts.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

const RATES_CACHE_TTL_MS = 60 * 1000;

interface CachedRates {
  /** Map "code → 1 EUR vaut N <code>" */
  rates: Map<string, number>;
  loadedAt: number;
}

let cache: CachedRates | null = null;

/**
 * Récupère tous les taux à jour (mid-market vs EUR).
 * Stratégie :
 *  1. Si cache mémoire frais (< 60s) → on retourne
 *  2. Sinon : on lit la table FxRate (mise à jour par le scheduler ou manuellement)
 *  3. On charge en cache mémoire pour la prochaine seconde
 */
async function loadRates(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.loadedAt < RATES_CACHE_TTL_MS) {
    return cache.rates;
  }
  const rows = await prisma.fxRate.findMany();
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.code, parseFloat(r.rateToEur.toString()));
  // Garantit toujours EUR=1 au cas où le seed n'aurait pas tourné
  if (!map.has("EUR")) map.set("EUR", 1);
  cache = { rates: map, loadedAt: Date.now() };
  return map;
}

/** Force le rechargement du cache (à appeler après update de FxRate). */
export function invalidateFxCache(): void {
  cache = null;
}

/**
 * Convertit un montant d'une devise vers une autre, au mid-rate.
 * Throw si une devise n'a pas de taux connu.
 */
export async function convert(
  amount: number | string,
  from: string,
  to: string,
): Promise<number> {
  if (from === to) return typeof amount === "string" ? parseFloat(amount) : amount;
  const rates = await loadRates();
  const rateFrom = rates.get(from.toUpperCase());
  const rateTo = rates.get(to.toUpperCase());
  if (!rateFrom || !rateTo) {
    throw new Error(
      `Taux indisponible pour ${from} ou ${to}. Vérifie que la devise est seedée et que le scheduler tourne.`,
    );
  }
  const amt = typeof amount === "string" ? parseFloat(amount) : amount;
  // amount (from) → EUR : amount / rateFrom
  // EUR → to : eur × rateTo
  return (amt / rateFrom) * rateTo;
}

/**
 * Helper : convertit en gardant la précision Decimal pour usage Prisma.
 */
export async function convertDecimal(
  amount: Prisma.Decimal | string,
  from: string,
  to: string,
): Promise<Prisma.Decimal> {
  const result = await convert(
    amount instanceof Prisma.Decimal ? amount.toString() : amount,
    from,
    to,
  );
  return new Prisma.Decimal(result.toFixed(8));
}

/**
 * Récupère tous les taux (pour l'API publique GET /fx-rates).
 * Format : { code → rateToEur, fetchedAt }
 */
export async function getAllRates(): Promise<{
  base: "EUR";
  rates: Record<string, number>;
  fetchedAt: string;
}> {
  const rates = await loadRates();
  const obj: Record<string, number> = {};
  for (const [code, val] of rates.entries()) obj[code] = val;
  return {
    base: "EUR",
    rates: obj,
    fetchedAt: new Date(cache?.loadedAt ?? Date.now()).toISOString(),
  };
}

// ============================================================
// Refresh depuis provider externe (à appeler depuis scheduler)
// ============================================================

interface ProviderResponse {
  base: "EUR";
  rates: Record<string, number>;
}

async function fetchFromExchangerateHost(): Promise<ProviderResponse> {
  // exchangerate.host : gratuit, sans clé, mid-market
  const r = await fetch("https://api.exchangerate.host/latest?base=EUR");
  if (!r.ok) throw new Error(`exchangerate.host ${r.status}`);
  const body = (await r.json()) as ProviderResponse;
  if (!body.rates) throw new Error("Réponse provider sans champ rates");
  return body;
}

/**
 * Open Exchange Rates : fournisseur premium (clé API requise).
 *
 * Le plan Free retourne des taux base USD uniquement (limite payante : base
 * EUR direct). On reconvertit donc tout en base EUR côté client : pour une
 * devise X, on a USD→X (en oxr.rates[X]) et USD→EUR (en oxr.rates.EUR).
 * Donc 1 EUR = (1/oxr.rates.EUR) USD = (1/oxr.rates.EUR × oxr.rates[X]) X.
 *
 * Mise à jour : 1× par heure (free tier = 1000 requêtes/mois → ~33/jour).
 * Notre scheduler tournant toutes les heures (3600s) tient largement.
 */
async function fetchFromOpenExchangeRates(
  appId: string,
): Promise<ProviderResponse> {
  const r = await fetch(
    `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}`,
  );
  if (!r.ok) throw new Error(`openexchangerates ${r.status}`);
  const body = (await r.json()) as {
    base: string;
    rates: Record<string, number>;
  };
  if (!body.rates) throw new Error("Réponse OXR sans champ rates");

  // Reconvertit base USD → base EUR
  const usdToEur = body.rates.EUR;
  if (!usdToEur || usdToEur <= 0) {
    throw new Error("OXR : taux EUR manquant dans la réponse");
  }
  const eurBased: Record<string, number> = { EUR: 1 };
  for (const [code, usdRate] of Object.entries(body.rates)) {
    if (code === "EUR") continue;
    // Si 1 USD = usdRate <code> ET 1 USD = usdToEur EUR,
    // alors 1 EUR = (usdRate / usdToEur) <code>.
    eurBased[code] = usdRate / usdToEur;
  }
  return { base: "EUR", rates: eurBased };
}

/**
 * Met à jour la table FxRate depuis le provider configuré.
 * Devises CFA non touchées (parité fixe).
 * Idempotent — appelable depuis n'importe quel cron.
 */
export async function refreshFxRates(): Promise<{
  updated: number;
  skipped: number;
  source: string;
}> {
  // Récupère la liste des devises actives + détermine lesquelles ont un taux fixe
  const supported = await prisma.currency.findMany({
    where: { isActive: true },
    select: { code: true, fixedRateToEur: true },
  });
  const fixedCodes = new Set(
    supported.filter((c) => c.fixedRateToEur).map((c) => c.code),
  );
  const supportedSet = new Set(supported.map((c) => c.code));

  // Provider routing : Open Exchange Rates si clé configurée, sinon
  // exchangerate.host (gratuit, sans clé). En cas d'échec d'OXR, on retombe
  // automatiquement sur exchangerate.host pour ne pas couper le service.
  const oxrKey = process.env.OPENEXCHANGERATES_KEY?.trim();
  let providerData: ProviderResponse;
  let providerSource = "exchangerate.host";
  try {
    if (oxrKey) {
      providerData = await fetchFromOpenExchangeRates(oxrKey);
      providerSource = "openexchangerates";
    } else {
      providerData = await fetchFromExchangerateHost();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `[fx] primary provider ${providerSource} failed:`,
      e instanceof Error ? e.message : e,
    );
    // Fallback : exchangerate.host. Si lui aussi tombe, on rend la main.
    if (oxrKey) {
      try {
        providerData = await fetchFromExchangerateHost();
        providerSource = "exchangerate.host (fallback)";
      } catch (e2) {
        console.error(
          "[fx] both providers failed:",
          e2 instanceof Error ? e2.message : e2,
        );
        return { updated: 0, skipped: supported.length, source: "error" };
      }
    } else {
      return { updated: 0, skipped: supported.length, source: "error" };
    }
  }

  let updated = 0;
  let skipped = 0;
  for (const [code, rate] of Object.entries(providerData.rates)) {
    if (!supportedSet.has(code)) {
      skipped += 1;
      continue;
    }
    if (fixedCodes.has(code)) {
      // Devise CFA : on ne touche pas, le seed maintient la parité historique
      skipped += 1;
      continue;
    }
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      skipped += 1;
      continue;
    }
    // Spec §6.5 : si l'admin a surchargé le taux manuellement, on ne le
    // refresh PAS depuis le provider (sinon ça écraserait sa décision).
    // Pour revenir au provider, l'admin appelle DELETE /admin/fx-rates/:code/override.
    const existing = await prisma.fxRate.findUnique({
      where: { code },
      select: { source: true },
    });
    if (existing && existing.source === "manual_override") {
      skipped += 1;
      continue;
    }
    await prisma.fxRate.upsert({
      where: { code },
      create: {
        code,
        rateToEur: new Prisma.Decimal(rate.toFixed(8)),
        source: providerSource,
      },
      update: {
        rateToEur: new Prisma.Decimal(rate.toFixed(8)),
        source: providerSource,
        fetchedAt: new Date(),
      },
    });
    updated += 1;
  }
  // Vide le cache pour que les requêtes suivantes voient les nouveaux taux
  invalidateFxCache();

  return { updated, skipped, source: providerSource };
}
