/**
 * Service Affiliate / Referral V2 (spec §6.9 — refonte parrainage).
 *
 * Deux régimes coexistent :
 *
 *   1. PARRAINAGE STANDARD (tous les users) :
 *      - Code REF-XXXXXX généré à la 1ère utilisation
 *      - Filleul applique → -20 % sur ses 3 premiers mois Premium
 *      - Parrain reçoit 5 € de crédit BMD au 1er paiement réel du filleul
 *      - Paliers (10/25/50/100 filleuls = bonus + badges)
 *      - Limite : 30 jours après inscription pour redeem (anti-fraude
 *        rétroactive)
 *
 *   2. PROGRAMME COMMERCIAL (user.isAffiliate = true) :
 *      - Code AFF-XXXXXX généré
 *      - Commissions multi-niveaux 20/5/2 % récurrentes (configurable)
 *      - Durée par niveau (L1 à vie, L2 12 mois, L3 6 mois)
 *      - KYC obligatoire avant payout
 *      - Hold 30j sur chaque commission (anti-chargeback)
 *      - Plafond 50 nouveaux L1 / mois
 *
 * Toutes les valeurs (%, durées, paliers) sont stockées en base
 * (AffiliateProgram singleton) → modifiables en admin sans déploiement.
 *
 * Calcul des commissions : appelé à chaque paiement réussi via Stripe
 * webhook. On remonte la chaîne `referredById` jusqu'à 3 niveaux et on
 * crée 0..3 lignes AffiliateCommission.
 */
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { convert } from "../../lib/fx.js";

const PROGRAM_CACHE_TTL_MS = 60_000;
let programCache: {
  enabled: boolean;
  l1Percent: number;
  l1DurationMonths: number;
  l2Percent: number;
  l2DurationMonths: number;
  l3Percent: number;
  l3DurationMonths: number;
  holdDays: number;
  minPayoutCents: number;
  maxL1ReferralsPerMonth: number;
  milestoneBonuses: Array<{
    count: number;
    bonusCents: number;
    badge?: string;
    monthsPremium?: number;
  }>;
  loadedAt: number;
} | null = null;

async function getProgram() {
  if (programCache && Date.now() - programCache.loadedAt < PROGRAM_CACHE_TTL_MS) {
    return programCache;
  }
  const row = await prisma.affiliateProgram.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  const fresh = {
    enabled: row.enabled,
    l1Percent: parseFloat(row.l1Percent.toString()),
    l1DurationMonths: row.l1DurationMonths,
    l2Percent: parseFloat(row.l2Percent.toString()),
    l2DurationMonths: row.l2DurationMonths,
    l3Percent: parseFloat(row.l3Percent.toString()),
    l3DurationMonths: row.l3DurationMonths,
    holdDays: row.holdDays,
    minPayoutCents: row.minPayoutCents,
    maxL1ReferralsPerMonth: row.maxL1ReferralsPerMonth,
    milestoneBonuses: Array.isArray(row.milestoneBonuses)
      ? (row.milestoneBonuses as any)
      : [],
    loadedAt: Date.now(),
  };
  programCache = fresh;
  return fresh;
}

export function invalidateProgramCache(): void {
  programCache = null;
}

// ============================================================
// Génération des codes
// ============================================================

async function generateCode(prefix: "REF" | "AFF"): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const suffix = randomBytes(4)
      .toString("base64")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 6);
    if (suffix.length < 6) continue;
    const code = `${prefix}-${suffix}`;
    const exists = prefix === "REF"
      ? await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } })
      : await prisma.user.findUnique({ where: { affiliateCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  // Fallback timestamp
  return `${prefix}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

/**
 * Récupère ou crée le code de parrainage standard d'un user.
 * Aussi enregistré dans PromoCode pour rétro-compatibilité avec le système
 * de promo existant.
 */
export async function getOrCreateReferralCode(userId: string): Promise<{
  code: string;
  totalReferred: number;
  totalActiveReferred: number;
  totalCreditCents: number;
  nextMilestone: { count: number; bonusCents: number; badge?: string } | null;
}> {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true, referralCreditCents: true },
  });
  if (!user) throw Errors.notFound("Utilisateur introuvable");

  if (!user.referralCode) {
    const newCode = await generateCode("REF");
    user = await prisma.user.update({
      where: { id: userId },
      data: { referralCode: newCode },
      select: { referralCode: true, referralCreditCents: true },
    });
    // Rétro-compat avec PromoCode : on crée aussi une ligne avec
    // discountValue = 20% (filleul reçoit 20% sur 3 premiers mois)
    await prisma.promoCode.upsert({
      where: { code: newCode },
      create: {
        code: newCode,
        type: "REFERRAL",
        discountValue: new Prisma.Decimal(20),
        discountKind: "PERCENT",
        description: "Code de parrainage personnel — 20% pour filleul, 5€ pour parrain",
        ownerUserId: userId,
      },
      update: {},
    });
  }

  const totalReferred = await prisma.user.count({
    where: { referredById: userId },
  });
  // "Active" = filleul qui a déjà payé au moins une fois (a une
  // SubscriptionState.expiresAt non-null ET status != CANCELLED)
  const totalActiveReferred = await prisma.user.count({
    where: {
      referredById: userId,
      subscription: {
        status: { in: ["ACTIVE", "GRACE", "WARN", "DOWNGRADED"] },
        expiresAt: { not: null },
      },
    },
  });

  // Prochain palier
  const program = await getProgram();
  const next =
    program.milestoneBonuses
      .filter((m: any) => m.count > totalActiveReferred)
      .sort((a: any, b: any) => a.count - b.count)[0] ?? null;

  return {
    code: user.referralCode!,
    totalReferred,
    totalActiveReferred,
    totalCreditCents: user.referralCreditCents,
    nextMilestone: next,
  };
}

/**
 * Promotion d'un user en commercial (réservé aux super-admins).
 * Génère un code AFF-XXXXXX en plus du code REF-XXXXXX existant.
 */
export async function promoteToAffiliate(userId: string): Promise<{
  affiliateCode: string;
}> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { affiliateCode: true, isAffiliate: true },
  });
  if (!existing) throw Errors.notFound("Utilisateur introuvable");
  if (existing.affiliateCode) {
    return { affiliateCode: existing.affiliateCode };
  }
  const code = await generateCode("AFF");
  await prisma.user.update({
    where: { id: userId },
    data: { isAffiliate: true, affiliateCode: code },
  });
  return { affiliateCode: code };
}

/**
 * Applique un code de parrainage / commercial sur un user (filleul).
 * Vérifie la limite temporelle (30j après inscription max) + l'unicité.
 */
export async function applyReferralCode(input: {
  code: string;
  userId: string;
}): Promise<{
  parentId: string;
  parentType: "REGULAR" | "AFFILIATE";
  discount: { kind: "PERCENT"; value: number; durationMonths: number };
}> {
  const codeUpper = input.code.trim().toUpperCase();
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      createdAt: true,
      referredById: true,
      referralCode: true,
    },
  });
  if (!user) throw Errors.notFound("Utilisateur introuvable");

  // Anti-rétroactif : limite à 30 jours après inscription du filleul
  const ageDays =
    (Date.now() - user.createdAt.getTime()) / (24 * 3600 * 1000);
  if (ageDays > 30) {
    throw Errors.badRequest(
      "Ce code n'est plus applicable — la fenêtre de 30 jours après inscription est dépassée.",
      {
        tip: "Les codes de parrainage doivent être saisis dans les 30 jours après création du compte.",
      },
    );
  }

  // Déjà parrainé : on ne peut pas changer de parrain
  if (user.referredById) {
    throw Errors.badRequest("Tu as déjà un parrain — un seul code par compte.");
  }

  // Trouve le propriétaire du code (peut être referralCode OU affiliateCode)
  const parent = await prisma.user.findFirst({
    where: {
      OR: [{ referralCode: codeUpper }, { affiliateCode: codeUpper }],
    },
    select: { id: true, isAffiliate: true, referralCode: true, affiliateCode: true },
  });
  if (!parent) {
    throw Errors.notFound("Ce code n'existe pas (vérifie l'orthographe).");
  }
  if (parent.id === user.id) {
    throw Errors.badRequest("Tu ne peux pas utiliser ton propre code 😉");
  }

  const isAff = codeUpper === parent.affiliateCode;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      referredById: parent.id,
      referredAt: new Date(),
    },
  });

  // Détermine la réduction filleul : -20% sur 3 premiers mois (configurable
  // via PromoCode.discountValue mais on utilise la valeur par défaut ici).
  return {
    parentId: parent.id,
    parentType: isAff ? "AFFILIATE" : "REGULAR",
    discount: {
      kind: "PERCENT",
      value: 20,
      durationMonths: 3,
    },
  };
}

/**
 * Au moment d'un paiement réussi (webhook Stripe), on calcule et crée les
 * commissions/récompenses pour les ancêtres jusqu'à 3 niveaux.
 *
 * Invariants :
 *   - Les commissions sont en PENDING jusqu'au holdDays (anti-chargeback)
 *   - Les % sont snapshotés au moment du paiement (recalcul si admin
 *     change ne touchera pas l'historique)
 *   - Devise pivot EUR pour les calculs internes, conversion en payoutCurrency
 *     du bénéficiaire au moment du payout
 */
export async function recordPaymentForCommissions(input: {
  payerId: string;
  /** Référence Stripe ou ID interne */
  paymentRef: string;
  /** Montant payé en centimes dans la devise source */
  sourceAmountCents: number;
  sourceCurrency: string;
  /** Date du paiement (now par défaut) */
  paidAt?: Date;
}): Promise<{ commissionsCreated: number; rewardsCreated: number }> {
  const program = await getProgram();
  if (!program.enabled) return { commissionsCreated: 0, rewardsCreated: 0 };

  // Remonte la chaîne d'ancêtres (max 3)
  const chain: Array<{
    userId: string;
    isAffiliate: boolean;
    referredAt: Date | null;
    payoutCurrency: string;
  }> = [];
  let currentId: string | null = input.payerId;
  for (let level = 0; level < 3; level++) {
    if (!currentId) break;
    const u: {
      referredById: string | null;
      referredAt: Date | null;
      isAffiliate: boolean;
      defaultCurrency: string;
    } | null = await prisma.user.findUnique({
      where: { id: currentId },
      select: {
        referredById: true,
        referredAt: true,
        isAffiliate: true,
        defaultCurrency: true,
      },
    });
    if (!u || !u.referredById) break;
    // Annotation explicite pour éviter TS7022 (Prisma types peuvent
    // induire une circularité avec d'autres relations sur User).
    const parent: {
      id: string;
      isAffiliate: boolean;
      defaultCurrency: string;
    } | null = await prisma.user.findUnique({
      where: { id: u.referredById },
      select: {
        id: true,
        isAffiliate: true,
        defaultCurrency: true,
      },
    });
    if (!parent) break;
    chain.push({
      userId: parent.id,
      isAffiliate: parent.isAffiliate,
      referredAt: u.referredAt,
      payoutCurrency: parent.defaultCurrency,
    });
    currentId = parent.id;
  }

  let commissionsCreated = 0;
  let rewardsCreated = 0;
  const now = input.paidAt ?? new Date();

  for (let i = 0; i < chain.length; i++) {
    const ancestor = chain[i]!;
    const level = i + 1;
    const percent =
      level === 1
        ? program.l1Percent
        : level === 2
          ? program.l2Percent
          : program.l3Percent;
    const durationMonths =
      level === 1
        ? program.l1DurationMonths
        : level === 2
          ? program.l2DurationMonths
          : program.l3DurationMonths;

    // Vérifie que la durée n'est pas dépassée (-1 = à vie)
    if (
      durationMonths !== -1 &&
      ancestor.referredAt &&
      now.getTime() - ancestor.referredAt.getTime() >
        durationMonths * 30 * 24 * 3600 * 1000
    ) {
      continue;
    }

    // Seuls les commerciaux reçoivent des commissions L2/L3
    // Les users normaux n'ont que la récompense one-shot (REWARD) sur L1
    if (!ancestor.isAffiliate && level > 1) continue;

    const sourceCommissionCents = Math.round(
      input.sourceAmountCents * (percent / 100),
    );
    // Conversion source → payoutCurrency
    let payoutCents = sourceCommissionCents;
    if (input.sourceCurrency.toUpperCase() !== ancestor.payoutCurrency.toUpperCase()) {
      try {
        const converted = await convert(
          sourceCommissionCents,
          input.sourceCurrency,
          ancestor.payoutCurrency,
        );
        payoutCents = Math.round(converted);
      } catch {
        // Si la conversion FX échoue, on stocke la commission dans la devise source
        // (l'admin pourra réconcilier manuellement).
      }
    }

    if (ancestor.isAffiliate) {
      // Commercial : commission récurrente
      await prisma.affiliateCommission.create({
        data: {
          payerId: input.payerId,
          beneficiaryId: ancestor.userId,
          level,
          percent: new Prisma.Decimal(percent),
          sourceCurrency: input.sourceCurrency.toUpperCase(),
          sourceAmountCents: input.sourceAmountCents,
          payoutCurrency: ancestor.payoutCurrency.toUpperCase(),
          payoutAmountCents: payoutCents,
          status: "PENDING",
          sourcePaymentRef: input.paymentRef,
        },
      });
      commissionsCreated += 1;
    } else if (level === 1) {
      // Parrain non-commercial : récompense one-shot 5 € au 1er paiement
      // du filleul (et seulement le 1er — on vérifie l'historique).
      const alreadyRewarded = await prisma.referralReward.findFirst({
        where: {
          parentUserId: ancestor.userId,
          childUserId: input.payerId,
          kind: "FIRST_PAYMENT",
        },
      });
      if (!alreadyRewarded) {
        const REWARD_CENTS_EUR = 500; // 5 €
        let payoutInLocal = REWARD_CENTS_EUR;
        if (ancestor.payoutCurrency.toUpperCase() !== "EUR") {
          try {
            const c = await convert(REWARD_CENTS_EUR, "EUR", ancestor.payoutCurrency);
            payoutInLocal = Math.round(c);
          } catch {
            /* fallback */
          }
        }
        await prisma.$transaction([
          prisma.referralReward.create({
            data: {
              parentUserId: ancestor.userId,
              childUserId: input.payerId,
              kind: "FIRST_PAYMENT",
              amountCents: REWARD_CENTS_EUR,
              payoutCurrency: ancestor.payoutCurrency.toUpperCase(),
              payoutAmountCents: payoutInLocal,
              status: "CREDITED",
              description: "1er paiement de ton filleul",
            },
          }),
          prisma.user.update({
            where: { id: ancestor.userId },
            data: {
              referralCreditCents: { increment: REWARD_CENTS_EUR },
            },
          }),
        ]);
        rewardsCreated += 1;
        // Vérifie aussi les paliers (10, 25, 50, 100…)
        await checkAndAwardMilestones(ancestor.userId);
      }
    }
  }

  return { commissionsCreated, rewardsCreated };
}

/**
 * Vérifie si le parrain a atteint un nouveau palier de filleuls actifs et
 * lui attribue le bonus correspondant (idempotent : un palier ne se
 * déclenche qu'une fois).
 */
async function checkAndAwardMilestones(parentUserId: string): Promise<void> {
  const program = await getProgram();
  const activeReferrals = await prisma.user.count({
    where: {
      referredById: parentUserId,
      subscription: { expiresAt: { not: null } },
    },
  });
  for (const m of program.milestoneBonuses as any[]) {
    if (typeof m.count !== "number" || typeof m.bonusCents !== "number") continue;
    if (activeReferrals < m.count) continue;
    // Déjà récompensé pour ce palier ?
    const already = await prisma.referralReward.findFirst({
      where: {
        parentUserId,
        kind: "MILESTONE",
        description: { contains: `Palier ${m.count}` },
      },
    });
    if (already) continue;
    const parent = await prisma.user.findUnique({
      where: { id: parentUserId },
      select: { defaultCurrency: true },
    });
    let payoutLocal = m.bonusCents;
    if (parent && parent.defaultCurrency.toUpperCase() !== "EUR") {
      try {
        const c = await convert(m.bonusCents, "EUR", parent.defaultCurrency);
        payoutLocal = Math.round(c);
      } catch {
        /* fallback */
      }
    }
    await prisma.$transaction([
      prisma.referralReward.create({
        data: {
          parentUserId,
          kind: "MILESTONE",
          amountCents: m.bonusCents,
          payoutCurrency: parent?.defaultCurrency.toUpperCase() ?? "EUR",
          payoutAmountCents: payoutLocal,
          status: "CREDITED",
          description: `Palier ${m.count} filleuls actifs · ${m.badge ?? ""}`,
        },
      }),
      prisma.user.update({
        where: { id: parentUserId },
        data: { referralCreditCents: { increment: m.bonusCents } },
      }),
    ]);
  }
}

/**
 * Récupère le dashboard commercial d'un user (commissions par niveau,
 * pending vs payable, total reçu).
 */
export async function getAffiliateDashboard(userId: string): Promise<{
  isAffiliate: boolean;
  affiliateCode: string | null;
  kycStatus: string;
  l1Count: number;
  l2Count: number;
  l3Count: number;
  pendingCents: number;
  payableCents: number;
  paidCents: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAffiliate: true,
      affiliateCode: true,
      affiliateKycStatus: true,
      defaultCurrency: true,
    },
  });
  if (!user) throw Errors.notFound("Utilisateur introuvable");

  // Compte filleuls par niveau (récursif via la chaîne referredById)
  const directs = await prisma.user.findMany({
    where: { referredById: userId },
    select: { id: true },
  });
  const l1Count = directs.length;
  const l2Ids: string[] = [];
  for (const d of directs) {
    const sub = await prisma.user.findMany({
      where: { referredById: d.id },
      select: { id: true },
    });
    l2Ids.push(...sub.map((s) => s.id));
  }
  const l2Count = l2Ids.length;
  let l3Count = 0;
  for (const id of l2Ids) {
    l3Count += await prisma.user.count({ where: { referredById: id } });
  }

  // Sommes de commissions par status
  const groups = await prisma.affiliateCommission.groupBy({
    by: ["status"],
    where: { beneficiaryId: userId },
    _sum: { payoutAmountCents: true },
  });
  const sumByStatus: Record<string, number> = {};
  for (const g of groups) {
    sumByStatus[g.status] = g._sum.payoutAmountCents ?? 0;
  }

  return {
    isAffiliate: user.isAffiliate,
    affiliateCode: user.affiliateCode,
    kycStatus: user.affiliateKycStatus,
    l1Count,
    l2Count,
    l3Count,
    pendingCents: sumByStatus.PENDING ?? 0,
    payableCents: sumByStatus.PAYABLE ?? 0,
    paidCents: sumByStatus.PAID ?? 0,
  };
}

/**
 * Tick périodique : passe les commissions PENDING > holdDays en PAYABLE.
 * À appeler 1x / jour depuis le scheduler.
 */
export async function tickPromoteCommissionsToPayable(): Promise<{
  promoted: number;
}> {
  const program = await getProgram();
  const cutoff = new Date(
    Date.now() - program.holdDays * 24 * 3600 * 1000,
  );
  const result = await prisma.affiliateCommission.updateMany({
    where: { status: "PENDING", createdAt: { lte: cutoff } },
    data: { status: "PAYABLE" },
  });
  return { promoted: result.count };
}
