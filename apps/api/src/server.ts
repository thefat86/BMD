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
import { captureError, initSentry } from "./lib/sentry.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { passkeyRoutes } from "./modules/auth/passkey.routes.js";
import { groupsRoutes } from "./modules/groups/groups.routes.js";
// V97 — Routes invitations publiques (token lookup / accept / decline)
import { invitationsPublicRoutes } from "./modules/groups/invitations.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { settlementsRoutes } from "./modules/settlements/settlements.routes.js";
import { tontinesRoutes } from "./modules/tontines/tontines.routes.js";
import { debtSwapsRoutes } from "./modules/debt-swaps/debt-swaps.routes.js";
import { splitPresetsRoutes } from "./modules/split-presets/split-presets.routes.js";
import { ocrRoutes } from "./modules/ocr/ocr.routes.js";
import { voiceRoutes } from "./modules/voice/voice.routes.js";
import { boostersRoutes } from "./modules/boosters/boosters.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { attachmentsRoutes } from "./modules/attachments/attachments.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";
import { debtTransfersRoutes } from "./modules/debt-transfers/debt-transfers.routes.js";
// V149 — Module reconnaissance de dette (RDD)
import { debtsRoutes } from "./modules/debts/debts.routes.js";
import { yousignWebhookRoutes } from "./modules/webhooks/yousign-webhook.routes.js";
import { signaturePricingRoutes } from "./modules/debts/signature-pricing.routes.js";
import { debtBoostersRoutes } from "./modules/debts/debt-booster.routes.js";
// V163 — Logo personnalisé PDF (9,99 €/mois)
import { customLogoRoutes } from "./modules/custom-logo/custom-logo.routes.js";
// V164 — Module Commercial (Ambassadeurs + Commerciaux agréés + Messagerie réseau)
import { commercialsRoutes } from "./modules/commercials/commercials.routes.js";
// V155 — Lookup débiteur par contact + track record pour wizard RDD
import { debtorLookupRoutes } from "./modules/debts/debtor-lookup.routes.js";
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
// V234 — Identité officielle scannée par IA (RDD, contrats juridiques)
import { identityRoutes } from "./modules/identity/identity.routes.js";
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
// V176 — Web Vitals end-to-end (ingestion publique + dashboard admin)
import { metricsRoutes } from "./modules/metrics/metrics.routes.js";
import { metricsAdminRoutes } from "./modules/metrics/metrics-admin.routes.js";
// V200 — Caisses projet (Project Funds) — activable/désactivable via SiteConfig.projectFundsEnabled
import { projectFundsRoutes } from "./modules/project-funds/project-funds.routes.js";
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
  // V37 — Init Sentry au plus tôt (avant que la moindre route soit montée).
  // Idempotent + safe : no-op si SENTRY_DSN n'est pas set ou si NODE_ENV != production.
  await initSentry();
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
  //  - V182.A — Endpoints user "hot" (compteurs, soldes globaux) →
  //    `private, max-age=10, stale-while-revalidate=30` : la WebView
  //    Capacitor honore le cache HTTP → 0 roundtrip pendant 10s sur les
  //    badges/cloches/compteurs (sans risque de stale visible pour l'user).
  //  - Routes user sensibles (auth, /me, /groups, /admin) → `private,
  //    no-cache, must-revalidate` (toujours revalider via ETag)
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
      // V182.A — endpoints "hot" appelés au mount de chaque page mobile :
      // un cache court (10s) évite les rafales lors des back/forward rapides.
      url === "/notifications/unread-count" ||
      url === "/stats/global-balance" ||
      url === "/plan-limits"
    ) {
      reply.header(
        "Cache-Control",
        "private, max-age=10, stale-while-revalidate=30",
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
      // V91.A — Avant : "Invalid request body" générique → impossible pour
      // l'utilisateur (et même le dev) de savoir quel champ a échoué sans
      // ouvrir le tab Network. On expose le 1er issue dans `message` (champ
      // + cause) et on garde le détail Zod complet dans `details.fieldErrors`
      // pour les frontaux qui veulent afficher un récap par champ.
      const first = err.issues[0];
      const path = first?.path?.length ? first.path.join(".") : "(root)";
      const niceMessage = first
        ? `Champ « ${path} » : ${first.message}`
        : "Données de la requête invalides.";
      const flat = err.flatten();
      return reply.code(400).send({
        error: "validation_error",
        message: niceMessage,
        details: {
          tip: niceMessage,
          fieldErrors: flat.fieldErrors,
          formErrors: flat.formErrors,
        },
      });
    }
    if ((err as any).statusCode === 401) {
      // Fastify v5 type `err` comme `unknown` dans setErrorHandler — on narrow
      // via instanceof Error pour accéder à `.message` en safe.
      const msg =
        err instanceof Error ? err.message : "Authentication required";
      return reply.code(401).send({
        error: "unauthorized",
        message: msg ?? "Authentication required",
      });
    }
    app.log.error({ err }, "Unhandled error");
    // V37 — Sentry capture pour les 5xx réels (les 4xx AppError sont filtrés
    // dans beforeSend pour ne pas polluer le quota).
    captureError(err, {
      url: _req.url,
      method: _req.method,
    });
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
  // V97 — Routes publiques d'invitation (avant groupsRoutes qui auth tout)
  await app.register(invitationsPublicRoutes);
  await app.register(groupsRoutes);
  await app.register(expensesRoutes);
  await app.register(settlementsRoutes);
  await app.register(tontinesRoutes);
  await app.register(debtSwapsRoutes);
  // V149 — Module reconnaissance de dette (RDD)
  await app.register(debtsRoutes);
  // V150.C — Webhook Yousign (route publique, validation HMAC interne)
  await app.register(yousignWebhookRoutes);
  // V151 — Tarification signatures eIDAS par niveau × pays (admin + public)
  await app.register(signaturePricingRoutes);
  // V152.D — Packs Booster RDD (Sérénité + Affaires) Stripe Checkout
  await app.register(debtBoostersRoutes);
  // V163 — Logo personnalisé PDF (9,99 €/mois, paramétrable admin)
  await app.register(customLogoRoutes);
  // V164 — Module Commercial (3 phases : Ambassadeur, Occasionnel, Agréé)
  await app.register(commercialsRoutes);
  await app.register(debtorLookupRoutes);
  await app.register(splitPresetsRoutes);
  await app.register(ocrRoutes);
  await app.register(voiceRoutes);
  await app.register(boostersRoutes);
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
  // V234 — Identité officielle (RDD)
  await app.register(identityRoutes);
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
  // V176 — Web Vitals : ingestion publique + dashboard admin
  await app.register(metricsRoutes);
  await app.register(metricsAdminRoutes);
  // V200 — Caisses projet : routes gated par SiteConfig.projectFundsEnabled
  // (kill switch global). Quand désactivé, toutes les routes /project-funds/*
  // throw 404 immédiatement (sauf /project-funds/feature-gate qui renvoie
  // { enabled: false } pour permettre au front de masquer l'onglet).
  await app.register(projectFundsRoutes);

  return app;
}
