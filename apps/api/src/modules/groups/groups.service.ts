import { GroupType, MemberRole, Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

export interface CreateGroupInput {
  name: string;
  type: GroupType;
  defaultCurrency?: string;
  createdById: string;
}

export async function createGroup(input: CreateGroupInput) {
  const name = input.name.trim();
  if (!name) throw Errors.badRequest("Group name required");

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
  return prisma.group.findMany({
    where: { members: { some: { userId } } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
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
  if (!group) throw Errors.notFound("Group not found");
  const isMember = group.members.some((m) => m.userId === userId);
  if (!isMember) throw Errors.forbidden("You are not a member of this group");
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
  if (!member) throw Errors.forbidden("Not a member");
  if (!allowed.includes(member.role)) {
    throw Errors.forbidden(`Requires role in: ${allowed.join(", ")}`);
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
    return await prisma.groupMember.create({
      data: {
        groupId: input.groupId,
        userId,
        role: input.role ?? "MEMBER",
      },
      include: {
        user: { select: { id: true, displayName: true, avatar: true } },
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw Errors.conflict("This user is already a member of this group");
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
    throw Errors.badRequest("Aucune invitation fournie");
  }
  if (input.invitations.length > 50) {
    throw Errors.badRequest("Maximum 50 invitations par lot");
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
    throw Errors.notFound("Membre introuvable dans ce groupe");
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
        "Impossible de retirer le dernier admin. Promeut d'abord un autre membre.",
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
    throw Errors.notFound("Membre introuvable");
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
      throw Errors.badRequest("Le groupe doit garder au moins 1 admin");
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
}) {
  await getGroupForMember(input.groupId, input.actorUserId);
  return prisma.groupInviteToken.findMany({
    where: { groupId: input.groupId, revokedAt: null },
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
  if (!t) throw Errors.notFound("Token introuvable");
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
  if (!t) throw Errors.notFound("Lien introuvable ou expiré");
  if (t.revokedAt) throw Errors.notFound("Lien révoqué");
  if (t.expiresAt && t.expiresAt < new Date()) {
    throw Errors.notFound("Lien expiré");
  }
  if (t.maxUses && t.uses >= t.maxUses) {
    throw Errors.notFound("Lien déjà utilisé son maximum");
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
  if (!t) throw Errors.notFound("Lien introuvable");
  if (t.revokedAt) throw Errors.badRequest("Lien révoqué");
  if (t.expiresAt && t.expiresAt < new Date()) {
    throw Errors.badRequest("Lien expiré");
  }
  if (t.maxUses && t.uses >= t.maxUses) {
    throw Errors.badRequest("Lien déjà utilisé son maximum");
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

  return { groupId: t.groupId, alreadyMember: false };
}

// ============================================================
// ACTIVITY LOG (fil d'événements)
// ============================================================

export async function logActivity(input: {
  groupId: string;
  actorId?: string;
  kind: ActivityKind;
  payload?: any;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        groupId: input.groupId,
        actorId: input.actorId ?? null,
        kind: input.kind,
        payload: input.payload ?? undefined,
      },
    });
  } catch {
    // Best-effort : ne pas planter une opération métier si le log échoue
  }
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
