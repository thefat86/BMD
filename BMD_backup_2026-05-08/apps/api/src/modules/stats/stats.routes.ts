/**
 * Routes des statistiques utilisateur (spec §3.11).
 *
 *   GET /me/stats?range=6|12|24  → stats globales sur la période
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { computeUserStats } from "./stats.service.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/me/stats", async (req) => {
    const q = z
      .object({
        range: z.coerce.number().refine((n) => n === 6 || n === 12 || n === 24, {
          message: "range doit être 6, 12 ou 24",
        }),
      })
      .partial()
      .parse(req.query);
    const range = (q.range as 6 | 12 | 24 | undefined) ?? 6;
    return computeUserStats({
      userId: req.user.sub,
      rangeMonths: range,
    });
  });
}
