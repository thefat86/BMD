/**
 * V200 — Module Caisses Projet (Project Funds)
 * =============================================================================
 * Service métier : création de caisses, cotisations, dépenses, votes, audit.
 *
 * BMD agit en REGISTRE — jamais en dépositaire de fonds. Le trésorier
 * détient l'argent physiquement (compte perso, mobile money), BMD trace
 * uniquement les déclarations pour assurer la transparence et la confiance
 * entre contributeurs.
 *
 * Kill switch : SiteConfig.projectFundsEnabled=false → toutes les opérations
 * throw Errors.notFound() pour qu'aucune route ne réponde si le régulateur
 * (CSSF / ACPR) demande de désactiver instantanément.
 *
 * Architecture :
 *   - Helpers de garde : assertFeatureEnabled, getFundOrThrow, assertMember,
 *     assertTreasurer
 *   - CRUD principal : createFund, listFundsForGroup, getFundDetail
 *   - Cotisations : contributeToFund, validateContribution, rejectContribution
 *   - Dépenses : proposeExpense, voteOnExpense, executeExpense
 *   - Lifecycle : closeFund
 *   - Audit : recordEvent (hash chaîné SHA-256), getFundEvents
 *   - FX : convertToFundCurrency (utilise FxRate ou throw si manquant)
 */

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { assertCanCreateProjectFund } from "../../lib/plan-limits.js";
import {
  notifyOne,
  notifyMany,
} from "../notifications/notifications.service.js";
import { sendFundEmail } from "./project-funds.emails.js";

// ---------------------------------------------------------------------------
// Types publics (consommés par les routes + le front via api-client)
// ---------------------------------------------------------------------------

export type FundTemplate =
  | "EVENT"
  | "PROJECT"
  | "SOLIDARITY"
  | "ASSOCIATION"
  | "GIFT";

export type FundStatus = "DRAFT" | "ACTIVE" | "ARCHIVED" | "CLOSED";

export type FundPaymentMethod =
  | "TRANSFER"
  | "MOBILE_MONEY"
  | "CASH"
  | "CARD"
  | "OTHER";

export type FundContributionStatus = "PENDING" | "VALIDATED" | "REJECTED";

export type FundExpenseStatus =
  | "PENDING_VOTE"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED";

/**
 * V215.C1 — Fréquence des versements vers une caisse.
 * Voir enum FundFrequency dans schema.prisma pour la sémantique.
 */
export type FundFrequency =
  | "ONE_SHOT"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "CUSTOM";

/**
 * V218.G — Mode de contribution d'une caisse.
 * FREE  = montant libre (chacun cotise ce qu'il veut quand il veut).
 * FIXED = montant imposé (chaque versement doit être égal à
 *         `contributionAmount` exprimé dans la devise de la caisse).
 */
export type FundContributionMode = "FREE" | "FIXED";

export interface CreateFundInput {
  groupId: string;
  name: string;
  description?: string;
  template?: FundTemplate;
  targetAmount?: number;
  currency?: string;
  deadline?: string; // ISO date
  treasurerUserId?: string;
  voteThreshold?: number;
  voteApprovalRatio?: number;
  /**
   * V215.C1 — Fréquence des versements attendus (par défaut ONE_SHOT).
   * Si MONTHLY/WEEKLY/BIWEEKLY, l'app calcule automatiquement le nombre de
   * versements et le montant par versement à partir de deadline + targetAmount.
   * Si CUSTOM, le créateur fournit lui-même `numberOfInstallments` (libre).
   */
  frequency?: FundFrequency;
  /** Pour CUSTOM uniquement. Sinon calculé automatiquement. */
  numberOfInstallments?: number;
  /**
   * V218.G — Mode de contribution (défaut FREE pour rétro-compat).
   * Si FIXED, `contributionAmount` est obligatoire.
   */
  contributionMode?: FundContributionMode;
  /**
   * V218.G — Montant strictement imposé par versement (devise de la caisse).
   * Obligatoire si `contributionMode = FIXED`, ignoré sinon.
   */
  contributionAmount?: number;
}

/**
 * V215.C1 — Calcul d'un échéancier à partir de la fréquence + deadline.
 *
 * Retourne le nombre de versements et le montant par versement (arrondi à
 * 2 décimales). Le créateur peut surcharger numberOfInstallments pour CUSTOM.
 *
 * Note : si pas de deadline et pas de targetAmount, retourne { count: null,
 * perInstallment: null } — la caisse reste en mode libre sans échéancier.
 */
export function computeInstallmentSchedule(
  frequency: FundFrequency,
  options: {
    deadline?: Date | null;
    targetAmount?: number | null;
    numberOfInstallmentsOverride?: number;
    now?: Date;
  },
): {
  count: number | null;
  perInstallment: number | null;
  nextPaymentDate: Date | null;
} {
  if (frequency === "ONE_SHOT") {
    return { count: null, perInstallment: null, nextPaymentDate: null };
  }

  const now = options.now ?? new Date();
  const target = options.targetAmount ?? null;

  // CUSTOM : créateur libre, on respecte ce qu'il indique
  if (frequency === "CUSTOM") {
    const count = options.numberOfInstallmentsOverride ?? null;
    const per = count && target ? Math.round((target / count) * 100) / 100 : null;
    return {
      count,
      perInstallment: per,
      nextPaymentDate: count && count > 0 ? now : null,
    };
  }

  // Pas de deadline → impossible de calculer un échéancier régulier
  if (!options.deadline) {
    return { count: null, perInstallment: null, nextPaymentDate: null };
  }

  const msPerDay = 86_400_000;
  const totalDays = Math.max(
    1,
    Math.ceil((options.deadline.getTime() - now.getTime()) / msPerDay),
  );

  let stepDays: number;
  switch (frequency) {
    case "WEEKLY":
      stepDays = 7;
      break;
    case "BIWEEKLY":
      stepDays = 14;
      break;
    case "MONTHLY":
    default:
      stepDays = 30; // approximation suffisante pour l'affichage UX
      break;
  }

  const count = Math.max(1, Math.ceil(totalDays / stepDays));
  const perInstallment =
    target !== null && count > 0
      ? Math.round((target / count) * 100) / 100
      : null;

  // Première échéance = maintenant + 1 step (donne du mou au premier paiement)
  const next = new Date(now.getTime() + stepDays * msPerDay);

  return { count, perInstallment, nextPaymentDate: next };
}

export interface ContributeInput {
  fundId: string;
  amount: number;
  currency: string;
  method?: FundPaymentMethod;
  note?: string;
  proofUrl?: string;
}

// ---------------------------------------------------------------------------
// V222.C — Helpers période de cotisation
// ---------------------------------------------------------------------------

/**
 * V222.C — Calcule la période (borne inf + sup) qui contient `date` pour une
 * caisse à fréquence régulière. Sert à rattacher chaque cotisation à la
 * période qu'elle couvre (ex : « mai 2026 ») pour pouvoir dire qui est à
 * jour et qui est en retard.
 *
 * Conventions :
 *   - ONE_SHOT / CUSTOM → pas de période, retourne { start: null, end: null }
 *   - MONTHLY  → période = mois calendaire UTC contenant `date`
 *                ex : 2026-05-15 → 2026-05-01 → 2026-05-31 23:59:59.999
 *   - WEEKLY   → semaine de 7 jours glissants depuis `startDate`
 *   - BIWEEKLY → fenêtre de 14 jours glissants depuis `startDate`
 *
 * Le `startDate` (fallback `createdAt` de la caisse) sert d'ancrage pour le
 * découpage WEEKLY/BIWEEKLY : on aligne les périodes sur ce point.
 */
export function computePeriodFor(
  date: Date,
  fund: {
    frequency: FundFrequency;
    /** Ancrage pour découpage WEEKLY/BIWEEKLY. Fallback sur createdAt. */
    startDate?: Date | null;
    createdAt?: Date | null;
  },
): { start: Date | null; end: Date | null } {
  if (fund.frequency === "ONE_SHOT" || fund.frequency === "CUSTOM") {
    return { start: null, end: null };
  }

  // Ancre = startDate si fourni, sinon createdAt, sinon date elle-même.
  const anchor = fund.startDate ?? fund.createdAt ?? date;
  const target = new Date(date);

  if (fund.frequency === "MONTHLY") {
    const start = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const end = new Date(
      Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
    return { start, end };
  }

  // WEEKLY / BIWEEKLY — alignés sur l'ancre
  const stepDays = fund.frequency === "WEEKLY" ? 7 : 14;
  const msPerDay = 86_400_000;
  const anchorUTC = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const targetUTC = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const diffDays = Math.floor((targetUTC - anchorUTC) / msPerDay);
  const periodIndex = Math.floor(diffDays / stepDays);
  const startMs = anchorUTC + periodIndex * stepDays * msPerDay;
  const endMs = startMs + stepDays * msPerDay - 1;
  return { start: new Date(startMs), end: new Date(endMs) };
}

/**
 * V222.C — Énumère toutes les périodes attendues depuis `startDate` (fallback
 * `createdAt`) jusqu'à `until` (par défaut maintenant) pour une caisse à
 * fréquence régulière. Renvoyé dans l'ordre antéchronologique (plus récent
 * d'abord) avec un label lisible localisé.
 *
 * Retour vide si frequency = ONE_SHOT / CUSTOM ou si pas d'ancrage exploitable.
 */
export function listPeriodsForFund(
  fund: {
    frequency: FundFrequency;
    startDate?: Date | null;
    createdAt?: Date | null;
    deadline?: Date | null;
  },
  options?: { until?: Date; maxPeriods?: number },
): Array<{ start: Date; end: Date; label: string }> {
  if (fund.frequency === "ONE_SHOT" || fund.frequency === "CUSTOM") {
    return [];
  }
  const anchor = fund.startDate ?? fund.createdAt ?? null;
  if (!anchor) return [];

  const now = options?.until ?? new Date();
  // Ne dépasse pas la deadline si elle est dans le passé.
  const ceiling =
    fund.deadline && fund.deadline.getTime() < now.getTime()
      ? fund.deadline
      : now;
  const maxPeriods = options?.maxPeriods ?? 120; // garde-fou (~10 ans en mois)

  const periods: Array<{ start: Date; end: Date; label: string }> = [];
  // Itère du présent vers le passé pour borner facilement.
  let cursor = new Date(ceiling);
  while (periods.length < maxPeriods) {
    const { start, end } = computePeriodFor(cursor, fund);
    if (!start || !end) break;
    if (start.getTime() < anchor.getTime() - 86_400_000) break; // dépassé l'ancre
    // Évite les doublons (cas où cursor reste dans la même période).
    if (
      periods.length > 0 &&
      periods[periods.length - 1].start.getTime() === start.getTime()
    ) {
      // Recule d'un jour avant la borne courante pour passer à la période d'avant
      cursor = new Date(start.getTime() - 86_400_000);
      continue;
    }
    periods.push({
      start,
      end,
      label: formatPeriodLabel(start, fund.frequency),
    });
    cursor = new Date(start.getTime() - 86_400_000); // avant cette période
  }
  return periods;
}

function formatPeriodLabel(start: Date, frequency: FundFrequency): string {
  // Label localisable côté front via Intl.DateTimeFormat. Côté backend on
  // renvoie un libellé FR par défaut (le front recalcule selon la locale).
  if (frequency === "MONTHLY") {
    return new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  }
  // WEEKLY / BIWEEKLY : « Semaine du 5 mai 2026 »
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Sem. du ${fmt.format(start)}`;
}

export interface ProposeExpenseInput {
  fundId: string;
  motive: string;
  amount: number;
  beneficiary?: string;
  proofUrl?: string;
}

// ---------------------------------------------------------------------------
// 1. Garde du module : kill switch global
// ---------------------------------------------------------------------------

/**
 * V200 — Vérifie que le module est globalement activé.
 * Si désactivé → throw notFound (404). Le front interprète cela comme
 * « la feature n'existe pas » et masque l'onglet « Caisses ».
 *
 * Le seuil de vote global est aussi récupéré ici en bonus pour éviter
 * un round-trip DB si l'appelant en a besoin (proposeExpense par ex.).
 */
export async function assertFeatureEnabled(): Promise<{
  enabled: boolean;
  globalVoteThresholdEur: number;
}> {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: "default" },
    select: {
      projectFundsEnabled: true,
      projectFundsVoteThresholdEur: true,
    },
  });
  if (!cfg || !cfg.projectFundsEnabled) {
    throw Errors.notFound(
      "Cette fonctionnalité n'est pas disponible pour le moment.",
    );
  }
  return {
    enabled: true,
    globalVoteThresholdEur: cfg.projectFundsVoteThresholdEur.toNumber(),
  };
}

// ---------------------------------------------------------------------------
// 2. Helpers de garde : membre / trésorier / créateur
// ---------------------------------------------------------------------------

async function assertGroupMember(
  groupId: string,
  userId: string,
): Promise<void> {
  const isMember = await prisma.groupMember.findFirst({
    where: { groupId, userId },
    select: { id: true },
  });
  if (!isMember) {
    throw Errors.forbidden("Tu n'es pas membre de ce groupe.");
  }
}

async function getFundOrThrow(fundId: string, userId: string) {
  const fund = await prisma.projectFund.findUnique({
    where: { id: fundId },
    include: { group: { select: { id: true, name: true } } },
  });
  if (!fund) throw Errors.notFound("Cette caisse est introuvable.");
  await assertGroupMember(fund.groupId, userId);
  return fund;
}

function assertTreasurer(
  fund: { treasurerUserId: string | null; createdByUserId: string },
  userId: string,
): void {
  // Le trésorier OU le créateur (si pas encore de trésorier désigné)
  // peut valider/refuser/exécuter. Évite le verrouillage si trésorier
  // pas encore nommé.
  if (fund.treasurerUserId) {
    if (fund.treasurerUserId !== userId) {
      throw Errors.forbidden("Seul le trésorier peut effectuer cette action.");
    }
  } else if (fund.createdByUserId !== userId) {
    throw Errors.forbidden(
      "Aucun trésorier nommé — seul le créateur de la caisse peut agir.",
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Conversion FX (cotisation dans devise ≠ devise caisse)
// ---------------------------------------------------------------------------

/**
 * Convertit un montant d'une devise vers la devise de la caisse.
 * Utilise FxRate (table existante). Si la paire n'existe pas, throw une
 * erreur claire — pas de conversion silencieuse approximative.
 */
async function convertToFundCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<{ amount: number; exchangeRate: number }> {
  if (fromCurrency === toCurrency) {
    return { amount, exchangeRate: 1 };
  }
  // V202 — FxRate stocke un rate par devise vers EUR (`rateToEur` = nb d'unités
  // de cette devise pour 1 EUR). On passe par EUR comme pivot.
  // Ex : 100 USD → fund XOF :
  //   1 USD = 1 / rateToEur(USD) EUR
  //   1 EUR = rateToEur(XOF) XOF
  //   → 100 USD = 100 / rateToEur(USD) * rateToEur(XOF) XOF
  const [fromRate, toRate] = await Promise.all([
    fromCurrency === "EUR"
      ? Promise.resolve({ rateToEur: 1 })
      : prisma.fxRate.findUnique({
          where: { code: fromCurrency },
          select: { rateToEur: true },
        }),
    toCurrency === "EUR"
      ? Promise.resolve({ rateToEur: 1 })
      : prisma.fxRate.findUnique({
          where: { code: toCurrency },
          select: { rateToEur: true },
        }),
  ]);
  if (!fromRate || !toRate) {
    throw Errors.badRequest(
      `Conversion ${fromCurrency} → ${toCurrency} indisponible. Réessaie dans une autre devise.`,
    );
  }
  const fromR =
    typeof fromRate.rateToEur === "number"
      ? fromRate.rateToEur
      : (fromRate.rateToEur as any).toNumber();
  const toR =
    typeof toRate.rateToEur === "number"
      ? toRate.rateToEur
      : (toRate.rateToEur as any).toNumber();
  const exchangeRate = toR / fromR;
  return {
    amount: Math.round(amount * exchangeRate * 100) / 100,
    exchangeRate,
  };
}

// ---------------------------------------------------------------------------
// 4. Audit log inviolable (hash chaîné SHA-256)
// ---------------------------------------------------------------------------

/**
 * Enregistre un événement dans le journal d'audit. Le hash chaîne chaque
 * événement au précédent : modifier rétroactivement un événement casserait
 * la chaîne de tous les suivants, rendant toute manipulation détectable.
 *
 * Hash = SHA-256(previousHash + kind + JSON.stringify(payload) + createdAtISO).
 */
async function recordEvent(
  fundId: string,
  kind:
    | "FUND_CREATED"
    | "FUND_UPDATED"
    | "TREASURER_NAMED"
    | "CONTRIBUTION_DECLARED"
    | "CONTRIBUTION_VALIDATED"
    | "CONTRIBUTION_REJECTED"
    | "EXPENSE_PROPOSED"
    | "EXPENSE_VOTED"
    | "EXPENSE_APPROVED"
    | "EXPENSE_REJECTED"
    | "EXPENSE_EXECUTED"
    | "FUND_CLOSED"
    | "FUND_ARCHIVED",
  payload: Record<string, unknown>,
  actorUserId: string | null,
): Promise<void> {
  const last = await prisma.fundEvent.findFirst({
    where: { fundId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });
  const previousHash = last?.hash ?? null;
  const now = new Date();
  const payloadStr = JSON.stringify(payload);
  const hash = createHash("sha256")
    .update((previousHash ?? "") + kind + payloadStr + now.toISOString())
    .digest("hex");

  await prisma.fundEvent.create({
    data: {
      fundId,
      kind: kind as any,
      payload: payload as Prisma.JsonObject,
      actorUserId,
      previousHash,
      hash,
      createdAt: now,
    },
  });
}

// ---------------------------------------------------------------------------
// 5. Calcul du solde (somme cotisations validées − somme dépenses exécutées)
// ---------------------------------------------------------------------------

export async function computeFundBalance(fundId: string): Promise<{
  contributed: number;
  spent: number;
  balance: number;
  contributorsCount: number;
}> {
  const [contribAgg, expenseAgg, contributors] = await Promise.all([
    prisma.fundContribution.aggregate({
      where: { fundId, status: "VALIDATED" },
      _sum: { amountInFundCurrency: true },
    }),
    prisma.fundExpense.aggregate({
      where: { fundId, status: "EXECUTED" },
      _sum: { amount: true },
    }),
    prisma.fundContribution.findMany({
      where: { fundId, status: "VALIDATED" },
      distinct: ["contributorUserId"],
      select: { contributorUserId: true },
    }),
  ]);
  const contributed = contribAgg._sum.amountInFundCurrency?.toNumber() ?? 0;
  const spent = expenseAgg._sum.amount?.toNumber() ?? 0;
  return {
    contributed,
    spent,
    balance: contributed - spent,
    contributorsCount: contributors.length,
  };
}

// ---------------------------------------------------------------------------
// 6. CRUD principal
// ---------------------------------------------------------------------------

export async function createFund(
  input: CreateFundInput,
  userId: string,
): Promise<{ id: string; publicCode: string }> {
  await assertFeatureEnabled();
  await assertGroupMember(input.groupId, userId);
  // V202.A — Plan gating : vérifier le quota avant toute autre validation
  await assertCanCreateProjectFund(userId);

  if (!input.name || input.name.trim().length < 2) {
    throw Errors.badRequest("Le nom de la caisse est trop court.");
  }
  if (input.targetAmount !== undefined && input.targetAmount <= 0) {
    throw Errors.badRequest("Le montant cible doit être strictement positif.");
  }
  if (input.deadline) {
    const d = new Date(input.deadline);
    if (Number.isNaN(d.getTime())) {
      throw Errors.badRequest("Date d'échéance invalide.");
    }
  }
  if (
    input.voteApprovalRatio !== undefined &&
    (input.voteApprovalRatio < 0.5 || input.voteApprovalRatio > 1)
  ) {
    throw Errors.badRequest(
      "Le ratio d'approbation doit être entre 0,50 (majorité simple) et 1,00 (unanimité).",
    );
  }
  // Si trésorier nommé → il doit être membre du groupe
  if (input.treasurerUserId) {
    await assertGroupMember(input.groupId, input.treasurerUserId);
  }

  // V218.G — Mode de contribution : FIXED exige contributionAmount > 0.
  // FREE accepte tout (champ ignoré silencieusement).
  const contributionMode: FundContributionMode = input.contributionMode ?? "FREE";
  if (contributionMode === "FIXED") {
    if (
      input.contributionAmount === undefined ||
      input.contributionAmount === null ||
      !(input.contributionAmount > 0)
    ) {
      throw Errors.badRequest(
        "En mode « montant fixe », tu dois indiquer le montant par versement (> 0).",
      );
    }
  }

  // V215.C1 — Calcule l'échéancier (count + perInstallment + nextPaymentDate)
  // automatiquement à partir de la fréquence choisie. Pour ONE_SHOT, tous les
  // champs sont null et la caisse fonctionne comme avant.
  const frequency: FundFrequency = input.frequency ?? "ONE_SHOT";
  const schedule = computeInstallmentSchedule(frequency, {
    deadline: input.deadline ? new Date(input.deadline) : null,
    targetAmount: input.targetAmount ?? null,
    numberOfInstallmentsOverride: input.numberOfInstallments,
  });

  const fund = await prisma.projectFund.create({
    data: {
      groupId: input.groupId,
      createdByUserId: userId,
      treasurerUserId: input.treasurerUserId ?? userId, // créateur = trésorier par défaut
      name: input.name.trim(),
      description: input.description?.trim() || null,
      template: (input.template ?? "EVENT") as any,
      targetAmount:
        input.targetAmount !== undefined
          ? new Prisma.Decimal(input.targetAmount)
          : null,
      currency: input.currency ?? "EUR",
      deadline: input.deadline ? new Date(input.deadline) : null,
      voteThreshold:
        input.voteThreshold !== undefined
          ? new Prisma.Decimal(input.voteThreshold)
          : null,
      voteApprovalRatio: new Prisma.Decimal(input.voteApprovalRatio ?? 0.5),
      // V215.C1 — Fréquence + échéancier calculé
      frequency: frequency as any,
      numberOfInstallments: schedule.count,
      installmentAmount:
        schedule.perInstallment !== null
          ? new Prisma.Decimal(schedule.perInstallment)
          : null,
      nextPaymentDate: schedule.nextPaymentDate,
      // V218.G — Mode de contribution (libre vs imposé)
      contributionMode: contributionMode as any,
      contributionAmount:
        contributionMode === "FIXED" && input.contributionAmount
          ? new Prisma.Decimal(input.contributionAmount)
          : null,
    } as any, // cast pour permettre l'utilisation avant régénération du client
    select: { id: true, publicCode: true },
  });

  await recordEvent(
    fund.id,
    "FUND_CREATED",
    {
      name: input.name,
      template: input.template ?? "EVENT",
      targetAmount: input.targetAmount,
      currency: input.currency ?? "EUR",
    },
    userId,
  );
  return fund;
}

export async function listFundsForGroup(groupId: string, userId: string) {
  await assertFeatureEnabled();
  await assertGroupMember(groupId, userId);

  const funds = await prisma.projectFund.findMany({
    where: { groupId },
    select: {
      id: true,
      publicCode: true,
      name: true,
      template: true,
      status: true,
      targetAmount: true,
      currency: true,
      deadline: true,
      createdAt: true,
      closedAt: true,
      treasurerUserId: true,
      treasurer: { select: { id: true, displayName: true, avatar: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  // Calcule les soldes en parallèle (Promise.all)
  const withBalances = await Promise.all(
    funds.map(async (f) => {
      const bal = await computeFundBalance(f.id);
      return { ...f, ...bal };
    }),
  );
  return withBalances;
}

export async function getFundDetail(fundId: string, userId: string) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(fundId, userId);
  const [contributions, expenses, balance] = await Promise.all([
    prisma.fundContribution.findMany({
      where: { fundId },
      include: {
        contributor: {
          select: { id: true, displayName: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.fundExpense.findMany({
      where: { fundId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    computeFundBalance(fundId),
  ]);
  return {
    fund,
    contributions,
    expenses,
    balance,
  };
}

// ---------------------------------------------------------------------------
// 7. Cotisations (PENDING → VALIDATED ou REJECTED)
// ---------------------------------------------------------------------------

export async function contributeToFund(
  input: ContributeInput,
  userId: string,
) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(input.fundId, userId);
  if (fund.status !== "ACTIVE") {
    throw Errors.conflict("Cette caisse n'accepte plus de cotisations.");
  }
  if (input.amount <= 0) {
    throw Errors.badRequest("Le montant doit être strictement positif.");
  }
  // Conversion FX
  const { amount: amountInFundCurrency, exchangeRate } =
    await convertToFundCurrency(input.amount, input.currency, fund.currency);

  // V218.G — Mode FIXED : le versement (converti dans la devise de la caisse)
  // doit être strictement égal à `contributionAmount`. Tolérance 0.01 pour
  // absorber les arrondis FX.
  const fundFixedMode = (fund as any).contributionMode === "FIXED";
  const fundFixedAmount = (fund as any).contributionAmount as
    | { toNumber: () => number }
    | null
    | undefined;
  if (fundFixedMode && fundFixedAmount) {
    const expected = fundFixedAmount.toNumber();
    if (Math.abs(amountInFundCurrency - expected) > 0.01) {
      throw Errors.badRequest(
        `Cette caisse impose un versement fixe de ${expected.toFixed(2)} ${fund.currency}.`,
      );
    }
  }

  // V222.C — Calcul auto période couverte pour caisses à fréquence régulière.
  // Le `paidAt` n'existe pas comme champ explicite côté contribution → on
  // utilise `now` (date de déclaration) comme référence. periodStart/End
  // restent null pour ONE_SHOT / CUSTOM (versement libre).
  const now = new Date();
  const period = computePeriodFor(now, {
    frequency: (fund as any).frequency ?? "ONE_SHOT",
    startDate: null,
    createdAt: fund.createdAt,
  });

  const contrib = await prisma.fundContribution.create({
    data: {
      fundId: input.fundId,
      contributorUserId: userId,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      amountInFundCurrency: new Prisma.Decimal(amountInFundCurrency),
      exchangeRate: new Prisma.Decimal(exchangeRate),
      method: (input.method ?? "TRANSFER") as any,
      note: input.note ?? null,
      proofUrl: input.proofUrl ?? null,
      status: "PENDING",
      // V222.C — Champs ajoutés par migration 20260620150000.
      // Cast `any` pour rester compatible si le client Prisma n'a pas encore
      // été régénéré côté Fabrice (prisma generate à lancer après deploy).
      ...(period.start
        ? ({ periodStart: period.start, periodEnd: period.end } as any)
        : {}),
    } as any,
    select: { id: true, status: true, createdAt: true },
  });
  await recordEvent(
    input.fundId,
    "CONTRIBUTION_DECLARED",
    {
      contributionId: contrib.id,
      amount: input.amount,
      currency: input.currency,
      amountInFundCurrency,
      method: input.method ?? "TRANSFER",
    },
    userId,
  );

  // V202.B — Notifier le trésorier (ou créateur si pas de trésorier)
  // qu'une cotisation est à valider. Best-effort, ne bloque pas la création.
  const treasurerId = fund.treasurerUserId ?? fund.createdByUserId;
  if (treasurerId !== userId) {
    const contributor = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    void notifyOne(treasurerId, {
      kind: "FUND_CONTRIBUTION_DECLARED" as any,
      title: `${contributor?.displayName ?? "Un membre"} a cotisé ${input.amount} ${input.currency}`,
      body: `Caisse « ${fund.name} » — à valider après vérification.`,
      link: `/dashboard/groups/${fund.groupId}/funds/${input.fundId}`,
      payload: { fundId: input.fundId, contributionId: contrib.id } as any,
    } as any).catch(() => undefined);
    void sendFundEmail({
      kind: "CONTRIBUTION_DECLARED",
      toUserId: treasurerId,
      fundName: fund.name,
      groupId: fund.groupId,
      fundId: input.fundId,
      contributorName: contributor?.displayName ?? "Un contributeur",
      amount: input.amount,
      currency: input.currency,
    }).catch(() => undefined);
  }

  return contrib;
}

export async function validateContribution(
  fundId: string,
  contributionId: string,
  userId: string,
) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(fundId, userId);
  assertTreasurer(fund, userId);

  const existing = await prisma.fundContribution.findUnique({
    where: { id: contributionId },
    select: { id: true, fundId: true, status: true },
  });
  if (!existing || existing.fundId !== fundId) {
    throw Errors.notFound("Cotisation introuvable.");
  }
  if (existing.status !== "PENDING") {
    throw Errors.conflict("Cette cotisation a déjà été traitée.");
  }
  await prisma.fundContribution.update({
    where: { id: contributionId },
    data: {
      status: "VALIDATED",
      validatedAt: new Date(),
      validatedByUserId: userId,
    },
  });
  await recordEvent(
    fundId,
    "CONTRIBUTION_VALIDATED",
    { contributionId },
    userId,
  );

  // V202.B/C — Notifier + email le contributeur que sa cotisation est validée
  const contrib = await prisma.fundContribution.findUnique({
    where: { id: contributionId },
    select: {
      contributorUserId: true,
      amount: true,
      currency: true,
    },
  });
  if (contrib) {
    void notifyOne(contrib.contributorUserId, {
      kind: "FUND_CONTRIBUTION_VALIDATED" as any,
      title: `Cotisation validée — ${fund.name}`,
      body: `Ta cotisation de ${contrib.amount.toString()} ${contrib.currency} a été validée par le trésorier.`,
      link: `/dashboard/groups/${fund.groupId}/funds/${fundId}`,
      payload: { fundId, contributionId } as any,
    } as any).catch(() => undefined);
    void sendFundEmail({
      kind: "CONTRIBUTION_VALIDATED",
      toUserId: contrib.contributorUserId,
      fundName: fund.name,
      groupId: fund.groupId,
      fundId,
      amount: contrib.amount.toNumber(),
      currency: contrib.currency,
    }).catch(() => undefined);
  }

  return { id: contributionId, status: "VALIDATED" as const };
}

export async function rejectContribution(
  fundId: string,
  contributionId: string,
  reason: string | undefined,
  userId: string,
) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(fundId, userId);
  assertTreasurer(fund, userId);

  const existing = await prisma.fundContribution.findUnique({
    where: { id: contributionId },
    select: { id: true, fundId: true, status: true },
  });
  if (!existing || existing.fundId !== fundId) {
    throw Errors.notFound("Cotisation introuvable.");
  }
  if (existing.status !== "PENDING") {
    throw Errors.conflict("Cette cotisation a déjà été traitée.");
  }
  await prisma.fundContribution.update({
    where: { id: contributionId },
    data: {
      status: "REJECTED",
      rejectionReason: reason ?? null,
    },
  });
  await recordEvent(
    fundId,
    "CONTRIBUTION_REJECTED",
    { contributionId, reason },
    userId,
  );
  return { id: contributionId, status: "REJECTED" as const };
}

// ---------------------------------------------------------------------------
// 8. Dépenses (PENDING_VOTE / APPROVED → EXECUTED)
// ---------------------------------------------------------------------------

export async function proposeExpense(
  input: ProposeExpenseInput,
  userId: string,
) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(input.fundId, userId);
  assertTreasurer(fund, userId);

  if (input.amount <= 0) {
    throw Errors.badRequest("Le montant doit être strictement positif.");
  }
  // Détermine si un vote est nécessaire
  const { globalVoteThresholdEur } = await assertFeatureEnabled();
  const fundThreshold =
    fund.voteThreshold?.toNumber() ?? globalVoteThresholdEur;
  const voteRequired = input.amount >= fundThreshold;
  const initialStatus = voteRequired ? "PENDING_VOTE" : "APPROVED";

  const expense = await prisma.fundExpense.create({
    data: {
      fundId: input.fundId,
      createdByUserId: userId,
      motive: input.motive.trim(),
      amount: new Prisma.Decimal(input.amount),
      currency: fund.currency,
      beneficiary: input.beneficiary?.trim() || null,
      proofUrl: input.proofUrl ?? null,
      status: initialStatus as any,
      voteRequired,
      // Si vote requis : 72h pour voter par défaut
      voteClosesAt: voteRequired
        ? new Date(Date.now() + 72 * 3600 * 1000)
        : null,
    },
    select: { id: true, status: true, voteRequired: true },
  });
  await recordEvent(
    input.fundId,
    "EXPENSE_PROPOSED",
    {
      expenseId: expense.id,
      motive: input.motive,
      amount: input.amount,
      voteRequired,
    },
    userId,
  );

  // V202.B/C — Si vote requis, notifier + emailer tous les contributeurs
  // validés (« 1 contributeur = 1 voix »). En l'absence de vote, on ne dérange
  // personne — la dépense passe en APPROVED automatiquement.
  if (voteRequired) {
    const contributors = await prisma.fundContribution.findMany({
      where: { fundId: input.fundId, status: "VALIDATED" },
      distinct: ["contributorUserId"],
      select: { contributorUserId: true },
    });
    const voterIds = contributors
      .map((c) => c.contributorUserId)
      .filter((id) => id !== userId); // ne pas se notifier soi-même
    if (voterIds.length > 0) {
      const closesAt = new Date(Date.now() + 72 * 3600 * 1000);
      void notifyMany(voterIds, {
        kind: "FUND_VOTE_OPENED" as any,
        title: `Vote ouvert : ${input.motive}`,
        body: `${input.amount} ${fund.currency} — Caisse « ${fund.name} ». Vote avant ${closesAt.toLocaleDateString("fr-FR")}.`,
        link: `/dashboard/groups/${fund.groupId}/funds/${input.fundId}`,
        payload: { fundId: input.fundId, expenseId: expense.id } as any,
      } as any).catch(() => undefined);
      for (const vid of voterIds) {
        void sendFundEmail({
          kind: "VOTE_OPENED",
          toUserId: vid,
          fundName: fund.name,
          groupId: fund.groupId,
          fundId: input.fundId,
          expenseMotive: input.motive,
          amount: input.amount,
          currency: fund.currency,
          voteClosesAt: closesAt,
        }).catch(() => undefined);
      }
    }
  }

  return expense;
}

export async function voteOnExpense(
  fundId: string,
  expenseId: string,
  vote: boolean,
  comment: string | undefined,
  userId: string,
) {
  await assertFeatureEnabled();
  await getFundOrThrow(fundId, userId);

  const expense = await prisma.fundExpense.findUnique({
    where: { id: expenseId },
    include: { fund: { select: { voteApprovalRatio: true } } },
  });
  if (!expense || expense.fundId !== fundId) {
    throw Errors.notFound("Cette dépense est introuvable.");
  }
  if (expense.status !== "PENDING_VOTE") {
    throw Errors.conflict("Le vote sur cette dépense est clos.");
  }
  if (expense.voteClosesAt && expense.voteClosesAt < new Date()) {
    throw Errors.conflict("La période de vote est terminée.");
  }

  // L'utilisateur doit avoir au moins 1 cotisation VALIDATED dans la caisse
  // pour pouvoir voter (logique « 1 contributeur = 1 voix »).
  const eligible = await prisma.fundContribution.findFirst({
    where: { fundId, contributorUserId: userId, status: "VALIDATED" },
    select: { id: true },
  });
  if (!eligible) {
    throw Errors.forbidden(
      "Seuls les contributeurs ayant cotisé peuvent voter sur les dépenses.",
    );
  }

  // Upsert : un user ne peut voter qu'une seule fois (peut changer son vote
  // tant que le vote est ouvert).
  await prisma.fundExpenseVote.upsert({
    where: {
      expenseId_voterUserId: { expenseId, voterUserId: userId },
    },
    create: { expenseId, voterUserId: userId, vote, comment: comment ?? null },
    update: { vote, comment: comment ?? null },
  });

  // Recalcule les compteurs
  const tally = await prisma.fundExpenseVote.groupBy({
    by: ["vote"],
    where: { expenseId },
    _count: { _all: true },
  });
  const votesFor = tally.find((t) => t.vote === true)?._count._all ?? 0;
  const votesAgainst = tally.find((t) => t.vote === false)?._count._all ?? 0;
  await prisma.fundExpense.update({
    where: { id: expenseId },
    data: { votesFor, votesAgainst },
  });

  await recordEvent(
    fundId,
    "EXPENSE_VOTED",
    { expenseId, vote, votesFor, votesAgainst },
    userId,
  );

  // Tentative d'approbation automatique : si ratio atteint ET majorité des
  // contributeurs s'est exprimée (>= 50% des contributeurs uniques)
  const balance = await computeFundBalance(fundId);
  const totalVotes = votesFor + votesAgainst;
  const ratio = totalVotes > 0 ? votesFor / totalVotes : 0;
  const minTurnout = Math.ceil(balance.contributorsCount * 0.5);
  if (
    totalVotes >= minTurnout &&
    ratio >= expense.fund.voteApprovalRatio.toNumber()
  ) {
    await prisma.fundExpense.update({
      where: { id: expenseId },
      data: { status: "APPROVED" },
    });
    await recordEvent(fundId, "EXPENSE_APPROVED", { expenseId }, null);
  } else if (
    totalVotes >= minTurnout &&
    ratio < expense.fund.voteApprovalRatio.toNumber() &&
    votesAgainst > votesFor
  ) {
    await prisma.fundExpense.update({
      where: { id: expenseId },
      data: { status: "REJECTED" },
    });
    await recordEvent(fundId, "EXPENSE_REJECTED", { expenseId }, null);
  }

  return { votesFor, votesAgainst };
}

export async function executeExpense(
  fundId: string,
  expenseId: string,
  userId: string,
) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(fundId, userId);
  assertTreasurer(fund, userId);

  const expense = await prisma.fundExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, fundId: true, status: true, amount: true },
  });
  if (!expense || expense.fundId !== fundId) {
    throw Errors.notFound("Dépense introuvable.");
  }
  if (expense.status !== "APPROVED") {
    throw Errors.conflict(
      "La dépense doit être approuvée avant d'être exécutée.",
    );
  }
  // Vérifie qu'il y a assez de fonds
  const balance = await computeFundBalance(fundId);
  const amount = expense.amount.toNumber();
  if (balance.balance < amount) {
    throw Errors.conflict(
      `Solde insuffisant : ${balance.balance.toFixed(2)} disponibles, ${amount.toFixed(2)} requis.`,
    );
  }
  await prisma.fundExpense.update({
    where: { id: expenseId },
    data: { status: "EXECUTED", executedAt: new Date() },
  });
  await recordEvent(fundId, "EXPENSE_EXECUTED", { expenseId, amount }, userId);

  // V202.B/C — Notifier tous les contributeurs validés que la dépense a été
  // exécutée (transparence sur l'usage des fonds). Best-effort.
  const fullExpense = await prisma.fundExpense.findUnique({
    where: { id: expenseId },
    select: { motive: true, currency: true },
  });
  const contributors = await prisma.fundContribution.findMany({
    where: { fundId, status: "VALIDATED" },
    distinct: ["contributorUserId"],
    select: { contributorUserId: true },
  });
  if (fullExpense && contributors.length > 0) {
    const recipientIds = contributors.map((c) => c.contributorUserId);
    void notifyMany(recipientIds, {
      kind: "FUND_EXPENSE_EXECUTED" as any,
      title: `Dépense exécutée — ${fund.name}`,
      body: `${amount} ${fullExpense.currency} versés : ${fullExpense.motive}`,
      link: `/dashboard/groups/${fund.groupId}/funds/${fundId}`,
      payload: { fundId, expenseId } as any,
    } as any).catch(() => undefined);
    for (const rid of recipientIds) {
      void sendFundEmail({
        kind: "EXPENSE_EXECUTED",
        toUserId: rid,
        fundName: fund.name,
        groupId: fund.groupId,
        fundId,
        expenseMotive: fullExpense.motive,
        amount,
        currency: fullExpense.currency,
      }).catch(() => undefined);
    }
  }

  return { id: expenseId, status: "EXECUTED" as const };
}

// ---------------------------------------------------------------------------
// 9. Lifecycle : clôturer une caisse
// ---------------------------------------------------------------------------

export async function closeFund(fundId: string, userId: string) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(fundId, userId);
  // Seul le créateur ou le trésorier peut clôturer
  if (fund.createdByUserId !== userId && fund.treasurerUserId !== userId) {
    throw Errors.forbidden(
      "Seul le créateur ou le trésorier peut clôturer la caisse.",
    );
  }
  if (fund.status === "CLOSED") {
    throw Errors.conflict("Cette caisse est déjà clôturée.");
  }
  await prisma.projectFund.update({
    where: { id: fundId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await recordEvent(fundId, "FUND_CLOSED", {}, userId);

  // V202.B/C — Notifier tous les contributeurs validés de la clôture.
  const balance = await computeFundBalance(fundId);
  const contribs = await prisma.fundContribution.findMany({
    where: { fundId, status: "VALIDATED" },
    distinct: ["contributorUserId"],
    select: { contributorUserId: true },
  });
  const recipientIds = contribs
    .map((c) => c.contributorUserId)
    .filter((id) => id !== userId);
  if (recipientIds.length > 0) {
    void notifyMany(recipientIds, {
      kind: "FUND_CLOSED" as any,
      title: `Caisse clôturée — ${fund.name}`,
      body: `Solde final ${balance.balance.toFixed(0)} ${fund.currency}. Le journal d'audit reste accessible.`,
      link: `/dashboard/groups/${fund.groupId}/funds/${fundId}`,
      payload: { fundId } as any,
    } as any).catch(() => undefined);
    for (const rid of recipientIds) {
      void sendFundEmail({
        kind: "FUND_CLOSED",
        toUserId: rid,
        fundName: fund.name,
        groupId: fund.groupId,
        fundId,
        balance: balance.balance,
        currency: fund.currency,
      }).catch(() => undefined);
    }
  }

  return { id: fundId, status: "CLOSED" as const };
}

// ---------------------------------------------------------------------------
// V202.E — Édition d'une caisse (mise à jour partielle des metadata)
// ---------------------------------------------------------------------------

export interface UpdateFundInput {
  name?: string;
  description?: string | null;
  targetAmount?: number | null;
  deadline?: string | null;
  treasurerUserId?: string | null;
  voteThreshold?: number | null;
  voteApprovalRatio?: number;
}

/**
 * V202.E — Met à jour les metadata d'une caisse. Seul le créateur ou le
 * trésorier peut éditer. Une caisse CLOSED/ARCHIVED ne peut plus être éditée.
 * Si on change le trésorier, l'ancien et le nouveau sont notifiés.
 */
export async function updateFund(
  fundId: string,
  input: UpdateFundInput,
  userId: string,
): Promise<{ id: string }> {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(fundId, userId);
  if (fund.status === "CLOSED" || fund.status === "ARCHIVED") {
    throw Errors.conflict("Cette caisse est clôturée et ne peut plus être modifiée.");
  }
  if (fund.createdByUserId !== userId && fund.treasurerUserId !== userId) {
    throw Errors.forbidden(
      "Seul le créateur ou le trésorier peut modifier cette caisse.",
    );
  }
  if (input.name !== undefined && input.name.trim().length < 2) {
    throw Errors.badRequest("Le nom de la caisse est trop court.");
  }
  if (
    input.targetAmount !== undefined &&
    input.targetAmount !== null &&
    input.targetAmount <= 0
  ) {
    throw Errors.badRequest("Le montant cible doit être strictement positif.");
  }
  if (input.deadline !== undefined && input.deadline !== null) {
    const d = new Date(input.deadline);
    if (Number.isNaN(d.getTime())) {
      throw Errors.badRequest("Date d'échéance invalide.");
    }
  }
  if (
    input.voteApprovalRatio !== undefined &&
    (input.voteApprovalRatio < 0.5 || input.voteApprovalRatio > 1)
  ) {
    throw Errors.badRequest(
      "Le ratio d'approbation doit être entre 0,50 et 1,00.",
    );
  }
  if (input.treasurerUserId && input.treasurerUserId !== fund.treasurerUserId) {
    await assertGroupMember(fund.groupId, input.treasurerUserId);
  }

  const oldTreasurerId = fund.treasurerUserId ?? fund.createdByUserId;
  const data: any = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined)
    data.description = input.description?.trim() || null;
  if (input.targetAmount !== undefined)
    data.targetAmount =
      input.targetAmount === null
        ? null
        : new Prisma.Decimal(input.targetAmount);
  if (input.deadline !== undefined)
    data.deadline = input.deadline === null ? null : new Date(input.deadline);
  if (input.treasurerUserId !== undefined)
    data.treasurerUserId = input.treasurerUserId;
  if (input.voteThreshold !== undefined)
    data.voteThreshold =
      input.voteThreshold === null
        ? null
        : new Prisma.Decimal(input.voteThreshold);
  if (input.voteApprovalRatio !== undefined)
    data.voteApprovalRatio = new Prisma.Decimal(input.voteApprovalRatio);

  await prisma.projectFund.update({ where: { id: fundId }, data });

  const treasurerChanged =
    input.treasurerUserId !== undefined &&
    input.treasurerUserId !== oldTreasurerId;
  await recordEvent(
    fundId,
    treasurerChanged ? "TREASURER_NAMED" : "FUND_UPDATED",
    {
      changes: Object.keys(input),
      ...(treasurerChanged
        ? { oldTreasurer: oldTreasurerId, newTreasurer: input.treasurerUserId }
        : {}),
    },
    userId,
  );

  // Notif au nouveau trésorier si changement
  if (
    treasurerChanged &&
    input.treasurerUserId &&
    input.treasurerUserId !== userId
  ) {
    void notifyOne(input.treasurerUserId, {
      kind: "FUND_TREASURER_NAMED" as any,
      title: `Tu es trésorier — ${fund.name}`,
      body: `Tu es désormais responsable de cette caisse. Tu valideras les cotisations et exécuteras les dépenses.`,
      link: `/dashboard/groups/${fund.groupId}/funds/${fundId}`,
      payload: { fundId } as any,
    } as any).catch(() => undefined);
  }

  return { id: fundId };
}

// ---------------------------------------------------------------------------
// V202.F — Lien public read-only (lecture par publicCode, sans auth)
// ---------------------------------------------------------------------------

/**
 * V202.F — Récupère un résumé public d'une caisse par son publicCode.
 * Pas d'auth requise. Renvoie metadata + balances + listes anonymisées
 * (juste prénoms des contributeurs, jamais d'email/tel).
 */
export async function getFundByPublicCode(publicCode: string) {
  await assertFeatureEnabled();
  const fund = await prisma.projectFund.findUnique({
    where: { publicCode },
    select: {
      id: true,
      publicCode: true,
      name: true,
      description: true,
      template: true,
      status: true,
      targetAmount: true,
      currency: true,
      deadline: true,
      createdAt: true,
      closedAt: true,
      group: { select: { name: true } },
      treasurer: { select: { displayName: true } },
    },
  });
  if (!fund) throw Errors.notFound("Cette caisse est introuvable.");

  const [balance, contributors] = await Promise.all([
    computeFundBalance(fund.id),
    prisma.fundContribution.findMany({
      where: { fundId: fund.id, status: "VALIDATED" },
      distinct: ["contributorUserId"],
      select: {
        contributor: { select: { displayName: true } },
      },
      take: 50,
    }),
  ]);

  return {
    fund,
    balance,
    contributors: contributors.map((c) => ({
      // Anonymisation : on garde juste le prénom (1er mot du displayName)
      firstName: c.contributor.displayName.split(" ")[0] ?? "?",
    })),
  };
}

// ---------------------------------------------------------------------------
// 10. Audit log : exporter pour transparence / régulateur / contributeurs
// ---------------------------------------------------------------------------

export async function getFundEvents(fundId: string, userId: string) {
  await assertFeatureEnabled();
  await getFundOrThrow(fundId, userId);
  return prisma.fundEvent.findMany({
    where: { fundId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      payload: true,
      actorUserId: true,
      previousHash: true,
      hash: true,
      createdAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// V222.C — Statut "qui est à jour" par membre × période
// ---------------------------------------------------------------------------

/**
 * V222.C — Calcule pour une caisse l'état de cotisation de chaque membre
 * sur chaque période depuis la création (ou startDate). Retour pensé pour
 * être directement consommable par la grille frontend « qui à jour vs en
 * retard ».
 *
 * Sémantique :
 *   - frequency === ONE_SHOT / CUSTOM → pas de notion de période → renvoie
 *     `periods = []` et chaque ligne membre n'a qu'un `contributedTotal`,
 *     `expectedTotal = null`, `late = 0`, `ahead = 0`, `upToDate = true`.
 *   - frequency régulière (MONTHLY/WEEKLY/BIWEEKLY) :
 *       * Énumère toutes les périodes de `createdAt` à maintenant.
 *       * Pour chaque membre du groupe : agrège les contributions VALIDÉES
 *         par période + total versé + total attendu (nbPériodes ×
 *         contributionAmount si FIXED, sinon attendu = null).
 *       * `late` = max(0, expected - contributed) — seulement en mode FIXED.
 *       * `ahead` = max(0, contributed - expected) — idem.
 *       * `upToDate` = vraie si late === 0.
 *   - FREE → expected = null pour chaque membre, `late = 0`, `ahead = 0`.
 *
 * Sont comptées comme « versées » :
 *   - VALIDATED → 100% comptées
 *   - PENDING   → ajoutée séparément dans `contributionsByPeriod` avec
 *                 status: "PENDING" (le front les affiche en saffron).
 */
export async function getFundContributionsStatus(
  groupId: string,
  fundId: string,
  userId: string,
) {
  await assertFeatureEnabled();
  const fund = await getFundOrThrow(fundId, userId);
  if (fund.groupId !== groupId) {
    throw Errors.notFound("Cette caisse n'appartient pas à ce groupe.");
  }

  const frequency = ((fund as any).frequency ?? "ONE_SHOT") as FundFrequency;
  const mode = ((fund as any).contributionMode ?? "FREE") as FundContributionMode;
  const fixedAmountDecimal = (fund as any).contributionAmount as
    | { toNumber: () => number }
    | null
    | undefined;
  const fixedAmount = fixedAmountDecimal ? fixedAmountDecimal.toNumber() : null;

  // Récupère membres du groupe + contributions de la caisse (tous statuts) en
  // parallèle. On exclut REJECTED de l'agrégation totaux (geste « refusé »
  // ne compte pas dans le solde du membre).
  const [members, contributions] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId },
      select: {
        userId: true,
        user: {
          select: { id: true, displayName: true, avatar: true },
        },
      },
    }),
    prisma.fundContribution.findMany({
      where: { fundId, status: { in: ["PENDING", "VALIDATED"] } },
      select: {
        id: true,
        contributorUserId: true,
        amount: true,
        amountInFundCurrency: true,
        currency: true,
        status: true,
        createdAt: true,
        // V222.C — Champs ajoutés par migration. Cast `any` pour rester
        // compatible si Prisma client pas encore régénéré.
      } as any,
    }),
  ]);

  const periods = listPeriodsForFund({
    frequency,
    startDate: null,
    createdAt: fund.createdAt,
    deadline: fund.deadline ?? null,
  });

  // Indexation : map<userId, totals + byPeriod>
  type ByPeriod = {
    amount: number;
    status: "PENDING" | "VALIDATED";
    contributionId: string;
    currency: string;
  };
  const byUser = new Map<
    string,
    {
      contributedTotal: number;
      pendingTotal: number;
      contributionsByPeriod: Record<string, ByPeriod>;
      contributionsCount: number;
    }
  >();
  for (const m of members) {
    byUser.set(m.userId, {
      contributedTotal: 0,
      pendingTotal: 0,
      contributionsByPeriod: {},
      contributionsCount: 0,
    });
  }

  for (const c of contributions) {
    const entry = byUser.get(c.contributorUserId);
    if (!entry) continue; // contributeur plus dans le groupe → ignore
    const amt =
      typeof c.amountInFundCurrency === "number"
        ? c.amountInFundCurrency
        : (c.amountInFundCurrency as any).toNumber();
    if (c.status === "VALIDATED") {
      entry.contributedTotal += amt;
      entry.contributionsCount += 1;
    } else if (c.status === "PENDING") {
      entry.pendingTotal += amt;
    }
    // Bucket par periodStart (clé ISO date string « yyyy-mm-dd »)
    const periodStart = (c as any).periodStart as Date | null | undefined;
    if (periodStart) {
      const key = new Date(periodStart).toISOString().slice(0, 10);
      // Si plusieurs contributions sur la même période : on agrège
      const existing = entry.contributionsByPeriod[key];
      if (existing) {
        existing.amount += amt;
        // Si une est VALIDATED, le badge devient VALIDATED ; sinon PENDING
        if (c.status === "VALIDATED") existing.status = "VALIDATED";
      } else {
        entry.contributionsByPeriod[key] = {
          amount: amt,
          status: c.status as "PENDING" | "VALIDATED",
          contributionId: c.id,
          currency: fund.currency,
        };
      }
    }
  }

  // Calcul expected/late/ahead par membre
  const periodsCount = periods.length;
  const expectedPerMember =
    mode === "FIXED" && fixedAmount !== null && periodsCount > 0
      ? fixedAmount * periodsCount
      : null;

  const membersStatus = members
    .map((m) => {
      const entry = byUser.get(m.userId)!;
      const contributed = Math.round(entry.contributedTotal * 100) / 100;
      const pending = Math.round(entry.pendingTotal * 100) / 100;
      const expected =
        expectedPerMember !== null
          ? Math.round(expectedPerMember * 100) / 100
          : null;
      const diff = expected !== null ? expected - contributed : 0;
      const late = diff > 0 ? Math.round(diff * 100) / 100 : 0;
      const ahead = diff < 0 ? Math.round(-diff * 100) / 100 : 0;
      return {
        userId: m.userId,
        displayName: m.user.displayName,
        avatar: m.user.avatar,
        contributedTotal: contributed,
        pendingTotal: pending,
        expectedTotal: expected,
        late,
        ahead,
        upToDate: expected === null ? true : late === 0,
        contributionsByPeriod: entry.contributionsByPeriod,
        contributionsCount: entry.contributionsCount,
      };
    })
    // Tri : en retard d'abord (urgent), puis à jour, puis ordre alpha
    .sort((a, b) => {
      if (a.late !== b.late) return b.late - a.late;
      return a.displayName.localeCompare(b.displayName);
    });

  // Totaux globaux
  const totalCollected = membersStatus.reduce(
    (s, m) => s + m.contributedTotal,
    0,
  );
  const totalExpected =
    expectedPerMember !== null
      ? Math.round(expectedPerMember * members.length * 100) / 100
      : null;
  const membersUpToDate = membersStatus.filter((m) => m.upToDate).length;

  return {
    fund: {
      id: fund.id,
      name: fund.name,
      frequency,
      contributionMode: mode,
      contributionAmount: fixedAmount,
      currency: fund.currency,
      startDate: fund.createdAt.toISOString(),
    },
    periods: periods.map((p) => ({
      start: p.start.toISOString(),
      end: p.end.toISOString(),
      label: p.label,
    })),
    membersStatus,
    totals: {
      collected: Math.round(totalCollected * 100) / 100,
      expected: totalExpected,
      membersUpToDate,
      membersTotal: members.length,
    },
  };
}
