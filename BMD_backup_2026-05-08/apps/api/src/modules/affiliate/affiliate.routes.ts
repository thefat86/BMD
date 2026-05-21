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

    // Pour chaque L1, ses commissions générées
    const network = await Promise.all(
      l1.map(async (u) => {
        const sums = await prisma.affiliateCommission.groupBy({
          by: ["status"],
          where: { beneficiaryId: userId, payerId: u.id },
          _sum: { payoutAmountCents: true },
        });
        const byStatus: Record<string, number> = {};
        for (const s of sums) byStatus[s.status] = s._sum.payoutAmountCents ?? 0;
        // L2 sous ce L1
        const l2Count = await prisma.user.count({
          where: { referredById: u.id },
        });
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
        };
      }),
    );

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
