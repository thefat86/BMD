import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContactType, GroupType, MemberRole } from "@prisma/client";
import {
  addMemberByContact,
  assertRole,
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
// V97 — Nouveau service invitations (cycle PENDING/ACCEPTED/DECLINED)
import {
  acceptInvitation,
  batchCreateInvitations,
  createInvitation,
  declineInvitation,
  DECLINE_REASON_MIN_LENGTH,
  generateBroadcastInvite,
  getInvitationByToken,
  listGroupInvitations,
  revokeInvitation,
  type BroadcastTone,
} from "./invitations.service.js";
import { validateContact } from "../../lib/validators.js";
import { prisma } from "../../lib/db.js";
// V144 — Helper d'affichage nom/pseudo selon la préférence de chaque user.
import { effectiveDisplayName } from "../../lib/display-name.js";
import { Errors } from "../../lib/errors.js";
import {
  filterPhotoByPlan,
  getPhotoVisibilityMap,
} from "../../lib/plan-limits.js";
// V118 — Cache mémoire/Redis pour les endpoints lus très fréquemment.
import {
  cacheGetOrSet,
  cacheDel,
  cacheInvalidatePrefix,
} from "../../lib/cache.js";

const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.nativeEnum(GroupType),
  defaultCurrency: z.string().length(3).optional(),
  /**
   * V111 · Active la fonctionnalité « reçu fiscal » à la création.
   * Pertinent pour les groupes type association ou organisme à but non
   * lucratif (les membres reçoivent un reçu CERFA après cotisation).
   * Indépendant du `type` — flag opt-in coché à la création du groupe
   * ou activable plus tard depuis les réglages.
   */
  taxReceiptsEnabled: z.boolean().optional(),
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

  /**
   * V212 — Gate du mode test (membres ajoutés directement sans approbation).
   * Endpoint léger : retourne juste si le flag SiteConfig.testModeEnabled
   * est ON. Le frontend cache l'UI ajout-direct si false.
   */
  app.get("/groups/test-mode-gate", async () => {
    const config = await (prisma as any).siteConfig.findUnique({
      where: { id: "default" },
      select: { testModeEnabled: true },
    });
    return { enabled: Boolean(config?.testModeEnabled) };
  });

  // V118 — Cache 30s par userId. Endpoint frappé à chaque mount du
  // dashboard (mobile + desktop + shell), donc une dédup courte évite
  // de recalculer les aggregates par groupe sur chaque hit. Invalidé
  // sur create/update/delete groupe ou membre (cf. plus bas + dans
  // `addMemberByContact` / `removeMember` / `updateGroup`).
  app.get("/groups", async (req) => {
    // V131 — Le cache backend (cacheGetOrSet) sérialise via JSON.stringify,
    // qui convertit Date → string ISO. Si le mapping `.toISOString()` est
    // appliqué *après* le cache, le 1er hit fonctionne (Date présente) mais
    // les hits suivants plantent : `g.createdAt` est déjà une string et
    // n'a plus la méthode `.toISOString()` → 500 sur GET /groups.
    //
    // Fix : on déplace le mapping *dans* le fetcher pour que le cache
    // contienne directement des strings ISO côté wire-format. Tous les
    // hits suivants renvoient un payload identique sans transformation.
    return cacheGetOrSet(`groups-list:${req.user.sub}`, 30, async () => {
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
  });

  app.post("/groups", async (req, reply) => {
    const body = createGroupSchema.parse(req.body);
    // V111 · `as any` sur le retour pour accepter `taxReceiptsEnabled`
    // (champ ajouté au schema Prisma — sera typé proprement après
    // `npx prisma generate` côté CI/CD).
    const group = (await createGroup({
      ...body,
      createdById: req.user.sub,
    })) as any;
    // V118 — Invalide le cache `groups-list` du createur pour que le
    // nouveau groupe apparaisse instantanément dans GET /groups (sans
    // attendre les 30s de TTL). Les autres mutations (add member,
    // update, …) reposent sur le TTL court pour rester simples.
    void cacheDel(`groups-list:${req.user.sub}`);
    // V77 — Filtre photo selon plan (cf. plan-limits.profilePhotoVisible).
    // À la création il n'y a que le créateur, mais on applique le helper
    // pour la cohérence (et pour future-proof si le service initialise
    // d'autres membres).
    const visibilityMap = await getPhotoVisibilityMap(
      group.members.map((m: any) => m.user.id),
    );
    return reply.code(201).send({
      id: group.id,
      name: group.name,
      type: group.type,
      defaultCurrency: group.defaultCurrency,
      // V111 · Flag reçu fiscal (renvoyé après création pour cohérence avec
      // GET /groups/:id côté frontend).
      taxReceiptsEnabled: group.taxReceiptsEnabled,
      // V141 — Toggle confirmation receveur après déclaration paiement.
      paymentConfirmationRequired:
        (group as any).paymentConfirmationRequired ?? true,
      createdAt: group.createdAt.toISOString(),
      members: group.members.map((m: any) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        user: {
          id: m.user.id,
          displayName: m.user.displayName,
          avatar: filterPhotoByPlan(m.user.id, m.user.avatar, visibilityMap),
          defaultCurrency: m.user.defaultCurrency,
          defaultLocale: m.user.defaultLocale,
        },
      })),
    });
  });

  app.get("/groups/:id", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    // V120 — Cache 30s par (groupId, callerUserId). La page groupe
    // frappe cet endpoint à chaque mount + à chaque event SSE. Une
    // dédup courte évite de recharger les members + plan-photo filter
    // sur des navigations rapides. La clé inclut le caller car l'avatar
    // de chaque membre dépend du plan du viewer (cf. V112). Invalidé à
    // chaque mutation (add/remove member, update group) via
    // `cacheInvalidatePrefix("group-detail:<groupId>:")`.
    return cacheGetOrSet(
      `group-detail:${params.id}:${req.user.sub}`,
      30,
      async () => {
        const group = await getGroupForMember(params.id, req.user.sub);
        // V202 — Cast string explicite : l'ajout des relations Fund* sur User
        // élargit le type inféré par Prisma au point que TS ne reconnaît plus
        // m.user.id comme string. Cast safe (Prisma garantit la valeur).
        const memberUserIds: string[] = group.members.map(
          (m: any) => m.user.id as string,
        );
        const visibilityMap = await getPhotoVisibilityMap(memberUserIds);
        // V128 — Sérialise la tontine du groupe (si présente). Sans ce
        // champ, le frontend ne savait pas qu'une tontine existait → la
        // tile « Tontine » dans la vue groupe rouvrait toujours le sheet
        // de création au lieu de naviguer vers /tontine. Cf. service
        // getGroupForMember qui inclut maintenant la relation.
        const tRaw = (group as any).tontine ?? null;
        const tontine = tRaw
          ? {
              id: tRaw.id as string,
              status: tRaw.status as string,
              contributionAmount:
                tRaw.contributionAmount != null
                  ? tRaw.contributionAmount.toString()
                  : null,
              currency: tRaw.currency as string,
              frequency: tRaw.frequency as string,
              startDate:
                tRaw.startDate instanceof Date
                  ? tRaw.startDate.toISOString()
                  : tRaw.startDate,
              centralizedPot: Boolean(tRaw.centralizedPot),
            }
          : null;
        return {
          id: group.id,
          name: group.name,
          type: group.type,
          defaultCurrency: group.defaultCurrency,
          // V111 · Flag reçu fiscal — cast `as any` tant que Prisma
          // generate n'a pas repris le champ.
          taxReceiptsEnabled: (group as any).taxReceiptsEnabled,
          // V141 — Toggle confirmation paiement par groupe
          paymentConfirmationRequired:
            (group as any).paymentConfirmationRequired ?? true,
          createdAt: group.createdAt.toISOString(),
          // V128 — Tontine résumée (id, status, montant, devise, fréquence,
          // startDate). null si pas de tontine. Consommé par la tile
          // « Tontine » de mobile-group-view pour décider navigation +
          // afficher mini-état (statut · contribution · fréquence).
          tontine,
          members: group.members.map((m: any) => {
            const isSelf = m.user.id === req.user.sub;
            const filteredAvatar = isSelf
              ? m.user.avatar
              : filterPhotoByPlan(m.user.id, m.user.avatar, visibilityMap);
            // V144 — Applique la préférence nom/pseudo de CHAQUE membre.
            // Soi-même on garde toujours son vrai displayName (utile pour
            // l'auto-identification dans l'UI). Pour les autres, on respecte
            // leur displayPreference (pseudo si activé).
            const u: any = m.user;
            const effectiveName = isSelf
              ? u.displayName
              : effectiveDisplayName({
                  displayName: u.displayName,
                  nickname: u.nickname ?? null,
                  displayPreference: u.displayPreference ?? "NAME",
                });
            return {
              id: m.id,
              role: m.role,
              joinedAt: m.joinedAt.toISOString(),
              user: {
                ...m.user,
                displayName: effectiveName,
                avatar: filteredAvatar,
              },
            };
          }),
        };
      },
    );
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
    // V120 — Invalide le cache détail groupe pour tous les viewers : le
    // nouveau membre doit apparaître immédiatement, pas après 30s.
    void cacheInvalidatePrefix(`group-detail:${params.id}:`);
    // V77 — Filtre photo selon plan du membre ajouté (le caller verra
    // null si le nouvel arrivant est FREE).
    const visibilityMap = await getPhotoVisibilityMap([member.user.id]);
    return reply.code(201).send({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      user: {
        ...member.user,
        avatar: filterPhotoByPlan(
          member.user.id,
          member.user.avatar,
          visibilityMap,
        ),
      },
    });
  });

  /**
   * V212 — POST /groups/:id/members/test-add
   *
   * MODE TEST TEMPORAIRE — Ajout direct d'un membre fictif sans flow
   * d'invitation (pas d'email, pas d'OTP, pas d'approbation). Réservé
   * aux tests internes. À retirer une fois la phase de test terminée.
   *
   * Sécurité :
   *  - Gate global : SiteConfig.testModeEnabled = true (toggle admin)
   *  - Gate per-group : le caller doit être ADMIN du groupe ou créateur
   *  - User créé avec `isTestUser=true` pour pouvoir filtrer/purger plus tard
   */
  app.post("/groups/:id/members/test-add", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        displayName: z.string().min(1).max(60),
        contactType: z.enum(["EMAIL", "PHONE"]).optional(),
        contactValue: z.string().max(120).optional(),
        role: z.enum(["MEMBER", "ADMIN", "TREASURER", "OBSERVER"]).optional(),
      })
      .parse(req.body);

    // Gate global : flag doit être ON.
    const config = await (prisma as any).siteConfig.findUnique({
      where: { id: "default" },
      select: { testModeEnabled: true },
    });
    if (!config?.testModeEnabled) {
      return reply.code(403).send({
        error: "test_mode_disabled",
        message:
          "Le mode test est désactivé. Active-le dans /admin/feature-flags.",
      });
    }

    // Gate per-group : caller doit être créateur ou ADMIN/TREASURER.
    // Note : le champ propriétaire dans le schema BMD s'appelle `createdById`,
    // pas `ownerId`. On cast en any car prisma-client peut ne pas être
    // régénéré pour les nouveaux champs V212 (testModeEnabled, isTestUser).
    const group = (await (prisma as any).group.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        createdById: true,
        members: {
          where: { userId: req.user.sub },
          select: { role: true },
        },
      },
    })) as { id: string; createdById: string; members: Array<{ role: string }> } | null;
    if (!group) {
      return reply.code(404).send({ error: "group_not_found" });
    }
    const isOwner = group.createdById === req.user.sub;
    const myRole = group.members[0]?.role;
    const canAdd = isOwner || myRole === "ADMIN" || myRole === "TREASURER";
    if (!canAdd) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Tu dois être admin ou créateur du groupe pour ajouter un membre test.",
      });
    }

    // Crée le user fictif + son contact + sa membership en une seule
    // transaction. Le user est marqué isTestUser=true pour cleanup futur.
    // Cast en any car prisma client peut ne pas être régénéré pour V212.
    const created = await prisma.$transaction(async (tx) => {
      const user = await (tx as any).user.create({
        data: {
          displayName: body.displayName.trim(),
          isTestUser: true,
          planCode: "FREE",
          ...(body.contactType && body.contactValue
            ? {
                contacts: {
                  create: {
                    type: body.contactType as ContactType,
                    value: body.contactValue.trim().toLowerCase(),
                  },
                },
              }
            : {}),
        },
        include: { contacts: true },
      });
      const member = await tx.groupMember.create({
        data: {
          groupId: params.id,
          userId: user.id,
          role: (body.role || "MEMBER") as MemberRole,
        },
        include: { user: { include: { contacts: true } } },
      });
      return member;
    });

    // Invalide le cache détail groupe pour que le nouveau membre apparaisse
    // immédiatement chez tous les viewers (pas après 30s).
    void cacheInvalidatePrefix(`group-detail:${params.id}:`);

    return reply.code(201).send({
      id: created.id,
      role: created.role,
      joinedAt: created.joinedAt.toISOString(),
      user: {
        id: created.user.id,
        displayName: created.user.displayName,
        avatar: created.user.avatar,
        // V212 — isTestUser n'apparaît qu'après `prisma generate`. Cast en
        // any pour lire sans erreur tant que le client n'est pas régénéré.
        isTestUser: Boolean((created.user as any).isTestUser),
      },
    });
  });

  /**
   * POST /groups/:id/members/batch
   *
   * V97 — Crée des invitations PENDING (plus de membre actif). L'email est
   * envoyé automatiquement aux EMAIL contacts via le template `groupInvite`.
   * Continue même si certains échouent — retourne invited[] et failed[].
   * Limite : 50 contacts par requête.
   *
   * Backward-compat : on garde le shape de réponse `{added, failed}` côté
   * frontend en mappant invited→added (l'UI affiche juste un compteur).
   */
  app.post("/groups/:id/members/batch", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = batchInviteSchema.parse(req.body);
    const result = await batchCreateInvitations({
      groupId: params.id,
      invitedById: req.user.sub,
      invitations: body.invitations,
      role: body.role,
    });
    // Forme compatible avec l'ancien shape {added, failed} attendu côté UI
    return {
      added: result.invited.map((inv) => ({
        contactValue: inv.contactValue,
        invitationId: inv.invitationId,
        token: inv.token,
        joinUrl: inv.joinUrl,
        emailSent: inv.emailSent,
      })),
      failed: result.failed,
      // Champ V97 explicite pour les nouveaux clients
      invitations: result.invited,
    };
  });

  /**
   * V97 — GET /groups/:id/invitations
   * Liste les invitations en cours / passées d'un groupe.
   * Visible par tous les membres (transparence), mais seuls ADMIN/TREASURER
   * peuvent revoke (cf. endpoint dédié).
   */
  app.get("/groups/:id/invitations", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const items = await listGroupInvitations({
      groupId: id,
      actorUserId: req.user.sub,
    });
    return { items };
  });

  /**
   * V97 — POST /groups/:id/invitations/:invId/revoke
   * Annule une invitation PENDING avant que l'invité réponde.
   */
  app.post("/groups/:id/invitations/:invId/revoke", async (req) => {
    const { invId } = z
      .object({
        id: z.string().uuid(),
        invId: z.string().uuid(),
      })
      .parse(req.params);
    return revokeInvitation({
      invitationId: invId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * V97.D — GET /groups/:id/broadcast-invite?tone=chaleureux|fun|pro
   *
   * Génère (ou réutilise) un lien magique multi-usage + un message texte
   * prêt à coller dans un groupe WhatsApp / SMS / mail. Retourne aussi
   * des deeplinks (`wa.me/?text=...`, `sms:?body=...`, `mailto:`) pour
   * ouvrir l'app correspondante avec le message pré-rempli.
   *
   * Idempotent : si un token broadcast valide existe déjà pour ce user,
   * on le réutilise au lieu d'en créer un nouveau (évite la prolifération).
   */
  app.get("/groups/:id/broadcast-invite", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z
      .object({
        tone: z.enum(["chaleureux", "fun", "pro"]).optional(),
        maxUses: z.coerce.number().int().min(1).max(500).optional(),
        expiresInDays: z.coerce.number().int().min(1).max(90).optional(),
      })
      .parse(req.query);
    return generateBroadcastInvite({
      groupId: id,
      actorUserId: req.user.sub,
      tone: q.tone as BroadcastTone | undefined,
      maxUses: q.maxUses,
      expiresInDays: q.expiresInDays,
    });
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
        // V111 · L'admin peut activer/désactiver les reçus fiscaux après
        // coup depuis l'écran de réglages du groupe.
        taxReceiptsEnabled: z.boolean().optional(),
        // V141 — Toggle confirmation receveur. Quand false, les paiements
        // déclarés passent directement à CONFIRMED sans étape de validation.
        paymentConfirmationRequired: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await updateGroup({
      groupId: id,
      actorUserId: req.user.sub,
      name: body.name,
      defaultCurrency: body.defaultCurrency,
      taxReceiptsEnabled: body.taxReceiptsEnabled,
      paymentConfirmationRequired: body.paymentConfirmationRequired,
    });
    return {
      id: updated.id,
      name: updated.name,
      defaultCurrency: updated.defaultCurrency,
      // V111 · Cast jusqu'à `npx prisma generate` côté CI/CD.
      taxReceiptsEnabled: (updated as any).taxReceiptsEnabled,
      // V141
      paymentConfirmationRequired: (updated as any).paymentConfirmationRequired,
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
    // V174.H — maxUses/expiresInDays nullable() pour accepter null = illimité.
    // Sans nullable, zod renvoyait "Expected number, received null" quand le
    // front cochait "Lien illimité".
    const body = z
      .object({
        maxUses: z.number().int().positive().nullable().optional(),
        expiresInDays: z
          .number()
          .int()
          .positive()
          .max(365)
          .nullable()
          .optional(),
      })
      .parse(req.body ?? {});
    const t = await createInviteToken({
      groupId: id,
      actorUserId: req.user.sub,
      maxUses: body.maxUses ?? undefined,
      expiresInDays: body.expiresInDays ?? undefined,
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
   * GET /groups/:id/invitation-outreaches
   *
   * V121 — Renommé depuis `/groups/:id/invitations` qui collisionne avec
   * la route V97 (ligne ~300) qui sert le système d'invitations actuel
   * (`GroupInvitation` avec status PENDING/ACCEPTED/DECLINED).
   *
   * Cette route legacy expose le tracking d'`InvitationOutreach` (envoyée
   * / ouverte / acceptée / annulée par canal email/SMS/WhatsApp) pour les
   * tableaux de bord admin. Non consommée côté frontend principal — utile
   * uniquement pour le reporting admin.
   */
  app.get("/groups/:id/invitation-outreaches", async (req) => {
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
