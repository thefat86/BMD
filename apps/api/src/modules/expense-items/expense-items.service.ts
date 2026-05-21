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
 *
 * V239.A — Si chaque item arrive avec `assignedUserIds` non-vide, on persiste
 * automatiquement les claims correspondants (1 / assignedUserIds.length de part
 * chacun). Puis on recalcule les ExpenseShare pour que le détail dépense affiche
 * la répartition réelle par articles (au lieu de l'EQUAL temporaire posé à la
 * création). Si la dépense n'est pas ITEMIZED, le recalcul est skippé.
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
    /**
     * V239.A — Users ayant consommé cet item. Si fourni et non-vide, on crée
     * 1 ExpenseItemClaim par userId (share = 1/N). Si vide ou absent, l'item
     * n'a pas de claims (et la balance retombe sur EQUAL via les ExpenseShare
     * existantes en attendant que les membres claiment manuellement).
     */
    assignedUserIds?: string[];
  }>;
}) {
  const expense = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    include: {
      group: { include: { members: { select: { userId: true, role: true, id: true } } } },
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

  // V239.A — Garde uniquement les userIds qui sont bien membres (anti-injection
  // + cohérence). Utilisé pour le passage des assignedUserIds aux claims.
  const memberUserIds = new Set(expense.group.members.map((m) => m.userId));
  const memberMap = new Map(
    expense.group.members.map((m) => [m.userId, m.id]),
  );

  const result = await prisma.$transaction(async (tx) => {
    await tx.expenseItem.deleteMany({ where: { expenseId: input.expenseId } });
    if (input.items.length === 0) return [];
    return Promise.all(
      input.items.map(async (it, idx) => {
        const validAssignees = (it.assignedUserIds ?? []).filter((uid) =>
          memberUserIds.has(uid),
        );
        const share =
          validAssignees.length > 0
            ? new Decimal(1).dividedBy(validAssignees.length).toFixed(4)
            : null;
        return tx.expenseItem.create({
          data: {
            expenseId: input.expenseId,
            position: idx,
            description: it.description.slice(0, 200).trim(),
            quantity: new Prisma.Decimal(it.quantity ?? 1),
            unitPrice: new Prisma.Decimal(it.unitPrice),
            totalPrice: new Prisma.Decimal(it.totalPrice),
            category: it.category?.slice(0, 50),
            // V239.A — Crée les claims (1 par assignée), share équipartie.
            ...(validAssignees.length > 0 && share
              ? {
                  claims: {
                    create: validAssignees.map((uid) => ({
                      userId: uid,
                      share: new Prisma.Decimal(share),
                    })),
                  },
                }
              : {}),
          },
        });
      }),
    );
  });

  // V239.A — Recalcule les ExpenseShare à partir des items + claims pour que
  // le détail dépense affiche la vraie répartition itemizée (au lieu de
  // l'EQUAL temporaire posé à la création).
  if (expense.splitMode === "ITEMIZED") {
    await recomputeItemizedShares(input.expenseId, memberMap);
  }

  return result;
}

/**
 * V239.A — Recalcule les ExpenseShare d'une dépense ITEMIZED à partir des
 * ExpenseItem + ExpenseItemClaim. Chaque user reçoit la somme de
 * `item.totalPrice × claim.share` pour les items qu'il a claimés. Les items
 * sans claim sont ignorés (ils restent à charge des membres qui voudront
 * claimer plus tard).
 *
 * Si la somme des shares calculés ne couvre pas le total de la dépense (cas
 * où certains items n'ont aucun claim), on garde des ExpenseShare à 0 pour
 * les membres restants — la balance reste cohérente parce qu'on n'invente
 * pas de dette fictive.
 *
 * Si AUCUN item n'a de claim, on ne touche pas aux shares existantes (laisse
 * l'EQUAL temporaire posé à la création).
 */
async function recomputeItemizedShares(
  expenseId: string,
  memberMap: Map<string, string>,
) {
  const items = await prisma.expenseItem.findMany({
    where: { expenseId },
    include: { claims: true },
  });
  const totals = new Map<string, Decimal>();
  for (const it of items) {
    const itemTotal = new Decimal(it.totalPrice.toString());
    for (const claim of it.claims) {
      const share = new Decimal(claim.share.toString());
      const amount = itemTotal.times(share);
      totals.set(
        claim.userId,
        (totals.get(claim.userId) ?? new Decimal(0)).plus(amount),
      );
    }
  }
  // Pas de claims du tout → on laisse les shares EQUAL temporaires en place.
  if (totals.size === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.expenseShare.deleteMany({ where: { expenseId } });
    await tx.expenseShare.createMany({
      data: Array.from(totals.entries()).map(([userId, amount]) => ({
        expenseId,
        userId,
        groupMemberId: memberMap.get(userId)!,
        amountOwed: new Prisma.Decimal(amount.toFixed(2)),
      })),
    });
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
  /**
   * Optionnel : claim au nom d'un autre membre du groupe.
   * Autorisé UNIQUEMENT si l'actor est :
   *   - le payeur de la dépense (il sait qui a consommé quoi quand il a payé)
   *   - admin/trésorier du groupe (correction admin)
   * Si non fourni : claim pour soi-même.
   */
  targetUserId?: string;
  /** Optionnel : part custom (sinon on rééquilibre auto à 1/N) */
  share?: number;
}) {
  const item = await prisma.expenseItem.findUnique({
    where: { id: input.itemId },
    include: {
      expense: {
        select: {
          paidById: true,
          group: {
            select: {
              members: { select: { userId: true, role: true } },
            },
          },
        },
      },
      claims: true,
    },
  });
  if (!item) throw Errors.notFound("Item introuvable");

  const actorMember = item.expense.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!actorMember) throw Errors.forbidden("Pas membre du groupe");

  // Détermine le user pour qui on claim
  const claimUserId = input.targetUserId ?? input.actorUserId;

  // Autorisation : si on claim pour qqn d'autre, il faut être payeur ou admin
  if (claimUserId !== input.actorUserId) {
    const targetIsMember = item.expense.group.members.some(
      (m) => m.userId === claimUserId,
    );
    if (!targetIsMember) {
      throw Errors.badRequest(
        "Cette personne n'est pas (ou plus) membre du groupe.",
      );
    }
    const isPayer = item.expense.paidById === input.actorUserId;
    const isAdmin =
      actorMember.role === "ADMIN" || actorMember.role === "TREASURER";
    if (!isPayer && !isAdmin) {
      throw Errors.forbidden(
        "Seul le payeur ou un admin peut assigner un article à quelqu'un d'autre.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    // On ajoute (ou met à jour) le claim de l'utilisateur cible
    await tx.expenseItemClaim.upsert({
      where: {
        itemId_userId: {
          itemId: input.itemId,
          userId: claimUserId,
        },
      },
      create: {
        itemId: input.itemId,
        userId: claimUserId,
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
