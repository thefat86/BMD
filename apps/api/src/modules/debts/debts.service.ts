/**
 * V149.C — Service métier reconnaissance de dette (RDD).
 *
 * Logique :
 *  - createDebt(input) : crée DebtAgreement + DebtParty (créancier+débiteur)
 *    + génère automatiquement les DebtSchedule selon frequency/montant/taux
 *    + log DebtEvent CREATED
 *  - listMyDebts(userId) : retourne tous les contrats où user est partie
 *  - getDebt(id, userId) : détail contrat + schedules + parties + events
 *
 * Workflow général (à étendre dans futures sessions) :
 *   DRAFT → PROPOSED (envoi débiteur) → NEGOTIATING → SIGNED → ACTIVE
 *   → COMPLETED | DEFAULTED | DISPUTED | CANCELLED
 */

import { Prisma } from "@prisma/client";
import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
// V170.B — Notification au débiteur dès la création de la RDD
import { notifyOne } from "../notifications/notifications.service.js";
import { sendTemplatedEmail } from "../../lib/messaging.js";

// V149 — Cast `as any` car le client Prisma n'est pas toujours régénéré
// avec les nouveaux modèles DebtAgreement/DebtParty/DebtSchedule/DebtAmendment/
// DebtEvent dans certains environnements (sandbox CI, cache). En prod après
// `npx prisma generate`, les types sont corrects ; le cast garantit que tsc
// passe partout en attendant.
const prisma = prismaClient as any;

export interface CreateDebtInput {
  creatorUserId: string;
  amount: number;
  currency: string;
  interestRate: number;
  purpose?: string;
  endDate: Date;
  // V171.E — Ajout LUMP_SUM : paiement unique à la date d'échéance choisie.
  frequency:
    | "WEEKLY"
    | "MONTHLY"
    | "QUARTERLY"
    | "YEARLY"
    | "CUSTOM"
    | "LUMP_SUM";
  totalInstallments: number;
  signatureLevel?: "SIMPLE" | "ADVANCED" | "NOTARIZED";
  jurisdictionCode?: string;
  // Débiteur — soit un user BMD existant (debtorUserId), soit un invité (debtorContact + debtorName)
  debtorUserId?: string;
  debtorContact?: string;
  debtorName: string;
  /**
   * V165 — Mode rétroactif : la dette existait déjà avant la création.
   * Si true, on accepte une `startDate` passée et une liste `previousPayments[]`
   * de remboursements déjà reçus. Les schedules antérieurs au paiement cumulé
   * sont marqués PAID automatiquement.
   */
  isRetroactive?: boolean;
  /** V165 — Date d'origine du prêt (si rétroactif). Default: now() */
  pastStartDate?: Date;
  /**
   * V165 — Mode "Registre personnel" : aucun workflow proposition au débiteur,
   * pas de signature, status direct IN_PROGRESS (ou COMPLETED si tout reçu).
   * Idéal pour tracer ses créances entre amis/famille sans paperasse.
   */
  isPersonalLedger?: boolean;
  /**
   * V165 — Liste des remboursements déjà reçus avant la création de la RDD.
   * Utilisée uniquement si `isRetroactive=true`. Chaque entrée : montant + date.
   */
  previousPayments?: Array<{
    amount: number;
    paidAt: Date;
    notes?: string;
    method?: "CASH" | "TRANSFER" | "MOBILE_MONEY" | "OTHER";
  }>;
  /**
   * V242 — Texte libre éditable injecté dans le PDF brandé BMD.
   *  - `preamble`         : intro en italique (contexte, motivations…)
   *  - `additionalClauses`: clauses libres ajoutées avant les signatures
   *  - `footerNote`       : mention en pied de page (références, contact…)
   * Tous optionnels — vide = pas de section additionnelle dans le PDF.
   */
  preamble?: string;
  additionalClauses?: string;
  footerNote?: string;
}

/**
 * Calcule la mensualité d'un prêt selon la formule annuité standard :
 *   M = P × r / (1 - (1 + r)^-n)
 * où P = capital, r = taux périodique, n = nb d'échéances.
 * Si taux = 0, retourne juste P/n (pas d'intérêt).
 */
function computeInstallment(
  capital: number,
  annualRatePct: number,
  totalInstallments: number,
  frequency: CreateDebtInput["frequency"],
): { installment: number; capitalPerInstallment: number; interestPerInstallment: number } {
  const periodsPerYear: Record<string, number> = {
    WEEKLY: 52,
    MONTHLY: 12,
    QUARTERLY: 4,
    YEARLY: 1,
    CUSTOM: totalInstallments,
    // V171.E — Paiement unique à l'échéance : capital + intérêt cumulé sur la
    // période entre startDate et endDate. n=1 force une seule échéance.
    LUMP_SUM: 1,
  };
  const n = Math.max(1, frequency === "LUMP_SUM" ? 1 : totalInstallments);
  const r = (annualRatePct / 100) / periodsPerYear[frequency];
  let installment: number;
  if (r === 0) {
    installment = capital / n;
  } else {
    installment = (capital * r) / (1 - Math.pow(1 + r, -n));
  }
  // Approximation simple : capital part égal, intérêt = reste
  const capitalPerInstallment = capital / n;
  const interestPerInstallment = installment - capitalPerInstallment;
  return {
    installment: Math.round(installment * 100) / 100,
    capitalPerInstallment: Math.round(capitalPerInstallment * 100) / 100,
    interestPerInstallment: Math.round(interestPerInstallment * 100) / 100,
  };
}

/**
 * Génère les dates d'échéances selon la fréquence, en partant d'aujourd'hui.
 * Pour CUSTOM, on répartit uniformément entre startDate et endDate.
 */
function generateDueDates(
  startDate: Date,
  endDate: Date,
  frequency: CreateDebtInput["frequency"],
  totalInstallments: number,
): Date[] {
  const dates: Date[] = [];
  // V171.E — Paiement unique : 1 seule échéance, exactement à la date de fin.
  if (frequency === "LUMP_SUM") {
    return [new Date(endDate)];
  }
  if (frequency === "CUSTOM") {
    const totalMs = endDate.getTime() - startDate.getTime();
    const stepMs = totalMs / totalInstallments;
    for (let i = 1; i <= totalInstallments; i++) {
      dates.push(new Date(startDate.getTime() + stepMs * i));
    }
    return dates;
  }
  const incrementDays: Record<string, number> = {
    WEEKLY: 7,
    MONTHLY: 30, // approximation simple, on raffinera plus tard
    QUARTERLY: 91,
    YEARLY: 365,
    CUSTOM: 0,
    LUMP_SUM: 0,
  };
  const step = incrementDays[frequency];
  for (let i = 1; i <= totalInstallments; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + step * i);
    dates.push(d);
  }
  return dates;
}

export async function createDebt(input: CreateDebtInput) {
  // V152 — Quota plan : combien de RDD ce user peut-il créer ce mois ?
  // FREE = 1, PERSO/FAMILY/PRO = illimité.
  // Throw `plan_required` si le quota est atteint.
  const { assertCanCreateDebt } = await import(
    "./signature-billing.service.js"
  );
  await assertCanCreateDebt(input.creatorUserId);

  if (input.amount <= 0) {
    throw Errors.badRequest("Le montant doit être strictement positif");
  }
  // V171.E — En mode paiement unique, on force totalInstallments=1.
  // Ignore silencieusement tout autre nombre passé par le client.
  if (input.frequency === "LUMP_SUM") {
    input.totalInstallments = 1;
  }
  // V165 — En mode rétroactif/registre personnel, on autorise endDate dans le
  // passé (la dette était antérieure, peut être déjà soldée).
  const allowPastEndDate = input.isRetroactive || input.isPersonalLedger;
  if (!allowPastEndDate && input.endDate <= new Date()) {
    throw Errors.badRequest("La date de fin doit être dans le futur");
  }
  if (input.totalInstallments < 1 || input.totalInstallments > 120) {
    throw Errors.badRequest(
      "Le nombre d'échéances doit être entre 1 et 120 (10 ans max mensuel)",
    );
  }
  // V165 — Validation des paiements précédents si rétroactif
  if (input.previousPayments && input.previousPayments.length > 0) {
    if (!input.isRetroactive) {
      throw Errors.badRequest(
        "Les paiements précédents ne sont autorisés qu'en mode rétroactif (isRetroactive=true)",
      );
    }
    const totalPrevious = input.previousPayments.reduce(
      (s, p) => s + (p.amount > 0 ? p.amount : 0),
      0,
    );
    if (totalPrevious > input.amount * 1.0001) {
      // 0.01% tolerance pour rounding
      throw Errors.badRequest(
        `Le total des paiements déjà reçus (${totalPrevious.toFixed(2)}) dépasse le montant du prêt (${input.amount.toFixed(2)})`,
      );
    }
  }
  // V149 — Taux d'usure : on bloque > 22 % par défaut (max légal FR conso
  // petit montant). Affinera selon juridiction en V150.
  if (input.interestRate < 0 || input.interestRate > 22) {
    throw Errors.badRequest(
      "Taux d'intérêt hors limites (0 à 22 % maximum selon juridiction)",
    );
  }

  // V165 — En mode rétroactif, startDate peut être dans le passé (pastStartDate).
  const startDate =
    input.isRetroactive && input.pastStartDate
      ? input.pastStartDate
      : new Date();
  const { installment, capitalPerInstallment, interestPerInstallment } =
    computeInstallment(
      input.amount,
      input.interestRate,
      input.totalInstallments,
      input.frequency,
    );
  const dueDates = generateDueDates(
    startDate,
    input.endDate,
    input.frequency,
    input.totalInstallments,
  );

  // V165 — Calcul du total déjà payé (pour répartir sur les schedules)
  const totalPreviousPaid = (input.previousPayments ?? []).reduce(
    (s, p) => s + p.amount,
    0,
  );
  // Mode personalLedger : status direct selon état du paiement
  const isFullyPaidRetro =
    input.isRetroactive && totalPreviousPaid >= input.amount * 0.9999;
  const initialStatus = input.isPersonalLedger
    ? isFullyPaidRetro
      ? "COMPLETED"
      : "IN_PROGRESS"
    : "DRAFT";
  // En mode personalLedger, pas d'expiration (pas de proposition à valider)
  const expiresAt = input.isPersonalLedger
    ? null
    : new Date(Date.now() + 72 * 60 * 60 * 1000);

  const creator = await prisma.user.findUnique({
    where: { id: input.creatorUserId },
    select: { id: true, displayName: true },
  });
  if (!creator) throw Errors.notFound("Créancier introuvable");

  // Récupère le displayName du débiteur (priorité : user BMD > nom fourni)
  let debtorDisplayName = input.debtorName;
  if (input.debtorUserId) {
    const debtor = await prisma.user.findUnique({
      where: { id: input.debtorUserId },
      select: { displayName: true },
    });
    if (debtor) debtorDisplayName = debtor.displayName;
  }

  // Création atomique
  const result = await prisma.$transaction(async (tx: any) => {
    const debt = await tx.debtAgreement.create({
      data: {
        creatorUserId: input.creatorUserId,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency.toUpperCase(),
        interestRate: new Prisma.Decimal(input.interestRate),
        purpose: input.purpose,
        startDate,
        endDate: input.endDate,
        frequency: input.frequency,
        totalInstallments: input.totalInstallments,
        signatureLevel: input.signatureLevel ?? "ADVANCED",
        jurisdictionCode: input.jurisdictionCode ?? "FR",
        status: initialStatus,
        expiresAt,
        // V165 — flags rétroactif / registre personnel
        isRetroactive: input.isRetroactive === true,
        isPersonalLedger: input.isPersonalLedger === true,
        // En mode personalLedger avec dette soldée, on marque déjà completedAt
        completedAt: isFullyPaidRetro ? new Date() : null,
        // V242 — Texte libre éditable injecté dans le PDF brandé (preview/clauses)
        preamble: cleanFreeText(input.preamble),
        additionalClauses: cleanFreeText(input.additionalClauses),
        footerNote: cleanFreeText(input.footerNote),
      },
    });

    // Créancier — en mode personalLedger, signé d'emblée (création = engagement)
    await tx.debtParty.create({
      data: {
        debtId: debt.id,
        userId: input.creatorUserId,
        displayName: creator.displayName,
        role: "CREDITOR",
        signatureStatus: input.isPersonalLedger ? "SIGNED" : "PENDING",
        signedAt: input.isPersonalLedger ? new Date() : null,
      },
    });

    // Débiteur — en mode personalLedger, pas de signature attendue
    await tx.debtParty.create({
      data: {
        debtId: debt.id,
        userId: input.debtorUserId,
        inviteContact: input.debtorContact,
        displayName: debtorDisplayName,
        role: "DEBTOR",
        signatureStatus: input.isPersonalLedger ? "NOT_REQUIRED" : "PENDING",
      },
    });

    // V165 — Schedules : en mode rétroactif, on marque PAID ceux couverts
    // par les paiements précédents (du plus ancien au plus récent), et le
    // dernier schedule partiellement couvert reste PENDING avec un paidAmount.
    let remainingPaid = totalPreviousPaid;
    const schedulesData = dueDates.map((dueDate, i) => {
      const expected = installment;
      let scheduleStatus: "PENDING" | "PAID" | "PARTIAL" = "PENDING";
      let paidAmount = 0;
      if (input.isRetroactive && remainingPaid > 0) {
        if (remainingPaid >= expected - 0.001) {
          scheduleStatus = "PAID";
          paidAmount = expected;
          remainingPaid -= expected;
        } else {
          // Schedule partiellement couvert
          paidAmount = remainingPaid;
          // Si statut PARTIAL n'existe pas dans l'enum, on garde PENDING
          // avec paidAmount > 0 (le front interprétera).
          scheduleStatus = "PENDING";
          remainingPaid = 0;
        }
      }
      return {
        debtId: debt.id,
        sequenceNumber: i + 1,
        dueDate,
        expectedAmount: new Prisma.Decimal(expected),
        capitalAmount: new Prisma.Decimal(capitalPerInstallment),
        interestAmount: new Prisma.Decimal(interestPerInstallment),
        status: scheduleStatus,
        paidAmount: paidAmount > 0 ? new Prisma.Decimal(paidAmount) : null,
        paidAt: scheduleStatus === "PAID" ? dueDate : null,
      };
    });
    await tx.debtSchedule.createMany({ data: schedulesData });

    // V165 — Trace chaque paiement reçu individuellement (audit + UI historique)
    if (input.isRetroactive && input.previousPayments && input.previousPayments.length > 0) {
      await tx.debtSchedulePayment.createMany({
        data: input.previousPayments.map((p) => ({
          debtId: debt.id,
          amount: new Prisma.Decimal(p.amount),
          currency: input.currency.toUpperCase(),
          paidAt: p.paidAt,
          notes: p.notes ?? null,
          method: p.method ?? null,
        })),
      });
    }

    // Event audit
    await tx.debtEvent.create({
      data: {
        debtId: debt.id,
        actorUserId: input.creatorUserId,
        kind: "CREATED",
        payload: {
          amount: input.amount,
          currency: input.currency,
          installments: input.totalInstallments,
        },
      },
    });

    return debt;
  });

  // V170.B — Notification immédiate au débiteur (in-app + email + push) dès la
  // création du contrat, même en mode DRAFT/PERSONAL_LEDGER (avant l'éventuel
  // appel à proposeDebt). Hors transaction pour ne pas bloquer la création si
  // l'envoi échoue.
  if (input.debtorUserId) {
    try {
      const debtorUser = await (prismaClient as any).user.findUnique({
        where: { id: input.debtorUserId },
        select: { email: true, defaultLocale: true, displayName: true },
      });
      const creatorName = creator.displayName || "Quelqu'un";
      const amountStr = `${input.amount.toFixed(2)} ${input.currency}`;
      const link = `/dashboard/debts/${(result as any).id}`;
      await notifyOne(input.debtorUserId, {
        kind: "DEBT_PROPOSED" as any,
        senderUserId: input.creatorUserId,
        title: `${creatorName} t'envoie une reconnaissance de dette`,
        body: `Montant : ${amountStr}${input.purpose ? " · " + input.purpose : ""}. Ouvre BMD pour la consulter.`,
        link,
        payload: {
          debtId: (result as any).id,
          publicCode: (result as any).publicCode,
          amount: input.amount,
          currency: input.currency,
        },
      });
      if (debtorUser?.email) {
        const baseUrl =
          (await import("../../lib/env.js")).loadEnv().WEB_BASE_URL ??
          "https://www.backmesdo.com";
        await sendTemplatedEmail(
          debtorUser.email,
          {
            kind: "debtProposed",
            payload: {
              creditorName: creatorName,
              debtorName: debtorUser.displayName ?? debtorDisplayName,
              amount: String(input.amount),
              currency: input.currency,
              installmentsLabel: `${input.totalInstallments} échéance(s)`,
              rateLabel:
                input.interestRate === 0
                  ? "0 % (sans intérêt)"
                  : `${input.interestRate.toFixed(2).replace(".", ",")} %`,
              purpose: input.purpose ?? "",
              expiresAtLabel: "",
              contractUrl: `${baseUrl}${link}`,
            },
          },
          debtorUser.defaultLocale ?? "fr",
          input.debtorUserId,
        ).catch((err: Error) => {
          // eslint-disable-next-line no-console
          console.warn("[debts.createDebt] email send failed", err.message);
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[debts.createDebt] notification side-effect failed",
        (err as Error).message,
      );
    }
  }

  return result;
}

/**
 * V242 — Helper : nettoie un texte libre saisi par l'utilisateur avant
 * persistance. Trim + cap à 4 000 caractères (suffisant pour préambule /
 * clauses additionnelles / footer). Renvoie `null` si vide après trim.
 */
function cleanFreeText(input?: string | null): string | null {
  if (input === undefined || input === null) return null;
  const t = String(input).trim();
  if (t.length === 0) return null;
  return t.slice(0, 4000);
}

/**
 * V242 — Met à jour une RDD tant qu'elle n'est pas signée. Autorisé pour le
 * créateur uniquement, sur les statuts DRAFT ou PROPOSED (en cas de
 * proposition retirée pour ajustement). Accepte les champs cœur (montant /
 * échéances / fréquence) ET les 3 champs texte libre (V242).
 *
 * NB : si des champs cœur sont modifiés en PROPOSED, le créateur doit
 * d'abord retirer/annuler la proposition (futur). Pour V242 on autorise
 * uniquement la mise à jour des champs texte libre quand le statut est
 * PROPOSED — les autres champs nécessitent statut DRAFT.
 */
export interface UpdateDebtInput {
  amount?: number;
  interestRate?: number;
  purpose?: string;
  endDate?: Date;
  frequency?:
    | "WEEKLY"
    | "MONTHLY"
    | "QUARTERLY"
    | "YEARLY"
    | "CUSTOM"
    | "LUMP_SUM";
  totalInstallments?: number;
  signatureLevel?: "SIMPLE" | "ADVANCED" | "NOTARIZED";
  preamble?: string | null;
  additionalClauses?: string | null;
  footerNote?: string | null;
}

export async function updateDebt(
  debtId: string,
  actorUserId: string,
  input: UpdateDebtInput,
) {
  const debt = await prisma.debtAgreement.findFirst({
    where: { id: debtId },
    select: { id: true, creatorUserId: true, status: true },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");
  if (debt.creatorUserId !== actorUserId) {
    throw Errors.forbidden(
      "Seul le créateur du contrat peut le modifier",
    );
  }

  const isFreeTextOnly =
    input.amount === undefined &&
    input.interestRate === undefined &&
    input.purpose === undefined &&
    input.endDate === undefined &&
    input.frequency === undefined &&
    input.totalInstallments === undefined &&
    input.signatureLevel === undefined;

  // Champs cœur → DRAFT uniquement. Texte libre → DRAFT ou PROPOSED.
  if (!isFreeTextOnly && debt.status !== "DRAFT") {
    throw Errors.badRequest(
      `Les paramètres principaux ne sont modifiables qu'en DRAFT (statut actuel : ${debt.status})`,
    );
  }
  if (debt.status !== "DRAFT" && debt.status !== "PROPOSED") {
    throw Errors.badRequest(
      `Ce contrat n'est plus modifiable (statut actuel : ${debt.status})`,
    );
  }

  const data: any = {};
  if (input.amount !== undefined) data.amount = new Prisma.Decimal(input.amount);
  if (input.interestRate !== undefined)
    data.interestRate = new Prisma.Decimal(input.interestRate);
  if (input.purpose !== undefined) data.purpose = input.purpose;
  if (input.endDate !== undefined) data.endDate = input.endDate;
  if (input.frequency !== undefined) data.frequency = input.frequency;
  if (input.totalInstallments !== undefined)
    data.totalInstallments = input.totalInstallments;
  if (input.signatureLevel !== undefined)
    data.signatureLevel = input.signatureLevel;
  if (input.preamble !== undefined)
    data.preamble = cleanFreeText(input.preamble);
  if (input.additionalClauses !== undefined)
    data.additionalClauses = cleanFreeText(input.additionalClauses);
  if (input.footerNote !== undefined)
    data.footerNote = cleanFreeText(input.footerNote);

  const updated = await prisma.debtAgreement.update({
    where: { id: debtId },
    data,
    include: {
      parties: true,
      schedules: { orderBy: { sequenceNumber: "asc" } },
    },
  });
  await prisma.debtEvent.create({
    data: {
      debtId,
      actorUserId,
      kind: "UPDATED",
      payload: { fields: Object.keys(data) },
    },
  });
  return updated;
}

/**
 * V242 — Supprime DÉFINITIVEMENT une RDD encore en brouillon.
 *
 * Règles :
 *  - Statut **DRAFT uniquement** (pas encore proposée). Une RDD proposée
 *    doit passer par le flux d'annulation (CANCELLED) pour conserver
 *    l'historique côté débiteur.
 *  - Seul le **créateur** du contrat peut supprimer.
 *  - Cascade automatique sur DebtParty / DebtSchedule / DebtAmendment /
 *    DebtEvent / DebtSchedulePayment / SignatureCharge via Prisma
 *    `onDelete: Cascade` défini dans le schema.
 *
 * Renvoie `{ deletedId, publicCode }` pour confirmer la suppression côté UI.
 */
export async function deleteDebt(debtId: string, actorUserId: string) {
  const debt = await prisma.debtAgreement.findFirst({
    where: { id: debtId },
    select: {
      id: true,
      publicCode: true,
      creatorUserId: true,
      status: true,
    },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");
  if (debt.creatorUserId !== actorUserId) {
    throw Errors.forbidden(
      "Seul le créateur du contrat peut le supprimer",
    );
  }
  if (debt.status !== "DRAFT") {
    throw Errors.badRequest(
      "Cette RDD a déjà été proposée. Utilise « Annuler » plutôt que « Supprimer » pour conserver l'historique.",
    );
  }
  await prisma.debtAgreement.delete({ where: { id: debtId } });
  return { deletedId: debt.id, publicCode: debt.publicCode };
}

/**
 * Liste tous les contrats où user est partie (créancier, débiteur, témoin, garant).
 */
export async function listMyDebts(userId: string) {
  return prisma.debtAgreement.findMany({
    where: {
      OR: [
        { creatorUserId: userId },
        { parties: { some: { userId } } },
      ],
    },
    include: {
      parties: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          role: true,
          signatureStatus: true,
        },
      },
      schedules: {
        select: {
          id: true,
          sequenceNumber: true,
          dueDate: true,
          expectedAmount: true,
          status: true,
        },
        orderBy: { sequenceNumber: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Détail d'un contrat. Vérifie que user est partie (sinon 404).
 */
export async function getDebt(debtId: string, userId: string) {
  const debt = await prisma.debtAgreement.findFirst({
    where: {
      id: debtId,
      OR: [
        { creatorUserId: userId },
        { parties: { some: { userId } } },
      ],
    },
    include: {
      parties: true,
      schedules: { orderBy: { sequenceNumber: "asc" } },
      amendments: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!debt) throw Errors.notFound("Ce contrat est introuvable 🔍");
  return debt;
}

// ============================================================================
// V150.A — Workflow négociation : DRAFT → PROPOSED → ACCEPTED/REJECTED
// ============================================================================

/**
 * Le créancier envoie le contrat DRAFT au débiteur pour qu'il accepte ou refuse.
 *
 *  - Vérifie : user est créancier ET status === DRAFT
 *  - Met à jour status → PROPOSED, set expiresAt à 7 jours
 *  - Log DebtEvent kind=PROPOSED + payload {to: debtorUserId}
 *  - Notification (push + email) au débiteur — déclenchée par la route, pas ici
 *    pour garder le service pur (testable sans mocker email/push).
 *
 * Renvoie le contrat mis à jour pour que la route puisse l'utiliser dans la
 * notification (besoin du nom créancier, montant, etc.).
 */
export async function proposeDebt(debtId: string, actorUserId: string) {
  const debt = await prisma.debtAgreement.findFirst({
    where: { id: debtId },
    include: { parties: true },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");
  if (debt.creatorUserId !== actorUserId) {
    throw Errors.forbidden(
      "Seul le créancier (créateur du contrat) peut le proposer",
    );
  }
  if (debt.status !== "DRAFT") {
    throw Errors.badRequest(
      `Ce contrat ne peut plus être proposé (statut actuel : ${debt.status})`,
    );
  }
  // V150.A — Expiration de la proposition : 7 jours pour répondre.
  // Affinable par juridiction dans futures itérations.
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const debtor = debt.parties.find((p: any) => p.role === "DEBTOR");
  const updated = await prisma.$transaction(async (tx: any) => {
    const u = await tx.debtAgreement.update({
      where: { id: debtId },
      data: {
        status: "PROPOSED",
        expiresAt: newExpiresAt,
      },
      include: {
        parties: true,
        schedules: { orderBy: { sequenceNumber: "asc" } },
      },
    });
    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "PROPOSED",
        payload: {
          toUserId: debtor?.userId ?? null,
          toDisplayName: debtor?.displayName ?? null,
          expiresAt: newExpiresAt.toISOString(),
        },
      },
    });
    return u;
  });
  return updated;
}

/**
 * Le débiteur répond à un contrat PROPOSED.
 *
 * Actions possibles :
 *   - ACCEPT  : passe en NEGOTIATING (en attendant la phase signature) ou
 *               directement en SIGNED si signatureLevel = SIMPLE (futur :
 *               V150.C eIDAS pour ADVANCED/NOTARIZED).
 *   - REJECT  : passe en CANCELLED, le contrat est définitivement clos.
 *   - COUNTER : passe en NEGOTIATING avec une contre-proposition stockée dans
 *               un DebtAmendment (montant, taux, échéances que le débiteur
 *               souhaite renégocier). Le créancier reçoit la notif et peut
 *               accepter/refuser à son tour.
 *
 * NB : la signature légale (eIDAS) sera implémentée en V150.C avec Yousign.
 * Pour l'instant, ACCEPT passe directement le contrat en SIGNED si signatureLevel
 * = SIMPLE — sinon on s'arrête à NEGOTIATING en attendant l'intégration.
 */
export interface RespondInput {
  action: "ACCEPT" | "REJECT" | "COUNTER";
  counterProposal?: {
    amount?: number;
    interestRate?: number;
    totalInstallments?: number;
    reason?: string;
  };
}

export async function respondToDebt(
  debtId: string,
  actorUserId: string,
  input: RespondInput,
) {
  const debt = await prisma.debtAgreement.findFirst({
    where: { id: debtId },
    include: { parties: true },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");
  // Vérification : actor est bien le débiteur du contrat.
  const debtorParty = debt.parties.find(
    (p: any) => p.role === "DEBTOR" && p.userId === actorUserId,
  );
  if (!debtorParty) {
    throw Errors.forbidden(
      "Seul le débiteur peut répondre à ce contrat",
    );
  }
  if (debt.status !== "PROPOSED" && debt.status !== "NEGOTIATING") {
    throw Errors.badRequest(
      `Ce contrat n'attend pas de réponse (statut : ${debt.status})`,
    );
  }
  if (debt.expiresAt && new Date() > new Date(debt.expiresAt)) {
    throw Errors.badRequest(
      "La proposition a expiré. Demande au créancier de la renouveler.",
    );
  }

  if (input.action === "COUNTER" && !input.counterProposal) {
    throw Errors.badRequest(
      "Une contre-proposition nécessite au moins un changement (montant, taux ou échéances)",
    );
  }

  return prisma.$transaction(async (tx: any) => {
    if (input.action === "ACCEPT") {
      // V180 — Statut clair après acceptation du débiteur :
      // SIMPLE → SIGNED directement (signature électronique inline OK).
      // ADVANCED/NOTARIZED → ACCEPTED (statut explicite « le débiteur a
      // accepté, on attend la signature qualifiée eIDAS via Yousign »).
      // L'ancien code passait en NEGOTIATING ce qui était trompeur pour
      // le créancier qui voyait son contrat "en négociation" alors que
      // le débiteur l'avait accepté.
      const nextStatus =
        debt.signatureLevel === "SIMPLE" ? "SIGNED" : "ACCEPTED";
      const signedAt = nextStatus === "SIGNED" ? new Date() : null;
      const updated = await tx.debtAgreement.update({
        where: { id: debtId },
        data: {
          status: nextStatus,
          signedAt,
        },
        include: {
          parties: true,
          schedules: { orderBy: { sequenceNumber: "asc" } },
        },
      });
      // Le débiteur a signé sa partie
      await tx.debtParty.update({
        where: { id: debtorParty.id },
        data: { signatureStatus: "SIGNED", signedAt: new Date() },
      });
      await tx.debtEvent.create({
        data: {
          debtId,
          actorUserId,
          kind: "ACCEPTED",
          payload: { nextStatus, signatureLevel: debt.signatureLevel },
        },
      });
      return updated;
    }

    if (input.action === "REJECT") {
      const updated = await tx.debtAgreement.update({
        where: { id: debtId },
        data: {
          status: "CANCELLED",
        },
        include: {
          parties: true,
          schedules: { orderBy: { sequenceNumber: "asc" } },
        },
      });
      await tx.debtEvent.create({
        data: {
          debtId,
          actorUserId,
          kind: "REJECTED",
          payload: {},
        },
      });
      return updated;
    }

    // COUNTER
    // V179.A — DebtAmendment a un schéma par-champ (fieldName/previousValue/newValue).
    // On crée donc une ligne par changement (amount / interestRate / totalInstallments).
    const cp = input.counterProposal!;
    const reason = cp.reason ?? null;
    const changes: Array<{ field: string; prev: any; next: any }> = [];
    if (cp.amount !== undefined && cp.amount !== Number(debt.amount)) {
      changes.push({ field: "amount", prev: debt.amount, next: cp.amount });
    }
    if (
      cp.interestRate !== undefined &&
      cp.interestRate !== Number(debt.interestRate)
    ) {
      changes.push({
        field: "interestRate",
        prev: debt.interestRate,
        next: cp.interestRate,
      });
    }
    if (
      cp.totalInstallments !== undefined &&
      cp.totalInstallments !== debt.totalInstallments
    ) {
      changes.push({
        field: "totalInstallments",
        prev: debt.totalInstallments,
        next: cp.totalInstallments,
      });
    }
    if (changes.length === 0 && reason) {
      // Pas de changement chiffré, juste un message qualitatif (ex: "je préférerais 12 échéances")
      // → on enregistre un amendment "reason-only" sur un champ neutre.
      changes.push({ field: "reason", prev: "", next: reason });
    }
    for (const ch of changes) {
      await tx.debtAmendment.create({
        data: {
          debtId,
          proposedByUserId: actorUserId,
          fieldName: ch.field,
          previousValue: JSON.stringify(ch.prev ?? null),
          newValue: JSON.stringify(ch.next ?? null),
          reason,
          status: "PENDING",
        },
      });
    }
    const updated = await tx.debtAgreement.update({
      where: { id: debtId },
      data: {
        status: "NEGOTIATING",
      },
      include: {
        parties: true,
        schedules: { orderBy: { sequenceNumber: "asc" } },
        amendments: { orderBy: { createdAt: "desc" } },
      },
    });
    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "COUNTER_PROPOSED",
        payload: cp,
      },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// V150.B — Témoins & garants
// ---------------------------------------------------------------------------

export interface AddPartyInput {
  role: "WITNESS" | "GUARANTOR";
  /// User BMD existant (si déjà inscrit)
  userId?: string;
  /// Contact (téléphone ou email) si pas encore inscrit
  inviteContact?: string;
  /// Nom affiché
  displayName: string;
  /// Pour les garants : % du montant couvert (1-100, default 100)
  guarantorCoverage?: number;
  /// Pour les garants : jours après défaut avant activation (default 30)
  guarantorTriggerDays?: number;
}

/**
 * Ajoute un témoin ou garant à un contrat RDD.
 * Seul le créateur (créancier) ou le débiteur peut inviter.
 * Le contrat doit être en DRAFT ou NEGOTIATING (pas après signature).
 */
export async function addDebtParty(
  debtId: string,
  actorUserId: string,
  input: AddPartyInput
) {
  const debt = await prisma.debtAgreement.findUnique({
    where: { id: debtId },
    include: { parties: true },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");

  // Autorisation : créditeur ou débiteur uniquement
  const actorParty = debt.parties.find(
    (p: any) =>
      p.userId === actorUserId &&
      (p.role === "CREDITOR" || p.role === "DEBTOR")
  );
  if (!actorParty) {
    throw Errors.forbidden(
      "Seul le créditeur ou le débiteur peut inviter un témoin/garant"
    );
  }

  // Statut autorisé : on peut encore ajouter avant la signature finale
  const allowedStatus = ["DRAFT", "PROPOSED", "NEGOTIATING", "ACCEPTED"];
  if (!allowedStatus.includes(debt.status)) {
    throw Errors.badRequest(
      "Impossible d'ajouter une partie après la signature du contrat"
    );
  }

  // Validation rôle
  if (input.role !== "WITNESS" && input.role !== "GUARANTOR") {
    throw Errors.badRequest("Rôle invalide (WITNESS ou GUARANTOR uniquement)");
  }

  // Validation identité (userId OU inviteContact obligatoire)
  if (!input.userId && !input.inviteContact) {
    throw Errors.badRequest(
      "userId ou inviteContact obligatoire pour inviter une partie"
    );
  }

  // Anti-doublon : pas déjà partie au contrat
  if (input.userId) {
    const exists = debt.parties.find((p: any) => p.userId === input.userId);
    if (exists) {
      throw Errors.badRequest("Cette personne est déjà partie au contrat");
    }
  }
  if (input.inviteContact) {
    const exists = debt.parties.find(
      (p: any) => p.inviteContact === input.inviteContact
    );
    if (exists) {
      throw Errors.badRequest("Cette personne est déjà invitée au contrat");
    }
  }

  // Validation garant : coverage entre 1 et 100, triggerDays >= 0
  let coverage: number | undefined;
  let triggerDays: number | undefined;
  if (input.role === "GUARANTOR") {
    coverage = input.guarantorCoverage ?? 100;
    if (coverage <= 0 || coverage > 100) {
      throw Errors.badRequest(
        "guarantorCoverage doit être entre 1 et 100"
      );
    }
    triggerDays = input.guarantorTriggerDays ?? 30;
    if (triggerDays < 0 || triggerDays > 365) {
      throw Errors.badRequest(
        "guarantorTriggerDays doit être entre 0 et 365"
      );
    }
  }

  const party = await prisma.$transaction(async (tx: any) => {
    const created = await tx.debtParty.create({
      data: {
        debtId,
        userId: input.userId ?? null,
        inviteContact: input.inviteContact ?? null,
        displayName: input.displayName,
        role: input.role,
        signatureStatus: "PENDING",
        guarantorCoverage: coverage ?? null,
        guarantorTriggerDays: triggerDays ?? null,
      },
    });
    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: input.role === "WITNESS" ? "WITNESS_ADDED" : "GUARANTOR_ADDED",
        payload: {
          partyId: created.id,
          displayName: input.displayName,
          userId: input.userId ?? null,
          inviteContact: input.inviteContact ?? null,
          guarantorCoverage: coverage ?? null,
          guarantorTriggerDays: triggerDays ?? null,
        },
      },
    });
    return created;
  });

  return party;
}

/**
 * Retire un témoin ou garant d'un contrat RDD.
 * Seul l'inviteur initial (créditeur ou débiteur) ou la personne elle-même peut retirer.
 * Si la personne a déjà signé, on ne peut plus la retirer.
 */
export async function removeDebtParty(
  debtId: string,
  partyId: string,
  actorUserId: string
) {
  const debt = await prisma.debtAgreement.findUnique({
    where: { id: debtId },
    include: { parties: true },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");

  const party = debt.parties.find((p: any) => p.id === partyId);
  if (!party) throw Errors.notFound("Partie introuvable");

  // Ne pas pouvoir retirer le créancier ou débiteur
  if (party.role === "CREDITOR" || party.role === "DEBTOR") {
    throw Errors.badRequest(
      "Impossible de retirer le créancier ou le débiteur"
    );
  }

  // Si déjà signé, blocage
  if (party.signatureStatus === "SIGNED") {
    throw Errors.badRequest(
      "Impossible de retirer une personne ayant déjà signé"
    );
  }

  // Autorisation : créditeur/débiteur ou la personne elle-même
  const actorIsPrincipal = debt.parties.find(
    (p: any) =>
      p.userId === actorUserId &&
      (p.role === "CREDITOR" || p.role === "DEBTOR")
  );
  const actorIsSelf = party.userId === actorUserId;
  if (!actorIsPrincipal && !actorIsSelf) {
    throw Errors.forbidden(
      "Seuls le créditeur, le débiteur ou la personne concernée peuvent retirer"
    );
  }

  // Statut autorisé
  const allowedStatus = ["DRAFT", "PROPOSED", "NEGOTIATING", "ACCEPTED"];
  if (!allowedStatus.includes(debt.status)) {
    throw Errors.badRequest(
      "Impossible de modifier les parties après la signature du contrat"
    );
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.debtParty.delete({ where: { id: partyId } });
    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: party.role === "WITNESS" ? "WITNESS_REMOVED" : "GUARANTOR_REMOVED",
        payload: {
          partyId: party.id,
          displayName: party.displayName,
          role: party.role,
        },
      },
    });
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// V150.D — Médiation : signalement et résolution amiable de litige
// ---------------------------------------------------------------------------

export interface DisputeDebtInput {
  /// Catégorie du litige (anti-saisie libre pour faciliter le tri/analytics)
  category:
    | "NON_PAYMENT"        // le débiteur ne paie pas comme prévu
    | "WRONG_AMOUNT"       // désaccord sur le montant payé/dû
    | "BAD_FAITH"          // l'autre partie agit de mauvaise foi
    | "FORCED_AGREEMENT"   // contrainte / vice du consentement
    | "OTHER";             // motif libre, à préciser dans `reason`
  /// Description libre du litige (raison, contexte) — obligatoire (min 10 chars)
  reason: string;
}

/**
 * Passe un contrat RDD en statut DISPUTED.
 * Autorisé pour créditeur ou débiteur uniquement.
 * Statut de départ autorisé : SIGNED, ACTIVE, NEGOTIATING (pas DRAFT/PROPOSED/COMPLETED/CANCELLED).
 */
export async function disputeDebt(
  debtId: string,
  actorUserId: string,
  input: DisputeDebtInput,
) {
  const debt = await prisma.debtAgreement.findUnique({
    where: { id: debtId },
    include: { parties: true },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");

  // Autorisation : créditeur ou débiteur
  const actorParty = debt.parties.find(
    (p: any) =>
      p.userId === actorUserId &&
      (p.role === "CREDITOR" || p.role === "DEBTOR"),
  );
  if (!actorParty) {
    throw Errors.forbidden(
      "Seul le créditeur ou le débiteur peut signaler un litige",
    );
  }

  // Statut autorisé
  const allowedFrom = ["SIGNED", "ACTIVE", "NEGOTIATING"];
  if (!allowedFrom.includes(debt.status)) {
    throw Errors.badRequest(
      `Impossible de signaler un litige depuis le statut ${debt.status}`,
    );
  }

  // Validation input
  const validCategories = [
    "NON_PAYMENT",
    "WRONG_AMOUNT",
    "BAD_FAITH",
    "FORCED_AGREEMENT",
    "OTHER",
  ];
  if (!validCategories.includes(input.category)) {
    throw Errors.badRequest("Catégorie de litige invalide");
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < 10) {
    throw Errors.badRequest(
      "La raison du litige doit faire au moins 10 caractères",
    );
  }
  if (reason.length > 2000) {
    throw Errors.badRequest(
      "La raison du litige est trop longue (max 2000 caractères)",
    );
  }

  const previousStatus = debt.status;

  const updated = await prisma.$transaction(async (tx: any) => {
    const u = await tx.debtAgreement.update({
      where: { id: debtId },
      data: {
        status: "DISPUTED",
      },
      include: {
        parties: true,
        schedules: { orderBy: { sequenceNumber: "asc" } },
      },
    });
    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "DISPUTE_RAISED",
        payload: {
          category: input.category,
          reason,
          previousStatus,
          raisedByRole: actorParty.role,
        },
      },
    });
    return u;
  });

  return updated;
}

/**
 * Résout un litige amiablement et restaure le statut antérieur (ACTIVE par
 * défaut). Autorisé pour créditeur ou débiteur uniquement.
 *
 * Note : le statut "post-résolution" est déduit du dernier DebtEvent
 * DISPUTE_RAISED. Si on n'en trouve pas ou s'il pointe vers un statut
 * incompatible, on revient en ACTIVE par sécurité.
 */
export async function resolveDispute(
  debtId: string,
  actorUserId: string,
  resolution: { note?: string } = {},
) {
  const debt = await prisma.debtAgreement.findUnique({
    where: { id: debtId },
    include: { parties: true },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");

  const actorParty = debt.parties.find(
    (p: any) =>
      p.userId === actorUserId &&
      (p.role === "CREDITOR" || p.role === "DEBTOR"),
  );
  if (!actorParty) {
    throw Errors.forbidden(
      "Seul le créditeur ou le débiteur peut résoudre un litige",
    );
  }

  if (debt.status !== "DISPUTED") {
    throw Errors.badRequest(
      "Ce contrat n'est pas actuellement en litige",
    );
  }

  // Cherche le dernier DISPUTE_RAISED pour récupérer previousStatus
  const lastDispute = await prisma.debtEvent.findFirst({
    where: { debtId, kind: "DISPUTE_RAISED" },
    orderBy: { createdAt: "desc" },
  });
  const safeAllowed = ["SIGNED", "ACTIVE", "NEGOTIATING"];
  const fromPayload = (lastDispute?.payload as any)?.previousStatus as
    | string
    | undefined;
  const restoreTo =
    fromPayload && safeAllowed.includes(fromPayload) ? fromPayload : "ACTIVE";

  const note = (resolution.note ?? "").trim().slice(0, 2000);

  const updated = await prisma.$transaction(async (tx: any) => {
    const u = await tx.debtAgreement.update({
      where: { id: debtId },
      data: { status: restoreTo },
      include: {
        parties: true,
        schedules: { orderBy: { sequenceNumber: "asc" } },
      },
    });
    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "DISPUTE_RESOLVED",
        payload: {
          restoredStatus: restoreTo,
          resolvedByRole: actorParty.role,
          note: note || null,
        },
      },
    });
    return u;
  });

  return updated;
}

// ============================================================================
// V170.D — Déclaration de paiement (créancier OU débiteur)
// ----------------------------------------------------------------------------
// Cycle métier :
//   PENDING ─(débiteur déclare)→ PAID ─(créancier confirme)→ CONFIRMED
//   PENDING ─(créancier reçoit directement)─────────────────→ CONFIRMED
//
// Pour chaque transition, on :
//   1) Met à jour le DebtSchedule
//   2) Crée un DebtSchedulePayment trace
//   3) Crée un DebtEvent audit
//   4) Si tous les schedules sont CONFIRMED → DebtAgreement.status = COMPLETED
//   5) Hors transaction : notifyOne() + sendTemplatedEmail() vers l'autre partie
// ============================================================================

export interface DeclarePaymentInput {
  amount?: number;
  paidAt?: Date;
  method?: "CASH" | "TRANSFER" | "MOBILE_MONEY" | "OTHER";
  notes?: string;
}

interface PaymentRoleContext {
  debt: any;
  schedule: any;
  actorParty: any;
  otherParty: any;
}

/**
 * Charge le contrat + l'échéance + identifie le rôle de l'acteur et l'autre partie.
 * Throw 404/403 si pas de droit.
 */
async function loadPaymentContext(
  debtId: string,
  scheduleId: string,
  actorUserId: string,
  requiredRole: "CREDITOR" | "DEBTOR",
): Promise<PaymentRoleContext> {
  const debt = await prisma.debtAgreement.findUnique({
    where: { id: debtId },
    include: {
      parties: true,
      schedules: { orderBy: { sequenceNumber: "asc" } },
    },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");

  const schedule = debt.schedules.find((s: any) => s.id === scheduleId);
  if (!schedule)
    throw Errors.notFound("Échéance introuvable sur ce contrat");

  const actorParty = debt.parties.find(
    (p: any) => p.userId === actorUserId && p.role === requiredRole,
  );
  if (!actorParty) {
    throw Errors.forbidden(
      requiredRole === "CREDITOR"
        ? "Seul le créancier peut effectuer cette action"
        : "Seul le débiteur peut effectuer cette action",
    );
  }

  const otherRole = requiredRole === "CREDITOR" ? "DEBTOR" : "CREDITOR";
  const otherParty = debt.parties.find((p: any) => p.role === otherRole);

  return { debt, schedule, actorParty, otherParty };
}

/**
 * V170.D — Le créancier déclare avoir reçu un paiement.
 * Transition : PENDING/PAID/LATE → CONFIRMED (final).
 */
export async function markScheduleAsPaid(
  debtId: string,
  scheduleId: string,
  actorUserId: string,
  input: DeclarePaymentInput = {},
) {
  const { debt, schedule, actorParty, otherParty } = await loadPaymentContext(
    debtId,
    scheduleId,
    actorUserId,
    "CREDITOR",
  );

  if (schedule.status === "CONFIRMED") {
    throw Errors.badRequest("Cette échéance est déjà confirmée");
  }
  if (["CANCELLED", "DEFAULTED"].includes(debt.status)) {
    throw Errors.badRequest("Le contrat n'est plus actif");
  }

  const expected = Number(schedule.expectedAmount);
  const amount = input.amount && input.amount > 0 ? input.amount : expected;
  const paidAt = input.paidAt ?? new Date();

  const result = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.debtSchedule.update({
      where: { id: scheduleId },
      data: {
        status: "CONFIRMED",
        paidAmount: new Prisma.Decimal(amount),
        paidAt,
        confirmedAt: new Date(),
        paymentMethod: input.method ?? null,
        paymentReference: input.notes ? input.notes.slice(0, 200) : null,
      },
    });

    await tx.debtSchedulePayment.create({
      data: {
        debtId,
        amount: new Prisma.Decimal(amount),
        currency: debt.currency,
        paidAt,
        notes: input.notes
          ? `[schedule:${scheduleId}] ${input.notes}`.slice(0, 500)
          : `[schedule:${scheduleId}] Déclaré reçu par créancier`,
        method: input.method ?? null,
      },
    });

    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "INSTALLMENT_PAID",
        payload: {
          scheduleId,
          sequenceNumber: schedule.sequenceNumber,
          amount,
          method: input.method ?? null,
          declaredBy: "CREDITOR",
          finalStatus: "CONFIRMED",
        },
      },
    });

    // Auto-complete si tous les schedules sont CONFIRMED
    const remaining = await tx.debtSchedule.count({
      where: { debtId, status: { not: "CONFIRMED" } },
    });
    if (remaining === 0 && debt.status !== "COMPLETED") {
      await tx.debtAgreement.update({
        where: { id: debtId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      await tx.debtEvent.create({
        data: {
          debtId,
          actorUserId,
          kind: "COMPLETED",
          payload: { trigger: "all_schedules_confirmed" },
        },
      });
    }

    return updated;
  });

  // Notification hors transaction — au débiteur que le créancier a confirmé réception
  void notifyPaymentEvent({
    targetUserId: otherParty?.userId ?? null,
    actorUserId,
    debt,
    schedule,
    amount,
    direction: "CREDITOR_CONFIRMED_RECEIPT",
    actorName: actorParty.displayName,
    otherName: otherParty?.displayName ?? null,
  });

  return result;
}

/**
 * V170.D — Le débiteur déclare avoir payé une échéance (sous réserve de
 * confirmation par le créancier).
 * Transition : PENDING/LATE → PAID.
 */
export async function declareSchedulePayment(
  debtId: string,
  scheduleId: string,
  actorUserId: string,
  input: DeclarePaymentInput = {},
) {
  const { debt, schedule, actorParty, otherParty } = await loadPaymentContext(
    debtId,
    scheduleId,
    actorUserId,
    "DEBTOR",
  );

  if (schedule.status === "CONFIRMED") {
    throw Errors.badRequest("Cette échéance est déjà confirmée");
  }
  if (schedule.status === "PAID") {
    throw Errors.badRequest(
      "Tu as déjà déclaré ce paiement, en attente de confirmation du créancier",
    );
  }
  if (["CANCELLED", "DEFAULTED"].includes(debt.status)) {
    throw Errors.badRequest("Le contrat n'est plus actif");
  }

  const expected = Number(schedule.expectedAmount);
  const amount = input.amount && input.amount > 0 ? input.amount : expected;
  const paidAt = input.paidAt ?? new Date();

  const result = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.debtSchedule.update({
      where: { id: scheduleId },
      data: {
        status: "PAID",
        paidAmount: new Prisma.Decimal(amount),
        paidAt,
        paymentMethod: input.method ?? null,
        paymentReference: input.notes ? input.notes.slice(0, 200) : null,
      },
    });

    await tx.debtSchedulePayment.create({
      data: {
        debtId,
        amount: new Prisma.Decimal(amount),
        currency: debt.currency,
        paidAt,
        notes: input.notes
          ? `[schedule:${scheduleId}] ${input.notes}`.slice(0, 500)
          : `[schedule:${scheduleId}] Déclaré payé par débiteur (en attente confirmation)`,
        method: input.method ?? null,
      },
    });

    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "INSTALLMENT_PAID_DECLARED",
        payload: {
          scheduleId,
          sequenceNumber: schedule.sequenceNumber,
          amount,
          method: input.method ?? null,
          declaredBy: "DEBTOR",
          awaitingConfirmation: true,
        },
      },
    });

    return updated;
  });

  // Notification hors transaction — au créancier qu'il doit confirmer
  void notifyPaymentEvent({
    targetUserId: otherParty?.userId ?? null,
    actorUserId,
    debt,
    schedule,
    amount,
    direction: "DEBTOR_DECLARED_PAYMENT",
    actorName: actorParty.displayName,
    otherName: otherParty?.displayName ?? null,
  });

  return result;
}

/**
 * V172.E — Le créancier rejette/conteste une déclaration de paiement du
 * débiteur ("Je n'ai pas reçu ce paiement").
 * Transition : PAID → PENDING (annule la déclaration et la trace
 * DebtSchedulePayment associée).
 *
 * Notifie le débiteur qu'il doit clarifier la situation.
 */
export async function rejectDeclaredPayment(
  debtId: string,
  scheduleId: string,
  actorUserId: string,
  reason?: string,
) {
  const { debt, schedule, actorParty, otherParty } = await loadPaymentContext(
    debtId,
    scheduleId,
    actorUserId,
    "CREDITOR",
  );

  if (schedule.status !== "PAID") {
    throw Errors.badRequest(
      `Aucune déclaration de paiement à rejeter (statut actuel : ${schedule.status})`,
    );
  }

  const amount = Number(schedule.paidAmount ?? schedule.expectedAmount);
  const cleanReason = (reason ?? "").trim().slice(0, 500);

  const result = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.debtSchedule.update({
      where: { id: scheduleId },
      data: {
        status: "PENDING",
        paidAmount: null,
        paidAt: null,
        paymentMethod: null,
        paymentReference: null,
      },
    });

    // Supprime la dernière trace DebtSchedulePayment liée à ce schedule
    // (best-effort, on filtre par debtId + notes commençant par "[schedule:..]")
    await tx.debtSchedulePayment.deleteMany({
      where: {
        debtId,
        notes: { contains: `[schedule:${scheduleId}]` },
      },
    });

    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "INSTALLMENT_REJECTED",
        payload: {
          scheduleId,
          sequenceNumber: schedule.sequenceNumber,
          amount,
          rejectedBy: "CREDITOR",
          reason: cleanReason || null,
        },
      },
    });

    return updated;
  });

  // Notification au débiteur que sa déclaration n'a pas été acceptée
  void notifyPaymentRejection({
    targetUserId: otherParty?.userId ?? null,
    actorUserId,
    debt,
    schedule,
    amount,
    actorName: actorParty.displayName,
    otherName: otherParty?.displayName ?? null,
    reason: cleanReason,
  });

  return result;
}

/**
 * V170.D — Le créancier confirme un paiement précédemment déclaré par le débiteur.
 * Transition : PAID → CONFIRMED (final).
 */
export async function confirmDeclaredPayment(
  debtId: string,
  scheduleId: string,
  actorUserId: string,
) {
  const { debt, schedule, actorParty, otherParty } = await loadPaymentContext(
    debtId,
    scheduleId,
    actorUserId,
    "CREDITOR",
  );

  if (schedule.status !== "PAID") {
    throw Errors.badRequest(
      `Cette échéance n'est pas en attente de confirmation (statut actuel : ${schedule.status})`,
    );
  }
  if (["CANCELLED", "DEFAULTED"].includes(debt.status)) {
    throw Errors.badRequest("Le contrat n'est plus actif");
  }

  const amount = Number(schedule.paidAmount ?? schedule.expectedAmount);

  const result = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.debtSchedule.update({
      where: { id: scheduleId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    await tx.debtEvent.create({
      data: {
        debtId,
        actorUserId,
        kind: "INSTALLMENT_CONFIRMED",
        payload: {
          scheduleId,
          sequenceNumber: schedule.sequenceNumber,
          amount,
          confirmedBy: "CREDITOR",
        },
      },
    });

    const remaining = await tx.debtSchedule.count({
      where: { debtId, status: { not: "CONFIRMED" } },
    });
    if (remaining === 0 && debt.status !== "COMPLETED") {
      await tx.debtAgreement.update({
        where: { id: debtId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      await tx.debtEvent.create({
        data: {
          debtId,
          actorUserId,
          kind: "COMPLETED",
          payload: { trigger: "all_schedules_confirmed" },
        },
      });
    }

    return updated;
  });

  // Notification au débiteur que sa déclaration a été validée
  void notifyPaymentEvent({
    targetUserId: otherParty?.userId ?? null,
    actorUserId,
    debt,
    schedule,
    amount,
    direction: "CREDITOR_CONFIRMED_DECLARATION",
    actorName: actorParty.displayName,
    otherName: otherParty?.displayName ?? null,
  });

  return result;
}

// V170.D — Notification side-effect (push + email) émise vers l'autre partie
// après chaque déclaration ou confirmation de paiement. Fail-soft (try/catch).
async function notifyPaymentEvent(args: {
  targetUserId: string | null;
  actorUserId: string;
  debt: any;
  schedule: any;
  amount: number;
  direction:
    | "DEBTOR_DECLARED_PAYMENT"
    | "CREDITOR_CONFIRMED_RECEIPT"
    | "CREDITOR_CONFIRMED_DECLARATION";
  actorName: string;
  otherName: string | null;
}): Promise<void> {
  const {
    targetUserId,
    actorUserId,
    debt,
    schedule,
    amount,
    direction,
    actorName,
  } = args;
  if (!targetUserId) return; // pas de user BMD lié → silent

  try {
    const amountStr = `${amount.toFixed(2)} ${debt.currency}`;
    const link = `/dashboard/debts/${debt.id}`;
    const seq = schedule.sequenceNumber;
    let title = "";
    let body = "";

    if (direction === "DEBTOR_DECLARED_PAYMENT") {
      title = `${actorName} a déclaré un paiement (échéance ${seq})`;
      body = `${amountStr} déclaré payé sur la RDD ${debt.publicCode ?? ""}. Confirme la réception dans BMD.`;
    } else if (direction === "CREDITOR_CONFIRMED_RECEIPT") {
      title = `${actorName} a confirmé avoir reçu ton paiement (échéance ${seq})`;
      body = `${amountStr} marqué comme reçu. Le paiement est désormais validé.`;
    } else {
      title = `${actorName} a validé ta déclaration de paiement (échéance ${seq})`;
      body = `${amountStr} confirmé. Le paiement est désormais soldé.`;
    }

    await notifyOne(targetUserId, {
      kind:
        direction === "DEBTOR_DECLARED_PAYMENT"
          ? ("SETTLEMENT_PROPOSED" as any)
          : ("SETTLEMENT_CONFIRMED" as any),
      senderUserId: actorUserId,
      title,
      body,
      link,
      payload: {
        debtId: debt.id,
        scheduleId: schedule.id,
        sequenceNumber: seq,
        amount,
        currency: debt.currency,
        direction,
      },
    });

    // Email best-effort — utilise sendEmail brut (pas de template dédié encore).
    try {
      const targetUser = await (prismaClient as any).user.findUnique({
        where: { id: targetUserId },
        select: { email: true },
      });
      if (targetUser?.email) {
        const baseUrl =
          (await import("../../lib/env.js")).loadEnv().WEB_BASE_URL ??
          "https://www.backmesdo.com";
        const { sendEmail } = await import("../../lib/messaging.js");
        const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="color:#2B1F15;font-size:18px;margin:0 0 12px;">${escapeHtml(title)}</h2>
  <p style="color:#6B5A47;font-size:14px;line-height:1.5;margin:0 0 20px;">${escapeHtml(body)}</p>
  <a href="${baseUrl}${link}" style="display:inline-block;padding:10px 18px;background:#1F7A57;color:#FFF;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Ouvrir BMD</a>
  <p style="color:#9F8A72;font-size:11px;margin:24px 0 0;">BMD · Reconnaissances de dette · L'argent partagé. L'amitié protégée.</p>
</div>`;
        const text = `${title}\n\n${body}\n\nOuvrir BMD : ${baseUrl}${link}`;
        await sendEmail(
          { to: targetUser.email, subject: title, text, html },
          targetUserId,
        ).catch(() => undefined);
      }
    } catch {
      // ignore mail failure
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[debts.notifyPaymentEvent] failed silently:",
      (e as Error).message,
    );
  }
}

// V172.E — Notification au débiteur quand le créancier rejette sa déclaration.
async function notifyPaymentRejection(args: {
  targetUserId: string | null;
  actorUserId: string;
  debt: any;
  schedule: any;
  amount: number;
  actorName: string;
  otherName: string | null;
  reason: string;
}): Promise<void> {
  const { targetUserId, actorUserId, debt, schedule, amount, actorName, reason } =
    args;
  if (!targetUserId) return;

  try {
    const amountStr = `${amount.toFixed(2)} ${debt.currency}`;
    const link = `/dashboard/debts/${debt.id}`;
    const seq = schedule.sequenceNumber;
    const title = `${actorName} n'a pas confirmé ton paiement (échéance ${seq})`;
    const body = reason
      ? `${amountStr} sur RDD ${debt.publicCode ?? ""}. Motif : ${reason}. Ouvre BMD pour clarifier.`
      : `${amountStr} sur RDD ${debt.publicCode ?? ""}. Vérifiez ensemble dans BMD et redéclare si besoin.`;

    await notifyOne(targetUserId, {
      kind: "SETTLEMENT_PROPOSED" as any,
      senderUserId: actorUserId,
      title,
      body,
      link,
      payload: {
        debtId: debt.id,
        scheduleId: schedule.id,
        sequenceNumber: seq,
        amount,
        currency: debt.currency,
        direction: "CREDITOR_REJECTED_DECLARATION",
        reason: reason || null,
      },
    });

    // Email brut best-effort
    try {
      const targetUser = await (prismaClient as any).user.findUnique({
        where: { id: targetUserId },
        select: { email: true },
      });
      if (targetUser?.email) {
        const baseUrl =
          (await import("../../lib/env.js")).loadEnv().WEB_BASE_URL ??
          "https://www.backmesdo.com";
        const { sendEmail } = await import("../../lib/messaging.js");
        const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="color:#2B1F15;font-size:18px;margin:0 0 12px;">${escapeHtml(title)}</h2>
  <p style="color:#6B5A47;font-size:14px;line-height:1.5;margin:0 0 20px;">${escapeHtml(body)}</p>
  <a href="${baseUrl}${link}" style="display:inline-block;padding:10px 18px;background:#9F4628;color:#FFF;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Ouvrir BMD</a>
  <p style="color:#9F8A72;font-size:11px;margin:24px 0 0;">BMD · Reconnaissances de dette · L'argent partagé. L'amitié protégée.</p>
</div>`;
        const text = `${title}\n\n${body}\n\nOuvrir BMD : ${baseUrl}${link}`;
        await sendEmail(
          { to: targetUser.email, subject: title, text, html },
          targetUserId,
        ).catch(() => undefined);
      }
    } catch {
      // ignore mail failure
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[debts.notifyPaymentRejection] failed silently:",
      (e as Error).message,
    );
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
