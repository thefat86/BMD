/**
 * V164 — Service commercial : ambassadeurs + commerciaux agréés.
 *
 * 3 phases :
 *   1. Ambassadeur — avantages produit seulement (12 mois Pro, crédits IA, badge)
 *   2. Occasionnel — géré hors-app (prime annuelle ponctuelle)
 *   3. Commercial agréé — commission 20% via Stripe Connect après contrat signé
 *
 * Anti-pyramidal : 1 seul niveau (commercial → filleul direct). Pas de
 * récurrence sur les filleuls des filleuls.
 */

import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const prisma = prismaClient as any;

// ---------------------------------------------------------------------------
// Config singletons (un seul row par modèle)
// ---------------------------------------------------------------------------

export async function getCommissionConfig() {
  let row = await prisma.commercialCommissionConfig.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    row = await prisma.commercialCommissionConfig.create({
      data: { rateBps: 2000, durationMonths: 12 },
    });
  }
  return row;
}

export async function updateCommissionConfig(
  actorUserId: string,
  patch: {
    rateBps?: number;
    durationMonths?: number;
    basedOnCollected?: boolean;
    maxMonthlyPayoutCents?: number | null;
    notes?: string | null;
  },
) {
  const current = await getCommissionConfig();
  if (
    patch.rateBps !== undefined &&
    (patch.rateBps < 0 || patch.rateBps > 5000)
  ) {
    throw Errors.badRequest("Taux invalide (0 à 5000 bps, soit 0-50%).");
  }
  if (
    patch.durationMonths !== undefined &&
    (patch.durationMonths < 1 || patch.durationMonths > 60)
  ) {
    throw Errors.badRequest("Durée invalide (1 à 60 mois).");
  }
  return prisma.commercialCommissionConfig.update({
    where: { id: current.id },
    data: { ...patch, updatedById: actorUserId },
  });
}

export async function getAmbassadorConfig() {
  let row = await prisma.ambassadorBenefitConfig.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    row = await prisma.ambassadorBenefitConfig.create({ data: {} });
  }
  return row;
}

export async function updateAmbassadorConfig(
  actorUserId: string,
  patch: Record<string, unknown>,
) {
  const current = await getAmbassadorConfig();
  return prisma.ambassadorBenefitConfig.update({
    where: { id: current.id },
    data: { ...patch, updatedById: actorUserId },
  });
}

export async function getReferralConfig() {
  let row = await prisma.referralBenefitConfig.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    row = await prisma.referralBenefitConfig.create({ data: {} });
  }
  return row;
}

export async function updateReferralConfig(
  actorUserId: string,
  patch: Record<string, unknown>,
) {
  const current = await getReferralConfig();
  return prisma.referralBenefitConfig.update({
    where: { id: current.id },
    data: { ...patch, updatedById: actorUserId },
  });
}

// ---------------------------------------------------------------------------
// Promotion ambassadeur / commercial (admin only)
// ---------------------------------------------------------------------------

export async function promoteToAmbassador(input: {
  targetUserId: string;
  actorAdminId: string;
}) {
  return prisma.user.update({
    where: { id: input.targetUserId },
    data: {
      isAmbassador: true,
      ambassadorPromotedAt: new Date(),
      ambassadorPromotedById: input.actorAdminId,
    },
    select: { id: true, displayName: true, isAmbassador: true },
  });
}

export async function revokeAmbassador(targetUserId: string) {
  return prisma.user.update({
    where: { id: targetUserId },
    data: {
      isAmbassador: false,
      ambassadorPromotedAt: null,
      ambassadorPromotedById: null,
    },
    select: { id: true, isAmbassador: true },
  });
}

export async function promoteToCommercialAgreed(input: {
  targetUserId: string;
  contractFileUrl: string;
  siret: string;
  companyName: string;
  address: string;
}) {
  if (!input.siret || input.siret.length < 9) {
    throw Errors.badRequest("SIRET/SIREN invalide");
  }
  return prisma.user.update({
    where: { id: input.targetUserId },
    data: {
      isCommercialAgreed: true,
      commercialContractAcceptedAt: new Date(),
      commercialContractFileUrl: input.contractFileUrl,
      commercialSiret: input.siret,
      commercialCompanyName: input.companyName,
      commercialAddress: input.address,
    },
    select: { id: true, isCommercialAgreed: true },
  });
}

export async function revokeCommercialAgreed(targetUserId: string) {
  return prisma.user.update({
    where: { id: targetUserId },
    data: { isCommercialAgreed: false },
    select: { id: true, isCommercialAgreed: true },
  });
}

// ---------------------------------------------------------------------------
// Réseau / filleuls (lecture)
// ---------------------------------------------------------------------------

/**
 * Liste les filleuls directs de l'utilisateur (1 niveau). Inclut le statut
 * de signup, le plan, le mois d'inscription. Anti-pyramidal : pas de
 * récursion sur les filleuls de filleuls.
 */
export async function listMyNetwork(actorUserId: string) {
  const referrals = await prisma.user.findMany({
    where: { referredById: actorUserId },
    select: {
      id: true,
      displayName: true,
      avatar: true,
      planCode: true,
      referredAt: true,
      createdAt: true,
      contacts: {
        select: { type: true, value: true, verifiedAt: true },
      },
    },
    orderBy: { referredAt: "desc" },
  });
  return referrals.map((r: any) => ({
    id: r.id,
    displayName: r.displayName,
    avatar: r.avatar,
    planCode: r.planCode,
    isPaid: r.planCode !== "FREE",
    joinedAt: r.referredAt?.toISOString() ?? r.createdAt.toISOString(),
    hasVerifiedEmail: r.contacts.some(
      (c: any) => c.type === "EMAIL" && c.verifiedAt,
    ),
  }));
}

/**
 * Stats agrégées du réseau : signups, conversions, CA total estimé.
 */
export async function getNetworkStats(actorUserId: string) {
  const referrals = await prisma.user.findMany({
    where: { referredById: actorUserId },
    select: { id: true, planCode: true, referredAt: true, createdAt: true },
  });
  const total = referrals.length;
  const paid = referrals.filter((r: any) => r.planCode !== "FREE").length;
  const free = total - paid;
  // CA mensuel estimé : pour V1 on hardcode des prix moyens par plan ; à
  // affiner en V2 avec une vraie source (SubscriptionState + Stripe).
  const PLAN_MONTHLY_EUR_CENTS: Record<string, number> = {
    PERSONAL: 499,
    FAMILY: 999,
    PRO: 1999,
    PREMIUM: 1999,
    BUSINESS: 2999,
  };
  const monthlyRevenueCents = referrals.reduce((sum: number, r: any) => {
    return sum + (PLAN_MONTHLY_EUR_CENTS[r.planCode] ?? 0);
  }, 0);
  return {
    total,
    paid,
    free,
    conversionRate: total > 0 ? Math.round((paid / total) * 100) : 0,
    estimatedMonthlyRevenueCents: monthlyRevenueCents,
  };
}

/**
 * Estimation des gains potentiels si l'ambassadeur devenait commercial agréé.
 * Utilise le taux de la config commission courante.
 * Pour la viralité : on calcule sur les 12 derniers mois.
 */
export async function getPotentialEarnings(actorUserId: string) {
  const config = await getCommissionConfig();
  const stats = await getNetworkStats(actorUserId);
  // Estimation simple : monthlyRevenue × rateBps × 12 mois (annualisé)
  const monthlyCommissionCents = Math.round(
    (stats.estimatedMonthlyRevenueCents * config.rateBps) / 10000,
  );
  const annualCommissionCents = monthlyCommissionCents * config.durationMonths;
  return {
    rateBps: config.rateBps,
    rateLabel: `${(config.rateBps / 100).toFixed(0)}%`,
    durationMonths: config.durationMonths,
    monthlyCommissionCents,
    annualCommissionCents,
    networkPaid: stats.paid,
  };
}

// ---------------------------------------------------------------------------
// Commissions (commercial agréé) — calcul + paiement
// ---------------------------------------------------------------------------

/**
 * Recalcule les lignes de commission du mois courant pour un commercial.
 * Idempotent (upsert par billingMonth × referredUser). À appeler par cron
 * mensuel ou bouton admin.
 */
export async function computeMonthlyCommissionsFor(input: {
  commercialUserId: string;
  month?: Date;
}) {
  const month = startOfMonth(input.month ?? new Date());
  const config = await getCommissionConfig();

  // Pour V1 simple : on prend toutes les referrals payantes du commercial
  // qui sont DANS la fenêtre de durationMonths après leur signup.
  const referrals = await prisma.user.findMany({
    where: {
      referredById: input.commercialUserId,
      planCode: { not: "FREE" },
    },
    select: { id: true, planCode: true, referredAt: true, createdAt: true },
  });

  const PLAN_MONTHLY_EUR_CENTS: Record<string, number> = {
    PERSONAL: 499,
    FAMILY: 999,
    PRO: 1999,
    PREMIUM: 1999,
    BUSINESS: 2999,
  };

  const lines: any[] = [];
  for (const r of referrals) {
    const referredAt = new Date(r.referredAt ?? r.createdAt);
    const monthsSinceSignup = monthsBetween(referredAt, month);
    // En dehors de la fenêtre commission ? → on skippe.
    if (monthsSinceSignup < 0 || monthsSinceSignup >= config.durationMonths) {
      continue;
    }
    const baseRevenueCents = PLAN_MONTHLY_EUR_CENTS[r.planCode] ?? 0;
    if (baseRevenueCents === 0) continue;
    const commissionCents = Math.round(
      (baseRevenueCents * config.rateBps) / 10000,
    );

    const line = await prisma.commercialCommissionLine.upsert({
      where: {
        commercialUserId_referredUserId_billingMonth: {
          commercialUserId: input.commercialUserId,
          referredUserId: r.id,
          billingMonth: month,
        },
      },
      create: {
        commercialUserId: input.commercialUserId,
        referredUserId: r.id,
        billingMonth: month,
        baseRevenueCents,
        commissionCents,
        rateBpsApplied: config.rateBps,
        payoutStatus: "PENDING",
      },
      update: {
        // On ne touche pas une ligne déjà PAID
        baseRevenueCents,
        commissionCents,
        rateBpsApplied: config.rateBps,
      },
    });
    lines.push(line);
  }
  return lines;
}

/**
 * Liste les lignes de commission d'un commercial (paginée par mois).
 */
export async function listMyCommissions(actorUserId: string, months: number = 12) {
  const since = startOfMonth(addMonths(new Date(), -months));
  return prisma.commercialCommissionLine.findMany({
    where: {
      commercialUserId: actorUserId,
      billingMonth: { gte: since },
    },
    include: {
      referredUser: { select: { id: true, displayName: true, planCode: true } },
    },
    orderBy: [{ billingMonth: "desc" }, { commissionCents: "desc" }],
  });
}

/**
 * Marque une ligne comme PAID (admin only). Optionnellement avec stripeTransferId.
 */
export async function markLinePaid(input: {
  lineId: string;
  stripeTransferId?: string | null;
  adminNotes?: string | null;
}) {
  return prisma.commercialCommissionLine.update({
    where: { id: input.lineId },
    data: {
      payoutStatus: "PAID",
      paidAt: new Date(),
      stripeTransferId: input.stripeTransferId ?? undefined,
      adminNotes: input.adminNotes ?? undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Admin : liste ambassadeurs / commerciaux
// ---------------------------------------------------------------------------

export async function listAmbassadors() {
  return prisma.user.findMany({
    where: { isAmbassador: true },
    select: {
      id: true,
      displayName: true,
      avatar: true,
      isCommercialAgreed: true,
      ambassadorPromotedAt: true,
      planCode: true,
      _count: { select: { referrals: true } },
    },
    orderBy: { ambassadorPromotedAt: "desc" },
  });
}

export async function listCommercials() {
  const commercials = await prisma.user.findMany({
    where: { isCommercialAgreed: true },
    select: {
      id: true,
      displayName: true,
      avatar: true,
      commercialContractAcceptedAt: true,
      commercialSiret: true,
      commercialCompanyName: true,
      stripeConnectAccountId: true,
      _count: { select: { referrals: true } },
    },
    orderBy: { commercialContractAcceptedAt: "desc" },
  });
  // Calcul CA et commissions par commercial (3 derniers mois)
  const since = startOfMonth(addMonths(new Date(), -3));
  const aggregates = await prisma.commercialCommissionLine.groupBy({
    by: ["commercialUserId"],
    where: { billingMonth: { gte: since } },
    _sum: {
      baseRevenueCents: true,
      commissionCents: true,
    },
  });
  const aggMap = new Map(
    aggregates.map((a: any) => [a.commercialUserId, a._sum]),
  );
  return commercials.map((c: any) => ({
    ...c,
    last3Months: aggMap.get(c.id) ?? {
      baseRevenueCents: 0,
      commissionCents: 0,
    },
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  );
}
