/**
 * V222.F — Calcul de balances P2P à partir des dépenses + règlements.
 *
 * Sortie : Map<userId, balance net dans le groupe>
 *   - positif = on lui doit (créditeur net)
 *   - négatif = il doit (débiteur net)
 *
 * Convention :
 *  - Chaque expense crédite son payeur de Number(amount) et débite chaque
 *    shareholder de son `amountOwed` (ou `amount` fallback).
 *  - Chaque settlement CONFIRMED (ou sans status → on suppose confirmé)
 *    débite `fromUserId` et crédite `toUserId` (rembourse une dette).
 *
 * Renvoie un objet { balances, grossDebtCount } :
 *  - grossDebtCount = nombre de paires (debtor, creditor) avec dette > 0
 *    AVANT compensation greedy. Utilisé pour afficher "X paiements bruts vs N optimaux".
 */

export interface BalanceExpenseShare {
  userId: string;
  amountOwed?: string | number | null;
  amount?: string | number | null;
}

export interface BalanceExpense {
  /**
   * V222.F — `paidBy` (Prisma) prioritaire, fallback `paidByUser` (ancien
   * mapping) ou `paidById`/`paidByUserId` selon l'API.
   */
  paidBy?: { id: string } | null;
  paidByUser?: { id: string } | null;
  paidById?: string | null;
  paidByUserId?: string | null;
  amount: string | number;
  shares?: BalanceExpenseShare[] | null;
}

export interface BalanceSettlement {
  fromUserId: string;
  toUserId: string;
  amount: string | number;
  status?: string | null;
}

export interface BalanceMember {
  id: string;
}

function safeNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function payerId(e: BalanceExpense): string | null {
  return (
    e.paidBy?.id ??
    e.paidByUser?.id ??
    e.paidById ??
    e.paidByUserId ??
    null
  );
}

export function computeNetBalances(
  expenses: BalanceExpense[],
  settlements: BalanceSettlement[],
  members: BalanceMember[],
): { balances: Map<string, number>; grossDebtCount: number } {
  const net = new Map<string, number>();
  for (const m of members) net.set(m.id, 0);

  // Compte aussi les contributions brutes débiteur→créancier pour le ratio
  // "N optimaux vs M bruts". On approxime M par le nombre de paires uniques
  // (debtor, creditor) avec montant net > 0 dans les expenses (avant
  // règlements). Pour la simplicité, on agrège.
  const pairDebts = new Map<string, number>(); // key = `${debtor}>${creditor}`

  for (const e of expenses) {
    const pId = payerId(e);
    if (!pId) continue;
    const total = safeNum(e.amount);
    // Payeur crédité du total
    net.set(pId, (net.get(pId) ?? 0) + total);
    // Chaque shareholder débité de sa part
    for (const s of e.shares ?? []) {
      const part = safeNum(s.amountOwed ?? s.amount);
      net.set(s.userId, (net.get(s.userId) ?? 0) - part);
      if (s.userId !== pId && part > 0.005) {
        const key = `${s.userId}>${pId}`;
        pairDebts.set(key, (pairDebts.get(key) ?? 0) + part);
      }
    }
  }

  for (const s of settlements) {
    const status = (s.status ?? "CONFIRMED").toUpperCase();
    if (status !== "CONFIRMED") continue;
    const amount = safeNum(s.amount);
    net.set(s.fromUserId, (net.get(s.fromUserId) ?? 0) + amount); // débiteur a payé → solde remonte
    net.set(s.toUserId, (net.get(s.toUserId) ?? 0) - amount); // créancier remboursé → solde redescend
    // On déduit aussi du brut (pour pas double-compter)
    const key = `${s.fromUserId}>${s.toUserId}`;
    const prev = pairDebts.get(key) ?? 0;
    pairDebts.set(key, Math.max(0, prev - amount));
  }

  let grossDebtCount = 0;
  for (const v of pairDebts.values()) {
    if (v > 0.005) grossDebtCount += 1;
  }

  return { balances: net, grossDebtCount };
}

/**
 * Convertit la Map balances en objet { [userId]: balance } compatible
 * avec computeMinSettlements.
 */
export function balancesMapToRecord(balances: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of balances.entries()) out[k] = v;
  return out;
}
