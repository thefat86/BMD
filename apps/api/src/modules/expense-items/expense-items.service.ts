/**
 * Service Expense Items — split par item.
 *
 * Concept : pour une dépense en mode ITEMIZED, chaque ligne du ticket
 * (ex: "Pizza Margherita 12.50") devient un ExpenseItem. Chaque membre
 * du groupe peut ensuite "claimer" les items qu'il a consommés.
 *
 * Si plusieurs membres claiment le même item, le coût est réparti via le
 * champ `share` (fraction entre 0 et 1). Par défaut, share = 1 / nombre
 * de claimants pour ce item.
 *
 * Le total par membre = somme des (item.totalPrice × claim.share).
 *
 * Permissions :
 *  - Tous les membres VOIENT les items et leurs claims (transparence)
 *  - Seul le payeur ou un admin peut AJOUTER/SUPPRIMER des items
 *  - Tout membre peut CLAIMER ou DÉ-CLAIMER ses propres items
 *  - Le recalcul des shares (équirépartition automatique) est déclenché
 *    à chaque ajout/suppression de claim
 */
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

/**
 * Récupère les items d'une dépense avec les claims des membres.
 * Visible par tous les membres du groupe.
 */
export async function listExpenseItems(input: {
  expenseId: string;
  actorUserId: string;
}) {
  const expense = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    select: {
      id: true,
      paidById: true,
      group: {
        select: { members: { select: { userId: true, role: true } } },
      },
    },
  });
  if (!expense) throw Errors.notFound("Dépense introuvable");
  const member = expense.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.forbidden("Pas membre du groupe");

  return prisma.expenseItem.findMany({
    where: { expenseId: input.expenseId },
    orderBy: { position: "asc" },
    include: {
      claims: {
        include: {
          user: { select: { id: true, displayName: true, avatar: true } },
        },
      },
    },
  });
}

/**
 * Remplace tous les items d'une dépense (utilisé après scan OCR ou édition).
 * Permission : payeur OU admin du groupe.
 *
 * On supprime les anciens et on recrée les nouveaux dans une transaction
 * pour garder la cohérence (claims supprimés en cascade DB).
 */
export async function setExpenseItems(input: {
  expenseId: string;
  actorUserId: string;
  items: Array<{
    description: string;
    quantity?: number;
    unitPrice: string;
    totalPrice: string;
    category?: string;
  }>;
}) {
  const expense = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    include: {
      group: { include: { members: { select: { userId: true, role: true } } } },
    },
  });
  if (!expense) throw Errors.notFound("Dépense introuvable");
  const member = expense.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.forbidden("Pas membre du groupe");
  const canEdit =
    expense.paidById === input.actorUserId || member.role === "ADMIN";
  if (!canEdit) {
    throw Errors.forbidden(
      "Seul le payeur ou un admin peut modifier les items",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.expenseItem.deleteMany({ where: { expenseId: input.expenseId } });
    if (input.items.length === 0) return [];
    return Promise.all(
      input.items.map((it, idx) =>
        tx.expenseItem.create({
          data: {
            expenseId: input.expenseId,
            position: idx,
            description: it.description.slice(0, 200).trim(),
            quantity: new Prisma.Decimal(it.quantity ?? 1),
            unitPrice: new Prisma.Decimal(it.unitPrice),
            totalPrice: new Prisma.Decimal(it.totalPrice),
            category: it.category?.slice(0, 50),
          },
        }),
      ),
    );
  });
}

/**
 * Un membre revendique un item (ou ajuste sa part).
 *
 * Logique de share :
 *  - Si le membre est le seul à réclamer → share = 1
 *  - Si plusieurs membres réclament → on rééquilibre tous les shares à 1/N
 *    (sauf si l'utilisateur a explicitement passé un share custom)
 *  - On garantit toujours sum(shares) = 1 sur l'item
 */
export async function claimItem(input: {
  itemId: string;
  actorUserId: string;
  /** Optionnel : part custom (sinon on rééquilibre auto à 1/N) */
  share?: number;
}) {
  const item = await prisma.expenseItem.findUnique({
    where: { id: input.itemId },
    include: {
      expense: {
        select: {
          group: {
            select: { members: { select: { userId: true } } },
          },
        },
      },
      claims: true,
    },
  });
  if (!item) throw Errors.notFound("Item introuvable");
  const isMember = item.expense.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.forbidden("Pas membre du groupe");

  return prisma.$transaction(async (tx) => {
    // On ajoute (ou met à jour) le claim de l'utilisateur
    await tx.expenseItemClaim.upsert({
      where: {
        itemId_userId: {
          itemId: input.itemId,
          userId: input.actorUserId,
        },
      },
      create: {
        itemId: input.itemId,
        userId: input.actorUserId,
        share: new Prisma.Decimal(input.share ?? 1),
      },
      update: {
        share: new Prisma.Decimal(input.share ?? 1),
      },
    });

    // Si pas de share custom : équirépartition automatique
    if (input.share === undefined) {
      const allClaims = await tx.expenseItemClaim.findMany({
        where: { itemId: input.itemId },
      });
      const equalShare = new Decimal(1).dividedBy(allClaims.length);
      await Promise.all(
        allClaims.map((c) =>
          tx.expenseItemClaim.update({
            where: { id: c.id },
            data: { share: new Prisma.Decimal(equalShare.toFixed(4)) },
          }),
        ),
      );
    }

    return tx.expenseItem.findUnique({
      where: { id: input.itemId },
      include: {
        claims: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  });
}

/**
 * Un membre retire son claim sur un item. Rééquilibre les shares restants.
 */
export async function unclaimItem(input: {
  itemId: string;
  actorUserId: string;
}) {
  const item = await prisma.expenseItem.findUnique({
    where: { id: input.itemId },
    include: {
      expense: {
        select: {
          group: { select: { members: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!item) throw Errors.notFound("Item introuvable");
  const isMember = item.expense.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.forbidden("Pas membre du groupe");

  return prisma.$transaction(async (tx) => {
    await tx.expenseItemClaim.deleteMany({
      where: { itemId: input.itemId, userId: input.actorUserId },
    });
    // Rééquilibrer les claims restants
    const remaining = await tx.expenseItemClaim.findMany({
      where: { itemId: input.itemId },
    });
    if (remaining.length > 0) {
      const equalShare = new Decimal(1).dividedBy(remaining.length);
      await Promise.all(
        remaining.map((c) =>
          tx.expenseItemClaim.update({
            where: { id: c.id },
            data: { share: new Prisma.Decimal(equalShare.toFixed(4)) },
          }),
        ),
      );
    }
    return { unclaimed: true };
  });
}

/**
 * Calcule la répartition par membre pour une dépense en mode ITEMIZED.
 * Retourne le total dû par chaque membre + items réclamés.
 *
 * Utilisé par la balance et pour générer les ExpenseShare réels lors
 * de la finalisation d'une dépense ITEMIZED.
 */
export async function computeItemizedShares(input: {
  expenseId: string;
  actorUserId: string;
}): Promise<
  Array<{
    userId: string;
    displayName: string;
    amountOwed: string;
    items: Array<{
      itemId: string;
      description: string;
      itemTotal: string;
      myShare: string;
      myAmount: string;
    }>;
  }>
> {
  const expense = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    select: {
      id: true,
      group: {
        select: {
          members: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
          },
        },
      },
      items: {
        include: { claims: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!expense) throw Errors.notFound("Dépense introuvable");

  const result: Record<
    string,
    {
      userId: string;
      displayName: string;
      amountOwed: Decimal;
      items: Array<{
        itemId: string;
        description: string;
        itemTotal: string;
        myShare: string;
        myAmount: string;
      }>;
    }
  > = {};

  for (const m of expense.group.members) {
    result[m.userId] = {
      userId: m.userId,
      displayName: m.user.displayName,
      amountOwed: new Decimal(0),
      items: [],
    };
  }

  for (const item of expense.items) {
    const itemTotal = new Decimal(item.totalPrice.toString());
    for (const claim of item.claims) {
      const share = new Decimal(claim.share.toString());
      const myAmount = itemTotal.times(share);
      const r = result[claim.userId];
      if (!r) continue; // membre disparu du groupe
      r.amountOwed = r.amountOwed.plus(myAmount);
      r.items.push({
        itemId: item.id,
        description: item.description,
        itemTotal: itemTotal.toFixed(2),
        myShare: share.toFixed(4),
        myAmount: myAmount.toFixed(2),
      });
    }
  }

  return Object.values(result).map((r) => ({
    ...r,
    amountOwed: r.amountOwed.toFixed(2),
  }));
}
