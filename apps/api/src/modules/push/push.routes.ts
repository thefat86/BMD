/**
 * Routes Web Push (spec §3.12 §8.5) + Push natifs APNs/FCM (V132).
 *
 *   GET  /push/vapid-public-key       · public — utilisé par le navigateur pour subscribe
 *   POST /push/subscribe              · auth  — enregistre une PushSubscription Web Push
 *   DELETE /push/subscribe            · auth  — désinscrit Web Push (par endpoint)
 *   GET  /push/subscriptions          · auth  — liste tous les devices abonnés (web + natif)
 *   POST /push/test                   · auth  — envoie une notif test à soi-même
 *
 *   V132 — Push natif (Capacitor iOS APNs / Android FCM) :
 *   POST /push/register-native        · auth  — enregistre un token APNs/FCM
 *   DELETE /push/unregister-native    · auth  — désinscrit un token natif (logout / pruning)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { getVapidPublicKey, sendPushToUser } from "../../lib/web-push.js";
import { sendNativePushToUser } from "../../lib/native-push.js";

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
    // V132 — Envoie en parallèle Web Push (navigateur) ET push natif (iOS/Android).
    // Le user voit la notif arriver sur tous ses devices enregistrés.
    const [web, native] = await Promise.all([
      sendPushToUser(req.user.sub, {
        title: "🎉 Notifications activées",
        body: "Si tu vois ce message, c'est que tout fonctionne !",
        url: "/dashboard/profile",
      }),
      sendNativePushToUser(req.user.sub, {
        title: "🎉 Notifications activées",
        body: "Si tu vois ce message, c'est que tout fonctionne !",
        data: { link: "/dashboard/profile", kind: "TEST" },
      }),
    ]);
    return { web, native };
  });

  // ============================================================
  // V132 — Push natif (APNs iOS / FCM Android) pour la coque Capacitor
  // ============================================================

  /**
   * Enregistre un token push natif pour ce user.
   *
   * Appelé par l'app mobile au login après que l'utilisateur a accepté la
   * permission OS (alerte iOS / dialog Android 13+). Le token est opaque
   * et change rarement (mais Apple peut le rotater silencieusement, d'où
   * l'idempotence sur conflit).
   *
   * Idempotent :
   *   - Si le même token existe déjà → on rebind à req.user.sub + refresh lastSeenAt
   *     (cas du device partagé qui change de compte BMD).
   *   - Sinon → insert.
   */
  app.post("/push/register-native", async (req) => {
    const body = z
      .object({
        platform: z.enum(["ios", "android"]),
        token: z.string().min(20).max(500),
        deviceName: z.string().max(120).optional(),
        appVersion: z.string().max(40).optional(),
        capacitorDeviceId: z.string().max(120).optional(),
      })
      .parse(req.body);

    // V132 · `as any` sur le model tant que Prisma generate n'a pas tourné
    // localement (sandbox dev). À retirer après regen côté CI/CD.
    const tokens = (prisma as any).nativePushToken;

    const existing = await tokens.findUnique({ where: { token: body.token } });
    if (existing) {
      const updated = await tokens.update({
        where: { id: existing.id },
        data: {
          userId: req.user.sub,
          platform: body.platform,
          deviceName: body.deviceName ?? existing.deviceName ?? null,
          appVersion: body.appVersion ?? existing.appVersion ?? null,
          capacitorDeviceId:
            body.capacitorDeviceId ?? existing.capacitorDeviceId ?? null,
          lastSeenAt: new Date(),
        },
      });
      return { id: updated.id, reused: true };
    }

    const created = await tokens.create({
      data: {
        userId: req.user.sub,
        platform: body.platform,
        token: body.token,
        deviceName: body.deviceName ?? null,
        appVersion: body.appVersion ?? null,
        capacitorDeviceId: body.capacitorDeviceId ?? null,
      },
    });
    return { id: created.id, reused: false };
  });

  /**
   * Désinscrit un token natif. Appelé au logout pour ne plus recevoir de
   * push, ou par le sender quand APNs/FCM renvoie 410/NotRegistered (cleanup auto).
   *
   * Accepte token OU id (token pour le mobile qui le possède, id pour la
   * page profile/sessions qui ne fait que lister).
   */
  app.delete("/push/unregister-native", async (req) => {
    const body = z
      .object({
        token: z.string().optional(),
        id: z.string().uuid().optional(),
      })
      .refine((v) => v.token || v.id, {
        message: "token ou id requis",
      })
      .parse(req.body);

    const tokens = (prisma as any).nativePushToken;
    const where: Record<string, unknown> = { userId: req.user.sub };
    if (body.token) where.token = body.token;
    if (body.id) where.id = body.id;

    const r = await tokens.deleteMany({ where });
    return { removed: r.count };
  });

  /**
   * Liste les tokens natifs enregistrés pour ce user (page /profile/sessions).
   * Affiche le device, plateforme, dernière fois vu — pas le token brut
   * (info sensible, on n'a pas besoin de l'exposer côté UI).
   */
  app.get("/push/native-devices", async (req) => {
    const tokens = (prisma as any).nativePushToken;
    const rows = await tokens.findMany({
      where: { userId: req.user.sub },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        appVersion: true,
        createdAt: true,
        lastSeenAt: true,
        lastSuccessAt: true,
      },
    });
    return rows.map((r: any) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
    }));
  });
}
