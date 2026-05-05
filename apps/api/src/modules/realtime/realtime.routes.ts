/**
 * Routes Server-Sent Events (SSE) pour la sync temps réel (spec §8.2).
 *
 * Le client ouvre une connexion EventSource sur GET /events/group/:id ou
 * /events/me et reçoit en streaming les events qui le concernent.
 *
 * Authentification : le token JWT est passé dans la query string (les
 * EventSource du navigateur ne supportent pas les headers custom).
 * Sécurité : on vérifie que le user a accès au groupe avant de streamer.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eventBus } from "../../lib/event-stream.js";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /events/group/:id?token=JWT
   * SSE — events du groupe spécifié (toutes nouvelles dépenses, swaps, etc.)
   *
   * Le client utilise :
   *   const es = new EventSource(`/events/group/abc?token=${jwt}`)
   *   es.addEventListener("expense.created", (e) => { ... })
   */
  app.get(
    "/events/group/:id",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const { id: groupId } = z
        .object({ id: z.string().uuid() })
        .parse(req.params);
      // Auth via query token (EventSource ne supporte pas les headers)
      const userId = await authQueryToken(app, req);
      // Vérifier l'appartenance
      const member = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (!member) {
        return reply.code(403).send({ error: "not_member" });
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // CORS : accepter le frontend Next.js
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no", // évite buffering nginx
      });

      // Heartbeat toutes les 25s pour que les proxys ne coupent pas la conn
      const hbInterval = setInterval(() => {
        try {
          reply.raw.write(": heartbeat\n\n");
        } catch {
          /* socket fermé */
        }
      }, 25_000);

      // Souscription au bus
      const unsubscribe = eventBus.subscribe(`group:${groupId}`, (event) => {
        try {
          reply.raw.write(`event: ${event.kind}\n`);
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
          console.warn("[sse] write failed", err);
        }
      });

      // Notif initiale "connected" pour permettre au client de savoir
      // qu'il est bien branché
      reply.raw.write(`event: connected\n`);
      reply.raw.write(
        `data: ${JSON.stringify({ groupId, at: new Date().toISOString() })}\n\n`,
      );

      // Cleanup au close de la connexion
      req.raw.on("close", () => {
        clearInterval(hbInterval);
        unsubscribe();
      });

      // Empêche fastify de "terminer" la requête (la connexion reste ouverte)
      return reply;
    },
  );

  /**
   * GET /events/me?token=JWT
   * SSE — events personnels (notifications nouvelles, etc.)
   */
  app.get(
    "/events/me",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const userId = await authQueryToken(app, req);

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no",
      });

      const hbInterval = setInterval(() => {
        try {
          reply.raw.write(": heartbeat\n\n");
        } catch {
          /* ignore */
        }
      }, 25_000);

      const unsubscribe = eventBus.subscribe(`user:${userId}`, (event) => {
        try {
          reply.raw.write(`event: ${event.kind}\n`);
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
          console.warn("[sse] write failed", err);
        }
      });

      reply.raw.write(`event: connected\n`);
      reply.raw.write(
        `data: ${JSON.stringify({ userId, at: new Date().toISOString() })}\n\n`,
      );

      req.raw.on("close", () => {
        clearInterval(hbInterval);
        unsubscribe();
      });

      return reply;
    },
  );
}

/**
 * Vérifie le token JWT passé en query string (pour les EventSource du
 * navigateur qui ne supportent pas les headers Authorization).
 */
async function authQueryToken(
  app: FastifyInstance,
  req: FastifyRequest,
): Promise<string> {
  const { token } = z
    .object({ token: z.string().min(20) })
    .parse(req.query);
  try {
    const decoded = (app as any).jwt.verify(token) as { sub: string };
    if (!decoded?.sub) throw new Error("no sub");
    return decoded.sub;
  } catch {
    throw Errors.forbidden("Token invalide");
  }
}
