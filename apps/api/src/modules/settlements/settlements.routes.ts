import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { computeBalanceWithSuggestions } from "./balance.service.js";

export async function settlementsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /groups/:id/balance
   * Returns net balance per member + suggested settlements.
   */
  app.get("/groups/:id/balance", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await computeBalanceWithSuggestions(
      params.id,
      req.user.sub,
    );
    return {
      currency: result.currency,
      balances: result.balances.map((b) => ({
        userId: b.userId,
        displayName: b.displayName,
        net: b.net.toString(),
      })),
      suggestions: result.suggestions.map((s) => ({
        fromUserId: s.fromUserId,
        fromName: s.fromName,
        toUserId: s.toUserId,
        toName: s.toName,
        amount: s.amount.toString(),
        currency: s.currency,
      })),
    };
  });
}
