import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acceptSwap,
  cancelSwap,
  listGroupSwaps,
  proposeSwap,
  rejectSwap,
} from "./debt-swaps.service.js";

const proposeSchema = z.object({
  description: z.string().max(200).optional(),
});

function serializeSwap(s: any) {
  return {
    id: s.id,
    groupId: s.groupId,
    proposedById: s.proposedById,
    status: s.status,
    description: s.description,
    totalSavedAmount: s.totalSavedAmount.toString(),
    expiresAt: s.expiresAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    resolvedAt: s.resolvedAt?.toISOString() ?? null,
    participants: s.participants.map((p: any) => ({
      id: p.id,
      userId: p.userId,
      displayName: p.user.displayName,
      acceptedAt: p.acceptedAt?.toISOString() ?? null,
      rejectedAt: p.rejectedAt?.toISOString() ?? null,
    })),
    legs: s.legs.map((l: any) => ({
      fromUserId: l.fromUserId,
      toUserId: l.toUserId,
      amount: l.amount.toString(),
      currency: l.currency,
    })),
  };
}

export async function debtSwapsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /** POST /groups/:groupId/debt-swaps : proposer un swap */
  app.post("/groups/:groupId/debt-swaps", async (req, reply) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const body = proposeSchema.parse(req.body ?? {});
    const swap = await proposeSwap({
      groupId,
      actorUserId: req.user.sub,
      description: body.description,
    });
    return reply.code(201).send(serializeSwap(swap));
  });

  /** GET /groups/:groupId/debt-swaps : lister les swaps actifs */
  app.get("/groups/:groupId/debt-swaps", async (req) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const includeResolved =
      (req.query as any)?.includeResolved === "true";

    const swaps = await listGroupSwaps({
      groupId,
      actorUserId: req.user.sub,
      includeResolved,
    });
    return swaps.map(serializeSwap);
  });

  /** POST /debt-swaps/:swapId/accept */
  app.post("/debt-swaps/:swapId/accept", async (req) => {
    const { swapId } = z
      .object({ swapId: z.string().uuid() })
      .parse(req.params);
    const swap = await acceptSwap({ swapId, actorUserId: req.user.sub });
    return serializeSwap(swap);
  });

  /** POST /debt-swaps/:swapId/reject */
  app.post("/debt-swaps/:swapId/reject", async (req) => {
    const { swapId } = z
      .object({ swapId: z.string().uuid() })
      .parse(req.params);
    const swap = await rejectSwap({ swapId, actorUserId: req.user.sub });
    return serializeSwap(swap);
  });

  /** POST /debt-swaps/:swapId/cancel */
  app.post("/debt-swaps/:swapId/cancel", async (req) => {
    const { swapId } = z
      .object({ swapId: z.string().uuid() })
      .parse(req.params);
    const swap = await cancelSwap({ swapId, actorUserId: req.user.sub });
    return { id: swap.id, status: swap.status };
  });
}
