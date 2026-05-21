/**
 * MODULE INVITATIONS DE GROUPE (V97)
 * ===================================
 *
 * Remplace l'ancien comportement où `batchInviteMembers` créait
 * directement un `GroupMember` actif (l'invité était membre sans avoir
 * jamais consenti). Désormais le cycle est :
 *
 *   1. Admin envoie une invitation → on crée `GroupInvitation(status=PENDING)`
 *      + on envoie un email (template `groupInvite`) avec un lien magique
 *      vers `/invite/:token`.
 *   2. L'invité reçoit l'email, clique → voit la page d'acceptation.
 *      Il choisit "Accepter" ou "Refuser" (motif obligatoire 15 chars).
 *   3. Si ACCEPTED → on crée le GroupMember + on notifie le créateur.
 *      Si DECLINED → on stocke le motif + on notifie le créateur.
 *   4. Après 30 jours sans réponse → un scheduler bascule en EXPIRED.
 *
 * L'invité est INVISIBLE du groupe tant que status != ACCEPTED.
 *
 * Important : pour des raisons rétrocompatibilité avant `prisma generate`,
 * on accède au modèle via `(prisma as any).groupInvitation`. Une fois le
 * generate fait après la migration, on pourra retirer ce cast.
 */
import { randomBytes } from "node:crypto";
import type { ContactType, MemberRole } from "@prisma/client";

import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { sendTemplatedEmail, sendSms } from "../../lib/messaging.js";
import { loadEnv } from "../../lib/env.js";
import { notifyOne } from "../notifications/notifications.service.js";
import { logActivity } from "./groups.service.js";
// V216.F — Mode test : auto-accept des invitations sans tour d'OTP.
import { isTestModeActive } from "../../lib/test-mode.js";

// V97 — Constantes
const INVITATION_TTL_DAYS = 30;
const TOKEN_BYTES = 24; // 24 bytes random → 32 chars base64url
const DECLINE_REASON_MIN_LENGTH = 15;

/**
 * Génère un token URL-safe non énumérable.
 * 24 bytes → 192 bits d'entropie → impossible à deviner.
 */
function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Construit le lien magique vers la page d'acceptation BMD.
 */
function buildJoinUrl(token: string): string {
  const env = loadEnv();
  const baseUrl = env.WEB_BASE_URL ?? "https://www.backmesdo.com";
  return `${baseUrl}/invite/${token}`;
}

// ============================================================
// CRÉATION D'INVITATIONS (un ou batch)
// ============================================================

export interface CreateInvitationInput {
  groupId: string;
  invitedById: string;
  contactType: ContactType;
  contactValue: string;
  displayName?: string;
  role?: MemberRole;
}

export interface CreateInvitationResult {
  invitationId: string;
  token: string;
  /**
   * V216.F — En mode test (`SiteConfig.testModeEnabled`), l'invitation est
   * directement basculée en ACCEPTED côté serveur et le GroupMember est créé.
   * Dans ce cas le frontend doit refresh les membres pour voir l'invité
   * apparaître immédiatement. Sinon, status="PENDING" comme avant.
   */
  status: "PENDING" | "ACCEPTED";
  contactValue: string;
  inviteeUserId: string | null;
  joinUrl: string;
  emailSent: boolean;
  /** V216.F — true si on a auto-créé un GroupMember en mode test. */
  autoAccepted?: boolean;
}

/**
 * Crée une invitation nominative pour un contact spécifique.
 *
 * Idempotent : si une invitation PENDING existe déjà pour ce couple
 * (groupe, contact), on renvoie la même (pas de duplicate, pas d'erreur).
 * Si une invitation REVOKED/EXPIRED/DECLINED existe → on la réactive en
 * PENDING avec un nouveau token et une nouvelle date d'expiration.
 *
 * Si l'invité a DÉJÀ un compte BMD (contact verified ou shadow), on lie
 * `inviteeUserId` pour qu'il retrouve l'invitation dans son inbox.
 */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const value = input.contactValue.trim();
  if (!value) {
    throw Errors.badRequest("Contact vide", {
      tip: "Renseigne un email ou un téléphone valide.",
    });
  }

  // 1. Vérifie que l'invitant a bien le droit d'inviter (ADMIN ou TREASURER)
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: input.groupId,
        userId: input.invitedById,
      },
    },
  });
  if (!membership || (membership.role !== "ADMIN" && membership.role !== "TREASURER")) {
    throw Errors.forbidden("Seuls les admins et trésoriers peuvent inviter.");
  }

  // 2. Vérifie que le contact n'est pas déjà un membre ACCEPTÉ du groupe
  //    (on bloque le doublon : pas besoin d'inviter quelqu'un qui est déjà là)
  const existingContact = await prisma.userContact.findUnique({
    where: { type_value: { type: input.contactType, value } },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          groupMemberships: {
            where: { groupId: input.groupId },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (existingContact?.user.groupMemberships.length) {
    throw Errors.alreadyExists({
      what: `${existingContact.user.displayName} est déjà membre du groupe`,
      tip: "Pas besoin de l'inviter à nouveau, il/elle peut déjà voir et participer 🎉",
    });
  }

  // 3. Lookup invitation existante (peut être PENDING, EXPIRED, DECLINED, REVOKED)
  const existingInvitation = await (prisma as any).groupInvitation.findUnique({
    where: {
      groupId_contactType_contactValue: {
        groupId: input.groupId,
        contactType: input.contactType,
        contactValue: value,
      },
    },
  });

  // 4. Détermine l'inviteeUserId (lien éventuel vers un compte existant)
  let inviteeUserId: string | null = existingContact?.user.id ?? null;

  // Sinon : on crée un shadow user pour que la personne ait déjà une
  // identité BMD à laquelle attacher l'invitation. Ça simplifie le flow
  // d'acceptation : pas de signup parallèle, juste OTP de vérification.
  if (!inviteeUserId) {
    // V114 — Même politique d'affichage que `addMemberByContact` : on
    // garde le contact complet (email entier ou phone) comme displayName
    // jusqu'à ce que la personne s'inscrive et mette son vrai nom dans
    // son profil. Cf. commentaires détaillés dans groups.service.ts.
    const shadowName = input.displayName?.trim() || value;
    const shadow = await prisma.user.create({
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
      select: { id: true },
    });
    inviteeUserId = shadow.id;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_TTL_DAYS);

  // 5. Création ou réactivation
  let invitation: { id: string; token: string };
  if (existingInvitation) {
    if (existingInvitation.status === "PENDING") {
      // Idempotent : l'invitation est déjà en cours, on renvoie la même.
      invitation = {
        id: existingInvitation.id,
        token: existingInvitation.token,
      };
    } else {
      // Réactivation : nouveau token + reset status + reset reason
      const updated = await (prisma as any).groupInvitation.update({
        where: { id: existingInvitation.id },
        data: {
          status: "PENDING",
          token: generateInviteToken(),
          declineReason: null,
          respondedAt: null,
          invitedById: input.invitedById,
          inviteeUserId,
          displayName: input.displayName ?? existingInvitation.displayName,
          createdAt: new Date(),
          expiresAt,
        },
        select: { id: true, token: true },
      });
      invitation = updated;
    }
  } else {
    const created = await (prisma as any).groupInvitation.create({
      data: {
        groupId: input.groupId,
        invitedById: input.invitedById,
        inviteeUserId,
        contactType: input.contactType,
        contactValue: value,
        displayName: input.displayName,
        token: generateInviteToken(),
        status: "PENDING",
        expiresAt,
      },
      select: { id: true, token: true },
    });
    invitation = created;
  }

  // 6. Charge les noms pour le mail
  const [inviter, group] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.invitedById },
      select: { displayName: true, defaultLocale: true },
    }),
    prisma.group.findUnique({
      where: { id: input.groupId },
      select: { name: true },
    }),
  ]);

  const joinUrl = buildJoinUrl(invitation.token);

  // 7. Envoi email (only EMAIL) — non bloquant
  let emailSent = false;
  if (input.contactType === "EMAIL") {
    const result = await sendTemplatedEmail(
      value,
      {
        kind: "groupInvite",
        payload: {
          inviterName: inviter?.displayName ?? "Quelqu'un",
          groupName: group?.name ?? "ce groupe",
          joinUrl,
        },
      },
      inviter?.defaultLocale ?? null,
      inviteeUserId ?? undefined,
    );
    emailSent = result.ok;
  }

  // V215.D3 — Envoi SMS Twilio (only PHONE) — non bloquant
  // Pour les invitations par téléphone, on envoie un SMS court avec le lien
  // magique. Cumulé avec le push natif (si l'invité a déjà BMD installé),
  // ça maximise les chances de capture (push + SMS + email = 3 canaux).
  if (input.contactType === "PHONE") {
    const inviterName = inviter?.displayName ?? "Quelqu'un";
    const groupName = group?.name ?? "un groupe BMD";
    const smsBody =
      `${inviterName} t'invite à rejoindre « ${groupName} » sur BMD. ` +
      `Accepte ici : ${joinUrl}`;
    void sendSms({ to: value, body: smsBody }, input.invitedById).catch(
      (err) => {
        // eslint-disable-next-line no-console
        console.warn("[invitations] SMS send failed:", err);
      },
    );
  }

  // 8. Notification in-app si l'invité a un compte BMD vérifié.
  //    Pour les shadow users non vérifiés ça part dans le vide (normal).
  if (inviteeUserId && group) {
    void notifyOne(inviteeUserId, {
      kind: "GROUP_INVITED",
      title: `${inviter?.displayName ?? "Quelqu'un"} t'invite à rejoindre « ${group.name} »`,
      body: "Clique pour accepter ou refuser",
      link: `/invite/${invitation.token}`,
      payload: {
        groupId: input.groupId,
        invitationId: invitation.id,
        token: invitation.token,
      },
    }).catch(() => {
      /* notify non bloquant */
    });
  }

  // 9. Audit log côté groupe
  // V232 — On enrichit : nom donné à l'invité (placeholder), email/tel, type
  // de contact. Le feed pourra écrire « Marc a invité Toto Jean
  // (toto@example.com) à rejoindre le groupe ».
  await logActivity({
    groupId: input.groupId,
    actorId: input.invitedById,
    // V97 — Cast en any tant que le client Prisma n'a pas été régénéré
    // après la migration (l'enum ActivityKind nouveau membre n'est encore
    // pas dans node_modules/.prisma/client). À nettoyer dès que
    // `npx prisma generate` aura été lancé localement.
    kind: "MEMBER_INVITED" as any,
    payload: {
      invitationId: invitation.id,
      contactValue: value,
      contactType: input.contactType,
      // V232 — nom placeholder + tag canal
      name: input.displayName ?? null,
      channel: input.contactType === "PHONE" ? "sms" : "email",
    },
  }).catch(() => {
    /* audit non bloquant */
  });

  // V216.F — Mode test : auto-accept de l'invitation sans tour d'OTP.
  // On bascule l'invitation en ACCEPTED côté serveur, on crée le GroupMember
  // pour le shadow user (ou l'user existant) directement. Permet à Fabrice
  // de tester rapidement les flows de groupe avec plusieurs "comptes" virtuels
  // sans devoir simuler le clic sur le lien email côté chaque destinataire.
  let autoAccepted = false;
  let finalStatus: "PENDING" | "ACCEPTED" = "PENDING";
  if (inviteeUserId) {
    try {
      const testMode = await isTestModeActive();
      if (testMode) {
        // Crée le GroupMember (idempotent via try/catch P2002)
        try {
          await prisma.groupMember.create({
            data: {
              groupId: input.groupId,
              userId: inviteeUserId,
              role: input.role ?? "MEMBER",
              ...(input.displayName
                ? { displayNameOverride: input.displayName }
                : {}),
            } as any,
          });
        } catch (e: any) {
          if (e?.code !== "P2002") throw e;
        }
        // Bascule l'invitation en ACCEPTED
        await (prisma as any).groupInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "ACCEPTED",
            respondedAt: new Date(),
          },
        });
        autoAccepted = true;
        finalStatus = "ACCEPTED";
        // Log activité MEMBER_JOINED (l'invitant agit pour le compte du test).
        await logActivity({
          groupId: input.groupId,
          actorId: inviteeUserId,
          kind: "MEMBER_JOINED",
          payload: { invitationId: invitation.id, viaTestMode: true },
        }).catch(() => {});
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[invitations] test-mode auto-accept failed:", err);
    }
  }

  return {
    invitationId: invitation.id,
    token: invitation.token,
    status: finalStatus,
    contactValue: value,
    inviteeUserId,
    joinUrl,
    emailSent,
    autoAccepted,
  };
}

// ============================================================
// BATCH (utilisé par le wizard de création de groupe + sheet invite)
// ============================================================

export interface BatchInviteItem {
  contactType: ContactType;
  contactValue: string;
  displayName?: string;
}

export interface BatchInviteResultV97 {
  /** Invitations créées/réactivées avec succès. */
  invited: CreateInvitationResult[];
  /** Échecs (ex: format invalide, déjà membre). */
  failed: Array<{
    contactValue: string;
    reason: string;
    tip?: string;
  }>;
}

export async function batchCreateInvitations(input: {
  groupId: string;
  invitedById: string;
  invitations: BatchInviteItem[];
  role?: MemberRole;
}): Promise<BatchInviteResultV97> {
  if (input.invitations.length === 0) {
    throw Errors.badRequest("Tu n'as sélectionné personne à inviter 🤷", {
      tip: "Coche au moins un contact dans la liste avant de valider.",
    });
  }
  if (input.invitations.length > 50) {
    throw Errors.badRequest("On ne peut envoyer que 50 invitations à la fois ✋", {
      tip: "Découpe en plusieurs lots.",
    });
  }

  const result: BatchInviteResultV97 = { invited: [], failed: [] };
  for (const item of input.invitations) {
    try {
      const r = await createInvitation({
        groupId: input.groupId,
        invitedById: input.invitedById,
        contactType: item.contactType,
        contactValue: item.contactValue,
        displayName: item.displayName,
        role: input.role,
      });
      result.invited.push(r);
    } catch (e) {
      const err = e as any;
      result.failed.push({
        contactValue: item.contactValue,
        reason: err?.message ?? "Erreur inconnue",
        tip: err?.details?.tip,
      });
    }
  }
  return result;
}

// ============================================================
// LOOKUP PUBLIC (page d'acceptation)
// ============================================================

/**
 * Lookup public par token pour la page `/invite/:token`.
 * Ne nécessite pas d'auth — c'est par design pour permettre l'acceptation
 * sans avoir à se créer un compte avant.
 *
 * Renvoie un payload minimal et safe :
 *  - Nom du groupe + type (pour le hero)
 *  - Nom de l'invitant
 *  - Contact ciblé (snapshot, pour pré-remplir le flow OTP)
 *  - Statut courant
 */
export async function getInvitationByToken(token: string) {
  const invitation = await (prisma as any).groupInvitation.findUnique({
    where: { token },
    include: {
      group: { select: { id: true, name: true, type: true, defaultCurrency: true } },
      invitedBy: { select: { displayName: true, avatar: true } },
    },
  });
  if (!invitation) {
    throw Errors.notFound(
      "Lien d'invitation invalide ou supprimé",
      { tip: "Demande à la personne qui t'a invité de te renvoyer le lien." },
    );
  }
  // Auto-EXPIRED si la date est passée et qu'on est toujours PENDING
  if (
    invitation.status === "PENDING" &&
    new Date(invitation.expiresAt).getTime() < Date.now()
  ) {
    await (prisma as any).groupInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    invitation.status = "EXPIRED";
  }
  return {
    id: invitation.id,
    status: invitation.status,
    contactType: invitation.contactType,
    contactValue: invitation.contactValue,
    displayName: invitation.displayName,
    expiresAt: invitation.expiresAt.toISOString(),
    declineReason: invitation.declineReason,
    group: {
      id: invitation.group.id,
      name: invitation.group.name,
      type: invitation.group.type,
      defaultCurrency: invitation.group.defaultCurrency,
    },
    invitedBy: invitation.invitedBy,
  };
}

// ============================================================
// ACCEPT
// ============================================================

/**
 * Accepte l'invitation et crée le GroupMember.
 *
 * 2 modes selon l'authentification :
 *
 *  - Connecté (acceptingUserId fourni) → vérifie que le user qui accepte
 *    est bien le destinataire (même contact). Si oui, on crée le member.
 *  - Public (pas de userId) → on accepte avec le token seul, mais l'invité
 *    doit confirmer son contact via OTP juste après côté frontend (le
 *    serveur ne crée le member que si OTP validé en parallèle).
 *
 * Pour simplifier le V1, on requiert que l'invité soit authentifié au
 * moment de l'acceptation. Le frontend l'orchestrera : si pas connecté,
 * il l'envoie d'abord sur /login (avec le contact pré-rempli), puis
 * revient sur la page /invite/:token avec une session active.
 */
export async function acceptInvitation(input: {
  token: string;
  acceptingUserId: string;
}) {
  const invitation = await (prisma as any).groupInvitation.findUnique({
    where: { token: input.token },
    include: { group: { select: { id: true, name: true } } },
  });
  if (!invitation) {
    throw Errors.notFound("Invitation introuvable");
  }
  if (invitation.status === "ACCEPTED") {
    // Idempotent : déjà accepté, on ne re-fait pas le member
    return { ok: true, alreadyMember: true, groupId: invitation.groupId };
  }
  if (invitation.status === "DECLINED") {
    throw Errors.conflict(
      "Tu as déjà décliné cette invitation",
      { tip: "Demande à l'admin du groupe de te renvoyer une invitation si tu changes d'avis." },
    );
  }
  if (invitation.status === "REVOKED") {
    throw Errors.conflict(
      "Cette invitation a été annulée par l'admin du groupe",
    );
  }
  if (
    invitation.status === "EXPIRED" ||
    new Date(invitation.expiresAt).getTime() < Date.now()
  ) {
    throw Errors.conflict(
      "Cette invitation a expiré (plus de 30 jours)",
      { tip: "Demande à l'admin de t'en renvoyer une nouvelle." },
    );
  }

  // Sécurité : on vérifie que le user qui accepte est bien le destinataire.
  // Soit son ID match `inviteeUserId`, soit l'un de ses contacts vérifiés
  // match le contact snapshot de l'invitation.
  const accepter = await prisma.user.findUnique({
    where: { id: input.acceptingUserId },
    select: {
      id: true,
      displayName: true,
      contacts: {
        select: { type: true, value: true, isVerified: true },
      },
    },
  });
  if (!accepter) throw Errors.notFound("Utilisateur introuvable");

  const isLinkedUser =
    invitation.inviteeUserId === input.acceptingUserId;
  const hasMatchingContact = accepter.contacts.some(
    (c) =>
      c.type === invitation.contactType &&
      c.value === invitation.contactValue,
  );
  if (!isLinkedUser && !hasMatchingContact) {
    throw Errors.forbidden(
      "Cette invitation est destinée à un autre contact que le tien",
      { tip: "Connecte-toi avec l'email/numéro qui a reçu le lien." },
    );
  }

  // Création du GroupMember (idempotent via try/catch P2002)
  // V215.D2 — Si l'inviteur avait saisi un nom temporaire (invitation.displayName),
  // on le copie vers groupMember.displayNameOverride. L'accepteur peut ensuite
  // le changer librement depuis ses paramètres (toggle displayPreference V144).
  let createdMemberId: string | null = null;
  try {
    const member = await prisma.groupMember.create({
      data: {
        groupId: invitation.groupId,
        userId: input.acceptingUserId,
        role: "MEMBER",
        ...(invitation.displayName
          ? { displayNameOverride: invitation.displayName }
          : {}),
      } as any, // Cast tant que prisma generate n'a pas été relancé avec V215
      select: { id: true },
    });
    createdMemberId = member.id;
  } catch (e: any) {
    // P2002 = déjà membre, on ignore
    if (e?.code !== "P2002") throw e;
  }

  // Mise à jour de l'invitation
  await (prisma as any).groupInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "ACCEPTED",
      respondedAt: new Date(),
      inviteeUserId: input.acceptingUserId,
    },
  });

  // Notif au créateur de l'invitation + admins du groupe
  void notifyOne(invitation.invitedById, {
    kind: "MEMBER_JOINED",
    title: `${accepter.displayName} a rejoint « ${invitation.group.name} » 🎉`,
    link: `/dashboard/groups/${invitation.groupId}`,
    payload: { groupId: invitation.groupId, memberId: createdMemberId },
  }).catch(() => {});

  // Audit log
  await logActivity({
    groupId: invitation.groupId,
    actorId: input.acceptingUserId,
    kind: "MEMBER_JOINED",
    payload: { invitationId: invitation.id },
  }).catch(() => {});

  return {
    ok: true,
    groupId: invitation.groupId,
    memberId: createdMemberId,
    groupName: invitation.group.name,
  };
}

// ============================================================
// DECLINE (motif obligatoire 15 chars min)
// ============================================================

export async function declineInvitation(input: {
  token: string;
  reason: string;
  decliningUserId?: string; // optionnel : si connecté on lie
}) {
  const reason = input.reason.trim();
  if (reason.length < DECLINE_REASON_MIN_LENGTH) {
    throw Errors.badRequest(
      `Merci d'expliquer brièvement pourquoi tu refuses (${DECLINE_REASON_MIN_LENGTH} caractères min).`,
      {
        tip: "L'admin pourra mieux comprendre et éviter de t'inviter à nouveau par erreur.",
      },
    );
  }

  const invitation = await (prisma as any).groupInvitation.findUnique({
    where: { token: input.token },
    include: { group: { select: { id: true, name: true } } },
  });
  if (!invitation) throw Errors.notFound("Invitation introuvable");
  if (invitation.status === "DECLINED") {
    return { ok: true, alreadyDeclined: true };
  }
  if (invitation.status === "ACCEPTED") {
    throw Errors.conflict(
      "Tu as déjà accepté cette invitation",
      { tip: "Tu es déjà membre du groupe. Tu peux le quitter depuis ses réglages." },
    );
  }
  if (invitation.status === "REVOKED") {
    throw Errors.conflict("Cette invitation a déjà été annulée par l'admin.");
  }

  await (prisma as any).groupInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "DECLINED",
      declineReason: reason,
      respondedAt: new Date(),
      ...(input.decliningUserId
        ? { inviteeUserId: input.decliningUserId }
        : {}),
    },
  });

  // Notif au créateur de l'invitation
  void notifyOne(invitation.invitedById, {
    kind: "GROUP_INVITED",
    title: `Ton invitation à « ${invitation.group.name} » a été refusée`,
    body: reason.length > 80 ? reason.slice(0, 77) + "…" : reason,
    link: `/dashboard/groups/${invitation.groupId}/settings?tab=invitations`,
    payload: {
      invitationId: invitation.id,
      groupId: invitation.groupId,
      declineReason: reason,
    },
  }).catch(() => {});

  // Audit log
  await logActivity({
    groupId: invitation.groupId,
    actorId: invitation.invitedById,
    // V97 — Cast en any tant que le client Prisma n'a pas été régénéré
    // après la migration (l'enum ActivityKind nouveau membre n'est encore
    // pas dans node_modules/.prisma/client). À nettoyer dès que
    // `npx prisma generate` aura été lancé localement.
    kind: "MEMBER_INVITED" as any,
    payload: {
      invitationId: invitation.id,
      action: "declined",
      reason,
    },
  }).catch(() => {});

  return { ok: true };
}

// ============================================================
// LISTE (admin du groupe)
// ============================================================

export async function listGroupInvitations(input: {
  groupId: string;
  actorUserId: string;
}) {
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: input.groupId,
        userId: input.actorUserId,
      },
    },
  });
  if (!membership) {
    throw Errors.forbidden("Tu n'es pas membre de ce groupe");
  }
  // Tous les membres peuvent voir les invitations en cours (transparence),
  // mais seuls ADMIN/TREASURER peuvent revoke/relancer.
  const invitations = await (prisma as any).groupInvitation.findMany({
    where: { groupId: input.groupId },
    include: {
      invitedBy: { select: { id: true, displayName: true } },
      invitee: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return invitations.map((inv: any) => ({
    id: inv.id,
    status: inv.status,
    contactType: inv.contactType,
    contactValue: inv.contactValue,
    displayName: inv.displayName,
    createdAt: inv.createdAt.toISOString(),
    expiresAt: inv.expiresAt.toISOString(),
    respondedAt: inv.respondedAt?.toISOString() ?? null,
    declineReason: inv.declineReason,
    invitedBy: inv.invitedBy,
    invitee: inv.invitee,
  }));
}

// ============================================================
// REVOKE (admin annule une invitation pending)
// ============================================================

export async function revokeInvitation(input: {
  invitationId: string;
  actorUserId: string;
}) {
  const invitation = await (prisma as any).groupInvitation.findUnique({
    where: { id: input.invitationId },
  });
  if (!invitation) throw Errors.notFound("Invitation introuvable");

  // Auth : seuls ADMIN/TREASURER peuvent revoke
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: invitation.groupId,
        userId: input.actorUserId,
      },
    },
  });
  if (!membership || (membership.role !== "ADMIN" && membership.role !== "TREASURER")) {
    throw Errors.forbidden(
      "Seuls les admins et trésoriers peuvent annuler une invitation.",
    );
  }

  if (invitation.status !== "PENDING") {
    throw Errors.conflict(
      "Cette invitation n'est plus en attente — impossible de l'annuler.",
    );
  }

  await (prisma as any).groupInvitation.update({
    where: { id: input.invitationId },
    data: {
      status: "REVOKED",
      respondedAt: new Date(),
    },
  });

  return { ok: true };
}

// ============================================================
// V97.D — BROADCAST WHATSAPP / SMS / MAIL (lien magique multi-usage)
// ============================================================
//
// Différent des invitations nominatives au-dessus :
//   - Pas de cible précise : 1 lien partagé à plusieurs personnes
//   - Multi-usage (maxUses configurable, default 50)
//   - Expirable (default 14 jours)
//   - Le destinataire arrive sur /join/:token, page d'inscription standard
//
// Le helper retourne aussi un MESSAGE pré-rédigé prêt à coller dans un
// groupe WhatsApp / SMS / mail. 3 tonalités sont proposées : `chaleureux`
// (default — convivial africain), `fun` (jeune, emojis), `pro` (sobre).

export type BroadcastTone = "chaleureux" | "fun" | "pro";

export interface BroadcastInviteResult {
  token: string;
  joinUrl: string;
  /** Texte prêt à coller dans un message (WhatsApp, SMS, mail) */
  message: string;
  /** Deeplink wa.me?text=... pour ouvrir WhatsApp avec le message pré-rempli */
  whatsappUrl: string;
  /** mailto:?subject=...&body=... pour ouvrir le client mail */
  mailtoUrl: string;
  /** sms:?body=... (deeplink iOS/Android) */
  smsUrl: string;
  /** TTL en jours */
  expiresInDays: number;
  /** maxUses (null = illimité) */
  maxUses: number | null;
  /** Tonalité utilisée */
  tone: BroadcastTone;
}

const BROADCAST_DEFAULT_MAX_USES = 50;
const BROADCAST_DEFAULT_TTL_DAYS = 14;

function craftBroadcastMessage(input: {
  groupName: string;
  groupTypeLabel: string;
  inviterName: string;
  joinUrl: string;
  tone: BroadcastTone;
}): string {
  const { groupName, inviterName, joinUrl, tone, groupTypeLabel } = input;

  switch (tone) {
    case "fun":
      return [
        `👋 Salut la famille ! 🌍`,
        ``,
        `Je viens de créer notre ${groupTypeLabel} « ${groupName} » sur BMD pour qu'on gère nos dépenses partagées sans prise de tête (et sans cette mauvaise foi habituelle qui fait que personne ne se rappelle qui a payé quoi 😅).`,
        ``,
        `Rejoins-moi en un tap, c'est gratuit et chiffré :`,
        joinUrl,
        ``,
        `À tout de suite ! 🙌`,
      ].join("\n");

    case "pro":
      return [
        `Bonjour,`,
        ``,
        `${inviterName} t'invite à rejoindre le groupe « ${groupName} » sur BMD pour gérer ensemble les dépenses et les règlements.`,
        ``,
        `Lien d'accès : ${joinUrl}`,
        ``,
        `BMD est gratuit, sans publicité et conforme au RGPD.`,
        ``,
        `Bonne journée.`,
      ].join("\n");

    case "chaleureux":
    default:
      return [
        `Salut les amis 👋`,
        ``,
        `J'ai créé notre groupe « ${groupName} » sur BMD pour qu'on partage nos dépenses et règle nos comptes sans prise de tête.`,
        ``,
        `Rejoignez-moi via ce lien (aucune app à installer, c'est gratuit) :`,
        joinUrl,
        ``,
        `À très vite ! 🙌`,
      ].join("\n");
  }
}

const GROUP_TYPE_LABELS: Record<string, string> = {
  TONTINE: "tontine",
  COLOC: "coloc",
  TRAVEL: "voyage",
  EVENT: "événement",
  CLUB: "club",
  PARISH: "paroisse",
  GENERIC: "groupe",
  OTHER: "groupe",
};

export async function generateBroadcastInvite(input: {
  groupId: string;
  actorUserId: string;
  tone?: BroadcastTone;
  maxUses?: number;
  expiresInDays?: number;
}): Promise<BroadcastInviteResult> {
  // Auth : ADMIN ou TREASURER (même règle que les autres invites)
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: input.groupId,
        userId: input.actorUserId,
      },
    },
  });
  if (
    !membership ||
    (membership.role !== "ADMIN" && membership.role !== "TREASURER")
  ) {
    throw Errors.forbidden(
      "Seuls les admins et trésoriers peuvent générer un lien d'invitation.",
    );
  }

  const tone: BroadcastTone = input.tone ?? "chaleureux";
  const maxUses = input.maxUses ?? BROADCAST_DEFAULT_MAX_USES;
  const expiresInDays = input.expiresInDays ?? BROADCAST_DEFAULT_TTL_DAYS;

  // 1. Réutilise un token broadcast existant s'il est encore valide
  //    (évite la prolifération de tokens à chaque clic). Sinon en crée un.
  const now = new Date();
  const existing = await prisma.groupInviteToken.findFirst({
    where: {
      groupId: input.groupId,
      createdById: input.actorUserId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
  });

  let token: string;
  if (existing && (existing.maxUses == null || existing.uses < existing.maxUses)) {
    token = existing.token;
  } else {
    const created = await prisma.groupInviteToken.create({
      data: {
        token: randomBytes(TOKEN_BYTES).toString("base64url"),
        groupId: input.groupId,
        createdById: input.actorUserId,
        maxUses,
        expiresAt: new Date(
          Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
        ),
      },
    });
    token = created.token;
    // Audit log (utilise l'enum INVITE_LINK_CREATED qui existe)
    await logActivity({
      groupId: input.groupId,
      actorId: input.actorUserId,
      kind: "INVITE_LINK_CREATED",
      payload: { tokenId: created.id, channel: "broadcast" },
    }).catch(() => {});
  }

  // 2. Construit l'URL publique de jointure
  const env = loadEnv();
  const baseUrl = env.WEB_BASE_URL ?? "https://www.backmesdo.com";
  const joinUrl = `${baseUrl}/join/${token}`;

  // 3. Récupère les noms pour le message
  const [group, inviter] = await Promise.all([
    prisma.group.findUnique({
      where: { id: input.groupId },
      select: { name: true, type: true },
    }),
    prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { displayName: true },
    }),
  ]);

  const message = craftBroadcastMessage({
    groupName: group?.name ?? "notre groupe",
    groupTypeLabel: GROUP_TYPE_LABELS[group?.type ?? "GENERIC"] ?? "groupe",
    inviterName: inviter?.displayName ?? "Un ami",
    joinUrl,
    tone,
  });

  // 4. URLs prêtes à cliquer
  const encoded = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/?text=${encoded}`;
  const smsUrl = `sms:?body=${encoded}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Rejoins « ${group?.name ?? "notre groupe"} » sur BMD`)}&body=${encoded}`;

  return {
    token,
    joinUrl,
    message,
    whatsappUrl,
    mailtoUrl,
    smsUrl,
    expiresInDays,
    maxUses: existing ? existing.maxUses : maxUses,
    tone,
  };
}

// Re-export pour limiter les imports externes
export { INVITATION_TTL_DAYS, DECLINE_REASON_MIN_LENGTH };
