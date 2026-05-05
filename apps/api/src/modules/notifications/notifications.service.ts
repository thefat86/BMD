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

interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  payload?: Record<string, unknown>;
}

/**
 * Envoie une notification à un seul utilisateur.
 * Best-effort : ne throw jamais, log les erreurs en console.
 */
export async function notifyOne(
  userId: string,
  input: NotifyInput,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        payload: input.payload as any,
      },
    });
  } catch (err) {
    console.warn("[notify] failed to deliver", { userId, kind: input.kind, err });
  }
}

/**
 * Envoie la même notification à plusieurs utilisateurs en bulk.
 * Best-effort : on swallow les erreurs.
 */
export async function notifyMany(
  userIds: string[],
  input: NotifyInput,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        payload: input.payload as any,
      })),
    });
  } catch (err) {
    console.warn("[notifyMany] failed", { count: userIds.length, err });
  }
}

/**
 * Envoie une notification à tous les membres d'un groupe SAUF l'acteur.
 * Évite l'auto-spam : tu ne reçois pas de notif pour tes propres actions.
 */
export async function notifyGroupMembers(input: {
  groupId: string;
  excludeUserId?: string;
  notification: NotifyInput;
}): Promise<void> {
  try {
    const members = await prisma.groupMember.findMany({
      where: { groupId: input.groupId },
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
