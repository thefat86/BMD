/**
 * V164 — Service messagerie ambassadeur/commercial → réseau.
 *
 * L'ambassadeur ou le commercial agréé peut envoyer un message à un membre
 * de son réseau (filleul direct uniquement, anti-pyramidal).
 *
 * Canaux : in-app (notification BMD) + email (si vérifié).
 *
 * Templates pré-faits (RELANCE / MOTIVATION / WELCOME) + message libre CUSTOM.
 */

import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const prisma = prismaClient as any;

export const TEMPLATES = {
  RELANCE: {
    subject: "On pense à toi sur BMD",
    body: "Salut {{recipientName}},\n\nJe me souviens t'avoir parlé de BMD pour gérer simplement les dépenses partagées. Tu n'as pas encore essayé ?\n\nC'est vraiment pratique pour les vacances en groupe, les colocs, ou les tontines en famille. Et avec mon code de parrainage, tu auras 1 mois gratuit sur le forfait que tu choisiras.\n\nDis-moi si tu veux que je te montre comment ça marche ! 😊\n\n{{senderName}}",
  },
  MOTIVATION: {
    subject: "Tu vas adorer cette fonction BMD",
    body: "Hello {{recipientName}},\n\nJ'ai découvert une fonction de BMD que je voulais absolument te partager : le scan de tickets IA. Tu prends ton ticket en photo, et tout est rentré automatiquement avec qui doit quoi.\n\nÇa change la vie pour les sorties à plusieurs ! Si tu veux tester, je peux te montrer.\n\n{{senderName}}",
  },
  WELCOME: {
    subject: "Bienvenue dans le réseau BMD 🎉",
    body: "Bienvenue {{recipientName}} !\n\nJe suis super content que tu aies rejoint BMD. Si tu as la moindre question pour bien démarrer (créer ton premier groupe, inviter des amis, scanner ton premier ticket), n'hésite pas, je te montre.\n\n{{senderName}}",
  },
  CUSTOM: {
    subject: "",
    body: "",
  },
};

/**
 * Envoie un message à un filleul direct.
 * - Vérifie que recipient est bien un filleul direct (anti-pyramidal).
 * - In-app : crée une Notification kind=NETWORK_MESSAGE.
 * - Email : si recipient a un EMAIL vérifié.
 */
export async function sendNetworkMessage(input: {
  senderId: string;
  recipientUserId: string;
  templateKey?: "RELANCE" | "MOTIVATION" | "WELCOME" | "CUSTOM";
  subject?: string;
  body?: string;
  channels?: "INAPP" | "EMAIL" | "BOTH";
}) {
  const sender = await prisma.user.findUnique({
    where: { id: input.senderId },
    select: {
      id: true,
      displayName: true,
      isAmbassador: true,
      isCommercialAgreed: true,
    },
  });
  if (!sender) throw Errors.forbidden("Utilisateur introuvable");
  if (!sender.isAmbassador && !sender.isCommercialAgreed) {
    throw Errors.forbidden(
      "Seul un ambassadeur ou commercial agréé peut envoyer des messages au réseau.",
    );
  }

  // Anti-pyramidal : on vérifie que recipient est bien filleul DIRECT du sender
  const recipient = await prisma.user.findUnique({
    where: { id: input.recipientUserId },
    select: {
      id: true,
      displayName: true,
      referredById: true,
      defaultLocale: true,
      contacts: {
        where: { type: "EMAIL", verifiedAt: { not: null } },
        select: { value: true },
        take: 1,
      },
    },
  });
  if (!recipient) throw Errors.notFound("Destinataire introuvable");
  if (recipient.referredById !== sender.id) {
    throw Errors.forbidden(
      "Tu ne peux envoyer un message qu'aux membres directs de ton réseau.",
    );
  }

  // Préparer le contenu : template ou custom
  const templateKey = input.templateKey ?? "CUSTOM";
  const template = TEMPLATES[templateKey] ?? TEMPLATES.CUSTOM;
  const subjectRaw = input.subject || template.subject;
  const bodyRaw = input.body || template.body;
  if (!subjectRaw || !bodyRaw) {
    throw Errors.badRequest("Sujet et corps du message requis");
  }
  const subject = subjectRaw
    .replace(/\{\{recipientName\}\}/g, recipient.displayName)
    .replace(/\{\{senderName\}\}/g, sender.displayName)
    .slice(0, 200);
  const body = bodyRaw
    .replace(/\{\{recipientName\}\}/g, recipient.displayName)
    .replace(/\{\{senderName\}\}/g, sender.displayName)
    .slice(0, 5000);

  const channels = input.channels ?? "BOTH";
  const wantInApp = channels === "INAPP" || channels === "BOTH";
  const wantEmail = channels === "EMAIL" || channels === "BOTH";

  // Création de la ligne message
  const msg = await prisma.networkMessage.create({
    data: {
      senderId: sender.id,
      recipientId: recipient.id,
      templateKey,
      subject,
      body,
      channels,
      inAppSentAt: wantInApp ? new Date() : null,
    },
  });

  // In-app notification
  if (wantInApp) {
    try {
      await prisma.notification.create({
        data: {
          userId: recipient.id,
          kind: "NETWORK_MESSAGE",
          title: subject,
          body: body.slice(0, 300),
          link: `/dashboard/notifications`,
          senderUserId: sender.id,
          payload: { networkMessageId: msg.id },
        },
      });
    } catch {
      // Si NETWORK_MESSAGE n'existe pas dans NotificationKind enum, ignore
      // (la migration enum sera faite en V164.x ; pour V1 on tolère)
    }
  }

  // Email (best effort, fire-and-forget)
  if (wantEmail && recipient.contacts[0]?.value) {
    try {
      const { sendTemplatedEmail } = await import("../../lib/messaging.js");
      await sendTemplatedEmail(
        recipient.contacts[0].value,
        {
          kind: "networkMessage",
          payload: {
            recipientName: recipient.displayName,
            senderName: sender.displayName,
            subject,
            body,
          },
        },
        recipient.defaultLocale ?? "fr",
      );
      await prisma.networkMessage.update({
        where: { id: msg.id },
        data: { emailSentAt: new Date() },
      });
    } catch {
      // Tolère échec email — la ligne in-app reste utile
    }
  }

  return msg;
}

export async function listMessagesSent(senderId: string, limit: number = 50) {
  return prisma.networkMessage.findMany({
    where: { senderId },
    include: {
      recipient: { select: { id: true, displayName: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
}
