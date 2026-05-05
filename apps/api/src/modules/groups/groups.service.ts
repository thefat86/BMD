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
