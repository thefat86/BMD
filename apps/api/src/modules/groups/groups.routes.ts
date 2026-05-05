import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContactType, GroupType, MemberRole } from "@prisma/client";
import {
  addMemberByContact,
  batchInviteMembers,
  changeMemberRole,
  createGroup,
  createInviteToken,
  deleteGroup,
  getGroupForMember,
  getPublicTokenInfo,
  joinGroupViaToken,
  listActivities,
  listGroupsForUser,
  listInviteTokens,
  removeMember,
  revokeInviteToken,
  updateGroup,
} from "./groups.service.js";
import { validateContact } from "../../lib/validators.js";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.nativeEnum(GroupType),
  defaultCurrency: z.string().length(3).optional(),
});

/**
 * Validation E.164/RFC 5322 sur chaque entrée. La valeur normalisée
 * remplace la valeur saisie pour éviter les doublons (espaces, casse).
 */
const inviteSchema = z
  .object({
    contactType: z.nativeEnum(ContactType),
    contactValue: z.string().min(3),
    displayName: z.string().min(1).max(80).optional(),
    role: z.nativeEnum(MemberRole).optional(),
  })
  .superRefine((data, ctx) => {
    const r = validateContact(data.contactType, data.contactValue);
    if (!r.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactValue"],
        message: r.message ?? "Contact invalide",
      });
    } else if (r.value) {
      data.contactValue = r.value;
    }
  });

const batchInviteSchema = z.object({
  invitations: z
    .array(
      z
        .object({
          contactType: z.nativeEnum(ContactType),
          contactValue: z.string().min(3),
          displayName: z.string().min(1).max(80).optional(),
        })
        .superRefine((data, ctx) => {
          const r = validateContact(data.contactType, data.contactValue);
          if (!r.ok) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["contactValue"],
              message: r.message ?? "Contact invalide",
            });
          } else if (r.value) {
            data.contactValue = r.value;
          }
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

  // ============================================================
  // SETTINGS GROUPE (rename / delete)
  // ============================================================

  app.patch("/groups/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        defaultCurrency: z.string().length(3).optional(),
      })
      .parse(req.body);
    const updated = await updateGroup({
      groupId: id,
      actorUserId: req.user.sub,
      name: body.name,
      defaultCurrency: body.defaultCurrency,
    });
    return {
      id: updated.id,
      name: updated.name,
      defaultCurrency: updated.defaultCurrency,
    };
  });

  app.delete("/groups/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteGroup({ groupId: id, actorUserId: req.user.sub });
    return reply.code(204).send();
  });

  // ============================================================
  // GESTION DES MEMBRES (remove / change role)
  // ============================================================

  app.delete("/groups/:gid/members/:mid", async (req, reply) => {
    const { gid, mid } = z
      .object({ gid: z.string().uuid(), mid: z.string().uuid() })
      .parse(req.params);
    await removeMember({
      groupId: gid,
      actorUserId: req.user.sub,
      memberId: mid,
    });
    return reply.code(204).send();
  });

  app.patch("/groups/:gid/members/:mid", async (req) => {
    const { gid, mid } = z
      .object({ gid: z.string().uuid(), mid: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({ role: z.nativeEnum(MemberRole) })
      .parse(req.body);
    const updated = await changeMemberRole({
      groupId: gid,
      actorUserId: req.user.sub,
      memberId: mid,
      newRole: body.role,
    });
    return { id: updated.id, role: updated.role };
  });

  /**
   * PATCH /groups/:id/dnd
   * Toggle "Ne pas déranger" (spec §3.12) pour la membership de
   * l'utilisateur courant dans ce groupe.
   * Body: { doNotDisturb: boolean }
   */
  app.patch("/groups/:id/dnd", async (req) => {
    const { id: groupId } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({ doNotDisturb: z.boolean() })
      .parse(req.body);
    // On modifie uniquement la propre membership de l'utilisateur
    const r = await prisma.groupMember.updateMany({
      where: {
        groupId,
        userId: req.user.sub,
      },
      data: { doNotDisturb: body.doNotDisturb },
    });
    if (r.count === 0) {
      throw Errors.notFound("Tu n'es pas membre de ce groupe");
    }
    return { doNotDisturb: body.doNotDisturb };
  });

  // ============================================================
  // INVITE TOKENS (lien partageable + QR)
  // ============================================================

  app.post("/groups/:id/invite-tokens", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        maxUses: z.number().int().positive().optional(),
        expiresInDays: z.number().int().positive().max(365).optional(),
      })
      .parse(req.body ?? {});
    const t = await createInviteToken({
      groupId: id,
      actorUserId: req.user.sub,
      maxUses: body.maxUses,
      expiresInDays: body.expiresInDays,
    });
    return reply.code(201).send({
      id: t.id,
      token: t.token,
      maxUses: t.maxUses,
      uses: t.uses,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    });
  });

  app.get("/groups/:id/invite-tokens", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tokens = await listInviteTokens({
      groupId: id,
      actorUserId: req.user.sub,
    });
    return tokens.map((t) => ({
      id: t.id,
      token: t.token,
      maxUses: t.maxUses,
      uses: t.uses,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    }));
  });

  app.delete("/invite-tokens/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await revokeInviteToken({ tokenId: id, actorUserId: req.user.sub });
    return reply.code(204).send();
  });

  /**
   * GET /invite-info/:token (PUBLIC, pas d'auth)
   * Page d'aperçu du groupe avant join.
   */
  app.get(
    "/invite-info/:token",
    { config: { skipAuth: true } as any },
    async (req) => {
      const { token } = z
        .object({ token: z.string().min(8).max(50) })
        .parse(req.params);
      const info = await getPublicTokenInfo(token);
      return info;
    },
  );

  /**
   * POST /invite-join/:token (auth requise)
   * Rejoint le groupe via un token. L'utilisateur doit déjà avoir un compte.
   */
  app.post("/invite-join/:token", async (req) => {
    const { token } = z
      .object({ token: z.string().min(8).max(50) })
      .parse(req.params);
    const result = await joinGroupViaToken({
      token,
      actorUserId: req.user.sub,
    });
    return result;
  });

  // ============================================================
  // ACTIVITY LOG
  // ============================================================

  /**
   * GET /groups/:id/activity/verify
   * Vérifie l'intégrité de la chaîne de hash du journal d'audit (spec §3.6 §9.1).
   * Retourne { valid, count, brokenAt? }. Admin uniquement.
   */
  app.get("/groups/:id/activity/verify", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { verifyActivityChain } = await import("./groups.service.js");
    return verifyActivityChain({
      groupId: id,
      actorUserId: req.user.sub,
    });
  });

  app.get("/groups/:id/activity", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const items = await listActivities({
      groupId: id,
      actorUserId: req.user.sub,
    });
    return items.map((a) => ({
      id: a.id,
      kind: a.kind,
      actor: a.actor
        ? { id: a.actor.id, displayName: a.actor.displayName }
        : null,
      payload: a.payload,
      createdAt: a.createdAt.toISOString(),
    }));
  });
}
