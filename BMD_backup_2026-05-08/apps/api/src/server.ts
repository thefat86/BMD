import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { randomBytes } from "node:crypto";

/**
 * Génère un ID compact unique pour une requête HTTP (8 octets random
 * encodés base32 → 13 caractères URL-safe). Format choisi pour être
 * lisible dans les logs sans saturer (vs UUID 36 chars).
 */
function generateRequestId(): string {
  return randomBytes(8).toString("base64url");
}
import { loadEnv } from "./lib/env.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { passkeyRoutes } from "./modules/auth/passkey.routes.js";
import { groupsRoutes } from "./modules/groups/groups.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { settlementsRoutes } from "./modules/settlements/settlements.routes.js";
import { tontinesRoutes } from "./modules/tontines/tontines.routes.js";
import { debtSwapsRoutes } from "./modules/debt-swaps/debt-swaps.routes.js";
import { splitPresetsRoutes } from "./modules/split-presets/split-presets.routes.js";
import { ocrRoutes } from "./modules/ocr/ocr.routes.js";
import { voiceRoutes } from "./modules/voice/voice.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { attachmentsRoutes } from "./modules/attachments/attachments.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";
import { debtTransfersRoutes } from "./modules/debt-transfers/debt-transfers.routes.js";
import { expenseItemsRoutes } from "./modules/expense-items/expense-items.routes.js";
import { realtimeRoutes } from "./modules/realtime/realtime.routes.js";
import { fxRoutes } from "./modules/fx/fx.routes.js";
import { pushRoutes } from "./modules/push/push.routes.js";
import { gdprRoutes } from "./modules/gdpr/gdpr.routes.js";
import { suggestionsRoutes } from "./modules/suggestions/suggestions.routes.js";
import { whatsappRoutes } from "./modules/whatsapp/whatsapp.routes.js";
import { paymentProvidersRoutes } from "./modules/payment-providers/payment-providers.routes.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";
import { promosRoutes } from "./modules/promos/promos.routes.js";
import { simSwapRoutes } from "./modules/sim-swap/sim-swap.routes.js";
import { paymentMethodsRoutes } from "./modules/payment-methods/payment-methods.routes.js";
import { cmsRoutes } from "./modules/cms/cms.routes.js";
import { affiliateRoutes } from "./modules/affiliate/affiliate.routes.js";
import { paymentsRoutes } from "./modules/payments/payments.routes.js";
import { exportsRoutes } from "./modules/exports/exports.routes.js";
import { aiRoutes } from "./modules/ai/ai.routes.js";
import { meetingsRoutes } from "./modules/meetings/meetings.routes.js";
import { searchRoutes } from "./modules/search/search.routes.js";
import { partnersRoutes } from "./modules/partners/partners.routes.js";
import { adsRoutes } from "./modules/ads/ads.routes.js";
import { npsRoutes } from "./modules/nps/nps.routes.js";
import { assertSessionActive, type JwtPayload } from "./modules/auth/jwt.service.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === "development"
                ? { target: "pino-pretty", options: { colorize: true, singleLine: true } }
                : undefined,
          },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // === Compression Brotli/gzip ===
  // Réduit la taille des réponses JSON de 70-90% (notamment listes de
  // dépenses, balances, traductions). Gain énorme sur 3G/4G.
  // Encoding négocié auto via Accept-Encoding du client.
  // Try-catch gracieux : si le package n'est pas installé (npm install
  // pas encore fait), on log et on continue sans compression.
  try {
    const compress = (await import("@fastify/compress")).default;
    await app.register(compress, {
      global: true,
      threshold: 1024, // pas la peine de compresser les petites réponses
      encodings: ["br", "gzip"], // Brotli prioritaire (meilleur ratio)
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[server] @fastify/compress non installé — compression désactivée. Lance `npm install` côté API pour l'activer.",
      (e as Error).message,
    );
  }

  // === Cache-Control headers ===
  // Hook onSend qui ajoute des Cache-Control intelligents :
  //  - Endpoints publics safe (currencies, locales, plans, fx-rates) →
  //    `public, max-age=300, stale-while-revalidate=600` (5min/10min)
  //  - Routes user → `private, no-cache` (toujours revalider via ETag)
  //  - /health → `no-store` (toujours frais, ne jamais cacher)
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.method !== "GET") return payload;
    const url = req.url.split("?")[0];
    if (url === "/health" || url === "/metrics") {
      reply.header("Cache-Control", "no-store");
    } else if (
      url === "/currencies" ||
      url === "/locales" ||
      url === "/plans" ||
      url === "/fx-rates"
    ) {
      reply.header(
        "Cache-Control",
        "public, max-age=300, stale-while-revalidate=600",
      );
    } else if (
      url.startsWith("/auth/") ||
      url.startsWith("/me/") ||
      url.startsWith("/groups/") ||
      url.startsWith("/admin/")
    ) {
      reply.header("Cache-Control", "private, no-cache, must-revalidate");
    }
    return payload;
  });

  // === Request ID + tracing structuré (foundation pour OpenTelemetry) ===
  // Génère un ID unique par requête (ou réutilise X-Request-Id si fourni
  // par un upstream proxy). Loggué + injecté dans chaque log + retourné
  // au client dans X-Request-Id. Permet le tracing end-to-end :
  //   Client console → Network tab → Server logs (par requestId).
  app.addHook("onRequest", async (req, reply) => {
    const incoming = req.headers["x-request-id"];
    const reqId =
      typeof incoming === "string" && /^[a-zA-Z0-9_-]{6,80}$/.test(incoming)
        ? incoming
        : generateRequestId();
    (req as any).reqId = reqId;
    reply.header("X-Request-Id", reqId);
    // Annotation du logger pino par requête (chaque log de cette req
    // hérite automatiquement du reqId via req.log.child)
    if (req.log) {
      (req as any).log = req.log.child({ reqId });
    }
  });

  // Log structuré de chaque requête : méthode, URL, status, durée.
  // Pas trop verbeux : on log seulement onResponse (pas onRequest) pour
  // éviter de dédoubler. Filtre /health et /metrics pour ne pas pollluer.
  app.addHook("onResponse", async (req, reply) => {
    const url = req.url.split("?")[0];
    if (url === "/health" || url === "/metrics") return;
    const responseTime = reply.elapsedTime ?? 0;
    const reqLog = (req as any).log ?? app.log;
    reqLog.info(
      {
        method: req.method,
        url,
        status: reply.statusCode,
        ms: Math.round(responseTime),
      },
      "request",
    );
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  // Pour l'upload d'images de tickets (M14 OCR)
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 Mo max
      files: 1,
    },
  });

  app.decorate("authenticate", async function (req: any, _reply: any) {
    // Permet à certaines routes d'opt-out de l'auth via { config: { skipAuth: true } }
    if (req.routeOptions?.config?.skipAuth) return;
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    await req.jwtVerify();
    await assertSessionActive(req.user, token);
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Invalid request body",
        details: err.flatten(),
      });
    }
    if ((err as any).statusCode === 401) {
      return reply.code(401).send({
        error: "unauthorized",
        message: err.message ?? "Authentication required",
      });
    }
    app.log.error({ err }, "Unhandled error");
    return reply.code(500).send({
      error: "internal",
      message: "Internal server error",
    });
  });

  /**
   * GET /health (spec §9.2)
   * Healthcheck léger pour load-balancers / monitoring (Datadog, UptimeRobot…).
   * Vérifie : DB ping, scheduler jobs, mémoire process. Retourne 200 si OK,
   * 503 si la DB est inaccessible.
   */
  app.get("/health", async (_req, reply) => {
    const start = Date.now();
    let dbOk = true;
    let dbLatencyMs = 0;
    try {
      const t0 = Date.now();
      // Ping minimaliste : compte les users (cheap, indexé)
      await (await import("./lib/db.js")).prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
    } catch {
      dbOk = false;
    }
    const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptimeSec = Math.round(process.uptime());
    const body = {
      status: dbOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        db: dbOk ? "ok" : "fail",
        dbLatencyMs,
      },
      process: {
        memoryMb: memMb,
        uptimeSec,
        nodeVersion: process.version,
      },
      responseTimeMs: Date.now() - start,
    };
    return reply.code(dbOk ? 200 : 503).send(body);
  });

  /**
   * GET /metrics
   * Métriques basiques pour Prometheus / scraping. Format texte simple.
   * Utile pour les graphes long-terme (latence DB, RAM, scheduler runs).
   */
  app.get("/metrics", async () => {
    const { prisma } = await import("./lib/db.js");
    const { getSchedulerStatus } = await import("./lib/scheduler.js");
    const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptimeSec = Math.round(process.uptime());
    let userCount = 0;
    try {
      userCount = await prisma.user.count();
    } catch {
      /* ignore */
    }
    const jobs = getSchedulerStatus();
    const lines = [
      "# HELP bmd_uptime_seconds API process uptime",
      "# TYPE bmd_uptime_seconds counter",
      `bmd_uptime_seconds ${uptimeSec}`,
      "# HELP bmd_heap_used_bytes Node heap used",
      "# TYPE bmd_heap_used_bytes gauge",
      `bmd_heap_used_bytes ${memMb * 1024 * 1024}`,
      "# HELP bmd_users_total Number of users in DB",
      "# TYPE bmd_users_total gauge",
      `bmd_users_total ${userCount}`,
      "# HELP bmd_scheduler_runs Total scheduler runs",
      "# TYPE bmd_scheduler_runs counter",
      ...jobs.map(
        (j) =>
          `bmd_scheduler_runs{job="${j.name}"} ${j.totalRuns}\nbmd_scheduler_errors{job="${j.name}"} ${j.totalErrors}`,
      ),
    ];
    return lines.join("\n") + "\n";
  });

  // Mount module routes
  await app.register(authRoutes);
  await app.register(passkeyRoutes);
  await app.register(groupsRoutes);
  await app.register(expensesRoutes);
  await app.register(settlementsRoutes);
  await app.register(tontinesRoutes);
  await app.register(debtSwapsRoutes);
  await app.register(splitPresetsRoutes);
  await app.register(ocrRoutes);
  await app.register(voiceRoutes);
  await app.register(adminRoutes);
  await app.register(attachmentsRoutes);
  await app.register(notificationsRoutes);
  await app.register(debtTransfersRoutes);
  await app.register(expenseItemsRoutes);
  await app.register(realtimeRoutes);
  await app.register(fxRoutes);
  await app.register(pushRoutes);
  await app.register(gdprRoutes);
  await app.register(suggestionsRoutes);
  await app.register(whatsappRoutes);
  await app.register(paymentProvidersRoutes);
  await app.register(statsRoutes);
  await app.register(promosRoutes);
  await app.register(simSwapRoutes);
  await app.register(paymentMethodsRoutes);
  await app.register(cmsRoutes);
  await app.register(affiliateRoutes);
  await app.register(paymentsRoutes);
  await app.register(exportsRoutes);
  await app.register(aiRoutes);
  await app.register(meetingsRoutes);
  await app.register(searchRoutes);
  await app.register(partnersRoutes);
  await app.register(adsRoutes);
  await app.register(npsRoutes);

  return app;
}
