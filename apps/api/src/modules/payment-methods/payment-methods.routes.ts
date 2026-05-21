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
  listPaymentMethodsVisibleToMe,
  renamePaymentMethod,
  revealPaymentMethod,
} from "./payment-methods.service.js";
import { PAYMENT_METHOD_TYPES } from "./payment-methods.helpers.js";
// V137 — OCR RIB via OpenAI Vision (image jetée après extraction)
import { extractRibFromImage } from "./payment-methods-ocr.service.js";
import { recordUsage } from "../../lib/usage-tracker.js";

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

  /**
   * V135 — Liste les moyens de paiement (valeurs en clair) d'un autre user,
   * à condition que le caller partage au moins un groupe avec lui.
   *
   * Utilisé par le sheet de détail tour de la tontine : pour chaque membre,
   * on doit pouvoir voir ses coordonnées (IBAN, Wave, PayPal, Wero…) afin
   * de lui envoyer le pot quand vient son tour.
   *
   * Si caller === userId → retourne ses propres méthodes (équivalent à
   * lister + reveal en bulk, mais bien plus simple côté UI).
   * Sinon → 403 si pas de groupe commun.
   */
  app.get("/users/:userId/payment-methods/visible", async (req) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(req.params);
    return listPaymentMethodsVisibleToMe({
      callerUserId: req.user.sub,
      targetUserId: userId,
    });
  });

  /**
   * V137 — Scan d'un RIB / screenshot de coordonnées bancaires.
   *
   * Body JSON :
   *   {
   *     imageBase64: "iVBORw0KGgo..." | "data:image/jpeg;base64,...",
   *     mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic"
   *   }
   *
   * Réponse :
   *   { type, iban, bic, holder, bank, phone, email, currency, confidence,
   *     ibanValid, suggestedLabel }
   *
   * Confidentialité : l'image est envoyée à OpenAI Vision, traitée en mémoire,
   * et **jamais persistée** (ni disque, ni DB, ni cache). Seules les données
   * extraites (texte) sont retournées au front pour que l'user valide et
   * sauvegarde le PaymentMethod via POST /me/payment-methods (qui chiffre).
   *
   * Coût : ~$0.001 / scan — tracking via UsageEvent kind="OCR_RIB".
   */
  app.post("/me/payment-methods/ocr-rib", async (req) => {
    const body = z
      .object({
        imageBase64: z.string().min(100).max(15_000_000),
        mimeType: z
          .enum([
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
          ])
          .default("image/jpeg"),
      })
      .parse(req.body);

    const userId = req.user.sub;
    let hadError = false;
    try {
      const result = await extractRibFromImage({
        imageBase64: body.imageBase64,
        mimeType: body.mimeType,
      });
      return result;
    } catch (e) {
      hadError = true;
      throw e;
    } finally {
      // Tracking conso IA — même les échecs comptent en coût (l'appel à
      // OpenAI a été tenté). Fire-and-forget.
      void recordUsage({
        userId,
        kind: "OCR_RIB" as any,
        provider: "openai_vision",
        model: "gpt-4o-mini",
        units: 1,
        // Coût estimé : 1 image high-detail ~$0.001 = 0.1 centimes
        costCents: 0.1,
        metadata: { feature: "payment_methods_rib_scan" },
        hadError,
      });
    }
  });
}
