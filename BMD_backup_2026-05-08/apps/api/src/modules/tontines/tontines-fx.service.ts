/**
 * Tontines transfrontalières (spec §3.4 §4.4) — multi-devises live.
 *
 * Cas d'usage emblématique : tontine Paris ↔ Yaoundé ↔ Dakar
 *  - Aïcha (Paris) cotise en EUR
 *  - Marie (Yaoundé) cotise en XAF
 *  - Mamadou (Dakar) cotise en XOF
 *
 * La tontine a une devise de référence (`currency`) — ex: EUR. Le montant
 * stocké (`contributionAmount`) est dans cette devise. Pour chaque membre,
 * on calcule en live l'équivalent dans **sa propre devise préférée**
 * (User.defaultCurrency) au taux du jour.
 *
 * À la déclaration de paiement, le contributeur peut indiquer la devise
 * effectivement utilisée (paymentMethod = "Wave XOF"). Le pivot reste
 * la devise de la tontine pour le calcul des soldes.
 */
import { prisma } from "../../lib/db.js";
import { convert } from "../../lib/fx.js";

export interface MemberContributionView {
  /** UserId du contributeur */
  contributorUserId: string;
  /** Nom du contributeur */
  contributorName: string;
  /** Statut Prisma de la cotisation */
  status: string;
  /** Devise de la tontine (référence) */
  tontineCurrency: string;
  /** Montant dans la devise de la tontine (toujours fixe) */
  amountInTontineCurrency: string;
  /** Devise préférée du contributeur (peut différer) */
  contributorCurrency: string;
  /** Montant équivalent dans la devise du contributeur (calculé live au taux du jour) */
  amountInContributorCurrency: string;
  /** Indique si une conversion a été appliquée (devise différente) */
  hasConversion: boolean;
  /** Taux appliqué (1 unité tontine = X unités contributeur). Null si même devise. */
  appliedRate: number | null;
  /** Date à laquelle le taux a été calculé (ISO) */
  ratedAt: string;
}

/**
 * Pour un tour donné, retourne la vue multi-devises de chaque cotisation.
 * Coût : O(N) sur les contributeurs + 1 query pour la tontine + 1 batch users.
 */
export async function getTurnContributionsCrossCurrency(input: {
  turnId: string;
}): Promise<{
  turnId: string;
  tontineCurrency: string;
  contributions: MemberContributionView[];
}> {
  const turn = await prisma.tontineTurn.findUnique({
    where: { id: input.turnId },
    include: {
      tontine: { select: { currency: true } },
      contributions: {
        include: {
          contributor: {
            select: { id: true, displayName: true, defaultCurrency: true },
          },
        },
      },
    },
  });
  if (!turn) {
    throw new Error("Turn not found");
  }

  const tontineCurrency = turn.tontine.currency;
  const ratedAt = new Date().toISOString();

  const views: MemberContributionView[] = await Promise.all(
    turn.contributions.map(async (c) => {
      const contributorCurrency = c.contributor.defaultCurrency || tontineCurrency;
      const amountInTontineCurrency = c.amount.toString();
      let amountInContributorCurrency = amountInTontineCurrency;
      let appliedRate: number | null = null;
      let hasConversion = false;

      if (contributorCurrency !== tontineCurrency) {
        try {
          const converted = await convert(
            parseFloat(amountInTontineCurrency),
            tontineCurrency,
            contributorCurrency,
          );
          amountInContributorCurrency = converted.toFixed(2);
          appliedRate = converted / parseFloat(amountInTontineCurrency);
          hasConversion = true;
        } catch {
          // Si la conversion échoue (devise inconnue), on garde la valeur originale
          amountInContributorCurrency = amountInTontineCurrency;
        }
      }

      return {
        contributorUserId: c.contributorUserId,
        contributorName: c.contributor.displayName,
        status: c.status,
        tontineCurrency,
        amountInTontineCurrency,
        contributorCurrency,
        amountInContributorCurrency,
        hasConversion,
        appliedRate,
        ratedAt,
      };
    }),
  );

  return {
    turnId: turn.id,
    tontineCurrency,
    contributions: views,
  };
}

/**
 * Pour un user spécifique : calcule le montant qu'il doit verser
 * dans sa devise locale pour une cotisation donnée.
 *
 * Utilisé par l'UI de paiement Mobile Money pour afficher
 * « Tu dois envoyer 65 600 XAF (équivalent à 100 EUR) ».
 */
export async function getMyContributionAmount(input: {
  contributionId: string;
  userId: string;
}): Promise<{
  amountInTontineCurrency: string;
  tontineCurrency: string;
  amountInMyCurrency: string;
  myCurrency: string;
  hasConversion: boolean;
  rate: number | null;
}> {
  const c = await prisma.tontineContribution.findUnique({
    where: { id: input.contributionId },
    include: {
      contributor: { select: { defaultCurrency: true } },
      turn: { include: { tontine: { select: { currency: true } } } },
    },
  });
  if (!c) throw new Error("Contribution not found");
  if (c.contributorUserId !== input.userId) {
    throw new Error("Not your contribution");
  }
  const tontineCurrency = c.turn.tontine.currency;
  const myCurrency = c.contributor.defaultCurrency || tontineCurrency;
  const amountInTontineCurrency = c.amount.toString();

  if (myCurrency === tontineCurrency) {
    return {
      amountInTontineCurrency,
      tontineCurrency,
      amountInMyCurrency: amountInTontineCurrency,
      myCurrency,
      hasConversion: false,
      rate: null,
    };
  }

  try {
    const converted = await convert(
      parseFloat(amountInTontineCurrency),
      tontineCurrency,
      myCurrency,
    );
    return {
      amountInTontineCurrency,
      tontineCurrency,
      amountInMyCurrency: converted.toFixed(2),
      myCurrency,
      hasConversion: true,
      rate: converted / parseFloat(amountInTontineCurrency),
    };
  } catch {
    // Fallback : devise inconnue → on retourne le montant original
    return {
      amountInTontineCurrency,
      tontineCurrency,
      amountInMyCurrency: amountInTontineCurrency,
      myCurrency: tontineCurrency,
      hasConversion: false,
      rate: null,
    };
  }
}
