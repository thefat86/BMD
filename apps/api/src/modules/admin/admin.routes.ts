import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import {
  assertSuperAdmin,
  getStats,
  getUserDetails,
  listGroupsAdmin,
  listUsers,
  recentActivity,
  suspendUser,
  unsuspendUser,
} from "./admin.service.js";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Toutes les routes nécessitent à la fois auth + super admin
  app.addHook("onRequest", app.authenticate);
  app.addHook("onRequest", async (req) => {
    await assertSuperAdmin(req.user.sub);
  });

  /**
   * GET /admin/stats
   * Statistiques globales de la plateforme.
   */
  app.get("/admin/stats", async () => {
    const stats = await getStats();
    return stats;
  });

  /**
   * GET /admin/users?query=&limit=50&offset=0
   */
  app.get("/admin/users", async (req) => {
    const query = z
      .object({
        query: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.query);

    const result = await listUsers(query);
    return {
      items: result.items.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        avatar: u.avatar,
        defaultCurrency: u.defaultCurrency,
        defaultLocale: u.defaultLocale,
        isSuperAdmin: u.isSuperAdmin,
        suspendedAt: u.suspendedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        contacts: u.contacts,
        counts: u._count,
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  });

  /**
   * GET /admin/users/:id
   */
  app.get("/admin/users/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = await getUserDetails(id);
    return {
      id: u.id,
      displayName: u.displayName,
      avatar: u.avatar,
      defaultCurrency: u.defaultCurrency,
      defaultLocale: u.defaultLocale,
      isSuperAdmin: u.isSuperAdmin,
      suspendedAt: u.suspendedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      contacts: u.contacts,
      activeSessions: u.sessions.map((s) => ({
        id: s.id,
        device: s.device,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
      groups: u.groupMemberships.map((m) => ({
        id: m.group.id,
        name: m.group.name,
        type: m.group.type,
        role: m.role,
      })),
      counts: u._count,
    };
  });

  /**
   * POST /admin/users/:id/suspend
   */
  app.post("/admin/users/:id/suspend", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return suspendUser(id);
  });

  /**
   * POST /admin/users/:id/unsuspend
   */
  app.post("/admin/users/:id/unsuspend", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return unsuspendUser(id);
  });

  /**
   * GET /admin/groups?limit=50&offset=0
   */
  app.get("/admin/groups", async (req) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.query);
    const result = await listGroupsAdmin(query);
    return {
      items: result.items.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        defaultCurrency: g.defaultCurrency,
        createdAt: g.createdAt.toISOString(),
        admin: g.members[0]?.user ?? null,
        counts: g._count,
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  });

  /**
   * GET /admin/activity
   */
  app.get("/admin/activity", async () => {
    const a = await recentActivity(30);
    // Fusionner et trier par date
    const all = [...a.users, ...a.expenses, ...a.swaps].sort(
      (x, y) => y.at.getTime() - x.at.getTime(),
    );
    return all.slice(0, 30).map((e) => ({
      kind: e.kind,
      at: e.at.toISOString(),
      label: e.label,
      id: e.id,
    }));
  });

  /**
   * GET /admin/plans
   * Liste les plans tarifaires (spec §6.3).
   * Inclut le nombre d'utilisateurs sur chaque plan.
   */
  app.get("/admin/plans", async () => {
    const plans = await prisma.plan.findMany({
      orderBy: { displayOrder: "asc" },
    });
    // Compteur d'utilisateurs par plan
    const counts = await prisma.user.groupBy({
      by: ["planCode"],
      _count: { _all: true },
    });
    const countByCode = Object.fromEntries(
      counts.map((c) => [c.planCode, c._count._all]),
    );
    return plans.map((p) => ({
      ...p,
      priceCents: p.priceCents,
      priceCentsYearly: p.priceCentsYearly,
      userCount: countByCode[p.code] ?? 0,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  });

  /**
   * PATCH /admin/plans/:code
   * Met à jour un plan : prix, limites JSON, description, état actif.
   * Spec §6.3 : "Toute modification est appliquée en temps réel".
   */
  app.patch("/admin/plans/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        priceCents: z.number().int().min(0).optional(),
        priceCentsYearly: z.number().int().min(0).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        limits: z.record(z.any()).optional(),
        isActive: z.boolean().optional(),
        displayOrder: z.number().int().optional(),
      })
      .parse(req.body);
    return prisma.plan.update({
      where: { code },
      data: body as any,
    });
  });

  /**
   * POST /admin/plans (spec §6.3 : "Tout est configurable")
   * Crée un nouveau plan tarifaire personnalisé. Le code est unique,
   * en MAJUSCULES, sans espaces. Les limites sont du JSON libre.
   */
  app.post("/admin/plans", async (req) => {
    const body = z
      .object({
        code: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[A-Z0-9_]+$/, "Code en majuscules, chiffres ou _ uniquement"),
        name: z.string().min(1).max(80),
        priceCents: z.number().int().min(0).default(0),
        priceCentsYearly: z.number().int().min(0).nullable().optional(),
        description: z.string().max(500).optional(),
        limits: z.record(z.any()).default({}),
        displayOrder: z.number().int().default(99),
      })
      .parse(req.body);
    return prisma.plan.create({ data: body as any });
  });

  /**
   * DELETE /admin/plans/:code
   * Supprime un plan. Refusé si des utilisateurs sont encore dessus
   * (l'admin doit d'abord les migrer vers un autre plan).
   */
  app.delete("/admin/plans/:code", async (req, reply) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    // Refuse si des users sont sur ce plan
    const usersOnPlan = await prisma.user.count({
      where: { planCode: code },
    });
    if (usersOnPlan > 0) {
      return reply.code(409).send({
        error: "plan_has_users",
        message: `Impossible : ${usersOnPlan} utilisateur(s) encore sur ce plan. Migre-les d'abord.`,
      });
    }
    // Refuse si c'est le plan FREE par défaut (ne jamais le supprimer)
    if (code === "FREE") {
      return reply.code(409).send({
        error: "default_plan",
        message: "Le plan FREE par défaut ne peut pas être supprimé.",
      });
    }
    await prisma.plan.delete({ where: { code } });
    return reply.code(204).send();
  });

  /**
   * POST /admin/users/:id/change-plan
   * Change le plan d'un utilisateur (admin only).
   */
  app.post("/admin/users/:id/change-plan", async (req) => {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const { planCode } = z
      .object({ planCode: z.string().min(1).max(40) })
      .parse(req.body);
    // Vérif plan existe
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new Error("Plan introuvable");
    }
    return prisma.user.update({
      where: { id },
      data: { planCode },
      select: { id: true, displayName: true, planCode: true },
    });
  });

  /* ===== Rôles admin custom (spec §6.10) ===== */

  /** Liste les rôles admin custom + leurs permissions. */
  app.get("/admin/roles", async () => {
    const roles = await prisma.adminRole.findMany({
      orderBy: { code: "asc" },
    });
    return roles.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });

  /** Crée un nouveau rôle admin custom. */
  app.post("/admin/roles", async (req) => {
    const body = z
      .object({
        code: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[A-Z0-9_]+$/, "Code en majuscules / chiffres / _"),
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional(),
        permissions: z.record(z.array(z.string())).default({}),
      })
      .parse(req.body);
    return prisma.adminRole.create({ data: body as any });
  });

  /** Met à jour un rôle admin (permissions, nom, description). */
  app.patch("/admin/roles/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(500).nullable().optional(),
        permissions: z.record(z.array(z.string())).optional(),
      })
      .parse(req.body);
    return prisma.adminRole.update({
      where: { code },
      data: body as any,
    });
  });

  /** Supprime un rôle admin (refus si users assignés). */
  app.delete("/admin/roles/:code", async (req, reply) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    const usersOnRole = await prisma.user.count({
      where: { adminRoleCode: code },
    });
    if (usersOnRole > 0) {
      return reply.code(409).send({
        error: "role_has_users",
        message: `Impossible : ${usersOnRole} utilisateur(s) ont ce rôle. Réassigne-les d'abord.`,
      });
    }
    await prisma.adminRole.delete({ where: { code } });
    return reply.code(204).send();
  });

  /** Assigne un rôle admin à un utilisateur. */
  app.post("/admin/users/:id/admin-role", async (req) => {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const { roleCode } = z
      .object({ roleCode: z.string().min(1).max(40).nullable() })
      .parse(req.body);
    if (roleCode !== null) {
      const role = await prisma.adminRole.findUnique({
        where: { code: roleCode },
      });
      if (!role) throw new Error("Rôle introuvable");
    }
    return prisma.user.update({
      where: { id },
      data: { adminRoleCode: roleCode },
      select: {
        id: true,
        displayName: true,
        adminRoleCode: true,
      },
    });
  });

  /* ===== Module Publicités (spec §6.4) ===== */

  /**
   * GET /admin/ads-config — config singleton (créée à la volée si absente).
   */
  app.get("/admin/ads-config", async () => {
    const existing = await prisma.adsConfig.findUnique({
      where: { id: "default" },
    });
    if (existing) return existing;
    return prisma.adsConfig.create({ data: { id: "default" } });
  });

  /**
   * PATCH /admin/ads-config — modifie la config publicités.
   */
  app.patch("/admin/ads-config", async (req) => {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        enabledNetworks: z.array(z.string()).optional(),
        allowedCategories: z.array(z.string()).optional(),
        blockedCategories: z.array(z.string()).optional(),
        maxPerUserPerDay: z.number().int().min(0).max(50).optional(),
        interstitialEverySessions: z.number().int().min(1).max(100).optional(),
        enabledFormats: z.array(z.string()).optional(),
      })
      .parse(req.body);
    return prisma.adsConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...(body as any) },
      update: body as any,
    });
  });
}
