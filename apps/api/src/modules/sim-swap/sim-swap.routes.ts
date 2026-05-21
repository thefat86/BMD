/**
 * Routes SIM swap (spec §7.5).
 *
 *  User :
 *    GET  /me/sim-swap-events                → mes events SIM swap récents
 *    POST /me/sim-swap-events/:id/verify    → "c'était bien moi" (confirme l'event)
 *
 *  Admin (super admin) :
 *    GET   /admin/sim-swap-events           → liste filtrable
 *    POST  /admin/sim-swap-events/:id/resolve → marque résolu (avec note)
 *    POST  /admin/sim-swap-events/:id/dismiss → faux positif
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { assertSuperAdmin } from "../admin/admin.service.js";

export async function simSwapRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  // ============ User : liste + verify ============

  app.get("/me/sim-swap-events", async (req) => {
    const events = await prisma.simSwapEvent.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return events.map((e) => ({
      id: e.id,
      riskScore: e.riskScore,
      signals: e.signals,
      contactValueAttempted: e.contactValueAttempted,
      contactTypeAttempted: e.contactTypeAttempted,
      country: e.country,
      userAgent: e.userAgent,
      status: e.status,
      verifiedAt: e.verifiedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    }));
  });

  app.post("/me/sim-swap-events/:id/verify", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const event = await prisma.simSwapEvent.findUnique({ where: { id } });
    if (!event || event.userId !== req.user.sub) {
      throw Errors.notFound("Cet événement est introuvable 🔍");
    }
    if (event.status !== "DETECTED" && event.status !== "BLOCKED") {
      throw Errors.invalidState({
        what: "Cet événement",
        currentState: "déjà traité",
        tip: "Tu n'as plus rien à faire — c'est dans l'historique.",
      });
    }
    const updated = await prisma.simSwapEvent.update({
      where: { id },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });
    return {
      id: updated.id,
      status: updated.status,
      verifiedAt: updated.verifiedAt?.toISOString() ?? null,
    };
  });

  // ============ Admin (super admin only) ============

  app.get("/admin/sim-swap-events", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const q = z
      .object({
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const where: any = {};
    if (q.status) where.status = q.status;
    const events = await prisma.simSwapEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit,
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });
    return events.map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: e.user.displayName,
      riskScore: e.riskScore,
      signals: e.signals,
      contactValueAttempted: e.contactValueAttempted,
      contactTypeAttempted: e.contactTypeAttempted,
      country: e.country,
      userAgent: e.userAgent,
      status: e.status,
      verifiedAt: e.verifiedAt?.toISOString() ?? null,
      resolvedAt: e.resolvedAt?.toISOString() ?? null,
      resolutionNote: e.resolutionNote,
      createdAt: e.createdAt.toISOString(),
    }));
  });

  app.post("/admin/sim-swap-events/:id/resolve", async (req) => {
    await assertSuperAdmin(req.user.sub);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        note: z.string().max(2000).optional(),
        action: z.enum(["resolve", "dismiss"]).default("resolve"),
      })
      .parse(req.body);
    const status = body.action === "dismiss" ? "DISMISSED" : "RESOLVED";
    const updated = await prisma.simSwapEvent.update({
      where: { id },
      data: {
        status,
        resolvedById: req.user.sub,
        resolvedAt: new Date(),
        resolutionNote: body.note,
      },
    });
    return {
      id: updated.id,
      status: updated.status,
    };
  });
}
