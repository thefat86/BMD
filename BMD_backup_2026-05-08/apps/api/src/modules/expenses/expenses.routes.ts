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
  // Sprint AC-2 · Multi-payeurs (optionnel — fallback paidByUserId)
  payers: z
    .array(
      z.object({
        userId: z.string().uuid(),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a positive decimal")
          .optional(),
        percent: z.number().min(0).max(100).optional(),
      }),
    )
    .optional(),
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
  // Sprint AC-3 · Multi-payeurs en édition (peut être vide pour effacer)
  payers: z
    .array(
      z.object({
        userId: z.string().uuid(),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a positive decimal")
          .optional(),
        percent: z.number().min(0).max(100).optional(),
      }),
    )
    .optional(),
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
    // Sprint AC-3 · Multi-payeurs : on expose la liste des payers persistés
    // pour que le formulaire d'édition puisse pré-remplir le mode multi.
    payers: Array.isArray(e.payers)
      ? e.payers.map((p: any) => ({
          userId: p.userId,
          amount: p.amount?.toString?.() ?? null,
          percent: p.percent !== null && p.percent !== undefined ? Number(p.percent) : null,
        }))
      : [],
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
   * POST /groups/:id/expenses/import-csv (spec §8.4 saisie en lot)
   * Body: { rows: Array<{ description, amount, occurredAt?, category? }> }
   *
   * Pour chaque ligne, crée une dépense en mode EQUAL avec tous les
   * membres comme participants et l'utilisateur courant comme payeur
   * (l'utilisateur peut éditer ensuite chaque dépense pour ajuster).
   *
   * Retourne le nombre de succès/échecs avec détails ligne par ligne
   * pour permettre à l'UI d'afficher un rapport d'import.
   */
  app.post("/groups/:id/expenses/import-csv", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        rows: z
          .array(
            z.object({
              description: z.string().min(1).max(200),
              amount: z.string().regex(/^\d+([.,]\d{1,4})?$/),
              occurredAt: z.string().optional(),
              category: z.string().max(50).optional(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(req.body);

    // On charge le groupe pour récupérer la liste des membres (participants)
    const { getGroupForMember } = await import("../groups/groups.service.js");
    const group = await getGroupForMember(params.id, req.user.sub);
    const participants = group.members.map((m: any) => ({ userId: m.userId }));

    const results: Array<{
      ok: boolean;
      description: string;
      error?: string;
      expenseId?: string;
    }> = [];
    for (const row of body.rows) {
      try {
        const amount = row.amount.replace(",", ".");
        // Date format flexible : ISO ou DD/MM/YYYY
        let occurredAt: Date | undefined;
        if (row.occurredAt) {
          const parts = row.occurredAt.match(
            /^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/,
          );
          if (parts) {
            occurredAt = new Date(`${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`);
          } else {
            occurredAt = new Date(row.occurredAt);
          }
          if (isNaN(occurredAt.getTime())) occurredAt = undefined;
        }
        const created = await createExpense({
          groupId: params.id,
          actorUserId: req.user.sub,
          description: row.description,
          amount,
          splitMode: "EQUAL",
          participants,
          occurredAt,
          category: row.category,
        });
        results.push({
          ok: true,
          description: row.description,
          expenseId: created.id,
        });
      } catch (err) {
        results.push({
          ok: false,
          description: row.description,
          error: (err as Error).message,
        });
      }
    }
    return reply.code(201).send({
      total: body.rows.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
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
