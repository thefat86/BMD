/**
 * V163 — Routes Custom Logo PDF.
 *
 *   GET    /groups/:id/custom-logo            statut + pricing actif
 *   POST   /groups/:id/custom-logo            upload image (data URL base64)
 *   DELETE /groups/:id/custom-logo            retire l'image (abonnement reste)
 *   POST   /groups/:id/custom-logo/checkout   crée une session Stripe Checkout
 *   POST   /groups/:id/custom-logo/mock-activate  (DEV ONLY) active 30 jours
 *
 *   GET    /custom-logo-pricing                liste tous les tarifs (admin)
 *   PUT    /custom-logo-pricing                upsert un tarif (admin)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../../lib/errors.js";
import {
  getStatus,
  uploadCustomLogo,
  removeCustomLogo,
  activateForGroup,
  getActivePricing,
  listAllPricings,
  upsertPricing,
} from "./custom-logo.service.js";

export async function customLogoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /groups/:id/custom-logo — statut actuel + pricing actif.
   * Membres du groupe.
   */
  app.get("/groups/:id/custom-logo", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const me = (req.user as any).sub;
    return getStatus({ groupId: params.id, actorUserId: me });
  });

  /**
   * POST /groups/:id/custom-logo — upload image base64.
   * Body : { imageDataUrl: "data:image/png;base64,..." }
   * Admin du groupe.
   */
  app.post("/groups/:id/custom-logo", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        imageDataUrl: z.string().min(32).max(800_000),
      })
      .parse(req.body);
    const me = (req.user as any).sub;
    return uploadCustomLogo({
      groupId: params.id,
      actorUserId: me,
      imageDataUrl: body.imageDataUrl,
    });
  });

  /**
   * DELETE /groups/:id/custom-logo — retire l'image (l'abonnement Stripe
   * reste actif jusqu'à la fin du cycle facturé).
   */
  app.delete("/groups/:id/custom-logo", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const me = (req.user as any).sub;
    await removeCustomLogo({ groupId: params.id, actorUserId: me });
    return reply.code(204).send();
  });

  /**
   * POST /groups/:id/custom-logo/checkout — Stripe Checkout pour activer
   * l'abonnement mensuel.
   *
   * V163 : squelette. À brancher sur lib/stripe.js (création d'une
   * Stripe Subscription via Customer + Price récurrent). Le webhook
   * `invoice.payment_succeeded` appellera `activateForGroup` avec
   * `until = subscription.current_period_end`.
   *
   * En attendant la coordination prod (configuration Price Stripe + webhook),
   * on retourne une URL placeholder pour ne pas casser l'UI.
   */
  app.post("/groups/:id/custom-logo/checkout", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const me = (req.user as any).sub;
    const status = await getStatus({ groupId: params.id, actorUserId: me });

    // TODO V163.C2 — Brancher Stripe Checkout réel.
    // Pour l'instant : retour structuré + url indiqué pour mock-activate dev.
    return {
      ready: false,
      message:
        "Stripe Checkout en cours d'intégration. En attendant, contacte le support pour activer manuellement.",
      pricing: status.pricing,
      mockActivateEndpoint: `/groups/${params.id}/custom-logo/mock-activate`,
    };
  });

  /**
   * POST /groups/:id/custom-logo/mock-activate — DEV/TEST seulement.
   * Active le logo pour 30 jours sans passer par Stripe. Réservé aux
   * SuperAdmins BMD pour assistance/tests.
   */
  app.post("/groups/:id/custom-logo/mock-activate", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const me = (req.user as any).sub;
    const u = await (
      await import("../../lib/db.js")
    ).prisma.user.findUnique({
      where: { id: me },
      select: { isSuperAdmin: true },
    });
    if (!u?.isSuperAdmin) {
      throw Errors.forbidden(
        "Mock-activate réservé aux SuperAdmins BMD (assistance/tests).",
      );
    }
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await activateForGroup({ groupId: params.id, until });
    return { activated: true, until: until.toISOString() };
  });

  /**
   * GET /custom-logo-pricing — liste tous les tarifs (admin).
   */
  app.get("/custom-logo-pricing", async (req) => {
    const me = (req.user as any).sub;
    const u = await (
      await import("../../lib/db.js")
    ).prisma.user.findUnique({
      where: { id: me },
      select: { isSuperAdmin: true },
    });
    if (!u?.isSuperAdmin) {
      throw Errors.forbidden("Réservé aux SuperAdmins BMD.");
    }
    return listAllPricings();
  });

  /**
   * PUT /custom-logo-pricing — upsert un tarif (admin).
   * Body : { currency: "EUR", monthlyPriceCents: 999, enabled?: true, notes?: string }
   */
  app.put("/custom-logo-pricing", async (req) => {
    const me = (req.user as any).sub;
    const u = await (
      await import("../../lib/db.js")
    ).prisma.user.findUnique({
      where: { id: me },
      select: { isSuperAdmin: true },
    });
    if (!u?.isSuperAdmin) {
      throw Errors.forbidden("Réservé aux SuperAdmins BMD.");
    }
    const body = z
      .object({
        currency: z.string().length(3),
        monthlyPriceCents: z.number().int().min(0).max(100_000),
        enabled: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);
    return upsertPricing(body);
  });

  /**
   * GET /custom-logo-pricing/public?currency=EUR — tarif actif pour l'UI
   * publique (sans le détail interne admin).
   */
  app.get("/custom-logo-pricing/public", async (req) => {
    const q = z
      .object({ currency: z.string().length(3).optional() })
      .parse(req.query);
    return getActivePricing(q.currency ?? "EUR");
  });
}
