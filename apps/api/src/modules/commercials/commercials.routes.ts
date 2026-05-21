/**
 * V164 — Routes module Commercial.
 *
 *   Ambassadeur (Phase 1, no cash):
 *     GET  /ambassador/me/status              avantages activés + flag
 *     GET  /ambassador/me/network             liste filleuls
 *     GET  /ambassador/me/stats               stats agrégées + revenu estimé
 *     GET  /ambassador/me/potential-earnings  combien je gagnerais en agréé
 *
 *   Commercial agréé (Phase 3, cash):
 *     GET  /commercial/me/status              KYC, contrat, infos société
 *     GET  /commercial/me/commissions         lignes mensuelles
 *     POST /commercial/me/recompute           recalcule commissions du mois courant
 *
 *   Messagerie réseau (ambassadeur OU commercial):
 *     POST /network-messages                  envoie message à filleul direct
 *     GET  /network-messages/sent             historique de mes messages
 *
 *   Admin:
 *     GET  /admin/ambassadors
 *     POST /admin/users/:id/promote-ambassador
 *     DELETE /admin/users/:id/ambassador
 *     POST /admin/users/:id/promote-commercial   (signature + SIRET requis)
 *     DELETE /admin/users/:id/commercial
 *     GET  /admin/commercials                 liste + agrégats 3 derniers mois
 *     GET  /admin/commission-config
 *     PUT  /admin/commission-config
 *     GET  /admin/ambassador-config
 *     PUT  /admin/ambassador-config
 *     GET  /admin/referral-config
 *     PUT  /admin/referral-config
 *     POST /admin/commission-lines/:id/pay
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import {
  getCommissionConfig,
  updateCommissionConfig,
  getAmbassadorConfig,
  updateAmbassadorConfig,
  getReferralConfig,
  updateReferralConfig,
  promoteToAmbassador,
  revokeAmbassador,
  promoteToCommercialAgreed,
  revokeCommercialAgreed,
  listMyNetwork,
  getNetworkStats,
  getPotentialEarnings,
  listMyCommissions,
  computeMonthlyCommissionsFor,
  markLinePaid,
  listAmbassadors,
  listCommercials,
} from "./commercials.service.js";
import {
  sendNetworkMessage,
  listMessagesSent,
} from "./network-messages.service.js";

const prisma = prismaClient as any;

async function requireSuperAdmin(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  if (!u?.isSuperAdmin) {
    throw Errors.forbidden("Réservé aux SuperAdmins BMD.");
  }
}

export async function commercialsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  // ==========================================================
  // Ambassadeur
  // ==========================================================

  app.get("/ambassador/me/status", async (req) => {
    const me = (req.user as any).sub;
    const [user, ambConfig] = await Promise.all([
      prisma.user.findUnique({
        where: { id: me },
        select: {
          isAmbassador: true,
          isCommercialAgreed: true,
          ambassadorPromotedAt: true,
          referralCode: true,
        },
      }),
      getAmbassadorConfig(),
    ]);
    return {
      isAmbassador: !!user?.isAmbassador,
      isCommercialAgreed: !!user?.isCommercialAgreed,
      promotedAt: user?.ambassadorPromotedAt?.toISOString() ?? null,
      referralCode: user?.referralCode ?? null,
      benefits: {
        freePremiumMonthsOnPromo: ambConfig.freePremiumMonthsOnPromo,
        ocrCreditsMonthly: ambConfig.ocrCreditsMonthly,
        voiceCreditsMonthly: ambConfig.voiceCreditsMonthly,
        badgeLabel: ambConfig.badgeLabel,
        earlyAccessEnabled: ambConfig.earlyAccessEnabled,
        quarterlyGiftEnabled: ambConfig.quarterlyGiftEnabled,
      },
    };
  });

  app.get("/ambassador/me/network", async (req) => {
    const me = (req.user as any).sub;
    return listMyNetwork(me);
  });

  app.get("/ambassador/me/stats", async (req) => {
    const me = (req.user as any).sub;
    return getNetworkStats(me);
  });

  app.get("/ambassador/me/potential-earnings", async (req) => {
    const me = (req.user as any).sub;
    return getPotentialEarnings(me);
  });

  // ==========================================================
  // Commercial agréé
  // ==========================================================

  app.get("/commercial/me/status", async (req) => {
    const me = (req.user as any).sub;
    const user = await prisma.user.findUnique({
      where: { id: me },
      select: {
        isCommercialAgreed: true,
        commercialContractAcceptedAt: true,
        commercialContractFileUrl: true,
        commercialSiret: true,
        commercialCompanyName: true,
        commercialAddress: true,
        stripeConnectAccountId: true,
      },
    });
    if (!user?.isCommercialAgreed) {
      throw Errors.forbidden(
        "Tu n'es pas commercial agréé. Demande à l'admin BMD pour passer en phase 3.",
      );
    }
    const config = await getCommissionConfig();
    return {
      ...user,
      commercialContractAcceptedAt:
        user.commercialContractAcceptedAt?.toISOString() ?? null,
      commission: {
        rateBps: config.rateBps,
        rateLabel: `${(config.rateBps / 100).toFixed(0)}%`,
        durationMonths: config.durationMonths,
      },
    };
  });

  app.get("/commercial/me/commissions", async (req) => {
    const me = (req.user as any).sub;
    const q = z
      .object({ months: z.coerce.number().min(1).max(36).optional() })
      .parse(req.query);
    const lines = await listMyCommissions(me, q.months ?? 12);
    // Agrégats : total à recevoir (PENDING) + déjà payé (PAID)
    let totalPendingCents = 0;
    let totalPaidCents = 0;
    for (const l of lines) {
      if (l.payoutStatus === "PENDING") totalPendingCents += l.commissionCents;
      if (l.payoutStatus === "PAID") totalPaidCents += l.commissionCents;
    }
    return { lines, totalPendingCents, totalPaidCents };
  });

  app.post("/commercial/me/recompute", async (req) => {
    const me = (req.user as any).sub;
    const user = await prisma.user.findUnique({
      where: { id: me },
      select: { isCommercialAgreed: true },
    });
    if (!user?.isCommercialAgreed) {
      throw Errors.forbidden("Tu n'es pas commercial agréé.");
    }
    const lines = await computeMonthlyCommissionsFor({ commercialUserId: me });
    return { recomputed: lines.length };
  });

  /**
   * V164.H4 — POST /commercial/me/stripe-connect/onboard
   * Démarre l'onboarding Stripe Connect Express pour recevoir les payouts.
   * Retourne l'URL où le commercial doit aller compléter son KYC + RIB.
   */
  app.post("/commercial/me/stripe-connect/onboard", async (req) => {
    const me = (req.user as any).sub;
    const user = await prisma.user.findUnique({
      where: { id: me },
      select: {
        isCommercialAgreed: true,
        stripeConnectAccountId: true,
        defaultLocale: true,
        commercialAddress: true,
        contacts: {
          where: { type: "EMAIL", verifiedAt: { not: null } },
          select: { value: true },
          take: 1,
        },
      },
    });
    if (!user?.isCommercialAgreed) {
      throw Errors.forbidden(
        "Tu dois être commercial agréé pour activer Stripe Connect.",
      );
    }
    const body = z
      .object({
        country: z.string().length(2).optional(),
      })
      .parse(req.body ?? {});
    const country = body.country ?? "FR";
    const email = user.contacts[0]?.value ?? null;
    const { createConnectOnboardingLink } = await import("../../lib/stripe.js");
    const baseUrl =
      (await import("../../lib/env.js")).loadEnv().WEB_BASE_URL ??
      "https://www.backmesdo.com";
    const { url, accountId } = await createConnectOnboardingLink({
      userId: me,
      email,
      country,
      refreshUrl: `${baseUrl}/dashboard/commercial?stripeConnect=refresh`,
      returnUrl: `${baseUrl}/dashboard/commercial?stripeConnect=done`,
      existingAccountId: user.stripeConnectAccountId,
    });
    // Persiste l'accountId si pas encore en base
    if (!user.stripeConnectAccountId) {
      await prisma.user.update({
        where: { id: me },
        data: { stripeConnectAccountId: accountId },
      });
    }
    return { url, accountId };
  });

  // ==========================================================
  // V164.H5 — Avantages parrain publics (utilisateur lambda)
  // ==========================================================

  /**
   * GET /referral/me/benefits — pour un utilisateur lambda, retourne
   * les avantages activés par l'admin + ses propres compteurs (nb filleuls
   * payants/gratuits, badge atteint, mois gratuits cumulés, etc.).
   *
   * UI : la page /dashboard/affiliate consomme ça pour afficher uniquement
   * les mécaniques activées.
   */
  app.get("/referral/me/benefits", async (req) => {
    const me = (req.user as any).sub;
    const cfg = await getReferralConfig();

    // Compte filleuls payants/gratuits du user
    const referrals = await prisma.user.findMany({
      where: { referredById: me },
      select: { planCode: true },
    });
    const paidCount = referrals.filter((r: any) => r.planCode !== "FREE").length;
    const freeCount = referrals.length - paidCount;

    // Calcul badge atteint selon les seuils config
    let badge: "NONE" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" = "NONE";
    if (cfg.badgesEnabled) {
      if (paidCount >= cfg.badgePlatinumThreshold) badge = "PLATINUM";
      else if (paidCount >= cfg.badgeGoldThreshold) badge = "GOLD";
      else if (paidCount >= cfg.badgeSilverThreshold) badge = "SILVER";
      else if (paidCount >= cfg.badgeBronzeThreshold) badge = "BRONZE";
    }

    // Calcul mois gratuits cumulés (cap)
    const freeMonthsEarned = cfg.freeMonthsEnabled
      ? Math.min(paidCount * cfg.freeMonthsPerReferral, cfg.freeMonthsCap)
      : 0;

    // Crédits IA bonus
    const ocrCreditsEarned = cfg.aiCreditsEnabled
      ? paidCount * cfg.ocrCreditsPerReferralPaid
      : 0;
    const voiceCreditsEarned = cfg.aiCreditsEnabled
      ? paidCount * cfg.voiceCreditsPerReferralPaid
      : 0;

    // Points
    const pointsEarned = cfg.pointsEnabled
      ? paidCount * cfg.pointsPerReferralPaid +
        freeCount * cfg.pointsPerReferralFree
      : 0;

    // Réduction renouvellement (max -100%)
    const discountPercent = cfg.discountEnabled
      ? Math.min(paidCount * cfg.discountPercentPerReferral, 100)
      : 0;

    return {
      enabled: {
        freeMonths: cfg.freeMonthsEnabled,
        aiCredits: cfg.aiCreditsEnabled,
        discount: cfg.discountEnabled,
        points: cfg.pointsEnabled,
        badges: cfg.badgesEnabled,
      },
      stats: {
        paidReferrals: paidCount,
        freeReferrals: freeCount,
        totalReferrals: referrals.length,
      },
      earned: {
        freeMonths: freeMonthsEarned,
        freeMonthsCap: cfg.freeMonthsCap,
        ocrCredits: ocrCreditsEarned,
        voiceCredits: voiceCreditsEarned,
        points: pointsEarned,
        discountPercent,
        badge,
      },
      perReferral: {
        freeMonths: cfg.freeMonthsPerReferral,
        ocr: cfg.ocrCreditsPerReferralPaid,
        voice: cfg.voiceCreditsPerReferralPaid,
        discountPercent: cfg.discountPercentPerReferral,
        pointsPaid: cfg.pointsPerReferralPaid,
        pointsFree: cfg.pointsPerReferralFree,
      },
      badgeThresholds: {
        bronze: cfg.badgeBronzeThreshold,
        silver: cfg.badgeSilverThreshold,
        gold: cfg.badgeGoldThreshold,
        platinum: cfg.badgePlatinumThreshold,
      },
    };
  });

  // ==========================================================
  // Messagerie réseau (ambassadeur OU commercial)
  // ==========================================================

  app.post("/network-messages", async (req) => {
    const me = (req.user as any).sub;
    const body = z
      .object({
        recipientUserId: z.string().uuid(),
        templateKey: z
          .enum(["RELANCE", "MOTIVATION", "WELCOME", "CUSTOM"])
          .optional(),
        subject: z.string().max(200).optional(),
        body: z.string().max(5000).optional(),
        channels: z.enum(["INAPP", "EMAIL", "BOTH"]).optional(),
      })
      .parse(req.body);
    const msg = await sendNetworkMessage({
      senderId: me,
      ...body,
    });
    return msg;
  });

  app.get("/network-messages/sent", async (req) => {
    const me = (req.user as any).sub;
    return listMessagesSent(me);
  });

  // ==========================================================
  // Admin
  // ==========================================================

  app.get("/admin/ambassadors", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    return listAmbassadors();
  });

  app.post("/admin/users/:id/promote-ambassador", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    return promoteToAmbassador({
      targetUserId: params.id,
      actorAdminId: me,
    });
  });

  app.delete("/admin/users/:id/ambassador", async (req, reply) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    await revokeAmbassador(params.id);
    return reply.code(204).send();
  });

  app.post("/admin/users/:id/promote-commercial", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        contractFileUrl: z.string().min(8).max(2000),
        siret: z.string().min(9).max(20),
        companyName: z.string().min(1).max(200),
        address: z.string().min(1).max(500),
      })
      .parse(req.body);
    return promoteToCommercialAgreed({
      targetUserId: params.id,
      ...body,
    });
  });

  app.delete("/admin/users/:id/commercial", async (req, reply) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    await revokeCommercialAgreed(params.id);
    return reply.code(204).send();
  });

  app.get("/admin/commercials", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    return listCommercials();
  });

  app.get("/admin/commission-config", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    return getCommissionConfig();
  });

  app.put("/admin/commission-config", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const body = z
      .object({
        rateBps: z.number().int().min(0).max(5000).optional(),
        durationMonths: z.number().int().min(1).max(60).optional(),
        basedOnCollected: z.boolean().optional(),
        maxMonthlyPayoutCents: z.number().int().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(req.body);
    return updateCommissionConfig(me, body);
  });

  app.get("/admin/ambassador-config", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    return getAmbassadorConfig();
  });

  app.put("/admin/ambassador-config", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const body = z
      .object({
        freePremiumMonthsOnPromo: z.number().int().min(0).max(60).optional(),
        ocrCreditsMonthly: z.number().int().min(0).max(10000).optional(),
        voiceCreditsMonthly: z.number().int().min(0).max(10000).optional(),
        quarterlyGiftEnabled: z.boolean().optional(),
        quarterlyGiftMaxCents: z.number().int().min(0).max(100000).optional(),
        badgeLabel: z.string().max(60).optional(),
        earlyAccessEnabled: z.boolean().optional(),
      })
      .parse(req.body);
    return updateAmbassadorConfig(me, body);
  });

  app.get("/admin/referral-config", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    return getReferralConfig();
  });

  app.put("/admin/referral-config", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const body = z
      .object({
        freeMonthsEnabled: z.boolean().optional(),
        freeMonthsPerReferral: z.number().int().min(0).max(12).optional(),
        freeMonthsCap: z.number().int().min(0).max(60).optional(),
        aiCreditsEnabled: z.boolean().optional(),
        ocrCreditsPerReferralPaid: z.number().int().min(0).max(1000).optional(),
        voiceCreditsPerReferralPaid: z.number().int().min(0).max(1000).optional(),
        discountEnabled: z.boolean().optional(),
        discountPercentPerReferral: z.number().int().min(0).max(100).optional(),
        pointsEnabled: z.boolean().optional(),
        pointsPerReferralPaid: z.number().int().min(0).max(100).optional(),
        pointsPerReferralFree: z.number().int().min(0).max(100).optional(),
        badgesEnabled: z.boolean().optional(),
        badgeBronzeThreshold: z.number().int().min(1).optional(),
        badgeSilverThreshold: z.number().int().min(1).optional(),
        badgeGoldThreshold: z.number().int().min(1).optional(),
        badgePlatinumThreshold: z.number().int().min(1).optional(),
      })
      .parse(req.body);
    return updateReferralConfig(me, body);
  });

  app.post("/admin/commission-lines/:id/pay", async (req) => {
    const me = (req.user as any).sub;
    await requireSuperAdmin(me);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        stripeTransferId: z.string().max(200).nullable().optional(),
        adminNotes: z.string().max(500).nullable().optional(),
      })
      .parse(req.body ?? {});
    return markLinePaid({
      lineId: params.id,
      stripeTransferId: body.stripeTransferId,
      adminNotes: body.adminNotes,
    });
  });
}
