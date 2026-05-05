import type { FastifyInstance } from "fastify";
import { z } from "zod";
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
}
