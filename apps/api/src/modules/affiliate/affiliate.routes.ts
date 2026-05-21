/**
 * Routes Affiliate / Referral V2 (spec §6.9).
 *
 *  User :
 *    GET  /me/referral-info          → mon code, mes stats, prochain palier
 *    POST /me/apply-referral-code    → applique un code (REF-* ou AFF-*)
 *    GET  /me/affiliate-dashboard    → si commercial : commissions L1/L2/L3
 *    GET  /me/referral-rewards       → historique des récompenses one-shot
 *    GET  /me/subscription-info      → état de souscription (ACTIVE/GRACE/...)
 *
 *  Admin :
 *    GET    /admin/affiliate-program → config actuelle (paliers, %, durées)
 *    PATCH  /admin/affiliate-program → modif config (en live, pas de redéploi)
 *    GET    /admin/downgrade-policy
 *    PATCH  /admin/downgrade-policy
 *    POST   /admin/users/:id/promote-affiliate → transformer un user en commercial
 *    POST   /admin/users/:id/affiliate-kyc     → valider le KYC
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { assertSuperAdmin } from "../admin/admin.service.js";
import {
  applyReferralCode,
  getAffiliateDashboard,
  getOrCreateReferralCode,
  invalidateProgramCache,
  promoteToAffiliate,
} from "./affiliate.service.js";
import {
  getUserSubscriptionInfo,
  invalidatePolicyCache,
} from "../subscription/subscription-state.service.js";

export async function affiliateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  // ============ User ============

  app.get("/me/referral-info", async (req) => {
    return getOrCreateReferralCode(req.user.sub);
  });

  app.post("/me/apply-referral-code", async (req) => {
    const body = z
      .object({ code: z.string().min(2).max(40) })
      .parse(req.body);
    return applyReferralCode({ code: body.code, userId: req.user.sub });
  });

  /**
   * V177.B — GET /me/referrer
   * Retourne les infos du parrain ACTUEL du user connecté + l'avantage obtenu.
   * Si pas de parrain : retourne `referrer: null` + un flag `canApply` indiquant
   * si l'user est encore dans la fenêtre des 30 jours pour appliquer un code.
   *
   * Le verrou est définitif : `applyReferralCode` refuse tout changement
   * dès que `referredById` est non-null (un seul code par compte).
   */
  app.get("/me/referrer", async (req) => {
    const userId = req.user.sub;
    const me = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        referredById: true,
        referredAt: true,
      },
    });

    // Anti-rétroactif : 30 jours après inscription max
    const ageMs = Date.now() - me.createdAt.getTime();
    const ageDays = ageMs / (24 * 3600 * 1000);
    const daysLeftToApply = Math.max(0, Math.ceil(30 - ageDays));

    if (!me.referredById) {
      return {
        referrer: null,
        appliedAt: null,
        discount: null,
        remainingDays: 0,
        canApply: daysLeftToApply > 0,
        daysToApply: daysLeftToApply,
      };
    }

    const parent = await prisma.user.findUnique({
      where: { id: me.referredById },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        referralCode: true,
        affiliateCode: true,
        isAffiliate: true,
      },
    });

    if (!parent) {
      // Edge case : parent supprimé → on retourne quand même le statut bloqué
      return {
        referrer: null,
        appliedAt: me.referredAt?.toISOString() ?? null,
        discount: null,
        remainingDays: 0,
        canApply: false,
        daysToApply: 0,
      };
    }

    // Avantage filleul : -20% sur 3 mois à partir de la date du parrainage.
    const DURATION_MONTHS = 3;
    const DISCOUNT_PERCENT = 20;
    const appliedAt = me.referredAt ?? me.createdAt;
    const endDate = new Date(appliedAt);
    endDate.setMonth(endDate.getMonth() + DURATION_MONTHS);
    const remainingMs = endDate.getTime() - Date.now();
    const remainingDays = Math.max(
      0,
      Math.ceil(remainingMs / (24 * 3600 * 1000)),
    );

    return {
      referrer: {
        id: parent.id,
        displayName: parent.displayName,
        avatar: parent.avatar,
        codeUsed: parent.isAffiliate
          ? parent.affiliateCode ?? parent.referralCode
          : parent.referralCode,
        isAffiliate: parent.isAffiliate,
        parentType: parent.isAffiliate ? "AFFILIATE" : "REGULAR",
      },
      appliedAt: appliedAt.toISOString(),
      discount: {
        kind: "PERCENT" as const,
        value: DISCOUNT_PERCENT,
        durationMonths: DURATION_MONTHS,
      },
      remainingDays,
      canApply: false,
      daysToApply: 0,
    };
  });

  app.get("/me/affiliate-dashboard", async (req) => {
    return getAffiliateDashboard(req.user.sub);
  });

  /**
   * GET /me/affiliate-network
   * Liste détaillée du réseau du commercial : ses filleuls L1/L2/L3 avec
   * leur statut d'abonnement, devise, total payé, et la commission
   * accumulée pour le commercial. Transparence totale.
   */
  app.get("/me/affiliate-network", async (req) => {
    const userId = req.user.sub;

    // L1 : filleuls directs
    const l1 = await prisma.user.findMany({
      where: { referredById: userId },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        defaultCurrency: true,
        planCode: true,
        createdAt: true,
        referredAt: true,
        subscription: {
          select: {
            status: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // V175.C — Fix N+1 : 1 seul groupBy global sur commissions L1 + 1 seul
    // groupBy global sur les users L2, au lieu de N+N requêtes.
    const l1Ids = l1.map((u) => u.id);
    const [commissionsAgg, l2Agg] = await Promise.all([
      l1Ids.length > 0
        ? prisma.affiliateCommission.groupBy({
            by: ["payerId", "status"],
            where: { beneficiaryId: userId, payerId: { in: l1Ids } },
            _sum: { payoutAmountCents: true },
          })
        : Promise.resolve([] as Array<{ payerId: string; status: string; _sum: { payoutAmountCents: number | null } }>),
      l1Ids.length > 0
        ? prisma.user.groupBy({
            by: ["referredById"],
            where: { referredById: { in: l1Ids } },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ referredById: string | null; _count: { _all: number } }>),
    ]);

    // Maps de lookup O(1)
    const commByPayer = new Map<string, Record<string, number>>();
    for (const row of commissionsAgg) {
      const key = row.payerId as string;
      const bucket = commByPayer.get(key) ?? {};
      bucket[row.status as string] = row._sum.payoutAmountCents ?? 0;
      commByPayer.set(key, bucket);
    }
    const l2CountByParent = new Map<string, number>();
    for (const row of l2Agg) {
      if (row.referredById) l2CountByParent.set(row.referredById, row._count._all);
    }

    const network = l1.map((u) => {
      const byStatus = commByPayer.get(u.id) ?? {};
      const l2Count = l2CountByParent.get(u.id) ?? 0;
      // V177.C — Avantage filleul estimé :
      //  - FREE → 0 (pas d'abonnement payant déclenché)
      //  - sinon → 20% sur les paiements qui ont généré des commissions.
      //    Commission parrain L1 = 30% du paiement filleul. Donc paiement =
      //    commission / 0.30, et économie filleul = paiement × 0.20.
      const totalCommCents =
        (byStatus.PENDING ?? 0) +
        (byStatus.PAYABLE ?? 0) +
        (byStatus.PAID ?? 0);
      const hasPayingPlan = u.planCode && u.planCode !== "FREE";
      const discountSavedCents = hasPayingPlan && totalCommCents > 0
        ? Math.round((totalCommCents / 0.30) * 0.20)
        : 0;
      return {
        id: u.id,
        displayName: u.displayName,
        avatar: u.avatar,
        defaultCurrency: u.defaultCurrency,
        planCode: u.planCode,
        subscriptionStatus: u.subscription?.status ?? "FREE",
        joinedAt: u.referredAt?.toISOString() ?? u.createdAt.toISOString(),
        subL2Count: l2Count,
        totalPendingCents: byStatus.PENDING ?? 0,
        totalPayableCents: byStatus.PAYABLE ?? 0,
        totalPaidCents: byStatus.PAID ?? 0,
        // V177.C — Avantage obtenu par le filleul (estimation FX-naïve EUR)
        discountSavedCents,
        hasPayingPlan: !!hasPayingPlan,
      };
    });

    // Liste des paiements récents (derniers 50) avec breakdown par niveau
    const recent = await prisma.affiliateCommission.findMany({
      where: { beneficiaryId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        payer: {
          select: { id: true, displayName: true, avatar: true },
        },
      },
    });

    return {
      network,
      recentCommissions: recent.map((c) => ({
        id: c.id,
        payer: c.payer,
        level: c.level,
        percent: parseFloat(c.percent.toString()),
        sourceCurrency: c.sourceCurrency,
        sourceAmountCents: c.sourceAmountCents,
        payoutCurrency: c.payoutCurrency,
        payoutAmountCents: c.payoutAmountCents,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        paidAt: c.paidAt?.toISOString() ?? null,
      })),
    };
  });

  app.get("/me/referral-rewards", async (req) => {
    const items = await prisma.referralReward.findMany({
      where: { parentUserId: req.user.sub },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return items.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountCents: r.amountCents,
      payoutCurrency: r.payoutCurrency,
      payoutAmountCents: r.payoutAmountCents,
      status: r.status,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  app.get("/me/subscription-info", async (req) => {
    return getUserSubscriptionInfo(req.user.sub);
  });

  // ============ Admin (super-admin only) ============

  app.get("/admin/affiliate-program", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const row = await prisma.affiliateProgram.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
    return {
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
      milestoneBonuses: row.milestoneBonuses,
    };
  });

  app.patch("/admin/affiliate-program", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const body = z
      .object({
        enabled: z.boolean().optional(),
        l1Percent: z.coerce.number().min(0).max(100).optional(),
        l1DurationMonths: z.coerce.number().int().min(-1).max(120).optional(),
        l2Percent: z.coerce.number().min(0).max(100).optional(),
        l2DurationMonths: z.coerce.number().int().min(-1).max(120).optional(),
        l3Percent: z.coerce.number().min(0).max(100).optional(),
        l3DurationMonths: z.coerce.number().int().min(-1).max(120).optional(),
        holdDays: z.coerce.number().int().min(0).max(180).optional(),
        minPayoutCents: z.coerce.number().int().min(0).optional(),
        maxL1ReferralsPerMonth: z.coerce.number().int().min(1).max(1000).optional(),
        milestoneBonuses: z
          .array(
            z.object({
              count: z.number().int().min(1),
              bonusCents: z.number().int().min(0),
              badge: z.string().optional(),
              monthsPremium: z.number().int().min(0).optional(),
            }),
          )
          .optional(),
      })
      .parse(req.body);
    const data: any = { ...body };
    if (body.l1Percent !== undefined)
      data.l1Percent = new Prisma.Decimal(body.l1Percent);
    if (body.l2Percent !== undefined)
      data.l2Percent = new Prisma.Decimal(body.l2Percent);
    if (body.l3Percent !== undefined)
      data.l3Percent = new Prisma.Decimal(body.l3Percent);
    const updated = await prisma.affiliateProgram.update({
      where: { id: "default" },
      data,
    });
    invalidateProgramCache();
    return {
      enabled: updated.enabled,
      l1Percent: parseFloat(updated.l1Percent.toString()),
      l2Percent: parseFloat(updated.l2Percent.toString()),
      l3Percent: parseFloat(updated.l3Percent.toString()),
      milestoneBonuses: updated.milestoneBonuses,
    };
  });

  app.get("/admin/downgrade-policy", async (req) => {
    await assertSuperAdmin(req.user.sub);
    return prisma.planDowngradePolicy.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
  });

  app.patch("/admin/downgrade-policy", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const body = z
      .object({
        graceDays: z.coerce.number().int().min(0).max(90).optional(),
        warnDays: z.coerce.number().int().min(0).max(90).optional(),
        enabled: z.boolean().optional(),
        notifyBeforeDays: z.array(z.number().int().min(0).max(60)).optional(),
      })
      .parse(req.body);
    const updated = await prisma.planDowngradePolicy.update({
      where: { id: "default" },
      data: body as any,
    });
    invalidatePolicyCache();
    return updated;
  });

  app.post("/admin/users/:id/promote-affiliate", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return promoteToAffiliate(id);
  });

  app.post("/admin/users/:id/affiliate-kyc", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        status: z.enum(["NONE", "PENDING", "VERIFIED", "REJECTED"]),
      })
      .parse(req.body);
    const u = await prisma.user.update({
      where: { id },
      data: { affiliateKycStatus: body.status },
      select: { id: true, displayName: true, affiliateKycStatus: true },
    });
    return u;
  });
}
