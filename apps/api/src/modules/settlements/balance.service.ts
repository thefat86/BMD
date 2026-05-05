import Decimal from "decimal.js";
import { prisma } from "../../lib/db.js";
import { getGroupForMember } from "../groups/groups.service.js";

export interface UserBalance {
  userId: string;
  displayName: string;
  net: Decimal; // positive => the group owes them; negative => they owe the group
}

export interface SuggestedSettlement {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: Decimal;
  currency: string;
}

/**
 * Compute net balances per member for a given group.
 *
 * For each expense:
 *  - The payer is credited with the FULL amount paid.
 *  - Each participant is debited with their amountOwed (their share of the expense).
 *
 * net[user] = sum(paid by user) - sum(owed by user)
 */
export async function computeBalances(
  groupId: string,
  actorUserId: string,
): Promise<{ currency: string; balances: UserBalance[] }> {
  const group = await getGroupForMember(groupId, actorUserId);

  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      paidBy: { select: { id: true, displayName: true } },
      shares: { include: { user: { select: { id: true, displayName: true } } } },
    },
  });

  const ledger = new Map<string, { displayName: string; net: Decimal }>();
  for (const m of group.members) {
    ledger.set(m.userId, {
      displayName: m.user.displayName,
      net: new Decimal(0),
    });
  }

  for (const e of expenses) {
    const paid = ledger.get(e.paidById);
    if (paid) {
      paid.net = paid.net.plus(new Decimal(e.amount.toString()));
    }
    for (const s of e.shares) {
      const owed = ledger.get(s.userId);
      if (owed) {
        owed.net = owed.net.minus(new Decimal(s.amountOwed.toString()));
      }
    }
  }

  return {
    currency: group.defaultCurrency,
    balances: Array.from(ledger.entries()).map(([userId, v]) => ({
      userId,
      displayName: v.displayName,
      net: v.net.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    })),
  };
}

/**
 * Greedy debt simplification (a.k.a. "minimum cash flow").
 * Pairs largest creditor with largest debtor until everyone is settled.
 * The result is OPTIMAL within a small constant factor and runs in O(n log n).
 *
 * Mathematical invariant : SUM of all proposed transactions <= SUM of all owed amounts
 * (equality only in worst case where no compensation is possible).
 */
export function simplify(
  balances: Array<{ userId: string; displayName: string; net: Decimal }>,
  currency: string,
): SuggestedSettlement[] {
  const TOL = new Decimal("0.01");

  // Split into creditors (positive) and debtors (negative)
  const creditors = balances
    .filter((b) => b.net.greaterThan(TOL))
    .map((b) => ({ ...b, remaining: b.net }))
    .sort((a, b) => b.remaining.comparedTo(a.remaining));

  const debtors = balances
    .filter((b) => b.net.lessThan(TOL.negated()))
    .map((b) => ({ ...b, remaining: b.net.negated() })) // store as positive amount owed
    .sort((a, b) => b.remaining.comparedTo(a.remaining));

  const out: SuggestedSettlement[] = [];

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const pay = Decimal.min(d.remaining, c.remaining);

    if (pay.greaterThan(TOL)) {
      out.push({
        fromUserId: d.userId,
        fromName: d.displayName,
        toUserId: c.userId,
        toName: c.displayName,
        amount: pay.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        currency,
      });
    }

    d.remaining = d.remaining.minus(pay);
    c.remaining = c.remaining.minus(pay);

    if (d.remaining.lessThanOrEqualTo(TOL)) i++;
    if (c.remaining.lessThanOrEqualTo(TOL)) j++;
  }

  return out;
}

/**
 * Compute balances + simplification suggestions in one call.
 */
export async function computeBalanceWithSuggestions(
  groupId: string,
  actorUserId: string,
) {
  const { currency, balances } = await computeBalances(groupId, actorUserId);
  const suggestions = simplify(balances, currency);
  return { currency, balances, suggestions };
}
