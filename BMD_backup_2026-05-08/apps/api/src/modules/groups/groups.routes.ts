import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContactType, GroupType, MemberRole } from "@prisma/client";
import {
  addMemberByContact,
  assertRole,
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
      totalSpent: g.totalSpent,
      myNet: g.myNet,
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
      throw Errors.notMember("ce groupe");
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
    const now = Date.now();
    return tokens.map((t) => {
      // Calcule un statut humain pour faciliter l'affichage côté front
      let status: "active" | "exhausted" | "expired" | "revoked";
      if (t.revokedAt) status = "revoked";
      else if (t.expiresAt && t.expiresAt.getTime() < now) status = "expired";
      else if (t.maxUses && t.uses >= t.maxUses) status = "exhausted";
      else status = "active";
      return {
        id: t.id,
        token: t.token,
        maxUses: t.maxUses,
        uses: t.uses,
        expiresAt: t.expiresAt?.toISOString() ?? null,
        revokedAt: t.revokedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        status,
      };
    });
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

  // ============================================================
  // RÈGLES DE PARTAGE PAR CATÉGORIE (spec §3.7)
  // ============================================================

  /**
   * GET /groups/:id/category-rules
   * Liste les règles de partage configurées pour le groupe.
   * Tous les membres peuvent les lire (utiles pour pré-remplir le form).
   */
  app.get("/groups/:id/category-rules", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await getGroupForMember(id, req.user.sub);
    const rules = await prisma.groupCategoryRule.findMany({
      where: { groupId: id },
      orderBy: { category: "asc" },
    });
    return rules.map((r) => ({
      id: r.id,
      category: r.category,
      defaultSplitMode: r.defaultSplitMode,
      defaultParticipantUserIds: Array.isArray(r.defaultParticipantUserIds)
        ? (r.defaultParticipantUserIds as string[])
        : [],
      defaultPaidByUserId: r.defaultPaidByUserId,
      updatedAt: r.updatedAt.toISOString(),
    }));
  });

  /**
   * PUT /groups/:id/category-rules/:category
   * Crée ou met à jour la règle pour une catégorie. Admin/trésorier seulement.
   * Body : { defaultSplitMode, defaultParticipantUserIds[], defaultPaidByUserId? }
   */
  app.put("/groups/:id/category-rules/:category", async (req) => {
    const { id, category } = z
      .object({
        id: z.string().uuid(),
        category: z.string().min(1).max(40),
      })
      .parse(req.params);
    const body = z
      .object({
        defaultSplitMode: z
          .enum(["EQUAL", "UNEQUAL", "PERCENTAGE", "ITEMIZED"])
          .default("EQUAL"),
        defaultParticipantUserIds: z.array(z.string().uuid()).default([]),
        defaultPaidByUserId: z.string().uuid().nullable().optional(),
      })
      .parse(req.body);
    await assertRole(id, req.user.sub, ["ADMIN", "TREASURER"]);
    const upserted = await prisma.groupCategoryRule.upsert({
      where: { groupId_category: { groupId: id, category } },
      create: {
        groupId: id,
        category,
        defaultSplitMode: body.defaultSplitMode,
        defaultParticipantUserIds: body.defaultParticipantUserIds as any,
        defaultPaidByUserId: body.defaultPaidByUserId ?? null,
      },
      update: {
        defaultSplitMode: body.defaultSplitMode,
        defaultParticipantUserIds: body.defaultParticipantUserIds as any,
        defaultPaidByUserId: body.defaultPaidByUserId ?? null,
      },
    });
    return { id: upserted.id, category: upserted.category };
  });

  /**
   * DELETE /groups/:id/category-rules/:category
   * Supprime la règle pour une catégorie. Admin/trésorier seulement.
   */
  app.delete(
    "/groups/:id/category-rules/:category",
    async (req, reply) => {
      const { id, category } = z
        .object({
          id: z.string().uuid(),
          category: z.string().min(1).max(40),
        })
        .parse(req.params);
      await assertRole(id, req.user.sub, ["ADMIN", "TREASURER"]);
      await prisma.groupCategoryRule.deleteMany({
        where: { groupId: id, category },
      });
      return reply.code(204).send();
    },
  );

  // ============================================================
  // CHARTE GRAPHIQUE PAR GROUPE (spec §6.8)
  // ============================================================

  /**
   * GET /groups/:id/theme
   * Retourne le thème du groupe (ou null s'il utilise les défauts BMD).
   * Tous les membres peuvent le lire (pour appliquer le thème en CSS).
   */
  app.get("/groups/:id/theme", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await getGroupForMember(id, req.user.sub);
    const theme = await prisma.groupTheme.findUnique({
      where: { groupId: id },
    });
    if (!theme) return { theme: null };
    return {
      theme: {
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
        logoUrl: theme.logoUrl,
        preferredMode: theme.preferredMode,
        updatedAt: theme.updatedAt.toISOString(),
      },
    };
  });

  /**
   * PUT /groups/:id/theme
   * Crée ou met à jour le thème. Admin seulement.
   * Body : { primaryColor, accentColor, logoUrl?, preferredMode? }
   * Validation hex sur les couleurs (#RRGGBB).
   */
  app.put("/groups/:id/theme", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        primaryColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#e8a33d"),
        accentColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#b54732"),
        logoUrl: z.string().url().nullable().optional(),
        preferredMode: z.enum(["light", "dark", "system"]).nullable().optional(),
      })
      .parse(req.body);
    await assertRole(id, req.user.sub, ["ADMIN"]);
    const upserted = await prisma.groupTheme.upsert({
      where: { groupId: id },
      create: {
        groupId: id,
        primaryColor: body.primaryColor,
        accentColor: body.accentColor,
        logoUrl: body.logoUrl ?? null,
        preferredMode: body.preferredMode ?? null,
      },
      update: {
        primaryColor: body.primaryColor,
        accentColor: body.accentColor,
        logoUrl: body.logoUrl ?? null,
        preferredMode: body.preferredMode ?? null,
      },
    });
    return {
      theme: {
        primaryColor: upserted.primaryColor,
        accentColor: upserted.accentColor,
        logoUrl: upserted.logoUrl,
        preferredMode: upserted.preferredMode,
        updatedAt: upserted.updatedAt.toISOString(),
      },
    };
  });

  /**
   * DELETE /groups/:id/theme
   * Réinitialise le thème (le groupe utilise les défauts BMD). Admin seulement.
   */
  app.delete("/groups/:id/theme", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await assertRole(id, req.user.sub, ["ADMIN"]);
    await prisma.groupTheme.deleteMany({ where: { groupId: id } });
    return reply.code(204).send();
  });

  // ============================================================
  // SUIVI INVITATIONS — outreach tracking + relances (spec §7.6)
  // ============================================================

  /**
   * GET /groups/:id/invitations
   * Liste les outreaches d'invitation pour ce groupe (envoyée / ouverte /
   * acceptée / annulée). Visible par admin/trésorier.
   */
  app.get("/groups/:id/invitations", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await assertRole(id, req.user.sub, ["ADMIN", "TREASURER"]);
    const outreaches = await prisma.invitationOutreach.findMany({
      where: { inviteToken: { groupId: id } },
      orderBy: { lastSentAt: "desc" },
      take: 200,
    });
    return outreaches.map((o) => ({
      id: o.id,
      contactType: o.contactType,
      contactValue: o.contactValue,
      channel: o.channel,
      tone: o.tone,
      status: o.status,
      remindersSent: o.remindersSent,
      lastSentAt: o.lastSentAt.toISOString(),
      openedAt: o.openedAt?.toISOString() ?? null,
      joinedAt: o.joinedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }));
  });

  /**
   * POST /groups/:id/invitations/:outreachId/resend
   * « Inviter à nouveau » (spec §7.6) — déclenche immédiatement une relance
   * sans attendre J+2/J+5/J+10. Réinitialise lastSentAt à now.
   */
  app.post(
    "/groups/:id/invitations/:outreachId/resend",
    async (req) => {
      const { id, outreachId } = z
        .object({
          id: z.string().uuid(),
          outreachId: z.string().uuid(),
        })
        .parse(req.params);
      await assertRole(id, req.user.sub, ["ADMIN", "TREASURER"]);
      const outreach = await prisma.invitationOutreach.findUnique({
        where: { id: outreachId },
        include: { inviteToken: true },
      });
      if (!outreach || outreach.inviteToken.groupId !== id) {
        throw Errors.notFound("Outreach introuvable");
      }
      if (outreach.status === "JOINED") {
        throw Errors.badRequest(
          "Ce contact a déjà rejoint le groupe — pas la peine de relancer.",
        );
      }
      // Reset lastSentAt à now → la prochaine itération du scheduler ne
      // déclenchera pas de relance auto avant J+2 à compter de maintenant.
      // Côté envoi : pour MVP, on ne fait pas le send ici (le scheduler s'en
      // charge via sendEmail au prochain tick). Si besoin sync, ajouter ici
      // un appel direct à sendEmail.
      const updated = await prisma.invitationOutreach.update({
        where: { id: outreachId },
        data: {
          status: "SENT",
          remindersSent: { increment: 1 },
          lastSentAt: new Date(),
        },
      });
      return {
        id: updated.id,
        remindersSent: updated.remindersSent,
        lastSentAt: updated.lastSentAt.toISOString(),
      };
    },
  );

  /**
   * POST /groups/:id/invitations/track
   * Enregistre un nouvel outreach (envoi initial via UI) :
   * Body: { tokenId, contactType, contactValue, channel, tone? }
   * À appeler dès que l'organisateur clique « Envoyer via WhatsApp/SMS/Email »
   * pour activer le suivi + relances auto.
   */
  app.post("/groups/:id/invitations/track", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        tokenId: z.string().uuid(),
        contactType: z.enum(["PHONE", "EMAIL"]),
        contactValue: z.string().min(3).max(200),
        channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
        tone: z
          .enum(["sympa", "ferme", "humour", "pro"])
          .default("sympa"),
      })
      .parse(req.body);
    await assertRole(id, req.user.sub, ["ADMIN", "TREASURER"]);
    // Vérifie que le token appartient bien au groupe
    const token = await prisma.groupInviteToken.findUnique({
      where: { id: body.tokenId },
    });
    if (!token || token.groupId !== id) {
      throw Errors.notFound("Token d'invitation introuvable pour ce groupe");
    }
    const created = await prisma.invitationOutreach.create({
      data: {
        inviteTokenId: body.tokenId,
        contactType: body.contactType as any,
        contactValue: body.contactValue,
        channel: body.channel,
        tone: body.tone,
      },
    });
    return { id: created.id, status: created.status };
  });
}
