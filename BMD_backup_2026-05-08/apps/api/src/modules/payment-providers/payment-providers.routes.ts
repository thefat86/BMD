/**
 * Routes pour le catalogue de providers de paiement (spec §5).
 *
 *   GET  /payment-providers?currency=&region=  → catalogue filtré
 *   POST /settlements/:id/payment-link         → génère un deep-link
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import {
  initiatePayment,
  getRelevantProviders,
  type PaymentProviderId,
} from "../../lib/payment-providers.js";

const PROVIDER_IDS = [
  "lydia",
  "wave",
  "wero",
  "wise",
  "revolut",
  "paypal",
  "orange_money",
  "mtn_momo",
  "mpesa",
  "twint",
  "interac",
  "bank_transfer",
  "cash",
] as const;

export async function paymentProvidersRoutes(
  app: FastifyInstance,
): Promise<void> {
  // Public : liste des providers (utilisé par le sélecteur lors du règlement)
  app.get(
    "/payment-providers",
    { config: { skipAuth: true } as any },
    async (req) => {
      const q = z
        .object({
          currency: z.string().optional(),
          region: z.string().optional(),
        })
        .parse(req.query);
      return getRelevantProviders({
        currency: q.currency,
        region: q.region,
      });
    },
  );

  app.addHook("onRequest", app.authenticate);

  // Génère un deep-link / instruction pour payer un settlement existant
  app.post("/settlements/:id/payment-link", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        provider: z.enum(PROVIDER_IDS),
        toPhone: z.string().optional(),
        toIban: z.string().optional(),
        toEmail: z.string().optional(),
      })
      .parse(req.body);

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        toUser: { select: { id: true, displayName: true, contacts: true } },
        fromUser: { select: { id: true, displayName: true } },
      },
    });
    if (!settlement) throw Errors.notFound("Ce règlement est introuvable 🔍");
    if (settlement.fromUserId !== req.user.sub) {
      throw Errors.forbidden(
        "Seule la personne qui doit payer peut générer le lien 🤝",
      );
    }

    return initiatePayment(body.provider as PaymentProviderId, {
      fromUserId: settlement.fromUserId,
      toUserId: settlement.toUserId,
      amount: settlement.amount.toString(),
      currency: settlement.currency,
      reference: settlement.id.slice(0, 8),
      toPhone: body.toPhone,
      toIban: body.toIban,
      toEmail: body.toEmail,
      memo: `Règlement BMD ${settlement.fromUser.displayName} → ${settlement.toUser.displayName}`,
    });
  });
}
