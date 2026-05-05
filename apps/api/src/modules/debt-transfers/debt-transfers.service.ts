/**
 * Service Debt Transfer (transfert bilatéral de dette).
 *
 * Concept :
 *   Si A doit X € à B dans un groupe, A peut proposer que C "reprenne" cette
 *   dette. Trois acteurs (A, B, C) doivent valider explicitement :
 *     - A propose (implicite)
 *     - C accepte (il devient le nouveau débiteur)
 *     - B accepte (il accepte de changer de débiteur)
 *
 *   Quand les 2 acceptations sont reçues → status ACTIVE → on crée 2 settlements
 *   virtuels :
 *     - A → B : virtuel paiement de X € (pour annuler la dette de A)
 *     - C → B : virtuel "à payer" de X € (pour créer la nouvelle dette de C)
 *
 * Notifications :
 *   - À C et B : SWAP_PROPOSED (à l'origine du proposer A)
 *   - Quand un accepte → notif aux 2 autres
 *   - Quand activé → notif à tous les membres du groupe
 *   - Si refusé → notif au proposer + actif sortant
 *
 * Permissions :
 *   - Tout membre peut proposer (mais doit être A: le débiteur originel)
 *   - C accepte uniquement si actorUserId === assumeUserId
 *   - B accepte uniquement si actorUserId === creditorUserId
 *   - A ou un admin peut cancel avant ACTIVE
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { notifyOne } from "../notifications/notifications.service.js";

export async function proposeDebtTransfer(input: {
  groupId: string;
  actorUserId: string;
  fromUserId: string;
  assumeUserId: string;
  creditorUserId: string;
  amount: string;
  currency?: string;
  reason?: string;
}) {
  // Vérif appartenance des 3 au groupe
  const group = await prisma.group.findUnique({
    where: { id: input.groupId },
    include: { members: { select: { userId: true } } },
  });
  if (!group) throw Errors.notFound("Groupe introuvable");
  const memberIds = new Set(group.members.map((m) => m.userId));
  for (const id of [
    input.actorUserId,
    input.fromUserId,
    input.assumeUserId,
    input.creditorUserId,
  ]) {
    if (!memberIds.has(id)) {
      throw Errors.badRequest(
        "Tous les utilisateurs impliqués doivent être membres du groupe",
      );
    }
  }
  if (
    input.fromUserId === input.assumeUserId ||
    input.fromUserId === input.creditorUserId ||
    input.assumeUserId === input.creditorUserId
  ) {
    throw Errors.badRequest(
      "Les 3 personnes doivent être différentes (débiteur, repreneur, créancier)",
    );
  }
  // Le proposer est typiquement le débiteur originel (fromUserId).
  // Mais pour être souple, on autorise aussi un admin.
  if (input.actorUserId !== input.fromUserId) {
    // Vérif rôle admin
    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: input.groupId,
          userId: input.actorUserId,
        },
      },
    });
    if (member?.role !== "ADMIN") {
      throw Errors.forbidden(
        "Seul le débiteur ou un admin peut proposer un transfert de dette",
      );
    }
  }

  const amountNum = parseFloat(input.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw Errors.badRequest("Montant invalide");
  }

  const created = await prisma.debtTransfer.create({
    data: {
      groupId: input.groupId,
      proposedById: input.actorUserId,
      fromUserId: input.fromUserId,
      assumeUserId: input.assumeUserId,
      creditorUserId: input.creditorUserId,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency ?? group.defaultCurrency,
      reason: input.reason,
    },
    include: {
      proposedBy: { select: { id: true, displayName: true } },
      fromUser: { select: { id: true, displayName: true } },
      assumeUser: { select: { id: true, displayName: true } },
      creditor: { select: { id: true, displayName: true } },
    },
  });

  // Notif aux 2 personnes qui doivent valider
  void notifyOne(input.assumeUserId, {
    kind: "DEBT_TRANSFER_PROPOSED",
    title: `${created.proposedBy.displayName} te propose de reprendre une dette`,
    body: `${created.fromUser.displayName} te propose de reprendre sa dette de ${created.amount.toString()} ${created.currency} envers ${created.creditor.displayName}`,
    link: `/dashboard/groups/${input.groupId}`,
    payload: { transferId: created.id, groupId: input.groupId },
  });
  void notifyOne(input.creditorUserId, {
    kind: "DEBT_TRANSFER_PROPOSED",
    title: `Transfert de dette à valider`,
    body: `${created.fromUser.displayName} veut faire reprendre sa dette de ${created.amount.toString()} ${created.currency} par ${created.assumeUser.displayName} envers toi.`,
    link: `/dashboard/groups/${input.groupId}`,
    payload: { transferId: created.id, groupId: input.groupId },
  });

  return created;
}

export async function listDebtTransfers(input: {
  groupId: string;
  actorUserId: string;
  includeFinished?: boolean;
}) {
  // Vérif appartenance
  const isMember = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: input.groupId, userId: input.actorUserId },
    },
  });
  if (!isMember) throw Errors.forbidden("Pas membre du groupe");

  return prisma.debtTransfer.findMany({
    where: {
      groupId: input.groupId,
      ...(input.includeFinished
        ? {}
        : { status: { in: ["PROPOSED", "ACTIVE"] } }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      proposedBy: { select: { id: true, displayName: true } },
      fromUser: { select: { id: true, displayName: true } },
      assumeUser: { select: { id: true, displayName: true } },
      creditor: { select: { id: true, displayName: true } },
    },
  });
}

/** L'assumer (C) accepte de reprendre la dette */
export async function acceptByAssumer(input: {
  transferId: string;
  actorUserId: string;
}) {
  return acceptOrReject(input, "ASSUMER", true);
}

/** L'assumer (C) refuse */
export async function rejectByAssumer(input: {
  transferId: string;
  actorUserId: string;
}) {
  return acceptOrReject(input, "ASSUMER", false);
}

/** Le créancier (B) accepte le changement de débiteur */
export async function acceptByCreditor(input: {
  transferId: string;
  actorUserId: string;
}) {
  return acceptOrReject(input, "CREDITOR", true);
}

/** Le créancier (B) refuse */
export async function rejectByCreditor(input: {
  transferId: string;
  actorUserId: string;
}) {
  return acceptOrReject(input, "CREDITOR", false);
}

/**
 * Logic centrale : accept ou reject par l'un des 2 décideurs.
 * Si les 2 ont accepté → activate.
 */
async function acceptOrReject(
  input: { transferId: string; actorUserId: string },
  role: "ASSUMER" | "CREDITOR",
  accept: boolean,
) {
  const t = await prisma.debtTransfer.findUnique({
    where: { id: input.transferId },
    include: {
      proposedBy: { select: { id: true, displayName: true } },
      fromUser: { select: { id: true, displayName: true } },
      assumeUser: { select: { id: true, displayName: true } },
      creditor: { select: { id: true, displayName: true } },
    },
  });
  if (!t) throw Errors.notFound("Transfert introuvable");
  if (t.status !== "PROPOSED") {
    throw Errors.badRequest(
      `Transfert déjà ${t.status.toLowerCase()} — non modifiable`,
    );
  }
  // Permission selon le rôle
  if (role === "ASSUMER" && t.assumeUserId !== input.actorUserId) {
    throw Errors.forbidden("Seul le repreneur peut faire ce choix");
  }
  if (role === "CREDITOR" && t.creditorUserId !== input.actorUserId) {
    throw Errors.forbidden("Seul le créancier peut faire ce choix");
  }

  if (!accept) {
    // Reject → status REJECTED
    const updated = await prisma.debtTransfer.update({
      where: { id: t.id },
      data: {
        status: "REJECTED",
        rejectedBy: input.actorUserId,
        rejectedAt: new Date(),
      },
    });
    // Notif aux 2 autres + au proposer
    const others = [t.proposedById, t.fromUserId, t.assumeUserId, t.creditorUserId]
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .filter((id) => id !== input.actorUserId);
    for (const uid of others) {
      void notifyOne(uid, {
        kind: "DEBT_TRANSFER_REJECTED",
        title: "Transfert de dette refusé",
        body: `${role === "ASSUMER" ? t.assumeUser.displayName : t.creditor.displayName} a refusé le transfert`,
        link: `/dashboard/groups/${t.groupId}`,
        payload: { transferId: t.id, groupId: t.groupId },
      });
    }
    return updated;
  }

  // Accept → on flag le bon champ
  const data: any = {};
  if (role === "ASSUMER") data.acceptedByAssumer = new Date();
  else data.acceptedByCreditor = new Date();

  // Vérif si les 2 ont accepté
  const willBeBothAccepted =
    (role === "ASSUMER" && t.acceptedByCreditor) ||
    (role === "CREDITOR" && t.acceptedByAssumer);

  if (willBeBothAccepted) {
    data.status = "ACTIVE";
    data.activatedAt = new Date();
  }

  const updated = await prisma.debtTransfer.update({
    where: { id: t.id },
    data,
  });

  if (willBeBothAccepted) {
    // Création de 2 settlements virtuels :
    //   - Settlement 1 : fromUser → creditor (paiement virtuel pour annuler la dette)
    //   - Settlement 2 : assumeUser → creditor (nouvelle dette à payer)
    // En réalité, pour rester simple côté MVP, on crée juste un settlement qui
    // reflète la nouvelle obligation : assumeUser doit la somme à creditor.
    // L'ancienne dette de fromUser→creditor sera réduite par les balances
    // si on inscrit aussi un settlement A→B comme "réglé".
    await prisma.$transaction([
      // Annule la dette A→B (settlement virtuel CONFIRMED)
      prisma.settlement.create({
        data: {
          groupId: t.groupId,
          fromUserId: t.fromUserId,
          toUserId: t.creditorUserId,
          amount: t.amount,
          currency: t.currency,
          status: "CONFIRMED",
          notes: `Transfert de dette ID ${t.id} : reprise par ${t.assumeUser.displayName}`,
          paidAt: new Date(),
          confirmedAt: new Date(),
        },
      }),
      // Crée la nouvelle dette C→B (PROPOSED, à régler)
      prisma.settlement.create({
        data: {
          groupId: t.groupId,
          fromUserId: t.assumeUserId,
          toUserId: t.creditorUserId,
          amount: t.amount,
          currency: t.currency,
          status: "PROPOSED",
          notes: `Transfert de dette ID ${t.id} : reprise de ${t.fromUser.displayName}`,
        },
      }),
    ]);

    // Notif aux 3 acteurs + au proposer
    const involved = [t.fromUserId, t.assumeUserId, t.creditorUserId]
      .filter((id, i, arr) => arr.indexOf(id) === i);
    for (const uid of involved) {
      void notifyOne(uid, {
        kind: "DEBT_TRANSFER_ACCEPTED",
        title: "Transfert de dette accepté ✓",
        body: `${t.fromUser.displayName} → ${t.assumeUser.displayName} → ${t.creditor.displayName} : ${t.amount.toString()} ${t.currency}`,
        link: `/dashboard/groups/${t.groupId}`,
        payload: { transferId: t.id, groupId: t.groupId },
      });
    }
  } else {
    // Notif à l'autre décideur encore en attente
    const otherUid =
      role === "ASSUMER" ? t.creditorUserId : t.assumeUserId;
    void notifyOne(otherUid, {
      kind: "DEBT_TRANSFER_PROPOSED",
      title: "Une partie du transfert a été acceptée",
      body: `${role === "ASSUMER" ? t.assumeUser.displayName : t.creditor.displayName} a accepté. Tu dois maintenant valider.`,
      link: `/dashboard/groups/${t.groupId}`,
      payload: { transferId: t.id, groupId: t.groupId },
    });
  }

  return updated;
}

/** Annuler avant ACTIVE (par le proposer ou un admin) */
export async function cancelDebtTransfer(input: {
  transferId: string;
  actorUserId: string;
}) {
  const t = await prisma.debtTransfer.findUnique({
    where: { id: input.transferId },
  });
  if (!t) throw Errors.notFound("Transfert introuvable");
  if (t.status !== "PROPOSED") {
    throw Errors.badRequest("Seul un transfert PROPOSED peut être annulé");
  }
  if (t.proposedById !== input.actorUserId) {
    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: t.groupId, userId: input.actorUserId },
      },
    });
    if (member?.role !== "ADMIN") {
      throw Errors.forbidden(
        "Seul le proposer ou un admin peut annuler",
      );
    }
  }
  return prisma.debtTransfer.update({
    where: { id: t.id },
    data: { status: "CANCELLED" },
  });
}
