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
import {
  getRemainingBoosterScans,
} from "./booster-service.js";
// V213 — Mode test global qui débloque toutes les capacités de plan pour
// les tests internes. À retirer une fois la phase de test terminée.
import { isTestModeActive, UNLIMITED_TEST_LIMITS } from "./test-mode.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedLimits {
  limits: Record<string, any>;
  planCode: string;
  loadedAt: number;
}

const cache = new Map<string, CachedLimits>();

async function getUserLimits(userId: string): Promise<CachedLimits> {
  // V213 — Mode test global : si le flag SiteConfig.testModeEnabled est ON,
  // tous les users reçoivent des limites illimitées (toutes les capacités
  // activées). Aucun gate métier ne bloque, AUCUN check downstream n'est
  // déclenché (puisque les valeurs renvoyées sont toutes -1 ou true).
  // On ne cache PAS quand testMode actif : sinon désactivation = délai 5min.
  if (await isTestModeActive()) {
    return {
      limits: { ...UNLIMITED_TEST_LIMITS },
      planCode: "TEST_MODE",
      loadedAt: Date.now(),
    };
  }

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
 * V202 — Vérifie qu'un user peut créer une nouvelle Caisse Projet.
 * Compte les caisses ACTIVE/DRAFT créées par cet user vs projectFundsMax.
 * Les caisses CLOSED/ARCHIVED ne comptent pas (l'argent a été dépensé,
 * l'historique reste mais le user a "libéré" un slot).
 */
export async function assertCanCreateProjectFund(
  userId: string,
): Promise<void> {
  const { limits, planCode } = await getUserLimits(userId);
  const max = (limits as any).projectFundsMax as number | undefined;
  if (max === -1 || max === undefined) return; // illimité (PRO, etc.)
  const activeCount = await prisma.projectFund.count({
    where: {
      createdByUserId: userId,
      status: { in: ["ACTIVE", "DRAFT"] },
    },
  });
  if (activeCount >= max) {
    throw Errors.planRequired({
      feature: "créer une caisse projet supplémentaire",
      why: `Tu as déjà ${activeCount} caisse${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}, et la formule ${planCode === "FREE" ? "Découverte (gratuite)" : planCode} en autorise ${max} maximum. Clôture une caisse existante ou passe à un plan supérieur.`,
      required: planCode === "FREE" ? "PERSONAL" : "FAMILY",
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
  // V78 — Décompte au SCAN, plus à la création d'expense. On compte les
  // UsageEvent kind=OCR_SCAN du mois (loggés à chaque appel OCR, qu'il y
  // ait création d'expense derrière ou non). Empêche l'abus du user qui
  // scanne plusieurs fois sans valider — chaque scan engage déjà des coûts
  // chez OpenAI/Mindee donc doit décrémenter le quota.
  //
  // Fallback : si la table UsageEvent n'existe pas encore (migration V72
  // pas appliquée), on retombe sur l'ancien comptage ExpenseAttachment.
  let used = 0;
  try {
    used = await (prisma as any).usageEvent.count({
      where: {
        userId,
        kind: "OCR_SCAN",
        createdAt: { gte: startOfMonth },
      },
    });
  } catch {
    // Fallback historique (avant V78) : count ExpenseAttachment images
    used = await prisma.expenseAttachment.count({
      where: {
        uploadedById: userId,
        createdAt: { gte: startOfMonth },
        mimeType: { startsWith: "image/" },
      },
    });
  }

  // Quota perso encore dispo → on autorise et on déduit
  if (used < max) return;

  // V47 · Quota perso épuisé : on regarde si l'user a des scans Booster
  // restants (achetés via Pack IA Booster 4,99 €). Le scan sera consommé
  // côté ocr.routes via consumeBoosterScan() après succès du scan.
  const boosterRemaining = await getRemainingBoosterScans(userId);
  if (boosterRemaining > 0) return;

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
  // V46 · nouveau mapping upgradeTo : Free→PERSONAL, PERSONAL→FAMILY, FAMILY→PRO
  const upgradeMap: Record<string, string> = {
    FREE: "PERSONAL",
    PERSONAL: "FAMILY",
    PREMIUM: "PERSONAL", // legacy
    FAMILY: "PRO",
    COMMUNITY: "PRO", // legacy
    LIFETIME_PERSONAL: "FAMILY",
  };
  throw Errors.quotaReached({
    feature: "scans IA",
    used,
    max,
    resetInfo: "le 1er du mois prochain",
    upgradeTo: upgradeMap[planCode] ?? "PERSONAL",
  });
}

/**
 * V46 · Retourne le tier IA du plan effectif du user.
 * Utilisé par ocr.routes pour passer le bon pipeline à scanReceiptFile.
 * Si l'user n'a pas de tier défini (anciens plans), on retombe sur economy
 * pour éviter de griller les coûts Mindee.
 */
export async function getUserIaTier(
  userId: string,
): Promise<"economy" | "standard" | "premium"> {
  const { limits } = await getUserLimits(userId);
  const tier = limits.iaPipelineTier;
  if (tier === "premium" || tier === "standard" || tier === "economy") {
    return tier;
  }
  return "economy";
}

/**
 * V47 · Vérifie qu'un user peut utiliser la transcription voix premium
 * (OpenAI Whisper). Politique similaire à assertCanUseOcr :
 *   - Quota perso (voicePerMonth depuis Plan.limits) consommé en priorité
 *   - Si épuisé et groupId fourni → fallback sur le plan de l'admin du groupe
 *   - Sinon → 402 paywall avec upgrade prompt
 *
 * On compte une utilisation par ExpenseAttachment AUDIO_PROOF avec
 * transcript non-null créé ce mois-ci (= l'API Whisper a été appelée
 * une fois pour cet attachment).
 *
 * Les transcripts existants persistés en BDD ne consomment PAS un nouveau
 * quota (on ne re-transcrit pas un audio déjà transcrit).
 */
export async function assertCanUseVoice(
  userId: string,
  groupId?: string,
): Promise<void> {
  const { limits, planCode } = await getUserLimits(userId);
  const max = limits.voicePerMonth;
  if (max === -1 || max === undefined) return; // illimité (Famille / Pro)
  if (max === 0) {
    // Plan Free → bloqué d'office, upgrade prompt
    throw Errors.quotaReached({
      feature: "transcriptions voix premium",
      used: 0,
      max: 0,
      resetInfo: "passe à Perso pour 20/mois",
      upgradeTo: "PERSONAL",
    });
  }

  // Compte les transcriptions Whisper consommées ce mois (par utilisateur uploader)
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  let used = 0;
  try {
    used = await prisma.expenseAttachment.count({
      where: {
        uploadedById: userId,
        createdAt: { gte: startOfMonth },
        kind: "AUDIO_PROOF",
        transcript: { not: null },
      },
    });
  } catch {
    // Si la colonne transcript n'existe pas (avant migration AC-2), on
    // compte juste les AUDIO_PROOF (best-effort)
    used = 0;
  }

  if (used < max) return;

  // Fallback admin de groupe (idem OCR)
  if (groupId) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { createdById: true },
      });
      if (group?.createdById) {
        const adminLimits = await getUserLimits(group.createdById);
        if (adminLimits.limits.voicePerMonth === -1) return;
      }
    } catch {
      // best-effort
    }
  }

  const upgradeMap: Record<string, string> = {
    FREE: "PERSONAL",
    PERSONAL: "FAMILY",
    PREMIUM: "FAMILY",
    FAMILY: "PRO",
    COMMUNITY: "PRO",
    LIFETIME_PERSONAL: "FAMILY",
  };
  throw Errors.quotaReached({
    feature: "transcriptions voix premium",
    used,
    max,
    resetInfo: "le 1er du mois prochain",
    upgradeTo: upgradeMap[planCode] ?? "FAMILY",
  });
}

/**
 * V47 · Retourne l'état de consommation voix pour affichage UI.
 */
export async function getVoiceUsage(userId: string): Promise<{
  used: number;
  max: number;
  resetsAt: string;
}> {
  const { limits } = await getUserLimits(userId);
  const max = (limits.voicePerMonth as number) ?? 0;
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const nextMonth = new Date(startOfMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  let used = 0;
  try {
    used = await prisma.expenseAttachment.count({
      where: {
        uploadedById: userId,
        createdAt: { gte: startOfMonth },
        kind: "AUDIO_PROOF",
        transcript: { not: null },
      },
    });
  } catch {
    used = 0;
  }
  return {
    used,
    max,
    resetsAt: nextMonth.toISOString(),
  };
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
  // V78 — Source de vérité = UsageEvent (1 ligne par scan effectivement
  // appelé chez le provider IA), pas ExpenseAttachment. Le user voit
  // ainsi un décompte qui reflète vraiment sa consommation IA, peu importe
  // s'il a validé chaque scan en dépense ou pas.
  let used = 0;
  if (max !== -1) {
    try {
      used = await (prisma as any).usageEvent.count({
        where: {
          userId,
          kind: "OCR_SCAN",
          createdAt: { gte: startOfMonth },
        },
      });
    } catch {
      // Fallback (avant migration V72) : ExpenseAttachment
      used = await prisma.expenseAttachment.count({
        where: {
          uploadedById: userId,
          createdAt: { gte: startOfMonth },
          mimeType: { startsWith: "image/" },
        },
      });
    }
  }
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

// ============================================================
// V77 — Photo de profil visible aux autres membres
// ============================================================
// Politique : FREE → photo PAS visible aux autres (les autres voient juste
// les initiales colorées). Plans payants → photo visible. L'user voit
// toujours sa propre photo (le filtre s'applique uniquement aux responses
// qui exposent les membres d'un groupe à un tiers).
//
// Le helper renvoie true si le user a `profilePhotoVisible: true` dans son
// plan effectif. Default: true pour ne pas casser les plans legacy sans
// la clé explicite (sécurité par opt-out pour FREE uniquement).

/**
 * V77 — true si le user a la capability "photo visible aux autres".
 * Default true si la clé est absente du plan (rétro-compat) — seul FREE
 * est explicitement à false dans seed-plans.
 */
export async function isUserPhotoVisible(userId: string): Promise<boolean> {
  const { limits } = await getUserLimits(userId);
  return limits.profilePhotoVisible !== false;
}

/**
 * V77 — Batch helper pour filtrer les avatars d'une liste de users.
 * Retourne une Map<userId, boolean> indiquant si chaque user peut être
 * affiché avec sa photo aux autres membres. Utilisé dans les responses
 * qui exposent N membres d'un groupe pour éviter N+1 queries.
 *
 * Stratégie : on appelle getUserLimits() pour chaque user (déjà cachée
 * 5 min en mémoire), donc batch O(N) sur cold cache, O(1) une fois chaud.
 * Acceptable car les groupes ont rarement > 50 membres et le cache absorbe
 * les requêtes répétées.
 */
export async function getPhotoVisibilityMap(
  userIds: readonly string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  // Déduplique pour éviter des appels redondants (un même user peut
  // apparaître plusieurs fois si on passe les payers d'expenses dupliqués)
  const unique = Array.from(new Set(userIds));
  // En parallèle car getUserLimits est essentiellement une query Prisma
  // par user. On capte les erreurs individuelles pour ne pas faire planter
  // toute la response si UN user n'existe plus (cas migration / suppression).
  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const visible = await isUserPhotoVisible(id);
        return [id, visible] as const;
      } catch {
        // En cas d'erreur (user supprimé, plan introuvable), default true
        // pour ne pas casser l'UI. Le rendu retombera juste sur les initiales
        // si le user n'a effectivement pas de photo.
        return [id, true] as const;
      }
    }),
  );
  for (const [id, v] of results) {
    map.set(id, v);
  }
  return map;
}

/**
 * V77 — Helper utilitaire : applique le filtre photo sur un avatar selon
 * la visibilité du user. Garde une signature simple pour usage inline
 * dans les transformations Prisma → DTO.
 *
 * Usage:
 *   const map = await getPhotoVisibilityMap(memberUserIds);
 *   members.map((m) => ({
 *     ...m,
 *     avatar: filterPhotoByPlan(m.userId, m.avatar, map),
 *   }));
 */
export function filterPhotoByPlan(
  userId: string,
  avatar: string | null | undefined,
  visibilityMap: Map<string, boolean>,
): string | null {
  if (!avatar) return null;
  const visible = visibilityMap.get(userId);
  // Si l'user n'est pas dans la map (oublié dans l'appel batch), default
  // visible: true pour ne pas casser l'UI. Mieux vaut une fuite mineure
  // qu'une régression UX (l'utilisateur du plan payant ne verrait pas
  // sa photo s'afficher dans les autres écrans).
  if (visible === false) return null;
  return avatar;
}
