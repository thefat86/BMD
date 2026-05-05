import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  countUnread,
  deleteNotification,
  listNotifications,
  markAllAsRead,
  markAsRead,
} from "./notifications.service.js";

/**
 * Endpoints lus côté client :
 *  - GET    /notifications              (liste, ?unread=1, ?limit=50)
 *  - GET    /notifications/unread-count (badge)
 *  - POST   /notifications/:id/read     (marquer une notif comme lue)
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
      const count = await countUnread((req.user as any).sub);
      return { count };
    },
  );

  app.post(
    "/notifications/:id/read",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return markAsRead({
        notificationId: id,
        userId: (req.user as any).sub,
      });
    },
  );

  app.post(
    "/notifications/read-all",
    { preHandler: [app.authenticate] },
    async (req) => {
      return markAllAsRead((req.user as any).sub);
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
}
