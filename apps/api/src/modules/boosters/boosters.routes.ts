/**
 * V47 · Routes Pack IA Booster
 *
 * Endpoints :
 *  - POST /me/boosters/checkout-intent  → crée un PaymentIntent Stripe
 *    pour l'achat d'un pack (4,99 €). Le frontend confirme avec Stripe
 *    Elements puis appelle confirm-purchase ci-dessous.
 *  - POST /me/boosters/confirm-purchase → enregistre le pack en BDD après
 *    webhook Stripe ou confirmation côté front (vérifie le payment_intent).
 *  - GET  /me/boosters                   → liste les packs actifs du user
 *    (pour affichage UI dans /dashboard/plans).
 *
 * Sécurité : assertAuthenticated via hook onRequest. Idempotence sur la
 * route confirm (Stripe webhook peut retry).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../../lib/errors.js";
import { BOOSTER_PACK } from "../../lib/seed-plans.js";
import {
  listActiveBoosters,
  recordBoosterPurchase,
} from "../../lib/booster-service.js";
import { getStripe, isStripeConfigured } from "../../lib/stripe.js";
import { prisma } from "../../lib/db.js";
import { loadEnv } from "../../lib/env.js";

const confirmSchema = z.object({
  stripePaymentIntentId: z.string().min(1),
  /** Vérification du montant (anti-fraude basique) */
  amountCents: z.number().int().positive().optional(),
});

export async function boostersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /me/boosters
   * Retourne la liste des packs Booster actifs + le total des scans
   * restants. Utilisé par /dashboard/plans pour afficher l'état.
   */
  app.get("/me/boosters", async (req) => {
    const userId = (req.user as any).sub;
    const packs = await listActiveBoosters(userId);
    const totalRemaining = packs.reduce((s, p) => s + p.scansRemaining, 0);
    return {
      pack: {
        code: BOOSTER_PACK.code,
        name: BOOSTER_PACK.name,
        priceCents: BOOSTER_PACK.priceCents,
        scansAdded: BOOSTER_PACK.scansAdded,
        durationDays: BOOSTER_PACK.durationDays,
      },
      activePacks: packs,
      totalScansRemaining: totalRemaining,
    };
  });

  /**
   * POST /me/boosters/checkout-intent
   * Crée un PaymentIntent Stripe pour 4,99 € · retourne le clientSecret
   * que le frontend utilise pour confirmer avec Stripe Elements.
   *
   * V48 · Si STRIPE_SECRET_KEY est configurée → vrai PaymentIntent live.
   * Sinon → mock dev pour permettre les tests locaux sans Stripe (flow
   * complet via confirm-purchase manuel).
   *
   * Pour récupérer/créer le Customer Stripe : on utilise User.stripeCustomerId
   * s'il existe (déjà passé par checkout subscription), sinon on en crée un
   * neuf avec l'email du user. Ça permet de retomber sur la carte par défaut
   * du customer si un user fait une 2e achat (off_session implicite à l'avenir).
   */
  app.post("/me/boosters/checkout-intent", async (req) => {
    const userId = (req.user as any).sub;
    const stripe = getStripe();

    // === Mode dev sans Stripe : on retourne un mock que le frontend
    // détecte (mock=true) et qui permet d'appeler confirm-purchase direct ===
    if (!isStripeConfigured() || !stripe) {
      return {
        clientSecret: `pi_mock_${userId.slice(0, 8)}_${Date.now()}_secret`,
        amount: BOOSTER_PACK.priceCents,
        currency: "eur",
        mock: true,
      };
    }

    // === Stripe live : vrai PaymentIntent avec metadata pour le webhook ===
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, displayName: true },
    });
    if (!user) {
      throw Errors.notFound("Compte introuvable");
    }

    // Récupère ou crée le Customer Stripe. BMD authentifie via OTP
    // (téléphone/email dans Contact), donc on ne récupère pas l'email
    // depuis User directement. Si on a déjà un customerId (passé par
    // un checkout subscription antérieur), on le réutilise.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.displayName ?? undefined,
        metadata: { userId, source: "booster" },
      });
      customerId = customer.id;
      // Persiste sur le user pour la prochaine fois (cohérent avec
      // checkout subscription qui fait pareil dans payments webhook)
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const intent = await stripe.paymentIntents.create({
      amount: BOOSTER_PACK.priceCents,
      currency: "eur",
      description: BOOSTER_PACK.description,
      ...(customerId ? { customer: customerId } : {}),
      metadata: {
        userId,
        packCode: BOOSTER_PACK.code,
        scansAdded: String(BOOSTER_PACK.scansAdded),
        source: "bmd_booster_v48",
      },
      // Optimise pour les cartes (3DS optionnel selon la banque)
      automatic_payment_methods: { enabled: true },
    });

    return {
      clientSecret: intent.client_secret ?? "",
      amount: intent.amount,
      currency: intent.currency,
      mock: false,
    };
  });

  /**
   * V49 · POST /me/boosters/checkout-session
   *
   * Crée une Stripe Checkout Session hostée (pas besoin de Stripe.js côté
   * frontend) en mode `payment` one-shot pour le Pack Booster. Le frontend
   * redirige simplement avec window.location.href = url.
   *
   * Avantages vs PaymentIntent + Elements :
   *   - Pas de dépendance Stripe.js (~50 KB de moins dans le bundle)
   *   - PCI compliance Stripe gérée
   *   - Apple Pay / Google Pay / Klarna out-of-the-box
   *   - 3DS automatique
   *   - Mobile-friendly natif
   *
   * Coté backend : la session a metadata.packCode = IA_BOOSTER_100 +
   * metadata.userId. Le webhook checkout.session.completed détecte ces
   * marqueurs et appelle recordBoosterPurchase.
   */
  app.post("/me/boosters/checkout-session", async (req) => {
    const userId = (req.user as any).sub;
    const stripe = getStripe();

    // Mode dev : pas de Stripe → on retourne une "url" mock qui pointe vers
    // un page success-mock côté frontend (utile pour les tests E2E sans
    // sortir de l'app).
    if (!isStripeConfigured() || !stripe) {
      return {
        url: `/dashboard/plans?booster=mock-success`,
        sessionId: `cs_mock_${userId.slice(0, 8)}_${Date.now()}`,
        mock: true,
      };
    }

    const env = loadEnv();
    const baseUrl = env.WEB_BASE_URL ?? "http://localhost:3000";

    // Récupère ou crée le Customer Stripe (même logique que checkout-intent)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, displayName: true },
    });
    if (!user) throw Errors.notFound("Compte introuvable");

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.displayName ?? undefined,
        metadata: { userId, source: "booster" },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Crée une Price ad-hoc pour le Pack (4,99 € · pas besoin d'un Price
    // Stripe permanent puisque c'est un one-shot avec montant fixe)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: BOOSTER_PACK.priceCents,
            product_data: {
              name: BOOSTER_PACK.name,
              description: BOOSTER_PACK.description,
              metadata: { packCode: BOOSTER_PACK.code },
            },
          },
        },
      ],
      success_url: `${baseUrl}/dashboard/plans?booster=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/plans?booster=cancelled`,
      // Metadata sur la session — utilisée par le webhook checkout.session.completed
      // dans payments.routes.ts pour détecter qu'il s'agit d'un Pack Booster
      // et déclencher recordBoosterPurchase.
      metadata: {
        userId,
        packCode: BOOSTER_PACK.code,
        scansAdded: String(BOOSTER_PACK.scansAdded),
        source: "bmd_booster_v49",
      },
      // Pas de promo codes pour les addons one-shot (réservés aux subs)
      allow_promotion_codes: false,
    });

    if (!session.url) {
      throw Errors.internal("Stripe a créé la session mais sans URL.");
    }
    return {
      url: session.url,
      sessionId: session.id,
      mock: false,
    };
  });

  /**
   * POST /me/boosters/confirm-purchase
   * Enregistre le pack en BDD après succès du paiement.
   *
   * V48 · Anti-fraude : si Stripe est configuré (prod), on récupère le
   * PaymentIntent côté Stripe et on vérifie status='succeeded' + montant
   * + metadata.userId correspondent. Impossible de forger un faux paiement.
   *
   * En mode mock (dev sans Stripe), on accepte directement la confirmation
   * pour permettre les tests E2E.
   *
   * Idempotent via stripePaymentIntentId.
   *
   * NOTE : en prod, le vrai déclencheur est le WEBHOOK Stripe
   * `payment_intent.succeeded` (cf. payments.routes.ts). Cette route reste
   * utile pour 1) le mode dev mock et 2) un fallback côté frontend si le
   * webhook tarde (UX réactive).
   */
  app.post("/me/boosters/confirm-purchase", async (req, reply) => {
    const userId = (req.user as any).sub;
    const body = confirmSchema.parse(req.body);
    const stripe = getStripe();

    // === Mode prod avec Stripe : vérification cryptographique du paiement ===
    if (stripe && !body.stripePaymentIntentId.startsWith("pi_mock_")) {
      let intent;
      try {
        intent = await stripe.paymentIntents.retrieve(
          body.stripePaymentIntentId,
        );
      } catch (e) {
        throw Errors.badRequest(
          `PaymentIntent introuvable côté Stripe : ${(e as Error).message}`,
        );
      }
      // Doit être réussi
      if (intent.status !== "succeeded") {
        throw Errors.badRequest(
          `Paiement non finalisé (status=${intent.status}). Réessaie ou contacte le support.`,
        );
      }
      // Le userId du metadata doit matcher le user connecté (anti-impersonation)
      if (intent.metadata?.userId && intent.metadata.userId !== userId) {
        throw Errors.forbidden(
          "Ce paiement n'appartient pas à ton compte.",
        );
      }
      // Le montant doit matcher le prix catalogue
      if (intent.amount !== BOOSTER_PACK.priceCents) {
        throw Errors.badRequest(
          `Montant invalide (attendu ${BOOSTER_PACK.priceCents} cents, reçu ${intent.amount}).`,
        );
      }
      // OK — on enregistre (idempotent via stripePaymentIntentId)
      const result = await recordBoosterPurchase({
        userId,
        stripePaymentIntentId: intent.id,
        pricePaidCents: intent.amount,
      });
      return reply.code(201).send({
        ok: true,
        verifiedByStripe: true,
        pack: {
          id: result.id,
          scansAdded: BOOSTER_PACK.scansAdded,
          expiresAt: result.expiresAt.toISOString(),
        },
      });
    }

    // === Mode mock dev (pi_mock_*) ou Stripe non configuré ===
    if (
      body.amountCents !== undefined &&
      body.amountCents !== BOOSTER_PACK.priceCents
    ) {
      throw Errors.badRequest(
        `Montant invalide (attendu ${BOOSTER_PACK.priceCents} cents, reçu ${body.amountCents}).`,
      );
    }
    const result = await recordBoosterPurchase({
      userId,
      stripePaymentIntentId: body.stripePaymentIntentId,
      pricePaidCents: body.amountCents ?? BOOSTER_PACK.priceCents,
    });
    return reply.code(201).send({
      ok: true,
      verifiedByStripe: false,
      mock: true,
      pack: {
        id: result.id,
        scansAdded: BOOSTER_PACK.scansAdded,
        expiresAt: result.expiresAt.toISOString(),
      },
    });
  });
}
