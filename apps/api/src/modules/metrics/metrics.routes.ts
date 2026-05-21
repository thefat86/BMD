/**
 * V176 — Routes ingestion Core Web Vitals.
 *
 * Endpoint PUBLIC (pas d'auth requise) :
 *   POST /metrics/web-vitals → 1 ligne dans WebVitalsMetric
 *
 * Pourquoi sans auth ? On veut aussi capturer les vitals des landing
 * pages publiques (vitrine, /pricing, /invite/[token], etc.) où l'user
 * n'est pas connecté. Si un token Bearer est tout de même fourni et
 * valide, on l'utilise pour rattacher la métrique au userId.
 *
 * Rate-limit naïf en mémoire : 1 req/s/IP (anti-spam basique).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";

// Limiteur en mémoire (Map) — léger, suffisant pour anti-spam basique.
// Pour un vrai rate-limit prod, brancher @fastify/rate-limit côté infra.
const lastSeenByIp = new Map<string, number>();
const RATE_WINDOW_MS = 1000;
// Hard cap pour éviter une fuite mémoire en cas de pic
const MAX_IP_ENTRIES = 5000;

function checkRate(ip: string): boolean {
  const now = Date.now();
  const last = lastSeenByIp.get(ip);
  if (last && now - last < RATE_WINDOW_MS) return false;
  lastSeenByIp.set(ip, now);
  // GC opportuniste : si la map dépasse le cap, on vide les vieilles
  if (lastSeenByIp.size > MAX_IP_ENTRIES) {
    for (const [k, v] of lastSeenByIp) {
      if (now - v > 60_000) lastSeenByIp.delete(k);
    }
  }
  return true;
}

const webVitalSchema = z.object({
  name: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
  value: z.number().finite(),
  rating: z.string().min(1).max(40),
  page: z.string().min(1).max(500),
  deviceType: z.string().min(1).max(20),
  locale: z.string().max(20).optional(),
  connectionType: z.string().max(40).optional(),
  userAgent: z.string().max(500).optional(),
  navigationId: z.string().max(80).optional(),
});

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/metrics/web-vitals",
    { config: { skipAuth: true } },
    async (req, reply) => {
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        "unknown";
      if (!checkRate(ip)) {
        return reply.code(429).send({ ok: false, error: "rate_limited" });
      }

      const parsed = webVitalSchema.safeParse(req.body);
      if (!parsed.success) {
        // On veut surtout pas faire planter le front : on log et on renvoie
        // 200 (best-effort). Le 400 strict découragerait les retries.
        req.log?.warn(
          { issues: parsed.error.issues },
          "[web-vitals] invalid payload",
        );
        return reply.code(200).send({ ok: false, error: "invalid" });
      }
      const data = parsed.data;

      // Auth optionnelle : on tente de lire un Bearer si présent, sinon
      // on stocke en anonyme.
      let userId: string | null = null;
      const auth = req.headers.authorization;
      if (auth && /^Bearer\s+/i.test(auth)) {
        try {
          const payload = await req.jwtVerify<{ sub: string }>();
          if (payload?.sub) userId = payload.sub;
        } catch {
          // token invalide → on ignore, on stocke en anonyme
        }
      }

      try {
        await prisma.webVitalsMetric.create({
          data: {
            userId,
            name: data.name,
            value: data.value,
            rating: data.rating,
            page: data.page,
            deviceType: data.deviceType,
            locale: data.locale ?? null,
            connectionType: data.connectionType ?? null,
            userAgent: data.userAgent ?? null,
            navigationId: data.navigationId ?? null,
          },
        });
      } catch (err) {
        req.log?.warn({ err }, "[web-vitals] insert failed");
        // Ne PAS bloquer le client : on renvoie 200 quand même
      }
      return { ok: true };
    },
  );
}
