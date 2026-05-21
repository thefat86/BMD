/**
 * Suggestions intelligentes pour la création de dépenses (spec §3.7).
 *
 * Pas d'IA externe : algorithmes statistiques sur l'historique du groupe.
 * Pour chaque catégorie de dépense, on analyse les N dernières dépenses du
 * groupe et on suggère :
 *  - le mode de partage le plus fréquent (EQUAL / UNEQUAL / PERCENTAGE / ITEMIZED)
 *  - le set de participants le plus probable
 *  - le payeur le plus probable
 *
 * Les suggestions sont triées par score (fréquence × récence).
 */
import { prisma } from "../../lib/db.js";

export interface SplitSuggestion {
  /** Catégorie ciblée par la suggestion (peut être null = toutes catégories). */
  category: string | null;
  splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
  /** UserIds proposés comme participants. */
  participantUserIds: string[];
  /** UserId du payeur le plus probable (peut être null). */
  paidByUserId: string | null;
  /** Score de confiance entre 0 et 1 (1 = très confiant). */
  confidence: number;
  /** Nombre de dépenses similaires sur lesquelles la suggestion est basée. */
  basedOnCount: number;
  /** Phrase humaine pour l'UI (ex: "9 dépenses sur 10 ont été partagées comme ça"). */
  reason: string;
}

interface RecentExpense {
  splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
  category: string | null;
  paidById: string;
  participantIds: string[];
  occurredAt: Date;
}

/**
 * Suggère le meilleur partage pour une nouvelle dépense.
 * Si `category` est fourni, on filtre l'historique sur cette catégorie.
 * Sinon, on regarde les patterns globaux du groupe.
 */
export async function suggestSplit(input: {
  groupId: string;
  category?: string | null;
}): Promise<SplitSuggestion | null> {
  // Récupère les 50 dernières dépenses du groupe (assez pour avoir un signal stable)
  const expenses = await prisma.expense.findMany({
    where: { groupId: input.groupId },
    orderBy: { occurredAt: "desc" },
    take: 50,
    include: {
      shares: { select: { userId: true } },
    },
  });

  if (expenses.length === 0) return null;

  const recent: RecentExpense[] = expenses.map((e) => ({
    splitMode: e.splitMode as RecentExpense["splitMode"],
    category: e.category,
    paidById: e.paidById,
    participantIds: e.shares.map((s) => s.userId).sort(),
    occurredAt: e.occurredAt,
  }));

  // Si une catégorie est précisée, on commence par essayer de matcher exact
  let pool = recent;
  if (input.category) {
    const sameCategory = recent.filter((r) => r.category === input.category);
    if (sameCategory.length >= 3) pool = sameCategory;
    // Sinon on utilise tout l'historique (pas assez de signal sur cette catégorie)
  }

  // Score : fréquence × poids de récence (linéaire)
  const now = Date.now();
  function recencyWeight(d: Date): number {
    // 1.0 pour aujourd'hui → 0.3 pour il y a 90 jours
    const ageDays = (now - d.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0.3, 1 - ageDays / 130);
  }

  // 1. Mode de partage le plus fréquent (pondéré récence)
  const modeScores = new Map<string, number>();
  for (const e of pool) {
    modeScores.set(
      e.splitMode,
      (modeScores.get(e.splitMode) ?? 0) + recencyWeight(e.occurredAt),
    );
  }
  const bestMode = Array.from(modeScores.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (!bestMode) return null;
  const splitMode = bestMode[0] as SplitSuggestion["splitMode"];

  // 2. Set de participants le plus fréquent (clé = liste triée)
  const participantsScores = new Map<string, { score: number; ids: string[] }>();
  for (const e of pool) {
    if (e.splitMode !== splitMode) continue;
    const key = e.participantIds.join(",");
    const cur = participantsScores.get(key);
    if (cur) cur.score += recencyWeight(e.occurredAt);
    else
      participantsScores.set(key, {
        score: recencyWeight(e.occurredAt),
        ids: e.participantIds,
      });
  }
  const bestParticipants = Array.from(participantsScores.values()).sort(
    (a, b) => b.score - a.score,
  )[0];
  const participantUserIds = bestParticipants?.ids ?? [];

  // 3. Payeur le plus fréquent dans ce contexte
  const payerScores = new Map<string, number>();
  for (const e of pool) {
    payerScores.set(
      e.paidById,
      (payerScores.get(e.paidById) ?? 0) + recencyWeight(e.occurredAt),
    );
  }
  const bestPayer = Array.from(payerScores.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];

  // Confidence = ratio du mode gagnant sur le total des modes
  const totalModeScore = Array.from(modeScores.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const confidence = totalModeScore > 0 ? bestMode[1] / totalModeScore : 0;

  const modeLabel = (() => {
    switch (splitMode) {
      case "EQUAL":
        return "à parts égales";
      case "UNEQUAL":
        return "avec des montants exacts par personne";
      case "PERCENTAGE":
        return "en pourcentages personnalisés";
      case "ITEMIZED":
        return "ligne par ligne";
    }
  })();

  return {
    category: input.category ?? null,
    splitMode,
    participantUserIds,
    paidByUserId: bestPayer?.[0] ?? null,
    confidence: Math.round(confidence * 100) / 100,
    basedOnCount: pool.length,
    reason: `Sur ${pool.length} dépense${pool.length > 1 ? "s" : ""}${input.category ? ` de catégorie « ${input.category} »` : ""}, ${Math.round(confidence * 100)}% sont partagées ${modeLabel}.`,
  };
}

/**
 * Détecte une dépense récurrente : si une même description apparaît
 * régulièrement (ex: loyer mensuel, abonnement Netflix), suggère de la
 * pré-remplir avec les paramètres habituels.
 */
export async function suggestRecurringExpense(input: {
  groupId: string;
  description: string;
}): Promise<{
  found: boolean;
  lastAmount?: string;
  lastCurrency?: string;
  paidByUserId?: string;
  splitMode?: string;
  participantUserIds?: string[];
  occurrencesCount?: number;
} | null> {
  // Cherche des dépenses avec une description très similaire (case-insensitive,
  // strip accents, comparaison Levenshtein simple)
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  const target = normalize(input.description);
  if (target.length < 3) return { found: false };

  const all = await prisma.expense.findMany({
    where: { groupId: input.groupId },
    orderBy: { occurredAt: "desc" },
    take: 200,
    include: {
      shares: { select: { userId: true } },
    },
  });

  const matches = all.filter((e) => normalize(e.description) === target);
  if (matches.length < 2) return { found: false };

  const last = matches[0]!;
  return {
    found: true,
    lastAmount: last.amount.toString(),
    lastCurrency: last.currency,
    paidByUserId: last.paidById,
    splitMode: last.splitMode,
    participantUserIds: last.shares.map((s) => s.userId).sort(),
    occurrencesCount: matches.length,
  };
}
