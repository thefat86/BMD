/**
 * Routes pour les suggestions IA et la détection d'anomalies (spec §3.7 §3.8).
 *
 *   GET  /groups/:id/suggestions/split?category=  → suggère un partage
 *   GET  /groups/:id/suggestions/recurring?description=  → détecte une récurrente
 *   GET  /expenses/:id/anomalies                  → liste les anomalies de cette dépense
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { getGroupForMember } from "../groups/groups.service.js";
import {
  suggestRecurringExpense,
  suggestSplit,
} from "./suggestions.service.js";
import { detectAnomalies } from "./anomalies.service.js";

export async function suggestionsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/groups/:id/suggestions/split", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z
      .object({ category: z.string().optional() })
      .parse(req.query);
    await getGroupForMember(id, req.user.sub);
    const r = await suggestSplit({
      groupId: id,
      category: q.category ?? null,
    });
    return { suggestion: r };
  });

  app.get("/groups/:id/suggestions/recurring", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ description: z.string().min(1) }).parse(req.query);
    await getGroupForMember(id, req.user.sub);
    const r = await suggestRecurringExpense({
      groupId: id,
      description: q.description,
    });
    return r ?? { found: false };
  });

  app.get("/expenses/:id/anomalies", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    // Vérifier que l'utilisateur est membre du groupe de la dépense
    const exp = await prisma.expense.findUnique({
      where: { id },
      select: { groupId: true },
    });
    if (!exp) throw Errors.notFound("Cette dépense est introuvable 🔍");
    await getGroupForMember(exp.groupId, req.user.sub);

    const anomalies = await detectAnomalies({ expenseId: id });
    return { anomalies };
  });
}
