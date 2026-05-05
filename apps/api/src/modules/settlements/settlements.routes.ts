import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  computeBalanceWithSuggestions,
  computeUserGlobalBalance,
} from "./balance.service.js";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

export async function settlementsRoutes(app: FastifyInstance): Promise<void> {
  /* ===== Routes publiques (mode invité — pas d'auth requise) ===== */

  /**
   * GET /pay-info/:token
   * Récupère les infos publiques d'un token de paiement (mode invité).
   * Pas d'auth requise — utilisé par la page publique /pay/[token].
   */
  app.get(
    "/pay-info/:token",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const { token } = z
        .object({ token: z.string().min(20).max(80) })
        .parse(req.params);
      const t = await prisma.settlementPaymentToken.findUnique({
        where: { token },
        include: {
          settlement: {
            include: {
              group: { select: { name: true } },
              fromUser: { select: { displayName: true } },
              toUser: { select: { displayName: true } },
            },
          },
        },
      });
      if (!t) return reply.code(404).send({ error: "not_found" });
      if (t.expiresAt < new Date()) {
        return reply.code(410).send({ error: "expired" });
      }
      if (t.usedAt) {
        return reply.code(409).send({ error: "already_used" });
      }
      return {
        groupName: t.settlement.group.name,
        from: t.settlement.fromUser.displayName,
        to: t.settlement.toUser.displayName,
        amount: t.settlement.amount.toString(),
        currency: t.settlement.currency,
        status: t.settlement.status,
      };
    },
  );

  /**
   * POST /pay-confirm/:token
   * Marque le règlement comme PAID (côté payeur invité).
   * Le créancier devra confirmer côté app pour finaliser.
   */
  app.post(
    "/pay-confirm/:token",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const { token } = z
        .object({ token: z.string().min(20).max(80) })
        .parse(req.params);
      const t = await prisma.settlementPaymentToken.findUnique({
        where: { token },
        include: { settlement: true },
      });
      if (!t) return reply.code(404).send({ error: "not_found" });
      if (t.expiresAt < new Date()) {
        return reply.code(410).send({ error: "expired" });
      }
      if (t.usedAt) {
        return reply.code(409).send({ error: "already_used" });
      }
      await prisma.$transaction([
        prisma.settlement.update({
          where: { id: t.settlementId },
          data: {
            status: "PAID",
            confirmedByPayerAt: new Date(),
          },
        }),
        prisma.settlementPaymentToken.update({
          where: { id: t.id },
          data: { usedAt: new Date() },
        }),
      ]);
      return { confirmed: true };
    },
  );

  /* ===== Routes authentifiées ===== */

  app.addHook("onRequest", app.authenticate);

  /**
   * GET /groups/:id/balance
   * Returns net balance per member + suggested settlements.
   */
  app.get("/groups/:id/balance", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await computeBalanceWithSuggestions(
      params.id,
      req.user.sub,
    );
    return {
      currency: result.currency,
      balances: result.balances.map((b) => ({
        userId: b.userId,
        displayName: b.displayName,
        net: b.net.toString(),
      })),
      suggestions: result.suggestions.map((s) => ({
        fromUserId: s.fromUserId,
        fromName: s.fromName,
        toUserId: s.toUserId,
        toName: s.toName,
        amount: s.amount.toString(),
        currency: s.currency,
      })),
    };
  });

  /**
   * GET /me/global-balance
   * Solde global de l'utilisateur sur tous ses groupes.
   * Utilisé par le dashboard pour afficher la "balance card" en haut.
   */
  app.get("/me/global-balance", async (req) => {
    return computeUserGlobalBalance(req.user.sub);
  });

  /**
   * POST /groups/:id/settlements
   * Crée un règlement explicite (le payeur ou un admin déclare une dette
   * à régler en dehors de l'app — Mobile Money, virement, espèces).
   */
  app.post("/groups/:id/settlements", async (req) => {
    const { id: groupId } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        fromUserId: z.string().uuid(),
        toUserId: z.string().uuid(),
        amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
        currency: z.string().length(3).optional(),
      })
      .parse(req.body);
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        defaultCurrency: true,
        members: { select: { userId: true } },
      },
    });
    if (!group) throw Errors.notFound("Groupe introuvable");
    const isMember = group.members.some(
      (m) => m.userId === req.user.sub,
    );
    if (!isMember) throw Errors.forbidden("Pas membre du groupe");
    return prisma.settlement.create({
      data: {
        groupId,
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: new Prisma.Decimal(body.amount),
        currency: body.currency ?? group.defaultCurrency,
        status: "PROPOSED",
      },
    });
  });

  /**
   * POST /settlements/:id/payment-tokens (mode invité — spec §7.6)
   * Génère un token public pour permettre au payeur de confirmer
   * le règlement sans créer de compte. TTL 14 jours.
   */
  app.post("/settlements/:id/payment-tokens", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        group: {
          select: {
            members: { select: { userId: true, role: true } },
          },
        },
      },
    });
    if (!settlement) throw Errors.notFound("Règlement introuvable");
    const member = settlement.group.members.find(
      (m) => m.userId === req.user.sub,
    );
    if (!member) throw Errors.forbidden("Pas membre du groupe");
    // Le créancier OU un admin peut générer un lien de paiement
    if (
      settlement.toUserId !== req.user.sub &&
      member.role !== "ADMIN"
    ) {
      throw Errors.forbidden(
        "Seul le créancier ou un admin peut générer un lien",
      );
    }
    const { randomBytes } = await import("crypto");
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
    return prisma.settlementPaymentToken.create({
      data: {
        token,
        settlementId: id,
        createdById: req.user.sub,
        expiresAt,
      },
    });
  });

  /**
   * POST /settlements/:id/confirm
   * Le créancier confirme avoir reçu le paiement (statut PAID → CONFIRMED).
   */
  app.post("/settlements/:id/confirm", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const s = await prisma.settlement.findUnique({ where: { id } });
    if (!s) throw Errors.notFound("Règlement introuvable");
    if (s.toUserId !== req.user.sub) {
      throw Errors.forbidden("Seul le créancier peut confirmer");
    }
    if (s.status !== "PAID") {
      throw Errors.badRequest(
        "Le règlement n'est pas en statut PAID (a-t-il bien été marqué payé ?)",
      );
    }
    return prisma.settlement.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedByPayeeAt: new Date(),
      },
    });
  });
}
