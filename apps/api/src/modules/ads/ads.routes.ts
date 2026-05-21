/**
 * Routes Ads tracking — spec §6.4.
 *
 * POST /ads/track  → enregistre une impression/click depuis le frontend.
 *
 * Auth requise pour limiter les abus, mais pas de scope spécial — tout user
 * authentifié peut envoyer ses propres impressions. Le serveur ignore
 * silencieusement les events si la régie ou la catégorie n'est pas dans
 * `AdsConfig.enabledNetworks` / `allowedCategories` (anti-spam de données).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";

export async function adsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/ads/track",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = z
        .object({
          network: z.string().min(1).max(40),
          category: z.string().min(1).max(40),
          format: z.enum(["banner", "interstitial", "video", "native"]),
          event: z.enum(["impression", "click", "close"]),
          revenueCents: z.number().int().min(0).max(100000).default(0),
        })
        .parse(req.body);

      const cfg = await prisma.adsConfig.findUnique({
        where: { id: "default" },
      });
      // Si pas de config OU pubs désactivées globalement → on ignore
      if (!cfg || !cfg.enabled) {
        return reply.code(204).send();
      }
      // Filtrage régie + catégorie
      const enabledNets = (cfg.enabledNetworks as string[] | null) ?? [];
      if (enabledNets.length > 0 && !enabledNets.includes(body.network)) {
        return reply.code(204).send();
      }
      const blocked = (cfg.blockedCategories as string[] | null) ?? [];
      if (blocked.includes(body.category)) {
        return reply.code(204).send();
      }

      const country = (
        (req.headers["cf-ipcountry"] as string | undefined) ?? null
      )?.slice(0, 2).toUpperCase();

      await prisma.adImpression.create({
        data: {
          userId: req.user.sub,
          network: body.network,
          category: body.category,
          format: body.format,
          event: body.event,
          revenueCents: body.revenueCents,
          country,
        },
      });
      return reply.code(204).send();
    },
  );
}
