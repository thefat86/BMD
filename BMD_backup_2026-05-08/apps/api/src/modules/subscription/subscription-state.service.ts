/**
 * Service Subscription State (spec §6.3 — gestion downgrade Premium).
 *
 * Modèle "grace period + read-only" inspiré de Notion / Slack Free :
 *
 *   1. Paiement échoue → on passe ACTIVE → GRACE (graceDays = 14j par défaut)
 *      Pendant la grâce, le user garde Premium intégral.
 *
 *   2. Grâce expire → GRACE → WARN (warnDays = 7j par défaut)
 *      Pendant le warn, on AFFICHE un bandeau "votre surcapacité passera en
 *      lecture seule dans X jours" mais l'utilisateur peut encore tout faire.
 *
 *   3. Warn expire → WARN → DOWNGRADED
 *      On sélectionne les groupes au-delà du quota FREE (les plus anciens
 *      en activité — plus l'utilisateur est attaché, plus on protège ces
 *      groupes-là). On stocke leurs IDs dans lockedGroupIds.
 *      Côté gating (assertCanAddExpense, assertCanAddMember) on regarde
 *      cette liste pour bloquer l'écriture sur ces groupes.
 *
 *   4. Re-paiement → DOWNGRADED → ACTIVE
 *      lockedGroupIds vidé, le user retrouve toutes ses fonctionnalités.
 *
 * Tous les paramètres (graceDays / warnDays / enabled) sont configurables
 * en admin via PlanDowngradePolicy → on les recharge à chaque tick scheduler.
 */
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const POLICY_CACHE_TTL_MS = 60_000;
let policyCache: {
  graceDays: number;
  warnDays: number;
  enabled: boolean;
  notifyBeforeDays: number[];
  loadedAt: number;
} | null = null;

async function getPolicy() {
  if (policyCache && Date.now() - policyCache.loadedAt < POLICY_CACHE_TTL_MS) {
    return policyCache;
  }
  const row = await prisma.planDowngradePolicy.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  const fresh = {
    graceDays: row.graceDays,
    warnDays: row.warnDays,
    enabled: row.enabled,
    notifyBeforeDays: Array.isArray(row.notifyBeforeDays)
      ? (row.notifyBeforeDays as number[])
      : [7, 3, 1],
    loadedAt: Date.now(),
  };
  policyCache = fresh;
  return fresh;
}

/** Force le rechargement de la policy (à appeler après update admin). */
export function invalidatePolicyCache(): void {
  policyCache = null;
}

/**
 * Charge l'état de souscription d'un user (créé à la volée si inexistant).
 */
export async function getOrInitSubscriptionState(userId: string) {
  return prisma.subscriptionState.upsert({
    where: { userId },
    create: { userId, status: "ACTIVE" },
    update: {},
  });
}

/**
 * Marque une souscription comme expirée (paiement échoué / Stripe webhook
 * `invoice.payment_failed`). Démarre le compteur de grâce.
 *
 * Idempotent : si déjà en GRACE/WARN/DOWNGRADED, ne touche pas aux dates.
 */
export async function markSubscriptionExpired(input: {
  userId: string;
  /** Date d'expiration officielle (= fin de la dernière période payée) */
  expiresAt: Date;
}): Promise<void> {
  const policy = await getPolicy();
  if (!policy.enabled) return;

  const existing = await getOrInitSubscriptionState(input.userId);
  // Déjà en pipeline downgrade : on ne ré-écrit pas (anti boucles).
  if (
    existing.status !== "ACTIVE" &&
    existing.status !== "CANCELLED"
  ) {
    return;
  }

  const graceEndsAt = new Date(
    input.expiresAt.getTime() + policy.graceDays * 24 * 3600 * 1000,
  );
  const readOnlyAt = new Date(
    graceEndsAt.getTime() + policy.warnDays * 24 * 3600 * 1000,
  );

  // Récupère le plan actuel pour pouvoir le restaurer au paiement
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { planCode: true },
  });

  await prisma.subscriptionState.update({
    where: { userId: input.userId },
    data: {
      status: "GRACE",
      planCodeReference: user?.planCode ?? "FREE",
      expiresAt: input.expiresAt,
      graceEndsAt,
      readOnlyAt,
    },
  });
}

/**
 * Marque une souscription comme renouvelée (paiement réussi). Restaure
 * tout : status=ACTIVE, lockedGroupIds vidé, planCode restauré au plan
 * de référence.
 */
export async function markSubscriptionRenewed(input: {
  userId: string;
  /** Nouvelle date d'expiration (= début + période payée) */
  newExpiresAt: Date;
}): Promise<void> {
  const state = await prisma.subscriptionState.findUnique({
    where: { userId: input.userId },
  });
  if (!state) {
    // Création directe si pas encore d'état (1er paiement)
    await prisma.subscriptionState.create({
      data: {
        userId: input.userId,
        status: "ACTIVE",
        expiresAt: input.newExpiresAt,
      },
    });
    return;
  }

  // Restaure le plan d'origine si on était downgradé
  if (state.status === "DOWNGRADED" || state.status === "WARN") {
    await prisma.user.update({
      where: { id: input.userId },
      data: { planCode: state.planCodeReference },
    });
  }

  await prisma.subscriptionState.update({
    where: { userId: input.userId },
    data: {
      status: "ACTIVE",
      expiresAt: input.newExpiresAt,
      graceEndsAt: null,
      readOnlyAt: null,
      lockedGroupIds: [],
      lastNotifiedKind: null,
      lastNotifiedAt: null,
    },
  });
}

/**
 * Tick périodique (scheduler) qui fait avancer les souscriptions selon
 * l'horloge. À appeler 1x par heure. Idempotent.
 *
 *   ACTIVE  + expiresAt < now  → ne fait rien (markSubscriptionExpired
 *                                 sera appelé par le webhook Stripe)
 *   GRACE   + graceEndsAt < now → bascule en WARN
 *   WARN    + readOnlyAt < now  → bascule en DOWNGRADED + verrouille
 *                                 les groupes au-delà du quota FREE
 */
export async function tickSubscriptionStates(): Promise<{
  movedToWarn: number;
  movedToDowngraded: number;
}> {
  const policy = await getPolicy();
  if (!policy.enabled) {
    return { movedToWarn: 0, movedToDowngraded: 0 };
  }
  const now = new Date();

  // 1. GRACE → WARN (graceEndsAt dépassé)
  const toWarn = await prisma.subscriptionState.findMany({
    where: { status: "GRACE", graceEndsAt: { lte: now } },
    select: { userId: true },
  });
  for (const s of toWarn) {
    await prisma.subscriptionState.update({
      where: { userId: s.userId },
      data: { status: "WARN" },
    });
    // (TODO : notifier l'utilisateur via push/email)
  }

  // 2. WARN → DOWNGRADED (readOnlyAt dépassé)
  const toDown = await prisma.subscriptionState.findMany({
    where: { status: "WARN", readOnlyAt: { lte: now } },
    select: { userId: true },
  });
  let downgradedCount = 0;
  for (const s of toDown) {
    await applyDowngrade(s.userId);
    downgradedCount += 1;
  }

  return { movedToWarn: toWarn.length, movedToDowngraded: downgradedCount };
}

/**
 * Applique le downgrade effectif : passe le planCode du user à FREE et
 * sélectionne les groupes au-delà du quota FREE pour les verrouiller.
 *
 * Stratégie de sélection des groupes verrouillés :
 *  - On classe les groupes par activité (date du dernier expense ou settlement)
 *  - Les N plus récemment actifs sont KEPT (= maxGroups FREE par défaut 2)
 *  - Les autres sont verrouillés (read-only)
 *
 * Cela protège les groupes les plus utilisés et incite à upgrader pour
 * débloquer les anciens projets dormants.
 */
async function applyDowngrade(userId: string): Promise<void> {
  // Charge le plan FREE pour connaître son quota
  const freePlan = await prisma.plan.findUnique({ where: { code: "FREE" } });
  const maxGroups =
    typeof (freePlan?.limits as any)?.maxGroups === "number"
      ? ((freePlan?.limits as any).maxGroups as number)
      : 2;

  // Récupère tous les groupes du user, classés par activité (last expense)
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: {
      groupId: true,
      group: {
        select: {
          id: true,
          expenses: {
            select: { occurredAt: true },
            orderBy: { occurredAt: "desc" },
            take: 1,
          },
          createdAt: true,
        },
      },
    },
  });

  // Score = date de la dernière dépense, fallback createdAt du groupe
  const scored = memberships
    .map((m) => ({
      groupId: m.groupId,
      lastActivity:
        m.group.expenses[0]?.occurredAt ?? m.group.createdAt,
    }))
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

  // Les `maxGroups` premiers sont KEPT, les autres VERROUILLÉS
  const keptIds = new Set(scored.slice(0, maxGroups).map((s) => s.groupId));
  const lockedIds = scored
    .filter((s) => !keptIds.has(s.groupId))
    .map((s) => s.groupId);

  // Bascule : User.planCode → FREE, lockedGroupIds posés
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { planCode: "FREE" },
    }),
    prisma.subscriptionState.update({
      where: { userId },
      data: {
        status: "DOWNGRADED",
        lockedGroupIds: lockedIds as any,
      },
    }),
  ]);
}

/**
 * Vérifie qu'un groupe n'est pas verrouillé (read-only) suite à un
 * downgrade. À appeler dans les routes d'écriture (ajout dépense, invite,
 * tontine).
 *
 * Le groupe est verrouillé pour TOUS ses membres si le créateur du groupe
 * est en DOWNGRADED ET que ce groupe est dans sa lockedGroupIds.
 *
 * Logique : on prend la perspective du créateur (= admin originel) — c'est
 * son plan qui dicte le quota. Si lui downgrade, ses groupes au-delà du
 * quota FREE sont gelés pour tout le monde.
 */
export async function assertGroupNotLocked(groupId: string): Promise<void> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { createdById: true, name: true },
  });
  if (!group) return; // Errors.notFound est levé ailleurs

  const state = await prisma.subscriptionState.findUnique({
    where: { userId: group.createdById },
  });
  if (!state) return;
  if (state.status !== "DOWNGRADED") return;

  const locked = (state.lockedGroupIds as string[]) ?? [];
  if (locked.includes(groupId)) {
    throw Errors.planRequired({
      feature: `écrire dans le groupe « ${group.name} »`,
      why: `Le créateur de ce groupe est passé en formule Découverte. Ce groupe est en lecture seule jusqu'à ce qu'il repasse en Premium ou libère une autre slot.`,
      required: "PREMIUM",
      current: "FREE",
    });
  }
}

/**
 * Liste les groupes verrouillés du user courant (pour l'UI : afficher un
 * bandeau "🔒 Ce groupe est verrouillé").
 */
export async function getLockedGroupsForUser(userId: string): Promise<string[]> {
  const state = await prisma.subscriptionState.findUnique({
    where: { userId },
  });
  if (!state || state.status !== "DOWNGRADED") return [];
  return (state.lockedGroupIds as string[]) ?? [];
}

/**
 * Renvoie la situation actuelle pour affichage UI (bandeau profil + dashboard).
 */
export async function getUserSubscriptionInfo(userId: string): Promise<{
  status: string;
  expiresAt: string | null;
  graceEndsAt: string | null;
  readOnlyAt: string | null;
  daysUntilWarn: number | null;
  daysUntilReadOnly: number | null;
  lockedGroupCount: number;
}> {
  const state = await prisma.subscriptionState.findUnique({
    where: { userId },
  });
  if (!state) {
    return {
      status: "ACTIVE",
      expiresAt: null,
      graceEndsAt: null,
      readOnlyAt: null,
      daysUntilWarn: null,
      daysUntilReadOnly: null,
      lockedGroupCount: 0,
    };
  }
  const now = Date.now();
  const daysUntil = (d: Date | null) =>
    d ? Math.max(0, Math.ceil((d.getTime() - now) / (24 * 3600 * 1000))) : null;
  const lockedIds = (state.lockedGroupIds as string[]) ?? [];
  return {
    status: state.status,
    expiresAt: state.expiresAt?.toISOString() ?? null,
    graceEndsAt: state.graceEndsAt?.toISOString() ?? null,
    readOnlyAt: state.readOnlyAt?.toISOString() ?? null,
    daysUntilWarn: daysUntil(state.graceEndsAt),
    daysUntilReadOnly: daysUntil(state.readOnlyAt),
    lockedGroupCount: lockedIds.length,
  };
}
