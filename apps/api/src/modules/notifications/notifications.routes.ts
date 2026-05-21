import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acknowledgeResponse,
  countUnread,
  deleteNotification,
  getNotification,
  listNotifications,
  markAllAsRead,
  markAsRead,
  markAsUnread,
  respondToNotification,
} from "./notifications.service.js";
// V120 — Cache court sur le badge non-lues (l'endpoint le plus fréquent).
import { cacheGetOrSet, cacheDel } from "../../lib/cache.js";

/**
 * Endpoints lus côté client :
 *  - GET    /notifications              (liste, ?unread=1, ?limit=50)
 *  - GET    /notifications/unread-count (badge)
 *  - GET    /notifications/:id          (détail + sender, V98)
 *  - POST   /notifications/:id/read     (marquer une notif comme lue)
 *  - POST   /notifications/:id/unread   (marquer une notif comme NON lue)
 *  - POST   /notifications/:id/respond  (répondre : ACK/EMOJI/TEXT, V98)
 *  - POST   /notifications/:id/acknowledge (l'émetteur ack une réponse, V98)
 *  - POST   /notifications/read-all     (marquer toutes lues)
 *  - DELETE /notifications/:id          (effacer une notif)
 */
export async function notificationsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/notifications",
    { preHandler: [app.authenticate] },
    async (req) => {
      const q = z
        .object({
          unread: z.string().optional(),
          limit: z.coerce.number().min(1).max(200).optional(),
        })
        .parse(req.query);
      return listNotifications({
        userId: (req.user as any).sub,
        unreadOnly: q.unread === "1",
        limit: q.limit,
      });
    },
  );

  app.get(
    "/notifications/unread-count",
    { preHandler: [app.authenticate] },
    async (req) => {
      // V120 — Cache 10s par userId. Endpoint le PLUS fréquent de l'API
      // (badge cloche header + polling). Avant : `countUnread` faisait
      // un `count` SQL à chaque hit (HEAD du fanout). Désormais on
      // dédup les bursts (mount dashboard + groupe + retour = 3 hits
      // dans 200 ms → 1 seul query SQL). Le temps réel reste assuré
      // par le SSE qui pousse les notifs immédiatement côté UI ; le
      // cache 10 s n'introduit qu'une latence imperceptible quand le
      // SSE coupe et que le polling fallback re-prend la main.
      const count = await cacheGetOrSet(
        `unread-notifs:${(req.user as any).sub}`,
        10,
        () => countUnread((req.user as any).sub),
      );
      return { count };
    },
  );

  app.post(
    "/notifications/:id/read",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const result = await markAsRead({
        notificationId: id,
        userId: (req.user as any).sub,
      });
      // V120 — Invalide le badge non-lues : le compteur a baissé, on
      // veut que le hit suivant retourne la valeur fraîche.
      void cacheDel(`unread-notifs:${(req.user as any).sub}`);
      return result;
    },
  );

  app.post(
    "/notifications/:id/unread",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const result = await markAsUnread({
        notificationId: id,
        userId: (req.user as any).sub,
      });
      void cacheDel(`unread-notifs:${(req.user as any).sub}`);
      return result;
    },
  );

  app.post(
    "/notifications/read-all",
    { preHandler: [app.authenticate] },
    async (req) => {
      const result = await markAllAsRead((req.user as any).sub);
      void cacheDel(`unread-notifs:${(req.user as any).sub}`);
      return result;
    },
  );

  app.delete(
    "/notifications/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteNotification({
        notificationId: id,
        userId: (req.user as any).sub,
      });
      return reply.code(204).send();
    },
  );

  // V98 — Détail d'une notif (avec sender + ownership check)
  app.get(
    "/notifications/:id",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return getNotification({
        notificationId: id,
        viewerUserId: (req.user as any).sub,
      });
    },
  );

  // V98 — Réponse à une notif (ACK / EMOJI / TEXT)
  app.post(
    "/notifications/:id/respond",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          kind: z.enum(["ACK", "EMOJI", "TEXT"]),
          emoji: z.string().max(8).optional(),
          text: z.string().max(280).optional(),
        })
        .parse(req.body);
      return respondToNotification({
        notificationId: id,
        userId: (req.user as any).sub,
        kind: body.kind,
        emoji: body.emoji,
        text: body.text,
      });
    },
  );

  // V98 — L'émetteur ack la notif retour (« Compris »)
  app.post(
    "/notifications/:id/acknowledge",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return acknowledgeResponse({
        notificationId: id,
        userId: (req.user as any).sub,
      });
    },
  );
}
