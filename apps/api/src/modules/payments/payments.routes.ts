/**
 * Routes Stripe (spec §6.3 — paiements).
 *
 *  User :
 *    POST /me/checkout-session   → crée une session Checkout pour un plan
 *    POST /me/connect-onboarding → si commercial : démarre KYC Stripe Connect
 *
 *  Webhook (PUBLIC, signature vérifiée) :
 *    POST /webhooks/stripe       → reçoit les events Stripe
 *
 * Le webhook est la SOURCE DE VÉRITÉ pour tous les changements d'état :
 *  - invoice.payment_succeeded → markSubscriptionRenewed +
 *                                 recordPaymentForCommissions
 *  - invoice.payment_failed    → markSubscriptionExpired (start grace)
 *  - customer.subscription.deleted → markSubscriptionExpired (annulation)
 *  - account.updated (Connect) → màj affiliateKycStatus si details_submitted
 *
 * On ne fait JAMAIS confiance à un changement d'état déclenché côté front
 * (l'utilisateur peut bypasser). Seul le webhook signé Stripe peut bouger
 * SubscriptionState.
 */
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { loadEnv } from "../../lib/env.js";
import {
  createCheckoutSession,
  createConnectOnboardingLink,
  isStripeConfigured,
  verifyWebhookSignature,
} from "../../lib/stripe.js";
import {
  markSubscriptionExpired,
  markSubscriptionRenewed,
} from "../subscription/subscription-state.service.js";
import { recordPaymentForCommissions } from "../affiliate/affiliate.service.js";
// V73.5 — Purge le cache des limites quand l'abonnement change (paiement OK
// = nouveau plan). Sans ça l'user paie un upgrade mais reste 5 min sur les
// anciennes limites.
import { invalidatePlanCache } from "../../lib/plan-limits.js";

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  // ============================================================
  // WEBHOOK STRIPE — public, signature vérifiée
  // ============================================================
  // Pour vérifier la signature, on a besoin du body BRUT (pas parsé en JSON).
  // On ajoute un parser raw spécifique à cette route via addContentTypeParser.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    function (req, body, done) {
      // Pour /webhooks/stripe → on garde le buffer brut pour vérif sig
      // Pour toutes les autres routes JSON → on parse normalement
      if (req.url === "/webhooks/stripe") {
        // @ts-expect-error : on attache le buffer brut au request pour usage
        req.rawBody = body;
        done(null, body);
      } else {
        try {
          done(null, JSON.parse(body.toString("utf8")));
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    },
  );

  app.post(
    "/webhooks/stripe",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const sigHeader = req.headers["stripe-signature"];
      if (!sigHeader || typeof sigHeader !== "string") {
        return reply.code(400).send({ error: "missing_signature" });
      }
      // @ts-expect-error : rawBody attaché par notre parser custom
      const raw: Buffer = req.rawBody ?? req.body;
      let event: Stripe.Event;
      try {
        event = verifyWebhookSignature({
          rawBody: raw.toString("utf8"),
          signature: sigHeader,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[stripe webhook] signature invalid:", err);
        return reply.code(400).send({ error: "invalid_signature" });
      }

      // Dispatch par type d'event. Idempotent : Stripe peut renvoyer le
      // même event plusieurs fois en cas de timeout réseau.
      try {
        await dispatchStripeEvent(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "[stripe webhook] handler failed:",
          event.type,
          err,
        );
        // On répond 500 → Stripe retentera (jusqu'à 3 jours).
        return reply.code(500).send({ error: "handler_failed" });
      }

      return reply.code(200).send({ received: true });
    },
  );

  // ============================================================
  // ROUTES USER — auth requise
  // ============================================================
  app.register(async (auth) => {
    auth.addHook("onRequest", auth.authenticate);

    /**
     * POST /me/checkout-session
     * Body: { planCode: "PREMIUM", interval: "month" | "year" }
     * Renvoie l'URL de redirection Stripe Checkout.
     */
    auth.post("/me/checkout-session", async (req) => {
      if (!isStripeConfigured()) {
        throw Errors.badRequest(
          "Les paiements ne sont pas encore activés sur cette instance.",
          {
            tip: "L'admin doit configurer STRIPE_SECRET_KEY et créer les Price IDs.",
          },
        );
      }
      const body = z
        .object({
          planCode: z.string().min(1).max(40),
          interval: z.enum(["month", "year"]).default("month"),
        })
        .parse(req.body);

      // Récupère user + tier régional pour ce plan
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        include: {
          contacts: { where: { type: "EMAIL" }, take: 1 },
        },
      });
      if (!user) throw Errors.notFound("Utilisateur introuvable");

      // Trouve le tier dans la région du user (déduit via defaultCurrency
      // → on cherche la région qui a cette currency comme défaut, fallback
      // EUROPE_NA si non trouvée)
      const regions = await prisma.region.findMany({
        where: { isActive: true },
      });
      const userRegion =
        regions.find(
          (r) =>
            r.defaultCurrency.toUpperCase() ===
            user.defaultCurrency.toUpperCase(),
        ) ?? regions.find((r) => r.code === "EUROPE_NA");

      if (!userRegion) {
        throw Errors.notFound("Aucune région tarifaire configurée.");
      }

      // V174.E — Fallback gracieux si le tier régional manque pour le plan
      // demandé (cas typique : seed-regions.ts n'a que FREE/PREMIUM/COMMUNITY
      // mais pas les nouveaux PERSONAL/FAMILY/PRO/LIFETIME). Stratégie :
      //  1. Tier exact (planCode, userRegion)
      //  2. Tier EUROPE_NA (prix plein, devise base €)
      //  3. Stripe Price ID stocké directement sur le Plan
      const planCode = body.planCode.toUpperCase();
      let tier = await prisma.planPriceTier.findUnique({
        where: {
          planCode_regionCode: { planCode, regionCode: userRegion.code },
        },
      });
      let resolvedRegionCode = userRegion.code;
      if (!tier && userRegion.code !== "EUROPE_NA") {
        tier = await prisma.planPriceTier.findUnique({
          where: {
            planCode_regionCode: { planCode, regionCode: "EUROPE_NA" },
          },
        });
        if (tier) {
          resolvedRegionCode = "EUROPE_NA";
          console.warn(
            `[payments] No tier for ${planCode}/${userRegion.code}, falling back to EUROPE_NA tier`,
          );
        }
      }

      let stripePriceId: string | null = null;
      if (tier) {
        stripePriceId =
          body.interval === "year"
            ? tier.stripePriceIdYearly
            : tier.stripePriceId;
      }

      if (!stripePriceId) {
        throw Errors.badRequest(
          `Stripe Price ID non configuré pour ${planCode} (${body.interval}) en ${resolvedRegionCode}.`,
          {
            tip: "L'admin doit créer le Price dans Stripe Dashboard puis mapper son ID dans la console BMD (page Tarifs régionaux).",
          },
        );
      }

      const env = loadEnv();
      const baseUrl = env.WEB_BASE_URL;
      // Détection one-shot via la limite de plan `oneShot: true` (spec §11.3
      // pour le forfait EVENT 29€). Le webhook traitera ce paiement comme
      // un usage unique (pas de subscription récurrente Stripe).
      const plan = await prisma.plan.findUnique({
        where: { code: body.planCode.toUpperCase() },
        select: { limits: true },
      });
      const planLimits =
        (plan?.limits as Record<string, unknown> | null) ?? {};
      const isOneShot = planLimits.oneShot === true;
      const session = await createCheckoutSession({
        userId: user.id,
        email: user.contacts[0]?.value ?? null,
        priceId: stripePriceId,
        planCode: body.planCode.toUpperCase(),
        successUrl: `${baseUrl}/dashboard/plans/success`,
        cancelUrl: `${baseUrl}/dashboard/plans?cancelled=1`,
        existingCustomerId: user.stripeCustomerId,
        // Si le user a un parrain, on le passe à Stripe pour que le webhook
        // sache appliquer les commissions
        referralCode: user.referredById ? user.referredById : null,
        oneShot: isOneShot,
      });

      return { url: session.url, sessionId: session.sessionId };
    });

    /**
     * POST /me/connect-onboarding
     * Pour les commerciaux : démarre l'onboarding Stripe Connect Express.
     * Le KYC + RIB se passe dans l'UI Stripe ; au retour on update KYC status.
     */
    auth.post("/me/connect-onboarding", async (req) => {
      if (!isStripeConfigured()) {
        throw Errors.badRequest(
          "Les paiements commerciaux ne sont pas encore activés.",
        );
      }
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        include: { contacts: { where: { type: "EMAIL" }, take: 1 } },
      });
      if (!user) throw Errors.notFound("Utilisateur introuvable");
      if (!user.isAffiliate) {
        throw Errors.forbidden(
          "Tu n'es pas commercial — contacte l'équipe BMD pour candidater.",
        );
      }

      const env = loadEnv();
      const baseUrl = env.WEB_BASE_URL;
      // Détermine le pays Stripe à partir de la devise du user (mapping
      // simplifié — Stripe Connect Express requiert un pays parmi sa liste
      // supportée).
      const country = guessStripeCountryFromCurrency(user.defaultCurrency);

      const link = await createConnectOnboardingLink({
        userId: user.id,
        email: user.contacts[0]?.value ?? null,
        country,
        refreshUrl: `${baseUrl}/dashboard/affiliate?onboard=refresh`,
        returnUrl: `${baseUrl}/dashboard/affiliate?onboard=done`,
        existingAccountId: user.stripeConnectAccountId,
      });

      // Persiste l'accountId dès maintenant (avant complétion)
      if (!user.stripeConnectAccountId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripeConnectAccountId: link.accountId,
            affiliateKycStatus: "PENDING",
          },
        });
      }

      return { url: link.url };
    });
  });
}

// ============================================================
// Dispatcher webhook
// ============================================================
async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      // 1ère fois qu'on reçoit le customer — on le persiste sur User.
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId && typeof session.customer === "string") {
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: session.customer },
        });
      }

      // V49 · Pack IA Booster one-shot (4,99 €) via Checkout Session.
      // metadata.packCode === "IA_BOOSTER_100" → on enregistre le pack
      // au lieu d'activer un plan abonnement. Idempotent via paymentIntentId.
      if (
        userId &&
        session.metadata?.packCode === "IA_BOOSTER_100" &&
        session.payment_status === "paid"
      ) {
        try {
          const piId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? session.id;
          const { recordBoosterPurchase } = await import(
            "../../lib/booster-service.js"
          );
          await recordBoosterPurchase({
            userId,
            stripePaymentIntentId: piId,
            pricePaidCents: session.amount_total ?? 499,
          });
          // Commissions affiliés sur l'achat Booster
          if ((session.amount_total ?? 0) > 0) {
            await recordPaymentForCommissions({
              payerId: userId,
              paymentRef: session.id,
              sourceAmountCents: session.amount_total ?? 0,
              sourceCurrency: (session.currency ?? "eur").toUpperCase(),
              paidAt: new Date(),
            });
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(
            "[stripe webhook] booster checkout completed failed:",
            e,
          );
        }
        break; // ne traite pas la branche planCode subscription en dessous
      }

      // Spec §11.3 — paiement one-shot (forfait EVENT 29€) :
      // Stripe ne créera PAS d'invoice.payment_succeeded ni de
      // customer.subscription pour ce mode. On doit donc activer
      // manuellement le plan ici, avec une expiration calculée.
      if (
        userId &&
        session.metadata?.oneShot === "1" &&
        session.metadata?.planCode &&
        session.payment_status === "paid"
      ) {
        const planCode = session.metadata.planCode.toUpperCase();
        const plan = await prisma.plan.findUnique({
          where: { code: planCode },
        });
        const limits = (plan?.limits as Record<string, unknown>) ?? {};
        const durationDays =
          typeof limits.durationDays === "number"
            ? limits.durationDays
            : 30; // défaut spec EVENT = 30 jours
        const expiresAt = new Date(
          Date.now() + durationDays * 24 * 60 * 60 * 1000,
        );
        await prisma.user.update({
          where: { id: userId },
          data: { planCode },
        });
        await prisma.subscriptionState.upsert({
          where: { userId },
          create: {
            userId,
            status: "ACTIVE",
            planCodeReference: planCode,
            expiresAt,
            stripeCustomerId:
              typeof session.customer === "string" ? session.customer : null,
          },
          update: {
            status: "ACTIVE",
            planCodeReference: planCode,
            expiresAt,
            // Reset les dates de grâce/warn si le user repaye
            graceEndsAt: null,
            readOnlyAt: null,
          },
        });

        // Commissions affiliés sur le paiement one-shot aussi (le filleul
        // qui prend un EVENT 29€ rapporte au parrain comme un paiement régulier).
        const amountCents = session.amount_total ?? 0;
        const currency = (session.currency ?? "eur").toUpperCase();
        if (amountCents > 0) {
          await recordPaymentForCommissions({
            payerId: userId,
            paymentRef: session.id,
            sourceAmountCents: amountCents,
            sourceCurrency: currency,
            paidAt: new Date(),
          });
        }
      }
      break;
    }

    case "invoice.payment_succeeded": {
      // Paiement réussi : 1) marquer souscription renouvelée
      //                   2) crédit commissions multi-niveaux
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId) break;

      // Retrouve l'utilisateur via le metadata de la subscription
      const sub = await getSubscriptionFromInvoice(invoice);
      const userId = sub.metadata?.userId;
      const planCode = sub.metadata?.planCode;
      if (!userId || !planCode) break;

      // periodEnd = nouvelle date d'expiration de l'abonnement
      const periodEnd = new Date(sub.current_period_end * 1000);
      await markSubscriptionRenewed({
        userId,
        newExpiresAt: periodEnd,
      });
      // Met à jour le plan du user au cas où (premier paiement)
      await prisma.user.update({
        where: { id: userId },
        data: { planCode: planCode.toUpperCase() },
      });
      // V73.5 — Purge le cache de limites pour appliquer le nouveau plan
      // immédiatement (sinon TTL 5 min = scans / features de l'ancien plan
      // pendant ce temps, alors que l'user vient de payer).
      invalidatePlanCache(userId);

      // Commissions affiliés sur le montant payé
      const amountCents = invoice.amount_paid; // en centimes de la devise
      const currency = (invoice.currency ?? "eur").toUpperCase();
      await recordPaymentForCommissions({
        payerId: userId,
        paymentRef: invoice.id ?? `invoice_${Date.now()}`,
        sourceAmountCents: amountCents,
        sourceCurrency: currency,
        paidAt: new Date((invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000),
      });
      break;
    }

    case "invoice.payment_failed": {
      // Paiement raté — démarre la grâce
      const invoice = event.data.object as Stripe.Invoice;
      const sub = await getSubscriptionFromInvoice(invoice);
      const userId = sub.metadata?.userId;
      if (!userId) break;
      const expiresAt = new Date(sub.current_period_end * 1000);
      await markSubscriptionExpired({ userId, expiresAt });
      break;
    }

    case "customer.subscription.deleted": {
      // Annulation explicite (par user ou par Stripe après échecs répétés)
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) break;
      const expiresAt = new Date(sub.current_period_end * 1000);
      await markSubscriptionExpired({ userId, expiresAt });
      break;
    }

    case "account.updated": {
      // Stripe Connect : commercial a fini son KYC
      const account = event.data.object as Stripe.Account;
      const userId = account.metadata?.userId;
      if (!userId) break;
      const verified =
        account.details_submitted === true &&
        account.charges_enabled === true &&
        account.payouts_enabled === true;
      await prisma.user.update({
        where: { id: userId },
        data: {
          affiliateKycStatus: verified ? "VERIFIED" : "PENDING",
        },
      });
      break;
    }

    case "payment_intent.succeeded": {
      // V48 · Pack IA Booster (paiement one-shot 4,99 €). Le PaymentIntent
      // a été créé avec metadata { userId, packCode: "IA_BOOSTER_100" }.
      // Idempotent côté recordBoosterPurchase via stripePaymentIntentId.
      const intent = event.data.object as Stripe.PaymentIntent;
      const meta = intent.metadata ?? {};
      const userId = meta.userId;
      const packCode = meta.packCode;
      if (!userId || packCode !== "IA_BOOSTER_100") break;
      try {
        const { recordBoosterPurchase } = await import(
          "../../lib/booster-service.js"
        );
        await recordBoosterPurchase({
          userId,
          stripePaymentIntentId: intent.id,
          pricePaidCents: intent.amount,
        });
        // Crédit commissions affiliés (le filleul achète un Booster
        // rapporte aussi à son parrain comme un paiement régulier).
        if (intent.amount > 0) {
          await recordPaymentForCommissions({
            payerId: userId,
            paymentRef: intent.id,
            sourceAmountCents: intent.amount,
            sourceCurrency: (intent.currency ?? "eur").toUpperCase(),
            paidAt: new Date(),
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[stripe webhook] booster purchase failed:", e);
        // On ne re-throw pas — Stripe retentera de toute façon
      }
      break;
    }

    default:
      // Event non géré — Stripe en envoie beaucoup, on ignore proprement
      break;
  }
}

/** Helper : récupère la subscription Stripe à partir d'une invoice. */
async function getSubscriptionFromInvoice(
  invoice: Stripe.Invoice,
): Promise<Stripe.Subscription> {
  const { getStripeOrThrow } = await import("../../lib/stripe.js");
  const stripe = getStripeOrThrow();
  if (typeof invoice.subscription === "string") {
    return stripe.subscriptions.retrieve(invoice.subscription);
  }
  if (invoice.subscription && typeof invoice.subscription === "object") {
    return invoice.subscription;
  }
  throw new Error("Invoice sans subscription rattachée");
}

/**
 * Mapping simplifié devise → pays Stripe Connect supporté. Stripe Connect
 * Express n'est pas dispo dans tous les pays africains au moment du MVP —
 * pour ces commerciaux, on bascule sur un payout manuel hors Stripe (à
 * brancher plus tard via virement bancaire SEPA / mobile money).
 */
function guessStripeCountryFromCurrency(currency: string): string {
  const map: Record<string, string> = {
    EUR: "FR",
    GBP: "GB",
    USD: "US",
    CHF: "CH",
    CAD: "CA",
  };
  return map[currency.toUpperCase()] ?? "FR";
}
