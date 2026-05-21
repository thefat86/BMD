/**
 * Routes Partners (spec §6.10).
 *
 * Deux ensembles de routes :
 *
 * 1. **Routes admin BMD** (auth user JWT) — pour gérer ses tokens et webhooks :
 *    POST   /me/api-tokens
 *    GET    /me/api-tokens
 *    DELETE /me/api-tokens/:id
 *    POST   /me/api-tokens/:id/webhooks
 *    GET    /me/api-tokens/:id/webhooks
 *    DELETE /webhooks/:id
 *
 * 2. **Routes API publique** (auth Bearer PartnerApiToken) — pour les
 *    intégrations tierces qui consomment l'API BMD :
 *    GET /api/v1/groups
 *    GET /api/v1/groups/:id
 *    GET /api/v1/groups/:id/expenses
 *    GET /api/v1/groups/:id/balance
 *    GET /api/v1/me/stats
 *
 * Format de réponse stable (versionné) — on s'engage à ne pas casser le
 * shape sans bumper /api/v2.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import {
  ALLOWED_SCOPES,
  assertScope,
  createApiToken,
  createWebhook,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
  type Scope,
} from "./partners.service.js";

declare module "fastify" {
  interface FastifyRequest {
    partner?: {
      // `id` du PartnerApiToken (renvoyé par verifyApiToken)
      id: string;
      name: string;
      scopes: string[];
      createdById: string;
    };
  }
}

export async function partnersRoutes(app: FastifyInstance): Promise<void> {
  // ============================================================
  // ROUTES USER — gestion de ses tokens et webhooks
  // ============================================================

  app.post(
    "/me/api-tokens",
    { onRequest: [app.authenticate] },
    async (req) => {
      const body = z
        .object({
          name: z.string().min(1).max(80),
          scopes: z.array(z.string()).min(1),
          expiresAt: z.string().datetime().optional(),
        })
        .parse(req.body);
      const r = await createApiToken({
        name: body.name,
        scopes: body.scopes,
        createdById: req.user.sub,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
      return r; // { token, id, prefix, scopes } — on retourne `token` UNE FOIS
    },
  );

  app.get(
    "/me/api-tokens",
    { onRequest: [app.authenticate] },
    async (req) => {
      const items = await listApiTokens({ createdById: req.user.sub });
      return items.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.tokenPrefix,
        scopes: Array.isArray(t.scopes) ? (t.scopes as string[]) : [],
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt?.toISOString() ?? null,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        lastUsedIp: t.lastUsedIp,
        revokedAt: t.revokedAt?.toISOString() ?? null,
      }));
    },
  );

  app.delete(
    "/me/api-tokens/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await revokeApiToken({ id, actorUserId: req.user.sub });
      return reply.code(204).send();
    },
  );

  app.post(
    "/me/api-tokens/:id/webhooks",
    { onRequest: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          url: z.string().url(),
          events: z.array(z.string().min(1)).min(1),
        })
        .parse(req.body);
      // Vérifie ownership du token
      const tok = await prisma.partnerApiToken.findUnique({
        where: { id },
      });
      if (!tok || tok.createdById !== req.user.sub) {
        throw Errors.notFound("Token introuvable");
      }
      const wh = await createWebhook({
        tokenId: id,
        url: body.url,
        events: body.events,
      });
      return {
        id: wh.id,
        url: wh.url,
        events: body.events,
        // Le secret est retourné UNE SEULE FOIS — le partenaire doit le sauver
        // pour vérifier les signatures HMAC SHA-256 reçues.
        secret: wh.secret,
        createdAt: wh.createdAt.toISOString(),
      };
    },
  );

  app.get(
    "/me/api-tokens/:id/webhooks",
    { onRequest: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const tok = await prisma.partnerApiToken.findUnique({ where: { id } });
      if (!tok || tok.createdById !== req.user.sub) {
        throw Errors.notFound("Token introuvable");
      }
      const items = await prisma.partnerWebhook.findMany({
        where: { tokenId: id },
        orderBy: { createdAt: "desc" },
      });
      return items.map((w) => ({
        id: w.id,
        url: w.url,
        events: Array.isArray(w.events) ? (w.events as string[]) : [],
        lastDeliveryAt: w.lastDeliveryAt?.toISOString() ?? null,
        lastStatus: w.lastStatus,
        failureCount: w.failureCount,
        disabled: w.disabled,
        createdAt: w.createdAt.toISOString(),
      }));
    },
  );

  app.delete(
    "/webhooks/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const wh = await prisma.partnerWebhook.findUnique({
        where: { id },
        include: { token: true },
      });
      if (!wh || wh.token.createdById !== req.user.sub) {
        throw Errors.notFound("Webhook introuvable");
      }
      await prisma.partnerWebhook.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  /**
   * GET /me/api-tokens/scopes
   * Liste les scopes disponibles (utile pour l'UI de création de token).
   */
  app.get(
    "/me/api-tokens/scopes",
    { onRequest: [app.authenticate] },
    async () => {
      return { scopes: ALLOWED_SCOPES };
    },
  );

  // ============================================================
  // API PUBLIQUE v1 — auth via Bearer PartnerApiToken
  // ============================================================

  // Hook Bearer auth pour toutes les routes /api/v1/*
  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith("/api/v1/")) return;
    const auth = req.headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) {
      throw Errors.unauthorized("Header `Authorization: Bearer <token>` requis");
    }
    const token = auth.slice("Bearer ".length).trim();
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.ip;
    const partner = await verifyApiToken(token, ip);
    req.partner = partner;
  });

  function requirePartner(req: FastifyRequest) {
    if (!req.partner) {
      throw Errors.unauthorized("Auth API publique manquante");
    }
    return req.partner;
  }

  /**
   * GET /api/v1/groups
   * Liste des groupes auquel le créateur du token appartient.
   * Scope requis : groups:read
   */
  app.get("/api/v1/groups", async (req) => {
    const p = requirePartner(req);
    assertScope(p.scopes, "groups:read");
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: p.createdById } } },
      select: {
        id: true,
        name: true,
        type: true,
        defaultCurrency: true,
        createdAt: true,
        _count: {
          select: { members: true, expenses: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: groups.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        currency: g.defaultCurrency,
        memberCount: g._count.members,
        expenseCount: g._count.expenses,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  });

  /**
   * GET /api/v1/groups/:id
   * Détails d'un groupe (le créateur du token doit y être membre).
   * Scope requis : groups:read
   */
  app.get("/api/v1/groups/:id", async (req) => {
    const p = requirePartner(req);
    assertScope(p.scopes, "groups:read");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const g = await prisma.group.findFirst({
      where: {
        id,
        members: { some: { userId: p.createdById } },
      },
      include: {
        members: {
          select: {
            user: { select: { id: true, displayName: true } },
            role: true,
            joinedAt: true,
          },
        },
      },
    });
    if (!g) throw Errors.notFound("Groupe introuvable");
    return {
      data: {
        id: g.id,
        name: g.name,
        type: g.type,
        currency: g.defaultCurrency,
        members: g.members.map((m) => ({
          id: m.user.id,
          displayName: m.user.displayName,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        })),
        createdAt: g.createdAt.toISOString(),
      },
    };
  });

  /**
   * GET /api/v1/groups/:id/expenses?limit=50&offset=0
   * Liste des dépenses du groupe, paginée.
   * Scope requis : expenses:read
   */
  app.get("/api/v1/groups/:id/expenses", async (req) => {
    const p = requirePartner(req);
    assertScope(p.scopes, "expenses:read");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    // Vérifie membership
    const member = await prisma.groupMember.findFirst({
      where: { groupId: id, userId: p.createdById },
    });
    if (!member) throw Errors.notFound("Groupe introuvable");
    const [items, total] = await Promise.all([
      prisma.expense.findMany({
        where: { groupId: id },
        orderBy: { occurredAt: "desc" },
        take: q.limit,
        skip: q.offset,
        select: {
          id: true,
          description: true,
          amount: true,
          currency: true,
          occurredAt: true,
          splitMode: true,
          category: true,
          paidBy: { select: { id: true, displayName: true } },
        },
      }),
      prisma.expense.count({ where: { groupId: id } }),
    ]);
    return {
      data: items.map((e) => ({
        id: e.id,
        description: e.description,
        amount: e.amount.toString(),
        currency: e.currency,
        occurredAt: e.occurredAt.toISOString(),
        splitMode: e.splitMode,
        category: e.category,
        paidBy: { id: e.paidBy.id, displayName: e.paidBy.displayName },
      })),
      pagination: { total, limit: q.limit, offset: q.offset },
    };
  });

  /**
   * GET /api/v1/me/stats
   * Stats agrégées du créateur du token (groupes, dépenses totales, balance).
   * Scope requis : stats:read
   */
  app.get("/api/v1/me/stats", async (req) => {
    const p = requirePartner(req);
    assertScope(p.scopes, "stats:read");
    const [groupCount, expenseCount, expenseSum] = await Promise.all([
      prisma.groupMember.count({ where: { userId: p.createdById } }),
      prisma.expense.count({ where: { paidById: p.createdById } }),
      prisma.expense.aggregate({
        where: { paidById: p.createdById },
        _sum: { amount: true },
      }),
    ]);
    return {
      data: {
        groupCount,
        expensesPaidCount: expenseCount,
        totalPaidByCurrency: expenseSum._sum.amount?.toString() ?? "0",
      },
    };
  });
}
