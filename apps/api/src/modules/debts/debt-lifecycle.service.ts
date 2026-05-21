/**
 * V150.F — Crons cycle de vie RDD.
 *
 * 3 jobs périodiques :
 *   1. expirePendingProposals : RDD en statut PROPOSED dont expiresAt < now
 *      → status CANCELLED + DebtEvent EXPIRED + notif au créditeur.
 *   2. autoCompleteFullyPaid : RDD en ACTIVE/SIGNED dont tous les schedules
 *      sont CONFIRMED → status COMPLETED + DebtEvent + notif aux deux parties.
 *   3. updateScheduleLateness : DebtSchedule en PENDING dont dueDate dépassée
 *      → LATE après 1 jour, MISSED après 30 jours. Si une MISSED existe,
 *      bascule la RDD en DEFAULTED.
 *
 * Idempotence : chaque tick filtre uniquement les enregistrements éligibles,
 * donc on peut tourner toutes les minutes ou toutes les heures sans risque.
 */

import { prisma as prismaClient } from "../../lib/db.js";
import { notifyOne } from "../notifications/notifications.service.js";

const prisma = prismaClient as any;

// ---------------------------------------------------------------------------
// 1. Auto-expire PROPOSED → CANCELLED
// ---------------------------------------------------------------------------

export async function tickExpirePendingDebtProposals(): Promise<{
  expired: number;
}> {
  const now = new Date();
  const candidates = await prisma.debtAgreement.findMany({
    where: {
      status: "PROPOSED",
      expiresAt: { lt: now },
    },
    include: { parties: true },
    take: 200, // garde-fou
  });

  let expired = 0;
  for (const d of candidates as any[]) {
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.debtAgreement.update({
          where: { id: d.id },
          data: { status: "CANCELLED" },
        });
        await tx.debtEvent.create({
          data: {
            debtId: d.id,
            actorUserId: null,
            kind: "EXPIRED",
            payload: {
              previousStatus: "PROPOSED",
              expiresAt: d.expiresAt?.toISOString() ?? null,
            },
          },
        });
      });
      expired += 1;

      // Notif au créditeur (best-effort)
      try {
        const creditor = d.parties.find((p: any) => p.role === "CREDITOR");
        if (creditor?.userId) {
          await notifyOne(creditor.userId, {
            kind: "DEBT_REJECTED" as any,
            title: `RDD ${d.publicCode} expirée`,
            body: `Le débiteur n'a pas répondu dans les 7 jours. Tu peux relancer une proposition.`,
            link: `/dashboard/debts/${d.id}`,
            payload: { debtId: d.id, reason: "expired" },
          } as any);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          "[debt-lifecycle] notify expired failed:",
          (e as Error).message,
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[debt-lifecycle] failed to expire",
        d.id,
        (e as Error).message,
      );
    }
  }
  return { expired };
}

// ---------------------------------------------------------------------------
// 2. Auto-complete les RDD entièrement remboursées
// ---------------------------------------------------------------------------

export async function tickAutoCompletePaidDebts(): Promise<{
  completed: number;
}> {
  // Récupère les RDD ACTIVE/SIGNED. On filtre ensuite côté JS sur les schedules
  // (pas tous les ORMs supportent un "tous les enfants matchent" en where direct).
  const candidates = await prisma.debtAgreement.findMany({
    where: {
      status: { in: ["ACTIVE", "SIGNED"] },
    },
    include: {
      parties: true,
      schedules: true,
    },
    take: 200,
  });

  let completed = 0;
  for (const d of candidates as any[]) {
    if (d.schedules.length === 0) continue;
    const allConfirmed = d.schedules.every(
      (s: any) => s.status === "CONFIRMED",
    );
    if (!allConfirmed) continue;

    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.debtAgreement.update({
          where: { id: d.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
        await tx.debtEvent.create({
          data: {
            debtId: d.id,
            actorUserId: null,
            kind: "COMPLETED_AUTO",
            payload: {
              previousStatus: d.status,
              totalSchedules: d.schedules.length,
            },
          },
        });
      });
      completed += 1;

      // Notif au créditeur ET débiteur — "C'est soldé, certificat disponible"
      try {
        const creditor = d.parties.find((p: any) => p.role === "CREDITOR");
        const debtor = d.parties.find((p: any) => p.role === "DEBTOR");
        const link = `/dashboard/debts/${d.id}`;
        if (creditor?.userId) {
          await notifyOne(creditor.userId, {
            kind: "DEBT_ACCEPTED" as any,
            title: `RDD ${d.publicCode} soldée 🎉`,
            body: `${debtor?.displayName ?? "Le débiteur"} a remboursé l'intégralité du prêt. Tu peux télécharger le certificat de remboursement.`,
            link,
            payload: { debtId: d.id, reason: "auto_completed" },
          } as any);
        }
        if (debtor?.userId) {
          await notifyOne(debtor.userId, {
            kind: "DEBT_ACCEPTED" as any,
            title: `Tu as soldé la RDD ${d.publicCode}`,
            body: `Bravo, tu as honoré ton engagement jusqu'au bout. Télécharge ton certificat de remboursement.`,
            link,
            payload: { debtId: d.id, reason: "auto_completed" },
          } as any);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          "[debt-lifecycle] notify completed failed:",
          (e as Error).message,
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[debt-lifecycle] failed to auto-complete",
        d.id,
        (e as Error).message,
      );
    }
  }
  return { completed };
}

// ---------------------------------------------------------------------------
// 3. Mise à jour LATE / MISSED + bascule en DEFAULTED si trop de retard
// ---------------------------------------------------------------------------

const LATE_THRESHOLD_DAYS = 1;
const MISSED_THRESHOLD_DAYS = 30;

export async function tickUpdateScheduleLateness(): Promise<{
  late: number;
  missed: number;
  defaulted: number;
}> {
  const now = new Date();
  const lateCutoff = new Date(
    now.getTime() - LATE_THRESHOLD_DAYS * 86_400_000,
  );
  const missedCutoff = new Date(
    now.getTime() - MISSED_THRESHOLD_DAYS * 86_400_000,
  );

  // 1) PENDING → LATE (1 jour de retard)
  const pendingLate = await prisma.debtSchedule.updateMany({
    where: {
      status: "PENDING",
      dueDate: { lt: lateCutoff },
    },
    data: { status: "LATE" },
  });

  // 2) LATE → MISSED (30 jours de retard)
  const lateMissed = await prisma.debtSchedule.updateMany({
    where: {
      status: "LATE",
      dueDate: { lt: missedCutoff },
    },
    data: { status: "MISSED" },
  });

  // 3) Pour chaque contrat qui a au moins un MISSED, bascule en DEFAULTED
  // (sauf si déjà COMPLETED / CANCELLED / DEFAULTED / DISPUTED).
  const debtsWithMissed = await prisma.debtAgreement.findMany({
    where: {
      status: { in: ["ACTIVE", "SIGNED"] },
      schedules: {
        some: { status: "MISSED" },
      },
    },
    include: { parties: true },
    take: 200,
  });

  let defaulted = 0;
  for (const d of debtsWithMissed as any[]) {
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.debtAgreement.update({
          where: { id: d.id },
          data: { status: "DEFAULTED" },
        });
        await tx.debtEvent.create({
          data: {
            debtId: d.id,
            actorUserId: null,
            kind: "DEFAULTED_AUTO",
            payload: {
              previousStatus: d.status,
            },
          },
        });
      });
      defaulted += 1;

      // Notif aux deux principales parties + garants (si présents)
      try {
        const recipients = (d.parties as any[]).filter((p) =>
          ["CREDITOR", "DEBTOR", "GUARANTOR"].includes(p.role),
        );
        for (const p of recipients) {
          if (!p.userId) continue;
          const isCreditor = p.role === "CREDITOR";
          const isGuarantor = p.role === "GUARANTOR";
          await notifyOne(p.userId, {
            kind: "DEBT_REJECTED" as any,
            title: `RDD ${d.publicCode} en défaut`,
            body: isGuarantor
              ? `Au moins une échéance n'a pas été payée depuis 30 jours. En tant que garant, tu peux être sollicité.`
              : isCreditor
                ? `Au moins une échéance n'a pas été honorée depuis 30 jours. Discute avec le débiteur ou signale un litige.`
                : `Au moins une échéance est en retard de plus de 30 jours. Régularise au plus vite pour éviter le défaut.`,
            link: `/dashboard/debts/${d.id}`,
            payload: { debtId: d.id, reason: "defaulted_auto" },
          } as any);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          "[debt-lifecycle] notify defaulted failed:",
          (e as Error).message,
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[debt-lifecycle] failed to default",
        d.id,
        (e as Error).message,
      );
    }
  }

  return {
    late: pendingLate.count ?? 0,
    missed: lateMissed.count ?? 0,
    defaulted,
  };
}
