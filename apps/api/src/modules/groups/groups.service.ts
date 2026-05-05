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
    // Shadow user (no display name yet — the invitee will set it on first login)
    const shadowName =
      input.contactType === "EMAIL"
        ? value.split("@")[0] ?? "Invité"
        : `+${value.replace(/\D/g, "")}`;

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
