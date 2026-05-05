import Decimal from "decimal.js";
import { Prisma, SplitMode } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { getGroupForMember } from "../groups/groups.service.js";

export interface CreateExpenseInput {
  groupId: string;
  actorUserId: string;
  description: string;
  amount: string; // string for decimal precision
  currency?: string;
  category?: string;
  paidByUserId?: string;
  splitMode: SplitMode;
  participants: Array<{ userId: string; share?: number }>;
  occurredAt?: Date;
}

/**
 * Compute each participant's amountOwed based on splitMode.
 * Always returns shares that EXACTLY sum to the total (handles cents rounding by adjusting the last share).
 */
export function computeShares(
  amount: Decimal,
  splitMode: SplitMode,
  participants: Array<{ userId: string; share?: number }>,
): Array<{ userId: string; amountOwed: Decimal }> {
  if (participants.length === 0) {
    throw Errors.badRequest("At least one participant required");
  }

  if (splitMode === "EQUAL") {
    const each = amount.dividedBy(participants.length).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const result = participants.map((p) => ({
      userId: p.userId,
      amountOwed: each,
    }));
    // Adjust the last share so the sum matches exactly
    const sum = each.times(participants.length);
    const diff = amount.minus(sum);
    if (!diff.isZero()) {
      result[result.length - 1] = {
        userId: result[result.length - 1]!.userId,
        amountOwed: result[result.length - 1]!.amountOwed.plus(diff),
      };
    }
    return result;
  }

  if (splitMode === "PERCENTAGE") {
    const totalPct = participants.reduce(
      (acc, p) => acc + (p.share ?? 0),
      0,
    );
    if (Math.abs(totalPct - 100) > 0.001) {
      throw Errors.badRequest(
        `Percentages must sum to 100 (got ${totalPct})`,
      );
    }
    const result = participants.map((p) => ({
      userId: p.userId,
      amountOwed: amount
        .times(new Decimal(p.share ?? 0))
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    }));
    const sum = result.reduce(
      (acc, r) => acc.plus(r.amountOwed),
      new Decimal(0),
    );
    const diff = amount.minus(sum);
    if (!diff.isZero()) {
      result[result.length - 1] = {
        userId: result[result.length - 1]!.userId,
        amountOwed: result[result.length - 1]!.amountOwed.plus(diff),
      };
    }
    return result;
  }

  // UNEQUAL : explicit amount per participant (share = the actual amount)
  const totalGiven = participants.reduce(
    (acc, p) => acc.plus(new Decimal(p.share ?? 0)),
    new Decimal(0),
  );
  if (!totalGiven.equals(amount)) {
    throw Errors.badRequest(
      `Sum of shares (${totalGiven}) must equal expense amount (${amount})`,
    );
  }
  return participants.map((p) => ({
    userId: p.userId,
    amountOwed: new Decimal(p.share ?? 0),
  }));
}

export async function createExpense(input: CreateExpenseInput) {
  const group = await getGroupForMember(input.groupId, input.actorUserId);

  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw Errors.badRequest("Amount must be positive");
  }

  const paidBy = input.paidByUserId ?? input.actorUserId;
  const memberIds = new Set(group.members.map((m) => m.userId));
  if (!memberIds.has(paidBy)) {
    throw Errors.badRequest("Payer is not a member of the group");
  }
  for (const p of input.participants) {
    if (!memberIds.has(p.userId)) {
      throw Errors.badRequest(`Participant ${p.userId} is not a group member`);
    }
  }

  const shares = computeShares(amount, input.splitMode, input.participants);

  // Map userId → groupMemberId
  const memberMap = new Map(group.members.map((m) => [m.userId, m.id]));

  const created = await prisma.expense.create({
    data: {
      groupId: input.groupId,
      description: input.description.trim(),
      amount: new Prisma.Decimal(amount.toString()),
      currency: input.currency ?? group.defaultCurrency,
      category: input.category,
      paidById: paidBy,
      splitMode: input.splitMode,
      occurredAt: input.occurredAt ?? new Date(),
      shares: {
        create: shares.map((s) => ({
          userId: s.userId,
          groupMemberId: memberMap.get(s.userId)!,
          amountOwed: new Prisma.Decimal(s.amountOwed.toString()),
        })),
      },
    },
    include: {
      paidBy: { select: { id: true, displayName: true, avatar: true } },
      shares: {
        include: {
          user: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  return created;
}

export async function listExpensesForGroup(groupId: string, actorUserId: string) {
  await getGroupForMember(groupId, actorUserId);
  return prisma.expense.findMany({
    where: { groupId },
    include: {
      paidBy: { select: { id: true, displayName: true, avatar: true } },
      shares: {
        include: { user: { select: { id: true, displayName: true } } },
      },
    },
    orderBy: { occurredAt: "desc" },
  });
}
