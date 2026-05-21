/**
 * Routes publiques pour les devises et taux de change (spec §4).
 *
 * Toutes en GET et public (config { skipAuth: true }) — utilisées par les
 * sélecteurs côté UI (création de groupe, conversion live d'une dépense).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { convert, getAllRates } from "../../lib/fx.js";
import { cacheGetOrSet } from "../../lib/cache.js";

export async function fxRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /currencies
   * Liste les devises actives. Mise en cache 5 min via le cache distribué
   * (Redis si configuré, in-memory sinon) — données quasi-statiques qui
   * changent uniquement quand l'admin active/désactive une devise.
   */
  app.get(
    "/currencies",
    { config: { skipAuth: true } as any },
    async () => {
      return cacheGetOrSet("currencies:all", 300, async () => {
        const currencies = await prisma.currency.findMany({
          where: { isActive: true },
          orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
        });
        return currencies.map((c) => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          region: c.region,
          flag: c.flag,
          decimals: c.decimals,
          isFixedToEur: c.fixedRateToEur !== null,
        }));
      });
    },
  );

  /**
   * GET /fx-rates
   * Tous les taux par rapport à EUR (pivot). Cache 60s — les taux ne
   * changent qu'aux ticks du scheduler FX (~1×/heure en prod).
   */
  app.get("/fx-rates", { config: { skipAuth: true } as any }, async () => {
    return cacheGetOrSet("fx:rates", 60, () => getAllRates());
  });

  /**
   * GET /site-config (V23) — public · configuration du site vitrine.
   *
   * Retourne les emails de contact, numéro WhatsApp, URL site —
   * configurables depuis la console admin via PATCH /admin/site-config.
   * Cache 5 min : la valeur change rarement et le site vitrine fait
   * 1 appel par session.
   *
   * Si la config singleton n'existe pas encore (DB fraîche), on retourne
   * les valeurs par défaut codées dans Prisma.schema. Robuste aux
   * environnements de dev/staging non seedés.
   */
  app.get("/site-config", { config: { skipAuth: true } as any }, async () => {
    return cacheGetOrSet("site-config:public", 300, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = await (prisma as any).siteConfig.findUnique({
        where: { id: "default" },
      });
      // Fallback aux defaults si pas encore créé
      return {
        supportEmail: cfg?.supportEmail ?? "hello@backmesdo.com",
        privacyEmail: cfg?.privacyEmail ?? "privacy@backmesdo.com",
        securityEmail: cfg?.securityEmail ?? "security@backmesdo.com",
        whatsappNumber: cfg?.whatsappNumber ?? "",
        siteUrl: cfg?.siteUrl ?? "https://www.backmesdo.com",
      };
    });
  });

  /**
   * GET /locales (spec §6.6) — public · liste des langues actives.
   * Cache 5 min — change rarement (admin active/désactive une langue).
   */
  app.get(
    "/locales",
    { config: { skipAuth: true } as any },
    async () => {
      return cacheGetOrSet("locales:active", 300, async () => {
        const locales = await prisma.locale.findMany({
          where: { isActive: true },
          orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
        });
        return locales.map((l) => ({
          code: l.code,
          name: l.name,
          flag: l.flag,
          direction: l.direction,
        }));
      });
    },
  );

  /**
   * GET /plans (spec §6.3) — public · liste des forfaits actifs.
   *
   * Query params optionnels :
   *  - country=FR  → résout la région du visiteur et applique les prix
   *    régionalisés (tier PPA). Si absent, on tente la résolution via le
   *    header CF-IPCountry (Cloudflare) ; si encore absent, on renvoie
   *    EUROPE_NA (prix de base EUR).
   *
   * Pour chaque plan, on joint le PlanPriceTier correspondant à la région
   * détectée. Si aucun tier n'existe pour cette région, on tombe sur le
   * prix de base du plan (Plan.priceCents en EUR).
   *
   * IMPORTANT — rétro-compat :
   *   L'ancienne forme retournait un Array<Plan>. La nouvelle forme retourne
   *   un objet { regionCode, plans, ... }. Pour ne pas casser l'admin
   *   existant, on garde la forme array si on détecte qu'aucun country
   *   n'est passé (ni en query, ni en header CF). Le front peut explicitement
   *   demander la nouvelle forme avec ?country=XX.
   *
   *   → Stratégie retenue : nouvelle forme TOUJOURS, l'admin a son endpoint
   *     /admin/plans dédié. Le front public est mis à jour pour consommer.
   */
  app.get(
    "/plans",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      // V71 — Empêche tout cache HTTP intermédiaire (proxy, CDN, browser).
      // L'admin doit voir ses mutations (activer/désactiver un plan) se
      // refléter instantanément sur le portail user. Le micro-cache front
      // (api-client memoized, TTL 30 s) est conservé pour ne pas refetch
      // à chaque navigation rapide, mais aucun cache HTTP/edge ne doit
      // survivre.
      reply.header("Cache-Control", "no-store, must-revalidate");
      reply.header("Pragma", "no-cache");

      const q = z
        .object({
          country: z.string().length(2).optional(),
        })
        .parse(req.query);

      // 1. Détection pays : query string > Cloudflare header
      const cfHeader = (req.headers["cf-ipcountry"] as string | undefined)
        ?.toUpperCase();
      const country = (q.country ?? cfHeader)?.toUpperCase();

      // 2. Trouve la région correspondante (défaut EUROPE_NA si rien)
      let regionCode = "EUROPE_NA";
      let regionName = "Europe & Amérique du Nord";
      let regionCurrency = "EUR";
      if (country) {
        const regions = await prisma.region.findMany({
          where: { isActive: true },
        });
        for (const r of regions) {
          const codes = (r.countryCodes as string[]) ?? [];
          if (codes.includes(country)) {
            regionCode = r.code;
            regionName = r.name;
            regionCurrency = r.defaultCurrency;
            break;
          }
        }
      }

      // 3. Charge plans + tiers en une seule requête
      // V47 · Filtre les plans legacy (_hidden=true dans limits) pour ne
      // montrer aux nouveaux users que la nouvelle grille (FREE/PERSONAL/
      // FAMILY/PRO/LIFETIME_PERSONAL). Les anciens plans restent en base
      // pour ne pas casser les abonnements actifs déjà migrés vers les
      // nouveaux codes.
      const rawPlans = await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        include: {
          priceTiers: {
            where: { regionCode },
          },
        },
      });
      const plans = rawPlans.filter((p) => {
        const limits = (p.limits as Record<string, any>) ?? {};
        return limits._hidden !== true;
      });

      return {
        regionCode,
        regionName,
        regionCurrency,
        detectedCountry: country ?? null,
        plans: plans.map((p) => {
          const tier = p.priceTiers[0];
          return {
            code: p.code,
            name: p.name,
            description: p.description,
            limits: p.limits,
            displayOrder: p.displayOrder,
            isActive: p.isActive,
            // Prix : on prend le tier de la région si dispo, sinon le prix
            // de base du plan (en EUR).
            priceCents: tier?.priceCents ?? p.priceCents,
            priceCentsYearly:
              tier?.priceCentsYearly ?? p.priceCentsYearly ?? null,
            currency: tier?.currency ?? "EUR",
            // Indique au front si un tier régional spécifique a été appliqué
            // (vs fallback prix de base) — utile pour afficher un disclaimer.
            isRegionalPrice: !!tier,
          };
        }),
      };
    },
  );

  /**
   * GET /fx-convert?from=XAF&to=EUR&amount=10000
   * Conversion live d'un montant.
   */
  app.get(
    "/fx-convert",
    { config: { skipAuth: true } as any },
    async (req) => {
      const q = z
        .object({
          from: z.string().length(3),
          to: z.string().length(3),
          amount: z.coerce.number().positive(),
        })
        .parse(req.query);
      try {
        const result = await convert(q.amount, q.from, q.to);
        return {
          from: q.from.toUpperCase(),
          to: q.to.toUpperCase(),
          amount: q.amount,
          converted: Number(result.toFixed(8)),
          // Arrondi affichage selon la devise cible
          formatted: result.toFixed(2),
        };
      } catch (e) {
        throw Errors.badRequest(
          "Conversion impossible : devise non supportée 💱",
          {
            tip: `Vérifie que ${q.from} et ${q.to} font partie des 25 devises BMD. Liste complète : GET /currencies`,
          },
        );
      }
    },
  );
}
