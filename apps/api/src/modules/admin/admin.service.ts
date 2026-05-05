import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

/**
 * MODULE D · CONSOLE ADMIN (back-office)
 *
 * Service réservé aux super admins. Permet de :
 *  - Voir les statistiques globales de l'app
 *  - Lister / inspecter / suspendre des utilisateurs
 *  - Lister / inspecter des groupes
 *  - Voir l'activité récente
 */

// ============================================================
// AUTORISATION
// ============================================================

export async function assertSuperAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true, suspendedAt: true },
  });
  if (!user) throw Errors.notFound("User not found");
  if (user.suspendedAt) throw Errors.forbidden("Account suspended");
  if (!user.isSuperAdmin) {
    throw Errors.forbidden("Super admin access required");
  }
}

// ============================================================
// STATISTIQUES GLOBALES
// ============================================================

export interface AdminStats {
  users: {
    total: number;
    active: number;
    suspended: number;
    superAdmins: number;
    last7Days: number;
  };
  contacts: {
    verified: number;
    unverified: number;
  };
  groups: {
    total: number;
    byType: Record<string, number>;
  };
  expenses: {
    total: number;
    last7Days: number;
    totalVolume: string;
  };
  tontines: {
    total: number;
    active: number;
    completed: number;
  };
  swaps: {
    total: number;
    accepted: number;
    proposed: number;
  };
  sessions: {
    active: number;
  };
}

export async function getStats(): Promise<AdminStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    usersTotal,
    usersSuspended,
    usersSuperAdmins,
    usersLast7Days,
    contactsVerified,
    contactsUnverified,
    groupsTotal,
    groupsByType,
    expensesTotal,
    expensesLast7Days,
    expensesAgg,
    tontinesAll,
    swapsAll,
    sessionsActive,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count({ where: { isSuperAdmin: true } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.userContact.count({ where: { isVerified: true } }),
    prisma.userContact.count({ where: { isVerified: false } }),
    prisma.group.count(),
    prisma.group.groupBy({ by: ["type"], _count: true }),
    prisma.expense.count(),
    prisma.expense.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.tontine.findMany({ select: { status: true } }),
    prisma.debtSwap.findMany({ select: { status: true } }),
    prisma.session.count({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);

  const byTypeMap: Record<string, number> = {};
  for (const row of groupsByType) {
    byTypeMap[row.type] = row._count;
  }

  return {
    users: {
      total: usersTotal,
      active: usersTotal - usersSuspended,
      suspended: usersSuspended,
      superAdmins: usersSuperAdmins,
      last7Days: usersLast7Days,
    },
    contacts: {
      verified: contactsVerified,
      unverified: contactsUnverified,
    },
    groups: {
      total: groupsTotal,
      byType: byTypeMap,
    },
    expenses: {
      total: expensesTotal,
      last7Days: expensesLast7Days,
      totalVolume: expensesAgg._sum.amount?.toString() ?? "0",
    },
    tontines: {
      total: tontinesAll.length,
      active: tontinesAll.filter((t) => t.status === "ACTIVE").length,
      completed: tontinesAll.filter((t) => t.status === "COMPLETED").length,
    },
    swaps: {
      total: swapsAll.length,
      accepted: swapsAll.filter((s) => s.status === "ACCEPTED").length,
      proposed: swapsAll.filter((s) => s.status === "PROPOSED").length,
    },
    sessions: {
      active: sessionsActive,
    },
  };
}

// ============================================================
// USERS
// ============================================================

export async function listUsers(opts: {
  query?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;

  const where = opts.query
    ? {
        OR: [
          { displayName: { contains: opts.query, mode: "insensitive" as const } },
          {
            contacts: {
              some: {
                value: { contains: opts.query, mode: "insensitive" as const },
              },
            },
          },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        contacts: {
          select: { type: true, value: true, isPrimary: true, isVerified: true },
          orderBy: { isPrimary: "desc" },
        },
        _count: {
          select: {
            groupMemberships: true,
            expensesPaid: true,
            sessions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, limit, offset };
}

export async function getUserDetails(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      contacts: true,
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      groupMemberships: {
        include: {
          group: { select: { id: true, name: true, type: true } },
        },
      },
      _count: {
        select: {
          expensesPaid: true,
          expenseShares: true,
          tontineContributions: true,
        },
      },
    },
  });
  if (!user) throw Errors.notFound("User not found");
  return user;
}

export async function suspendUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound();
  if (user.isSuperAdmin) {
    throw Errors.forbidden("Cannot suspend a super admin");
  }

  // Suspendre + révoquer toutes les sessions actives
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { suspendedAt: new Date() },
    }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { suspended: true };
}

export async function unsuspendUser(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { suspendedAt: null },
  });
  return { suspended: false };
}

// ============================================================
// GROUPES
// ============================================================

export async function listGroupsAdmin(opts: {
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;

  const [items, total] = await Promise.all([
    prisma.group.findMany({
      include: {
        _count: {
          select: { members: true, expenses: true, settlements: true },
        },
        members: {
          where: { role: "ADMIN" },
          take: 1,
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.group.count(),
  ]);

  return { items, total, limit, offset };
}

// ============================================================
// ACTIVITÉ RÉCENTE
// ============================================================

export async function recentActivity(limit = 20) {
  const [users, expenses, swaps] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, displayName: true, createdAt: true },
    }),
    prisma.expense.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        createdAt: true,
        paidBy: { select: { displayName: true } },
        group: { select: { name: true } },
      },
    }),
    prisma.debtSwap.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        totalSavedAmount: true,
        createdAt: true,
        group: { select: { name: true } },
      },
    }),
  ]);

  return {
    users: users.map((u) => ({
      kind: "user_signup" as const,
      at: u.createdAt,
      label: `${u.displayName} a rejoint BMD`,
      id: u.id,
    })),
    expenses: expenses.map((e) => ({
      kind: "expense" as const,
      at: e.createdAt,
      label: `${e.paidBy.displayName} a payé ${e.amount.toString()} ${e.currency} pour « ${e.description} » dans « ${e.group.name} »`,
      id: e.id,
    })),
    swaps: swaps.map((s) => ({
      kind: "swap" as const,
      at: s.createdAt,
      label: `Swap ${s.status.toLowerCase()} dans « ${s.group.name} » · ${s.totalSavedAmount.toString()} économisés`,
      id: s.id,
    })),
  };
}
