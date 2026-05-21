/**
 * V151 — Routes tarification signatures.
 *
 * Public :
 *   GET /signature-pricing?countryCode=FR  → renvoie les 3 niveaux activés pour ce pays
 *
 * Admin (SuperAdmin uniquement) :
 *   GET    /admin/signature-pricing                  → liste exhaustive (toutes lignes)
 *   POST   /admin/signature-pricing                  → upsert
 *   DELETE /admin/signature-pricing/:id              → delete
 *   PATCH  /admin/signature-pricing/:id/enabled      → toggle rapide
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getSignaturePricingForCountry,
  listAllSignaturePricings,
  upsertSignaturePricing,
  deleteSignaturePricing,
  setSignaturePricingEnabled,
} from "./signature-pricing.service.js";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { convert as fxConvert } from "../../lib/fx.js";
import { getLocalCurrencyForCountry } from "../../lib/country-currency.js";

export async function signaturePricingRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /signature-pricing?countryCode=FR&displayCurrency=auto
   *
   * Renvoie les niveaux activés pour ce pays (avec marge masquée pour les non-admins).
   * `displayCurrency` :
   *   - "auto" (défaut) : convertit en devise locale du pays (XOF pour CI, NGN pour NG, etc.)
   *   - "EUR" / "USD" / autre code ISO : convertit dans la devise demandée
   *   - "none" : laisse en devise admin (généralement EUR)
   *
   * En cas d'erreur FX (taux indisponible), on retombe sur la devise admin.
   * Utilisé par la page plans publique.
   */
  app.get("/signature-pricing", async (req) => {
    const q = z
      .object({
        countryCode: z.string().min(1).max(2).default("FR"),
        displayCurrency: z.string().min(3).max(10).default("auto"),
      })
      .parse(req.query);
    const cc = q.countryCode.toUpperCase();
    const rows = await getSignaturePricingForCountry(cc);

    // Détermine la devise cible
    let targetCurrency: string | null = null;
    if (q.displayCurrency.toLowerCase() === "auto") {
      targetCurrency = getLocalCurrencyForCountry(cc);
    } else if (q.displayCurrency.toLowerCase() !== "none") {
      targetCurrency = q.displayCurrency.toUpperCase();
    }

    // Conversion FX best-effort (si erreur → on garde la devise originale)
    const converted = await Promise.all(
      rows.map(async (p) => {
        if (!targetCurrency || targetCurrency === p.currency) {
          return {
            level: p.level,
            priceCents: p.priceCents,
            currency: p.currency,
            displayCurrency: p.currency,
            displayPriceCents: p.priceCents,
            yousignLevel: p.yousignLevel,
          };
        }
        try {
          const priceFloat = p.priceCents / 100;
          const convertedFloat = await fxConvert(
            priceFloat,
            p.currency,
            targetCurrency,
          );
          // Arrondi UX-friendly : on prend 2 décimales pour les devises standards,
          // 0 décimale pour les devises sans subdivision (XOF, XAF, JPY, KRW, etc.).
          const zeroDecimal = ["XOF", "XAF", "JPY", "KRW", "VND", "RWF", "UGX", "BIF", "DJF", "GNF", "KMF", "MGA"].includes(targetCurrency);
          const rounded = zeroDecimal
            ? Math.round(convertedFloat)
            : Math.round(convertedFloat * 100) / 100;
          const displayCents = Math.round(
            rounded * (zeroDecimal ? 1 : 100),
          );
          return {
            level: p.level,
            priceCents: p.priceCents,
            currency: p.currency,
            displayCurrency: targetCurrency,
            displayPriceCents: displayCents,
            displayZeroDecimal: zeroDecimal,
            yousignLevel: p.yousignLevel,
          };
        } catch {
          // FX indisponible → fallback sur devise originale (mieux que rien)
          return {
            level: p.level,
            priceCents: p.priceCents,
            currency: p.currency,
            displayCurrency: p.currency,
            displayPriceCents: p.priceCents,
            yousignLevel: p.yousignLevel,
          };
        }
      }),
    );

    return {
      countryCode: cc,
      localCurrency: getLocalCurrencyForCountry(cc),
      pricings: converted,
    };
  });

  /**
   * GET /admin/signature-pricing
   * Liste complète — gated SuperAdmin.
   */
  app.get("/admin/signature-pricing", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const rows = await listAllSignaturePricings();
    return { pricings: rows };
  });

  const upsertSchema = z.object({
    level: z.enum(["SIMPLE", "ADVANCED", "NOTARIZED"]),
    countryCode: z.string().min(1).max(2),
    enabled: z.boolean().optional(),
    costCents: z.number().int().min(0),
    priceCents: z.number().int().min(0),
    currency: z.string().length(3).optional(),
    yousignLevel: z.string().optional(),
    notes: z.string().max(500).nullable().optional(),
  });

  /**
   * POST /admin/signature-pricing
   * Crée ou met à jour une ligne. countryCode "*" pour le défaut global.
   */
  app.post("/admin/signature-pricing", async (req, reply) => {
    await assertSuperAdmin(req.user.sub);
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Body invalide",
        details: parsed.error.flatten(),
      });
    }
    const row = await upsertSignaturePricing({
      ...parsed.data,
      countryCode: parsed.data.countryCode.toUpperCase(),
    });
    return { pricing: row };
  });

  /**
   * DELETE /admin/signature-pricing/:id
   */
  app.delete("/admin/signature-pricing/:id", async (req, reply) => {
    await assertSuperAdmin(req.user.sub);
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    await deleteSignaturePricing(id);
    return reply.code(200).send({ ok: true });
  });

  /**
   * PATCH /admin/signature-pricing/:id/enabled
   * Toggle rapide enabled/disabled.
   */
  app.patch("/admin/signature-pricing/:id/enabled", async (req, reply) => {
    await assertSuperAdmin(req.user.sub);
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const body = z.object({ enabled: z.boolean() }).parse(req.body);
    const row = await setSignaturePricingEnabled(id, body.enabled);
    return reply.code(200).send({ pricing: row });
  });
}

async function assertSuperAdmin(userId: string): Promise<void> {
  const u = (await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  })) as { isSuperAdmin: boolean } | null;
  if (!u?.isSuperAdmin) {
    throw Errors.forbidden("Réservé aux SuperAdmins");
  }
}
