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
      "Une tontine, c'est avant tout une histoire de groupe 🤝 — invite au moins un autre membre avant de la créer.",
      {
        tip: "Tu peux inviter quelqu'un depuis la page du groupe, par téléphone ou par email.",
        action: "Inviter un membre",
        actionHref: `/dashboard/groups/${input.groupId}`,
      },
    );
  }

  // 1 tontine max par groupe (contrainte schema)
  const existing = await prisma.tontine.findUnique({
    where: { groupId: input.groupId },
  });
  if (existing) {
    throw Errors.alreadyExists({
      what: "Une tontine pour ce groupe",
      tip: "Un groupe ne peut héberger qu'une tontine à la fois. Annule l'actuelle ou attends qu'elle soit terminée pour en relancer une.",
    });
  }

  const amount = new Prisma.Decimal(input.contributionAmount);
  if (amount.lessThanOrEqualTo(0)) {
    throw Errors.invalidFormula({
      what: "le montant de la cotisation",
      why: "Le montant saisi est nul ou négatif.",
      fix: "Indique un montant positif (ex: 50, 100, 200…) — c'est ce que chaque membre versera à chaque tour.",
    });
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
  if (!tontine) throw Errors.notFound("Cette tontine est introuvable 🤔");
  if (tontine.status !== "DRAFT") {
    throw Errors.invalidState({
      what: "Cette tontine",
      currentState:
        tontine.status === "ACTIVE"
          ? "déjà en cours 🌀"
          : tontine.status === "COMPLETED"
            ? "déjà terminée 🏁"
            : "annulée",
      requiredState: "encore en brouillon (DRAFT)",
      tip:
        tontine.status === "ACTIVE"
          ? "Ta tontine roule déjà — pas besoin de la relancer."
          : "Une tontine ne peut être activée qu'une seule fois.",
    });
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
      throw Errors.invalidFormula({
        what: "l'ordre des bénéficiaires",
        why: "En mode manuel, tu dois choisir toi-même qui passe en 1er, 2e, 3e…",
        fix: "Glisse-dépose les membres dans l'ordre souhaité avant d'activer la tontine.",
      });
    }
    // Vérifier que chaque userId fourni est bien membre, et qu'on couvre tous les membres
    const set = new Set(input.beneficiaryOrder);
    if (set.size !== memberIds.length) {
      throw Errors.invalidFormula({
        what: "l'ordre des bénéficiaires",
        why: `Tu as fourni ${set.size} membres uniques, mais le groupe en contient ${memberIds.length}.`,
        fix: "Chaque membre du groupe doit apparaître exactement une fois dans l'ordre.",
      });
    }
    for (const id of input.beneficiaryOrder) {
      if (!memberIds.includes(id)) {
        throw Errors.invalidFormula({
          what: "l'ordre des bénéficiaires",
          why: "Un des membres listés n'appartient pas (plus ?) au groupe.",
          fix: "Réinvite ce membre dans le groupe ou retire-le de l'ordre choisi.",
        });
      }
    }
    order = input.beneficiaryOrder;
  } else if (tontine.orderMode === "AUCTION") {
    // En mode Hui (enchères), l'ordre dépend des enchères placées tour
    // par tour. À l'activation, on initialise les bénéficiaires "par
    // défaut" (ordre arbitraire) qui seront overridés à la clôture
    // de chaque enchère (closeBidding).
    order = shuffle(memberIds);
  } else {
    throw Errors.badRequest(
      `Le mode "${tontine.orderMode}" n'est pas encore disponible 🚧`,
      {
        tip: "Modes pris en charge : RANDOM (tirage au sort), MANUAL (ordre choisi par l'admin), AUCTION (enchères Hui).",
      },
    );
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
  if (!contrib) throw Errors.notFound("Cette cotisation est introuvable 🔍");
  if (contrib.contributorUserId !== input.actorUserId) {
    throw Errors.forbidden(
      "Seule la personne qui doit payer peut marquer cette cotisation comme réglée 🤝",
      {
        tip: "Si tu es l'admin et que tu veux confirmer un paiement, utilise plutôt le bouton « Confirmer la réception ».",
      },
    );
  }
  if (contrib.status !== "PENDING") {
    throw Errors.invalidState({
      what: "Cette cotisation",
      currentState:
        contrib.status === "PAID"
          ? "déjà déclarée payée 💸"
          : contrib.status === "CONFIRMED"
            ? "déjà confirmée par le bénéficiaire ✅"
            : "marquée manquée",
      tip: "Tu n'as plus rien à faire de ton côté — l'étape suivante est la confirmation par le bénéficiaire.",
    });
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
  if (!contrib) throw Errors.notFound("Cette cotisation est introuvable 🔍");

  // Autorisation : bénéficiaire du tour OU admin/trésorier du groupe
  const isBeneficiary = contrib.turn.beneficiaryUserId === input.actorUserId;
  if (!isBeneficiary) {
    await assertRole(contrib.turn.tontine.groupId, input.actorUserId, [
      "ADMIN",
      "TREASURER",
    ]);
  }

  if (contrib.status !== "PAID") {
    throw Errors.invalidState({
      what: "Cette cotisation",
      currentState:
        contrib.status === "PENDING"
          ? "encore en attente du paiement"
          : contrib.status === "CONFIRMED"
            ? "déjà confirmée ✅"
            : "marquée manquée",
      tip:
        contrib.status === "PENDING"
          ? "Le contributeur doit d'abord déclarer avoir payé avant que tu puisses confirmer la réception."
          : "Pas besoin de confirmer deux fois — c'est déjà fait.",
    });
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
  if (!turn) throw Errors.notFound("Ce tour de tontine est introuvable 🔍");
  await assertRole(turn.tontine.groupId, input.actorUserId, [
    "ADMIN",
    "TREASURER",
  ]);

  if (turn.status === "DISTRIBUTED") {
    throw Errors.invalidState({
      what: "Ce tour",
      currentState: "déjà distribué 🎉",
      tip: "Le pot a déjà été remis au bénéficiaire — c'est dans l'historique.",
    });
  }
  if (turn.status === "CANCELLED") {
    throw Errors.invalidState({
      what: "Ce tour",
      currentState: "annulé",
      tip: "Tu peux passer au tour suivant ou réactiver une nouvelle tontine.",
    });
  }

  const notConfirmed = turn.contributions.filter(
    (c) => c.status !== "CONFIRMED",
  );
  if (notConfirmed.length > 0) {
    throw Errors.invalidState({
      what: "Ce tour",
      currentState: `en attente de ${notConfirmed.length} cotisation${notConfirmed.length > 1 ? "s" : ""} non encore confirmée${notConfirmed.length > 1 ? "s" : ""}`,
      tip: "Pour distribuer le pot, il faut que toutes les cotisations soient confirmées par le bénéficiaire (ou un admin). Vérifie l'onglet « Cotisations » pour voir qui n'a pas encore validé.",
    });
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
  if (!tontine) throw Errors.notFound("Cette tontine est introuvable 🔍");
  await assertRole(tontine.groupId, input.actorUserId, ["ADMIN"]);

  if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") {
    throw Errors.invalidState({
      what: "Cette tontine",
      currentState:
        tontine.status === "COMPLETED" ? "déjà terminée 🏁" : "déjà annulée",
      tip: "Tu peux en créer une nouvelle dans ce groupe quand tu veux.",
    });
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
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");

  const groupId = turn.tontine.groupId;
  // Permission : bénéficiaire OU admin du groupe
  const member = turn.tontine.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.notMember("ce groupe");
  const canSchedule =
    turn.beneficiaryUserId === input.actorUserId || member.role === "ADMIN";
  if (!canSchedule) {
    throw Errors.forbidden(
      "Seul le bénéficiaire du tour ou un admin du groupe peut fixer la date 📅",
      {
        tip: "Si tu es le bénéficiaire, vérifie que ton compte correspond bien au tour. Sinon, contacte un admin.",
      },
    );
  }

  // Contrainte fenêtre : ±15 jours autour de dueDate
  const dueMs = turn.dueDate.getTime();
  const requestedMs = input.scheduledDate.getTime();
  const FIFTEEN_DAYS = 15 * 24 * 3600 * 1000;
  if (Math.abs(requestedMs - dueMs) > FIFTEEN_DAYS) {
    const dueStr = turn.dueDate.toLocaleDateString("fr-FR");
    throw Errors.invalidFormula({
      what: "la date choisie",
      why: `Pour préserver le rythme, la date doit rester dans une fenêtre de ±15 jours autour du ${dueStr}.`,
      fix: "Choisis une date plus proche de la date initiale du tour, ou demande à un admin de décaler la tontine entière.",
    });
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
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");
  if (!turn.scheduledDate) {
    throw Errors.invalidState({
      what: "Ce tour",
      currentState: "sans date précise pour l'instant",
      tip: "Le bénéficiaire n'a pas encore choisi sa date dans le mois. Tu pourras confirmer dès qu'il l'aura fixée — tu recevras une notif.",
    });
  }
  const isMember = turn.tontine.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.notMember("ce groupe");

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
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");
  const isMember = turn.tontine.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.notMember("ce groupe");

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
  if (!isMember) throw Errors.notMember("ce groupe");

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

/* =================================================================
 * HUI / ENCHÈRES (spec §3.4)
 * =================================================================
 * Mode AUCTION : pour chaque tour, les membres posent une enchère.
 * Le plus offrant gagne le pot (et son enchère est répartie en
 * "intérêts" entre les autres). C'est le système Hui asiatique.
 */

/**
 * Pose ou met à jour une enchère sur un tour de tontine.
 * Conditions :
 *  - Le tour doit être en mode AUCTION (orderMode de la tontine)
 *  - Le tour doit être PENDING (pas encore distribué)
 *  - Le membre doit être membre du groupe
 *  - L'enchère doit être > 0
 *
 * Si une enchère existe déjà pour ce membre, elle est remplacée.
 */
export async function placeBid(input: {
  turnId: string;
  actorUserId: string;
  amount: string;
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
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");
  if (turn.tontine.orderMode !== "AUCTION") {
    throw Errors.invalidState({
      what: "Cette tontine",
      currentState: `configurée en mode "${turn.tontine.orderMode}"`,
      tip: "Les enchères (Hui) ne fonctionnent que sur les tontines créées avec le mode AUCTION. À la création, choisis l'option « Enchères » plutôt que « Tirage au sort » ou « Ordre choisi ».",
    });
  }
  if (turn.status !== "PENDING") {
    throw Errors.invalidState({
      what: "Les enchères de ce tour",
      currentState:
        turn.status === "IN_PROGRESS"
          ? "déjà clôturées (le gagnant est désigné) 🏆"
          : turn.status === "DISTRIBUTED"
            ? "terminées — le pot a été distribué 🎉"
            : "fermées",
      tip: "Tu peux suivre les prochains tours qui sont encore ouverts aux enchères.",
    });
  }
  const isMember = turn.tontine.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.notMember("ce groupe");

  const amount = parseFloat(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Errors.invalidFormula({
      what: "ton enchère",
      why: "Une enchère à 0 ou négative, ce n'est plus vraiment une mise 😉",
      fix: "Indique un montant positif — c'est ce que tu acceptes de céder aux autres si tu remportes le pot ce tour-ci.",
    });
  }

  return prisma.tontineBid.upsert({
    where: {
      turnId_bidderId: {
        turnId: input.turnId,
        bidderId: input.actorUserId,
      },
    },
    create: {
      turnId: input.turnId,
      bidderId: input.actorUserId,
      amount: amount as any,
    },
    update: {
      amount: amount as any,
    },
  });
}

/**
 * Retire son enchère sur un tour.
 */
export async function withdrawBid(input: {
  turnId: string;
  actorUserId: string;
}) {
  await prisma.tontineBid.deleteMany({
    where: {
      turnId: input.turnId,
      bidderId: input.actorUserId,
    },
  });
  return { withdrawn: true };
}

/**
 * Liste les enchères d'un tour (visible par tous les membres pour
 * la transparence — c'est le principe de Hui).
 */
export async function listBids(input: {
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
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");
  const isMember = turn.tontine.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.notMember("ce groupe");

  return prisma.tontineBid.findMany({
    where: { turnId: input.turnId },
    orderBy: { amount: "desc" },
    include: {
      bidder: {
        select: { id: true, displayName: true, avatar: true },
      },
    },
  });
}

/**
 * Clôture les enchères : déclare le gagnant, met à jour le bénéficiaire
 * du tour, et passe le tour en IN_PROGRESS pour cotisations.
 *
 * Réservé à un admin du groupe.
 */
export async function closeBidding(input: {
  turnId: string;
  actorUserId: string;
}) {
  const turn = await prisma.tontineTurn.findUnique({
    where: { id: input.turnId },
    include: {
      tontine: {
        include: {
          group: {
            include: { members: { select: { userId: true, role: true } } },
          },
        },
      },
    },
  });
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");
  if (turn.tontine.orderMode !== "AUCTION") {
    throw Errors.invalidState({
      what: "Cette tontine",
      currentState: `configurée en mode "${turn.tontine.orderMode}"`,
      tip: "Le bouton « Clôturer les enchères » n'est utile qu'en mode AUCTION (Hui).",
    });
  }
  if (turn.status !== "PENDING") {
    throw Errors.invalidState({
      what: "Les enchères de ce tour",
      currentState: "déjà clôturées 🏆",
      tip: "Le gagnant a déjà été désigné — passe au tour suivant.",
    });
  }
  const member = turn.tontine.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member || member.role !== "ADMIN") {
    throw Errors.roleRequired("ADMIN", "la clôture des enchères");
  }

  // Trouve la mise la plus haute
  const top = await prisma.tontineBid.findFirst({
    where: { turnId: input.turnId },
    orderBy: { amount: "desc" },
  });
  if (!top) {
    throw Errors.badRequest(
      "Personne n'a encore placé d'enchère sur ce tour 🤷",
      {
        tip: "Pour clôturer, il faut au moins une enchère. Invite les membres à miser depuis leur dashboard.",
      },
    );
  }

  // Marque le gagnant + override le bénéficiaire du tour
  await prisma.$transaction([
    prisma.tontineBid.updateMany({
      where: { turnId: input.turnId },
      data: { won: false },
    }),
    prisma.tontineBid.update({
      where: { id: top.id },
      data: { won: true },
    }),
    prisma.tontineTurn.update({
      where: { id: input.turnId },
      data: {
        beneficiaryUserId: top.bidderId,
        status: "IN_PROGRESS",
      },
    }),
  ]);

  return {
    winnerUserId: top.bidderId,
    winningBid: top.amount.toString(),
  };
}
