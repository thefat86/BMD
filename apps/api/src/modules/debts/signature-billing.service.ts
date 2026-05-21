/**
 * V152 — Service de facturation des signatures électroniques RDD.
 *
 * Modèle hybride :
 *   1. Quotas inclus dans le plan mensuel (PERSO/FAMILY/PRO ont X SIMPLE et
 *      Y ADVANCED inclus/mois).
 *   2. Pack Booster RDD prépayé (Sérénité 9,99€ → 5 ADVANCED + 1 NOTARIZED ;
 *      Affaires 29,99€ → 20 ADVANCED + 2 NOTARIZED).
 *   3. Achat à l'unité Stripe Checkout au tarif V151 (pays-dépendant).
 *
 * Logique de consumeSignatureQuota :
 *   - Si quota plan disponible ce mois → consume (gratuit pour user)
 *   - Sinon, si DebtBoosterPack actif avec slots dispo → consume slot
 *   - Sinon → renvoie `requires_payment` avec le prix V151 + breakdown
 *
 * NB : la consommation est journalisée dans UsageEvent (kind=SIGNATURE_*)
 * pour le reporting admin rentabilité.
 */

import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { getSignaturePricing } from "./signature-pricing.service.js";
import type { SignaturePricing } from "./signature-pricing.service.js";

const prisma = prismaClient as any;

export type SignatureLevel = "SIMPLE" | "ADVANCED" | "NOTARIZED";

export interface ConsumeResult {
  /** "free_quota" si plan, "pack" si Booster, "paid" si déjà payé Stripe */
  source: "free_quota" | "pack" | "paid";
  /** ID du pack consommé (si source=pack) */
  packId?: string;
  /** Quota restant après consommation pour ce niveau (-1 = illimité) */
  remainingForLevel: number;
}

export interface PaymentRequiredResult {
  status: "requires_payment";
  /** Prix unitaire dans la devise admin (EUR cents) */
  unitPriceCents: number;
  currency: string;
  /** Devise locale convertie pour affichage */
  displayCurrency: string;
  displayPriceCents: number;
  /** Pricing complet retourné pour info UI */
  pricing: SignaturePricing;
  /** Suggestion : packs Booster RDD qui couvriraient ce besoin */
  suggestedPacks: PackSuggestion[];
}

export interface QuotaStatus {
  level: SignatureLevel;
  /** Inclus dans le plan (-1 = illimité) */
  includedInPlan: number;
  /** Déjà consommé ce mois sur le quota plan */
  usedThisMonth: number;
  /** Slots restants dans les packs Booster RDD actifs (pour ADVANCED/NOTARIZED) */
  remainingFromPacks: number;
}

export interface PackSuggestion {
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  advancedIncluded: number;
  notarizedIncluded: number;
  durationDays: number;
}

// Catalogue des packs Booster RDD (modifiable en admin plus tard, V152+)
export const DEBT_BOOSTER_PACKS: PackSuggestion[] = [
  {
    code: "SIGN_PACK_SERENITY",
    name: "Pack Sérénité",
    priceCents: 999, // 9,99 €
    currency: "EUR",
    advancedIncluded: 5,
    notarizedIncluded: 1,
    durationDays: 90,
  },
  {
    code: "SIGN_PACK_AFFAIRS",
    name: "Pack Affaires",
    priceCents: 2999, // 29,99 €
    currency: "EUR",
    advancedIncluded: 20,
    notarizedIncluded: 2,
    durationDays: 180,
  },
];

// ---------------------------------------------------------------------------
// Helpers : limites plan
// ---------------------------------------------------------------------------

async function getUserPlanLimits(userId: string): Promise<{
  signaturesSimpleIncluded: number;
  signaturesAdvancedIncluded: number;
  debtAgreementsPerMonth: number;
}> {
  // V152 — On charge le plan effectif du user. La méthode varie selon le code base,
  // mais ici on suppose que `User.planCode` existe et qu'il y a une table `Plan`
  // avec `limits` JSON. On lit avec un fallback gracieux.
  const u = (await prisma.user.findUnique({
    where: { id: userId },
    select: { planCode: true },
  })) as { planCode: string | null } | null;
  if (!u?.planCode) {
    return {
      signaturesSimpleIncluded: 0,
      signaturesAdvancedIncluded: 0,
      debtAgreementsPerMonth: 1,
    };
  }
  const p = (await prisma.plan.findUnique({
    where: { code: u.planCode },
    select: { limits: true },
  })) as { limits: any } | null;
  const l = (p?.limits ?? {}) as any;
  return {
    signaturesSimpleIncluded: Number(l.signaturesSimpleIncluded ?? 0),
    signaturesAdvancedIncluded: Number(l.signaturesAdvancedIncluded ?? 0),
    debtAgreementsPerMonth: Number(l.debtAgreementsPerMonth ?? 0),
  };
}

function startOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Compte les signatures consommées par l'utilisateur depuis le 1er du mois
 * (filtrées par niveau et source=plan, donc on exclut les paid/pack).
 */
async function countMonthlyPlanConsumption(
  userId: string,
  level: SignatureLevel,
): Promise<number> {
  const since = startOfCurrentMonth();
  const count = await prisma.signatureCharge.count({
    where: {
      userId,
      level,
      status: "PAID",
      fromPackId: null,
      stripePaymentIntentId: null,
      paidAt: { gte: since },
    },
  });
  return count;
}

/**
 * Renvoie un état complet du quota pour le user — utilisé par le profil.
 */
export async function getSignatureQuotaStatus(
  userId: string,
): Promise<QuotaStatus[]> {
  const limits = await getUserPlanLimits(userId);
  const [simpleUsed, advancedUsed] = await Promise.all([
    countMonthlyPlanConsumption(userId, "SIMPLE"),
    countMonthlyPlanConsumption(userId, "ADVANCED"),
  ]);
  const packs = await getActiveDebtBoosterPacks(userId);
  const advancedRemaining = packs.reduce(
    (sum: number, p: any) => sum + (p.advancedIncluded - p.advancedUsed),
    0,
  );
  const notarizedRemaining = packs.reduce(
    (sum: number, p: any) => sum + (p.notarizedIncluded - p.notarizedUsed),
    0,
  );
  return [
    {
      level: "SIMPLE",
      includedInPlan: limits.signaturesSimpleIncluded,
      usedThisMonth: simpleUsed,
      remainingFromPacks: 0,
    },
    {
      level: "ADVANCED",
      includedInPlan: limits.signaturesAdvancedIncluded,
      usedThisMonth: advancedUsed,
      remainingFromPacks: advancedRemaining,
    },
    {
      level: "NOTARIZED",
      includedInPlan: 0, // jamais inclus dans plan
      usedThisMonth: 0,
      remainingFromPacks: notarizedRemaining,
    },
  ];
}

async function getActiveDebtBoosterPacks(userId: string): Promise<any[]> {
  const now = new Date();
  return prisma.debtBoosterPack.findMany({
    where: {
      userId,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// API publique du service
// ---------------------------------------------------------------------------

/**
 * Tente de consommer une signature pour ce user/contrat/niveau.
 * Renvoie soit le résultat de la consommation (gratuite/pack), soit la
 * structure `requires_payment` avec le prix à charger.
 *
 * IMPORTANT : ne crée la SignatureCharge que si la consommation réussit
 * (status=PAID). Pour les paiements Stripe à la carte, l'appelant doit
 * d'abord créer la SignatureCharge en status=PENDING puis appeler le
 * webhook pour confirmer.
 */
export async function consumeSignatureQuota(input: {
  userId: string;
  debtId: string;
  level: SignatureLevel;
  /** Pays utilisateur (pour récupérer le tarif V151 si paiement nécessaire) */
  countryCode: string;
}): Promise<ConsumeResult | PaymentRequiredResult> {
  const { userId, debtId, level, countryCode } = input;

  const limits = await getUserPlanLimits(userId);
  const includedPlan =
    level === "SIMPLE"
      ? limits.signaturesSimpleIncluded
      : level === "ADVANCED"
        ? limits.signaturesAdvancedIncluded
        : 0; // NOTARIZED jamais dans le plan

  // 1) Quota plan disponible ?
  if (includedPlan === -1 || includedPlan > 0) {
    if (includedPlan === -1) {
      // Illimité — on log juste la consommation et on consomme
      await prisma.signatureCharge.create({
        data: {
          userId,
          debtId,
          level,
          pricePaidCents: 0,
          currency: "EUR",
          countryCode,
          status: "PAID",
          paidAt: new Date(),
        },
      });
      return {
        source: "free_quota",
        remainingForLevel: -1,
      };
    }
    // Limité → check conso mois en cours
    const used = await countMonthlyPlanConsumption(userId, level);
    if (used < includedPlan) {
      await prisma.signatureCharge.create({
        data: {
          userId,
          debtId,
          level,
          pricePaidCents: 0,
          currency: "EUR",
          countryCode,
          status: "PAID",
          paidAt: new Date(),
        },
      });
      return {
        source: "free_quota",
        remainingForLevel: includedPlan - used - 1,
      };
    }
  }

  // 2) Pack Booster RDD actif avec slot dispo (uniquement ADVANCED/NOTARIZED) ?
  if (level === "ADVANCED" || level === "NOTARIZED") {
    const packs = await getActiveDebtBoosterPacks(userId);
    for (const pack of packs) {
      const remaining =
        level === "ADVANCED"
          ? pack.advancedIncluded - pack.advancedUsed
          : pack.notarizedIncluded - pack.notarizedUsed;
      if (remaining > 0) {
        // Consume un slot du pack
        const fieldToInc =
          level === "ADVANCED" ? "advancedUsed" : "notarizedUsed";
        await prisma.$transaction(async (tx: any) => {
          await tx.debtBoosterPack.update({
            where: { id: pack.id },
            data: { [fieldToInc]: { increment: 1 } },
          });
          await tx.signatureCharge.create({
            data: {
              userId,
              debtId,
              level,
              pricePaidCents: 0,
              currency: pack.currency,
              countryCode,
              status: "PAID",
              fromPackId: pack.id,
              paidAt: new Date(),
            },
          });
        });
        return {
          source: "pack",
          packId: pack.id,
          remainingForLevel: remaining - 1,
        };
      }
    }
  }

  // 3) Aucune option gratuite → paiement requis
  const pricing = await getSignaturePricing(level, countryCode);
  if (!pricing) {
    throw Errors.badRequest(
      `Niveau ${level} non disponible pour le pays ${countryCode}`,
    );
  }

  return {
    status: "requires_payment",
    unitPriceCents: pricing.priceCents,
    currency: pricing.currency,
    displayCurrency: pricing.currency,
    displayPriceCents: pricing.priceCents,
    pricing,
    suggestedPacks: DEBT_BOOSTER_PACKS,
  };
}

/**
 * V169 — État de consommation RDD d'un user (pour <DebtCounter>).
 * Mêmes principes que getOcrUsage() : on remonte used / max / planCode +
 * date de reset pour que le frontend puisse afficher un compteur visible
 * et un CTA upgrade quand le user approche le mur.
 */
export async function getDebtsUsage(userId: string): Promise<{
  used: number;
  max: number; // -1 = illimité ; 0 = bloqué (legacy avant reseed)
  resetsAt: string; // ISO du 1er du mois prochain
  planCode: string;
  signaturesSimpleIncluded: number;
  signaturesAdvancedIncluded: number;
}> {
  const u = (await prisma.user.findUnique({
    where: { id: userId },
    select: { planCode: true },
  })) as { planCode: string | null } | null;

  const limits = await getUserPlanLimits(userId);
  const max = limits.debtAgreementsPerMonth;
  const startOfMonth = startOfCurrentMonth();
  const resetsAt = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    1,
  ).toISOString();

  let used = 0;
  if (max !== -1) {
    used = await prisma.debtAgreement.count({
      where: {
        creatorUserId: userId,
        createdAt: { gte: startOfMonth },
      },
    });
  }

  return {
    used,
    max,
    resetsAt,
    planCode: u?.planCode ?? "FREE",
    signaturesSimpleIncluded: limits.signaturesSimpleIncluded,
    signaturesAdvancedIncluded: limits.signaturesAdvancedIncluded,
  };
}

/**
 * Vérifie qu'un user peut créer une RDD selon son plan (quota mensuel).
 * Renvoie true si OK, jette une erreur plan_required sinon.
 */
export async function assertCanCreateDebt(userId: string): Promise<void> {
  const limits = await getUserPlanLimits(userId);
  const max = limits.debtAgreementsPerMonth;
  if (max === -1) return; // illimité
  if (max === 0) {
    throw Errors.forbidden(
      "Ce plan ne permet pas de créer de reconnaissance de dette. Upgrade vers PERSO ou plus.",
    );
  }
  // Compte les RDD créées ce mois par ce user (créateur)
  const since = startOfCurrentMonth();
  const count = await prisma.debtAgreement.count({
    where: {
      creatorUserId: userId,
      createdAt: { gte: since },
    },
  });
  if (count >= max) {
    throw Errors.forbidden(
      `Quota mensuel atteint (${count}/${max} RDD ce mois). Upgrade ton plan pour en créer plus.`,
    );
  }
}
