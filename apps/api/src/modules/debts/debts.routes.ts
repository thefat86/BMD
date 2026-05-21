/**
 * V149.C — Routes HTTP module reconnaissance de dette (RDD).
 *
 * Endpoints :
 *   POST /debts          → crée un contrat (status DRAFT)
 *   GET  /debts          → liste mes contrats (créancier OU débiteur)
 *   GET  /debts/:id      → détail d'un contrat
 *
 * Authentification : toutes les routes requièrent un user connecté.
 * Validation : zod schemas pour les body. Erreurs en JSON.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDebt,
  getDebt,
  listMyDebts,
  proposeDebt,
  respondToDebt,
  addDebtParty,
  removeDebtParty,
  disputeDebt,
  resolveDispute,
  // V170.D — Déclaration de paiement
  markScheduleAsPaid,
  declareSchedulePayment,
  confirmDeclaredPayment,
  // V172.E — Rejet de déclaration de paiement (créancier)
  rejectDeclaredPayment,
  // V242 — Édition (clauses libres) + suppression DRAFT
  updateDebt,
  deleteDebt,
} from "./debts.service.js";
import { getDebtsUsage } from "./signature-billing.service.js";
import { generateDebtCertificatePdf } from "./debt-certificate.service.js";
import {
  isYousignConfigured,
  createYousignSignatureRequest,
  getYousignSignatureRequest,
  cancelYousignSignatureRequest,
} from "./yousign.service.js";
import { notifyOne } from "../notifications/notifications.service.js";
import { sendTemplatedEmail } from "../../lib/messaging.js";
import { prisma } from "../../lib/db.js";
import { loadEnv } from "../../lib/env.js";

const createDebtSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).default("EUR"),
  interestRate: z.number().min(0).max(22).default(0),
  purpose: z.string().max(200).optional(),
  endDate: z.string().datetime({ offset: true }),
  frequency: z
    // V171.E — Ajout du mode LUMP_SUM (paiement unique à la date d'échéance).
    .enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM", "LUMP_SUM"])
    .default("MONTHLY"),
  totalInstallments: z.number().int().min(1).max(120),
  signatureLevel: z.enum(["SIMPLE", "ADVANCED", "NOTARIZED"]).optional(),
  jurisdictionCode: z.string().min(2).max(4).optional(),
  debtorUserId: z.string().uuid().optional(),
  debtorContact: z.string().min(3).max(120).optional(),
  debtorName: z.string().min(1).max(120),
  // V165 — RDD rétroactive / registre personnel
  isRetroactive: z.boolean().optional(),
  pastStartDate: z.string().datetime({ offset: true }).optional(),
  isPersonalLedger: z.boolean().optional(),
  previousPayments: z
    .array(
      z.object({
        amount: z.number().positive(),
        paidAt: z.string().datetime({ offset: true }),
        notes: z.string().max(500).optional(),
        method: z.enum(["CASH", "TRANSFER", "MOBILE_MONEY", "OTHER"]).optional(),
      }),
    )
    .max(60)
    .optional(),
  // V242 — Texte libre éditable injecté dans le PDF brandé BMD
  preamble: z.string().max(4000).optional(),
  additionalClauses: z.string().max(4000).optional(),
  footerNote: z.string().max(4000).optional(),
});

// V242 — Schéma d'édition (PATCH /debts/:id). Tous les champs sont
// optionnels — on update uniquement ce qui est envoyé. Les champs cœur
// (montant, échéances, etc.) ne sont acceptés qu'en statut DRAFT côté
// service. Les 3 champs texte libre acceptent aussi `null` pour effacer.
const updateDebtSchema = z.object({
  amount: z.number().positive().optional(),
  interestRate: z.number().min(0).max(22).optional(),
  purpose: z.string().max(200).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  frequency: z
    .enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM", "LUMP_SUM"])
    .optional(),
  totalInstallments: z.number().int().min(1).max(120).optional(),
  signatureLevel: z.enum(["SIMPLE", "ADVANCED", "NOTARIZED"]).optional(),
  preamble: z.string().max(4000).nullable().optional(),
  additionalClauses: z.string().max(4000).nullable().optional(),
  footerNote: z.string().max(4000).nullable().optional(),
});

export async function debtsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * V169 — GET /me/debts-usage : compteur RDD du mois (pour <DebtCounter>).
   * Retourne used / max / planCode + quotas signatures inclus pour le frontend.
   */
  app.get("/me/debts-usage", async (req) => {
    return getDebtsUsage(req.user.sub);
  });

  /**
   * POST /debts — crée un nouveau contrat de reconnaissance de dette.
   */
  app.post("/debts", async (req, reply) => {
    const body = createDebtSchema.parse(req.body);
    const debt = await createDebt({
      creatorUserId: req.user.sub,
      amount: body.amount,
      currency: body.currency,
      interestRate: body.interestRate,
      purpose: body.purpose,
      endDate: new Date(body.endDate),
      frequency: body.frequency,
      totalInstallments: body.totalInstallments,
      signatureLevel: body.signatureLevel,
      jurisdictionCode: body.jurisdictionCode,
      debtorUserId: body.debtorUserId,
      debtorContact: body.debtorContact,
      debtorName: body.debtorName,
      // V165 — RDD rétroactive / registre personnel
      isRetroactive: body.isRetroactive,
      isPersonalLedger: body.isPersonalLedger,
      pastStartDate: body.pastStartDate ? new Date(body.pastStartDate) : undefined,
      previousPayments: body.previousPayments?.map((p) => ({
        amount: p.amount,
        paidAt: new Date(p.paidAt),
        notes: p.notes,
        method: p.method,
      })),
      // V242 — Texte libre éditable (préambule, clauses, footer)
      preamble: body.preamble,
      additionalClauses: body.additionalClauses,
      footerNote: body.footerNote,
    });
    return reply.code(201).send({
      id: debt.id,
      publicCode: debt.publicCode,
      status: debt.status,
    });
  });

  /**
   * V242 — PATCH /debts/:id : édite une RDD encore modifiable.
   *
   * Règles :
   *  - Créateur du contrat uniquement.
   *  - Statut DRAFT : tous les champs (cœur + texte libre).
   *  - Statut PROPOSED : uniquement les 3 champs texte libre
   *    (préambule / clauses / footer). Pas de modification du montant ou
   *    des échéances sans repasser en DRAFT.
   *  - Autres statuts : refusé (400).
   */
  app.patch("/debts/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = updateDebtSchema.parse(req.body);
    const debt: any = await updateDebt(id, req.user.sub, {
      amount: body.amount,
      interestRate: body.interestRate,
      purpose: body.purpose,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      frequency: body.frequency,
      totalInstallments: body.totalInstallments,
      signatureLevel: body.signatureLevel,
      preamble: body.preamble,
      additionalClauses: body.additionalClauses,
      footerNote: body.footerNote,
    });
    return reply.code(200).send({
      id: debt.id,
      status: debt.status,
      updatedAt: debt.updatedAt?.toISOString() ?? new Date().toISOString(),
    });
  });

  /**
   * V242 — DELETE /debts/:id : supprime DÉFINITIVEMENT une RDD en DRAFT.
   *
   * Règles :
   *  - Créateur uniquement.
   *  - Statut DRAFT uniquement (404 sinon — sur PROPOSED ou +, utiliser
   *    le flux d'annulation pour conserver l'historique).
   *  - Cascade automatique sur DebtParty / Schedule / Event / Amendment /
   *    SignatureCharge via `onDelete: Cascade` du schema Prisma.
   */
  app.delete("/debts/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await deleteDebt(id, req.user.sub);
    return reply.code(200).send(result);
  });

  /**
   * GET /debts — liste mes contrats (créancier ou débiteur).
   */
  app.get("/debts", async (req) => {
    const debts: any[] = (await listMyDebts(req.user.sub)) as any[];
    return {
      debts: debts.map((d: any) => ({
        id: d.id,
        publicCode: d.publicCode,
        status: d.status,
        amount: d.amount.toString(),
        currency: d.currency,
        interestRate: d.interestRate.toString(),
        purpose: d.purpose,
        endDate: d.endDate.toISOString(),
        frequency: d.frequency,
        totalInstallments: d.totalInstallments,
        signatureLevel: d.signatureLevel,
        creatorUserId: d.creatorUserId,
        myRole:
          d.parties.find((p: any) => p.userId === req.user.sub)?.role ??
          "UNKNOWN",
        parties: d.parties.map((p: any) => ({
          id: p.id,
          userId: p.userId,
          displayName: p.displayName,
          role: p.role,
          signatureStatus: p.signatureStatus,
        })),
        schedules: d.schedules.map((s: any) => ({
          id: s.id,
          sequenceNumber: s.sequenceNumber,
          dueDate: s.dueDate.toISOString(),
          expectedAmount: s.expectedAmount.toString(),
          status: s.status,
        })),
        createdAt: d.createdAt.toISOString(),
      })),
    };
  });

  /**
   * GET /debts/:id — détail d'un contrat (toutes infos).
   */
  app.get("/debts/:id", async (req) => {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const d: any = (await getDebt(id, req.user.sub)) as any;
    return {
      id: d.id,
      publicCode: d.publicCode,
      status: d.status,
      amount: d.amount.toString(),
      currency: d.currency,
      interestRate: d.interestRate.toString(),
      purpose: d.purpose,
      startDate: d.startDate?.toISOString() ?? null,
      endDate: d.endDate.toISOString(),
      frequency: d.frequency,
      totalInstallments: d.totalInstallments,
      signatureLevel: d.signatureLevel,
      jurisdictionCode: d.jurisdictionCode,
      pdfUrl: d.pdfUrl,
      expiresAt: d.expiresAt?.toISOString() ?? null,
      signedAt: d.signedAt?.toISOString() ?? null,
      completedAt: d.completedAt?.toISOString() ?? null,
      creatorUserId: d.creatorUserId,
      // V242 — Texte libre éditable (preview PDF)
      preamble: d.preamble ?? null,
      additionalClauses: d.additionalClauses ?? null,
      footerNote: d.footerNote ?? null,
      myRole:
        d.parties.find((p: any) => p.userId === req.user.sub)?.role ??
        "UNKNOWN",
      parties: d.parties.map((p: any) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
        signatureStatus: p.signatureStatus,
        signedAt: p.signedAt?.toISOString() ?? null,
        guarantorCoverage: p.guarantorCoverage?.toString() ?? null,
      })),
      schedules: d.schedules.map((s: any) => ({
        id: s.id,
        sequenceNumber: s.sequenceNumber,
        dueDate: s.dueDate.toISOString(),
        expectedAmount: s.expectedAmount.toString(),
        capitalAmount: s.capitalAmount.toString(),
        interestAmount: s.interestAmount.toString(),
        status: s.status,
        paidAmount: s.paidAmount?.toString() ?? null,
        paidAt: s.paidAt?.toISOString() ?? null,
        confirmedAt: s.confirmedAt?.toISOString() ?? null,
        paymentMethod: s.paymentMethod,
        paymentReference: s.paymentReference,
      })),
      amendments: d.amendments,
      events: d.events.map((e: any) => ({
        id: e.id,
        actorUserId: e.actorUserId,
        kind: e.kind,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
      createdAt: d.createdAt.toISOString(),
    };
  });

  // V150.A2 — Routes négociation =============================================

  /**
   * POST /debts/:id/propose
   * Le créancier envoie le contrat DRAFT au débiteur. Le statut passe à PROPOSED
   * et la proposition expire au bout de 7 jours.
   */
  app.post("/debts/:id/propose", async (req, reply) => {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const debt: any = await proposeDebt(id, req.user.sub);
    // V150.A3 — Notifie le débiteur. notifyOne ne throw pas (try/catch interne).
    const debtor = debt.parties?.find((p: any) => p.role === "DEBTOR");
    const creditor = debt.parties?.find((p: any) => p.role === "CREDITOR");
    if (debtor?.userId) {
      await notifyOne(debtor.userId, {
        kind: "DEBT_PROPOSED" as any,
        senderUserId: req.user.sub,
        title: `${creditor?.displayName ?? "Quelqu'un"} te propose une reconnaissance de dette`,
        body: `Montant : ${debt.amount} ${debt.currency} · ${debt.totalInstallments} échéances. Tu as 7 jours pour répondre.`,
        link: `/dashboard/debts/${debt.id}`,
        payload: {
          debtId: debt.id,
          amount: String(debt.amount),
          currency: debt.currency,
          expiresAt: debt.expiresAt?.toISOString() ?? null,
        },
      });
    }
    // V150.A6 — Email pro + chaleureux au débiteur (en plus de la notif push).
    // Charge l'utilisateur débiteur pour récupérer email + locale.
    if (debtor?.userId) {
      try {
        const debtorUser = await (prisma as any).user.findUnique({
          where: { id: debtor.userId },
          select: { email: true, defaultLocale: true },
        });
        if (debtorUser?.email) {
          await sendTemplatedEmail(
            debtorUser.email,
            {
              kind: "debtProposed",
              payload: {
                creditorName: creditor?.displayName ?? "Quelqu'un",
                debtorName: debtor.displayName,
                amount: String(debt.amount),
                currency: debt.currency,
                installmentsLabel: formatInstallments(
                  debt.totalInstallments,
                  debt.frequency,
                  debtorUser.defaultLocale ?? "fr",
                ),
                rateLabel: formatRate(debt.interestRate, debtorUser.defaultLocale ?? "fr"),
                purpose: debt.purpose ?? "",
                expiresAtLabel: debt.expiresAt
                  ? new Date(debt.expiresAt).toLocaleDateString(
                      debtorUser.defaultLocale ?? "fr",
                      { day: "numeric", month: "long", year: "numeric" },
                    )
                  : "",
                contractUrl: `${loadEnv().WEB_BASE_URL ?? "https://www.backmesdo.com"}/dashboard/debts/${debt.id}`,
              },
            },
            debtorUser.defaultLocale ?? "fr",
            debtor.userId,
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[debt-email] propose failed silently:", (e as Error).message);
      }
    }
    return reply.code(200).send({
      id: debt.id,
      status: debt.status,
      expiresAt: debt.expiresAt?.toISOString() ?? null,
    });
  });

  const respondSchema = z.object({
    action: z.enum(["ACCEPT", "REJECT", "COUNTER"]),
    counterProposal: z
      .object({
        amount: z.number().positive().optional(),
        interestRate: z.number().min(0).max(22).optional(),
        totalInstallments: z.number().int().min(1).max(120).optional(),
        reason: z.string().max(500).optional(),
      })
      .optional(),
  });

  /**
   * POST /debts/:id/respond
   * Le débiteur accepte, refuse ou contre-propose.
   */
  app.post("/debts/:id/respond", async (req, reply) => {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const body = respondSchema.parse(req.body);
    const debt: any = await respondToDebt(id, req.user.sub, body);
    // V150.A3 — Notifie le créancier de la décision du débiteur.
    const debtor = debt.parties?.find((p: any) => p.role === "DEBTOR");
    if (debt.creatorUserId) {
      const debtorName = debtor?.displayName ?? "Le débiteur";
      const amountStr = `${debt.amount} ${debt.currency}`;
      let notif: {
        kind: any;
        title: string;
        body: string;
      } | null = null;
      if (body.action === "ACCEPT") {
        notif = {
          kind: "DEBT_ACCEPTED",
          title: `${debtorName} a accepté ton contrat`,
          body: `${amountStr} · contrat ${debt.publicCode ?? ""}. ${debt.status === "SIGNED" ? "Le contrat est désormais signé." : "Étape signature à venir."}`,
        };
      } else if (body.action === "REJECT") {
        notif = {
          kind: "DEBT_REJECTED",
          title: `${debtorName} a refusé ton contrat`,
          body: `${amountStr}. Tu peux retravailler les conditions et renvoyer.`,
        };
      } else {
        // COUNTER
        notif = {
          kind: "DEBT_COUNTER_PROPOSED",
          title: `${debtorName} te fait une contre-proposition`,
          body:
            body.counterProposal?.reason?.slice(0, 140) ??
            "Le débiteur souhaite renégocier. Ouvre le contrat pour voir les changements.",
        };
      }
      await notifyOne(debt.creatorUserId, {
        kind: notif.kind,
        senderUserId: req.user.sub,
        title: notif.title,
        body: notif.body,
        link: `/dashboard/debts/${debt.id}`,
        payload: {
          debtId: debt.id,
          action: body.action,
          status: debt.status,
        },
      });
      // V150.A6 — Email pro + chaleureux au créancier selon le verdict.
      try {
        const creditorUser = await (prisma as any).user.findUnique({
          where: { id: debt.creatorUserId },
          select: { email: true, defaultLocale: true },
        });
        const creditor = debt.parties?.find((p: any) => p.role === "CREDITOR");
        if (creditorUser?.email && creditor) {
          const baseUrl = loadEnv().WEB_BASE_URL ?? "https://www.backmesdo.com";
          const contractUrl = `${baseUrl}/dashboard/debts/${debt.id}`;
          const common = {
            creditorName: creditor.displayName,
            debtorName: debtor?.displayName ?? "Le débiteur",
            amount: String(debt.amount),
            currency: debt.currency,
            contractCode: debt.publicCode ?? "—",
            contractUrl,
          };
          if (body.action === "ACCEPT") {
            const locale = creditorUser.defaultLocale ?? "fr";
            const statusLabel =
              debt.status === "SIGNED"
                ? locale === "fr"
                  ? "signé"
                  : "signed"
                : locale === "fr"
                  ? "en attente de signature"
                  : "pending signature";
            await sendTemplatedEmail(
              creditorUser.email,
              {
                kind: "debtAccepted",
                payload: { ...common, statusLabel },
              },
              locale,
              debt.creatorUserId,
            );
          } else if (body.action === "REJECT") {
            await sendTemplatedEmail(
              creditorUser.email,
              { kind: "debtRejected", payload: common },
              creditorUser.defaultLocale ?? "fr",
              debt.creatorUserId,
            );
          } else {
            await sendTemplatedEmail(
              creditorUser.email,
              {
                kind: "debtCounterProposed",
                payload: {
                  ...common,
                  reason: body.counterProposal?.reason ?? "",
                },
              },
              creditorUser.defaultLocale ?? "fr",
              debt.creatorUserId,
            );
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[debt-email] respond failed silently:", (e as Error).message);
      }
    }
    return reply.code(200).send({
      id: debt.id,
      status: debt.status,
      signedAt: debt.signedAt?.toISOString() ?? null,
    });
  });

  // ---------------------------------------------------------------------------
  // V150.B — Témoins & garants
  // ---------------------------------------------------------------------------

  const addPartySchema = z
    .object({
      role: z.enum(["WITNESS", "GUARANTOR"]),
      userId: z.string().uuid().optional(),
      inviteContact: z.string().min(3).max(120).optional(),
      displayName: z.string().min(1).max(120),
      guarantorCoverage: z.number().min(1).max(100).optional(),
      guarantorTriggerDays: z.number().int().min(0).max(365).optional(),
    })
    .refine(
      (input) => !!input.userId || !!input.inviteContact,
      { message: "userId ou inviteContact obligatoire" }
    );

  /**
   * POST /debts/:id/parties — ajoute un témoin ou garant.
   */
  app.post("/debts/:id/parties", async (req, reply) => {
    // V180 — Fix : le JWT BMD encode l'userId dans `sub`, pas `id`.
    // Cf. routes au-dessus qui utilisent `req.user.sub` correctement.
    const userId = req.user.sub;
    const { id } = req.params as { id: string };
    const parsed = addPartySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Body invalide",
        details: parsed.error.flatten(),
      });
    }

    const party = await addDebtParty(id, userId, parsed.data as any);

    // Notification push au témoin/garant invité (si user BMD)
    try {
      const debt = (await prisma.debtAgreement.findUnique({
        where: { id },
        include: { parties: true },
      })) as any;
      if (debt) {
        const creditorParty = debt.parties.find(
          (p: any) => p.role === "CREDITOR"
        );
        const debtorParty = debt.parties.find((p: any) => p.role === "DEBTOR");
        const creditorName = creditorParty?.displayName ?? "?";
        const debtorName = debtorParty?.displayName ?? "?";
        const amount = Number(debt.amount);
        const currency = debt.currency;

        if (parsed.data.userId) {
          const notifTitle =
            parsed.data.role === "WITNESS"
              ? `Tu as été désigné(e) témoin · RDD ${debt.publicCode}`
              : `Tu as été désigné(e) garant · RDD ${debt.publicCode}`;
          const notifBody =
            parsed.data.role === "WITNESS"
              ? `${creditorName} prête à ${debtorName}. Ta présence sécurise l'accord.`
              : `${creditorName} prête à ${debtorName}. Tu garantis ${parsed.data.guarantorCoverage ?? 100}% du montant.`;
          await notifyOne(parsed.data.userId, {
            kind:
              parsed.data.role === "WITNESS"
                ? ("DEBT_WITNESS_ADDED" as any)
                : ("DEBT_GUARANTOR_ADDED" as any),
            title: notifTitle,
            body: notifBody,
            link: `/dashboard/debts/${debt.id}`,
            senderUserId: userId,
            payload: { debtId: debt.id, partyId: party.id },
          } as any);
        }

        // Email
        const invitedUser = parsed.data.userId
          ? await (prisma as any).user.findUnique({
              where: { id: parsed.data.userId },
              select: { email: true, defaultLocale: true },
            })
          : null;
        const invitedEmail: string | null =
          invitedUser?.email ?? parsed.data.inviteContact ?? null;
        const isEmail = !!invitedEmail && invitedEmail.includes("@");
        if (isEmail && invitedEmail) {
          const env = loadEnv();
          if (env.RESEND_API_KEY) {
            const locale = invitedUser?.defaultLocale ?? "fr";
            const contractUrl = `${env.WEB_BASE_URL ?? "https://www.backmesdo.com"}/dashboard/debts/${debt.id}`;
            if (parsed.data.role === "WITNESS") {
              await sendTemplatedEmail(
                invitedEmail,
                {
                  kind: "debtWitnessAdded",
                  payload: {
                    recipientName: parsed.data.displayName,
                    creditorName,
                    debtorName,
                    amount: String(amount),
                    currency,
                    contractCode: debt.publicCode,
                    purpose: debt.purpose ?? "",
                    contractUrl,
                  },
                },
                locale,
                parsed.data.userId,
              );
            } else {
              await sendTemplatedEmail(
                invitedEmail,
                {
                  kind: "debtGuarantorAdded",
                  payload: {
                    recipientName: parsed.data.displayName,
                    creditorName,
                    debtorName,
                    amount: String(amount),
                    currency,
                    contractCode: debt.publicCode,
                    purpose: debt.purpose ?? "",
                    coverage: parsed.data.guarantorCoverage ?? 100,
                    triggerDays: parsed.data.guarantorTriggerDays ?? 30,
                    contractUrl,
                  },
                },
                locale,
                parsed.data.userId,
              );
            }
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[debt-party] notify/email failed silently:",
        (e as Error).message
      );
    }

    return reply.code(201).send({
      id: party.id,
      role: party.role,
      displayName: party.displayName,
      userId: party.userId,
      inviteContact: party.inviteContact,
      signatureStatus: party.signatureStatus,
      guarantorCoverage:
        party.guarantorCoverage != null
          ? Number(party.guarantorCoverage)
          : null,
      guarantorTriggerDays: party.guarantorTriggerDays ?? null,
      createdAt: party.createdAt.toISOString(),
    });
  });

  /**
   * DELETE /debts/:id/parties/:partyId — retire un témoin ou garant.
   */
  app.delete("/debts/:id/parties/:partyId", async (req, reply) => {
    // V180 — Fix : le JWT BMD encode l'userId dans `sub`, pas `id`.
    // Cf. routes au-dessus qui utilisent `req.user.sub` correctement.
    const userId = req.user.sub;
    const { id, partyId } = req.params as { id: string; partyId: string };
    await removeDebtParty(id, partyId, userId);
    return reply.code(200).send({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // V150.D — Médiation : signalement et résolution de litige
  // ---------------------------------------------------------------------------

  const disputeSchema = z.object({
    category: z.enum([
      "NON_PAYMENT",
      "WRONG_AMOUNT",
      "BAD_FAITH",
      "FORCED_AGREEMENT",
      "OTHER",
    ]),
    reason: z.string().min(10).max(2000),
  });

  const resolveDisputeSchema = z.object({
    note: z.string().max(2000).optional(),
  });

  /**
   * POST /debts/:id/dispute — signale un litige sur un contrat actif.
   */
  app.post("/debts/:id/dispute", async (req, reply) => {
    // V180 — Fix : le JWT BMD encode l'userId dans `sub`, pas `id`.
    // Cf. routes au-dessus qui utilisent `req.user.sub` correctement.
    const userId = req.user.sub;
    const { id } = req.params as { id: string };
    const parsed = disputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Body invalide",
        details: parsed.error.flatten(),
      });
    }

    const updated = await disputeDebt(id, userId, parsed.data);

    // Notify l'autre partie principale (créditeur ↔ débiteur)
    try {
      const debt = (await prisma.debtAgreement.findUnique({
        where: { id },
        include: { parties: true },
      })) as any;
      if (debt) {
        const initiatorParty = debt.parties.find(
          (p: any) =>
            p.userId === userId &&
            (p.role === "CREDITOR" || p.role === "DEBTOR"),
        );
        const otherParty = debt.parties.find(
          (p: any) =>
            p.userId !== userId &&
            (p.role === "CREDITOR" || p.role === "DEBTOR"),
        );
        const initiatorName = initiatorParty?.displayName ?? "?";
        const amount = Number(debt.amount);
        const currency = debt.currency;
        const categoryLabel = formatDisputeCategory(parsed.data.category, "fr");

        if (otherParty?.userId) {
          await notifyOne(otherParty.userId, {
            kind: "DEBT_DISPUTED" as any,
            title: `Litige signalé · RDD ${debt.publicCode}`,
            body: `${initiatorName} a signalé un point à clarifier (${categoryLabel}).`,
            link: `/dashboard/debts/${debt.id}`,
            senderUserId: userId,
            payload: {
              debtId: debt.id,
              category: parsed.data.category,
            },
          } as any);
        }

        // Email à l'autre partie
        try {
          const env = loadEnv();
          if (env.RESEND_API_KEY && otherParty?.userId) {
            const u = (await (prisma.user as any).findUnique({
              where: { id: otherParty.userId },
              select: { email: true, defaultLocale: true },
            })) as { email: string | null; defaultLocale: string | null } | null;
            if (u?.email) {
              const locale = u.defaultLocale ?? "fr";
              const contractUrl = `${env.WEB_BASE_URL ?? "https://www.backmesdo.com"}/dashboard/debts/${debt.id}`;
              await sendTemplatedEmail(
                u.email,
                {
                  kind: "debtDisputed",
                  payload: {
                    recipientName: otherParty.displayName,
                    initiatorName,
                    initiatorRole: (initiatorParty?.role ??
                      "CREDITOR") as "CREDITOR" | "DEBTOR",
                    categoryLabel: formatDisputeCategory(
                      parsed.data.category,
                      locale,
                    ),
                    reason: parsed.data.reason,
                    contractCode: debt.publicCode,
                    amount: String(amount),
                    currency,
                    contractUrl,
                  },
                },
                locale,
                otherParty.userId,
              );
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(
            "[debt-dispute] email failed silently:",
            (e as Error).message,
          );
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[debt-dispute] notify failed silently:",
        (e as Error).message,
      );
    }

    return reply.code(200).send({
      id: updated.id,
      status: updated.status,
    });
  });

  /**
   * POST /debts/:id/dispute/resolve — résout amiablement un litige.
   */
  app.post("/debts/:id/dispute/resolve", async (req, reply) => {
    // V180 — Fix : le JWT BMD encode l'userId dans `sub`, pas `id`.
    // Cf. routes au-dessus qui utilisent `req.user.sub` correctement.
    const userId = req.user.sub;
    const { id } = req.params as { id: string };
    const parsed = resolveDisputeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Body invalide",
        details: parsed.error.flatten(),
      });
    }

    const updated = await resolveDispute(id, userId, parsed.data);

    // Notify l'autre partie
    try {
      const debt = (await prisma.debtAgreement.findUnique({
        where: { id },
        include: { parties: true },
      })) as any;
      if (debt) {
        const resolverParty = debt.parties.find(
          (p: any) =>
            p.userId === userId &&
            (p.role === "CREDITOR" || p.role === "DEBTOR"),
        );
        const otherParty = debt.parties.find(
          (p: any) =>
            p.userId !== userId &&
            (p.role === "CREDITOR" || p.role === "DEBTOR"),
        );
        const resolverName = resolverParty?.displayName ?? "?";
        const amount = Number(debt.amount);
        const currency = debt.currency;
        const restoredStatusLabel = formatDebtStatus(updated.status, "fr");

        if (otherParty?.userId) {
          await notifyOne(otherParty.userId, {
            kind: "DEBT_DISPUTE_RESOLVED" as any,
            title: `Litige résolu · RDD ${debt.publicCode}`,
            body: `${resolverName} a marqué le litige comme résolu. Le contrat reprend.`,
            link: `/dashboard/debts/${debt.id}`,
            senderUserId: userId,
            payload: { debtId: debt.id },
          } as any);
        }

        try {
          const env = loadEnv();
          if (env.RESEND_API_KEY && otherParty?.userId) {
            const u = (await (prisma.user as any).findUnique({
              where: { id: otherParty.userId },
              select: { email: true, defaultLocale: true },
            })) as { email: string | null; defaultLocale: string | null } | null;
            if (u?.email) {
              const locale = u.defaultLocale ?? "fr";
              const contractUrl = `${env.WEB_BASE_URL ?? "https://www.backmesdo.com"}/dashboard/debts/${debt.id}`;
              await sendTemplatedEmail(
                u.email,
                {
                  kind: "debtDisputeResolved",
                  payload: {
                    recipientName: otherParty.displayName,
                    resolverName,
                    restoredStatusLabel: formatDebtStatus(
                      updated.status,
                      locale,
                    ),
                    note: parsed.data.note ?? "",
                    contractCode: debt.publicCode,
                    amount: String(amount),
                    currency,
                    contractUrl,
                  },
                },
                locale,
                otherParty.userId,
              );
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(
            "[debt-dispute-resolve] email failed silently:",
            (e as Error).message,
          );
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[debt-dispute-resolve] notify failed silently:",
        (e as Error).message,
      );
    }

    return reply.code(200).send({
      id: updated.id,
      status: updated.status,
    });
  });

  // ---------------------------------------------------------------------------
  // V170.D — Déclaration de paiement sur une échéance
  // ---------------------------------------------------------------------------

  const declarePaymentSchema = z.object({
    amount: z.number().positive().optional(),
    paidAt: z.string().datetime({ offset: true }).optional(),
    method: z.enum(["CASH", "TRANSFER", "MOBILE_MONEY", "OTHER"]).optional(),
    notes: z.string().max(500).optional(),
  });

  /**
   * POST /debts/:id/schedules/:scheduleId/mark-paid
   * Le créancier déclare avoir reçu un paiement → status CONFIRMED (final).
   * Crée DebtSchedulePayment + DebtEvent + notifie le débiteur.
   */
  app.post(
    "/debts/:id/schedules/:scheduleId/mark-paid",
    async (req, reply) => {
      const userId = req.user.sub;
      const { id, scheduleId } = z
        .object({
          id: z.string().uuid(),
          scheduleId: z.string().uuid(),
        })
        .parse(req.params);
      const body = declarePaymentSchema.parse(req.body ?? {});
      const updated: any = await markScheduleAsPaid(id, scheduleId, userId, {
        amount: body.amount,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
        method: body.method,
        notes: body.notes,
      });
      return reply.code(200).send({
        id: updated.id,
        scheduleId: updated.id,
        status: updated.status,
        paidAmount: updated.paidAmount?.toString() ?? null,
        paidAt: updated.paidAt?.toISOString() ?? null,
        confirmedAt: updated.confirmedAt?.toISOString() ?? null,
      });
    },
  );

  /**
   * POST /debts/:id/schedules/:scheduleId/declare-payment
   * Le débiteur déclare avoir payé une échéance → status PAID (à confirmer).
   */
  app.post(
    "/debts/:id/schedules/:scheduleId/declare-payment",
    async (req, reply) => {
      const userId = req.user.sub;
      const { id, scheduleId } = z
        .object({
          id: z.string().uuid(),
          scheduleId: z.string().uuid(),
        })
        .parse(req.params);
      const body = declarePaymentSchema.parse(req.body ?? {});
      const updated: any = await declareSchedulePayment(
        id,
        scheduleId,
        userId,
        {
          amount: body.amount,
          paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
          method: body.method,
          notes: body.notes,
        },
      );
      return reply.code(200).send({
        id: updated.id,
        scheduleId: updated.id,
        status: updated.status,
        paidAmount: updated.paidAmount?.toString() ?? null,
        paidAt: updated.paidAt?.toISOString() ?? null,
      });
    },
  );

  /**
   * POST /debts/:id/schedules/:scheduleId/confirm-payment
   * Le créancier confirme une déclaration de paiement du débiteur → CONFIRMED.
   */
  app.post(
    "/debts/:id/schedules/:scheduleId/confirm-payment",
    async (req, reply) => {
      const userId = req.user.sub;
      const { id, scheduleId } = z
        .object({
          id: z.string().uuid(),
          scheduleId: z.string().uuid(),
        })
        .parse(req.params);
      const updated: any = await confirmDeclaredPayment(
        id,
        scheduleId,
        userId,
      );
      return reply.code(200).send({
        id: updated.id,
        scheduleId: updated.id,
        status: updated.status,
        confirmedAt: updated.confirmedAt?.toISOString() ?? null,
      });
    },
  );

  /**
   * V172.E — POST /debts/:id/schedules/:scheduleId/reject-payment
   * Le créancier rejette/conteste une déclaration de paiement → retour PENDING.
   * Le débiteur est notifié pour clarifier la situation.
   */
  app.post(
    "/debts/:id/schedules/:scheduleId/reject-payment",
    async (req, reply) => {
      const userId = req.user.sub;
      const { id, scheduleId } = z
        .object({
          id: z.string().uuid(),
          scheduleId: z.string().uuid(),
        })
        .parse(req.params);
      const body = z
        .object({ reason: z.string().max(500).optional() })
        .parse(req.body ?? {});
      const updated: any = await rejectDeclaredPayment(
        id,
        scheduleId,
        userId,
        body.reason,
      );
      return reply.code(200).send({
        id: updated.id,
        scheduleId: updated.id,
        status: updated.status,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // V150.E — Certificat de remboursement (acte de quittance PDF)
  // ---------------------------------------------------------------------------

  /**
   * GET /debts/:id/certificate
   * Génère et renvoie un PDF de certificat de remboursement (acte de quittance
   * définitif). Disponible uniquement quand le contrat est en statut COMPLETED.
   * Permission : créditeur ou débiteur du contrat.
   */
  app.get("/debts/:id/certificate", async (req, reply) => {
    // V180 — Fix : le JWT BMD encode l'userId dans `sub`, pas `id`.
    const userId = req.user.sub;
    const { id } = req.params as { id: string };
    // V242 — ?mode=contract génère l'aperçu/version finale du contrat
    // (DRAFT/PROPOSED) avec préambule + clauses + footer libres injectés.
    // Sans mode, on renvoie le certificat de quittance (COMPLETED only).
    // ?inline=1 force content-disposition inline (preview iframe au lieu
    // de download direct).
    const q = (req.query ?? {}) as { mode?: string; inline?: string };
    const mode: "contract" | "certificate" =
      q.mode === "contract" ? "contract" : "certificate";
    const inline = q.inline === "1" || q.inline === "true";

    const bytes = await generateDebtCertificatePdf({
      debtId: id,
      actorUserId: userId,
      mode,
    });
    // Récupère le publicCode pour le filename humanisé
    let publicCode = id.slice(0, 8);
    try {
      const d = (await prisma.debtAgreement.findUnique({
        where: { id },
        select: { publicCode: true },
      })) as { publicCode: string } | null;
      if (d?.publicCode) publicCode = d.publicCode;
    } catch {
      // best-effort filename
    }
    const prefix = mode === "contract" ? "bmd-contrat" : "bmd-certificat";
    const disposition = inline ? "inline" : "attachment";
    reply.header("content-type", "application/pdf");
    reply.header(
      "content-disposition",
      `${disposition}; filename="${prefix}-${publicCode}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    reply.header("cache-control", "private, max-age=0, no-cache");
    return reply.send(Buffer.from(bytes));
  });

  // ---------------------------------------------------------------------------
  // V150.C — Signature électronique qualifiée Yousign
  // ---------------------------------------------------------------------------

  /**
   * GET /debts/yousign/status
   * Renvoie l'état de configuration Yousign (utilisé par l'UI pour gater le
   * bouton "Demander signature qualifiée" sans devoir tâtonner).
   */
  app.get("/debts/yousign/status", async () => {
    return {
      enabled: isYousignConfigured(),
    };
  });

  /**
   * POST /debts/:id/sign-request
   * Déclenche une Signature Request Yousign pour le contrat. Réservé au
   * créditeur. Le contrat doit être ACCEPTED ou NEGOTIATING avec consensus
   * sur les termes (= toutes les parties prêtes à signer).
   *
   * Tant que YOUSIGN_API_KEY n'est pas configurée, retourne 503 avec un
   * message clair pour l'admin.
   */
  app.post("/debts/:id/sign-request", async (req, reply) => {
    if (!isYousignConfigured()) {
      return reply.code(503).send({
        error: "yousign_not_configured",
        message:
          "La signature électronique qualifiée n'est pas encore activée sur cette instance. Configure YOUSIGN_API_KEY dans le .env pour l'activer.",
      });
    }
    const userId = req.user.sub;
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);

    // Le service détaillé sera complété quand le compte Yousign sera prêt.
    // Squelette : on charge le contrat, on génère le PDF, on crée la
    // Signature Request avec les parties signataires (CREDITOR + DEBTOR + GUARANTOR).
    const debt = (await prisma.debtAgreement.findUnique({
      where: { id },
      include: { parties: true },
    })) as any;
    if (!debt) {
      return reply.code(404).send({
        error: "not_found",
        message: "Contrat introuvable",
      });
    }
    const actorParty = debt.parties.find(
      (p: any) => p.userId === userId && p.role === "CREDITOR",
    );
    if (!actorParty) {
      return reply.code(403).send({
        error: "forbidden",
        message:
          "Seul le créditeur peut déclencher la signature électronique qualifiée",
      });
    }
    if (!["ACCEPTED", "NEGOTIATING", "PROPOSED"].includes(debt.status)) {
      return reply.code(400).send({
        error: "bad_status",
        message: `Signature impossible depuis le statut ${debt.status}`,
      });
    }
    if (debt.yousignProcedureId) {
      return reply.code(409).send({
        error: "already_started",
        message: "Une procédure de signature est déjà en cours pour ce contrat",
        procedureId: debt.yousignProcedureId,
        status: debt.yousignStatus,
      });
    }

    // V152 — Quota signature : vérifie si le user a un quota plan / pack
    // ou doit payer. Si paiement requis → 402 avec breakdown pour l'UI.
    const { consumeSignatureQuota } = await import(
      "./signature-billing.service.js"
    );
    const cc = (debt.jurisdictionCode ?? "FR").toUpperCase();
    const level = (debt.signatureLevel ?? "ADVANCED") as
      | "SIMPLE"
      | "ADVANCED"
      | "NOTARIZED";

    // V174.G — Wrap en try/catch pour ne pas renvoyer un 500 générique quand
    // le pricing régional manque ou le user FREE n'a pas de quota.
    let quotaResult;
    try {
      quotaResult = await consumeSignatureQuota({
        userId,
        debtId: debt.id,
        level,
        countryCode: cc,
      });
    } catch (err) {
      console.warn(
        `[debts.sign-request] consumeSignatureQuota failed user=${userId} debt=${debt.id} level=${level} cc=${cc}:`,
        err,
      );
      return reply.code(402).send({
        error: "payment_required",
        message:
          (err as Error)?.message ||
          "Tarif signature non configuré pour ton plan/pays. Ajoute un Pack Booster RDD ou contacte le support.",
        level,
        countryCode: cc,
        suggestedPacks: [],
      });
    }

    if ("status" in quotaResult && quotaResult.status === "requires_payment") {
      return reply.code(402).send({
        error: "payment_required",
        message:
          "Quota plan + pack épuisé pour ce niveau de signature. Achète à la carte ou prends un Pack Booster RDD.",
        level,
        countryCode: cc,
        unitPriceCents: quotaResult.unitPriceCents,
        currency: quotaResult.currency,
        suggestedPacks: quotaResult.suggestedPacks,
      });
    }

    // Quota OK (free_quota ou pack) — TODO V150.C3 : générer le PDF acte
    // sous seing privé puis appeler Yousign.
    return reply.code(501).send({
      error: "not_implemented_yet",
      message:
        "Quota validé ✓ — Reste à brancher la génération PDF acte sous seing privé puis l'appel Yousign (V150.C3 + clé API).",
      consumedSource: (quotaResult as any).source,
      runbookHint:
        "Voir src/modules/debts/yousign.service.ts §RUNBOOK D'ACTIVATION",
    });
  });

  /**
   * GET /debts/:id/sign-quote
   * V152 — Renvoie le breakdown facturation pour une signature SANS consommer.
   * Utilisé par l'UI pour afficher "Cette signature te coûtera X €" et
   * proposer les packs Booster RDD.
   */
  app.get("/debts/:id/sign-quote", async (req, reply) => {
    const userId = req.user.sub;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const debt = (await (prisma as any).debtAgreement.findUnique({
      where: { id },
      include: { parties: true },
    })) as any;
    if (!debt) {
      return reply.code(404).send({ error: "not_found" });
    }
    const actorParty = debt.parties.find(
      (p: any) => p.userId === userId && p.role === "CREDITOR",
    );
    if (!actorParty) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const u = (await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { defaultCountry: true },
    })) as { defaultCountry: string | null } | null;
    const cc = (u?.defaultCountry ?? debt.jurisdictionCode ?? "FR").toUpperCase();
    const level = (debt.signatureLevel ?? "ADVANCED") as
      | "SIMPLE"
      | "ADVANCED"
      | "NOTARIZED";

    const { getSignatureQuotaStatus, DEBT_BOOSTER_PACKS } = await import(
      "./signature-billing.service.js"
    );
    const { getSignaturePricing } = await import(
      "./signature-pricing.service.js"
    );
    const quota = await getSignatureQuotaStatus(userId);
    const myQuota = quota.find((q) => q.level === level);
    const pricing = await getSignaturePricing(level, cc);

    let chargeable = true;
    if (myQuota) {
      if (myQuota.includedInPlan === -1) chargeable = false;
      else if (myQuota.usedThisMonth < myQuota.includedInPlan) chargeable = false;
      else if (myQuota.remainingFromPacks > 0) chargeable = false;
    }

    return {
      level,
      countryCode: cc,
      quota: myQuota,
      pricing: pricing
        ? {
            priceCents: pricing.priceCents,
            currency: pricing.currency,
          }
        : null,
      chargeable,
      suggestedPacks: chargeable ? DEBT_BOOSTER_PACKS : [],
    };
  });

  /**
   * GET /debts/:id/sign-request/status
   * Renvoie l'état courant de la Signature Request Yousign (statut + signers).
   * Utile pour rafraîchir l'UI sans attendre les webhooks.
   */
  app.get("/debts/:id/sign-request/status", async (req, reply) => {
    if (!isYousignConfigured()) {
      return reply.code(503).send({
        error: "yousign_not_configured",
      });
    }
    const userId = req.user.sub;
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const debt = (await prisma.debtAgreement.findUnique({
      where: { id },
      include: { parties: true },
    })) as any;
    if (!debt) {
      return reply.code(404).send({ error: "not_found" });
    }
    const isParty = debt.parties.some((p: any) => p.userId === userId);
    if (!isParty) {
      return reply.code(403).send({ error: "forbidden" });
    }
    if (!debt.yousignProcedureId) {
      return reply.code(404).send({
        error: "no_procedure",
        message: "Aucune procédure de signature n'a été déclenchée",
      });
    }
    const remote = await getYousignSignatureRequest(debt.yousignProcedureId);
    return {
      procedureId: debt.yousignProcedureId,
      status: remote.status,
      localStatus: debt.yousignStatus,
      signers: remote.signers,
    };
  });

  /**
   * POST /debts/:id/sign-request/cancel
   * Annule la procédure de signature en cours (créditeur uniquement).
   */
  app.post("/debts/:id/sign-request/cancel", async (req, reply) => {
    if (!isYousignConfigured()) {
      return reply.code(503).send({ error: "yousign_not_configured" });
    }
    const userId = req.user.sub;
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({ reason: z.string().max(500).default("Annulé par le créditeur") })
      .parse(req.body ?? {});
    const debt = (await prisma.debtAgreement.findUnique({
      where: { id },
      include: { parties: true },
    })) as any;
    if (!debt) return reply.code(404).send({ error: "not_found" });
    const actorParty = debt.parties.find(
      (p: any) => p.userId === userId && p.role === "CREDITOR",
    );
    if (!actorParty) {
      return reply.code(403).send({
        error: "forbidden",
        message:
          "Seul le créditeur peut annuler la signature électronique en cours",
      });
    }
    if (!debt.yousignProcedureId) {
      return reply.code(404).send({ error: "no_procedure" });
    }
    await cancelYousignSignatureRequest(debt.yousignProcedureId, body.reason);
    await (prisma as any).debtAgreement.update({
      where: { id: debt.id },
      data: {
        yousignStatus: "cancelled",
        yousignLastEventAt: new Date(),
      },
    });
    return { ok: true };
  });

  // Référence non utilisée (pour éviter warning unused import si on met le code en cache)
  void createYousignSignatureRequest;

  // ---------------------------------------------------------------------------
  // V152.C — Stripe Checkout one-shot pour signature à la carte
  // ---------------------------------------------------------------------------

  /**
   * POST /debts/:id/sign-checkout-intent
   * Crée un PaymentIntent Stripe pour payer 1 signature ADVANCED/NOTARIZED
   * au tarif V151 (selon countryCode du contrat).
   *
   * Mock en dev si Stripe pas configuré.
   */
  app.post("/debts/:id/sign-checkout-intent", async (req, reply) => {
    const userId = req.user.sub;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const debt = (await (prisma as any).debtAgreement.findUnique({
      where: { id },
      include: { parties: true },
    })) as any;
    if (!debt) return reply.code(404).send({ error: "not_found" });
    const isCreditor = debt.parties.some(
      (p: any) => p.userId === userId && p.role === "CREDITOR",
    );
    if (!isCreditor) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const level = (debt.signatureLevel ?? "ADVANCED") as
      | "SIMPLE"
      | "ADVANCED"
      | "NOTARIZED";
    const cc = (debt.jurisdictionCode ?? "FR").toUpperCase();
    const { getSignaturePricing } = await import("./signature-pricing.service.js");
    const pricing = await getSignaturePricing(level, cc);
    if (!pricing) {
      return reply.code(400).send({
        error: "no_pricing",
        message: `Pas de tarif configuré pour ${level} en ${cc}`,
      });
    }

    // Stripe mode
    const { getStripe, isStripeConfigured } = await import("../../lib/stripe.js");
    const stripe = getStripe();
    if (!isStripeConfigured() || !stripe) {
      return {
        clientSecret: `pi_mock_sign_${id.slice(0, 8)}_${Date.now()}_secret`,
        amount: pricing.priceCents,
        currency: pricing.currency.toLowerCase(),
        level,
        mock: true,
      };
    }

    const user = (await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, displayName: true },
    })) as { stripeCustomerId: string | null; displayName: string | null } | null;
    if (!user) {
      return reply.code(404).send({ error: "user_not_found" });
    }
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.displayName ?? undefined,
        metadata: { userId, source: "signature_charge" },
      });
      customerId = customer.id;
      await (prisma as any).user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }
    const intent = await stripe.paymentIntents.create({
      amount: pricing.priceCents,
      currency: pricing.currency.toLowerCase(),
      description: `Signature ${level} · RDD ${debt.publicCode}`,
      ...(customerId ? { customer: customerId } : {}),
      metadata: {
        userId,
        debtId: id,
        level,
        countryCode: cc,
        source: "signature_charge",
      },
    });
    return {
      clientSecret: intent.client_secret,
      amount: pricing.priceCents,
      currency: pricing.currency.toLowerCase(),
      level,
    };
  });

  /**
   * POST /debts/:id/sign-confirm-charge
   * Confirme un paiement signature et crée la SignatureCharge en status=PAID.
   * Appelé par le front après Stripe Elements, ou par le webhook.
   * Idempotent.
   */
  app.post("/debts/:id/sign-confirm-charge", async (req, reply) => {
    const userId = req.user.sub;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        stripePaymentIntentId: z.string().min(1),
        level: z.enum(["SIMPLE", "ADVANCED", "NOTARIZED"]),
      })
      .parse(req.body);

    // Idempotence
    const existing = (await (prisma as any).signatureCharge.findFirst({
      where: {
        userId,
        debtId: id,
        stripePaymentIntentId: body.stripePaymentIntentId,
      },
    })) as any;
    if (existing) {
      return {
        id: existing.id,
        alreadyRecorded: true,
        status: existing.status,
      };
    }

    const debt = (await (prisma as any).debtAgreement.findUnique({
      where: { id },
    })) as any;
    if (!debt) return reply.code(404).send({ error: "not_found" });
    const cc = (debt.jurisdictionCode ?? "FR").toUpperCase();

    // Vérification Stripe si live
    const { getStripe, isStripeConfigured } = await import("../../lib/stripe.js");
    const stripe = getStripe();
    let pricePaidCents = 0;
    let currency = "EUR";
    if (
      isStripeConfigured() &&
      stripe &&
      !body.stripePaymentIntentId.startsWith("pi_mock_")
    ) {
      try {
        const intent = await stripe.paymentIntents.retrieve(
          body.stripePaymentIntentId,
        );
        if (intent.status !== "succeeded") {
          return reply.code(400).send({
            error: "payment_not_succeeded",
            status: intent.status,
          });
        }
        if (intent.metadata?.userId !== userId) {
          return reply.code(403).send({ error: "user_mismatch" });
        }
        pricePaidCents = intent.amount;
        currency = (intent.currency ?? "eur").toUpperCase();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          "[sign-charge] failed to verify PI:",
          (e as Error).message,
        );
      }
    } else {
      // Mock dev : on prend le prix du V151
      const { getSignaturePricing } = await import(
        "./signature-pricing.service.js"
      );
      const pricing = await getSignaturePricing(body.level, cc);
      if (pricing) {
        pricePaidCents = pricing.priceCents;
        currency = pricing.currency;
      }
    }

    const created = (await (prisma as any).signatureCharge.create({
      data: {
        userId,
        debtId: id,
        level: body.level,
        pricePaidCents,
        currency,
        countryCode: cc,
        stripePaymentIntentId: body.stripePaymentIntentId,
        status: "PAID",
        paidAt: new Date(),
      },
    })) as any;

    return {
      id: created.id,
      status: created.status,
      pricePaidCents,
      currency,
    };
  });
}

// V150.A6 — Helpers de formatage pour les emails RDD.

function formatInstallments(n: number, frequency: string, locale: string): string {
  const isFr = locale.startsWith("fr");
  const freqLabel: Record<string, { fr: string; en: string }> = {
    WEEKLY: { fr: "hebdomadaires", en: "weekly" },
    MONTHLY: { fr: "mensuelles", en: "monthly" },
    QUARTERLY: { fr: "trimestrielles", en: "quarterly" },
    YEARLY: { fr: "annuelles", en: "yearly" },
    CUSTOM: { fr: "personnalisées", en: "custom" },
  };
  const f = freqLabel[frequency] ?? freqLabel.MONTHLY!;
  return isFr ? `${n} échéances ${f.fr}` : `${n} ${f.en} installments`;
}

function formatRate(rate: any, locale: string): string {
  const num = typeof rate === "number" ? rate : parseFloat(String(rate));
  const isFr = locale.startsWith("fr");
  if (num === 0) return isFr ? "0 % (sans intérêt)" : "0 % (no interest)";
  return isFr ? `${num.toFixed(2).replace(".", ",")} % par an` : `${num.toFixed(2)} % per year`;
}

// V150.D — Helpers d'humanisation pour emails médiation.

function formatDisputeCategory(category: string, locale: string): string {
  const isFr = locale.startsWith("fr");
  const map: Record<string, { fr: string; en: string }> = {
    NON_PAYMENT: { fr: "Non-paiement", en: "Non-payment" },
    WRONG_AMOUNT: { fr: "Désaccord sur le montant", en: "Wrong amount" },
    BAD_FAITH: { fr: "Mauvaise foi", en: "Bad faith" },
    FORCED_AGREEMENT: { fr: "Consentement contraint", en: "Forced agreement" },
    OTHER: { fr: "Autre motif", en: "Other reason" },
  };
  const m = map[category] ?? map.OTHER!;
  return isFr ? m.fr : m.en;
}

function formatDebtStatus(status: string, locale: string): string {
  const isFr = locale.startsWith("fr");
  const map: Record<string, { fr: string; en: string }> = {
    DRAFT: { fr: "Brouillon", en: "Draft" },
    PROPOSED: { fr: "Proposé", en: "Proposed" },
    NEGOTIATING: { fr: "Négociation", en: "Negotiating" },
    ACCEPTED: { fr: "Accepté", en: "Accepted" },
    SIGNED: { fr: "Signé", en: "Signed" },
    ACTIVE: { fr: "Actif", en: "Active" },
    COMPLETED: { fr: "Soldé", en: "Completed" },
    CANCELLED: { fr: "Annulé", en: "Cancelled" },
    DEFAULTED: { fr: "Défaut", en: "Defaulted" },
    DISPUTED: { fr: "Litige", en: "Disputed" },
  };
  const m = map[status] ?? { fr: status, en: status };
  return isFr ? m.fr : m.en;
}
