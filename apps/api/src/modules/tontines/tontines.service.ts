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
import { assertRole, getGroupForMember, logActivity } from "../groups/groups.service.js";

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
  /** V231 — Nom libre choisi par l'utilisateur (« Tontine Été 2026 »…). */
  name?: string;
  /**
   * V229 — Sous-ensemble de membres participants. Si fourni, seuls ces
   * userIds seront bénéficiaires / contributeurs à l'activation. Si omis,
   * tous les membres du groupe participent (comportement historique).
   * Validation : minimum 2 userIds, tous doivent être membres du groupe.
   */
  participantUserIds?: string[];
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

  // V215.F2 — Une seule tontine ACTIVE ou DRAFT par groupe à la fois.
  // Les anciennes COMPLETED ou CANCELLED restent en BDD comme historique et
  // n'empêchent pas la création d'une nouvelle tontine — c'est le cas
  // typique d'un groupe qui fait des tontines récurrentes (annuelles,
  // événementielles…).
  const blocking = await prisma.tontine.findFirst({
    where: {
      groupId: input.groupId,
      status: { in: ["DRAFT", "ACTIVE"] },
    },
    select: { id: true, status: true },
  });
  if (blocking) {
    throw Errors.alreadyExists({
      what: "Une tontine est déjà en cours pour ce groupe",
      tip:
        blocking.status === "ACTIVE"
          ? "Termine ou annule la tontine en cours avant d'en créer une nouvelle."
          : "Une tontine est déjà en préparation (brouillon). Active-la ou supprime-la avant d'en créer une autre.",
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

  // V229 — Si l'utilisateur sélectionne un sous-ensemble de membres, on
  // valide ici : minimum 2 participants, tous doivent être membres du
  // groupe. La liste effective sera utilisée à l'activation pour générer
  // les turns / contributions uniquement pour les participants choisis.
  if (input.participantUserIds && input.participantUserIds.length > 0) {
    if (input.participantUserIds.length < 2) {
      throw Errors.invalidFormula({
        what: "les participants",
        why: "Une tontine a besoin d'au moins 2 participants.",
        fix: "Coche au moins 2 membres dans la liste avant de continuer.",
      });
    }
    const memberSet = new Set(group.members.map((m) => m.userId));
    const unique = new Set(input.participantUserIds);
    if (unique.size !== input.participantUserIds.length) {
      throw Errors.invalidFormula({
        what: "les participants",
        why: "La liste contient des doublons.",
        fix: "Chaque membre ne doit apparaître qu'une seule fois.",
      });
    }
    for (const uid of unique) {
      if (!memberSet.has(uid)) {
        throw Errors.invalidFormula({
          what: "les participants",
          why: "Un participant choisi n'appartient pas (plus ?) au groupe.",
          fix: "Réinvite ce membre dans le groupe ou retire-le de la sélection.",
        });
      }
    }
  }

  const tontine = await prisma.tontine.create({
    data: {
      groupId: input.groupId,
      // V231 — Nom libre (optionnel). Si vide on laisse `null` ; l'UI gère
      // un fallback type « Tontine du {date} ».
      ...(input.name && input.name.trim()
        ? { name: input.name.trim() }
        : {}),
      contributionAmount: amount,
      currency: input.currency ?? group.defaultCurrency,
      frequency: input.frequency,
      startDate: input.startDate,
      orderMode: input.orderMode ?? "MANUAL",
      centralizedPot: input.centralizedPot ?? true,
      notes: input.notes,
      status: "DRAFT",
    } as any,
  });

  // V220.A — Audit log : création de tontine.
  // V232 — On enrichit avec le nom (V231), la startDate et le nombre de
  // participants effectifs (qui peut être un sous-ensemble V229). Le feed
  // pourra ainsi écrire « Marc a créé la tontine « Loyer commun » : 150 €
  // par mois × 6 participants à partir du 1er avril 2026 ».
  const participantCount =
    input.participantUserIds && input.participantUserIds.length > 0
      ? input.participantUserIds.length
      : group.members.length;
  logActivity({
    groupId: input.groupId,
    actorId: input.actorUserId,
    kind: "TONTINE_CREATED",
    payload: {
      tontineId: tontine.id,
      // V232 — nom (peut être null pour tontines sans titre)
      tontineName: (tontine as any).name ?? null,
      contributionAmount: tontine.contributionAmount.toString(),
      currency: tontine.currency,
      frequency: tontine.frequency,
      memberCount: participantCount,
      // V232 — date de démarrage (ISO) — utile pour « à partir du … »
      startDate: tontine.startDate?.toISOString?.() ?? null,
      orderMode: tontine.orderMode,
      notes: input.notes ?? null,
    },
  }).catch(() => {});

  return tontine;
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
  /**
   * V229 — Sous-ensemble de membres participants. Si fourni, seuls ces
   * userIds seront utilisés pour générer turns + contributions. Doit être
   * un sous-ensemble des membres du groupe. Minimum 2.
   */
  participantUserIds?: string[];
  /**
   * V116 — Backfill « tontine déjà entamée hors BMD ».
   *
   * Tableau d'userIds qui ont déjà reçu le pot avant que la tontine soit
   * enregistrée dans BMD. Doit être un préfixe de `beneficiaryOrder`
   * (i.e. les N premiers de l'ordre choisi). Les N premiers turns sont
   * créés directement en `COMPLETED` (distributedAt = startDate + i × période)
   * avec toutes leurs contributions en `CONFIRMED`. Le turn (N+1) devient
   * `IN_PROGRESS` (au lieu du turn #1 par défaut).
   *
   * Cas d'usage : un quartier qui tourne depuis 6 mois veut enregistrer
   * sa tontine dans BMD — l'admin saisit le démarrage réel (passé) et
   * coche qui a déjà reçu, pour que la roue affiche immédiatement le bon
   * tour courant et les rangs servis en vert.
   */
  alreadyServedUserIds?: string[];
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

  // V229 — `memberIds` correspond à la liste des PARTICIPANTS à la tontine,
  // pas systématiquement tous les membres du groupe. Si l'admin a coché
  // certains membres seulement à la création, seuls ceux-là sont
  // bénéficiaires + contributeurs. Validation : sous-ensemble strict des
  // membres du groupe + minimum 2.
  const groupMemberIds = tontine.group.members.map((m) => m.userId);
  let memberIds: string[];
  if (input.participantUserIds && input.participantUserIds.length > 0) {
    if (input.participantUserIds.length < 2) {
      throw Errors.invalidFormula({
        what: "les participants",
        why: "Une tontine a besoin d'au moins 2 participants.",
        fix: "Coche au moins 2 membres dans la liste avant de continuer.",
      });
    }
    const groupSet = new Set(groupMemberIds);
    for (const uid of input.participantUserIds) {
      if (!groupSet.has(uid)) {
        throw Errors.invalidFormula({
          what: "les participants",
          why: "Un participant choisi n'appartient pas (plus ?) au groupe.",
          fix: "Réinvite ce membre dans le groupe ou retire-le de la sélection.",
        });
      }
    }
    memberIds = [...new Set(input.participantUserIds)];
  } else {
    memberIds = groupMemberIds;
  }

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

  // V116 — Validation du backfill « déjà servis ». La liste doit être un
  // préfixe strict de `order` (l'ordre dans lequel les gens ont reçu le
  // pot avant BMD). Si l'admin envoie ["B", "A"] alors que l'ordre est
  // ["A", "B", "C", "D"], c'est une incohérence (B ne peut pas avoir
  // servi avant A si A est avant B dans l'ordre).
  const alreadyServed = input.alreadyServedUserIds ?? [];
  if (alreadyServed.length > 0) {
    if (alreadyServed.length >= order.length) {
      throw Errors.invalidFormula({
        what: "les bénéficiaires déjà servis",
        why: `Tu as marqué ${alreadyServed.length} membres comme déjà servis sur ${order.length}. Si tous ont déjà reçu, la tontine est terminée — pas besoin de la créer.`,
        fix: "Garde au moins un cycle à venir pour que la tontine continue.",
      });
    }
    for (let i = 0; i < alreadyServed.length; i++) {
      if (alreadyServed[i] !== order[i]) {
        throw Errors.invalidFormula({
          what: "les bénéficiaires déjà servis",
          why: "Les membres déjà servis ne suivent pas l'ordre prévu.",
          fix: "Coche les membres dans l'ordre où ils ont effectivement reçu le pot — le 1er bénéficiaire de l'ordre doit être coché en premier.",
        });
      }
    }
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

      // V116 — Détermine le statut du turn selon le backfill :
      //   - i < alreadyServed.length → DISTRIBUTED (pot déjà remis hors BMD)
      //   - i === alreadyServed.length → IN_PROGRESS (cycle courant)
      //   - sinon → PENDING (à venir)
      // Note : TurnStatus = PENDING | IN_PROGRESS | DISTRIBUTED | CANCELLED
      // (cf. prisma/schema.prisma ligne 1006). DISTRIBUTED est l'état
      // « tour terminé, pot remis au bénéficiaire » — exactement ce qu'on
      // veut pour les rangs déjà servis lors d'un backfill historique.
      const isAlreadyServed = i < alreadyServed.length;
      const isCurrent = i === alreadyServed.length;
      const turnStatus = isAlreadyServed
        ? "DISTRIBUTED"
        : isCurrent
          ? "IN_PROGRESS"
          : "PENDING";

      const turn = await tx.tontineTurn.create({
        data: {
          tontineId: tontine.id,
          turnNumber: i + 1,
          beneficiaryUserId: beneficiaryId,
          dueDate,
          status: turnStatus,
          // Si le turn est marqué servi, on pose distributedAt à sa due
          // date (date "officielle" du cycle). C'est une approximation
          // honorable : le pot a bien circulé à cette période-là, même
          // si on ne connaît pas la date précise du transfert physique.
          distributedAt: isAlreadyServed ? dueDate : null,
        },
      });

      // Une cotisation par membre (on exclut le bénéficiaire = il ne
      // se paie pas à lui-même). V116 — Les contributions des turns
      // déjà servis sont créées directement CONFIRMED pour refléter le
      // fait que les cotisations historiques ont été honorées hors BMD.
      const contributors = memberIds.filter((id) => id !== beneficiaryId);
      const now = new Date();
      await tx.tontineContribution.createMany({
        data: contributors.map((cid) => ({
          turnId: turn.id,
          contributorUserId: cid,
          amount: tontine.contributionAmount,
          status: (isAlreadyServed
            ? "CONFIRMED"
            : "PENDING") as ContributionStatus,
          // Snapshot timestamps pour les contributions historiques :
          // paidAt = due date (cohérent avec distributedAt du turn),
          // confirmedAt = maintenant (moment où l'admin a déclaré le
          // backfill — c'est l'évidence d'audit qu'on a).
          paidAt: isAlreadyServed ? dueDate : null,
          confirmedAt: isAlreadyServed ? now : null,
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

  // V219.B — Ne retourne que les tontines ACTIVES (DRAFT/ACTIVE).
  // Avant V219.B on retournait n'importe quelle tontine du groupe (y compris
  // CANCELLED/COMPLETED) en fallback : ça provoquait l'apparition d'une
  // « tontine fantôme » dans l'UI après suppression / fin. Désormais on laisse
  // l'UI afficher son propre EmptyState quand il n'y a vraiment plus rien.
  // L'historique (COMPLETED/CANCELLED) reste exposé via `getTontineHistory`.
  return prisma.tontine.findFirst({
    where: { groupId, status: { in: ["DRAFT", "ACTIVE"] } },
    orderBy: [
      // ACTIVE avant DRAFT (status asc) puis plus récent en premier
      { status: "asc" },
      { createdAt: "desc" },
    ],
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
          // V138 — Propositions PENDING uniquement (1 max, mais on récupère
          // un tableau au cas où). On expose la dernière au front pour que
          // le bénéficiaire voie la bannière Accepter / Refuser.
          proposals: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              proposedBy: {
                select: { id: true, displayName: true, avatar: true },
              },
            },
          },
        } as any,
      },
    } as any,
  });
}

// ============================================================
// CONTRIBUTIONS — workflow de paiement
// ============================================================

/**
 * Le contributeur déclare avoir payé.
 *
 * V141 — Refonte :
 *  - Le payeur peut indiquer une date de paiement (paidAt) passée ou
 *    aujourd'hui (max = now, min = il y a 1 an). Défaut = maintenant.
 *  - Si `group.paymentConfirmationRequired === false`, on saute l'étape
 *    PAID et on passe direct à CONFIRMED. Sinon, workflow classique.
 *  - Email au bénéficiaire en plus du push, pour qu'il vienne confirmer.
 */
export async function markContributionPaid(input: {
  contributionId: string;
  actorUserId: string;
  paymentMethod?: string;
  paymentReference?: string;
  /** V141 — Date effective du paiement déclarée par le payeur. */
  paidAt?: Date;
}) {
  const contrib = await prisma.tontineContribution.findUnique({
    where: { id: input.contributionId },
    include: {
      turn: {
        include: {
          tontine: { include: { group: true } },
        },
      },
    },
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

  // V141 — Validation date : pas dans le futur, pas avant 1 an.
  const now = new Date();
  const declaredPaidAt = input.paidAt ?? now;
  if (declaredPaidAt.getTime() > now.getTime() + 60_000) {
    throw Errors.badRequest(
      "Tu ne peux pas déclarer un paiement avec une date dans le futur.",
    );
  }
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  if (declaredPaidAt.getTime() < oneYearAgo.getTime()) {
    throw Errors.badRequest(
      "La date de paiement est trop ancienne (max 1 an).",
    );
  }

  // V141 — Si le groupe a désactivé la confirmation receveur, on passe
  // direct à CONFIRMED (déclaration auto-validée). Sinon, PAID → en attente
  // de confirmation receveur. Le champ Group.paymentConfirmationRequired
  // peut être null/undefined si la migration n'a pas tourné — on default true.
  const requireConfirm =
    (contrib.turn.tontine.group as any).paymentConfirmationRequired !== false;
  const finalStatus: "PAID" | "CONFIRMED" = requireConfirm
    ? "PAID"
    : "CONFIRMED";

  const updated = await prisma.tontineContribution.update({
    where: { id: contrib.id },
    data: {
      status: finalStatus,
      paidAt: declaredPaidAt,
      confirmedAt: requireConfirm ? null : now,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
    },
    include: { contributor: { select: { displayName: true } } },
  });

  // V141 — Notif PUSH + EMAIL systématique au bénéficiaire pour qu'il
  // confirme la réception (sauf si confirmation désactivée, auquel cas
  // c'est juste une notif informative "paiement reçu").
  try {
    const { notifyOne } = await import(
      "../notifications/notifications.service.js"
    );
    const beneficiaryId = contrib.turn.beneficiaryUserId;
    const payerName = updated.contributor.displayName || "Un membre";
    const methodLabel = input.paymentMethod
      ? ` via ${input.paymentMethod}`
      : "";
    const groupId = contrib.turn.tontine.groupId;
    const amountStr = `${contrib.amount} ${contrib.turn.tontine.currency}`;

    const title = requireConfirm
      ? `${payerName} a déclaré avoir payé sa cotisation${methodLabel}`
      : `${payerName} a payé sa cotisation${methodLabel}`;
    const body = requireConfirm
      ? `Montant : ${amountStr}. Confirme la réception depuis la tontine.`
      : `Montant : ${amountStr}. Paiement enregistré (confirmation auto désactivée pour ce groupe).`;

    void notifyOne(beneficiaryId, {
      kind: "SETTLEMENT_PROPOSED",
      title,
      body,
      link: `/dashboard/groups/${groupId}/tontine`,
      payload: {
        contributionId: contrib.id,
        turnId: contrib.turnId,
        amount: contrib.amount.toString(),
        method: input.paymentMethod ?? null,
        paidAt: declaredPaidAt.toISOString(),
        requiresConfirmation: requireConfirm,
      },
      senderUserId: input.actorUserId,
    });

    // V141 — Email systématique (seulement si confirmation requise, sinon
    // c'est juste informatif et le push suffit).
    if (requireConfirm) {
      void sendPaymentDeclarationEmail({
        recipientUserId: beneficiaryId,
        payerName,
        amountStr,
        methodLabel: input.paymentMethod ?? null,
        paidAt: declaredPaidAt,
        reference: input.paymentReference ?? null,
        link: `/dashboard/groups/${groupId}/tontine`,
        kind: "tontine",
      });
    }
  } catch (err) {
    console.warn("[tontine.markPaid] notify failed (non-blocking):", err);
  }

  return updated;
}

/**
 * V141 — Helper centralisé : envoie l'email « X a déclaré avoir payé Y €
 * via Z le jj/mm — clique pour confirmer la réception ». Réutilisé pour
 * tontine ET settlement.
 */
async function sendPaymentDeclarationEmail(input: {
  recipientUserId: string;
  payerName: string;
  amountStr: string;
  methodLabel: string | null;
  paidAt: Date;
  reference: string | null;
  link: string;
  kind: "tontine" | "settlement";
}): Promise<void> {
  try {
    // V142.F — User.email n'existe pas en colonne directe ; on passe par
    // la relation contacts (UserContact type=EMAIL).
    const user = await prisma.user.findUnique({
      where: { id: input.recipientUserId },
      select: {
        displayName: true,
        contacts: {
          where: { type: "EMAIL" },
          select: { value: true },
          take: 1,
        },
      },
    });
    const userEmail = user?.contacts[0]?.value;
    if (!userEmail) return;
    const { sendEmail } = await import("../../lib/messaging.js");
    const baseUrl =
      process.env.APP_BASE_URL?.replace(/\/$/, "") ??
      "https://app.backmesdo.com";
    const dateStr = input.paidAt.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const escape = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const subject = `${input.payerName} a déclaré un paiement de ${input.amountStr}`;
    const methodLine = input.methodLabel
      ? `<li><strong>Moyen :</strong> ${escape(input.methodLabel)}</li>`
      : "";
    const refLine = input.reference
      ? `<li><strong>Référence :</strong> ${escape(input.reference)}</li>`
      : "";
    const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#2B1F15;background:#FBF6EC;padding:24px;max-width:560px;margin:auto">
<h2 style="color:#C58A2E;margin-top:0">Confirme la réception</h2>
<p><strong>${escape(input.payerName)}</strong> a déclaré t'avoir payé <strong>${escape(input.amountStr)}</strong>.</p>
<ul style="line-height:1.7">
  <li><strong>Date :</strong> ${escape(dateStr)}</li>
  ${methodLine}
  ${refLine}
</ul>
<p style="margin:20px 0"><a href="${baseUrl}${input.link}" style="display:inline-block;background:#C58A2E;color:white;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Confirmer la réception</a></p>
<p style="color:#888;font-size:12px;margin-top:32px">Tu peux désactiver les emails de confirmation depuis les réglages du groupe ou ton profil.</p>
</body></html>`;
    // V142.F — Texte fallback obligatoire pour EmailMessage.
    const text = `${input.payerName} a déclaré t'avoir payé ${input.amountStr} le ${dateStr}.${input.methodLabel ? ` Moyen : ${input.methodLabel}.` : ""}${input.reference ? ` Réf : ${input.reference}.` : ""} Confirme la réception : ${baseUrl}${input.link}`;
    await sendEmail(
      { to: userEmail, subject, html, text },
      input.recipientUserId,
    );
  } catch (err) {
    console.warn(
      "[sendPaymentDeclarationEmail] failed (non-blocking):",
      err,
    );
  }
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

  const updated = await prisma.tontineContribution.update({
    where: { id: contrib.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
    include: { contributor: { select: { displayName: true } } },
  });

  // V136.E — Notif au contributeur : "Y a confirmé la réception de ta cotisation"
  // Cela boucle le flux et lui donne une preuve que son paiement a été vu.
  try {
    const { notifyOne } = await import(
      "../notifications/notifications.service.js"
    );
    const beneficiaryName =
      (await prisma.user.findUnique({
        where: { id: input.actorUserId },
        select: { displayName: true },
      }))?.displayName || "Le bénéficiaire";
    void notifyOne(updated.contributorUserId, {
      kind: "SETTLEMENT_CONFIRMED",
      title: `${beneficiaryName} a confirmé la réception de ta cotisation ✅`,
      body: `${contrib.amount} ${contrib.turn.tontine.currency} — la boucle est bouclée.`,
      link: `/dashboard/groups/${contrib.turn.tontine.groupId}/tontine`,
      payload: {
        contributionId: contrib.id,
        turnId: contrib.turnId,
        amount: contrib.amount.toString(),
      },
      senderUserId: input.actorUserId,
    });
  } catch (err) {
    console.warn("[tontine.confirm] notify failed (non-blocking):", err);
  }

  return updated;
}

/**
 * V136.C — Déclaration proactive par le bénéficiaire.
 *
 * Cas d'usage : un membre paye en cash (ou Mobile Money) sans déclarer côté
 * BMD. Le bénéficiaire reçoit l'argent et veut clore la cotisation lui-même
 * sans devoir relancer le payeur pour qu'il fasse "J'ai payé" puis lui pour
 * "Confirmer". Cette route fait les deux étapes en une.
 *
 * Différence avec confirmContribution :
 *   - confirmContribution : exige status=PAID (payeur a déjà déclaré)
 *   - declareContributionReceived : accepte PENDING, force la transition vers
 *     CONFIRMED en une étape avec paidAt + confirmedAt + paymentMethod.
 *
 * Autorisation : seul le bénéficiaire du tour (ou admin/treasurer) peut
 * déclarer une réception proactive — un autre membre ne peut pas confirmer
 * un paiement qui ne le concerne pas.
 */
export async function declareContributionReceived(input: {
  contributionId: string;
  actorUserId: string;
  paymentMethod: string;
  /** Optionnel : date du paiement réel (peut être passée). Default = now. */
  paidAt?: Date;
}) {
  const contrib = await prisma.tontineContribution.findUnique({
    where: { id: input.contributionId },
    include: {
      turn: { include: { tontine: { include: { group: true } } } },
    },
  });
  if (!contrib) throw Errors.notFound("Cette cotisation est introuvable 🔍");

  // Autorisation : bénéficiaire du tour OU admin/trésorier
  const isBeneficiary = contrib.turn.beneficiaryUserId === input.actorUserId;
  if (!isBeneficiary) {
    await assertRole(contrib.turn.tontine.groupId, input.actorUserId, [
      "ADMIN",
      "TREASURER",
    ]);
  }

  // Cycle de vie : on accepte PENDING (saut direct) ou PAID (qui passe alors
  // immédiatement en CONFIRMED comme confirmContribution).
  if (contrib.status === "CONFIRMED") {
    throw Errors.invalidState({
      what: "Cette cotisation",
      currentState: "déjà confirmée ✅",
      tip: "Pas besoin de confirmer deux fois — c'est déjà fait.",
    });
  }
  if (contrib.status === "MISSED") {
    throw Errors.invalidState({
      what: "Cette cotisation",
      currentState: "marquée manquée",
      tip: "Si le paiement a finalement eu lieu, un admin doit réactiver la cotisation.",
    });
  }

  const now = new Date();
  const updated = await prisma.tontineContribution.update({
    where: { id: contrib.id },
    data: {
      status: "CONFIRMED",
      // Si déjà PAID, on garde la date d'origine du payeur. Sinon on prend
      // celle fournie par le bénéficiaire (ou now).
      paidAt: contrib.paidAt ?? input.paidAt ?? now,
      confirmedAt: now,
      // Méthode de paiement : on prend celle fournie par le bénéficiaire,
      // sauf si le payeur en avait déjà déclaré une (priorité au payeur qui
      // sait par où il a envoyé).
      paymentMethod: contrib.paymentMethod ?? input.paymentMethod,
    },
    include: { contributor: { select: { displayName: true } } },
  });

  // V136.E — Notif au contributeur : le bénéficiaire a déclaré avoir reçu
  // proactivement (sans qu'il ait eu à cliquer "J'ai payé"). C'est utile
  // pour la traçabilité côté payeur (preuve dans son historique BMD).
  try {
    const { notifyOne } = await import(
      "../notifications/notifications.service.js"
    );
    const beneficiaryName =
      (await prisma.user.findUnique({
        where: { id: input.actorUserId },
        select: { displayName: true },
      }))?.displayName || "Le bénéficiaire";
    void notifyOne(updated.contributorUserId, {
      kind: "SETTLEMENT_CONFIRMED",
      title: `${beneficiaryName} a déclaré avoir reçu ton paiement ✅`,
      body: `${contrib.amount} ${contrib.turn.tontine.currency} via ${input.paymentMethod}. Ta cotisation est officiellement clôturée.`,
      link: `/dashboard/groups/${contrib.turn.tontine.groupId}/tontine`,
      payload: {
        contributionId: contrib.id,
        turnId: contrib.turnId,
        amount: contrib.amount.toString(),
        method: input.paymentMethod,
        proactive: "true",
      },
      senderUserId: input.actorUserId,
    });
  } catch (err) {
    console.warn("[tontine.declareReceived] notify failed (non-blocking):", err);
  }

  return updated;
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

  const result = await prisma.$transaction(async (tx) => {
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

  // V220.A — Audit log : tour distribué (le bénéficiaire a touché le pot).
  // On calcule le montant total = somme des contributions confirmées (en
  // pratique = membres - 1 × montant cotisation, mais on lit directement la
  // somme pour éviter une approximation si certains tours étaient incomplets).
  // V232 — On ajoute : nom de la tontine + nom du bénéficiaire + total tours
  // + nombre de contributions confirmées + nombre total attendu, pour que le
  // feed Activité puisse écrire « Léa a reçu son tour de tontine « Loyer
  // commun » : 900 € (Tour 1/6 — 5 contributions confirmées) ».
  const totalAmount = turn.contributions
    .filter((c) => c.status === "CONFIRMED")
    .reduce(
      (acc, c) => acc + parseFloat(c.amount?.toString?.() ?? "0"),
      0,
    );
  const confirmedCount = turn.contributions.filter(
    (c) => c.status === "CONFIRMED",
  ).length;
  const totalContributions = turn.contributions.length;
  // Compte total de tours dans la tontine
  const totalTurns = await prisma.tontineTurn.count({
    where: { tontineId: turn.tontineId },
  });
  // Nom du bénéficiaire
  const beneficiary = await prisma.user.findUnique({
    where: { id: turn.beneficiaryUserId },
    select: { displayName: true },
  });
  logActivity({
    groupId: turn.tontine.groupId,
    actorId: input.actorUserId,
    kind: "TONTINE_TURN_DISTRIBUTED",
    payload: {
      tontineId: turn.tontineId,
      tontineName: (turn.tontine as any).name ?? null,
      turnId: turn.id,
      turnNumber: turn.turnNumber,
      totalTurns,
      beneficiaryUserId: turn.beneficiaryUserId,
      beneficiaryName: beneficiary?.displayName ?? null,
      amount: totalAmount.toFixed(2),
      currency: turn.tontine.currency,
      confirmedCount,
      totalContributions,
    },
  }).catch(() => {});

  return result;
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
      // V98 — Émetteur = celui qui fixe la date (bénéficiaire)
      senderUserId: input.actorUserId,
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
 * V136.D — Édite location + notes d'un tour de tontine.
 *
 * Le bénéficiaire (ou un admin) peut renseigner le lieu de la réunion
 * (adresse physique, lien Zoom, etc.) et des notes libres. Les autres
 * membres voient ces infos dans le détail du tour pour savoir où amener
 * leur cotisation cash ou se connecter en visio.
 *
 * Différent de `scheduleTurn` : pas de contrainte ±15 jours, pas de reset
 * des acks (modifier le lieu ne change pas la date, donc pas besoin que
 * tout le monde re-acknowledge). Mais on envoie quand même une notif
 * pour informer les membres du changement de lieu.
 */
/**
 * V138 — Helper : deux dates sont-elles dans le même mois calendaire
 * (UTC) ? Utilisé pour la contrainte « bénéficiaire ne peut changer sa
 * date que dans son mois ».
 */
function isSameUtcMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

export async function updateTurnDetails(input: {
  turnId: string;
  actorUserId: string;
  location?: string | null;
  // V136.D — Heure libre courte (« 17:30 », « 18h après le boulot », etc.)
  meetingTime?: string | null;
  notes?: string | null;
  // V138 — Date effective du tour. Pour le bénéficiaire, doit rester dans
  // le mois calendaire du `dueDate`. Pour un admin qui est aussi bénéficiaire,
  // même règle (il agit comme bénéficiaire).
  scheduledDate?: Date | null;
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
      beneficiary: { select: { displayName: true } },
    },
  });
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");

  const groupId = turn.tontine.groupId;
  const member = turn.tontine.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.notMember("ce groupe");

  // V138 — Règle d'autorisation refondue.
  //
  // Le bénéficiaire d'un tour (ou un admin qui se trouve aussi être le
  // bénéficiaire) peut modifier directement date/lieu/heure de SON tour.
  // Un admin qui n'est PAS le bénéficiaire ne peut PAS appeler directement
  // ce path — il doit passer par `proposeTurnUpdate` pour demander
  // l'accord du bénéficiaire avant que le changement ne soit appliqué et
  // diffusé au reste du groupe.
  const isBeneficiary = turn.beneficiaryUserId === input.actorUserId;
  if (!isBeneficiary) {
    throw Errors.forbidden(
      "Seul le bénéficiaire de ce tour peut modifier sa date, son lieu ou son heure 📅",
      {
        tip:
          member.role === "ADMIN"
            ? "En tant qu'admin, propose un changement via le bouton « Proposer une modification » : le bénéficiaire devra l'accepter."
            : "Si c'est ton tour, vérifie que tu es bien connecté avec le bon compte.",
      },
    );
  }

  // Vérification que le statut autorise l'édition. Une fois distribué, on
  // fige tout — pas de réécriture rétroactive.
  if (turn.status === "DISTRIBUTED" || turn.status === "CANCELLED") {
    throw Errors.invalidState({
      what: "Ce tour",
      currentState:
        turn.status === "DISTRIBUTED" ? "déjà distribué 🎉" : "annulé",
      tip: "Tu ne peux modifier ce tour que tant qu'il est encore actif.",
    });
  }

  // V138 — Sanitize + validation de la date (contrainte « même mois »).
  const data: Record<string, string | null | Date> = {};
  if (input.location !== undefined) {
    data.location = input.location ? input.location.trim().slice(0, 500) : null;
  }
  if (input.meetingTime !== undefined) {
    // V136.D — Heure courte (~30 chars max pour couvrir « 17h30 lundi prochain »)
    data.meetingTime = input.meetingTime
      ? input.meetingTime.trim().slice(0, 60)
      : null;
  }
  if (input.notes !== undefined) {
    data.notes = input.notes ? input.notes.trim().slice(0, 1000) : null;
  }
  if (input.scheduledDate !== undefined) {
    if (input.scheduledDate !== null) {
      if (!(input.scheduledDate instanceof Date) || isNaN(input.scheduledDate.getTime())) {
        throw Errors.badRequest("La date proposée est invalide.");
      }
      if (!isSameUtcMonth(input.scheduledDate, turn.dueDate)) {
        throw Errors.badRequest(
          "Tu ne peux choisir qu'une date dans le mois prévu pour ton tour 📅",
          {
            tip: `Ton tour est prévu en ${turn.dueDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}. Choisis une date dans ce mois.`,
          },
        );
      }
      data.scheduledDate = input.scheduledDate;
      data.scheduledAt = new Date();
    } else {
      data.scheduledDate = null;
      data.scheduledAt = null;
    }
  }

  // V136 · `as any` tant que prisma generate n'a pas tourné après la migration.
  const updated = await (prisma.tontineTurn as any).update({
    where: { id: turn.id },
    data,
  });

  // V138 — Notif + email à tous les membres si date, lieu ou heure ont changé.
  // (Les notes seules ne déclenchent pas de notif — pas besoin de pinger tout
  // le monde pour une note libre.)
  const shouldBroadcast =
    input.location !== undefined ||
    input.meetingTime !== undefined ||
    input.scheduledDate !== undefined;
  if (shouldBroadcast) {
    void broadcastTurnUpdate({
      turnId: turn.id,
      groupId,
      turnNumber: turn.turnNumber,
      beneficiaryDisplayName: turn.beneficiary.displayName,
      actorUserId: input.actorUserId,
      newScheduledDate: (updated as any).scheduledDate ?? null,
      newLocation: (updated as any).location ?? null,
      newMeetingTime: (updated as any).meetingTime ?? null,
    });
  }

  return {
    id: turn.id,
    scheduledDate: (updated as any).scheduledDate ?? null,
    location: (updated as any).location ?? null,
    meetingTime: (updated as any).meetingTime ?? null,
    notes: (updated as any).notes ?? null,
  };
}

/**
 * V138 — Broadcast du changement d'un tour à TOUS les membres du groupe
 * (sauf l'émetteur) : push + email + Notification persistée. Centralisé
 * pour réutilisation par updateTurnDetails ET respondToTurnProposal.
 */
async function broadcastTurnUpdate(input: {
  turnId: string;
  groupId: string;
  turnNumber: number;
  beneficiaryDisplayName: string;
  actorUserId: string;
  newScheduledDate: Date | null;
  newLocation: string | null;
  newMeetingTime: string | null;
}): Promise<void> {
  // Compose un résumé lisible « date · heure · lieu »
  const bits: string[] = [];
  if (input.newScheduledDate) {
    bits.push(
      input.newScheduledDate.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    );
  }
  if (input.newMeetingTime) bits.push(input.newMeetingTime.slice(0, 30));
  if (input.newLocation) bits.push(input.newLocation.slice(0, 80));
  const newInfo = bits.join(" · ");

  const title = `Réunion du tour ${input.turnNumber} mise à jour`;
  const body = newInfo
    ? `${input.beneficiaryDisplayName} : « ${newInfo} »`
    : `${input.beneficiaryDisplayName} a effacé les informations de la réunion.`;
  const link = `/dashboard/groups/${input.groupId}/tontine`;

  // 1) Push + Notification in-app via le canal central
  try {
    const { notifyGroupMembers } = await import(
      "../notifications/notifications.service.js"
    );
    void notifyGroupMembers({
      groupId: input.groupId,
      excludeUserId: input.actorUserId,
      notification: {
        kind: "TONTINE_DATE_CHANGED",
        title,
        body,
        link,
        senderUserId: input.actorUserId,
        payload: {
          groupId: input.groupId,
          turnId: input.turnId,
          scheduledDate: input.newScheduledDate?.toISOString() ?? null,
          location: input.newLocation,
          meetingTime: input.newMeetingTime,
        },
      },
    });
  } catch (err) {
    console.warn("[tontine.broadcastTurnUpdate] push failed:", err);
  }

  // 2) Email à tous les membres du groupe (sauf actor) — V138 requirement.
  // On envoie un email simple en HTML. La traduction multi-locale sera
  // ajoutée plus tard via sendTemplatedEmail si nécessaire — pour l'instant
  // on prend la locale par défaut de chaque user (fallback FR).
  try {
    // V142.F — Récupère membres + leur email via UserContact (relation).
    const members = await prisma.groupMember.findMany({
      where: { groupId: input.groupId, doNotDisturb: false },
      select: {
        userId: true,
        user: {
          select: {
            displayName: true,
            contacts: {
              where: { type: "EMAIL" },
              select: { value: true },
              take: 1,
            },
          },
        },
      },
    });
    type Recipient = { userId: string; email: string };
    const recipients: Recipient[] = members
      .filter((m) => m.userId !== input.actorUserId)
      .map((m) => ({
        userId: m.userId,
        email: m.user.contacts[0]?.value ?? "",
      }))
      .filter((r) => r.email !== "");
    if (recipients.length === 0) return;

    const { sendEmail } = await import("../../lib/messaging.js");
    const subject = title;
    const summaryHtml = newInfo
      ? `<p><strong>${escapeHtml(input.beneficiaryDisplayName)}</strong> a précisé :</p><blockquote style="border-left:3px solid #C58A2E;padding-left:12px;color:#333;margin:12px 0">${escapeHtml(newInfo)}</blockquote>`
      : `<p><strong>${escapeHtml(input.beneficiaryDisplayName)}</strong> a effacé les informations de la réunion de ce tour.</p>`;
    const baseUrl =
      process.env.APP_BASE_URL?.replace(/\/$/, "") ??
      "https://app.backmesdo.com";
    const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#2B1F15;background:#FBF6EC;padding:24px;max-width:560px;margin:auto">
<h2 style="color:#C58A2E;margin-top:0">Réunion du tour ${input.turnNumber} mise à jour</h2>
${summaryHtml}
<p style="margin:20px 0"><a href="${baseUrl}${link}" style="display:inline-block;background:#C58A2E;color:white;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Ouvrir la tontine</a></p>
<p style="color:#888;font-size:12px;margin-top:32px">Tu reçois ce message parce que tu fais partie de cette tontine sur BMD. Tu peux désactiver les notifications de ce groupe dans ses réglages.</p>
</body></html>`;
    const text = `Réunion du tour ${input.turnNumber} mise à jour par ${input.beneficiaryDisplayName}. Ouvre la tontine : ${baseUrl}${link}`;

    // Envoi parallèle, best-effort. On track la conso via le 2e param userId.
    await Promise.allSettled(
      recipients.map((r) =>
        sendEmail(
          {
            to: r.email,
            subject,
            html,
            text,
          },
          r.userId,
        ),
      ),
    );
  } catch (err) {
    console.warn("[tontine.broadcastTurnUpdate] email failed:", err);
  }
}

/** V138 — Échappement HTML minimal pour les corps d'email. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * V138 — Un admin (qui n'est PAS le bénéficiaire du tour) propose un
 * changement de date/lieu/heure. La proposition reste PENDING jusqu'à ce
 * que le bénéficiaire l'accepte (apply + broadcast à tous) ou la refuse
 * (notif admin uniquement).
 *
 * Règles :
 *  - Seul un admin du groupe peut proposer.
 *  - Si l'actor est le bénéficiaire (même si admin) → erreur, il doit
 *    appeler updateTurnDetails directement (modif immédiate).
 *  - Une seule proposition PENDING par turn : toute proposition pendante
 *    précédente est CANCELLED automatiquement quand une nouvelle est créée.
 *  - Le bénéficiaire reçoit une notif push (mais PAS d'email — c'est une
 *    proposition à valider, pas un changement définitif).
 */
export async function proposeTurnUpdate(input: {
  turnId: string;
  actorUserId: string;
  proposedScheduledDate?: Date | null;
  proposedLocation?: string | null;
  proposedMeetingTime?: string | null;
  proposedNotes?: string | null;
  message?: string | null;
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
      beneficiary: { select: { id: true, displayName: true } },
    },
  });
  if (!turn) throw Errors.notFound("Ce tour est introuvable 🔍");

  const groupId = turn.tontine.groupId;
  const member = turn.tontine.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.notMember("ce groupe");
  if (member.role !== "ADMIN") {
    throw Errors.forbidden(
      "Seul un admin du groupe peut proposer un changement sur le tour d'un autre membre 🔒",
    );
  }
  if (turn.beneficiaryUserId === input.actorUserId) {
    // L'admin est aussi le bénéficiaire → il doit modifier directement.
    throw Errors.badRequest(
      "Tu es le bénéficiaire de ce tour : modifie-le directement, pas besoin de proposition.",
    );
  }
  if (turn.status === "DISTRIBUTED" || turn.status === "CANCELLED") {
    throw Errors.invalidState({
      what: "Ce tour",
      currentState:
        turn.status === "DISTRIBUTED" ? "déjà distribué 🎉" : "annulé",
      tip: "Tu ne peux proposer un changement que tant que le tour est encore actif.",
    });
  }

  // Au moins un champ doit être proposé
  if (
    input.proposedScheduledDate === undefined &&
    input.proposedLocation === undefined &&
    input.proposedMeetingTime === undefined &&
    input.proposedNotes === undefined
  ) {
    throw Errors.badRequest(
      "Indique au moins un changement à proposer (date, lieu, heure ou notes).",
    );
  }
  if (
    input.proposedScheduledDate !== undefined &&
    input.proposedScheduledDate !== null &&
    (!(input.proposedScheduledDate instanceof Date) ||
      isNaN(input.proposedScheduledDate.getTime()))
  ) {
    throw Errors.badRequest("La date proposée est invalide.");
  }

  // Cancel toute proposition PENDING précédente sur ce turn pour éviter le
  // doublon de notifs / l'ambiguïté côté bénéficiaire.
  await (prisma as any).tontineTurnProposal.updateMany({
    where: { turnId: turn.id, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });

  const proposal = await (prisma as any).tontineTurnProposal.create({
    data: {
      turnId: turn.id,
      proposedByUserId: input.actorUserId,
      proposedScheduledDate: input.proposedScheduledDate ?? null,
      proposedLocation:
        input.proposedLocation !== undefined
          ? input.proposedLocation?.trim().slice(0, 500) ?? null
          : null,
      proposedMeetingTime:
        input.proposedMeetingTime !== undefined
          ? input.proposedMeetingTime?.trim().slice(0, 60) ?? null
          : null,
      proposedNotes:
        input.proposedNotes !== undefined
          ? input.proposedNotes?.trim().slice(0, 1000) ?? null
          : null,
      message: input.message ? input.message.trim().slice(0, 500) : null,
      status: "PENDING",
    },
  });

  // Notif au bénéficiaire uniquement (pas email — c'est une demande de
  // validation, pas un fait accompli).
  try {
    const { notifyOne } = await import(
      "../notifications/notifications.service.js"
    );
    void notifyOne(turn.beneficiaryUserId, {
      kind: "TONTINE_DATE_PROPOSAL" as any,
      title: `L'admin propose une modification de ton tour`,
      body: input.message
        ? `« ${input.message.slice(0, 100)} »`
        : `Ton tour ${turn.turnNumber} a une proposition de modification en attente.`,
      link: `/dashboard/groups/${groupId}/tontine?proposal=${proposal.id}`,
      senderUserId: input.actorUserId,
      payload: {
        groupId,
        turnId: turn.id,
        proposalId: proposal.id,
      },
    });
  } catch (err) {
    console.warn("[tontine.proposeTurnUpdate] notify failed:", err);
  }

  return proposal;
}

/**
 * V138 — Le bénéficiaire répond à une proposition de l'admin (accept/reject).
 *
 *  - ACCEPTED → on applique les valeurs proposées sur TontineTurn, on marque
 *    la proposition comme ACCEPTED, et on broadcast push + email à tous les
 *    membres (sauf émetteur).
 *  - REJECTED → on marque REJECTED + rejectionReason, on notifie uniquement
 *    l'admin émetteur. Les autres membres ne sont pas informés (rien n'a
 *    changé pour eux).
 */
export async function respondToTurnProposal(input: {
  proposalId: string;
  actorUserId: string;
  decision: "ACCEPT" | "REJECT";
  rejectionReason?: string | null;
}) {
  const proposal = await (prisma as any).tontineTurnProposal.findUnique({
    where: { id: input.proposalId },
    include: {
      turn: {
        include: {
          tontine: {
            include: {
              group: {
                include: { members: { select: { userId: true, role: true } } },
              },
            },
          },
          beneficiary: { select: { displayName: true } },
        },
      },
      proposedBy: { select: { id: true, displayName: true } },
    },
  });
  if (!proposal) {
    throw Errors.notFound("Cette proposition est introuvable.");
  }
  if (proposal.turn.beneficiaryUserId !== input.actorUserId) {
    throw Errors.forbidden(
      "Seul le bénéficiaire du tour concerné peut accepter ou refuser cette proposition.",
    );
  }
  if (proposal.status !== "PENDING") {
    throw Errors.invalidState({
      what: "Cette proposition",
      currentState:
        proposal.status === "ACCEPTED"
          ? "déjà acceptée"
          : proposal.status === "REJECTED"
          ? "déjà refusée"
          : "annulée",
      tip: "Demande à l'admin d'en envoyer une nouvelle.",
    });
  }

  const now = new Date();
  const groupId = proposal.turn.tontine.groupId;

  if (input.decision === "ACCEPT") {
    // Applique les valeurs proposées sur le TontineTurn.
    const data: Record<string, string | null | Date> = {};
    if (proposal.proposedScheduledDate !== null) {
      data.scheduledDate = proposal.proposedScheduledDate;
      data.scheduledAt = now;
    }
    if (proposal.proposedLocation !== null) {
      data.location = proposal.proposedLocation;
    }
    if (proposal.proposedMeetingTime !== null) {
      data.meetingTime = proposal.proposedMeetingTime;
    }
    if (proposal.proposedNotes !== null) {
      data.notes = proposal.proposedNotes;
    }

    await (prisma.tontineTurn as any).update({
      where: { id: proposal.turnId },
      data,
    });

    await (prisma as any).tontineTurnProposal.update({
      where: { id: proposal.id },
      data: {
        status: "ACCEPTED",
        decidedByUserId: input.actorUserId,
        decidedAt: now,
      },
    });

    // Broadcast à tous les membres (sauf le bénéficiaire qui vient
    // d'accepter — il sait déjà). Email + push.
    void broadcastTurnUpdate({
      turnId: proposal.turnId,
      groupId,
      turnNumber: proposal.turn.turnNumber,
      beneficiaryDisplayName: proposal.turn.beneficiary.displayName,
      actorUserId: input.actorUserId,
      newScheduledDate:
        (proposal.proposedScheduledDate as Date | null) ?? null,
      newLocation: proposal.proposedLocation ?? null,
      newMeetingTime: proposal.proposedMeetingTime ?? null,
    });

    return { status: "ACCEPTED" as const, proposalId: proposal.id };
  }

  // REJECT
  await (prisma as any).tontineTurnProposal.update({
    where: { id: proposal.id },
    data: {
      status: "REJECTED",
      decidedByUserId: input.actorUserId,
      decidedAt: now,
      rejectionReason: input.rejectionReason
        ? input.rejectionReason.trim().slice(0, 500)
        : null,
    },
  });

  // Notif à l'admin proposer uniquement
  try {
    const { notifyOne } = await import(
      "../notifications/notifications.service.js"
    );
    void notifyOne(proposal.proposedByUserId, {
      kind: "TONTINE_DATE_PROPOSAL" as any,
      title: `${proposal.turn.beneficiary.displayName} a refusé ta proposition`,
      body: input.rejectionReason
        ? `Raison : « ${input.rejectionReason.slice(0, 100)} »`
        : `Ta proposition de modification du tour ${proposal.turn.turnNumber} a été refusée.`,
      link: `/dashboard/groups/${groupId}/tontine`,
      senderUserId: input.actorUserId,
      payload: {
        groupId,
        turnId: proposal.turnId,
        proposalId: proposal.id,
        decision: "REJECTED",
      },
    });
  } catch (err) {
    console.warn("[tontine.respondToTurnProposal] notify reject failed:", err);
  }

  return { status: "REJECTED" as const, proposalId: proposal.id };
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

  // V215.F2 + V231 — Plusieurs tontines possibles par groupe (historique).
  // V231 — IMPORTANT : on retourne TOUTES les tontines, pas juste la plus
  // récente. Avant V231 on faisait `findFirst` ce qui causait le bug
  // « les tontines supprimées s'accumulent pas, la dernière supprimée
  // remplace l'ancienne ». Maintenant l'UI peut grouper par statut
  // (En cours / Passées / Annulées) en utilisant toute la liste.
  const tontines = await prisma.tontine.findMany({
    where: { groupId: input.groupId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
              // V219.D — paymentMethod exposé pour la vue détail read-only.
              paymentMethod: true,
              contributor: { select: { id: true, displayName: true } },
            },
          },
        },
      },
    },
  });

  if (tontines.length === 0) {
    return { tontines: [] };
  }

  // Calcule le pot effectivement reçu pour chaque tour distribué
  // = somme des contributions confirmées
  // V219.D — On expose désormais les contributions imbriquées dans chaque
  // tour pour permettre la vue détail read-only des tontines passées /
  // annulées (qui paye combien, statut, date, méthode utilisée).
  function buildTurns(tontine: (typeof tontines)[number]) {
    return tontine.turns.map((t) => {
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
        location: (t as any).location ?? null,
        totalReceived: totalReceived.toFixed(2),
        currency: tontine.currency,
        contributorCount: t.contributions.length,
        paidCount: confirmedContributions.length,
        // V219.D — Contributions détaillées (payeur, montant, statut, date).
        contributions: t.contributions.map((c) => ({
          id: c.id,
          contributorUserId: c.contributor.id,
          contributor: {
            id: c.contributor.id,
            displayName: c.contributor.displayName,
          },
          amountDue: c.amount.toString(),
          status: c.status,
          paymentMethod: (c as any).paymentMethod ?? null,
          paidAt: c.paidAt?.toISOString() ?? null,
          confirmedAt: c.confirmedAt?.toISOString() ?? null,
        })),
      };
    });
  }

  return {
    tontines: tontines.map((tontine) => ({
      id: tontine.id,
      // V231 — Nom libre (peut être null pour les tontines historiques).
      name: (tontine as any).name ?? null,
      frequency: tontine.frequency,
      currency: tontine.currency,
      status: tontine.status,
      contributionAmount: tontine.contributionAmount.toString(),
      startDate: tontine.startDate.toISOString(),
      completedAt: tontine.completedAt?.toISOString() ?? null,
      // V219.D — cancelledAt + cancellationReason exposés à l'historique
      // pour la modale read-only « Tontine annulée le X — raison ».
      cancelledAt: tontine.cancelledAt?.toISOString() ?? null,
      cancellationReason: (tontine as any).cancellationReason ?? null,
      turns: buildTurns(tontine),
    })),
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


// ============================================================
// V219.C — WORKFLOW SUPPRESSION TONTINE (admin + vote membres)
// ============================================================
//
// Règle métier :
//   * Seul l'admin peut ouvrir une demande de suppression sur une tontine
//     ACTIVE ou DRAFT. Une raison textuelle (>= 10 chars) est obligatoire.
//   * Si AUCUNE contribution CONFIRMED → suppression directe
//     (cancellationStatus = APPROVED, status = CANCELLED) + notif info.
//   * Sinon → cancellationStatus = PROPOSED, notif vote à tous les membres.
//     - Si UN membre vote NON → REJECTED, tontine reste ACTIVE, notif à l'admin.
//     - Si TOUS les autres membres votent OUI → APPROVED, status=CANCELLED,
//       notif récap à tous. Le vote de l'admin est implicite (oui).
//
// Cache groupe (`group-detail:<groupId>:*`) invalidé après chaque mutation.

/**
 * V219.C — Ouvre (ou applique directement) une demande de suppression.
 */
export async function requestTontineCancellation(input: {
  tontineId: string;
  actorUserId: string;
  reason: string;
}): Promise<{ deleted: boolean; requiresVote: boolean; status: TontineStatus }> {
  const reason = (input.reason ?? "").trim();
  if (reason.length < 10) {
    throw Errors.badRequest(
      "Précise un peu plus la raison de la suppression — au moins 10 caractères.",
      {
        tip: "Cette raison est visible par tous les membres, c'est ce qui justifie ta demande.",
      },
    );
  }

  const tontine = await prisma.tontine.findUnique({
    where: { id: input.tontineId },
    include: {
      group: { include: { members: { select: { userId: true, role: true } } } },
      turns: { include: { contributions: { select: { status: true } } } },
    },
  });
  if (!tontine) throw Errors.notFound("Cette tontine est introuvable 🔍");

  await assertRole(tontine.groupId, input.actorUserId, ["ADMIN"]);

  if (tontine.status !== "ACTIVE" && tontine.status !== "DRAFT") {
    throw Errors.invalidState({
      what: "Cette tontine",
      currentState:
        tontine.status === "COMPLETED" ? "déjà terminée 🏁" : "déjà annulée",
      tip: "Tu ne peux supprimer qu'une tontine en cours (ACTIVE) ou en préparation (DRAFT).",
    });
  }

  // V219.C — cast `any` car le client Prisma n'a pas encore les nouveaux champs
  // (cancellation*) tant que `prisma generate` n'a pas tourné. À nettoyer
  // après la régénération.
  if ((tontine as any).cancellationStatus === "PROPOSED") {
    throw Errors.invalidState({
      what: "Cette tontine",
      currentState: "déjà en cours de suppression (vote en attente)",
      tip: "Attends la fin du vote ou demande aux membres restants de se prononcer.",
    });
  }

  // Compte les contributions CONFIRMED
  const confirmedCount = tontine.turns.reduce(
    (acc, t) => acc + t.contributions.filter((c) => c.status === "CONFIRMED").length,
    0,
  );

  const now = new Date();
  const memberUserIds = tontine.group.members.map((m) => m.userId);
  const otherMembers = memberUserIds.filter((u) => u !== input.actorUserId);

  // Lazy import : on récupère via require dynamique pour éviter les
  // dépendances circulaires (notifications.service importe parfois prisma).
  const { notifyMany } = await import(
    "../notifications/notifications.service.js"
  );
  const { cacheInvalidatePrefix } = await import("../../lib/cache.js");

  if (confirmedCount === 0) {
    // Cas 1 — suppression directe
    await prisma.tontine.update({
      where: { id: tontine.id },
      data: ({
        status: "CANCELLED",
        cancelledAt: now,
        cancellationReason: reason,
        cancellationRequestedAt: now,
        cancellationRequestedById: input.actorUserId,
        cancellationStatus: "APPROVED",
      } as any),
    });

    void notifyMany(memberUserIds, {
      kind: "TONTINE_CANCELLED_DIRECT" as any,
      title: "Tontine supprimée",
      body: `L'admin a supprimé la tontine. Raison : ${reason}`,
      link: `/dashboard/groups/${tontine.groupId}`,
      payload: {
        groupId: tontine.groupId,
        tontineId: tontine.id,
        reason,
      },
      senderUserId: input.actorUserId,
    });

    void cacheInvalidatePrefix(`group-detail:${tontine.groupId}:`);

    return { deleted: true, requiresVote: false, status: "CANCELLED" };
  }

  // Cas 2 — demande de vote
  await prisma.tontine.update({
    where: { id: tontine.id },
    data: ({
      cancellationReason: reason,
      cancellationRequestedAt: now,
      cancellationRequestedById: input.actorUserId,
      cancellationStatus: "PROPOSED",
    } as any),
  });

  // Reset des votes précédents (si re-demande après un REJECTED) — on garde
  // l'historique uniquement pour la demande courante.
  await (prisma as any).tontineCancellationVote.deleteMany({
    where: { tontineId: tontine.id },
  });

  void notifyMany(otherMembers, {
    kind: "TONTINE_CANCELLATION_REQUESTED" as any,
    title: "Vote suppression tontine",
    body: `L'admin demande la suppression de la tontine. Raison : ${reason}. Toutes les voix doivent valider.`,
    link: `/dashboard/groups/${tontine.groupId}/tontine?action=vote-cancel`,
    payload: {
      groupId: tontine.groupId,
      tontineId: tontine.id,
      reason,
      requestedById: input.actorUserId,
      action: "vote",
    },
    senderUserId: input.actorUserId,
  });

  void cacheInvalidatePrefix(`group-detail:${tontine.groupId}:`);

  return { deleted: false, requiresVote: true, status: tontine.status };
}

/**
 * V219.C — Un membre vote sur la demande de suppression.
 *
 * - vote=false → REJECTED + notif à l'admin (un seul refus suffit).
 * - vote=true  → upsert le vote. Si TOUS les autres membres ont voté oui,
 *                la tontine bascule en CANCELLED + APPROVED + notif récap.
 *                Sinon on attend les autres voix.
 */
export async function voteTontineCancellation(input: {
  tontineId: string;
  actorUserId: string;
  vote: boolean;
  reason?: string;
}): Promise<{
  status: "PROPOSED" | "APPROVED" | "REJECTED";
  approvedCount: number;
  totalRequired: number;
}> {
  const tontine = await prisma.tontine.findUnique({
    where: { id: input.tontineId },
    include: {
      group: { include: { members: { select: { userId: true } } } },
    },
  });
  if (!tontine) throw Errors.notFound("Cette tontine est introuvable 🔍");

  // L'utilisateur doit être membre du groupe
  const isMember = tontine.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) {
    throw Errors.notMember("ce groupe");
  }

  const cancellationStatus = (tontine as any).cancellationStatus as
    | "PROPOSED"
    | "APPROVED"
    | "REJECTED"
    | null;

  if (cancellationStatus !== "PROPOSED") {
    throw Errors.invalidState({
      what: "La demande de suppression",
      currentState:
        cancellationStatus === "APPROVED"
          ? "déjà approuvée — la tontine est supprimée"
          : cancellationStatus === "REJECTED"
            ? "déjà refusée — la tontine reste active"
            : "inexistante",
      tip: "Il n'y a pas de vote en cours sur cette tontine.",
    });
  }

  // Empêche l'admin émetteur de revoter (son oui est implicite)
  const requestedById = (tontine as any).cancellationRequestedById as
    | string
    | null;

  const reasonClean = (input.reason ?? "").trim() || null;

  const { notifyOne, notifyMany } = await import(
    "../notifications/notifications.service.js"
  );
  const { cacheInvalidatePrefix } = await import("../../lib/cache.js");

  if (input.vote === false) {
    // REJECTED — un seul refus suffit
    await prisma.$transaction([
      (prisma as any).tontineCancellationVote.upsert({
        where: {
          tontineId_userId: {
            tontineId: tontine.id,
            userId: input.actorUserId,
          },
        },
        create: {
          tontineId: tontine.id,
          userId: input.actorUserId,
          vote: false,
          reason: reasonClean,
        },
        update: {
          vote: false,
          reason: reasonClean,
          votedAt: new Date(),
        },
      }),
      prisma.tontine.update({
        where: { id: tontine.id },
        data: ({ cancellationStatus: "REJECTED" } as any),
      }),
    ]);

    // Notif à l'admin demandeur
    const refuser = await prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { displayName: true },
    });
    if (requestedById) {
      void notifyOne(requestedById, {
        kind: "TONTINE_CANCELLATION_REJECTED" as any,
        title: "Suppression refusée",
        body: `${refuser?.displayName ?? "Un membre"} a refusé la suppression de la tontine. Elle reste active.`,
        link: `/dashboard/groups/${tontine.groupId}/tontine`,
        payload: {
          groupId: tontine.groupId,
          tontineId: tontine.id,
          refuserUserId: input.actorUserId,
          reason: reasonClean,
        },
        senderUserId: input.actorUserId,
      });
    }

    void cacheInvalidatePrefix(`group-detail:${tontine.groupId}:`);

    return { status: "REJECTED", approvedCount: 0, totalRequired: 0 };
  }

  // vote === true : upsert puis check unanimité
  await (prisma as any).tontineCancellationVote.upsert({
    where: {
      tontineId_userId: { tontineId: tontine.id, userId: input.actorUserId },
    },
    create: {
      tontineId: tontine.id,
      userId: input.actorUserId,
      vote: true,
      reason: reasonClean,
    },
    update: { vote: true, reason: reasonClean, votedAt: new Date() },
  });

  const memberIds = tontine.group.members.map((m) => m.userId);
  // Le vote de l'admin émetteur est IMPLICITE (=oui). On le compte sans
  // exiger qu'il ait cliqué.
  const otherIds = memberIds.filter((u) => u !== requestedById);

  const positiveVotes = await (prisma as any).tontineCancellationVote.findMany({
    where: { tontineId: tontine.id, vote: true, userId: { in: otherIds } },
    select: { userId: true },
  });
  const approvedCount = positiveVotes.length;
  const totalRequired = otherIds.length;

  if (approvedCount >= totalRequired) {
    // Unanimité atteinte → CANCELLED
    const now = new Date();
    await prisma.tontine.update({
      where: { id: tontine.id },
      data: ({
        status: "CANCELLED",
        cancelledAt: now,
        cancellationStatus: "APPROVED",
      } as any),
    });

    const reasonStored = (tontine as any).cancellationReason ?? "";
    void notifyMany(memberIds, {
      kind: "TONTINE_CANCELLATION_APPROVED" as any,
      title: "Tontine supprimée",
      body: `La suppression a été validée à l'unanimité. Raison : ${reasonStored || "—"}`,
      link: `/dashboard/groups/${tontine.groupId}`,
      payload: {
        groupId: tontine.groupId,
        tontineId: tontine.id,
        reason: reasonStored,
      },
      senderUserId: input.actorUserId,
    });

    void cacheInvalidatePrefix(`group-detail:${tontine.groupId}:`);

    return { status: "APPROVED", approvedCount, totalRequired };
  }

  void cacheInvalidatePrefix(`group-detail:${tontine.groupId}:`);

  return { status: "PROPOSED", approvedCount, totalRequired };
}

/**
 * V219.C — Helper pour l'UI : retourne l'état de la demande de suppression
 * (statut, raison, dates, votes) — utile pour rendre le bandeau de vote.
 */
export async function getTontineCancellationStatus(tontineId: string): Promise<{
  status: "PROPOSED" | "APPROVED" | "REJECTED" | null;
  reason: string | null;
  requestedAt: string | null;
  requestedById: string | null;
  votes: Array<{
    userId: string;
    vote: boolean;
    reason: string | null;
    votedAt: string;
  }>;
}> {
  const tontine = await prisma.tontine.findUnique({
    where: { id: tontineId },
    select: {
      cancellationStatus: true,
      cancellationReason: true,
      cancellationRequestedAt: true,
      cancellationRequestedById: true,
    } as any,
  });
  if (!tontine) throw Errors.notFound("Cette tontine est introuvable 🔍");

  const votes = (await (prisma as any).tontineCancellationVote.findMany({
    where: { tontineId },
    orderBy: { votedAt: "asc" },
  })) as Array<{
    userId: string;
    vote: boolean;
    reason: string | null;
    votedAt: Date;
  }>;

  const t = tontine as any;
  return {
    status: t.cancellationStatus ?? null,
    reason: t.cancellationReason ?? null,
    requestedAt: t.cancellationRequestedAt
      ? new Date(t.cancellationRequestedAt).toISOString()
      : null,
    requestedById: t.cancellationRequestedById ?? null,
    votes: votes.map((v) => ({
      userId: v.userId,
      vote: v.vote,
      reason: v.reason,
      votedAt: v.votedAt.toISOString(),
    })),
  };
}
