import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SplitMode } from "@prisma/client";
import { createExpense, listExpensesForGroup } from "./expenses.service.js";

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

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/groups/:id/expenses", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const items = await listExpensesForGroup(params.id, req.user.sub);
    return items.map((e) => ({
      id: e.id,
      description: e.description,
      amount: e.amount.toString(),
      currency: e.currency,
      category: e.category,
      splitMode: e.splitMode,
      occurredAt: e.occurredAt.toISOString(),
      paidBy: e.paidBy,
      shares: e.shares.map((s) => ({
        userId: s.userId,
        displayName: s.user.displayName,
        amountOwed: s.amountOwed.toString(),
      })),
    }));
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
    return reply.code(201).send({
      id: created.id,
      description: created.description,
      amount: created.amount.toString(),
      currency: created.currency,
      splitMode: created.splitMode,
      occurredAt: created.occurredAt.toISOString(),
      paidBy: created.paidBy,
      shares: created.shares.map((s) => ({
        userId: s.userId,
        displayName: s.user.displayName,
        amountOwed: s.amountOwed.toString(),
      })),
    });
  });
}
