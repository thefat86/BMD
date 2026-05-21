/**
 * Service de notifications.
 *
 * Stratégie anti-spam :
 *  - Les triggers business utilisent `notifyMembers()` qui envoie une notif
 *    à tous les membres SAUF l'auteur de l'action (qui sait déjà ce qu'il a fait)
 *  - Les notifications sont best-effort : un échec d'écriture ne casse jamais
 *    l'opération business. On log et on continue.
 *  - Le helper `groupActorIds` est responsable de l'exclusion correcte.
 *
 * Fonctionnement frontend :
 *  - Le client polle GET /notifications toutes les 30s
 *  - Une cloche dans la nav avec un badge (count des non-lues)
 *  - Au clic sur une notif, on suit le `link` puis on marque comme lue
 *  - Bouton "Tout marquer comme lu"
 *
 * Pas d'email/SMS ici : on garde tout in-app pour le MVP. L'extension
 * vers email/push se fera en branchant un worker sur les Notification rows
 * (eventual delivery, idempotent via le id de la notif).
 */
import type { NotificationKind } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import {
  sendNativePushToMany,
  sendNativePushToUser,
} from "../../lib/native-push.js";
import { sendPushToUser } from "../../lib/web-push.js";

interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  payload?: Record<string, unknown>;
  /// V98 — Qui a déclenché cette notif (null pour les notifs système type
  /// NEW_DEVICE_LOGIN). Permet d'envoyer une notif retour à l'émetteur
  /// quand le destinataire répond.
  senderUserId?: string;
}

/**
 * V132 — Données stringifiées passées au push natif (APNs/FCM acceptent
 * uniquement des string:string en data). Toujours sérialisé en string.
 */
function buildPushData(input: NotifyInput, notificationId?: string) {
  const data: Record<string, string> = {
    kind: String(input.kind),
  };
  if (input.link) data.link = input.link;
  if (notificationId) data.notificationId = notificationId;
  if (input.senderUserId) data.senderUserId = input.senderUserId;
  // Le payload JSON est aplati en string pour passer le contrat APNs/FCM
  // (le mobile peut le re-parser au tap pour les écrans qui en ont besoin).
  if (input.payload) {
    try {
      data.payload = JSON.stringify(input.payload);
    } catch {
      /* swallow — payload non sérialisable */
    }
  }
  return data;
}

/**
 * Envoie une notification à un seul utilisateur.
 * Best-effort : ne throw jamais, log les erreurs en console.
 *
 * V132 — Pipeline complet :
 *   1. Insert row Notification (source de vérité in-app + historique)
 *   2. Push Web (VAPID) en best-effort → notif système navigateur PWA
 *   3. Push natif (APNs/FCM) en best-effort → notif lockscreen iPhone/Android
 *
 * Si un canal échoue, les autres continuent. Si rien n'est configuré
 * (env vides), les fonctions push sont des no-op silencieux.
 */
export async function notifyOne(
  userId: string,
  input: NotifyInput,
): Promise<void> {
  let notificationId: string | undefined;
  try {
    // V98 — cast `as any` tant que `prisma generate` n'a pas tourné après
    // la migration V98 (nouvelles colonnes senderUserId etc.). À retirer
    // dès que les types Prisma sont régénérés.
    const row = await (prisma.notification as any).create({
      data: {
        userId,
        senderUserId: input.senderUserId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        payload: input.payload as any,
      },
      select: { id: true },
    });
    notificationId = row.id;
  } catch (err) {
    console.warn("[notify] failed to deliver", { userId, kind: input.kind, err });
    // Si on n'a pas pu écrire la notif, on n'envoie pas de push non plus —
    // l'utilisateur arriverait sur une notif fantôme.
    return;
  }

  // V132 — Push fan-out best-effort. Les deux canaux sont indépendants.
  // Pas d'await bloquant volontairement : on relâche la promesse pour ne
  // pas ralentir le caller métier (création dépense, settlement, etc.).
  void Promise.all([
    sendPushToUser(userId, {
      title: input.title,
      body: input.body ?? "",
      url: input.link,
    }).catch(() => undefined),
    sendNativePushToUser(userId, {
      title: input.title,
      body: input.body,
      data: buildPushData(input, notificationId),
    }).catch(() => undefined),
  ]);
}

/**
 * Envoie la même notification à plusieurs utilisateurs en bulk.
 * Best-effort : on swallow les erreurs.
 *
 * V132 — Pareil que notifyOne mais en batch :
 *   - createMany pour les rows in-app (1 INSERT)
 *   - Promise.all sur les push (fan-out parallèle, best-effort)
 */
export async function notifyMany(
  userIds: string[],
  input: NotifyInput,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await (prisma.notification as any).createMany({
      data: userIds.map((userId) => ({
        userId,
        senderUserId: input.senderUserId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        payload: input.payload as any,
      })),
    });
  } catch (err) {
    console.warn("[notifyMany] failed", { count: userIds.length, err });
    return;
  }

  // V132 — Push fan-out parallèle (web + natif). Le batch natif fait son
  // propre Promise.all interne. On ne bloque pas le caller.
  void Promise.all([
    Promise.all(
      userIds.map((uid) =>
        sendPushToUser(uid, {
          title: input.title,
          body: input.body ?? "",
          url: input.link,
        }).catch(() => undefined),
      ),
    ),
    sendNativePushToMany(userIds, {
      title: input.title,
      body: input.body,
      data: buildPushData(input),
    }).catch(() => undefined),
  ]);
}

/**
 * Envoie une notification à tous les membres d'un groupe SAUF l'acteur.
 * Évite l'auto-spam : tu ne reçois pas de notif pour tes propres actions.
 */
export async function notifyGroupMembers(input: {
  groupId: string;
  excludeUserId?: string;
  notification: NotifyInput;
  /// Si true, on ignore les `doNotDisturb` (cas critique : règlement, suspension)
  bypassDND?: boolean;
}): Promise<void> {
  try {
    const members = await prisma.groupMember.findMany({
      where: {
        groupId: input.groupId,
        // Spec §3.12 : filtre Ne Pas Déranger sauf si bypassDND
        ...(input.bypassDND ? {} : { doNotDisturb: false }),
      },
      select: { userId: true },
    });
    const targetIds = members
      .map((m) => m.userId)
      .filter((id) => id !== input.excludeUserId);
    await notifyMany(targetIds, input.notification);
  } catch (err) {
    console.warn("[notifyGroupMembers] failed", { err });
  }
}

// ============ READ-SIDE API ============

export async function listNotifications(input: {
  userId: string;
  unreadOnly?: boolean;
  limit?: number;
}) {
  return prisma.notification.findMany({
    where: {
      userId: input.userId,
      ...(input.unreadOnly && { readAt: null }),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50,
  });
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markAsRead(input: {
  notificationId: string;
  userId: string;
}): Promise<{ updated: number }> {
  const r = await prisma.notification.updateMany({
    where: { id: input.notificationId, userId: input.userId },
    data: { readAt: new Date() },
  });
  return { updated: r.count };
}

/**
 * Marque une notification comme NON lue (réinitialise `readAt` à null).
 * Permet à l'utilisateur de garder une notif visible dans le badge
 * pour y revenir plus tard (équivalent du "Mark as unread" Gmail).
 */
export async function markAsUnread(input: {
  notificationId: string;
  userId: string;
}): Promise<{ updated: number }> {
  const r = await prisma.notification.updateMany({
    where: { id: input.notificationId, userId: input.userId },
    data: { readAt: null },
  });
  return { updated: r.count };
}

export async function markAllAsRead(userId: string): Promise<{ updated: number }> {
  const r = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: r.count };
}

export async function deleteNotification(input: {
  notificationId: string;
  userId: string;
}): Promise<void> {
  await prisma.notification.deleteMany({
    where: { id: input.notificationId, userId: input.userId },
  });
}

// ============================================================
// V98 — INTERACTION (réponse + accusé de réception)
// ============================================================
//
// NOTE TYPES — Les nouvelles colonnes (senderUserId, respondedAt,
// responseKind, responseEmoji, responseText, acknowledgedAt) + la
// nouvelle valeur d'enum NOTIF_RESPONSE n'apparaissent dans le client
// Prisma qu'après `npx prisma generate`. En attendant on cast en `any`
// pour passer tsc en local. À nettoyer après generate.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notifs = prisma.notification as any;

/**
 * Récupère une notification par id (avec ownership check : seul le
 * destinataire ou l'émetteur peuvent la lire). Inclut le sender pour
 * pouvoir afficher son nom + photo dans la page de détail.
 */
export async function getNotification(input: {
  notificationId: string;
  viewerUserId: string;
}) {
  const found = await notifs.findUnique({
    where: { id: input.notificationId },
    include: {
      sender: {
        select: { id: true, displayName: true, avatar: true },
      },
    },
  });
  if (!found) throw Errors.notFound("Notification introuvable");
  // Ownership : destinataire OU émetteur (pour voir sa propre notif retour)
  const isOwner =
    found.userId === input.viewerUserId ||
    found.senderUserId === input.viewerUserId;
  if (!isOwner) {
    throw Errors.forbidden("Cette notification n'est pas pour toi.");
  }
  return found;
}

/**
 * Résumé minimal du destinataire pour l'inclure dans la notif retour
 * envoyée à l'émetteur.
 */
async function getResponderInfo(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, avatar: true },
  });
}

export type NotificationResponseKind = "ACK" | "EMOJI" | "TEXT";

/**
 * Le destinataire répond à une notification.
 *
 *  - kind=ACK : simple accusé de réception (« vu »).
 *  - kind=EMOJI : réaction emoji courte (1-3 chars).
 *  - kind=TEXT : réponse libre (max 280 chars).
 *
 * Side-effects :
 *  - update la notif destinataire avec respondedAt + responseKind/Emoji/Text
 *  - si la notif a un sender, on lui envoie une notif `NOTIF_RESPONSE`
 *    avec un payload `{originalNotificationId, responder, responseKind, ...}`
 *    pour qu'il voie la réponse et puisse l'acknowledger.
 *
 * Idempotent : si la notif est déjà respondedAt, on remplace la réponse
 * (utile pour changer son emoji par ex). Pas de doublon de notif retour.
 */
export async function respondToNotification(input: {
  notificationId: string;
  userId: string;
  kind: NotificationResponseKind;
  emoji?: string;
  text?: string;
}): Promise<{ ok: boolean; alreadyResponded: boolean }> {
  // 1. Validation
  if (input.kind === "EMOJI" && (!input.emoji || input.emoji.length > 8)) {
    throw Errors.badRequest("Emoji invalide", {
      tip: "Choisis un seul emoji (1 à 3 caractères).",
    });
  }
  if (input.kind === "TEXT") {
    const txt = input.text?.trim() ?? "";
    if (txt.length === 0) {
      throw Errors.badRequest("Réponse vide", {
        tip: "Écris au moins un mot avant d'envoyer.",
      });
    }
    if (txt.length > 280) {
      throw Errors.badRequest("Réponse trop longue (280 caractères max).");
    }
  }

  // 2. Charge la notif et vérifie qu'elle est bien à l'utilisateur
  const found = await notifs.findUnique({
    where: { id: input.notificationId },
    select: {
      id: true,
      userId: true,
      senderUserId: true,
      kind: true,
      title: true,
      respondedAt: true,
      link: true,
    },
  });
  if (!found) throw Errors.notFound("Notification introuvable");
  if (found.userId !== input.userId) {
    throw Errors.forbidden("Cette notification n'est pas pour toi.");
  }
  // Les notifs `NOTIF_RESPONSE` ne sont pas "répondables" (ce sont déjà des
  // retours). On les acknowledge avec l'autre endpoint.
  if (found.kind === "NOTIF_RESPONSE") {
    throw Errors.badRequest(
      "Cette notification est une réponse — pas répondable à son tour.",
      { tip: "Utilise « Compris » pour fermer la boucle." },
    );
  }

  const alreadyResponded = found.respondedAt !== null;

  // 3. Update du destinataire avec sa réponse
  const text =
    input.kind === "TEXT" ? input.text?.trim().slice(0, 280) : null;
  const emoji = input.kind === "EMOJI" ? input.emoji ?? null : null;
  await notifs.update({
    where: { id: input.notificationId },
    data: {
      respondedAt: new Date(),
      responseKind: input.kind,
      responseEmoji: emoji,
      responseText: text,
      // Marque aussi comme lue : on a forcément vu la notif pour y répondre
      readAt: new Date(),
    },
  });

  // 4. Envoi de la notif retour à l'émetteur (si applicable)
  //    Ne renvoie pas de retour pour les notifs sans sender (ex: système).
  //    Ne renvoie pas non plus si c'est le user qui répond à sa propre notif
  //    (cas dégénéré : un user émet et reçoit la même notif).
  if (found.senderUserId && found.senderUserId !== input.userId) {
    const responder = await getResponderInfo(input.userId);
    const responderName = responder?.displayName ?? "Quelqu'un";

    // Titre & body adaptés au type de réponse
    let title = `${responderName} a vu ton message`;
    let body: string | undefined;
    if (input.kind === "EMOJI") {
      title = `${responderName} a réagi ${emoji ?? ""}`;
      body = `À propos de : « ${found.title} »`;
    } else if (input.kind === "TEXT") {
      title = `${responderName} a répondu`;
      body = `« ${text} » · sur : « ${found.title} »`;
    } else {
      // ACK : simple accusé de réception
      title = `${responderName} a vu ton message`;
      body = `À propos de : « ${found.title} »`;
    }

    // Si on a déjà envoyé une notif retour pour cette même notif (rare),
    // on update au lieu de créer un doublon.
    const existingResponse = await notifs.findFirst({
      where: {
        userId: found.senderUserId,
        kind: "NOTIF_RESPONSE",
        // Lookup par payload.originalNotificationId — pas indexé donc
        // limité aux notifs récentes (90j).
        createdAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
        payload: {
          path: ["originalNotificationId"],
          equals: input.notificationId,
        },
      },
      select: { id: true },
    });

    const payload = {
      originalNotificationId: input.notificationId,
      originalKind: found.kind,
      originalLink: found.link,
      responder: {
        id: responder?.id,
        displayName: responderName,
        avatar: responder?.avatar,
      },
      responseKind: input.kind,
      responseEmoji: emoji,
      responseText: text,
    };

    if (existingResponse) {
      await notifs.update({
        where: { id: existingResponse.id },
        data: {
          title,
          body,
          payload: payload as any,
          readAt: null,
          acknowledgedAt: null,
          createdAt: new Date(),
        },
      });
    } else {
      await notifyOne(found.senderUserId, {
        kind: "NOTIF_RESPONSE" as any,
        title,
        body,
        link: `/notifications/${input.notificationId}/response`,
        payload,
        senderUserId: input.userId,
      });
    }
  }

  return { ok: true, alreadyResponded };
}

/**
 * L'émetteur acknowledge la notif retour (= « Compris »).
 * Marque `acknowledgedAt` + `readAt` sur la notif `NOTIF_RESPONSE`.
 */
export async function acknowledgeResponse(input: {
  notificationId: string;
  userId: string;
}): Promise<{ ok: boolean }> {
  const found = await notifs.findUnique({
    where: { id: input.notificationId },
    select: { id: true, userId: true, kind: true, acknowledgedAt: true },
  });
  if (!found) throw Errors.notFound("Notification introuvable");
  if (found.userId !== input.userId) {
    throw Errors.forbidden("Cette notification n'est pas pour toi.");
  }
  if (found.kind !== "NOTIF_RESPONSE") {
    throw Errors.badRequest(
      "Seules les notifications de retour peuvent être acknowledgées.",
      {
        tip: "Pour les autres, utilise « Marquer comme lu » ou « Répondre ».",
      },
    );
  }
  if (found.acknowledgedAt) {
    return { ok: true };
  }
  await notifs.update({
    where: { id: input.notificationId },
    data: {
      acknowledgedAt: new Date(),
      readAt: new Date(),
    },
  });
  return { ok: true };
}
