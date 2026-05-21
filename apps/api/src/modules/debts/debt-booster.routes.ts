/**
 * V152.D — Routes Pack Booster RDD.
 *
 * Calqué sur boosters.routes.ts (Pack IA Booster) mais pour les signatures.
 *
 * Endpoints :
 *   GET  /me/debt-boosters                  → liste packs actifs + catalogue
 *   POST /me/debt-boosters/checkout-intent  → crée PaymentIntent Stripe pour
 *                                              un pack précis (SERENITY / AFFAIRS)
 *   POST /me/debt-boosters/confirm-purchase → enregistre le pack après paiement
 *
 * Sécurité : assertAuthenticated via hook onRequest.
 * Idempotence : confirm-purchase vérifie qu'on n'enregistre pas 2× le même
 * stripePaymentIntentId.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../../lib/errors.js";
import { getStripe, isStripeConfigured } from "../../lib/stripe.js";
import { prisma } from "../../lib/db.js";
import {
  DEBT_BOOSTER_PACKS,
  getSignatureQuotaStatus,
} from "./signature-billing.service.js";

const checkoutSchema = z.object({
  packCode: z.enum(["SIGN_PACK_SERENITY", "SIGN_PACK_AFFAIRS"]),
});

const confirmSchema = z.object({
  packCode: z.enum(["SIGN_PACK_SERENITY", "SIGN_PACK_AFFAIRS"]),
  stripePaymentIntentId: z.string().min(1),
  amountCents: z.number().int().positive().optional(),
});

export async function debtBoostersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /me/signature-quota
   * V152.I — Renvoie l'état complet du quota signatures pour le user :
   * inclus dans plan / consommés ce mois / restant dans packs actifs.
   * Utilisé par le block "Mes signatures" sur le profil.
   */
  app.get("/me/signature-quota", async (req) => {
    const userId = (req.user as any).sub;
    const quota = await getSignatureQuotaStatus(userId);
    return { quota };
  });

  /**
   * GET /me/debt-boosters
   * Renvoie la liste des packs RDD actifs (non expirés) + le catalogue
   * complet pour l'UI.
   */
  app.get("/me/debt-boosters", async (req) => {
    const userId = (req.user as any).sub;
    const now = new Date();
    const packs = (await (prisma as any).debtBoosterPack.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
    })) as any[];

    const advancedRemaining = packs.reduce(
      (s, p) => s + (p.advancedIncluded - p.advancedUsed),
      0,
    );
    const notarizedRemaining = packs.reduce(
      (s, p) => s + (p.notarizedIncluded - p.notarizedUsed),
      0,
    );

    return {
      catalog: DEBT_BOOSTER_PACKS,
      activePacks: packs.map((p) => ({
        id: p.id,
        packCode: p.packCode,
        advancedIncluded: p.advancedIncluded,
        advancedUsed: p.advancedUsed,
        notarizedIncluded: p.notarizedIncluded,
        notarizedUsed: p.notarizedUsed,
        expiresAt: p.expiresAt.toISOString(),
        pricePaidCents: p.pricePaidCents,
        currency: p.currency,
      })),
      totals: {
        advancedRemaining,
        notarizedRemaining,
      },
    };
  });

  /**
   * POST /me/debt-boosters/checkout-intent
   * Crée un PaymentIntent Stripe pour le pack demandé.
   * Mock auto-renvoyé si Stripe pas configuré (dev).
   */
  app.post("/me/debt-boosters/checkout-intent", async (req, reply) => {
    const userId = (req.user as any).sub;
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad_request",
        message: "packCode invalide",
        details: parsed.error.flatten(),
      });
    }
    const pack = DEBT_BOOSTER_PACKS.find((p) => p.code === parsed.data.packCode);
    if (!pack) {
      return reply.code(404).send({ error: "pack_not_found" });
    }

    const stripe = getStripe();
    if (!isStripeConfigured() || !stripe) {
      return {
        clientSecret: `pi_mock_debt_${userId.slice(0, 8)}_${Date.now()}_secret`,
        amount: pack.priceCents,
        currency: pack.currency.toLowerCase(),
        packCode: pack.code,
        mock: true,
      };
    }

    const user = (await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, displayName: true },
    })) as { stripeCustomerId: string | null; displayName: string | null } | null;
    if (!user) {
      throw Errors.notFound("Compte introuvable");
    }
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.displayName ?? undefined,
        metadata: { userId, source: "debt_booster" },
      });
      customerId = customer.id;
      await (prisma as any).user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }
    const intent = await stripe.paymentIntents.create({
      amount: pack.priceCents,
      currency: pack.currency.toLowerCase(),
      description: `${pack.name} · ${pack.advancedIncluded} ADVANCED + ${pack.notarizedIncluded} NOTARIZED`,
      ...(customerId ? { customer: customerId } : {}),
      metadata: {
        userId,
        packCode: pack.code,
        source: "debt_booster",
      },
    });
    return {
      clientSecret: intent.client_secret,
      amount: pack.priceCents,
      currency: pack.currency.toLowerCase(),
      packCode: pack.code,
    };
  });

  /**
   * POST /me/debt-boosters/confirm-purchase
   * Appelé par le front après confirmation Stripe Elements (ou par le webhook).
   * Enregistre le DebtBoosterPack en BDD avec date d'expiration.
   *
   * Idempotent : 2e appel avec même stripePaymentIntentId renvoie le pack
   * existant sans re-créditer (anti-double-paiement).
   */
  app.post("/me/debt-boosters/confirm-purchase", async (req, reply) => {
    const userId = (req.user as any).sub;
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad_request",
        details: parsed.error.flatten(),
      });
    }
    const pack = DEBT_BOOSTER_PACKS.find((p) => p.code === parsed.data.packCode);
    if (!pack) {
      return reply.code(404).send({ error: "pack_not_found" });
    }

    // Idempotence : vérifier si on a déjà enregistré ce PI
    const existing = (await (prisma as any).debtBoosterPack.findFirst({
      where: { userId, stripePaymentIntentId: parsed.data.stripePaymentIntentId },
    })) as any;
    if (existing) {
      return {
        id: existing.id,
        alreadyRecorded: true,
        expiresAt: existing.expiresAt.toISOString(),
      };
    }

    // Optionnel : si Stripe live, vérifier le PaymentIntent côté Stripe
    const stripe = getStripe();
    let pricePaidCents = pack.priceCents;
    let currency = pack.currency;
    if (
      isStripeConfigured() &&
      stripe &&
      !parsed.data.stripePaymentIntentId.startsWith("pi_mock_")
    ) {
      try {
        const intent = await stripe.paymentIntents.retrieve(
          parsed.data.stripePaymentIntentId,
        );
        if (intent.status !== "succeeded") {
          return reply.code(400).send({
            error: "payment_not_succeeded",
            status: intent.status,
          });
        }
        if (intent.metadata?.userId !== userId) {
          return reply.code(403).send({ error: "user_mismatch" });
        }
        pricePaidCents = intent.amount;
        currency = (intent.currency ?? "eur").toUpperCase();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          "[debt-booster] failed to verify PI, recording anyway:",
          (e as Error).message,
        );
      }
    }

    const expiresAt = new Date(
      Date.now() + pack.durationDays * 24 * 60 * 60 * 1000,
    );
    const created = (await (prisma as any).debtBoosterPack.create({
      data: {
        userId,
        packCode: pack.code,
        advancedIncluded: pack.advancedIncluded,
        notarizedIncluded: pack.notarizedIncluded,
        advancedUsed: 0,
        notarizedUsed: 0,
        expiresAt,
        stripePaymentIntentId: parsed.data.stripePaymentIntentId,
        pricePaidCents,
        currency,
      },
    })) as any;

    return {
      id: created.id,
      packCode: pack.code,
      advancedIncluded: pack.advancedIncluded,
      notarizedIncluded: pack.notarizedIncluded,
      expiresAt: created.expiresAt.toISOString(),
      pricePaidCents,
      currency,
    };
  });
}
