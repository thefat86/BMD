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

/**
 * Met à jour une dépense existante. Recalcule les parts si nécessaire.
 * Seul le payeur ou un admin du groupe peut modifier.
 */
export async function updateExpense(input: {
  expenseId: string;
  actorUserId: string;
  description?: string;
  amount?: string;
  currency?: string;
  category?: string | null;
  paidByUserId?: string;
  splitMode?: SplitMode;
  participants?: Array<{ userId: string; share?: number }>;
  occurredAt?: Date;
}) {
  const existing = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    include: { group: { include: { members: true } } },
  });
  if (!existing) throw Errors.notFound("Dépense introuvable");

  // Permission : payeur OU admin/treasurer du groupe
  const member = existing.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.forbidden("Pas membre du groupe");
  const canEdit =
    existing.paidById === input.actorUserId ||
    member.role === "ADMIN" ||
    member.role === "TREASURER";
  if (!canEdit) {
    throw Errors.forbidden(
      "Seul le payeur ou un admin/trésorier peut modifier cette dépense",
    );
  }

  // Si le partage change, recalculer les parts
  const willChangeAmount = input.amount !== undefined;
  const willChangeSplit =
    input.splitMode !== undefined || input.participants !== undefined;

  const newAmount = input.amount
    ? new Decimal(input.amount)
    : new Decimal(existing.amount.toString());
  if (newAmount.lessThanOrEqualTo(0)) {
    throw Errors.badRequest("Le montant doit être positif");
  }

  const memberIds = new Set(existing.group.members.map((m) => m.userId));
  const newPaidBy = input.paidByUserId ?? existing.paidById;
  if (!memberIds.has(newPaidBy)) {
    throw Errors.badRequest("Le payeur doit être membre du groupe");
  }

  return prisma.$transaction(async (tx) => {
    let updateData: any = {
      ...(input.description && { description: input.description.trim() }),
      ...(input.amount && {
        amount: new Prisma.Decimal(newAmount.toString()),
      }),
      ...(input.currency && { currency: input.currency }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.paidByUserId && { paidById: newPaidBy }),
      ...(input.splitMode && { splitMode: input.splitMode }),
      ...(input.occurredAt && { occurredAt: input.occurredAt }),
    };

    if (willChangeAmount || willChangeSplit) {
      // Récupérer le splitMode et les participants à utiliser
      const newSplitMode = input.splitMode ?? existing.splitMode;
      let participants = input.participants;
      if (!participants) {
        // Garder les mêmes participants qu'avant
        const oldShares = await tx.expenseShare.findMany({
          where: { expenseId: existing.id },
        });
        participants = oldShares.map((s) => ({
          userId: s.userId,
          share:
            newSplitMode === "EQUAL"
              ? undefined
              : parseFloat(s.amountOwed.toString()),
        }));
      }
      const newShares = computeShares(newAmount, newSplitMode, participants);
      const memberMap = new Map(
        existing.group.members.map((m) => [m.userId, m.id]),
      );
      // Effacer les anciennes parts puis recréer
      await tx.expenseShare.deleteMany({ where: { expenseId: existing.id } });
      updateData.shares = {
        create: newShares.map((s) => ({
          userId: s.userId,
          groupMemberId: memberMap.get(s.userId)!,
          amountOwed: new Prisma.Decimal(s.amountOwed.toString()),
        })),
      };
    }

    return tx.expense.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        paidBy: { select: { id: true, displayName: true, avatar: true } },
        shares: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  });
}

/**
 * Supprime une dépense. Seul le payeur ou un admin peut.
 * Les parts (ExpenseShare) sont supprimées en cascade.
 */
export async function deleteExpense(input: {
  expenseId: string;
  actorUserId: string;
}) {
  const existing = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    include: { group: { include: { members: true } } },
  });
  if (!existing) throw Errors.notFound("Dépense introuvable");

  const member = existing.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.forbidden("Pas membre du groupe");
  const canDelete =
    existing.paidById === input.actorUserId ||
    member.role === "ADMIN" ||
    member.role === "TREASURER";
  if (!canDelete) {
    throw Errors.forbidden(
      "Seul le payeur ou un admin/trésorier peut supprimer",
    );
  }

  await prisma.expense.delete({ where: { id: existing.id } });
  return { deleted: true };
}
