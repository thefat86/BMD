import Decimal from "decimal.js";
import { Prisma, SplitMode } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { getGroupForMember } from "../groups/groups.service.js";
import { notifyGroupMembers } from "../notifications/notifications.service.js";
import { events } from "../../lib/event-stream.js";
import { assertGroupNotLocked } from "../subscription/subscription-state.service.js";

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
  /**
   * Sprint AC-2 · Multi-payeurs (plusieurs personnes ont avancé).
   *
   * Si fourni :
   *   - mode `amount` : chaque payer.amount somme exactement à expense.amount.
   *   - mode `percent` : chaque payer.percent somme à 100, on calcule les
   *     montants à partir du total.
   *   - On ne peut pas mélanger les deux modes.
   *
   * Si vide ou non-fourni → comportement classique (un seul payeur via paidByUserId).
   * Le champ legacy `paidByUserId` reste rempli en base avec le payeur principal
   * (= celui qui a la plus grosse part), pour la rétrocompatibilité.
   */
  payers?: Array<{ userId: string; amount?: string; percent?: number }>;
  /**
   * Sprint AC-2 · Si la dépense est créée depuis une réunion enregistrée
   * (procès-verbal). Permet l'audit trail + empêche la double-application.
   */
  meetingRecordId?: string;
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
    throw Errors.invalidFormula({
      what: "le partage de cette dépense",
      why: "Tu n'as sélectionné aucun participant.",
      fix: "Coche au moins une personne qui doit participer à la note (toi inclus si tu paies pour les autres).",
    });
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

  // ITEMIZED : à la création, on traite comme EQUAL temporaire (avec
  // tous les participants à part égale). Les vraies parts seront recalculées
  // dynamiquement depuis les ExpenseItem + claims via le endpoint
  // /expenses/:id/itemized-shares. Cette stratégie évite d'avoir des shares
  // incohérentes pendant que les utilisateurs claiment encore leurs items.
  if (splitMode === "ITEMIZED") {
    const each = amount
      .dividedBy(participants.length)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const result = participants.map((p) => ({
      userId: p.userId,
      amountOwed: each,
    }));
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
      throw Errors.invalidFormula({
        what: "le partage en pourcentages",
        why: `Le total des parts atteint ${totalPct.toFixed(2)} % au lieu de 100 %.`,
        fix: `Ajuste les pourcentages pour qu'ils totalisent exactement 100 %. ${totalPct < 100 ? `Tu peux ajouter ${(100 - totalPct).toFixed(2)} %` : `Tu dois retirer ${(totalPct - 100).toFixed(2)} %`} pour équilibrer.`,
      });
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
    const diff = amount.minus(totalGiven);
    throw Errors.invalidFormula({
      what: "le partage en montants exacts",
      why: `La somme des parts est de ${totalGiven} alors que la dépense est de ${amount}.`,
      fix:
        diff.greaterThan(0)
          ? `Il manque ${diff.toString()} à répartir — vérifie qui doit participer à combien.`
          : `Tu as réparti ${diff.abs().toString()} de trop — réduis les parts pour qu'elles totalisent ${amount}.`,
    });
  }
  return participants.map((p) => ({
    userId: p.userId,
    amountOwed: new Decimal(p.share ?? 0),
  }));
}

/**
 * Sprint AC-2 · Valide et normalise un tableau de payers multi-payeurs.
 *
 * Retourne la liste des payers avec leur montant exact en Decimal (jamais
 * pourcentage). Throw si la somme ne correspond pas, si un user est absent
 * du groupe, ou si on mélange amount et percent.
 *
 * Si payers est vide ou null, retourne null (le caller utilise paidByUserId).
 */
export function computePayers(
  totalAmount: Decimal,
  payers: Array<{ userId: string; amount?: string; percent?: number }> | undefined,
  memberIds: Set<string>,
): Array<{ userId: string; amount: Decimal }> | null {
  if (!payers || payers.length === 0) return null;
  if (payers.length === 1) {
    // Un seul payer multi-payeur ne sert à rien — on retourne null pour
    // tomber sur le mode legacy paidByUserId (plus simple).
    return null;
  }

  // Tous les userIds doivent être membres
  for (const p of payers) {
    if (!memberIds.has(p.userId)) {
      throw Errors.invalidFormula({
        what: "la liste des payeurs",
        why: "Un des payeurs sélectionnés n'est plus dans le groupe.",
        fix: "Décoche ce payeur ou réinvite-le dans le groupe avant de créer la dépense.",
      });
    }
  }

  // Pas de doublons
  const seen = new Set<string>();
  for (const p of payers) {
    if (seen.has(p.userId)) {
      throw Errors.invalidFormula({
        what: "la liste des payeurs",
        why: "La même personne apparaît deux fois dans la liste des payeurs.",
        fix: "Garde une seule ligne par personne et combine les montants si nécessaire.",
      });
    }
    seen.add(p.userId);
  }

  const hasAmounts = payers.some((p) => p.amount !== undefined && p.amount !== null);
  const hasPercents = payers.some((p) => p.percent !== undefined && p.percent !== null);
  if (hasAmounts && hasPercents) {
    throw Errors.invalidFormula({
      what: "la répartition entre payeurs",
      why: "Tu as mélangé des montants et des pourcentages dans la liste des payeurs.",
      fix: "Choisis un seul mode : soit le montant exact que chacun a avancé, soit le pourcentage de la dépense totale.",
    });
  }

  if (hasPercents) {
    const totalPct = payers.reduce((acc, p) => acc + (p.percent ?? 0), 0);
    if (Math.abs(totalPct - 100) > 0.001) {
      throw Errors.invalidFormula({
        what: "les pourcentages des payeurs",
        why: `Le total atteint ${totalPct.toFixed(2)} % au lieu de 100 %.`,
        fix:
          totalPct < 100
            ? `Il manque ${(100 - totalPct).toFixed(2)} % à attribuer.`
            : `Tu as ${(totalPct - 100).toFixed(2)} % de trop — réduis quelques parts.`,
      });
    }
    // Convertit chaque % en montant et corrige le dernier pour absorber l'arrondi.
    const result = payers.map((p) => ({
      userId: p.userId,
      amount: totalAmount
        .times(new Decimal(p.percent ?? 0))
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    }));
    const sum = result.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
    const diff = totalAmount.minus(sum);
    if (!diff.isZero()) {
      result[result.length - 1] = {
        userId: result[result.length - 1]!.userId,
        amount: result[result.length - 1]!.amount.plus(diff),
      };
    }
    return result;
  }

  // Mode amount : la somme doit faire exactement le total
  const result = payers.map((p) => ({
    userId: p.userId,
    amount: new Decimal(p.amount ?? 0),
  }));
  const sum = result.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
  if (!sum.equals(totalAmount)) {
    const diff = totalAmount.minus(sum);
    throw Errors.invalidFormula({
      what: "la répartition entre payeurs",
      why: `Les avances (${sum}) ne correspondent pas au total de la dépense (${totalAmount}).`,
      fix:
        diff.greaterThan(0)
          ? `Il manque ${diff.toString()} à attribuer entre les payeurs.`
          : `Les payeurs ont avancé ${diff.abs().toString()} de trop — réduis les montants.`,
    });
  }
  return result;
}

export async function createExpense(input: CreateExpenseInput) {
  const group = await getGroupForMember(input.groupId, input.actorUserId);
  // Bloque la création de dépense si le groupe est verrouillé suite à un
  // downgrade du créateur (subscription DOWNGRADED → groupes en surcapacité
  // FREE en lecture seule). Lecture/export restent OK ailleurs.
  await assertGroupNotLocked(input.groupId);

  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw Errors.invalidFormula({
      what: "le montant de la dépense",
      why: "Le montant est nul ou négatif.",
      fix: "Indique un montant positif — par exemple 12,50 pour 12,50 €.",
    });
  }

  const memberIds = new Set(group.members.map((m) => m.userId));

  // Sprint AC-2 · Multi-payeurs : on calcule d'abord la répartition entre
  // payeurs (si elle est fournie), puis on dérive le `paidById` legacy à
  // partir du payeur principal (= plus grosse part) pour garder la
  // rétrocompat dans les vues qui n'ont pas encore migré.
  const computedPayers = computePayers(amount, input.payers, memberIds);
  let paidBy: string;
  if (computedPayers) {
    // Le "principal" = la plus grosse part. À montants égaux on prend le 1er.
    const principal = computedPayers.reduce((acc, p) =>
      acc.amount.greaterThanOrEqualTo(p.amount) ? acc : p,
    );
    paidBy = principal.userId;
  } else {
    paidBy = input.paidByUserId ?? input.actorUserId;
    if (!memberIds.has(paidBy)) {
      throw Errors.invalidFormula({
        what: "le payeur de cette dépense",
        why: "La personne désignée comme payeur n'est plus dans le groupe.",
        fix: "Choisis un membre actuel du groupe comme payeur — ou réinvite cette personne dans le groupe.",
      });
    }
  }
  for (const p of input.participants) {
    if (!memberIds.has(p.userId)) {
      throw Errors.invalidFormula({
        what: "la liste des participants",
        why: "Un des participants sélectionnés n'est plus dans le groupe.",
        fix: "Décoche ce participant ou réinvite-le dans le groupe avant de créer la dépense.",
      });
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
      // Sprint AC-2 · audit trail meeting → expense
      ...(input.meetingRecordId
        ? ({ meetingRecordId: input.meetingRecordId } as any)
        : {}),
      shares: {
        create: shares.map((s) => ({
          userId: s.userId,
          groupMemberId: memberMap.get(s.userId)!,
          amountOwed: new Prisma.Decimal(s.amountOwed.toString()),
        })),
      },
      // Sprint AC-2 · multi-payeurs (cast jusqu'à régénération du client)
      ...(computedPayers
        ? ({
            payers: {
              create: computedPayers.map((p) => ({
                userId: p.userId,
                amount: new Prisma.Decimal(p.amount.toString()),
              })),
            },
          } as any)
        : {}),
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

  // Diffusion temps réel à tous les clients connectés (SSE)
  events.expenseCreated(input.groupId, created.id);

  // Notif aux membres du groupe (sauf le payeur lui-même)
  void notifyGroupMembers({
    groupId: input.groupId,
    excludeUserId: input.actorUserId,
    notification: {
      kind: "EXPENSE_ADDED",
      title: `Nouvelle dépense dans ${group.name}`,
      body: `${created.paidBy.displayName} a ajouté « ${created.description} » (${amount.toFixed(2)} ${created.currency})`,
      link: `/dashboard/groups/${input.groupId}`,
      payload: {
        groupId: input.groupId,
        expenseId: created.id,
        amount: amount.toFixed(2),
        currency: created.currency,
      },
    },
  });

  return created;
}

export async function listExpensesForGroup(groupId: string, actorUserId: string) {
  await getGroupForMember(groupId, actorUserId);
  return (prisma as any).expense.findMany({
    where: { groupId },
    include: {
      paidBy: { select: { id: true, displayName: true, avatar: true } },
      shares: {
        include: { user: { select: { id: true, displayName: true } } },
      },
      // Sprint AC-3 · Multi-payeurs persistés (cast `prisma as any` post-migration)
      payers: { select: { userId: true, amount: true, percent: true } },
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
  /**
   * Sprint AC-3 · Multi-payeurs.
   *
   * - Si `payers` est explicite (tableau ≥ 2), on remplace toute la liste.
   * - Si `payers` est tableau vide [], on supprime le mode multi-payeurs
   *   (la dépense retombe sur le single-payeur via paidByUserId).
   * - Si `payers` est `undefined`, on ne touche pas aux payers existants.
   */
  payers?: Array<{ userId: string; amount?: string; percent?: number }>;
}) {
  const existing = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    include: { group: { include: { members: true } } },
  });
  if (!existing) throw Errors.notFound("Cette dépense est introuvable 🔍");

  // Permission : payeur (créateur de la dépense) OU admin du groupe uniquement.
  // Les trésoriers et autres membres ne peuvent pas modifier une dépense
  // qu'ils n'ont pas créée — règle décidée pour la traçabilité et la confiance
  // entre amis (le payeur reste maître de son justificatif).
  const member = existing.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.notMember("ce groupe");
  const canEdit =
    existing.paidById === input.actorUserId || member.role === "ADMIN";
  if (!canEdit) {
    throw Errors.forbidden(
      "Seule la personne qui a payé (ou un admin du groupe) peut modifier cette dépense 🔒",
      {
        tip: "C'est par souci de transparence — le payeur reste maître de son justificatif. Demande-lui de faire la modif, ou contacte un admin du groupe.",
      },
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
    throw Errors.invalidFormula({
      what: "le nouveau montant",
      why: "Le montant est nul ou négatif.",
      fix: "Indique un montant positif (ex: 12,50).",
    });
  }

  const memberIds = new Set(existing.group.members.map((m) => m.userId));
  const newPaidBy = input.paidByUserId ?? existing.paidById;
  if (!memberIds.has(newPaidBy)) {
    throw Errors.invalidFormula({
      what: "le nouveau payeur",
      why: "La personne désignée n'est pas (ou plus) membre du groupe.",
      fix: "Choisis un membre actuel comme payeur.",
    });
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

    // Sprint AC-3 · Si on reçoit `payers` explicitement, on remplace toute
    // la liste. On valide d'abord avec computePayers() (réutilise la logique
    // de createExpense pour rester DRY) puis on supprime les anciens et
    // recrée les nouveaux dans la même transaction.
    if (input.payers !== undefined) {
      const computed = computePayers(newAmount, input.payers, memberIds);
      // Toujours supprimer les anciens (que ce soit pour passer en multi
      // ou pour repasser en single)
      await (tx as any).expensePayer.deleteMany({
        where: { expenseId: existing.id },
      });
      if (computed && computed.length >= 2) {
        await (tx as any).expensePayer.createMany({
          data: computed.map((p) => ({
            expenseId: existing.id,
            userId: p.userId,
            amount: new Prisma.Decimal(p.amount.toString()),
          })),
        });
        // On dérive aussi le paidById legacy = payeur principal
        const principal = computed.reduce((acc, p) =>
          acc.amount.greaterThanOrEqualTo(p.amount) ? acc : p,
        );
        updateData.paidById = principal.userId;
      }
    }

    const updated = await tx.expense.update({
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

    // Notif aux membres (hors acteur) — fire-and-forget hors transaction
    setImmediate(() => {
      void notifyGroupMembers({
        groupId: existing.groupId,
        excludeUserId: input.actorUserId,
        notification: {
          kind: "EXPENSE_UPDATED",
          title: `Dépense modifiée dans ${existing.group.name}`,
          body: `« ${updated.description} » a été modifiée (${updated.amount.toString()} ${updated.currency})`,
          link: `/dashboard/groups/${existing.groupId}`,
          payload: {
            groupId: existing.groupId,
            expenseId: existing.id,
          },
        },
      });
    });

    return updated;
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
  if (!existing) throw Errors.notFound("Cette dépense est introuvable 🔍");

  const member = existing.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.notMember("ce groupe");
  // Même règle que pour update : payeur OU admin du groupe uniquement.
  const canDelete =
    existing.paidById === input.actorUserId || member.role === "ADMIN";
  if (!canDelete) {
    throw Errors.forbidden(
      "Seule la personne qui a payé (ou un admin du groupe) peut supprimer cette dépense 🗑️",
      {
        tip: "C'est une mesure de sécurité : on évite que n'importe qui efface une dépense par erreur.",
      },
    );
  }

  // Capture infos pour la notif AVANT delete
  const desc = existing.description;
  const groupId = existing.groupId;
  const groupName = existing.group.name;

  await prisma.expense.delete({ where: { id: existing.id } });

  void notifyGroupMembers({
    groupId,
    excludeUserId: input.actorUserId,
    notification: {
      kind: "EXPENSE_DELETED",
      title: `Dépense supprimée dans ${groupName}`,
      body: `« ${desc} » a été supprimée et les balances recalculées`,
      link: `/dashboard/groups/${groupId}`,
      payload: { groupId, expenseId: existing.id },
    },
  });

  return { deleted: true };
}
