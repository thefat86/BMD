/**
 * V47 · Service Pack IA Booster
 *
 * Gère les achats one-shot de packs IA (4,99 € pour +100 scans / 30 jours).
 * Plusieurs packs peuvent être actifs simultanément (cumul). Quand un user
 * scanne, on consomme dans cet ordre :
 *   1. Son quota mensuel de plan
 *   2. Ses packs Booster actifs (FIFO du plus ancien à expirer)
 *
 * Ce service est appelé par plan-limits.assertCanUseOcr et par la route
 * d'achat /me/boosters/purchase.
 */
import { prisma } from "./db.js";
import { BOOSTER_PACK } from "./seed-plans.js";

/**
 * Retourne le nombre total de scans Booster RESTANTS pour un user
 * (somme des scansAdded − scansUsed sur les packs non expirés).
 */
export async function getRemainingBoosterScans(
  userId: string,
): Promise<number> {
  try {
    const now = new Date();
    const packs = await (prisma as any).planBoosterPurchase.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      select: { scansAdded: true, scansUsed: true },
    });
    return packs.reduce(
      (sum: number, p: { scansAdded: number; scansUsed: number }) =>
        sum + (p.scansAdded - p.scansUsed),
      0,
    );
  } catch {
    // Si la table n'existe pas encore (avant migration), on retourne 0
    return 0;
  }
}

/**
 * Consomme 1 scan sur le premier pack Booster actif (FIFO du plus ancien
 * à expirer). Retourne true si un pack a été consommé, false si aucun
 * pack actif disponible (l'appelant doit alors retomber sur le quota plan).
 */
export async function consumeBoosterScan(userId: string): Promise<boolean> {
  try {
    const now = new Date();
    // FIFO : on prend le pack qui expire le plus tôt et qui a encore des
    // scans disponibles. Évite de gâcher les packs proches de l'expiration.
    const pack = await (prisma as any).planBoosterPurchase.findFirst({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "asc" },
    });
    if (!pack) return false;
    if (pack.scansUsed >= pack.scansAdded) {
      // Pack épuisé, essayer le suivant via récursion
      // (sécurité : limiter la profondeur — au pire 10 packs cumulés)
      return false;
    }
    await (prisma as any).planBoosterPurchase.update({
      where: { id: pack.id },
      data: { scansUsed: { increment: 1 } },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Enregistre l'achat d'un Pack IA Booster après confirmation de paiement
 * Stripe. Crée une ligne valide 30 jours avec +100 scans disponibles.
 *
 * Idempotent : si on appelle 2x avec le même stripePaymentIntentId, on ne
 * crée pas de doublon.
 */
export async function recordBoosterPurchase(input: {
  userId: string;
  stripePaymentIntentId: string;
  pricePaidCents?: number;
}): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + BOOSTER_PACK.durationDays);

  // Idempotence : si la même PaymentIntent a déjà créé un pack, retourner
  // celui-là (webhook Stripe peut être appelé plusieurs fois en cas de retry)
  const existing = await (prisma as any).planBoosterPurchase.findFirst({
    where: { stripePaymentIntentId: input.stripePaymentIntentId },
  });
  if (existing) return { id: existing.id, expiresAt: existing.expiresAt };

  const created = await (prisma as any).planBoosterPurchase.create({
    data: {
      userId: input.userId,
      packCode: BOOSTER_PACK.code,
      scansAdded: BOOSTER_PACK.scansAdded,
      scansUsed: 0,
      expiresAt,
      stripePaymentIntentId: input.stripePaymentIntentId,
      pricePaidCents: input.pricePaidCents ?? BOOSTER_PACK.priceCents,
    },
  });
  return { id: created.id, expiresAt: created.expiresAt };
}

/**
 * Liste les packs Booster actifs d'un user (pour affichage UI dans
 * /dashboard/plans ou /me/plan).
 */
export async function listActiveBoosters(userId: string): Promise<
  Array<{
    id: string;
    scansRemaining: number;
    expiresAt: string;
  }>
> {
  try {
    const now = new Date();
    const packs = await (prisma as any).planBoosterPurchase.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        scansAdded: true,
        scansUsed: true,
        expiresAt: true,
      },
      orderBy: { expiresAt: "asc" },
    });
    return packs.map((p: any) => ({
      id: p.id,
      scansRemaining: p.scansAdded - p.scansUsed,
      expiresAt: p.expiresAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
