/**
 * Application des limites de plan (spec §6.3).
 *
 * Charge le plan d'un user et applique ses limites aux opérations métier.
 * Si le plan ne permet pas une action, on lève une erreur 402 (payment
 * required) que le frontend traduit en CTA d'upgrade.
 *
 * Stratégie :
 *  - Le code des limites est dans le JSON `Plan.limits` (configurable depuis
 *    la console admin sans déploiement)
 *  - Valeur -1 = illimité ; valeur 0 = bloqué ; valeur N > 0 = quota
 *  - Booléens : true = activé, false = bloqué
 *
 * Cache léger en mémoire (5 min) pour éviter de querier le plan à chaque
 * requête. Une modification depuis la console admin sera prise en compte
 * dans les 5 minutes (acceptable pour le cas d'usage).
 */
import { prisma } from "./db.js";
import { Errors } from "./errors.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedLimits {
  limits: Record<string, any>;
  planCode: string;
  loadedAt: number;
}

const cache = new Map<string, CachedLimits>();

async function getUserLimits(userId: string): Promise<CachedLimits> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planCode: true },
  });
  if (!user) throw Errors.notFound("Utilisateur introuvable");

  const plan = await prisma.plan.findUnique({
    where: { code: user.planCode },
  });
  // Fallback sur les limites du plan FREE si le plan référencé n'existe plus
  const limits =
    (plan?.limits as Record<string, any>) ??
    {
      maxGroups: 2,
      maxMembersPerGroup: 8,
      ocrPerMonth: 5,
      whatsappBot: false,
      multiCurrency: false,
      debtSwap: false,
      exportPdfExcel: false,
    };
  const fresh: CachedLimits = {
    limits,
    planCode: user.planCode,
    loadedAt: Date.now(),
  };
  cache.set(userId, fresh);
  return fresh;
}

export function invalidatePlanCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Erreur structurée 402 quand le plan ne suffit pas */
function planRequired(
  feature: string,
  required: string,
  current: string,
): never {
  const err: any = new Error(
    `Cette fonctionnalité (${feature}) nécessite le plan ${required} (tu es sur ${current})`,
  );
  err.statusCode = 402;
  err.errorCode = "plan_required";
  err.feature = feature;
  err.required = required;
  throw err;
}

/**
 * Vérifie qu'un user peut créer un nouveau groupe.
 * Compte les groupes dont il est membre (toutes catégories) vs maxGroups.
 */
export async function assertCanCreateGroup(userId: string): Promise<void> {
  const { limits, planCode } = await getUserLimits(userId);
  const max = limits.maxGroups;
  if (max === -1 || max === undefined) return; // illimité
  const count = await prisma.groupMember.count({ where: { userId } });
  if (count >= max) {
    planRequired(
      `${max} groupes max sur ton plan`,
      "PREMIUM",
      planCode,
    );
  }
}

/**
 * Vérifie qu'un groupe peut accueillir un membre supplémentaire.
 * On regarde le plan du créateur du groupe (l'admin originel).
 */
export async function assertCanAddMember(groupId: string): Promise<void> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      _count: { select: { members: true } },
    },
  });
  if (!group) throw Errors.notFound("Groupe introuvable");
  const { limits, planCode } = await getUserLimits(group.createdById);
  const max = limits.maxMembersPerGroup;
  if (max === -1 || max === undefined) return;
  if (group._count.members >= max) {
    planRequired(
      `${max} membres max par groupe sur ce plan`,
      "PREMIUM",
      planCode,
    );
  }
}

/**
 * Vérifie le quota OCR mensuel d'un user.
 * On compte les attachments d'images uploadés ce mois-ci.
 */
export async function assertCanUseOcr(userId: string): Promise<void> {
  const { limits, planCode } = await getUserLimits(userId);
  const max = limits.ocrPerMonth;
  if (max === -1 || max === undefined) return;
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const used = await prisma.expenseAttachment.count({
    where: {
      uploadedById: userId,
      createdAt: { gte: startOfMonth },
      mimeType: { startsWith: "image/" },
    },
  });
  if (used >= max) {
    planRequired(
      `${max} scans OCR/mois sur ce plan (utilisés : ${used})`,
      "PREMIUM",
      planCode,
    );
  }
}

/**
 * Vérifie qu'un user a accès à une feature booléenne (debtSwap, exportPdf, ...).
 */
export async function assertFeatureEnabled(
  userId: string,
  featureKey: string,
): Promise<void> {
  const { limits, planCode } = await getUserLimits(userId);
  if (limits[featureKey] === false) {
    planRequired(featureKey, "PREMIUM", planCode);
  }
}
