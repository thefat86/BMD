/**
 * Scheduler interne (sans dépendance npm).
 *
 * Lance des tâches périodiques au démarrage du serveur :
 *  - reminderTontineDue : J-7, J-3, J-1 avant la dueDate d'un tour de tontine
 *  - cleanupExpiredTokens : OtpCode, QrLoginRequest, GroupInviteToken expirés → soft-mark
 *  - cleanupExpiredSessions : sessions JWT expirées → revokedAt
 *  - weeklySummary : lundi 9h, résumé hebdo par groupe (notifié in-app)
 *
 * Garde-fous :
 *  - Lock anti-overlap par tâche (si la précédente n'a pas fini, on skip)
 *  - Toutes les erreurs sont catchées (un job qui plante n'arrête pas le scheduler)
 *  - Le scheduler ne tourne pas en mode test (NODE_ENV === "test")
 *
 * Limitation : single-process. En cluster il faut un lock Redis ou un job runner
 * externe (BullMQ, pg-boss). Pour le MVP single-instance c'est suffisant.
 */
import { prisma } from "./db.js";
import { loadEnv } from "./env.js";
import { refreshFxRates } from "./fx.js";
import { sendEmail } from "./messaging.js";
import { logoSvg } from "./email-templates.js";
import { tickSubscriptionStates } from "../modules/subscription/subscription-state.service.js";
import { tickPromoteCommissionsToPayable } from "../modules/affiliate/affiliate.service.js";
// V164.H3 — Cron mensuel calcul commissions commerciaux agréés (1 niveau, anti-pyramidal)
import { computeMonthlyCommissionsFor } from "../modules/commercials/commercials.service.js";
import {
  getUserTone,
  tontineReminderBody,
  tontineReminderTitle,
  weeklySummaryBody,
  weeklySummaryTitle,
} from "./messaging-tones.js";
import { assignVariant } from "./ab-tests.js";

type JobFn = () => Promise<void>;

interface JobConfig {
  name: string;
  intervalMs: number;
  fn: JobFn;
  /** Si true, exécute immédiatement au démarrage (puis chaque intervalMs). */
  runOnStart?: boolean;
}

interface JobState {
  config: JobConfig;
  running: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
  totalRuns: number;
  totalErrors: number;
}

const jobs = new Map<string, JobState>();
const handles = new Map<string, NodeJS.Timeout>();
let started = false;

function registerJob(config: JobConfig): void {
  jobs.set(config.name, {
    config,
    running: false,
    lastRunAt: null,
    lastError: null,
    totalRuns: 0,
    totalErrors: 0,
  });
}

async function tick(name: string): Promise<void> {
  const state = jobs.get(name);
  if (!state) return;
  if (state.running) {
    // Skip : la précédente exécution est encore en cours
    return;
  }
  state.running = true;
  const startedAt = Date.now();
  try {
    await state.config.fn();
    state.lastRunAt = new Date();
    state.totalRuns += 1;
    state.lastError = null;
  } catch (e) {
    state.totalErrors += 1;
    state.lastError = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error(`[scheduler] ❌ ${name} failed:`, state.lastError);
  } finally {
    state.running = false;
    const elapsed = Date.now() - startedAt;
    if (elapsed > 5000) {
      // eslint-disable-next-line no-console
      console.warn(`[scheduler] ⏱️  ${name} took ${elapsed}ms`);
    }
  }
}

/**
 * Démarre toutes les tâches enregistrées. Idempotent.
 */
export function startScheduler(): void {
  if (started) return;
  const env = loadEnv();
  if (env.NODE_ENV === "test") return;
  started = true;

  for (const [name, state] of jobs.entries()) {
    if (state.config.runOnStart) {
      // Exécution initiale (en différé pour ne pas bloquer le démarrage)
      setTimeout(() => void tick(name), 1000);
    }
    const handle = setInterval(() => void tick(name), state.config.intervalMs);
    handles.set(name, handle);
  }
  // eslint-disable-next-line no-console
  console.log(`[scheduler] ▶️  ${jobs.size} job(s) démarré(s)`);
}

export function stopScheduler(): void {
  for (const h of handles.values()) clearInterval(h);
  handles.clear();
  started = false;
}

export function getSchedulerStatus(): Array<{
  name: string;
  intervalMs: number;
  lastRunAt: string | null;
  lastError: string | null;
  totalRuns: number;
  totalErrors: number;
  running: boolean;
}> {
  return Array.from(jobs.values()).map((s) => ({
    name: s.config.name,
    intervalMs: s.config.intervalMs,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    lastError: s.lastError,
    totalRuns: s.totalRuns,
    totalErrors: s.totalErrors,
    running: s.running,
  }));
}

// ============================================================
// JOB · Rappels de tontine (J-7 / J-3 / J-1)
// ============================================================
const REMINDER_DAYS = [7, 3, 1];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function jobReminderTontineDue(): Promise<void> {
  const now = Date.now();
  // Cherche les turns IN_PROGRESS dont la dueDate (ou scheduledDate si fixée)
  // tombe dans les 7 prochains jours
  const horizon = new Date(now + 8 * MS_PER_DAY);
  const turns = await prisma.tontineTurn.findMany({
    where: {
      status: "IN_PROGRESS",
      OR: [
        { scheduledDate: { gte: new Date(now), lte: horizon } },
        {
          scheduledDate: null,
          dueDate: { gte: new Date(now), lte: horizon },
        },
      ],
    },
    include: {
      tontine: {
        include: { group: { select: { id: true, name: true } } },
      },
      contributions: {
        where: { status: { in: ["PENDING", "PAID"] } },
        select: { contributorUserId: true },
      },
      beneficiary: { select: { displayName: true } },
    },
  });

  for (const turn of turns) {
    const target = turn.scheduledDate ?? turn.dueDate;
    const daysAhead = Math.round((target.getTime() - now) / MS_PER_DAY);
    if (!REMINDER_DAYS.includes(daysAhead)) continue;

    // Anti-doublon : une notif TONTINE_TURN_REMINDER par turn × user × jour ciblé
    // On utilise la clé "turnId+daysAhead" dans le payload comme dedup key
    const dedupKey = `turn:${turn.id}:d-${daysAhead}`;
    const userIds = turn.contributions.map((c) => c.contributorUserId);
    if (userIds.length === 0) continue;

    const already = await prisma.notification.findFirst({
      where: {
        userId: { in: userIds },
        kind: "TONTINE_TURN_REMINDER",
        payload: { path: ["dedupKey"], equals: dedupKey } as any,
      },
      select: { id: true },
    });
    if (already) continue;

    // Personnalise le wording selon la tonalité préférée de chaque utilisateur
    const amount = turn.tontine.contributionAmount.toString();
    const currency = turn.tontine.currency;
    const tonedNotifs = await Promise.all(
      userIds.map(async (uid) => {
        const tone = await getUserTone(uid);
        const args = {
          groupName: turn.tontine.group.name,
          beneficiaryName: turn.beneficiary.displayName,
          daysAhead,
          amount,
          currency,
        };
        return {
          userId: uid,
          kind: "TONTINE_TURN_REMINDER" as const,
          title: tontineReminderTitle(tone, args),
          body: tontineReminderBody(tone, args),
          link: `/dashboard/groups/${turn.tontine.groupId}/tontine`,
          payload: {
            dedupKey,
            turnId: turn.id,
            daysAhead,
            groupId: turn.tontine.groupId,
          },
        };
      }),
    );
    await prisma.notification.createMany({ data: tonedNotifs });
  }
}

// ============================================================
// JOB · Cleanup tokens expirés (sécurité + perf)
// ============================================================
async function jobCleanupExpiredTokens(): Promise<void> {
  const now = new Date();

  // OTP codes expirés depuis > 24h → on les peut supprimer (déjà inutilisables)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.otpCode.deleteMany({
    where: { expiresAt: { lt: yesterday } },
  });

  // QrLoginRequest expirés ou USED depuis > 1h → marker EXPIRED
  await prisma.qrLoginRequest.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });

  // SettlementPaymentToken expirés depuis > 30j → cleanup hard
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.settlementPaymentToken.deleteMany({
    where: { expiresAt: { lt: monthAgo } },
  });
}

// ============================================================
// JOB · Cleanup sessions JWT expirées
// ============================================================
async function jobCleanupExpiredSessions(): Promise<void> {
  const now = new Date();
  // Marque révoquées les sessions expirées (anti-orphelins)
  await prisma.session.updateMany({
    where: {
      expiresAt: { lt: now },
      revokedAt: null,
    },
    data: { revokedAt: now },
  });
  // Hard-delete les sessions révoquées depuis > 90 jours (purge RGPD)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.session.deleteMany({
    where: {
      revokedAt: { lt: ninetyDaysAgo },
    },
  });
}

// ============================================================
// JOB · Résumé hebdo (lundi 9h heure locale du serveur)
// ============================================================
async function jobWeeklySummary(): Promise<void> {
  const now = new Date();
  // Conditions : lundi (1) entre 9h et 10h
  if (now.getDay() !== 1 || now.getHours() !== 9) return;

  // Anti-doublon : on tag avec la semaine ISO
  const isoWeek = `${now.getFullYear()}-W${getIsoWeek(now)}`;

  const groups = await prisma.group.findMany({
    select: { id: true, name: true, members: { select: { userId: true, doNotDisturb: true } } },
  });

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const g of groups) {
    const [expensesAdded, settlementsConfirmed] = await Promise.all([
      prisma.expense.count({
        where: { groupId: g.id, createdAt: { gte: oneWeekAgo } },
      }),
      prisma.settlement.count({
        where: { groupId: g.id, confirmedByPayeeAt: { gte: oneWeekAgo } },
      }),
    ]);
    if (expensesAdded === 0 && settlementsConfirmed === 0) continue;

    const recipients = g.members
      .filter((m) => !m.doNotDisturb)
      .map((m) => m.userId);
    if (recipients.length === 0) continue;

    const dedupKey = `weekly:${g.id}:${isoWeek}`;
    const already = await prisma.notification.findFirst({
      where: {
        userId: { in: recipients },
        kind: "WEEKLY_SUMMARY",
        payload: { path: ["dedupKey"], equals: dedupKey } as any,
      },
      select: { id: true },
    });
    if (already) continue;

    const tonedSummaryNotifs = await Promise.all(
      recipients.map(async (uid) => {
        const tone = await getUserTone(uid);
        const args = {
          groupName: g.name,
          expensesAdded,
          settlementsConfirmed,
        };
        let title = weeklySummaryTitle(tone, args);
        let body = weeklySummaryBody(tone, args);

        // A/B test optionnel sur le subject (spec §6.9). Si un test
        // "weekly_summary_subject" est en running, on récupère le variant
        // pour ce user et on remplace le title si le payload le définit.
        try {
          const variant = await assignVariant({
            testCode: "weekly_summary_subject",
            userId: uid,
          });
          if (variant) {
            const p = variant.payload as Record<string, string>;
            if (typeof p.title === "string") title = p.title;
            if (typeof p.body === "string") body = p.body;
          }
        } catch {
          /* test non configuré ou erreur DB → on garde le défaut */
        }

        return {
          userId: uid,
          kind: "WEEKLY_SUMMARY" as const,
          title,
          body,
          link: `/dashboard/groups/${g.id}`,
          payload: {
            dedupKey,
            groupId: g.id,
            expensesAdded,
            settlementsConfirmed,
          },
        };
      }),
    );
    await prisma.notification.createMany({ data: tonedSummaryNotifs });

    // Spec §3.12 — envoi email aux contacts primaires vérifiés (best-effort)
    // Si Resend n'est pas configuré, sendEmail log silencieusement.
    const recipientContacts = await prisma.userContact.findMany({
      where: {
        userId: { in: recipients },
        type: "EMAIL",
        isVerified: true,
        isPrimary: true,
      },
      include: { user: { select: { id: true, displayName: true } } },
    });

    for (const contact of recipientContacts) {
      const tone = await getUserTone(contact.user.id);
      const args = {
        groupName: g.name,
        expensesAdded,
        settlementsConfirmed,
      };
      const title = weeklySummaryTitle(tone, args);
      const body = weeklySummaryBody(tone, args);
      const html = renderWeeklySummaryEmail({
        userName: contact.user.displayName,
        title,
        body,
        groupName: g.name,
        expensesAdded,
        settlementsConfirmed,
        groupId: g.id,
      });
      // Fire-and-forget : un échec d'email ne bloque pas les autres
      void sendEmail({
        to: contact.value,
        subject: title,
        text: `${body}\n\nVoir le détail sur BMD : ${loadEnv().WEB_BASE_URL}/dashboard/groups/${g.id}`,
        html,
      });
    }
  }
}

function renderWeeklySummaryEmail(args: {
  userName: string;
  title: string;
  body: string;
  groupName: string;
  expensesAdded: number;
  settlementsConfirmed: number;
  groupId: string;
}): string {
  const url = `${loadEnv().WEB_BASE_URL}/dashboard/groups/${args.groupId}`;
  return `
<!doctype html>
<html lang="fr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1625;background:#faf7f0">
  <div style="text-align:center;margin-bottom:24px">
    <div style="margin-bottom:8px">${logoSvg(64)}</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:#3a2f5b;font-weight:700">BMD</div>
    <div style="font-size:11px;color:#7c6e93;letter-spacing:2px;text-transform:uppercase">Back Mes Do</div>
  </div>
  <h1 style="font-size:18px;margin:0 0 12px">${args.title}</h1>
  <p style="font-size:14px;line-height:1.5;color:#574a6e">Salut ${args.userName},</p>
  <p style="font-size:14px;line-height:1.5;color:#574a6e">${args.body}</p>
  <div style="background:linear-gradient(135deg,#fef3e2,#f5e8d8);border-radius:14px;padding:20px;margin:20px 0;display:flex;gap:16px">
    <div style="flex:1;text-align:center">
      <div style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;color:#b54732;line-height:1">${args.expensesAdded}</div>
      <div style="font-size:11px;color:#7c6e93;text-transform:uppercase;letter-spacing:1px;margin-top:4px">dépense${args.expensesAdded > 1 ? "s" : ""}</div>
    </div>
    <div style="width:1px;background:#e5dccc"></div>
    <div style="flex:1;text-align:center">
      <div style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;color:#10b981;line-height:1">${args.settlementsConfirmed}</div>
      <div style="font-size:11px;color:#7c6e93;text-transform:uppercase;letter-spacing:1px;margin-top:4px">règlement${args.settlementsConfirmed > 1 ? "s" : ""}</div>
    </div>
  </div>
  <div style="text-align:center;margin:24px 0">
    <a href="${url}" style="display:inline-block;padding:12px 22px;background:#3a2f5b;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">Ouvrir le groupe →</a>
  </div>
  <hr style="border:none;border-top:1px solid #e5dccc;margin:24px 0">
  <p style="font-size:11px;color:#a89a8c;text-align:center">
    L'argent partagé. L'amitié protégée.<br>
    Tu peux désactiver le résumé hebdo depuis ton profil → Notifications.
  </p>
</body></html>`;
}

function getIsoWeek(d: Date): number {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ============================================================
// Enregistrement des jobs
// ============================================================
registerJob({
  name: "reminderTontineDue",
  intervalMs: 60 * 60 * 1000, // toutes les heures
  fn: jobReminderTontineDue,
  runOnStart: true,
});

registerJob({
  name: "cleanupExpiredTokens",
  intervalMs: 60 * 60 * 1000, // toutes les heures
  fn: jobCleanupExpiredTokens,
});

registerJob({
  name: "cleanupExpiredSessions",
  intervalMs: 6 * 60 * 60 * 1000, // toutes les 6h
  fn: jobCleanupExpiredSessions,
});

registerJob({
  name: "weeklySummary",
  intervalMs: 60 * 60 * 1000, // check chaque heure (le job vérifie l'heure pour ne tourner que lundi 9h)
  fn: jobWeeklySummary,
});

// FX : refresh des taux toutes les heures (la spec demande 60s, mais
// on évite de spam le provider gratuit ; le cache mémoire fait le reste).
registerJob({
  name: "refreshFxRates",
  intervalMs: 60 * 60 * 1000, // toutes les heures
  runOnStart: true,
  fn: async () => {
    await refreshFxRates();
  },
});

// SUBSCRIPTION STATE : fait avancer les souscriptions en GRACE → WARN →
// DOWNGRADED selon les dates configurées en admin (PlanDowngradePolicy).
// Tick horaire : suffisamment réactif pour que la transition soit
// imperceptible (l'utilisateur voit le bandeau la prochaine fois qu'il
// ouvre l'app après expiration).
registerJob({
  name: "tickSubscriptionStates",
  intervalMs: 60 * 60 * 1000, // 1×/heure
  runOnStart: true,
  fn: async () => {
    await tickSubscriptionStates();
  },
});

// AFFILIATE COMMISSIONS : passe les commissions PENDING > holdDays en
// PAYABLE (= prêtes au virement Stripe Connect dès que minPayoutCents
// est atteint pour le commercial). Tick quotidien suffit.
registerJob({
  name: "tickAffiliateCommissions",
  intervalMs: 24 * 60 * 60 * 1000, // 1×/jour
  fn: async () => {
    await tickPromoteCommissionsToPayable();
  },
});

// V164.H3 — COMMERCIAL COMMISSIONS : calcul mensuel des lignes de commission
// pour tous les commerciaux agréés. Idempotent (upsert), on peut le faire
// tourner quotidiennement sans risque — il créera la ligne du mois courant
// dès que le mois change, puis ne fera que la mettre à jour les jours
// suivants si le CA du filleul évolue (changement de plan en cours de mois).
// Anti-pyramidal : 1 niveau (commercial → filleul direct) garanti par
// computeMonthlyCommissionsFor() qui ne lit que `referredById === commercial`.
registerJob({
  name: "tickCommercialCommissions",
  intervalMs: 24 * 60 * 60 * 1000, // 1×/jour (idempotent par upsert)
  runOnStart: false,
  fn: async () => {
    // Récupère tous les commerciaux agréés actifs (non suspendus)
    const commercials = await (prisma as any).user.findMany({
      where: { isCommercialAgreed: true, suspendedAt: null },
      select: { id: true },
    });
    let computed = 0;
    let errors = 0;
    for (const c of commercials) {
      try {
        const lines = await computeMonthlyCommissionsFor({
          commercialUserId: c.id,
        });
        computed += lines.length;
      } catch (e) {
        errors++;
        // eslint-disable-next-line no-console
        console.warn(
          `[V164] computeMonthlyCommissionsFor failed for ${c.id}:`,
          (e as Error).message,
        );
      }
    }
    // eslint-disable-next-line no-console
    console.info(
      `[V164] Commercial commissions tick : ${commercials.length} commerciaux, ${computed} ligne(s), ${errors} erreur(s)`,
    );
  },
});

// INVITATION REMINDERS : relances automatiques J+2, J+5, J+10 (spec §7.6).
// Tick quotidien : pour chaque InvitationOutreach status=SENT et plus
// vieille que le palier suivant, on envoie une relance via le canal initial.
// Exemple : invitation envoyée le 1er, J+2 = relance #1 le 3.
// Anti-spam : remindersSent < 3, et palier respecté.
registerJob({
  name: "invitationReminders",
  intervalMs: 24 * 60 * 60 * 1000, // 1×/jour
  fn: async () => {
    const now = Date.now();
    // Tableau des paliers : index = remindersSent, valeur = délai depuis lastSentAt
    const REMINDER_DAYS = [2, 5, 10]; // J+2, puis J+5 cumulatif, puis J+10 cumulatif
    const candidates = await prisma.invitationOutreach.findMany({
      where: {
        status: "SENT",
        remindersSent: { lt: 3 },
      },
      include: {
        inviteToken: {
          include: { group: { select: { id: true, name: true } } },
        },
      },
      take: 500, // Sécurité : si > 500 relances/jour, alerter ops
    });

    for (const o of candidates) {
      const ageDays =
        (now - o.lastSentAt.getTime()) / (24 * 60 * 60 * 1000);
      const expectedDelay = REMINDER_DAYS[o.remindersSent];
      if (!expectedDelay || ageDays < expectedDelay) continue;
      // Token expiré ou révoqué ? → on annule la relance
      if (
        o.inviteToken.revokedAt ||
        (o.inviteToken.expiresAt && o.inviteToken.expiresAt < new Date())
      ) {
        await prisma.invitationOutreach.update({
          where: { id: o.id },
          data: { status: "CANCELLED" },
        });
        continue;
      }
      // Compose le message en fonction de la tonalité et du nombre de relances
      const groupName = o.inviteToken.group.name;
      const link = `${loadEnv().WEB_BASE_URL}/join/${o.inviteToken.token}`;
      const reminderNum = o.remindersSent + 1;
      const reminderMsg = composeReminderMessage(
        o.tone,
        groupName,
        link,
        reminderNum,
      );
      // Best-effort send (silencieux si messaging échoue).
      // Pour le MVP : on envoie uniquement par email (le canal le plus
      // fiable et déjà branché à Resend). SMS et WhatsApp seront branchés
      // quand les fonctions correspondantes seront exposées dans messaging.ts.
      try {
        if (o.contactType === "EMAIL") {
          await sendEmail({
            to: o.contactValue,
            subject: `Rappel : invitation à « ${groupName} »`,
            text: reminderMsg,
          });
        } else {
          // PHONE : pas de fonction send standalone exposée. On log et on
          // laisse l'organisateur relancer manuellement via le bouton
          // « Inviter à nouveau » côté UI.
          // eslint-disable-next-line no-console
          console.log(
            `[scheduler] invitationReminders : skip phone ${o.contactValue} (sendSms non câblé)`,
          );
        }
        await prisma.invitationOutreach.update({
          where: { id: o.id },
          data: {
            remindersSent: { increment: 1 },
            lastSentAt: new Date(),
          },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          `[scheduler] invitationReminders failed for ${o.id}:`,
          (e as Error).message,
        );
      }
    }
  },
});

function composeReminderMessage(
  tone: string,
  groupName: string,
  link: string,
  reminderNum: number,
): string {
  // Tonalités calibrées spec §3.8 (sympa / ferme / humour / pro)
  if (tone === "ferme") {
    return `Rappel : tu n'as pas encore rejoint « ${groupName} ». Le lien : ${link}`;
  }
  if (tone === "humour") {
    return reminderNum === 1
      ? `Tu m'as oublié pour « ${groupName} » ? 🥺 Lien : ${link}`
      : `T'es sûr·e que tu veux pas rejoindre « ${groupName} » ? On t'attend ! 🍿 ${link}`;
  }
  if (tone === "pro") {
    return `Pour rappel, l'invitation à rejoindre le groupe « ${groupName} » est toujours active. Lien : ${link}`;
  }
  // sympa par défaut
  return reminderNum === 1
    ? `Coucou ! Tu n'as pas encore rejoint « ${groupName} » — le lien est toujours là : ${link}`
    : `Petit rappel pour « ${groupName} » 😊 Tu peux toujours rejoindre via : ${link}`;
}

// CONTACT RE-VERIFY : marque comme stales les contacts dont la
// vérification date de plus de 6 mois (spec §7.3). On ne forcent PAS
// la re-vérif, on lève juste un drapeau côté API : `staleSince` qui
// permet à l'UI d'afficher un badge ⚠ et à l'utilisateur de revérifier
// quand ça l'arrange. Une re-vérification "silencieuse" (OTP envoyé
// dès que l'utilisateur ouvre l'app après 6 mois) serait possible mais
// agressive — on préfère une approche pull-driven.
registerJob({
  name: "markStaleContacts",
  intervalMs: 24 * 60 * 60 * 1000, // 1×/jour
  runOnStart: true,
  fn: async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    // Compte (informatif) — la vraie info vient en lecture sur le profil
    const stale = await prisma.userContact.count({
      where: {
        isVerified: true,
        verifiedAt: { lt: sixMonthsAgo, not: null },
      },
    });
    if (stale > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] markStaleContacts → ${stale} contact(s) > 6 mois sans re-vérif`,
      );
    }
  },
});

// ============================================================
// Sprint AC-4 · Rotation des fichiers audio (RGPD + ménage disque)
// ============================================================
//
// Stratégie : on garde les enregistrements audio (réunions et preuves
// de marché) pendant 90 jours par défaut. Au-delà, on supprime le
// fichier physique du disque mais on garde la row (avec audioStorageKey="")
// pour l'audit + le transcript reste consultable.
//
// La rétention est configurable globalement via env BMD_AUDIO_RETENTION_DAYS
// (défaut 90). À terme, faire éditable par plan via Plan.limits.
//
// Tourne 1×/jour. Idempotent — si un fichier a déjà été supprimé manuellement
// (via le bouton "Supprimer l'audio"), unlink() throw mais on catch.
registerJob({
  name: "rotateAudioFiles",
  intervalMs: 24 * 60 * 60 * 1000, // 1×/jour
  runOnStart: false, // pas au démarrage, on attend 24h
  fn: async () => {
    const retentionDays = parseInt(
      process.env.BMD_AUDIO_RETENTION_DAYS ?? "90",
      10,
    );
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const { unlink } = await import("fs/promises");
    const path = await import("path");
    const uploadDir = path.resolve(
      process.cwd(),
      process.env.BMD_UPLOAD_DIR ?? "uploads",
    );

    // 1. Réunions trop vieilles avec audio encore présent
    const oldMeetings = await (prisma as any).meetingRecord.findMany({
      where: {
        createdAt: { lt: cutoff },
        audioStorageKey: { not: "" },
      },
      select: { id: true, audioStorageKey: true },
      take: 200, // batch, on traite max 200/jour pour éviter de saturer
    });
    let purgedMeetings = 0;
    for (const m of oldMeetings as Array<{ id: string; audioStorageKey: string }>) {
      try {
        await unlink(path.join(uploadDir, m.audioStorageKey));
      } catch {
        // ignore : déjà supprimé
      }
      await (prisma as any).meetingRecord.update({
        where: { id: m.id },
        data: { audioStorageKey: "" },
      });
      purgedMeetings++;
    }

    // 2. Audio proofs (ExpenseAttachment kind=AUDIO_PROOF) trop vieilles
    // On NE supprime PAS la row (le transcript reste utile en search), juste
    // le fichier physique. storageKey="" indique purgé.
    const oldAttachments = await (prisma as any).expenseAttachment.findMany({
      where: {
        kind: "AUDIO_PROOF",
        createdAt: { lt: cutoff },
        storageKey: { not: "" },
      },
      select: { id: true, storageKey: true },
      take: 500,
    });
    let purgedAttachments = 0;
    for (const a of oldAttachments as Array<{ id: string; storageKey: string }>) {
      try {
        await unlink(path.join(uploadDir, a.storageKey));
      } catch {
        /* ignore */
      }
      await (prisma as any).expenseAttachment.update({
        where: { id: a.id },
        data: { storageKey: "" },
      });
      purgedAttachments++;
    }

    if (purgedMeetings > 0 || purgedAttachments > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] rotateAudioFiles → ${purgedMeetings} meetings + ${purgedAttachments} audio proofs purged (>${retentionDays}j)`,
      );
    }
  },
});

// V150.F — Cycle de vie RDD : expirations + auto-complétion + retards.
import {
  tickExpirePendingDebtProposals,
  tickAutoCompletePaidDebts,
  tickUpdateScheduleLateness,
} from "../modules/debts/debt-lifecycle.service.js";

// Job 1 : auto-expire les propositions RDD non répondues (7 jours par défaut,
// configuré côté createDebt). Tick horaire pour réactivité.
registerJob({
  name: "expirePendingDebtProposals",
  intervalMs: 60 * 60 * 1000, // 1×/heure
  runOnStart: false,
  fn: async () => {
    const r = await tickExpirePendingDebtProposals();
    if (r.expired > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] expirePendingDebtProposals → ${r.expired} expired`,
      );
    }
  },
});

// Job 2 : auto-complète les RDD dont toutes les échéances sont CONFIRMED.
// Tick horaire : suffit largement, l'utilisateur verra le certificat au prochain
// rechargement de la page détail.
registerJob({
  name: "autoCompletePaidDebts",
  intervalMs: 60 * 60 * 1000, // 1×/heure
  runOnStart: false,
  fn: async () => {
    const r = await tickAutoCompletePaidDebts();
    if (r.completed > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] autoCompletePaidDebts → ${r.completed} completed`,
      );
    }
  },
});

// Job 3 : met à jour les statuts d'échéances en retard (PENDING → LATE puis
// MISSED) et bascule les RDD avec MISSED en DEFAULTED. Tick quotidien.
registerJob({
  name: "updateDebtScheduleLateness",
  intervalMs: 24 * 60 * 60 * 1000, // 1×/jour
  runOnStart: false,
  fn: async () => {
    const r = await tickUpdateScheduleLateness();
    if (r.late > 0 || r.missed > 0 || r.defaulted > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] updateDebtScheduleLateness → late=${r.late} missed=${r.missed} defaulted=${r.defaulted}`,
      );
    }
  },
});
