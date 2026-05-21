/**
 * Routes NPS (Net Promoter Score) — spec §9.3.
 *
 * 3 routes :
 *   POST /nps                 → soumettre une réponse (auth user)
 *   GET  /nps/should-show     → le frontend demande s'il doit afficher la survey
 *   GET  /admin/nps/stats     → dashboard admin avec score NPS, distribution, tendance
 *
 * Logique should-show :
 *  - True si l'user n'a pas répondu depuis > 90 jours
 *  - ET le user a au moins 1 expense créée (signal d'usage actif)
 *  - ET le user a un compte > 14 jours (laisse le temps de tester avant de demander)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";

export async function npsRoutes(app: FastifyInstance): Promise<void> {
  // ============================================================
  // USER ROUTES (auth requise)
  // ============================================================

  /**
   * POST /nps · Body { score: 0-10, comment?: string, source?: string }
   */
  app.post(
    "/nps",
    { onRequest: [app.authenticate] },
    async (req) => {
      const body = z
        .object({
          score: z.number().int().min(0).max(10),
          comment: z.string().max(2000).optional(),
          source: z
            .enum(["in_app", "email", "post_action"])
            .default("in_app"),
        })
        .parse(req.body);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: { planCode: true },
      });
      const created = await prisma.npsResponse.create({
        data: {
          userId: req.user.sub,
          score: body.score,
          comment: body.comment ?? null,
          source: body.source,
          planCode: user.planCode,
        },
      });
      return {
        id: created.id,
        score: created.score,
        thankYou:
          body.score >= 9
            ? "Merci ! Tu peux nous aider en partageant BMD à un ami 🙏"
            : body.score >= 7
              ? "Merci de ton retour, on continue à améliorer 💛"
              : "Merci d'avoir pris le temps. Réponds par email à hello@backmesdo.com avec ce qu'on peut améliorer — on t'écoute 🙇",
      };
    },
  );

  /**
   * GET /nps/should-show
   * Le frontend appelle ça au mount du dashboard pour décider d'afficher
   * la survey ou pas. Réponse cachée 24h côté client (pas la peine de re-checker
   * en permanence).
   */
  app.get(
    "/nps/should-show",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const [user, lastResp, expenseCount] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { createdAt: true },
        }),
        prisma.npsResponse.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.expense.count({ where: { paidById: userId } }),
      ]);

      const accountAgeOk = user.createdAt < fourteenDaysAgo;
      const lastRespOk = !lastResp || lastResp.createdAt < ninetyDaysAgo;
      const usageOk = expenseCount >= 1;

      return {
        shouldShow: accountAgeOk && lastRespOk && usageOk,
        reasons: { accountAgeOk, lastRespOk, usageOk },
      };
    },
  );

  // ============================================================
  // ADMIN ROUTES — agrégations
  // ============================================================

  /**
   * GET /admin/nps/stats?days=30
   * Dashboard NPS pour l'admin. Calcule :
   *  - Score NPS = % promoteurs (9-10) − % détracteurs (0-6)
   *  - Distribution par bucket
   *  - Tendance vs 30j précédents
   *  - Top commentaires des détracteurs (pour comprendre les douleurs)
   */
  app.get(
    "/admin/nps/stats",
    { onRequest: [app.authenticate] },
    async (req) => {
      // Réservé super-admin (réutilise le check de admin.routes via prisma)
      const { assertSuperAdmin } = await import(
        "../admin/admin.service.js"
      );
      await assertSuperAdmin(req.user.sub);

      const { days } = z
        .object({
          days: z.coerce.number().int().min(1).max(365).default(30),
        })
        .parse(req.query);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const previousSince = new Date(
        since.getTime() - days * 24 * 60 * 60 * 1000,
      );

      const [current, previous] = await Promise.all([
        prisma.npsResponse.findMany({
          where: { createdAt: { gte: since } },
          select: { score: true, comment: true, planCode: true, createdAt: true },
        }),
        prisma.npsResponse.findMany({
          where: {
            createdAt: { gte: previousSince, lt: since },
          },
          select: { score: true },
        }),
      ]);

      function computeNps(items: Array<{ score: number }>): number {
        if (items.length === 0) return 0;
        const detractors = items.filter((i) => i.score <= 6).length;
        const promoters = items.filter((i) => i.score >= 9).length;
        return Math.round(((promoters - detractors) / items.length) * 100);
      }

      const npsCurrent = computeNps(current);
      const npsPrevious = computeNps(previous);
      const distribution = Array.from({ length: 11 }, (_, score) => ({
        score,
        count: current.filter((c) => c.score === score).length,
      }));

      // Top 10 commentaires détracteurs (les plus courts/lisibles d'abord)
      const detractorComments = current
        .filter((c) => c.score <= 6 && c.comment && c.comment.trim().length > 0)
        .sort((a, b) => (a.comment!.length - b.comment!.length))
        .slice(0, 10)
        .map((c) => ({
          score: c.score,
          comment: c.comment,
          plan: c.planCode,
          at: c.createdAt.toISOString(),
        }));

      return {
        scope: `${days}j`,
        npsCurrent,
        npsPrevious,
        delta: npsCurrent - npsPrevious,
        responseCount: current.length,
        distribution,
        detractorComments,
      };
    },
  );
}
