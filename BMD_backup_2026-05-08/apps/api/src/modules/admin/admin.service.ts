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
// TIMESERIES (graphes du dashboard admin)
// ============================================================

export interface TimeseriesPoint {
  /** Date YYYY-MM-DD */
  date: string;
  /** Nouveaux signups ce jour */
  signups: number;
  /** Dépenses créées ce jour */
  expenses: number;
  /** Volume cumulé des dépenses ce jour (montant total, devise mixte) */
  volume: number;
  /** Nouveaux groupes créés ce jour */
  groups: number;
}

/**
 * Retourne une série temporelle des derniers `days` jours pour le dashboard
 * admin. Buckets quotidiens, calculés en mémoire à partir de findMany ciblés.
 *
 * Note perf : sur une grosse base, on remplacerait par une requête SQL avec
 * `date_trunc('day', created_at)` + GROUP BY. Pour le MVP, findMany avec
 * select strict suffit jusqu'à ~100k lignes.
 */
export async function getTimeseries(opts: {
  days?: number;
}): Promise<TimeseriesPoint[]> {
  // Plage étendue à 730 jours (~24 mois) pour spec §3.11.
  const days = Math.max(1, Math.min(730, opts.days ?? 14));
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [users, expenses, groups] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.expense.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, amount: true },
    }),
    prisma.group.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  // Initialise les buckets pour chaque jour
  const buckets = new Map<string, TimeseriesPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      signups: 0,
      expenses: 0,
      volume: 0,
      groups: 0,
    });
  }

  const dayOf = (d: Date) => d.toISOString().slice(0, 10);

  for (const u of users) {
    const k = dayOf(u.createdAt);
    const b = buckets.get(k);
    if (b) b.signups++;
  }
  for (const e of expenses) {
    const k = dayOf(e.createdAt);
    const b = buckets.get(k);
    if (b) {
      b.expenses++;
      b.volume += parseFloat(e.amount.toString()) || 0;
    }
  }
  for (const g of groups) {
    const k = dayOf(g.createdAt);
    const b = buckets.get(k);
    if (b) b.groups++;
  }

  return Array.from(buckets.values());
}

// ============================================================
// KPIs FINANCIERS (MRR, ARPU, churn)
// ============================================================

export interface FinancialKpis {
  /** Monthly Recurring Revenue — somme des plans mensualisés (centimes EUR pivot). */
  mrrCents: number;
  /** ARPU = MRR / nombre d'utilisateurs payants. 0 si aucun payant. */
  arpuCents: number;
  /** Nombre d'utilisateurs sur un plan payant. */
  payingUsers: number;
  /** Nombre total d'utilisateurs (pour calcul taux de conversion). */
  totalUsers: number;
  /** Taux de conversion paying / total, en %. */
  paidConversion: number;
  /** Churn rate des 30 derniers jours (% des payants en début de mois qui ont annulé). */
  churnRate30d: number;
  /** Annual Run Rate = MRR × 12. */
  arrCents: number;
  /** Répartition MRR par plan (code → centimes). */
  mrrByPlan: Record<string, number>;
}

/**
 * Calcule les KPIs financiers à partir de Plan + User.planCode.
 *
 * Note : l'implémentation est simple (priceCents × nb users). Pour un MRR
 * "Stripe-vrai", il faudrait croiser avec subscription.status et utiliser
 * le montant facturé réel (avec coupons, prorata). Ici on approxime via le
 * prix de base du plan.
 */
export async function getFinancialKpis(): Promise<FinancialKpis> {
  const [plans, usersByPlan, totalUsers] = await Promise.all([
    prisma.plan.findMany({
      where: { isActive: true },
      select: {
        code: true,
        priceCents: true,
        priceCentsYearly: true,
      },
    }),
    prisma.user.groupBy({
      by: ["planCode"],
      _count: { _all: true },
      where: { suspendedAt: null },
    }),
    prisma.user.count({ where: { suspendedAt: null } }),
  ]);

  const plansByCode = new Map<
    string,
    { priceCents: number; priceCentsYearly: number | null }
  >();
  for (const p of plans) {
    plansByCode.set(p.code, {
      priceCents: p.priceCents,
      priceCentsYearly: p.priceCentsYearly,
    });
  }

  let mrrCents = 0;
  let payingUsers = 0;
  const mrrByPlan: Record<string, number> = {};

  for (const row of usersByPlan) {
    const plan = plansByCode.get(row.planCode);
    if (!plan) continue;
    if (plan.priceCents === 0) continue; // FREE
    const count = row._count._all;
    const cents = plan.priceCents * count;
    mrrCents += cents;
    payingUsers += count;
    mrrByPlan[row.planCode] = cents;
  }

  // Churn 30j : on regarde combien de SubscriptionState sont passés en
  // CANCELLED ou DOWNGRADED dans les 30 derniers jours, comparé au nombre
  // d'abonnements actifs il y a 30 jours.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cancelled30d = await prisma.subscriptionState.count({
    where: {
      OR: [{ status: "CANCELLED" }, { status: "DOWNGRADED" }],
      updatedAt: { gte: thirtyDaysAgo },
    },
  });
  const activeNow = await prisma.subscriptionState.count({
    where: { status: "ACTIVE" },
  });
  const baseAtStart = activeNow + cancelled30d;
  const churnRate30d =
    baseAtStart > 0
      ? Math.round((cancelled30d / baseAtStart) * 1000) / 10
      : 0;

  return {
    mrrCents,
    arpuCents: payingUsers > 0 ? Math.round(mrrCents / payingUsers) : 0,
    payingUsers,
    totalUsers,
    paidConversion:
      totalUsers > 0
        ? Math.round((payingUsers / totalUsers) * 1000) / 10
        : 0,
    churnRate30d,
    arrCents: mrrCents * 12,
    mrrByPlan,
  };
}

// ============================================================
// COHORT RETENTION (rétention par semaine d'inscription)
// ============================================================

export interface CohortRow {
  /** Semaine d'inscription (lundi 00:00 UTC), format YYYY-MM-DD */
  cohortWeek: string;
  /** Taille de la cohorte (nombre de signups cette semaine-là) */
  size: number;
  /**
   * Pourcentage de la cohorte revenu chaque semaine après l'inscription.
   * `retention[0]` = semaine 0 (= 100% par définition).
   * `retention[N]` = semaine N (% des users actifs N semaines après).
   *
   * "Actif" = a créé une expense, joined a group, ou émis un paiement.
   * On approxime via la dernière activité = updatedAt sur User
   * (mis à jour à chaque modification de profil ou activité métier).
   * Pour une mesure plus stricte, agréger sur ActivityLog par groupId
   * lié au user.
   */
  retention: number[];
}

export async function getCohortRetention(opts: {
  weeks?: number;
}): Promise<CohortRow[]> {
  const weeks = Math.max(2, Math.min(26, opts.weeks ?? 8));

  // Lundi 00:00 UTC de la semaine courante
  const now = new Date();
  const dow = now.getUTCDay() || 7; // 1=lun, 7=dim
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - (dow - 1));
  thisMonday.setUTCHours(0, 0, 0, 0);

  // Première cohorte = il y a `weeks - 1` semaines
  const firstCohort = new Date(thisMonday);
  firstCohort.setUTCDate(thisMonday.getUTCDate() - (weeks - 1) * 7);

  // Récupère tous les users inscrits depuis firstCohort
  const users = await prisma.user.findMany({
    where: { createdAt: { gte: firstCohort } },
    select: { id: true, createdAt: true },
  });

  // Pour chaque user, on cherche les ActivityLog (proxy d'activité réelle)
  // qui le concernent. Pour limiter le coût, on récupère les semaines où
  // chaque user a une activité.
  const userIds = users.map((u) => u.id);
  const activities =
    userIds.length === 0
      ? []
      : await prisma.activityLog.findMany({
          where: { actorId: { in: userIds }, createdAt: { gte: firstCohort } },
          select: { actorId: true, createdAt: true },
        });

  // Groupe chaque user → set des semaines où il a été actif
  const activeWeeksPerUser = new Map<string, Set<string>>();
  for (const a of activities) {
    if (!a.actorId) continue;
    const wk = mondayKey(a.createdAt);
    let set = activeWeeksPerUser.get(a.actorId);
    if (!set) {
      set = new Set();
      activeWeeksPerUser.set(a.actorId, set);
    }
    set.add(wk);
  }

  // Buckets cohortes
  const cohorts = new Map<string, { userIds: string[]; signupAt: Date }>();
  for (const u of users) {
    const key = mondayKey(u.createdAt);
    let c = cohorts.get(key);
    if (!c) {
      c = { userIds: [], signupAt: weekStart(u.createdAt) };
      cohorts.set(key, c);
    }
    c.userIds.push(u.id);
  }

  // Construit le tableau ordonné des cohortes (chronologique)
  const rows: CohortRow[] = [];
  for (
    let i = 0;
    i < weeks;
    i++
  ) {
    const cohortDate = new Date(firstCohort);
    cohortDate.setUTCDate(firstCohort.getUTCDate() + i * 7);
    const key = mondayKey(cohortDate);
    const c = cohorts.get(key);
    const size = c?.userIds.length ?? 0;
    const retention: number[] = [];
    // Pour chaque semaine après la cohorte, % de users actifs
    const cohortIndex = i;
    const remainingWeeks = weeks - cohortIndex;
    for (let j = 0; j < remainingWeeks; j++) {
      if (size === 0) {
        retention.push(0);
        continue;
      }
      if (j === 0) {
        retention.push(100); // semaine 0 = 100% par définition
        continue;
      }
      const targetWeek = new Date(cohortDate);
      targetWeek.setUTCDate(cohortDate.getUTCDate() + j * 7);
      const targetKey = mondayKey(targetWeek);
      const activeCount =
        c?.userIds.filter((uid) =>
          activeWeeksPerUser.get(uid)?.has(targetKey),
        ).length ?? 0;
      retention.push(Math.round((activeCount / size) * 1000) / 10);
    }
    rows.push({
      cohortWeek: key,
      size,
      retention,
    });
  }

  return rows;
}

/**
 * Renvoie la clé "lundi" YYYY-MM-DD d'une date.
 */
function mondayKey(d: Date): string {
  return weekStart(d).toISOString().slice(0, 10);
}

function weekStart(d: Date): Date {
  const dt = new Date(d);
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (dow - 1));
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

// ============================================================
// CONVERSION FUNNEL
// ============================================================

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** % par rapport à l'étape précédente (ou 100% pour la première) */
  conversionFromPrev: number;
  /** % par rapport à l'étape 0 (entonnoir global) */
  conversionFromTop: number;
}

/**
 * Conversion funnel : signups → vérification contact → 1er groupe →
 * 1ère dépense → 1er plan payant.
 *
 * Calculé sur les `days` derniers jours par défaut (sinon all-time).
 */
export async function getConversionFunnel(opts: {
  days?: number;
}): Promise<FunnelStep[]> {
  const since = opts.days
    ? (() => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - opts.days + 1);
        return d;
      })()
    : null;

  const userWhere = since ? { createdAt: { gte: since } } : {};

  // Étape 1 : signups
  const signups = await prisma.user.count({ where: userWhere });

  // Étape 2 : utilisateurs avec au moins 1 contact vérifié
  const verifiedUserIds = new Set<string>(
    (
      await prisma.userContact.findMany({
        where: {
          isVerified: true,
          user: userWhere,
        },
        select: { userId: true },
      })
    ).map((c) => c.userId),
  );

  // Étape 3 : utilisateurs avec >= 1 groupe (créé ou rejoint)
  const usersInGroups = new Set<string>(
    (
      await prisma.groupMember.findMany({
        where: { user: userWhere },
        select: { userId: true },
      })
    ).map((m) => m.userId),
  );

  // Étape 4 : utilisateurs ayant payé >= 1 dépense
  const usersWhoPaid = new Set<string>(
    (
      await prisma.expense.findMany({
        where: { paidBy: userWhere },
        select: { paidById: true },
        distinct: ["paidById"],
      })
    ).map((e) => e.paidById),
  );

  // Étape 5 : utilisateurs sur un plan payant (planCode != FREE)
  const usersPaidPlan = await prisma.user.count({
    where: {
      ...userWhere,
      planCode: { not: "FREE" },
    },
  });

  const counts = [
    { key: "signup", label: "Inscriptions", count: signups },
    {
      key: "verified",
      label: "Contact vérifié",
      count: verifiedUserIds.size,
    },
    {
      key: "first_group",
      label: "1er groupe",
      count: usersInGroups.size,
    },
    {
      key: "first_expense",
      label: "1ère dépense",
      count: usersWhoPaid.size,
    },
    {
      key: "paid_plan",
      label: "Plan payant",
      count: usersPaidPlan,
    },
  ];

  const top = counts[0].count || 1;
  const result: FunnelStep[] = counts.map((c, i) => {
    const prev = i === 0 ? c.count : counts[i - 1].count || 1;
    return {
      key: c.key,
      label: c.label,
      count: c.count,
      conversionFromPrev:
        i === 0 ? 100 : Math.round((c.count / prev) * 1000) / 10,
      conversionFromTop: Math.round((c.count / top) * 1000) / 10,
    };
  });
  return result;
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
