import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SplitMode } from "@prisma/client";
import {
  createExpense,
  deleteExpense,
  listExpensesForGroup,
  updateExpense,
} from "./expenses.service.js";
import {
  filterPhotoByPlan,
  getPhotoVisibilityMap,
} from "../../lib/plan-limits.js";

/**
 * V77.1 — Filtre les `paidBy.avatar` des dépenses selon le plan du payeur.
 * Le caller voit toujours sa propre photo (cas usage : sa dépense apparaît
 * dans la liste avec son avatar). Pour les autres payeurs : photo visible
 * uniquement si leur plan a `profilePhotoVisible: true`.
 *
 * Batch : on collecte tous les userIds en un passage, on hit le cache plan
 * une fois par user, puis on applique le filtre inline.
 */
async function applyPhotoVisibilityToExpenses<
  T extends { paidBy?: { id: string; avatar: string | null } | null },
>(items: T[], callerUserId: string): Promise<T[]> {
  const userIds = items
    .map((e) => e.paidBy?.id)
    .filter((id): id is string => typeof id === "string");
  if (userIds.length === 0) return items;
  const map = await getPhotoVisibilityMap(userIds);
  return items.map((e) => {
    if (!e.paidBy) return e;
    const isSelf = e.paidBy.id === callerUserId;
    return {
      ...e,
      paidBy: {
        ...e.paidBy,
        avatar: isSelf
          ? e.paidBy.avatar
          : filterPhotoByPlan(e.paidBy.id, e.paidBy.avatar, map),
      },
    };
  });
}

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
  // V42 · Hash SHA-256 du fichier scan (anti-doublon facture)
  receiptHash: z.string().length(64).optional(),
  // V216.C · Lieu libre de la dépense (max 120 chars, optionnel)
  location: z.string().max(120).optional(),
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
  // V216.C · Lieu libre de la dépense (null pour effacer, undefined pour
  // ne pas toucher au champ — PATCH partiel).
  location: z.string().max(120).nullable().optional(),
});

function serialize(e: any) {
  return {
    id: e.id,
    description: e.description,
    amount: e.amount.toString(),
    currency: e.currency,
    category: e.category,
    // V216.C — Lieu libre (optionnel, null si non renseigné)
    location: e.location ?? null,
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
    // V80.1 — Indique si la dépense a au moins un attachment (= reçu scanné).
    // Le frontend affiche un badge "Reçu" (mini SVG trombone) dans la timeline.
    // `_count.attachments` est populé seulement par listExpensesForGroup ;
    // pour create/update on retombe sur false par défaut (rechargement
    // re-fetch la liste de toute façon).
    hasReceipt:
      typeof e._count?.attachments === "number"
        ? e._count.attachments > 0
        : Array.isArray(e.attachments) && e.attachments.length > 0,
    // V226 — Mini-liste des attachments exposée dans la liste des dépenses
    // pour permettre au front d'afficher un badge cliquable "📎 N" directement
    // dans la liste, et ouvrir la lightbox au clic sans charger les détails.
    // Champs minimaux : id (clé), kind, mimeType, fileName (alt + preview).
    // Rempli uniquement par listExpensesForGroup (qui inclut la relation).
    // Pour createExpense/updateExpense la relation n'est pas chargée → array vide.
    attachments: Array.isArray(e.attachments)
      ? e.attachments.map((a: any) => ({
          id: a.id,
          kind: a.kind ?? "RECEIPT",
          mimeType: a.mimeType,
          fileName: a.fileName,
        }))
      : [],
  };
}

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/groups/:id/expenses", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const items = await listExpensesForGroup(params.id, req.user.sub);
    // V77.1 — Filtre paidBy.avatar selon le plan du payeur
    const filtered = await applyPhotoVisibilityToExpenses(items, req.user.sub);
    return filtered.map(serialize);
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
    // V77.1 — Le caller est le créateur ; il voit sa propre photo. Mais si
    // la dépense a un paidBy différent (multi-payeurs / autre membre payeur),
    // on filtre selon le plan de ce payeur.
    const [filtered] = await applyPhotoVisibilityToExpenses(
      [created],
      req.user.sub,
    );
    return reply.code(201).send(serialize(filtered));
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
    // V77.1 — Filtre paidBy.avatar selon le plan du payeur
    const [filtered] = await applyPhotoVisibilityToExpenses(
      [updated],
      req.user.sub,
    );
    return serialize(filtered);
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
