/**
 * Routes Web Push (spec §3.12 §8.5).
 *
 *   GET  /push/vapid-public-key  · public — utilisé par le navigateur pour subscribe
 *   POST /push/subscribe         · auth  — enregistre une PushSubscription
 *   DELETE /push/subscribe       · auth  — désinscrit (par endpoint)
 *   GET  /push/subscriptions     · auth  — liste les devices abonnés (profil)
 *   POST /push/test              · auth  — envoie une notif test à soi-même
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { getVapidPublicKey, sendPushToUser } from "../../lib/web-push.js";

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  // Public — le navigateur a besoin de la clé pour appeler PushManager.subscribe
  app.get(
    "/push/vapid-public-key",
    { config: { skipAuth: true } as any },
    async () => {
      const key = getVapidPublicKey();
      return { key, enabled: key !== null };
    },
  );

  app.addHook("onRequest", app.authenticate);

  app.post("/push/subscribe", async (req) => {
    const body = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string().min(20),
          auth: z.string().min(8),
        }),
      })
      .parse(req.body);

    if (!getVapidPublicKey()) {
      throw Errors.badRequest(
        "Les notifications push ne sont pas encore activées 🛠️",
        {
          tip: "L'admin doit configurer VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY côté serveur.",
        },
      );
    }

    const ua = req.headers["user-agent"];
    const userAgent =
      typeof ua === "string" ? ua.slice(0, 200) : null;

    // Idempotent : si on connaît déjà cet endpoint, on met à jour les clés
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: body.endpoint },
    });
    if (existing) {
      // Si l'endpoint existait pour un autre user → on réassigne
      const updated = await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: req.user.sub,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent,
        },
      });
      return { id: updated.id, reused: true };
    }

    const created = await prisma.pushSubscription.create({
      data: {
        userId: req.user.sub,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
      },
    });
    return { id: created.id, reused: false };
  });

  app.delete("/push/subscribe", async (req) => {
    const body = z
      .object({ endpoint: z.string().url() })
      .parse(req.body);
    const r = await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: req.user.sub },
    });
    return { removed: r.count };
  });

  app.get("/push/subscriptions", async (req) => {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
        lastSuccessAt: true,
      },
    });
    return subs.map((s) => ({
      id: s.id,
      // On retourne l'endpoint tronqué (URL longue) — pour l'identification visuelle
      endpointShort: `${s.endpoint.slice(0, 50)}…`,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
    }));
  });

  app.post("/push/test", async (req) => {
    const r = await sendPushToUser(req.user.sub, {
      title: "🎉 Notifications activées",
      body: "Si tu vois ce message, c'est que tout fonctionne !",
      url: "/dashboard/profile",
    });
    return r;
  });
}
