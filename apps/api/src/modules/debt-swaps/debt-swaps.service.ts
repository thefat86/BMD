import Decimal from "decimal.js";
import { DebtSwapStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { computeBalanceWithSuggestions } from "../settlements/balance.service.js";
import { getGroupForMember } from "../groups/groups.service.js";

/**
 * MODULE M09 · SWAP DE DETTES (compensation triangulaire / N-aire)
 *
 * Principe :
 *  - Les dépenses partagées créent des dettes croisées entre membres.
 *  - L'algorithme de simplification (M07) propose un nombre minimal de transactions
 *    qui apurent tous les soldes.
 *  - Le SWAP est l'acte FORMEL où tous les concernés ACCEPTENT cette simplification.
 *  - Une fois accepté, ça devient le plan de règlement officiel du groupe.
 *
 * Garde-fous :
 *  - Tous les participants impliqués doivent explicitement accepter.
 *  - Si une partie REJETTE → le swap est annulé.
 *  - Délai d'expiration de 48h.
 *  - Toutes les transitions sont auditées (timestamps).
 */

const SWAP_TTL_HOURS = 48;

// ============================================================
// CRÉER une proposition de swap basée sur les balances actuelles
// ============================================================

export async function proposeSwap(input: {
  groupId: string;
  actorUserId: string;
  description?: string;
}) {
  const group = await getGroupForMember(input.groupId, input.actorUserId);

  // Vérifier qu'il n'y a pas déjà un swap PROPOSED actif sur ce groupe
  const existing = await prisma.debtSwap.findFirst({
    where: {
      groupId: input.groupId,
      status: "PROPOSED",
      expiresAt: { gt: new Date() },
    },
  });
  if (existing) {
    throw Errors.conflict(
      "Un swap est déjà en cours sur ce groupe. Annule-le ou attends qu'il soit résolu.",
    );
  }

  // Calculer les balances + suggestions actuelles
  const { currency, balances, suggestions } =
    await computeBalanceWithSuggestions(input.groupId, input.actorUserId);

  if (suggestions.length === 0) {
    throw Errors.badRequest(
      "Aucune dette à compenser dans ce groupe (soldes équilibrés)",
    );
  }

  // Calcul du "savings" = réduction du nombre de transactions
  // Ici on considère qu'avant le swap, dans le pire cas, il faudrait n - 1 transactions
  // Le savings c'est la SOMME des montants qui n'ont plus besoin de circuler
  // Pour simplifier : on prend la somme totale des dettes positives (= ce que le groupe doit "régler" globalement)
  const totalToSettle = balances
    .filter((b) => b.net.greaterThan(new Decimal(0)))
    .reduce((acc, b) => acc.plus(b.net), new Decimal(0));

  // Participants = tous les membres avec un solde non nul
  const involvedUserIds = balances
    .filter((b) => !b.net.isZero() && b.net.abs().greaterThan(new Decimal("0.01")))
    .map((b) => b.userId);

  if (involvedUserIds.length < 2) {
    throw Errors.badRequest("Au moins 2 membres doivent avoir des soldes non nuls");
  }

  // Vérifier que l'actor est lui-même impliqué
  if (!involvedUserIds.includes(input.actorUserId)) {
    throw Errors.forbidden(
      "Tu ne peux proposer un swap que si tu es toi-même concerné(e) par les dettes",
    );
  }

  const expiresAt = new Date(Date.now() + SWAP_TTL_HOURS * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const swap = await tx.debtSwap.create({
      data: {
        groupId: input.groupId,
        proposedById: input.actorUserId,
        description:
          input.description ??
          `Compensation de ${suggestions.length} transaction(s)`,
        totalSavedAmount: new Prisma.Decimal(totalToSettle.toString()),
        expiresAt,
        status: "PROPOSED",
        participants: {
          create: involvedUserIds.map((userId) => ({
            userId,
            // Le proposeur s'auto-accepte
            ...(userId === input.actorUserId
              ? { acceptedAt: new Date() }
              : {}),
          })),
        },
        legs: {
          create: suggestions.map((s) => ({
            fromUserId: s.fromUserId,
            toUserId: s.toUserId,
            amount: new Prisma.Decimal(s.amount.toString()),
            currency: s.currency,
          })),
        },
      },
      include: {
        participants: { include: { user: true } },
        legs: true,
      },
    });
    return swap;
  });
}

// ============================================================
// ACCEPT / REJECT / CANCEL
// ============================================================

export async function acceptSwap(input: { swapId: string; actorUserId: string }) {
  const swap = await getSwapForUser(input.swapId, input.actorUserId);
  ensureLive(swap);

  const myParticipation = swap.participants.find(
    (p) => p.userId === input.actorUserId,
  );
  if (!myParticipation) {
    throw Errors.forbidden("Tu n'es pas concerné par ce swap");
  }
  if (myParticipation.acceptedAt) {
    throw Errors.conflict("Tu as déjà accepté ce swap");
  }
  if (myParticipation.rejectedAt) {
    throw Errors.conflict("Tu as déjà refusé ce swap");
  }

  return prisma.$transaction(async (tx) => {
    await tx.debtSwapParticipant.update({
      where: { id: myParticipation.id },
      data: { acceptedAt: new Date() },
    });

    // Si TOUT le monde a accepté → swap ACCEPTED
    const reloaded = await tx.debtSwap.findUnique({
      where: { id: input.swapId },
      include: { participants: true },
    });
    const allAccepted = reloaded!.participants.every((p) => p.acceptedAt);
    if (allAccepted) {
      await tx.debtSwap.update({
        where: { id: input.swapId },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      });
    }

    return tx.debtSwap.findUnique({
      where: { id: input.swapId },
      include: { participants: { include: { user: true } }, legs: true },
    });
  });
}

export async function rejectSwap(input: { swapId: string; actorUserId: string }) {
  const swap = await getSwapForUser(input.swapId, input.actorUserId);
  ensureLive(swap);

  const myParticipation = swap.participants.find(
    (p) => p.userId === input.actorUserId,
  );
  if (!myParticipation) {
    throw Errors.forbidden("Tu n'es pas concerné par ce swap");
  }
  if (myParticipation.rejectedAt) {
    throw Errors.conflict("Tu as déjà refusé ce swap");
  }

  return prisma.$transaction(async (tx) => {
    await tx.debtSwapParticipant.update({
      where: { id: myParticipation.id },
      data: { rejectedAt: new Date() },
    });
    // 1 seul rejet = swap REJECTED
    await tx.debtSwap.update({
      where: { id: input.swapId },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    return tx.debtSwap.findUnique({
      where: { id: input.swapId },
      include: { participants: { include: { user: true } }, legs: true },
    });
  });
}

export async function cancelSwap(input: { swapId: string; actorUserId: string }) {
  const swap = await getSwapForUser(input.swapId, input.actorUserId);
  if (swap.proposedById !== input.actorUserId) {
    throw Errors.forbidden("Seul le proposeur peut annuler le swap");
  }
  ensureLive(swap);

  return prisma.debtSwap.update({
    where: { id: input.swapId },
    data: { status: "CANCELLED", resolvedAt: new Date() },
  });
}

// ============================================================
// HELPERS
// ============================================================

async function getSwapForUser(swapId: string, actorUserId: string) {
  const swap = await prisma.debtSwap.findUnique({
    where: { id: swapId },
    include: {
      participants: { include: { user: true } },
      legs: true,
    },
  });
  if (!swap) throw Errors.notFound("Swap introuvable");
  // Vérifier que l'actor est membre du groupe
  await getGroupForMember(swap.groupId, actorUserId);
  return swap;
}

function ensureLive(swap: { status: DebtSwapStatus; expiresAt: Date }): void {
  if (swap.status !== "PROPOSED") {
    throw Errors.conflict(`Swap déjà ${swap.status.toLowerCase()}`);
  }
  if (swap.expiresAt < new Date()) {
    throw Errors.conflict("Swap expiré");
  }
}

// ============================================================
// LISTER les swaps d'un groupe
// ============================================================

export async function listGroupSwaps(input: {
  groupId: string;
  actorUserId: string;
  includeResolved?: boolean;
}) {
  await getGroupForMember(input.groupId, input.actorUserId);

  return prisma.debtSwap.findMany({
    where: {
      groupId: input.groupId,
      ...(input.includeResolved
        ? {}
        : { status: "PROPOSED", expiresAt: { gt: new Date() } }),
    },
    include: {
      participants: { include: { user: true } },
      legs: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
