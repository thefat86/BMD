import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  TontineFrequency,
  BeneficiaryOrderMode,
} from "@prisma/client";
import {
  acknowledgeTurn,
  activateTontine,
  cancelTontine,
  closeBidding,
  confirmContribution,
  createTontine,
  distributeTurn,
  getTontineByGroup,
  getTontineHistory,
  getTontineStats,
  listBids,
  listTurnAcks,
  markContributionPaid,
  placeBid,
  scheduleTurn,
  withdrawBid,
} from "./tontines.service.js";

const createSchema = z.object({
  contributionAmount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Montant doit être un nombre positif"),
  currency: z.string().length(3).optional(),
  frequency: z.nativeEnum(TontineFrequency),
  startDate: z.string().datetime(),
  orderMode: z.nativeEnum(BeneficiaryOrderMode).optional(),
  centralizedPot: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

const activateSchema = z.object({
  beneficiaryOrder: z.array(z.string().uuid()).optional(),
});

const markPaidSchema = z.object({
  paymentMethod: z.string().max(50).optional(),
  paymentReference: z.string().max(200).optional(),
});

export async function tontinesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /groups/:groupId/tontine
   * Récupère la tontine du groupe (avec turns et contributions).
   */
  app.get("/groups/:groupId/tontine", async (req) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const tontine = await getTontineByGroup(groupId, req.user.sub);
    if (!tontine) return { tontine: null };

    return {
      tontine: {
        id: tontine.id,
        groupId: tontine.groupId,
        contributionAmount: tontine.contributionAmount.toString(),
        currency: tontine.currency,
        frequency: tontine.frequency,
        startDate: tontine.startDate.toISOString(),
        status: tontine.status,
        orderMode: tontine.orderMode,
        centralizedPot: tontine.centralizedPot,
        notes: tontine.notes,
        createdAt: tontine.createdAt.toISOString(),
        turns: tontine.turns.map((t) => ({
          id: t.id,
          turnNumber: t.turnNumber,
          status: t.status,
          dueDate: t.dueDate.toISOString(),
          distributedAt: t.distributedAt?.toISOString() ?? null,
          beneficiary: t.beneficiary,
          contributions: t.contributions.map((c) => ({
            id: c.id,
            amount: c.amount.toString(),
            status: c.status,
            paidAt: c.paidAt?.toISOString() ?? null,
            confirmedAt: c.confirmedAt?.toISOString() ?? null,
            paymentMethod: c.paymentMethod,
            contributor: c.contributor,
          })),
        })),
        stats: await getTontineStats(tontine.id),
      },
    };
  });

  /**
   * GET /groups/:groupId/tontine/history
   * Historique des tontines (toutes périodes) pour le suivi long terme.
   * Inclut les tours distribués avec leurs montants effectivement reçus.
   */
  app.get("/groups/:groupId/tontine/history", async (req) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    return getTontineHistory({
      groupId,
      actorUserId: (req.user as any).sub,
    });
  });

  /**
   * POST /groups/:groupId/tontine
   * Crée une tontine en mode DRAFT pour le groupe.
   */
  app.post("/groups/:groupId/tontine", async (req, reply) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const body = createSchema.parse(req.body);

    const tontine = await createTontine({
      groupId,
      actorUserId: req.user.sub,
      contributionAmount: body.contributionAmount,
      currency: body.currency,
      frequency: body.frequency,
      startDate: new Date(body.startDate),
      orderMode: body.orderMode,
      centralizedPot: body.centralizedPot,
      notes: body.notes,
    });

    return reply.code(201).send({
      id: tontine.id,
      status: tontine.status,
    });
  });

  /**
   * POST /tontines/:tontineId/activate
   * Active la tontine et génère tous les turns + contributions.
   * Body : { beneficiaryOrder?: string[] }
   */
  app.post("/tontines/:tontineId/activate", async (req) => {
    const { tontineId } = z
      .object({ tontineId: z.string().uuid() })
      .parse(req.params);
    const body = activateSchema.parse(req.body ?? {});

    const updated = await activateTontine({
      tontineId,
      actorUserId: req.user.sub,
      beneficiaryOrder: body.beneficiaryOrder,
    });

    return { id: updated.id, status: updated.status };
  });

  /**
   * POST /tontine-contributions/:contributionId/mark-paid
   * Le contributeur marque sa cotisation comme payée.
   */
  app.post(
    "/tontine-contributions/:contributionId/mark-paid",
    async (req) => {
      const { contributionId } = z
        .object({ contributionId: z.string().uuid() })
        .parse(req.params);
      const body = markPaidSchema.parse(req.body ?? {});

      const updated = await markContributionPaid({
        contributionId,
        actorUserId: req.user.sub,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
      });

      return {
        id: updated.id,
        status: updated.status,
        paidAt: updated.paidAt?.toISOString() ?? null,
      };
    },
  );

  /**
   * POST /tontine-contributions/:contributionId/confirm
   * Le bénéficiaire (ou admin) confirme la réception du paiement.
   */
  app.post(
    "/tontine-contributions/:contributionId/confirm",
    async (req) => {
      const { contributionId } = z
        .object({ contributionId: z.string().uuid() })
        .parse(req.params);

      const updated = await confirmContribution({
        contributionId,
        actorUserId: req.user.sub,
      });

      return {
        id: updated.id,
        status: updated.status,
        confirmedAt: updated.confirmedAt?.toISOString() ?? null,
      };
    },
  );

  /**
   * POST /tontine-turns/:turnId/distribute
   * Clôture le tour et passe au suivant.
   */
  app.post("/tontine-turns/:turnId/distribute", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);

    const updated = await distributeTurn({
      turnId,
      actorUserId: req.user.sub,
    });

    return { id: updated.id, status: updated.status };
  });

  /**
   * POST /tontine-turns/:turnId/schedule
   * Le bénéficiaire (ou admin) fixe la date exacte du tour dans le mois.
   * Body: { scheduledDate: ISO datetime }
   */
  app.post("/tontine-turns/:turnId/schedule", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    const { scheduledDate } = z
      .object({ scheduledDate: z.string().datetime() })
      .parse(req.body);
    return scheduleTurn({
      turnId,
      actorUserId: req.user.sub,
      scheduledDate: new Date(scheduledDate),
    });
  });

  /**
   * POST /tontine-turns/:turnId/acknowledge
   * Accusé de réception de la date par un membre.
   */
  app.post("/tontine-turns/:turnId/acknowledge", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return acknowledgeTurn({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * GET /tontine-turns/:turnId/acks
   * Liste des accusés de réception du tour (qui a confirmé, qui pas).
   */
  app.get("/tontine-turns/:turnId/acks", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return listTurnAcks({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * POST /tontines/:tontineId/cancel
   * Annule la tontine entière (admin uniquement).
   */
  app.post("/tontines/:tontineId/cancel", async (req) => {
    const { tontineId } = z
      .object({ tontineId: z.string().uuid() })
      .parse(req.params);

    const updated = await cancelTontine({
      tontineId,
      actorUserId: req.user.sub,
    });

    return { id: updated.id, status: updated.status };
  });

  /* ===== Hui / Enchères (spec §3.4) ===== */

  /**
   * GET /tontine-turns/:turnId/bids
   * Liste les enchères d'un tour (visible par tous les membres).
   */
  app.get("/tontine-turns/:turnId/bids", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return listBids({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * POST /tontine-turns/:turnId/bids
   * Pose ou met à jour son enchère.
   * Body: { amount: string }
   */
  app.post("/tontine-turns/:turnId/bids", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({ amount: z.string().regex(/^\d+(\.\d{1,4})?$/) })
      .parse(req.body);
    return placeBid({
      turnId,
      actorUserId: req.user.sub,
      amount: body.amount,
    });
  });

  /**
   * DELETE /tontine-turns/:turnId/bids
   * Retire son enchère.
   */
  app.delete("/tontine-turns/:turnId/bids", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return withdrawBid({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * POST /tontine-turns/:turnId/bids/close
   * Clôture les enchères, déclare le gagnant. Admin uniquement.
   */
  app.post("/tontine-turns/:turnId/bids/close", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return closeBidding({
      turnId,
      actorUserId: req.user.sub,
    });
  });
}
