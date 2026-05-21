/**
 * Routes Moyens de paiement (spec §9.1).
 *
 *   GET     /me/payment-methods/config        → public · indique si vault est activé
 *   GET     /me/payment-methods               → liste mes méthodes (sans valeurs)
 *   POST    /me/payment-methods               → ajout (chiffrement immédiat)
 *   POST    /me/payment-methods/:id/reveal    → déchiffrement à la demande
 *   PATCH   /me/payment-methods/:id           → renomme
 *   DELETE  /me/payment-methods/:id           → soft delete
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isVaultConfigured } from "../../lib/crypto-vault.js";
import {
  addPaymentMethod,
  deletePaymentMethod,
  listMyPaymentMethods,
  renamePaymentMethod,
  revealPaymentMethod,
} from "./payment-methods.service.js";
import { PAYMENT_METHOD_TYPES } from "./payment-methods.helpers.js";

export async function paymentMethodsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // Endpoint public — indique si la fonctionnalité est activée côté serveur
  app.get(
    "/me/payment-methods/config",
    { config: { skipAuth: true } as any },
    async () => ({
      enabled: isVaultConfigured(),
      supportedTypes: PAYMENT_METHOD_TYPES,
    }),
  );

  app.addHook("onRequest", app.authenticate);

  app.get("/me/payment-methods", async (req) => {
    return listMyPaymentMethods(req.user.sub);
  });

  app.post("/me/payment-methods", async (req, reply) => {
    const body = z
      .object({
        type: z.enum(PAYMENT_METHOD_TYPES as any).optional(),
        value: z.string().min(4).max(120),
        label: z.string().min(2).max(80),
        defaultCurrency: z.string().length(3).optional(),
      })
      .parse(req.body);

    const created = await addPaymentMethod({
      userId: req.user.sub,
      type: body.type as any,
      value: body.value,
      label: body.label,
      defaultCurrency: body.defaultCurrency,
    });
    return reply.code(201).send(created);
  });

  app.post("/me/payment-methods/:id/reveal", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await revealPaymentMethod({
      userId: req.user.sub,
      methodId: id,
    });
    return r;
  });

  app.patch("/me/payment-methods/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ label: z.string().min(2).max(80) })
      .parse(req.body);
    await renamePaymentMethod({
      userId: req.user.sub,
      methodId: id,
      label: body.label,
    });
    return { ok: true };
  });

  app.delete("/me/payment-methods/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deletePaymentMethod({
      userId: req.user.sub,
      methodId: id,
    });
    return reply.code(204).send();
  });
}
