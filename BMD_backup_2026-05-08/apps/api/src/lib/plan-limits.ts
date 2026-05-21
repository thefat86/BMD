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

  // Sprint AB · on récupère aussi les champs de trial. Si un trial est actif
  // (trialEndsAt > now), on charge les limites du trialPlanCode au lieu du
  // planCode normal. Lazy revert : pas de cron à faire — quand le trial
  // expire naturellement, ce check renverra les limites du plan de base.
  // (prisma as any) cast tant que le client Prisma n'est pas régénéré
  // après la migration v32_premium_trial — pattern identique à V30.
  const user = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: {
      planCode: true,
      trialPlanCode: true,
      trialEndsAt: true,
      defaultCurrency: true,
    },
  });
  if (!user) throw Errors.notFound("On ne retrouve pas ton compte 🤔");

  // Détermine le plan effectif : trial actif ? sinon plan de base.
  const trialActive =
    user.trialPlanCode &&
    user.trialEndsAt &&
    new Date(user.trialEndsAt).getTime() > Date.now();
  const effectiveCode = trialActive ? user.trialPlanCode : user.planCode;

  const plan = await prisma.plan.findUnique({
    where: { code: effectiveCode },
  });
  // Fallback sur les limites du plan FREE si le plan référencé n'existe plus
  const baseLimits =
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

  // Sprint AC-3 · Override régional (PlanPriceTier.limitsOverride).
  // On déduit la région du user via sa defaultCurrency. Si un tier régional
  // existe avec un limitsOverride, ces clés écrasent celles du plan parent
  // (deep merge à un niveau — les clés non-spécifiées héritent). Ainsi on
  // peut offrir 4 réunions/mois en AFRICA_FR pour le même prix régionalisé.
  let limits = baseLimits;
  try {
    const regions = await prisma.region.findMany({
      where: { isActive: true },
      select: { code: true, defaultCurrency: true },
    });
    const userRegion =
      regions.find(
        (r) =>
          r.defaultCurrency.toUpperCase() ===
          (user.defaultCurrency ?? "EUR").toUpperCase(),
      ) ?? regions.find((r) => r.code === "EUROPE_NA");
    if (userRegion) {
      const tier = (await (prisma as any).planPriceTier.findUnique({
        where: {
          planCode_regionCode: {
            planCode: effectiveCode,
            regionCode: userRegion.code,
          },
        },
        select: { limitsOverride: true },
      })) as { limitsOverride: Record<string, any> | null } | null;
      if (tier?.limitsOverride && typeof tier.limitsOverride === "object") {
        limits = { ...baseLimits, ...tier.limitsOverride };
      }
    }
  } catch {
    // Si le client Prisma n'est pas encore régénéré post-migration v34,
    // ou si Region/PlanPriceTier n'existe pas, on retombe silencieusement
    // sur les limites du plan parent. C'est dégradé mais fonctionnel.
  }

  const fresh: CachedLimits = {
    limits,
    planCode: effectiveCode,
    loadedAt: Date.now(),
  };
  cache.set(userId, fresh);
  return fresh;
}

export function invalidatePlanCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

// ============================================================
// Catalogue de noms humains pour les features
// (utilisés dans les messages d'erreur)
// ============================================================
const FEATURE_LABELS: Record<string, { name: string; emoji: string }> = {
  whatsappBot: { name: "le bot WhatsApp", emoji: "💬" },
  multiCurrency: { name: "le multi-devises", emoji: "💱" },
  debtSwap: { name: "la compensation de dettes (swap)", emoji: "🔄" },
  exportPdfExcel: { name: "l'export PDF / Excel", emoji: "📄" },
  taxReceipt: { name: "les reçus fiscaux", emoji: "🧾" },
  twoFactor: { name: "la double authentification", emoji: "🔐" },
  customRoles: { name: "les rôles admin personnalisés", emoji: "🛡️" },
  realtime: { name: "la synchronisation temps réel", emoji: "⚡" },
};

function featureLabel(key: string): string {
  const f = FEATURE_LABELS[key];
  if (f) return `${f.name} ${f.emoji}`;
  return key;
}

// ============================================================
// Asserts métier — chacune lève une erreur "plan_required" parlante
// ============================================================

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
    throw Errors.planRequired({
      feature: "créer un groupe supplémentaire",
      why: `Tu as déjà ${count} groupes, et la formule ${planCode === "FREE" ? "Découverte (gratuite)" : planCode} en autorise ${max} maximum.`,
      required: "PREMIUM",
      current: planCode,
    });
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
  if (!group) throw Errors.notFound("Ce groupe est introuvable 🤔");
  const { limits, planCode } = await getUserLimits(group.createdById);
  const max = limits.maxMembersPerGroup;
  if (max === -1 || max === undefined) return;
  if (group._count.members >= max) {
    throw Errors.planRequired({
      feature: "ajouter un membre de plus à ce groupe",
      why: `La formule ${planCode === "FREE" ? "Découverte" : planCode} de l'admin du groupe limite à ${max} membres par groupe (vous êtes ${group._count.members}).`,
      required: "PREMIUM",
      current: planCode,
    });
  }
}

/**
 * Vérifie le quota OCR mensuel d'un user, avec fallback sur le plan de
 * l'admin du groupe si fourni (spec §6.3 / refonte AB).
 *
 * Politique :
 *   1. On déduit d'abord du quota PERSONNEL de l'user (les 5 premiers scans
 *      d'un FREE comptent toujours sur son quota perso, peu importe où il
 *      scanne — de manière à ce qu'il « ressente » sa limite et soit incité
 *      à upgrader).
 *   2. Quand le quota perso est épuisé, on regarde si le scan a lieu dans
 *      le contexte d'un groupe (`groupId` fourni). Si l'admin du groupe a
 *      un plan avec OCR illimité, on autorise — c'est l'admin payeur qui
 *      « offre » les scans à ses membres dans son workspace.
 *   3. Hors-groupe ou groupe avec admin FREE → erreur quota_reached avec
 *      CTA upgrade.
 *
 * Anti-fraude : on ne regarde QUE l'admin du groupe (pas un membre payant
 * lambda) pour éviter qu'un user payant invite des amis qui veulent juste
 * profiter de ses scans illimités sans rejoindre un vrai groupe collaboratif.
 */
export async function assertCanUseOcr(
  userId: string,
  groupId?: string,
): Promise<void> {
  const { limits, planCode } = await getUserLimits(userId);
  const max = limits.ocrPerMonth;
  if (max === -1 || max === undefined) return; // user a un plan illimité

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

  // Quota perso encore dispo → on autorise et on déduit
  if (used < max) return;

  // Quota perso épuisé : fallback sur le plan de l'admin du groupe si fourni
  if (groupId) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { createdById: true },
    });
    if (group?.createdById) {
      const adminLimits = await getUserLimits(group.createdById);
      // L'admin a OCR illimité → couvert par son plan dans son groupe
      if (adminLimits.limits.ocrPerMonth === -1) return;
    }
  }

  // Aucun fallback possible → quota atteint, prompt upgrade
  throw Errors.quotaReached({
    feature: "scans de tickets",
    used,
    max,
    resetInfo: "le 1er du mois prochain",
    upgradeTo: planCode === "FREE" ? "PREMIUM" : "COMMUNITY",
  });
}

/**
 * Retourne l'état de consommation OCR d'un user (pour affichage du compteur
 * sur le dashboard et le formulaire de scan).
 *
 * `coveredByGroupAdmin` indique si l'user a la possibilité de continuer à
 * scanner dans des groupes payants même après avoir épuisé son quota perso
 * (utile pour afficher un message rassurant au lieu d'un blocage abrupt).
 */
export async function getOcrUsage(userId: string): Promise<{
  used: number;
  max: number; // -1 = illimité
  resetsAt: string; // ISO date du 1er du mois prochain
  planCode: string;
  hasPaidGroup: boolean; // true si l'user est membre d'au moins un groupe avec admin payant
  trialEligible: boolean; // true si l'user peut activer un trial 14j Premium (pas déjà utilisé, plan FREE)
  trialActive: boolean;
  trialEndsAt: string | null; // ISO si trial actif
}> {
  const { limits, planCode } = await getUserLimits(userId);
  const max = limits.ocrPerMonth ?? 5;
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const used = max === -1
    ? 0
    : await prisma.expenseAttachment.count({
        where: {
          uploadedById: userId,
          createdAt: { gte: startOfMonth },
          mimeType: { startsWith: "image/" },
        },
      });
  const resetsAt = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    1,
  ).toISOString();

  // Cherche si l'user est membre d'un groupe dont l'admin a OCR illimité
  // (utile pour le frontend : « tu pourras continuer à scanner dans le groupe X »)
  let hasPaidGroup = false;
  if (max !== -1) {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { group: { select: { createdById: true } } },
    });
    for (const m of memberships) {
      if (!m.group.createdById) continue;
      const adminLimits = await getUserLimits(m.group.createdById);
      if (adminLimits.limits.ocrPerMonth === -1) {
        hasPaidGroup = true;
        break;
      }
    }
  }

  // Sprint AB · Trial 14j Premium : eligible si pas déjà utilisé ET sur FREE
  const trialUser = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: {
      trialUsedAt: true,
      trialEndsAt: true,
      trialPlanCode: true,
      planCode: true,
    },
  });
  const trialActive =
    !!trialUser?.trialEndsAt &&
    new Date(trialUser.trialEndsAt).getTime() > Date.now();
  const trialEligible =
    !trialActive &&
    !trialUser?.trialUsedAt &&
    trialUser?.planCode === "FREE";

  return {
    used,
    max,
    resetsAt,
    planCode,
    hasPaidGroup,
    trialEligible: !!trialEligible,
    trialActive,
    trialEndsAt: trialActive
      ? new Date(trialUser.trialEndsAt).toISOString()
      : null,
  };
}

/**
 * Active un trial 14 jours du plan PREMIUM (one-shot par user, anti-fraude).
 * Lève une erreur si l'user a déjà utilisé son trial ou n'est plus FREE.
 */
export async function startPremiumTrial(userId: string): Promise<{
  trialPlanCode: string;
  trialEndsAt: string;
}> {
  const user = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { planCode: true, trialUsedAt: true, trialEndsAt: true },
  });
  if (!user) throw Errors.notFound("On ne retrouve pas ton compte 🤔");

  if (user.trialUsedAt) {
    throw Errors.badRequest(
      "Tu as déjà utilisé ton essai gratuit Premium — passe à un forfait payant pour débloquer toutes les fonctionnalités.",
    );
  }
  if (user.planCode !== "FREE") {
    throw Errors.badRequest(
      "L'essai gratuit est réservé aux utilisateurs Découverte. Tu as déjà un forfait actif.",
    );
  }

  const now = new Date();
  const ends = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // +14 jours
  await (prisma as any).user.update({
    where: { id: userId },
    data: {
      trialPlanCode: "PREMIUM",
      trialEndsAt: ends,
      trialUsedAt: now,
    },
  });
  // Invalider le cache pour que le user voie immédiatement les nouvelles limites
  invalidatePlanCache(userId);
  return { trialPlanCode: "PREMIUM", trialEndsAt: ends.toISOString() };
}

// ============================================================
// Sprint AC-2 · Réunions enregistrées (procès-verbaux audio)
// ============================================================

/**
 * Politique meetings (spec AC-2 §11.4) :
 *   FREE       → 0 (paywall direct)
 *   PREMIUM    → 1/mois inclus, 2,99 € l'addon
 *   COMMUNITY  → 4/mois inclus, 1,99 € l'addon
 *   PARISH     → ∞
 *   EVENT      → 2 inclus sur le 1-shot, 2,99 € l'addon
 *
 * Le quota se compte sur l'admin du groupe (= celui qui paie).
 * Un membre invité d'un groupe COMMUNITY peut donc enregistrer une
 * réunion même s'il est lui-même FREE — c'est l'admin qui « offre » le
 * service dans son workspace, comme pour les scans OCR.
 */
export interface MeetingQuotaState {
  used: number;
  max: number; // -1 = illimité
  planCode: string;
  /** Coût en centimes EUR pour l'addon — 0 si plan illimité ou si on est encore dans le quota */
  addonCents: number;
  /** Si true, l'utilisateur peut enregistrer mais on lui facturera l'addon */
  willChargeAddon: boolean;
  /** ISO date du début du mois prochain (info pour l'UI) */
  resetsAt: string;
  /** Sprint AC-3 · Durée max d'une réunion (secondes). Hard cap. */
  maxDurationSeconds: number;
  /** Sprint AC-3 · Seuil d'avertissement (secondes) pour le timer UI. */
  warnAtSeconds: number;
  /** Sprint AC-3 · Durée max d'une preuve audio attachée (secondes). */
  audioProofMaxSeconds: number;
}

/**
 * Récupère l'état d'usage des meetings pour un user (= admin du groupe).
 * On compte les MeetingRecord créés par ce user dans le mois civil courant,
 * tous statuts confondus sauf CANCELLED (un brouillon abandonné ne compte pas).
 */
export async function getMeetingUsage(
  adminUserId: string,
): Promise<MeetingQuotaState> {
  const { limits, planCode } = await getUserLimits(adminUserId);
  const max = (limits.meetingsPerMonth ?? 0) as number;
  const addonCents = (limits.meetingAddonCents ?? 0) as number;
  // Sprint AC-3 · durées (configurable plan + override régional)
  const maxDurationSeconds = (limits.meetingMaxDurationSeconds ?? 3600) as number;
  const warnAtSeconds = (limits.meetingWarnAtSeconds ?? 3000) as number;
  const audioProofMaxSeconds = (limits.audioProofMaxSeconds ?? 300) as number;

  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const resetsAt = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    1,
  ).toISOString();

  if (max === -1) {
    return {
      used: 0,
      max: -1,
      planCode,
      addonCents: 0,
      willChargeAddon: false,
      resetsAt,
      maxDurationSeconds,
      warnAtSeconds,
      audioProofMaxSeconds,
    };
  }

  const used = await (prisma as any).meetingRecord.count({
    where: {
      createdById: adminUserId,
      createdAt: { gte: startOfMonth },
      status: { not: "CANCELLED" },
    },
  });

  const willChargeAddon = used >= max && addonCents > 0;
  return {
    used,
    max,
    planCode,
    addonCents,
    willChargeAddon,
    resetsAt,
    maxDurationSeconds,
    warnAtSeconds,
    audioProofMaxSeconds,
  };
}

/**
 * Vérifie qu'un groupe peut héberger une nouvelle réunion enregistrée.
 *
 * Règles :
 *   - Si l'admin du groupe a meetingsPerMonth=0 → bloqué (paywall direct).
 *   - Si quota dispo → autorisé sans coût additionnel.
 *   - Si quota épuisé MAIS addon configuré → autorisé, on retournera
 *     `addonCents` au caller pour qu'il facture (option `acceptAddon=true`
 *     pour confirmer que l'utilisateur est OK avec le surcoût).
 *   - Si quota épuisé ET pas d'addon → bloqué (PARISH ou plan ad hoc).
 *
 * @param groupId Le groupe dans lequel on veut créer la réunion
 * @param acceptAddon Si true, on autorise même au-delà du quota tant qu'il
 *                    existe un addon (le caller s'engage à facturer)
 */
export async function assertCanCreateMeeting(
  groupId: string,
  acceptAddon: boolean,
): Promise<{ addonCents: number; usage: MeetingQuotaState }> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { createdById: true, name: true },
  });
  if (!group) throw Errors.notFound("Ce groupe est introuvable 🤔");

  const usage = await getMeetingUsage(group.createdById);

  // Plan qui n'autorise pas du tout les réunions (FREE)
  if (usage.max === 0) {
    throw Errors.planRequired({
      feature: "enregistrer une réunion",
      why: `La formule ${usage.planCode === "FREE" ? "Découverte (gratuite)" : usage.planCode} de l'admin du groupe ne donne pas accès aux procès-verbaux audio. Active Premium pour enregistrer 1 réunion par mois.`,
      required: "PREMIUM",
      current: usage.planCode,
    });
  }

  // Plan illimité → tout est offert
  if (usage.max === -1) return { addonCents: 0, usage };

  // Quota encore dispo
  if (usage.used < usage.max) return { addonCents: 0, usage };

  // Quota épuisé mais addon configuré
  if (usage.willChargeAddon) {
    if (!acceptAddon) {
      throw Errors.quotaReached({
        feature: "réunions enregistrées",
        used: usage.used,
        max: usage.max,
        resetInfo: "le 1er du mois prochain",
        upgradeTo: usage.planCode === "PREMIUM" ? "COMMUNITY" : "PARISH",
        addonCents: usage.addonCents,
      });
    }
    return { addonCents: usage.addonCents, usage };
  }

  // Quota épuisé sans addon (cas théorique, prévu pour évoluer)
  throw Errors.quotaReached({
    feature: "réunions enregistrées",
    used: usage.used,
    max: usage.max,
    resetInfo: "le 1er du mois prochain",
    upgradeTo: "PARISH",
  });
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
    throw Errors.planRequired({
      feature: `utiliser ${featureLabel(featureKey)}`,
      why: `Cette fonctionnalité n'est pas incluse dans la formule ${planCode === "FREE" ? "Découverte (gratuite)" : planCode}.`,
      required: "PREMIUM",
      current: planCode,
    });
  }
}
