/**
 * Service Stripe (spec §6.3 — paiements abonnements + Stripe Connect
 * payouts commerciaux).
 *
 * Architecture :
 *  - Singleton Stripe SDK initialisé avec STRIPE_SECRET_KEY (test ou live)
 *  - Si la clé est absente (dev sans Stripe configuré), on retourne un stub
 *    qui jette une erreur explicite — l'app ne crashe pas au démarrage
 *  - Webhook signature vérifiée via stripe.webhooks.constructEvent()
 *
 * Workflow utilisateur :
 *  1. User clique "Passer Premium" → /me/checkout-session crée une session
 *     Stripe Checkout (avec son user_id en metadata)
 *  2. Stripe redirige vers checkout.stripe.com
 *  3. User paie → redirect success_url avec session_id dans la query
 *  4. Stripe envoie webhook `invoice.payment_succeeded` à /webhooks/stripe
 *  5. On marque la souscription ACTIVE + on crédite les commissions
 *
 * Sécurité :
 *  - Les events webhook sont vérifiés cryptographiquement (impossible de
 *    forger un faux paiement)
 *  - On ne fait JAMAIS confiance au front : seul le webhook = source de
 *    vérité pour les changements d'état d'abonnement.
 */
import Stripe from "stripe";
import { loadEnv } from "./env.js";

let stripeSingleton: Stripe | null = null;

/**
 * Retourne l'instance Stripe initialisée, ou null si la clé n'est pas
 * configurée. Le caller doit gérer le cas null avec un message d'erreur
 * clair (ex: "Configurer STRIPE_SECRET_KEY pour activer les paiements").
 */
export function getStripe(): Stripe | null {
  if (stripeSingleton) return stripeSingleton;
  const env = loadEnv();
  if (!env.STRIPE_SECRET_KEY) return null;
  stripeSingleton = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: env.STRIPE_API_VERSION as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: {
      name: "BMD",
      version: "0.1.0",
      url: "https://www.backmesdo.com",
    },
  });
  return stripeSingleton;
}

/** Helper pratique : throw si Stripe pas configuré (caller fait try/catch). */
export function getStripeOrThrow(): Stripe {
  const s = getStripe();
  if (!s) {
    throw new Error(
      "Stripe n'est pas configuré (STRIPE_SECRET_KEY manquante). Ajoute la clé dans .env pour activer les paiements.",
    );
  }
  return s;
}

/** Indique si Stripe est branché (utile pour conditionner l'UI). */
export function isStripeConfigured(): boolean {
  return getStripe() !== null;
}

/**
 * Crée une session Stripe Checkout pour upgrade vers un plan.
 *
 *  - mode `subscription` (récurrent mensuel/annuel)
 *  - automatic_tax désactivé pour MVP (on activera après obtenir un id fiscal)
 *  - customer_email pré-rempli si on l'a (UX fluide)
 *  - metadata : userId + planCode pour retrouver l'utilisateur dans le webhook
 *
 * Retourne l'URL de redirection que le front utilise via window.location.
 */
export async function createCheckoutSession(input: {
  userId: string;
  email: string | null;
  /** Stripe Price ID (récupéré de PlanPriceTier.stripePriceId) */
  priceId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
  /** Customer existant ? On le passe pour ne pas en re-créer un. */
  existingCustomerId?: string | null;
  /** Code de parrainage à appliquer (réduction filleul) */
  referralCode?: string | null;
  /**
   * Si true, crée un checkout en mode "payment" (paiement unique) au lieu
   * de "subscription". Spec §11.3 — forfait événement 29€ one-shot avec
   * expiration 30j post-event. Le webhook handler doit ensuite créer une
   * SubscriptionState avec expiresAt = now + 30j, sans renouvellement.
   */
  oneShot?: boolean;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeOrThrow();

  const isOneShot = input.oneShot === true;
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: isOneShot ? "payment" : "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url:
      input.successUrl + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: input.cancelUrl,
    automatic_tax: { enabled: false },
    allow_promotion_codes: true,
    client_reference_id: input.userId,
    metadata: {
      userId: input.userId,
      planCode: input.planCode,
      ...(input.referralCode ? { referralCode: input.referralCode } : {}),
      // Marqueur pour le webhook : ce paiement est one-shot, créer une
      // SubscriptionState avec expiresAt = now + durationDays (cf. seed-plans).
      ...(isOneShot ? { oneShot: "1" } : {}),
    },
  };

  // Mode subscription : on attache aussi la metadata sur la subscription elle-même
  if (!isOneShot) {
    params.subscription_data = {
      metadata: {
        userId: input.userId,
        planCode: input.planCode,
        ...(input.referralCode ? { referralCode: input.referralCode } : {}),
      },
    };
  }

  if (input.existingCustomerId) {
    params.customer = input.existingCustomerId;
  } else if (input.email) {
    params.customer_email = input.email;
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    throw new Error("Stripe a créé la session mais sans URL de checkout.");
  }
  return { url: session.url, sessionId: session.id };
}

/**
 * Crée un compte Stripe Connect Express pour un commercial. Retourne le
 * lien d'onboarding où le commercial complète son KYC + RIB.
 *
 * Une fois onboardé (event `account.updated` avec details_submitted=true),
 * on bascule User.affiliateKycStatus à VERIFIED → les commissions PAYABLE
 * peuvent enfin être versées via stripe.transfers.create().
 */
export async function createConnectOnboardingLink(input: {
  userId: string;
  email: string | null;
  country: string; // ISO 2 lettres (FR, SN, NG…)
  refreshUrl: string;
  returnUrl: string;
  existingAccountId?: string | null;
}): Promise<{ url: string; accountId: string }> {
  const stripe = getStripeOrThrow();

  let accountId = input.existingAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: input.country,
      email: input.email ?? undefined,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { userId: input.userId },
    });
    accountId = account.id;
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  });

  return { url: link.url, accountId };
}

/**
 * Sprint AC-4 · Crée une billing portal session pour qu'un user mette à
 * jour sa carte (refus addon, expiration). On retourne l'URL temporaire
 * (~10 min) que le frontend ouvre dans un nouvel onglet ou redirect.
 *
 * Le portail Stripe gère seul l'ajout/maj de la carte, pas besoin d'UI
 * custom côté BMD. À la fermeture, l'user revient sur `returnUrl`.
 */
export async function createBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripeOrThrow();
  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return { url: session.url };
}

/**
 * Sprint AC-3 · Facture un addon "à la carte" (ex: réunion supplémentaire
 * au-delà du quota mensuel). Crée un PaymentIntent en mode off_session sur
 * la carte enregistrée par défaut du customer (méthode persistée pendant
 * la première souscription via Setup Intent ou Subscription Default PM).
 *
 * Retourne l'ID du PaymentIntent en cas de succès. Throw si :
 *  - le user n'a pas de customer Stripe (jamais payé)
 *  - aucune carte par défaut configurée
 *  - la banque refuse (3DS, fonds insuffisants, etc.)
 *
 * Pour l'instant idempotency_key = `${addonType}_${entityId}` pour éviter
 * de double-charger en cas de retry réseau (réutilisable safely).
 */
export async function chargeAddon(input: {
  customerId: string;
  amountCents: number;
  currency: string; // ISO ex "eur" / "usd"
  description: string;
  /** Identifiant unique pour idempotence (ex: `meeting_${meetingId}`) */
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<{ paymentIntentId: string; status: string }> {
  const stripe = getStripeOrThrow();

  // Récupère la méthode de paiement par défaut du customer
  const customer = (await stripe.customers.retrieve(input.customerId)) as Stripe.Customer;
  const defaultPm =
    customer.invoice_settings?.default_payment_method ??
    null;
  if (!defaultPm) {
    throw new Error(
      "Pas de carte enregistrée pour ce customer. Demande à l'utilisateur de re-renseigner sa carte via le portail client.",
    );
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      customer: input.customerId,
      payment_method:
        typeof defaultPm === "string" ? defaultPm : defaultPm.id,
      off_session: true, // user pas devant l'écran
      confirm: true, // tente immédiatement (pas de SetupIntent intermédiaire)
      description: input.description,
      metadata: input.metadata ?? {},
    },
    { idempotencyKey: input.idempotencyKey },
  );

  return { paymentIntentId: intent.id, status: intent.status };
}

/**
 * Vérifie cryptographiquement la signature d'un webhook Stripe et
 * retourne l'event décodé. Throw si la signature est invalide (= rejeter
 * la requête : c'est probablement un attaquant qui forge des paiements).
 */
export function verifyWebhookSignature(input: {
  /** Body brut (string) reçu dans la requête — PAS le JSON parsé */
  rawBody: string;
  /** Header "stripe-signature" reçu dans la requête */
  signature: string;
}): Stripe.Event {
  const stripe = getStripeOrThrow();
  const env = loadEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET non configuré — impossible de vérifier la signature webhook.",
    );
  }
  return stripe.webhooks.constructEvent(
    input.rawBody,
    input.signature,
    env.STRIPE_WEBHOOK_SECRET,
  );
}
