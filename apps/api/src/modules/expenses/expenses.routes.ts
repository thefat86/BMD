import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SplitMode } from "@prisma/client";
import {
  createExpense,
  deleteExpense,
  listExpensesForGroup,
  updateExpense,
} from "./expenses.service.js";

const createSchema = z.object({
  description: z.string().min(1).max(200),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, "Amount must be a positive decimal"),
  currency: z.string().length(3).optional(),
  category: z.string().max(50).optional(),
  paidByUserId: z.string().uuid().optional(),
  splitMode: z.nativeEnum(SplitMode),
  participants: z
    .array(
      z.object({
        userId: z.string().uuid(),
        share: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
  occurredAt: z.string().datetime().optional(),
});

const updateSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a positive decimal")
    .optional(),
  currency: z.string().length(3).optional(),
  category: z.string().max(50).nullable().optional(),
  paidByUserId: z.string().uuid().optional(),
  splitMode: z.nativeEnum(SplitMode).optional(),
  participants: z
    .array(
      z.object({
        userId: z.string().uuid(),
        share: z.number().nonnegative().optional(),
      }),
    )
    .min(1)
    .optional(),
  occurredAt: z.string().datetime().optional(),
});

function serialize(e: any) {
  return {
    id: e.id,
    description: e.description,
    amount: e.amount.toString(),
    currency: e.currency,
    category: e.category,
    splitMode: e.splitMode,
    occurredAt: e.occurredAt.toISOString(),
    paidBy: e.paidBy,
    shares: e.shares.map((s: any) => ({
      userId: s.userId,
      displayName: s.user.displayName,
      amountOwed: s.amountOwed.toString(),
    })),
  };
}

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/groups/:id/expenses", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const items = await listExpensesForGroup(params.id, req.user.sub);
    return items.map(serialize);
  });

  app.post("/groups/:id/expenses", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = createSchema.parse(req.body);
    const created = await createExpense({
      groupId: params.id,
      actorUserId: req.user.sub,
      ...body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
    return reply.code(201).send(serialize(created));
  });

  /**
   * PATCH /expenses/:id — modifie une dépense (payeur ou admin uniquement).
   */
  app.patch("/expenses/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = updateSchema.parse(req.body);
    const updated = await updateExpense({
      expenseId: id,
      actorUserId: req.user.sub,
      ...body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
    return serialize(updated);
  });

  /**
   * DELETE /expenses/:id — supprime une dépense (payeur ou admin uniquement).
   */
  app.delete("/expenses/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteExpense({ expenseId: id, actorUserId: req.user.sub });
    return reply.code(204).send();
  });
}
