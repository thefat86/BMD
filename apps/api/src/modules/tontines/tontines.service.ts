import {
  Prisma,
  TontineFrequency,
  BeneficiaryOrderMode,
  TontineStatus,
  TurnStatus,
  ContributionStatus,
} from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { assertRole, getGroupForMember } from "../groups/groups.service.js";

/**
 * MODULE M08 · TONTINES
 *
 * Une tontine = épargne collective rotative entre N membres :
 *  - Chaque "tour" (turn) un membre est désigné bénéficiaire
 *  - Tous les autres lui versent leur cotisation à cette date
 *  - Cycle complet = N tours
 *
 * Anti-fraude :
 *  - Une cotisation passe par PENDING → PAID (par le contributeur)
 *    → CONFIRMED (par le bénéficiaire ou l'admin)
 *  - Le pot ne peut être distribué que quand TOUTES les cotisations sont CONFIRMED
 *  - Toutes les transitions sont auditées (timestamps)
 */

// ============================================================
// HELPERS
// ============================================================

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function addPeriod(date: Date, freq: TontineFrequency, n: number): Date {
  const d = new Date(date);
  if (freq === "WEEKLY") d.setDate(d.getDate() + 7 * n);
  else if (freq === "BIWEEKLY") d.setDate(d.getDate() + 14 * n);
  else d.setMonth(d.getMonth() + n); // MONTHLY
  return d;
}

// ============================================================
// CRUD TONTINE
// ============================================================

export interface CreateTontineInput {
  groupId: string;
  actorUserId: string;
  contributionAmount: string; // decimal as string
  currency?: string;
  frequency: TontineFrequency;
  startDate: Date;
  orderMode?: BeneficiaryOrderMode;
  centralizedPot?: boolean;
  notes?: string;
}

export async function createTontine(input: CreateTontineInput) {
  const group = await getGroupForMember(input.groupId, input.actorUserId);
  await assertRole(input.groupId, input.actorUserId, ["ADMIN", "TREASURER"]);

  if (group.members.length < 2) {
    throw Errors.badRequest(
      "Une tontine nécessite au moins 2 membres dans le groupe",
    );
  }

  // 1 tontine max par groupe (contrainte schema)
  const existing = await prisma.tontine.findUnique({
    where: { groupId: input.groupId },
  });
  if (existing) {
    throw Errors.conflict(
      "Ce groupe a déjà une tontine. Annule-la avant d'en créer une nouvelle.",
    );
  }

  const amount = new Prisma.Decimal(input.contributionAmount);
  if (amount.lessThanOrEqualTo(0)) {
    throw Errors.badRequest("Le montant de la cotisation doit être positif");
  }

  return prisma.tontine.create({
    data: {
      groupId: input.groupId,
      contributionAmount: amount,
      currency: input.currency ?? group.defaultCurrency,
      frequency: input.frequency,
      startDate: input.startDate,
      orderMode: input.orderMode ?? "MANUAL",
      centralizedPot: input.centralizedPot ?? true,
      notes: input.notes,
      status: "DRAFT",
    },
  });
}

/**
 * Activer une tontine = générer les N turns + créer toutes les cotisations PENDING.
 * Si orderMode = RANDOM, l'ordre est tiré au sort.
 * Si orderMode = MANUAL, l'admin doit fournir beneficiaryOrder (liste d'userIds).
 */
export async function activateTontine(input: {
  tontineId: string;
  actorUserId: string;
  beneficiaryOrder?: string[]; // requis si MANUAL
}) {
  const tontine = await prisma.tontine.findUnique({
    where: { id: input.tontineId },
    include: {
      group: { include: { members: { include: { user: true } } } },
    },
  });
  if (!tontine) throw Errors.notFound("Tontine introuvable");
  if (tontine.status !== "DRAFT") {
    throw Errors.conflict(
      `Tontine déjà ${tontine.status.toLowerCase()} — activation impossible`,
    );
  }
  await assertRole(tontine.groupId, input.actorUserId, [
    "ADMIN",
    "TREASURER",
  ]);

  const memberIds = tontine.group.members.map((m) => m.userId);

  let order: string[];
  if (tontine.orderMode === "RANDOM") {
    order = shuffle(memberIds);
  } else if (tontine.orderMode === "MANUAL") {
    if (!input.beneficiaryOrder || input.beneficiaryOrder.length === 0) {
      throw Errors.badRequest(
        "Pour le mode MANUAL, fournis l'ordre des bénéficiaires (beneficiaryOrder)",
      );
    }
    // Vérifier que chaque userId fourni est bien membre, et qu'on couvre tous les membres
    const set = new Set(input.beneficiaryOrder);
    if (set.size !== memberIds.length) {
      throw Errors.badRequest(
        `beneficiaryOrder doit contenir ${memberIds.length} userIds uniques (un par membre)`,
      );
    }
    for (const id of input.beneficiaryOrder) {
      if (!memberIds.includes(id)) {
        throw Errors.badRequest(`User ${id} n'est pas membre de ce groupe`);
      }
    }
    order = input.beneficiaryOrder;
  } else {
    throw Errors.badRequest(`Mode ${tontine.orderMode} non encore supporté`);
  }

  // Créer les turns + contributions en transaction
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tontine.update({
      where: { id: input.tontineId },
      data: { status: "ACTIVE" },
    });

    for (let i = 0; i < order.length; i++) {
      const beneficiaryId = order[i]!;
      const dueDate = addPeriod(tontine.startDate, tontine.frequency, i);

      const turn = await tx.tontineTurn.create({
        data: {
          tontineId: tontine.id,
          turnNumber: i + 1,
          beneficiaryUserId: beneficiaryId,
          dueDate,
          status: i === 0 ? "IN_PROGRESS" : "PENDING",
        },
      });

      // Une cotisation par membre (y compris le bénéficiaire si tu le souhaites,
      // ici on exclut le bénéficiaire = il ne se paie pas à lui-même)
      const contributors = memberIds.filter((id) => id !== beneficiaryId);
      await tx.tontineContribution.createMany({
        data: contributors.map((cid) => ({
          turnId: turn.id,
          contributorUserId: cid,
          amount: tontine.contributionAmount,
          status: "PENDING" as ContributionStatus,
        })),
      });
    }

    return updated;
  });
}

/**
 * Récupère une tontine avec tous ses turns + contributions, pour l'affichage.
 */
export async function getTontineByGroup(groupId: string, actorUserId: string) {
  await getGroupForMember(groupId, actorUserId);

  return prisma.tontine.findUnique({
    where: { groupId },
    include: {
      turns: {
        orderBy: { turnNumber: "asc" },
        include: {
          beneficiary: {
            select: { id: true, displayName: true, avatar: true },
          },
          contributions: {
            include: {
              contributor: {
                select: { id: true, displayName: true, avatar: true },
              },
            },
          },
        },
      },
    },
  });
}

// ============================================================
// CONTRIBUTIONS — workflow de paiement
// ============================================================

/** Le contributeur déclare avoir payé */
export async function markContributionPaid(input: {
  contributionId: string;
  actorUserId: string;
  paymentMethod?: string;
  paymentReference?: string;
}) {
  const contrib = await prisma.tontineContribution.findUnique({
    where: { id: input.contributionId },
    include: { turn: { include: { tontine: true } } },
  });
  if (!contrib) throw Errors.notFound("Cotisation introuvable");
  if (contrib.contributorUserId !== input.actorUserId) {
    throw Errors.forbidden("Seul le contributeur peut marquer comme payé");
  }
  if (contrib.status !== "PENDING") {
    throw Errors.conflict(
      `Cotisation déjà ${contrib.status.toLowerCase()}`,
    );
  }

  return prisma.tontineContribution.update({
    where: { id: contrib.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
    },
  });
}

/** Le bénéficiaire (ou un admin) confirme la réception */
export async function confirmContribution(input: {
  contributionId: string;
  actorUserId: string;
}) {
  const contrib = await prisma.tontineContribution.findUnique({
    where: { id: input.contributionId },
    include: {
      turn: { include: { tontine: { include: { group: true } } } },
    },
  });
  if (!contrib) throw Errors.notFound("Cotisation introuvable");

  // Autorisation : bénéficiaire du tour OU admin/trésorier du groupe
  const isBeneficiary = contrib.turn.beneficiaryUserId === input.actorUserId;
  if (!isBeneficiary) {
    await assertRole(contrib.turn.tontine.groupId, input.actorUserId, [
      "ADMIN",
      "TREASURER",
    ]);
  }

  if (contrib.status !== "PAID") {
    throw Errors.conflict(
      `La cotisation doit être PAID avant d'être confirmée (actuellement ${contrib.status})`,
    );
  }

  return prisma.tontineContribution.update({
    where: { id: contrib.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });
}

/**
 * Distribue le pot d'un tour (clôture le tour).
 * Toutes les cotisations doivent être CONFIRMED.
 * Le tour suivant passe automatiquement à IN_PROGRESS.
 */
export async function distributeTurn(input: {
  turnId: string;
  actorUserId: string;
}) {
  const turn = await prisma.tontineTurn.findUnique({
    where: { id: input.turnId },
    include: {
      tontine: true,
      contributions: true,
    },
  });
  if (!turn) throw Errors.notFound("Tour introuvable");
  await assertRole(turn.tontine.groupId, input.actorUserId, [
    "ADMIN",
    "TREASURER",
  ]);

  if (turn.status === "DISTRIBUTED") {
    throw Errors.conflict("Ce tour a déjà été distribué");
  }
  if (turn.status === "CANCELLED") {
    throw Errors.conflict("Tour annulé");
  }

  const notConfirmed = turn.contributions.filter(
    (c) => c.status !== "CONFIRMED",
  );
  if (notConfirmed.length > 0) {
    throw Errors.badRequest(
      `${notConfirmed.length} cotisation(s) non encore confirmée(s) — distribution impossible`,
    );
  }

  return prisma.$transaction(async (tx) => {
    // Marquer ce tour comme distribué
    const updated = await tx.tontineTurn.update({
      where: { id: turn.id },
      data: { status: "DISTRIBUTED", distributedAt: new Date() },
    });

    // Activer le tour suivant s'il existe
    const nextTurn = await tx.tontineTurn.findFirst({
      where: {
        tontineId: turn.tontineId,
        turnNumber: turn.turnNumber + 1,
      },
    });
    if (nextTurn) {
      await tx.tontineTurn.update({
        where: { id: nextTurn.id },
        data: { status: "IN_PROGRESS" },
      });
    } else {
      // Tous les tours sont distribués → tontine COMPLETED
      await tx.tontine.update({
        where: { id: turn.tontineId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    return updated;
  });
}

/** Annule une tontine entière (admin uniquement) */
export async function cancelTontine(input: {
  tontineId: string;
  actorUserId: string;
}) {
  const tontine = await prisma.tontine.findUnique({
    where: { id: input.tontineId },
  });
  if (!tontine) throw Errors.notFound("Tontine introuvable");
  await assertRole(tontine.groupId, input.actorUserId, ["ADMIN"]);

  if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") {
    throw Errors.conflict(`Tontine déjà ${tontine.status.toLowerCase()}`);
  }

  return prisma.tontine.update({
    where: { id: input.tontineId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

// ============================================================
// STATISTIQUES
// ============================================================

/** Compte le nombre de cotisations par statut sur l'ensemble de la tontine */
export interface TontineStats {
  totalTurns: number;
  completedTurns: number;
  currentTurnNumber: number | null;
  totalContributions: number;
  pendingCount: number;
  paidCount: number;
  confirmedCount: number;
  missedCount: number;
  totalPotPerTurn: string;
}

export async function getTontineStats(
  tontineId: string,
): Promise<TontineStats> {
  const tontine = await prisma.tontine.findUnique({
    where: { id: tontineId },
    include: {
      turns: {
        include: { contributions: true },
        orderBy: { turnNumber: "asc" },
      },
    },
  });
  if (!tontine) throw Errors.notFound();

  const totalTurns = tontine.turns.length;
  const completedTurns = tontine.turns.filter(
    (t) => t.status === "DISTRIBUTED",
  ).length;
  const current = tontine.turns.find((t) => t.status === "IN_PROGRESS");

  const allContribs = tontine.turns.flatMap((t) => t.contributions);
  const count = (s: ContributionStatus) =>
    allContribs.filter((c) => c.status === s).length;

  // Pot par tour : (N - 1) × cotisationAmount (le bénéficiaire ne se paie pas à lui-même)
  const memberCount = tontine.turns.length; // = nb membres
  const totalPotPerTurn = new Prisma.Decimal(tontine.contributionAmount).times(
    memberCount > 1 ? memberCount - 1 : 1,
  );

  return {
    totalTurns,
    completedTurns,
    currentTurnNumber: current ? current.turnNumber : null,
    totalContributions: allContribs.length,
    pendingCount: count("PENDING"),
    paidCount: count("PAID"),
    confirmedCount: count("CONFIRMED"),
    missedCount: count("MISSED"),
    totalPotPerTurn: totalPotPerTurn.toString(),
  };
}

// ============================================================
// SCHEDULING DES TOURS — chaque bénéficiaire fixe sa date dans le mois
// ============================================================

/**
 * Le bénéficiaire d'un tour fixe sa date exacte.
 * Contraintes :
 *  - Seul le bénéficiaire du tour peut le faire (ou un admin du groupe)
 *  - La date doit rester dans la fenêtre "du mois" de dueDate
 *    Mois = ±15 jours autour de dueDate (souple pour weekly aussi)
 *  - Une fois fixée, tous les autres membres reçoivent une notif et doivent acker
 */
export async function scheduleTurn(input: {
  turnId: string;
  actorUserId: string;
  scheduledDate: Date;
}) {
  const turn = await prisma.tontineTurn.findUnique({
    where: { id: input.turnId },
    include: {
      tontine: {
        include: {
          group: { include: { members: { select: { userId: true, role: true } } } },
        },
      },
      beneficiary: { select: { displayName: true } },
    },
  });
  if (!turn) throw Errors.notFound("Tour introuvable");

  const groupId = turn.tontine.groupId;
  const groupName = turn.tontine.group ? "" : "";
  // Permission : bénéficiaire OU admin du groupe
  const member = turn.tontine.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.forbidden("Pas membre de ce groupe");
  const canSchedule =
    turn.beneficiaryUserId === input.actorUserId || member.role === "ADMIN";
  if (!canSchedule) {
    throw Errors.forbidden(
      "Seul le bénéficiaire ou un admin peut fixer la date",
    );
  }

  // Contrainte fenêtre : ±15 jours autour de dueDate
  const dueMs = turn.dueDate.getTime();
  const requestedMs = input.scheduledDate.getTime();
  const FIFTEEN_DAYS = 15 * 24 * 3600 * 1000;
  if (Math.abs(requestedMs - dueMs) > FIFTEEN_DAYS) {
    throw Errors.badRequest(
      "La date choisie doit être à ±15 jours de la date prévue du tour",
    );
  }

  await prisma.$transaction([
    prisma.tontineTurn.update({
      where: { id: turn.id },
      data: {
        scheduledDate: input.scheduledDate,
        scheduledAt: new Date(),
      },
    }),
    // Reset les acks (si la date change, tout le monde doit reacker)
    prisma.tontineTurnAck.deleteMany({ where: { turnId: turn.id } }),
  ]);

  // Notif aux membres autres que le bénéficiaire
  const { notifyGroupMembers } = await import(
    "../notifications/notifications.service.js"
  );
  void notifyGroupMembers({
    groupId,
    excludeUserId: input.actorUserId,
    notification: {
      kind: "TONTINE_DATE_CHANGED",
      title: `Date fixée pour le tour ${turn.turnNumber}`,
      body: `${turn.beneficiary.displayName} a choisi le ${input.scheduledDate.toLocaleDateString("fr-FR")}. Confirme la réception de l'info.`,
      link: `/dashboard/groups/${groupId}/tontine`,
      payload: {
        groupId,
        turnId: turn.id,
        scheduledDate: input.scheduledDate.toISOString(),
      },
    },
  });

  return {
    id: turn.id,
    scheduledDate: input.scheduledDate.toISOString(),
  };
}

/**
 * Un membre accuse réception de la date choisie par le bénéficiaire.
 * Idempotent : si déjà accusé, ne change rien.
 */
export async function acknowledgeTurn(input: {
  turnId: string;
  actorUserId: string;
}) {
  const turn = await prisma.tontineTurn.findUnique({
    where: { id: input.turnId },
    include: {
      tontine: {
        include: {
          group: { include: { members: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!turn) throw Errors.notFound("Tour introuvable");
  if (!turn.scheduledDate) {
    throw Errors.badRequest(
      "Aucune date à confirmer (le bénéficiaire ne l'a pas encore fixée)",
    );
  }
  const isMember = turn.tontine.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.forbidden("Pas membre du groupe");

  await prisma.tontineTurnAck.upsert({
    where: {
      turnId_userId: {
        turnId: turn.id,
        userId: input.actorUserId,
      },
    },
    create: { turnId: turn.id, userId: input.actorUserId },
    update: {}, // idempotent
  });
  return { acknowledged: true };
}

/**
 * Liste les acks d'un tour (qui a confirmé, qui n'a pas encore).
 */
export async function listTurnAcks(input: {
  turnId: string;
  actorUserId: string;
}) {
  const turn = await prisma.tontineTurn.findUnique({
    where: { id: input.turnId },
    include: {
      tontine: {
        include: {
          group: {
            include: {
              members: {
                include: {
                  user: { select: { id: true, displayName: true } },
                },
              },
            },
          },
        },
      },
      acknowledgments: true,
    },
  });
  if (!turn) throw Errors.notFound("Tour introuvable");
  const isMember = turn.tontine.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.forbidden("Pas membre du groupe");

  const ackedSet = new Set(turn.acknowledgments.map((a) => a.userId));
  return {
    turnId: turn.id,
    scheduledDate: turn.scheduledDate?.toISOString() ?? null,
    members: turn.tontine.group.members.map((m) => ({
      userId: m.user.id,
      displayName: m.user.displayName,
      acknowledged: ackedSet.has(m.user.id),
      isBeneficiary: m.user.id === turn.beneficiaryUserId,
    })),
  };
}

/**
 * Historique des tontines d'un groupe (toutes, y compris terminées).
 * Pour le suivi long terme : "qui a gagné quoi quand" — utile sur 2+ ans.
 *
 * Retourne pour chaque tontine :
 *  - méta (frequency, currency, status, périodes)
 *  - liste des tours DISTRIBUTED avec : bénéficiaire, date effective, montant pot
 *
 * Le groupe peut avoir une seule tontine (relation 1-1 dans le schéma actuel),
 * mais on prépare le terrain pour une hypothétique relation N-N future.
 */
export async function getTontineHistory(input: {
  groupId: string;
  actorUserId: string;
}) {
  const isMember = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: input.groupId, userId: input.actorUserId },
    },
  });
  if (!isMember) throw Errors.forbidden("Pas membre du groupe");

  const tontine = await prisma.tontine.findUnique({
    where: { groupId: input.groupId },
    include: {
      turns: {
        orderBy: { turnNumber: "asc" },
        include: {
          beneficiary: { select: { id: true, displayName: true, avatar: true } },
          contributions: {
            select: {
              id: true,
              status: true,
              amount: true,
              paidAt: true,
              confirmedAt: true,
              contributor: { select: { id: true, displayName: true } },
            },
          },
        },
      },
    },
  });
  if (!tontine) {
    return { tontines: [] };
  }

  // Calcule le pot effectivement reçu pour chaque tour distribué
  // = somme des contributions confirmées
  const turns = tontine.turns.map((t) => {
    const confirmedContributions = t.contributions.filter(
      (c) => c.status === "CONFIRMED" || c.status === "PAID",
    );
    const totalReceived = confirmedContributions.reduce(
      (sum, c) => sum + parseFloat(c.amount.toString()),
      0,
    );
    return {
      id: t.id,
      turnNumber: t.turnNumber,
      beneficiary: t.beneficiary,
      dueDate: t.dueDate.toISOString(),
      scheduledDate: t.scheduledDate?.toISOString() ?? null,
      distributedAt: t.distributedAt?.toISOString() ?? null,
      status: t.status,
      totalReceived: totalReceived.toFixed(2),
      currency: tontine.currency,
      contributorCount: t.contributions.length,
      paidCount: confirmedContributions.length,
    };
  });

  return {
    tontines: [
      {
        id: tontine.id,
        frequency: tontine.frequency,
        currency: tontine.currency,
        status: tontine.status,
        contributionAmount: tontine.contributionAmount.toString(),
        startDate: tontine.startDate.toISOString(),
        completedAt: tontine.completedAt?.toISOString() ?? null,
        turns,
      },
    ],
  };
}
