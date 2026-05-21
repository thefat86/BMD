import { GroupType, MemberRole, Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import {
  assertCanAddMember,
  assertCanCreateGroup,
} from "../../lib/plan-limits.js";
import {
  notifyGroupMembers,
  notifyOne,
} from "../notifications/notifications.service.js";

export interface CreateGroupInput {
  name: string;
  type: GroupType;
  defaultCurrency?: string;
  createdById: string;
}

export async function createGroup(input: CreateGroupInput) {
  const name = input.name.trim();
  if (!name)
    throw Errors.invalidFormula({
      what: "le nom du groupe",
      why: "Un groupe a besoin d'un petit nom pour qu'on s'y retrouve.",
      fix: "Donne-lui un nom court et parlant, ex: « Vacances Sénégal », « Coloc Pigalle », « Coliso 2026 »…",
    });

  // Spec §6.3 : appliquer les limites du plan (FREE = 2 groupes max par défaut)
  await assertCanCreateGroup(input.createdById);

  return prisma.group.create({
    data: {
      name,
      type: input.type,
      defaultCurrency: input.defaultCurrency ?? "EUR",
      createdById: input.createdById,
      members: {
        create: { userId: input.createdById, role: "ADMIN" },
      },
    },
    include: { members: { include: { user: true } } },
  });
}

export async function listGroupsForUser(userId: string) {
  // 1. Récupère les groupes + compteur membres
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId } } },
    include: {
      _count: { select: { members: true, expenses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // 2. Pour chaque groupe : total des dépenses + mon solde net
  // Une seule requête agregée pour le total, puis une autre pour mon owe.
  // C'est O(1) requêtes par groupe — acceptable pour le dashboard.
  const enriched = await Promise.all(
    groups.map(async (g) => {
      const [totalAgg, myShareAgg, paidByMeAgg] = await Promise.all([
        prisma.expense.aggregate({
          where: { groupId: g.id },
          _sum: { amount: true },
        }),
        prisma.expenseShare.aggregate({
          where: { userId, expense: { groupId: g.id } },
          _sum: { amountOwed: true },
        }),
        prisma.expense.aggregate({
          where: { groupId: g.id, paidById: userId },
          _sum: { amount: true },
        }),
      ]);
      const totalSpent = parseFloat(
        totalAgg._sum.amount?.toString() ?? "0",
      );
      const myShare = parseFloat(
        myShareAgg._sum.amountOwed?.toString() ?? "0",
      );
      const paidByMe = parseFloat(
        paidByMeAgg._sum.amount?.toString() ?? "0",
      );
      // Solde net = ce que j'ai payé - ce que je dois (positif = on me doit)
      const myNet = paidByMe - myShare;
      return {
        ...g,
        totalSpent: totalSpent.toFixed(2),
        myNet: myNet.toFixed(2),
      };
    }),
  );
  return enriched;
}

export async function getGroupForMember(groupId: string, userId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true, avatar: true } },
        },
      },
    },
  });
  if (!group) throw Errors.notFound("Ce groupe est introuvable 🔍");
  const isMember = group.members.some((m) => m.userId === userId);
  if (!isMember) throw Errors.notMember("ce groupe");
  return group;
}

export async function assertRole(
  groupId: string,
  userId: string,
  allowed: MemberRole[],
): Promise<void> {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member) throw Errors.notMember("ce groupe");
  if (!allowed.includes(member.role)) {
    const niceRoles = allowed
      .map((r) =>
        r === "ADMIN"
          ? "admin"
          : r === "TREASURER"
            ? "trésorier"
            : r === "MEMBER"
              ? "membre"
              : "observateur",
      )
      .join(" ou ");
    throw Errors.roleRequired(niceRoles, "cette action");
  }
}

/**
 * Add a member to the group.
 * If the contact does not exist yet, create a "shadow" user with that contact (unverified)
 * so the invitation flow can attach to it later.
 */
export async function addMemberByContact(input: {
  groupId: string;
  invitedById: string;
  contactType: "PHONE" | "EMAIL";
  contactValue: string;
  role?: MemberRole;
  /**
   * Optionnel : nom à afficher pour le shadow user (typiquement fourni par
   * le Contact Picker du téléphone). Permet d'éviter "+33612345678" pour
   * un contact qui s'appelle "Marie K.".
   * Le contact reste un shadow user non vérifié — le nom est juste
   * informatif jusqu'à sa première connexion.
   */
  displayName?: string;
}) {
  await assertRole(input.groupId, input.invitedById, ["ADMIN", "TREASURER"]);
  // Spec §6.3 : limite "members per group" du plan du créateur
  await assertCanAddMember(input.groupId);
  // Bloque l'invitation si le groupe est verrouillé (downgrade — read-only)
  const { assertGroupNotLocked } = await import(
    "../subscription/subscription-state.service.js"
  );
  await assertGroupNotLocked(input.groupId);
  const value = input.contactValue.trim();

  let contact = await prisma.userContact.findUnique({
    where: { type_value: { type: input.contactType, value } },
    include: { user: true },
  });

  let userId: string;
  if (contact) {
    userId = contact.userId;
  } else {
    // Shadow user. Le displayName fourni par l'invitant est utilisé s'il existe,
    // sinon on tombe sur un nom dérivé du contact (e-mail prefix ou numéro).
    const shadowName =
      input.displayName?.trim() ||
      (input.contactType === "EMAIL"
        ? value.split("@")[0] ?? "Invité"
        : `+${value.replace(/\D/g, "")}`);

    const newUser = await prisma.user.create({
      data: {
        displayName: shadowName,
        contacts: {
          create: {
            type: input.contactType,
            value,
            isVerified: false,
            isPrimary: true,
          },
        },
      },
    });
    userId = newUser.id;
  }

  // Idempotent : ne pas re-créer si déjà membre
  try {
    const created = await prisma.groupMember.create({
      data: {
        groupId: input.groupId,
        userId,
        role: input.role ?? "MEMBER",
      },
      include: {
        user: { select: { id: true, displayName: true, avatar: true } },
      },
    });

    // Notification au nouvel invité (s'il a déjà un compte vérifié)
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { name: true },
    });
    if (group) {
      void notifyOne(userId, {
        kind: "GROUP_INVITED",
        title: `Tu as été ajouté à ${group.name}`,
        body: "Ouvre l'app pour voir les détails du groupe.",
        link: `/dashboard/groups/${input.groupId}`,
        payload: { groupId: input.groupId },
      });
      // Notification aux autres membres existants
      void notifyGroupMembers({
        groupId: input.groupId,
        excludeUserId: userId, // n'inclus pas le nouveau
        notification: {
          kind: "MEMBER_JOINED",
          title: `${created.user.displayName} a rejoint ${group.name}`,
          link: `/dashboard/groups/${input.groupId}`,
          payload: { groupId: input.groupId, memberId: created.id },
        },
      });
    }

    return created;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw Errors.alreadyExists({
        what: "Cette personne est déjà dans le groupe",
        tip: "Pas besoin de l'inviter à nouveau, elle peut déjà voir et participer 🎉",
      });
    }
    throw e;
  }
}

/**
 * Invite plusieurs contacts d'un coup (depuis un Contact Picker mobile par ex).
 * Continue même si certains échouent — retourne les détails par contact.
 *
 * RGPD : aucun contact non sélectionné n'est jamais touché. Aucune données
 * additionnelle n'est lue depuis le téléphone (seulement nom + tel ou email).
 * Les contacts qui ne s'inscrivent jamais restent des "shadow users" et peuvent
 * être supprimés sur demande conformément au droit à l'oubli.
 */
export interface BatchInviteItem {
  contactType: "PHONE" | "EMAIL";
  contactValue: string;
  displayName?: string;
}

export interface BatchInviteResult {
  added: Array<{
    contactValue: string;
    memberId: string;
    userId: string;
    displayName: string;
  }>;
  failed: Array<{
    contactValue: string;
    reason: string;
  }>;
}

export async function batchInviteMembers(input: {
  groupId: string;
  invitedById: string;
  invitations: BatchInviteItem[];
  role?: MemberRole;
}): Promise<BatchInviteResult> {
  if (input.invitations.length === 0) {
    throw Errors.badRequest(
      "Tu n'as sélectionné personne à inviter 🤷",
      {
        tip: "Coche au moins un contact dans la liste avant de valider.",
      },
    );
  }
  if (input.invitations.length > 50) {
    throw Errors.badRequest(
      "On ne peut envoyer que 50 invitations à la fois ✋",
      {
        tip: "Découpe en plusieurs lots : ça te permet aussi de surveiller que tout part bien.",
      },
    );
  }

  // Une seule vérif de rôle pour tout le batch (perf)
  await assertRole(input.groupId, input.invitedById, ["ADMIN", "TREASURER"]);

  const result: BatchInviteResult = { added: [], failed: [] };

  for (const item of input.invitations) {
    const value = item.contactValue.trim();
    if (!value) {
      result.failed.push({ contactValue: value, reason: "Vide" });
      continue;
    }
    try {
      const member = await addMemberByContact({
        groupId: input.groupId,
        invitedById: input.invitedById,
        contactType: item.contactType,
        contactValue: value,
        displayName: item.displayName,
        role: input.role,
      });
      result.added.push({
        contactValue: value,
        memberId: member.id,
        userId: member.user.id,
        displayName: member.user.displayName,
      });
    } catch (e) {
      const reason =
        e instanceof Error ? e.message : "Erreur inconnue";
      result.failed.push({ contactValue: value, reason });
    }
  }

  return result;
}

import { randomBytes } from "node:crypto";
import type { ActivityKind } from "@prisma/client";

// ============================================================
// SETTINGS GROUPE (rename / delete / change defaults)
// ============================================================

export async function updateGroup(input: {
  groupId: string;
  actorUserId: string;
  name?: string;
  defaultCurrency?: string;
}) {
  await assertRole(input.groupId, input.actorUserId, ["ADMIN"]);

  const updated = await prisma.group.update({
    where: { id: input.groupId },
    data: {
      ...(input.name && { name: input.name.trim() }),
      ...(input.defaultCurrency && {
        defaultCurrency: input.defaultCurrency.toUpperCase(),
      }),
    },
  });

  if (input.name) {
    await logActivity({
      groupId: input.groupId,
      actorId: input.actorUserId,
      kind: "GROUP_RENAMED",
      payload: { newName: updated.name },
    });
  }

  return updated;
}

export async function deleteGroup(input: {
  groupId: string;
  actorUserId: string;
}) {
  await assertRole(input.groupId, input.actorUserId, ["ADMIN"]);
  // Cascade : tout est nettoyé via les @relation onDelete: Cascade
  await prisma.group.delete({ where: { id: input.groupId } });
  return { deleted: true };
}

// ============================================================
// GESTION DES MEMBRES
// ============================================================

export async function removeMember(input: {
  groupId: string;
  actorUserId: string;
  memberId: string;
}) {
  // ADMIN peut retirer n'importe qui SAUF le dernier ADMIN
  // Tout membre peut se retirer lui-même (sauf s'il est dernier ADMIN)
  const member = await prisma.groupMember.findUnique({
    where: { id: input.memberId },
    include: { user: true },
  });
  if (!member || member.groupId !== input.groupId) {
    throw Errors.notFound("Ce membre n'est pas (ou plus) dans ce groupe 🔍");
  }

  const isSelfRemoval = member.userId === input.actorUserId;
  if (!isSelfRemoval) {
    await assertRole(input.groupId, input.actorUserId, ["ADMIN"]);
  }

  // Empêche de retirer le dernier ADMIN
  if (member.role === "ADMIN") {
    const otherAdmins = await prisma.groupMember.count({
      where: {
        groupId: input.groupId,
        role: "ADMIN",
        id: { not: member.id },
      },
    });
    if (otherAdmins === 0) {
      throw Errors.badRequest(
        "Ce membre est le dernier admin du groupe — on ne peut pas le retirer 🛡️",
        {
          tip: "Un groupe a toujours besoin d'au moins un admin pour fonctionner. Promeus d'abord un autre membre, puis tu pourras retirer celui-ci.",
        },
      );
    }
  }

  await prisma.groupMember.delete({ where: { id: input.memberId } });

  await logActivity({
    groupId: input.groupId,
    actorId: input.actorUserId,
    kind: isSelfRemoval ? "MEMBER_LEFT" : "MEMBER_REMOVED",
    payload: { memberName: member.user.displayName },
  });

  return { removed: true };
}

export async function changeMemberRole(input: {
  groupId: string;
  actorUserId: string;
  memberId: string;
  newRole: MemberRole;
}) {
  await assertRole(input.groupId, input.actorUserId, ["ADMIN"]);

  const member = await prisma.groupMember.findUnique({
    where: { id: input.memberId },
    include: { user: true },
  });
  if (!member || member.groupId !== input.groupId) {
    throw Errors.notFound("Ce membre est introuvable dans le groupe 🔍");
  }

  // Si on retrograde un ADMIN, vérifier qu'il en reste au moins un
  if (member.role === "ADMIN" && input.newRole !== "ADMIN") {
    const otherAdmins = await prisma.groupMember.count({
      where: {
        groupId: input.groupId,
        role: "ADMIN",
        id: { not: member.id },
      },
    });
    if (otherAdmins === 0) {
      throw Errors.badRequest(
        "Tu ne peux pas rétrograder le seul admin du groupe 🛡️",
        {
          tip: "Promeus d'abord un autre membre au rôle d'admin avant de changer celui-ci — un groupe a toujours besoin d'au moins une personne aux commandes.",
        },
      );
    }
  }

  const updated = await prisma.groupMember.update({
    where: { id: input.memberId },
    data: { role: input.newRole },
  });

  await logActivity({
    groupId: input.groupId,
    actorId: input.actorUserId,
    kind: "ROLE_CHANGED",
    payload: {
      memberName: member.user.displayName,
      newRole: input.newRole,
    },
  });

  return updated;
}

// ============================================================
// INVITE TOKENS (lien partageable + QR code)
// ============================================================

function generateToken(): string {
  // 16 bytes = 128 bits, base64url-safe
  return randomBytes(16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function createInviteToken(input: {
  groupId: string;
  actorUserId: string;
  maxUses?: number; // null = illimité
  expiresInDays?: number;
}) {
  await assertRole(input.groupId, input.actorUserId, ["ADMIN", "TREASURER"]);

  const token = generateToken();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const created = await prisma.groupInviteToken.create({
    data: {
      token,
      groupId: input.groupId,
      createdById: input.actorUserId,
      maxUses: input.maxUses,
      expiresAt,
    },
  });

  await logActivity({
    groupId: input.groupId,
    actorId: input.actorUserId,
    kind: "INVITE_LINK_CREATED",
    payload: { tokenId: created.id },
  });

  return created;
}

export async function listInviteTokens(input: {
  groupId: string;
  actorUserId: string;
  /** Inclure les tokens révoqués (par défaut false). */
  includeRevoked?: boolean;
}) {
  await getGroupForMember(input.groupId, input.actorUserId);
  return prisma.groupInviteToken.findMany({
    where: {
      groupId: input.groupId,
      ...(input.includeRevoked ? {} : { revokedAt: null }),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeInviteToken(input: {
  tokenId: string;
  actorUserId: string;
}) {
  const t = await prisma.groupInviteToken.findUnique({
    where: { id: input.tokenId },
  });
  if (!t) throw Errors.notFound("Ce lien d'invitation est introuvable 🔗");
  await assertRole(t.groupId, input.actorUserId, ["ADMIN", "TREASURER"]);
  await prisma.groupInviteToken.update({
    where: { id: input.tokenId },
    data: { revokedAt: new Date() },
  });
  return { revoked: true };
}

/**
 * Récupère les infos publiques d'un token (pour la page /join).
 * Ne nécessite PAS d'auth — c'est l'écran d'aperçu pour l'invité.
 * Mais on filtre les infos sensibles.
 */
export async function getPublicTokenInfo(token: string) {
  const t = await prisma.groupInviteToken.findUnique({
    where: { token },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          type: true,
          defaultCurrency: true,
          _count: { select: { members: true } },
        },
      },
      createdBy: {
        select: { displayName: true },
      },
    },
  });
  if (!t)
    throw Errors.notFound(
      "Ce lien d'invitation n'existe pas (ou plus) 🔗",
      {
        tip: "Demande à la personne qui te l'a envoyé de te générer un nouveau lien.",
      },
    );
  if (t.revokedAt)
    throw Errors.notFound(
      "Ce lien d'invitation a été désactivé par un admin 🚫",
      {
        tip: "Demande à un admin du groupe de t'en envoyer un nouveau.",
      },
    );
  if (t.expiresAt && t.expiresAt < new Date()) {
    throw Errors.notFound(
      "Ce lien d'invitation a expiré ⏰",
      {
        tip: "Pas de panique : un admin peut t'en générer un tout neuf en quelques secondes.",
      },
    );
  }
  if (t.maxUses && t.uses >= t.maxUses) {
    throw Errors.notFound(
      "Ce lien d'invitation a atteint son nombre max d'utilisations 🎯",
      {
        tip: "C'est par mesure de sécurité — demande un nouveau lien à un admin.",
      },
    );
  }
  return {
    token: t.token,
    group: t.group,
    invitedBy: t.createdBy.displayName,
  };
}

/**
 * Utilise le token pour rejoindre le groupe.
 * Le user doit déjà être authentifié.
 */
export async function joinGroupViaToken(input: {
  token: string;
  actorUserId: string;
}) {
  const t = await prisma.groupInviteToken.findUnique({
    where: { token: input.token },
  });
  if (!t)
    throw Errors.notFound(
      "Ce lien d'invitation n'existe pas (ou plus) 🔗",
      {
        tip: "Demande à la personne qui te l'a envoyé de t'en générer un nouveau.",
      },
    );
  if (t.revokedAt)
    throw Errors.badRequest(
      "Ce lien d'invitation a été désactivé 🚫",
      {
        tip: "Un admin l'a révoqué — demande-lui de t'en envoyer un nouveau.",
      },
    );
  if (t.expiresAt && t.expiresAt < new Date()) {
    throw Errors.badRequest(
      "Ce lien d'invitation a expiré ⏰",
      {
        tip: "Demande à un admin de te regénérer un lien — c'est instantané.",
      },
    );
  }
  if (t.maxUses && t.uses >= t.maxUses) {
    throw Errors.badRequest(
      "Ce lien a atteint son nombre max d'utilisations 🎯",
      {
        tip: "Le quota est dépassé — demande un nouveau lien à un admin du groupe.",
      },
    );
  }

  // Vérifier qu'on n'est pas déjà membre
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: t.groupId, userId: input.actorUserId } },
  });
  if (existing) {
    return { groupId: t.groupId, alreadyMember: true };
  }

  // Ajouter comme MEMBER + incrémenter le compteur
  await prisma.$transaction([
    prisma.groupMember.create({
      data: {
        groupId: t.groupId,
        userId: input.actorUserId,
        role: "MEMBER",
      },
    }),
    prisma.groupInviteToken.update({
      where: { id: t.id },
      data: { uses: { increment: 1 } },
    }),
  ]);

  await logActivity({
    groupId: t.groupId,
    actorId: input.actorUserId,
    kind: "MEMBER_JOINED",
    payload: { via: "invite_link" },
  });

  // Notif aux membres déjà présents du nouveau venu
  const [actor, group] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { displayName: true },
    }),
    prisma.group.findUnique({
      where: { id: t.groupId },
      select: { name: true },
    }),
  ]);
  if (actor && group) {
    void notifyGroupMembers({
      groupId: t.groupId,
      excludeUserId: input.actorUserId,
      notification: {
        kind: "MEMBER_JOINED",
        title: `${actor.displayName} a rejoint ${group.name}`,
        body: "Via un lien d'invitation",
        link: `/dashboard/groups/${t.groupId}`,
        payload: { groupId: t.groupId },
      },
    });
  }

  return { groupId: t.groupId, alreadyMember: false };
}

// ============================================================
// ACTIVITY LOG (fil d'événements)
// ============================================================

/**
 * Audit log signé (spec §3.6 §9.1) — chaîne de hash anti-falsification.
 *
 * Chaque entrée porte :
 *  - prevHash : selfHash de la précédente entrée du même groupe
 *  - selfHash : sha256(prevHash + id + groupId + actorId + kind + payloadJSON + createdAt)
 *
 * Vérification d'intégrité : on rejoue la chaîne en recalculant chaque selfHash
 * et en confirmant que prevHash[n+1] = selfHash[n]. Toute altération casse
 * la chaîne au point d'altération, rendant la fraude détectable.
 */
async function computeLogHash(input: {
  prevHash: string | null;
  id: string;
  groupId: string;
  actorId: string | null;
  kind: string;
  payload: any;
  createdAt: Date;
}): Promise<string> {
  const { createHash } = await import("crypto");
  const blob = JSON.stringify({
    prev: input.prevHash,
    id: input.id,
    g: input.groupId,
    a: input.actorId,
    k: input.kind,
    p: input.payload ?? null,
    t: input.createdAt.toISOString(),
  });
  return createHash("sha256").update(blob).digest("hex");
}

export async function logActivity(input: {
  groupId: string;
  actorId?: string;
  kind: ActivityKind;
  payload?: any;
}): Promise<void> {
  try {
    // 1. On récupère le selfHash de la dernière entrée du groupe (chaîne)
    const last = await prisma.activityLog.findFirst({
      where: { groupId: input.groupId },
      orderBy: { createdAt: "desc" },
      select: { selfHash: true },
    });
    const prevHash = last?.selfHash ?? null;

    // 2. On crée l'entrée (sans selfHash d'abord)
    const created = await prisma.activityLog.create({
      data: {
        groupId: input.groupId,
        actorId: input.actorId ?? null,
        kind: input.kind,
        payload: input.payload ?? undefined,
        prevHash,
      },
    });

    // 3. On calcule le hash et on le persiste
    const selfHash = await computeLogHash({
      prevHash,
      id: created.id,
      groupId: created.groupId,
      actorId: created.actorId,
      kind: created.kind,
      payload: created.payload,
      createdAt: created.createdAt,
    });
    await prisma.activityLog.update({
      where: { id: created.id },
      data: { selfHash },
    });
  } catch (e) {
    console.warn("[logActivity] failed", e);
    // Best-effort : ne pas planter une opération métier si le log échoue
  }
}

/**
 * Vérifie l'intégrité du journal d'audit d'un groupe.
 * Retourne { valid, brokenAt: index? } pour permettre l'affichage admin.
 *
 * Coût : O(n) par groupe — appelable sur demande (pas en hot-path).
 */
export async function verifyActivityChain(input: {
  groupId: string;
  actorUserId: string;
}): Promise<{
  valid: boolean;
  count: number;
  brokenAt?: number;
}> {
  // Auth check : seuls les admins du groupe peuvent vérifier
  await assertRole(input.groupId, input.actorUserId, ["ADMIN"]);
  const entries = await prisma.activityLog.findMany({
    where: { groupId: input.groupId },
    orderBy: { createdAt: "asc" },
  });
  let prevHash: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prevHash !== prevHash) {
      return { valid: false, count: entries.length, brokenAt: i };
    }
    const expected = await computeLogHash({
      prevHash,
      id: e.id,
      groupId: e.groupId,
      actorId: e.actorId,
      kind: e.kind,
      payload: e.payload,
      createdAt: e.createdAt,
    });
    if (e.selfHash !== expected) {
      return { valid: false, count: entries.length, brokenAt: i };
    }
    prevHash = e.selfHash;
  }
  return { valid: true, count: entries.length };
}

export async function listActivities(input: {
  groupId: string;
  actorUserId: string;
  limit?: number;
}) {
  await getGroupForMember(input.groupId, input.actorUserId);
  return prisma.activityLog.findMany({
    where: { groupId: input.groupId },
    include: {
      actor: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 50, 200),
  });
}
