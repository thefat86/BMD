/**
 * V52.F2 — Algorithme de règlement minimal (killer feature V45).
 *
 * Étant donné les soldes nets de N personnes (positifs = créditeurs,
 * négatifs = débiteurs), calcule le minimum de transferts requis pour
 * que tout le monde soit à zéro. Approche classique : on prend le plus
 * gros créditeur et le plus gros débiteur, on fait un transfert de
 * `min(|+a|, |-b|)`, on retire celui qui passe à zéro, on recommence.
 *
 * Complexité : O(N log N) au pire. Le résultat est OPTIMAL en nombre
 * de transferts pour les cas usuels (non-NP-hard contrairement au
 * problème théorique général car les soldes sont signed-amount-on-graph).
 *
 * @param balances Map userId → solde net (en unité monétaire, signed).
 *   Convention : positif = on lui doit, négatif = il doit.
 * @returns liste de transferts {from, to, amount} (amount positif).
 *   Cumulés ils règlent intégralement tous les soldes.
 */
export interface SettlementTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export function computeMinSettlements(
  balances: Record<string, number>,
): SettlementTransfer[] {
  // Filtre out les soldes à zéro (epsilon arrondi flottant)
  const EPS = 0.005; // < 1 centime → considéré comme zéro
  const entries: Array<{ id: string; balance: number }> = Object.entries(
    balances,
  )
    .map(([id, balance]) => ({ id, balance }))
    .filter((e) => Math.abs(e.balance) >= EPS);

  // Sépare créditeurs (+) et débiteurs (-), triés par magnitude descendante
  const creditors = entries
    .filter((e) => e.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const debtors = entries
    .filter((e) => e.balance < 0)
    .sort((a, b) => a.balance - b.balance); // plus négatif d'abord

  const transfers: SettlementTransfer[] = [];

  let i = 0; // index créditeur courant
  let j = 0; // index débiteur courant

  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i];
    const deb = debtors[j];
    const amount = Math.min(cred.balance, -deb.balance);
    if (amount >= EPS) {
      transfers.push({
        fromUserId: deb.id,
        toUserId: cred.id,
        amount: Math.round(amount * 100) / 100, // 2 décimales
      });
    }
    cred.balance -= amount;
    deb.balance += amount;
    if (Math.abs(cred.balance) < EPS) i++;
    if (Math.abs(deb.balance) < EPS) j++;
  }

  return transfers;
}
