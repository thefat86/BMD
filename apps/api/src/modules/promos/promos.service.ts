/**
 * Service Codes promo & parrainage (spec §6.9).
 *
 * 2 types de codes :
 *  - DISCOUNT : créés par l'admin (ex: "BIENVENUE25" pour -25% sur Premium)
 *  - REFERRAL : générés par chaque user (auto à la 1ère utilisation)
 *
 * Sécurité :
 *  - Un user ne peut redeem un code qu'une seule fois (clé unique sur PromoRedemption)
 *  - On ne peut pas redeem son propre code de parrainage
 *  - Les codes désactivés / expirés / épuisés sont rejetés avec message clair
 */
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

/**
 * Génère un code de parrainage unique pour un user (best-effort sur 5 essais).
 * Format : 6 caractères alphanumériques en MAJUSCULES (ex: "K3F8XY").
 */
async function generateReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(4)
      .toString("base64")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 6);
    if (code.length < 6) continue;
    const exists = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  // Fallback : timestamp + random
  return `R${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

/**
 * Récupère ou crée le code de parrainage d'un user.
 * Idempotent : si un code existe déjà, on le retourne tel quel.
 */
export async function getOrCreateReferralCode(userId: string): Promise<{
  code: string;
  totalReferred: number;
  totalRedeemed: number;
}> {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!user) throw Errors.notFound("Utilisateur introuvable");

  if (!user.referralCode) {
    const newCode = await generateReferralCode();
    user = await prisma.user.update({
      where: { id: userId },
      data: { referralCode: newCode },
      select: { referralCode: true },
    });
    // Crée aussi l'entrée PromoCode associée pour pouvoir tracker les redemptions
    await prisma.promoCode.upsert({
      where: { code: newCode },
      create: {
        code: newCode,
        type: "REFERRAL",
        discountValue: new Prisma.Decimal(10), // 10% pour le filleul, configurable
        discountKind: "PERCENT",
        description: "Code de parrainage personnel",
        ownerUserId: userId,
      },
      update: {},
    });
  }

  // Stats
  const [totalReferred, totalRedeemed] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.promoRedemption.count({
      where: { code: { ownerUserId: userId } },
    }),
  ]);

  return {
    code: user.referralCode!,
    totalReferred,
    totalRedeemed,
  };
}

export interface RedeemResult {
  ok: true;
  code: string;
  type: "DISCOUNT" | "REFERRAL";
  appliedValue: string;
  appliedKind: "PERCENT" | "FIXED";
  message: string;
}

/**
 * Tente de redeem un code pour un user.
 * Throw une AppError chaleureuse en cas de problème.
 */
export async function redeemCode(input: {
  code: string;
  userId: string;
}): Promise<RedeemResult> {
  const codeUpper = input.code.trim().toUpperCase();
  if (!codeUpper) {
    throw Errors.badRequest("Saisis un code promo pour l'appliquer 🎁");
  }
  const code = await prisma.promoCode.findUnique({
    where: { code: codeUpper },
  });
  if (!code) {
    throw Errors.notFound(
      "Ce code promo n'existe pas (ou plus) 🎫",
      { tip: "Vérifie l'orthographe — les codes sont sensibles à la casse." },
    );
  }
  if (!code.isActive) {
    throw Errors.invalidState({
      what: "Ce code",
      currentState: "désactivé par l'équipe BMD",
      tip: "Cherche-en un autre dans nos newsletters ou auprès des champions de ta communauté.",
    });
  }
  if (code.expiresAt && code.expiresAt < new Date()) {
    throw Errors.invalidState({
      what: "Ce code",
      currentState: "expiré ⏰",
      tip: "Les bons plans ne durent pas — abonne-toi à la newsletter pour les prochains.",
    });
  }
  if (code.maxUses && code.uses >= code.maxUses) {
    throw Errors.invalidState({
      what: "Ce code",
      currentState: "épuisé 🎯",
      tip: "Trop de monde l'a déjà utilisé avant toi. Sois plus rapide la prochaine fois !",
    });
  }
  if (code.ownerUserId === input.userId) {
    throw Errors.badRequest(
      "Tu ne peux pas utiliser ton propre code de parrainage 😉",
      {
        tip: "Partage-le avec tes amis pour qu'ils en profitent !",
      },
    );
  }
  const already = await prisma.promoRedemption.findUnique({
    where: {
      codeRef_userId: { codeRef: codeUpper, userId: input.userId },
    },
  });
  if (already) {
    throw Errors.alreadyExists({
      what: "Tu as déjà utilisé ce code",
      tip: "Chaque code ne peut servir qu'une fois par compte.",
    });
  }

  // Applique : enregistre la redemption + bump le compteur
  await prisma.$transaction([
    prisma.promoRedemption.create({
      data: {
        codeRef: codeUpper,
        userId: input.userId,
        appliedValue: code.discountValue,
        appliedKind: code.discountKind,
      },
    }),
    prisma.promoCode.update({
      where: { code: codeUpper },
      data: { uses: { increment: 1 } },
    }),
  ]);

  // Cas REFERRAL : on rattache aussi le user au parrain
  if (code.type === "REFERRAL" && code.ownerUserId) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { referredById: code.ownerUserId },
    });
  }

  const value = code.discountValue.toString();
  const valueLabel =
    code.discountKind === "PERCENT" ? `${value}%` : `${value} EUR`;
  const message =
    code.type === "REFERRAL"
      ? `🎁 Bienvenue ! Tu as été parrainé : tu bénéficies de ${valueLabel} de réduction sur ton prochain upgrade.`
      : `✨ Code appliqué : ${valueLabel} de réduction sur ton prochain upgrade.`;

  return {
    ok: true,
    code: codeUpper,
    type: code.type as "DISCOUNT" | "REFERRAL",
    appliedValue: value,
    appliedKind: code.discountKind as "PERCENT" | "FIXED",
    message,
  };
}

/**
 * Liste les redemptions d'un user (pour son profil).
 */
export async function listMyRedemptions(userId: string) {
  return prisma.promoRedemption.findMany({
    where: { userId },
    orderBy: { redeemedAt: "desc" },
    include: {
      code: {
        select: { code: true, type: true, description: true },
      },
    },
  });
}
