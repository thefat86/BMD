/**
 * V227 / V228 — Helper unifié de calcul des 3 soldes d'un groupe :
 *
 *   1. Dépenses (balance P2P, source : `api.getBalance`)
 *   2. Tontine  (contributions confirmées vs montants reçus comme bénéficiaire)
 *   3. Caisses  (sum des contributions VALIDATED sur les funds du groupe)
 *
 * Le hub (V227) affiche les 3 soldes du user courant côte à côte dans le hero.
 * La vue Membres (V228) calcule le même triplet pour chaque membre via
 * `computeMemberSolde(userId, …)`.
 *
 * Toutes les conversions de string → number passent par `safeNum` pour éviter
 * NaN sur les payloads partiels (charte BMD : pas de parseFloat brut).
 */

// ─── Shapes minimales attendues ────────────────────────────────────────────
// On reste laxiste (any-friendly) parce que les vraies signatures vivent
// dans `api-client.ts` et bougent assez vite. Le helper s'assure juste qu'on
// lit ce qu'il faut sans crasher si un champ est absent.

export type BalanceSnapshot = {
  currency?: string;
  balances?: Array<{ userId: string; displayName?: string; net: string | number }>;
  suggestions?: Array<{
    fromUserId: string;
    toUserId: string;
    amount: string | number;
    currency?: string;
  }>;
} | null;

export type TontineSnapshot = {
  id: string;
  status: string;
  currency?: string;
  contributionAmount?: string | number;
  turns?: Array<{
    id: string;
    status: string;
    beneficiary?: { id: string; displayName?: string } | null;
    beneficiaryUserId?: string | null;
    totalReceived?: string | number;
    distributedAt?: string | null;
    contributions?: Array<{
      contributorUserId: string;
      amountDue?: string | number;
      amount?: string | number;
      status: "PENDING" | "PAID" | "CONFIRMED";
    }>;
  }>;
} | null;

export type FundRow = {
  id: string;
  name: string;
  currency: string;
  status?: string;
  contributed?: number;
  balance?: number;
};

export type FundDetail = {
  fund: { id: string; name: string; currency: string };
  contributions: Array<{
    contributorUserId: string;
    amountInFundCurrency: string | number;
    amount?: string | number;
    status: "PENDING" | "VALIDATED" | "REJECTED";
  }>;
} | null;

// ─── Helpers internes ──────────────────────────────────────────────────────

function safeNum(input: unknown): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (typeof input === "string") {
    const n = Number(input);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function getTurnBeneficiaryId(t: any): string | null {
  // Backend hub : beneficiary.id (cf. shape getTontine — pas typé strict ici).
  // Backend history : beneficiaryUserId direct.
  if (!t) return null;
  return t.beneficiary?.id ?? t.beneficiaryUserId ?? null;
}

// ─── Calcul Solde Dépenses ─────────────────────────────────────────────────

/**
 * Renvoie le net P2P (positif = on me doit, négatif = je dois) pour un user
 * donné, ainsi que le nombre de transferts entrants/sortants suggérés par
 * l'algo de règlement (utile pour les subtitles).
 */
export function computeExpensesSolde(
  balance: BalanceSnapshot,
  userId: string,
): {
  net: number;
  inboundCount: number;
  outboundCount: number;
  currency: string | null;
} {
  if (!balance) {
    return { net: 0, inboundCount: 0, outboundCount: 0, currency: null };
  }
  const entry = (balance.balances ?? []).find((b) => b.userId === userId);
  const net = entry ? safeNum(entry.net) : 0;
  const suggestions = balance.suggestions ?? [];
  const inboundCount = suggestions.filter((s) => s.toUserId === userId).length;
  const outboundCount = suggestions.filter((s) => s.fromUserId === userId).length;
  return {
    net,
    inboundCount,
    outboundCount,
    currency: balance.currency ?? null,
  };
}

// ─── Calcul Solde Tontine ──────────────────────────────────────────────────

/**
 * Pour un user donné dans la tontine active :
 *   - Total versé (contributions confirmées dont contributorUserId === user)
 *   - Total reçu  (turns dont beneficiary === user et statut DISTRIBUTED)
 *   - net = reçu − versé
 *
 * Si pas de tontine ACTIVE → net = null (pour différencier "à jour" de
 * "module pas activé"). Le DRAFT compte aussi comme "pas encore active".
 */
export function computeTontineSolde(
  tontine: TontineSnapshot,
  userId: string,
): {
  net: number | null;
  totalPaid: number;
  totalReceived: number;
  currency: string | null;
  turnsTotal: number;
  turnsDistributed: number;
  receivedTurn: boolean;
} {
  if (!tontine || tontine.status !== "ACTIVE") {
    return {
      net: null,
      totalPaid: 0,
      totalReceived: 0,
      currency: tontine?.currency ?? null,
      turnsTotal: 0,
      turnsDistributed: 0,
      receivedTurn: false,
    };
  }
  const turns = tontine.turns ?? [];
  let totalPaid = 0;
  let totalReceived = 0;
  let receivedTurn = false;
  let turnsDistributed = 0;

  for (const t of turns) {
    if (t.status === "DISTRIBUTED") turnsDistributed += 1;

    // Versements de l'utilisateur sur ce tour
    for (const c of t.contributions ?? []) {
      if (c.contributorUserId === userId && c.status === "CONFIRMED") {
        totalPaid += safeNum(c.amountDue ?? c.amount);
      }
    }

    // L'utilisateur a-t-il reçu ce tour ?
    const benefId = getTurnBeneficiaryId(t);
    if (benefId === userId && t.status === "DISTRIBUTED") {
      receivedTurn = true;
      // totalReceived = somme des amountDue confirmés sur ce tour, ou
      // totalReceived fallback.
      const sumConfirmed = (t.contributions ?? [])
        .filter((c) => c.status === "CONFIRMED")
        .reduce((s, c) => s + safeNum(c.amountDue ?? c.amount), 0);
      totalReceived += sumConfirmed > 0 ? sumConfirmed : safeNum(t.totalReceived);
    }
  }

  return {
    net: totalReceived - totalPaid,
    totalPaid,
    totalReceived,
    currency: tontine.currency ?? null,
    turnsTotal: turns.length,
    turnsDistributed,
    receivedTurn,
  };
}

// ─── Calcul Solde Caisses ──────────────────────────────────────────────────

/**
 * Somme les contributions VALIDATED d'un user à travers toutes les caisses
 * détaillées fournies. On retourne aussi un breakdown par caisse pour les
 * tooltips de la vue Membres.
 *
 * `fundDetails` = liste des résultats de `api.getProjectFund(fundId)` pour
 * chaque caisse du groupe. Si on ne dispose que de la liste simple (sans
 * détail), passer `[]` — on retournera 0.
 */
export function computeFundsSolde(
  fundDetails: FundDetail[],
  userId: string,
): {
  net: number;
  contributionsCount: number;
  breakdown: Array<{ fundId: string; fundName: string; amount: number; currency: string }>;
  currency: string | null;
} {
  let total = 0;
  let count = 0;
  const breakdown: Array<{ fundId: string; fundName: string; amount: number; currency: string }> = [];
  let currency: string | null = null;

  for (const detail of fundDetails) {
    if (!detail) continue;
    const fundCurrency = detail.fund.currency;
    if (!currency) currency = fundCurrency;
    let fundAmount = 0;
    let fundCount = 0;
    for (const c of detail.contributions) {
      if (c.contributorUserId === userId && c.status === "VALIDATED") {
        fundAmount += safeNum(c.amountInFundCurrency ?? c.amount);
        fundCount += 1;
      }
    }
    if (fundAmount > 0 || fundCount > 0) {
      breakdown.push({
        fundId: detail.fund.id,
        fundName: detail.fund.name,
        amount: fundAmount,
        currency: fundCurrency,
      });
      total += fundAmount;
      count += fundCount;
    }
  }

  return {
    net: total,
    contributionsCount: count,
    breakdown,
    currency,
  };
}

// ─── Calcul groupé membre (V228) ───────────────────────────────────────────

/**
 * Triplet { expenses, tontine, funds } pour un user. Réutilisable
 * directement dans une boucle `group.members.map(...)` côté Membres view.
 */
export function computeMemberSolde(
  userId: string,
  inputs: {
    balance: BalanceSnapshot;
    tontine: TontineSnapshot;
    fundDetails: FundDetail[];
  },
) {
  return {
    expenses: computeExpensesSolde(inputs.balance, userId),
    tontine: computeTontineSolde(inputs.tontine, userId),
    funds: computeFundsSolde(inputs.fundDetails, userId),
  };
}
