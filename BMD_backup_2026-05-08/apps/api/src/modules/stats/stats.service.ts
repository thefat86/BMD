/**
 * Service Stats utilisateur (spec §3.11).
 *
 * Calcule les statistiques globales d'un user à travers tous ses groupes :
 *  - Timeline des dépenses sur 6 / 12 / 24 mois
 *  - Top catégories par montant
 *  - Top payeurs sur les groupes où l'user est membre
 *  - Évolution du solde net
 *
 * Toutes les requêtes sont scopées aux groupes dont l'user est membre.
 * Les montants sont retournés dans la devise principale de l'user
 * (User.defaultCurrency) — conversion live FX si nécessaire.
 */
import { prisma } from "../../lib/db.js";
import { convert } from "../../lib/fx.js";

export type StatsRange = 6 | 12 | 24;

export interface StatsTimelinePoint {
  /** Période YYYY-MM */
  period: string;
  /** Total dépensé toutes catégories confondues, dans la devise de l'utilisateur */
  totalSpent: number;
  /** Mon solde net en fin de période (positif = on me doit) */
  myNet: number;
  /** Nombre de dépenses sur la période */
  expenseCount: number;
}

export interface CategoryBreakdown {
  category: string;
  totalAmount: number;
  expenseCount: number;
  percent: number;
}

export interface MemberContribution {
  userId: string;
  displayName: string;
  totalPaid: number;
  totalOwed: number;
  net: number;
  /** Nombre de dépenses payées par ce membre */
  expenseCount: number;
}

export interface UserStats {
  /** Devise dans laquelle tous les montants sont exprimés (devise principale du user) */
  currency: string;
  /** Période analysée (en mois) */
  rangeMonths: StatsRange;
  totalSpent: number;
  totalSettled: number;
  expenseCount: number;
  groupCount: number;
  myNet: number;
  /** Timeline mois par mois (ordre chronologique ascendant) */
  timeline: StatsTimelinePoint[];
  topCategories: CategoryBreakdown[];
  /** Mes top payeurs : ceux qui payent le plus dans mes groupes */
  topPayers: MemberContribution[];
}

/**
 * Convertit un montant en devise de l'utilisateur. Si la conversion échoue
 * (devise inconnue) on retourne 0 — on ne veut pas crasher le calcul.
 */
async function toUserCurrency(
  amount: number,
  fromCurrency: string,
  userCurrency: string,
): Promise<number> {
  if (fromCurrency === userCurrency) return amount;
  try {
    return await convert(amount, fromCurrency, userCurrency);
  } catch {
    return 0;
  }
}

/**
 * Calcule les stats globales pour un user.
 */
export async function computeUserStats(input: {
  userId: string;
  rangeMonths: StatsRange;
}): Promise<UserStats> {
  const userId = input.userId;
  const range = input.rangeMonths;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  const currency = user?.defaultCurrency ?? "EUR";

  // Période d'analyse
  const since = new Date();
  since.setMonth(since.getMonth() - range);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  // Tous mes group memberships
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) {
    return {
      currency,
      rangeMonths: range,
      totalSpent: 0,
      totalSettled: 0,
      expenseCount: 0,
      groupCount: 0,
      myNet: 0,
      timeline: [],
      topCategories: [],
      topPayers: [],
    };
  }

  // Récupère toutes les dépenses pertinentes (avec shares pour calcul net)
  const expenses = await prisma.expense.findMany({
    where: {
      groupId: { in: groupIds },
      occurredAt: { gte: since },
    },
    include: {
      shares: { select: { userId: true, amountOwed: true } },
      paidBy: { select: { id: true, displayName: true } },
    },
    orderBy: { occurredAt: "asc" },
  });

  // Conversion en devise utilisateur (en parallèle)
  const expenseAmounts = await Promise.all(
    expenses.map(async (e) => ({
      e,
      amountUserCurrency: await toUserCurrency(
        parseFloat(e.amount.toString()),
        e.currency,
        currency,
      ),
    })),
  );

  // === Timeline mensuelle ===
  const monthlyMap = new Map<
    string,
    { totalSpent: number; expenseCount: number; myShare: number; myPaid: number }
  >();
  for (const { e, amountUserCurrency } of expenseAmounts) {
    const key = `${e.occurredAt.getFullYear()}-${String(e.occurredAt.getMonth() + 1).padStart(2, "0")}`;
    let bucket = monthlyMap.get(key);
    if (!bucket) {
      bucket = { totalSpent: 0, expenseCount: 0, myShare: 0, myPaid: 0 };
      monthlyMap.set(key, bucket);
    }
    bucket.totalSpent += amountUserCurrency;
    bucket.expenseCount += 1;
    const myShareRow = e.shares.find((s) => s.userId === userId);
    if (myShareRow) {
      bucket.myShare += await toUserCurrency(
        parseFloat(myShareRow.amountOwed.toString()),
        e.currency,
        currency,
      );
    }
    if (e.paidById === userId) {
      bucket.myPaid += amountUserCurrency;
    }
  }

  // Comble les mois manquants à 0 + accumule le myNet
  const timeline: StatsTimelinePoint[] = [];
  let cumulativeNet = 0;
  const cursor = new Date(since);
  while (cursor <= new Date()) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthlyMap.get(key) ?? {
      totalSpent: 0,
      expenseCount: 0,
      myShare: 0,
      myPaid: 0,
    };
    cumulativeNet += bucket.myPaid - bucket.myShare;
    timeline.push({
      period: key,
      totalSpent: round2(bucket.totalSpent),
      expenseCount: bucket.expenseCount,
      myNet: round2(cumulativeNet),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // === Catégories ===
  const catMap = new Map<string, { total: number; count: number }>();
  for (const { e, amountUserCurrency } of expenseAmounts) {
    const cat = e.category ?? "autres";
    const cur = catMap.get(cat) ?? { total: 0, count: 0 };
    cur.total += amountUserCurrency;
    cur.count += 1;
    catMap.set(cat, cur);
  }
  const totalSpent = Array.from(catMap.values()).reduce((a, b) => a + b.total, 0);
  const topCategories: CategoryBreakdown[] = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      totalAmount: round2(v.total),
      expenseCount: v.count,
      percent:
        totalSpent > 0 ? Math.round((v.total / totalSpent) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 8);

  // === Top payeurs (toutes mes dépenses confondues) ===
  const payerMap = new Map<
    string,
    {
      displayName: string;
      paid: number;
      owed: number;
      count: number;
    }
  >();
  for (const { e, amountUserCurrency } of expenseAmounts) {
    let p = payerMap.get(e.paidById);
    if (!p) {
      p = { displayName: e.paidBy.displayName, paid: 0, owed: 0, count: 0 };
      payerMap.set(e.paidById, p);
    }
    p.paid += amountUserCurrency;
    p.count += 1;
    // owed pour ce user = somme de ses parts dans toutes les expenses
    const myShareInThis = e.shares.find((s) => s.userId === e.paidById);
    if (myShareInThis) {
      p.owed += await toUserCurrency(
        parseFloat(myShareInThis.amountOwed.toString()),
        e.currency,
        currency,
      );
    }
  }
  const topPayers: MemberContribution[] = Array.from(payerMap.entries())
    .map(([uid, v]) => ({
      userId: uid,
      displayName: v.displayName,
      totalPaid: round2(v.paid),
      totalOwed: round2(v.owed),
      net: round2(v.paid - v.owed),
      expenseCount: v.count,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 10);

  // === Total settled (règlements confirmés sur la période) ===
  const settlementsAgg = await prisma.settlement.findMany({
    where: {
      groupId: { in: groupIds },
      status: "CONFIRMED",
      confirmedByPayeeAt: { gte: since },
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
    select: { amount: true, currency: true },
  });
  let totalSettled = 0;
  for (const s of settlementsAgg) {
    totalSettled += await toUserCurrency(
      parseFloat(s.amount.toString()),
      s.currency,
      currency,
    );
  }

  return {
    currency,
    rangeMonths: range,
    totalSpent: round2(totalSpent),
    totalSettled: round2(totalSettled),
    expenseCount: expenses.length,
    groupCount: groupIds.length,
    myNet: timeline.length > 0 ? timeline[timeline.length - 1]!.myNet : 0,
    timeline,
    topCategories,
    topPayers,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
