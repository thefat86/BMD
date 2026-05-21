/**
 * Routes Promo / Parrainage (spec §6.9).
 *
 *  User :
 *    GET  /me/referral-code        → mon code perso (créé à la 1ère lecture)
 *    POST /me/redeem-code          → applique un code (promo ou parrainage)
 *    GET  /me/redemptions          → mon historique de codes utilisés
 *
 *  Admin :
 *    GET    /admin/promo-codes
 *    POST   /admin/promo-codes      → crée un code DISCOUNT
 *    PATCH  /admin/promo-codes/:code
 *    DELETE /admin/promo-codes/:code
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { assertSuperAdmin } from "../admin/admin.service.js";
import {
  getOrCreateReferralCode,
  listMyRedemptions,
  redeemCode,
} from "./promos.service.js";

export async function promosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  // ============ User ============

  app.get("/me/referral-code", async (req) => {
    return getOrCreateReferralCode(req.user.sub);
  });

  app.post("/me/redeem-code", async (req) => {
    const body = z
      .object({ code: z.string().min(2).max(40) })
      .parse(req.body);
    return redeemCode({ code: body.code, userId: req.user.sub });
  });

  app.get("/me/redemptions", async (req) => {
    const items = await listMyRedemptions(req.user.sub);
    return items.map((r) => ({
      id: r.id,
      code: r.code.code,
      type: r.code.type,
      description: r.code.description,
      appliedValue: r.appliedValue.toString(),
      appliedKind: r.appliedKind,
      redeemedAt: r.redeemedAt.toISOString(),
    }));
  });

  // ============ Admin (super admin only) ============

  app.get("/admin/promo-codes", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const items = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return items.map((p) => ({
      code: p.code,
      type: p.type,
      discountValue: p.discountValue.toString(),
      discountKind: p.discountKind,
      description: p.description,
      maxUses: p.maxUses,
      uses: p.uses,
      expiresAt: p.expiresAt?.toISOString() ?? null,
      isActive: p.isActive,
      ownerUserId: p.ownerUserId,
      createdAt: p.createdAt.toISOString(),
    }));
  });

  app.post("/admin/promo-codes", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const body = z
      .object({
        code: z.string().min(3).max(40),
        discountValue: z.coerce.number().min(0).max(100000),
        discountKind: z.enum(["PERCENT", "FIXED"]).default("PERCENT"),
        description: z.string().max(500).optional(),
        maxUses: z.coerce.number().int().positive().optional(),
        expiresInDays: z.coerce.number().int().positive().max(3650).optional(),
      })
      .parse(req.body);

    const upper = body.code.trim().toUpperCase();
    const existing = await prisma.promoCode.findUnique({
      where: { code: upper },
    });
    if (existing) {
      throw Errors.alreadyExists({
        what: "Un code avec ce nom",
        tip: "Choisis un autre code (ils sont uniques en base).",
      });
    }
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    const created = await prisma.promoCode.create({
      data: {
        code: upper,
        type: "DISCOUNT",
        discountValue: body.discountValue,
        discountKind: body.discountKind,
        description: body.description,
        maxUses: body.maxUses,
        expiresAt,
      },
    });
    return {
      code: created.code,
      type: created.type,
      discountValue: created.discountValue.toString(),
      discountKind: created.discountKind,
      description: created.description,
      maxUses: created.maxUses,
      uses: created.uses,
      expiresAt: created.expiresAt?.toISOString() ?? null,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    };
  });

  app.patch("/admin/promo-codes/:code", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const { code } = z
      .object({ code: z.string().min(2).max(40) })
      .parse(req.params);
    const body = z
      .object({
        isActive: z.boolean().optional(),
        description: z.string().max(500).optional(),
        maxUses: z.coerce.number().int().positive().nullable().optional(),
      })
      .parse(req.body);
    const updated = await prisma.promoCode.update({
      where: { code: code.toUpperCase() },
      data: body,
    });
    return {
      code: updated.code,
      isActive: updated.isActive,
      description: updated.description,
      maxUses: updated.maxUses,
      uses: updated.uses,
    };
  });

  app.delete("/admin/promo-codes/:code", async (req, reply) => {
    await assertSuperAdmin(req.user.sub);
    const { code } = z
      .object({ code: z.string().min(2).max(40) })
      .parse(req.params);
    await prisma.promoCode.delete({ where: { code: code.toUpperCase() } });
    return reply.code(204).send();
  });
}
