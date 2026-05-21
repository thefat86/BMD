import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  claimItem,
  computeItemizedShares,
  listExpenseItems,
  setExpenseItems,
  unclaimItem,
} from "./expense-items.service.js";

/**
 * Routes pour le mode "split par item" des dépenses.
 *  - GET    /expenses/:id/items                 (liste items + claims)
 *  - PUT    /expenses/:id/items                 (remplace tous les items, payeur/admin)
 *  - GET    /expenses/:id/itemized-shares       (qui doit combien selon les claims)
 *  - POST   /expense-items/:id/claim            (je revendique cet item)
 *  - DELETE /expense-items/:id/claim            (je retire ma claim)
 */
export async function expenseItemsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/expenses/:id/items", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return listExpenseItems({
      expenseId: id,
      actorUserId: (req.user as any).sub,
    });
  });

  app.put("/expenses/:id/items", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        items: z.array(
          z.object({
            description: z.string().min(1).max(200),
            quantity: z.number().positive().optional(),
            unitPrice: z.string().regex(/^\d+(\.\d{1,4})?$/),
            totalPrice: z.string().regex(/^\d+(\.\d{1,4})?$/),
            category: z.string().max(50).optional(),
            // V239.A — Liste des users qui consomment cet article (peut être
            // vide si non assigné). Le service crée 1 claim/userId share=1/N.
            assignedUserIds: z.array(z.string().uuid()).optional(),
          }),
        ),
      })
      .parse(req.body);
    return setExpenseItems({
      expenseId: id,
      actorUserId: (req.user as any).sub,
      items: body.items,
    });
  });

  app.get("/expenses/:id/itemized-shares", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return computeItemizedShares({
      expenseId: id,
      actorUserId: (req.user as any).sub,
    });
  });

  app.post("/expense-items/:id/claim", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        share: z.number().positive().max(1).optional(),
        /**
         * Réservé au payeur ou admin : assigne directement l'article à un
         * autre membre (ex: à la création de la dépense, le payeur indique
         * qui a consommé quoi).
         */
        targetUserId: z.string().uuid().optional(),
      })
      .parse(req.body ?? {});
    return claimItem({
      itemId: id,
      actorUserId: (req.user as any).sub,
      share: body.share,
      targetUserId: body.targetUserId,
    });
  });

  app.delete("/expense-items/:id/claim", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return unclaimItem({
      itemId: id,
      actorUserId: (req.user as any).sub,
    });
  });
}
