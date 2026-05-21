import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acceptByAssumer,
  acceptByCreditor,
  cancelDebtTransfer,
  listDebtTransfers,
  proposeDebtTransfer,
  rejectByAssumer,
  rejectByCreditor,
} from "./debt-transfers.service.js";
import { assertFeatureEnabled } from "../../lib/plan-limits.js";

/**
 * Routes pour le transfert bilatéral de dette.
 *  - POST   /groups/:id/debt-transfers              propose
 *  - GET    /groups/:id/debt-transfers              liste actives + propositions
 *  - POST   /debt-transfers/:id/accept-assumer      C accepte
 *  - POST   /debt-transfers/:id/reject-assumer      C refuse
 *  - POST   /debt-transfers/:id/accept-creditor     B accepte
 *  - POST   /debt-transfers/:id/reject-creditor     B refuse
 *  - POST   /debt-transfers/:id/cancel              annule (proposer ou admin)
 */
export async function debtTransfersRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.post("/groups/:id/debt-transfers", async (req) => {
    // Spec §3.6 : transfert de dette = même feature Premium que le swap
    await assertFeatureEnabled((req.user as any).sub, "debtSwap");
    const { id: groupId } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        fromUserId: z.string().uuid(),
        assumeUserId: z.string().uuid(),
        creditorUserId: z.string().uuid(),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,4})?$/, "Montant doit être positif"),
        currency: z.string().length(3).optional(),
        reason: z.string().max(500).optional(),
      })
      .parse(req.body);
    return proposeDebtTransfer({
      groupId,
      actorUserId: (req.user as any).sub,
      ...body,
    });
  });

  app.get("/groups/:id/debt-transfers", async (req) => {
    const { id: groupId } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const q = z
      .object({ includeFinished: z.string().optional() })
      .parse(req.query);
    return listDebtTransfers({
      groupId,
      actorUserId: (req.user as any).sub,
      includeFinished: q.includeFinished === "1",
    });
  });

  const idSchema = z.object({ id: z.string().uuid() });
  app.post("/debt-transfers/:id/accept-assumer", async (req) => {
    const { id } = idSchema.parse(req.params);
    return acceptByAssumer({
      transferId: id,
      actorUserId: (req.user as any).sub,
    });
  });
  app.post("/debt-transfers/:id/reject-assumer", async (req) => {
    const { id } = idSchema.parse(req.params);
    return rejectByAssumer({
      transferId: id,
      actorUserId: (req.user as any).sub,
    });
  });
  app.post("/debt-transfers/:id/accept-creditor", async (req) => {
    const { id } = idSchema.parse(req.params);
    return acceptByCreditor({
      transferId: id,
      actorUserId: (req.user as any).sub,
    });
  });
  app.post("/debt-transfers/:id/reject-creditor", async (req) => {
    const { id } = idSchema.parse(req.params);
    return rejectByCreditor({
      transferId: id,
      actorUserId: (req.user as any).sub,
    });
  });
  app.post("/debt-transfers/:id/cancel", async (req) => {
    const { id } = idSchema.parse(req.params);
    return cancelDebtTransfer({
      transferId: id,
      actorUserId: (req.user as any).sub,
    });
  });
}
