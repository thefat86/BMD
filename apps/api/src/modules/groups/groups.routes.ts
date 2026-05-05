import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContactType, GroupType, MemberRole } from "@prisma/client";
import {
  addMemberByContact,
  batchInviteMembers,
  createGroup,
  getGroupForMember,
  listGroupsForUser,
} from "./groups.service.js";

const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.nativeEnum(GroupType),
  defaultCurrency: z.string().length(3).optional(),
});

const inviteSchema = z.object({
  contactType: z.nativeEnum(ContactType),
  contactValue: z.string().min(3),
  displayName: z.string().min(1).max(80).optional(),
  role: z.nativeEnum(MemberRole).optional(),
});

const batchInviteSchema = z.object({
  invitations: z
    .array(
      z.object({
        contactType: z.nativeEnum(ContactType),
        contactValue: z.string().min(3),
        displayName: z.string().min(1).max(80).optional(),
      }),
    )
    .min(1)
    .max(50),
  role: z.nativeEnum(MemberRole).optional(),
});

export async function groupsRoutes(app: FastifyInstance): Promise<void> {
  // Toutes les routes nécessitent l'auth
  app.addHook("onRequest", app.authenticate);

  app.get("/groups", async (req) => {
    const groups = await listGroupsForUser(req.user.sub);
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      defaultCurrency: g.defaultCurrency,
      createdAt: g.createdAt.toISOString(),
      membersCount: g._count.members,
    }));
  });

  app.post("/groups", async (req, reply) => {
    const body = createGroupSchema.parse(req.body);
    const group = await createGroup({ ...body, createdById: req.user.sub });
    return reply.code(201).send({
      id: group.id,
      name: group.name,
      type: group.type,
      defaultCurrency: group.defaultCurrency,
      createdAt: group.createdAt.toISOString(),
      members: group.members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        user: {
          id: m.user.id,
          displayName: m.user.displayName,
          avatar: m.user.avatar,
          defaultCurrency: m.user.defaultCurrency,
          defaultLocale: m.user.defaultLocale,
        },
      })),
    });
  });

  app.get("/groups/:id", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const group = await getGroupForMember(params.id, req.user.sub);
    return {
      id: group.id,
      name: group.name,
      type: group.type,
      defaultCurrency: group.defaultCurrency,
      createdAt: group.createdAt.toISOString(),
      members: group.members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        user: m.user,
      })),
    };
  });

  app.post("/groups/:id/members", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = inviteSchema.parse(req.body);
    const member = await addMemberByContact({
      groupId: params.id,
      invitedById: req.user.sub,
      contactType: body.contactType,
      contactValue: body.contactValue,
      displayName: body.displayName,
      role: body.role,
    });
    return reply.code(201).send({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      user: member.user,
    });
  });

  /**
   * POST /groups/:id/members/batch
   * Invite plusieurs contacts d'un coup (typiquement après un Contact Picker mobile).
   * Continue même si certains échouent — retourne added[] et failed[].
   * Limite : 50 contacts par requête.
   */
  app.post("/groups/:id/members/batch", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = batchInviteSchema.parse(req.body);
    const result = await batchInviteMembers({
      groupId: params.id,
      invitedById: req.user.sub,
      invitations: body.invitations,
      role: body.role,
    });
    return result;
  });
}
