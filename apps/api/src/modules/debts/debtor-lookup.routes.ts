/**
 * V155 — Routes lookup débiteur et track record.
 *
 *  - GET /users/lookup-by-contact?value=...
 *    Cherche un user BMD par email ou téléphone. Retourne le minimum
 *    (id, displayName, avatar, contact normalisé matché) pour permettre
 *    l'auto-fill du wizard de création RDD côté front.
 *
 *  - GET /users/:id/debt-track-record
 *    Renvoie le track record agrégé d'un user en tant que débiteur :
 *    nombre de RDD complétées, % échéances payées à temps, ancienneté,
 *    verdict (EXCELLENT/GOOD/AVERAGE/AT_RISK/NEW).
 *
 *    Privacy : aucune info ne révèle l'identité des créanciers ni les
 *    montants individuels. On reste sur des agrégats interprétables
 *    par le prêteur potentiel pour évaluer le risque.
 *
 * Auth : assertAuthenticated (hook onRequest). Pas d'admin requis —
 * c'est une fonctionnalité produit accessible à tout user payant.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { validateEmail, normalizePhone } from "../../lib/validators.js";

const lookupQuerySchema = z.object({
  value: z.string().min(1).max(200),
});

export async function debtorLookupRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /users/lookup-by-contact?value=<email_or_phone>
   *
   * Tente de matcher la valeur fournie sur un UserContact (EMAIL ou PHONE).
   * Email : lowercase + trim. Phone : normalisation E.164 (cf. validators).
   * Si plusieurs comptes matchent (ne devrait pas, vu l'unique constraint),
   * on renvoie le plus ancien (createdAt asc).
   */
  app.get("/users/lookup-by-contact", async (req) => {
    const parsed = lookupQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return { found: false, reason: "invalid_query" as const };
    }
    const raw = parsed.data.value.trim();

    // On essaye email d'abord (présence de @)
    const isEmail = raw.includes("@");
    let normalized: string | null = null;
    let contactType: "EMAIL" | "PHONE" | null = null;

    if (isEmail) {
      const emailCheck = validateEmail(raw);
      if (!emailCheck.ok || !emailCheck.value) {
        return { found: false, reason: "invalid_email" as const };
      }
      normalized = emailCheck.value;
      contactType = "EMAIL";
    } else {
      // Tentative comme numéro de téléphone
      const phoneNorm = normalizePhone(raw);
      // Validation basique : doit commencer par + et avoir au moins 8 chiffres
      if (!phoneNorm.startsWith("+") || phoneNorm.length < 9) {
        return { found: false, reason: "invalid_phone" as const };
      }
      normalized = phoneNorm;
      contactType = "PHONE";
    }

    const contact = await prisma.userContact.findFirst({
      where: { type: contactType, value: normalized },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatar: true,
            createdAt: true,
            suspendedAt: true,
          },
        },
      },
    });

    // V77 — Privacy : on ne révèle un compte que s'il n'est pas suspendu
    if (!contact || !contact.user || contact.user.suspendedAt) {
      return {
        found: false,
        normalizedValue: normalized,
        contactType,
      } as const;
    }

    const userId = contact.user.id;
    const callerId = (req.user as any).sub;
    // Sécurité : ne pas révéler son propre compte comme débiteur potentiel
    if (userId === callerId) {
      return {
        found: false,
        normalizedValue: normalized,
        contactType,
        reason: "self_match" as const,
      };
    }

    return {
      found: true,
      userId,
      displayName: contact.user.displayName,
      avatar: contact.user.avatar,
      memberSince: contact.user.createdAt.toISOString(),
      normalizedValue: normalized,
      contactType,
    } as const;
  });

  /**
   * GET /users/:id/debt-track-record
   *
   * Renvoie des stats agrégées sur les RDD du user en tant que DEBTOR.
   *
   * Calcul du verdict :
   *  - NEW : aucune RDD passée
   *  - EXCELLENT : >= 3 RDD complétées + 0 retard ni dispute
   *  - GOOD : >= 1 RDD complétée + <= 1 retard tolérable
   *  - AVERAGE : RDD en cours mais quelques retards ponctuels
   *  - AT_RISK : >= 1 RDD en dispute OU >= 3 échéances missed
   *
   * Privacy : pas d'info sur les créanciers ni montants détaillés.
   */
  app.get("/users/:id/debt-track-record", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: "bad_request" });
    }
    const userId = params.data.id;

    // Récupère le user pour ancienneté + check existence
    const user = (await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true, suspendedAt: true },
    })) as { id: string; createdAt: Date; suspendedAt: Date | null } | null;

    if (!user || user.suspendedAt) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    // Récupère toutes les RDD où ce user est DEBTOR
    const debts = (await (prisma as any).debtAgreement.findMany({
      where: {
        parties: {
          some: { userId, role: "DEBTOR" },
        },
      },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        schedules: {
          select: {
            status: true,
            dueDate: true,
            paidAt: true,
          },
        },
      },
    })) as Array<{
      id: string;
      status: string;
      amount: any;
      currency: string;
      createdAt: Date;
      schedules: Array<{
        status: string;
        dueDate: Date;
        paidAt: Date | null;
      }>;
    }>;

    const totalDebts = debts.length;
    const completedDebts = debts.filter((d) => d.status === "COMPLETED").length;
    const activeDebts = debts.filter(
      (d) => d.status === "ACTIVE" || d.status === "SIGNED",
    ).length;
    const lateDebts = debts.filter(
      (d) => d.status === "LATE" || d.status === "MISSED",
    ).length;
    const disputedDebts = debts.filter((d) => d.status === "DISPUTED").length;

    // Calcul échéances
    let totalSchedules = 0;
    let paidOnTime = 0;
    let paidLate = 0;
    let missed = 0;
    for (const d of debts) {
      for (const s of d.schedules) {
        totalSchedules++;
        if (s.status === "PAID" || s.status === "CONFIRMED") {
          // Considéré "on time" si paidAt <= dueDate
          if (s.paidAt && s.paidAt.getTime() <= s.dueDate.getTime() + 24 * 3600 * 1000) {
            paidOnTime++;
          } else {
            paidLate++;
          }
        } else if (s.status === "MISSED") {
          missed++;
        }
      }
    }
    const completedSchedules = paidOnTime + paidLate + missed;
    const onTimeRate =
      completedSchedules > 0
        ? Math.round((paidOnTime / completedSchedules) * 100)
        : null;

    // Verdict
    type Verdict = "NEW" | "EXCELLENT" | "GOOD" | "AVERAGE" | "AT_RISK";
    let verdict: Verdict = "NEW";
    if (totalDebts === 0) {
      verdict = "NEW";
    } else if (disputedDebts > 0 || missed >= 3) {
      verdict = "AT_RISK";
    } else if (
      completedDebts >= 3 &&
      lateDebts === 0 &&
      (onTimeRate ?? 100) >= 95
    ) {
      verdict = "EXCELLENT";
    } else if (
      completedDebts >= 1 &&
      lateDebts <= 1 &&
      (onTimeRate ?? 0) >= 75
    ) {
      verdict = "GOOD";
    } else {
      verdict = "AVERAGE";
    }

    const memberSinceMonths = Math.max(
      0,
      Math.round(
        (Date.now() - user.createdAt.getTime()) / (30 * 24 * 3600 * 1000),
      ),
    );

    return {
      userId,
      memberSince: user.createdAt.toISOString(),
      memberSinceMonths,
      verdict,
      stats: {
        totalDebts,
        completedDebts,
        activeDebts,
        lateDebts,
        disputedDebts,
        totalSchedules,
        paidOnTime,
        paidLate,
        missed,
        onTimeRate,
      },
    };
  });
}
