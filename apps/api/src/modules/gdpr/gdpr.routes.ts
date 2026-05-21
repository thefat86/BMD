/**
 * Routes RGPD (spec §9.1 §11) — droit à l'oubli + portabilité.
 *
 *   GET  /gdpr/export-me           → JSON complet de toutes mes données
 *   POST /gdpr/delete-me/request   → envoie un OTP de confirmation
 *   POST /gdpr/delete-me/confirm   → vérifie l'OTP et supprime tout
 *
 * Sécurité :
 *  - L'export n'inclut JAMAIS les codeHash OTP, tokenHash sessions, etc.
 *    (données sensibles internes). Uniquement les données fonctionnelles.
 *  - La suppression demande un OTP envoyé sur le contact primaire vérifié.
 *  - Les ActivityLog sont préservés mais anonymisés (actorId → null).
 *  - Les groupes dont l'utilisateur est seul admin sont supprimés en cascade.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { requestOtp, verifyOtp } from "../auth/otp.service.js";

export async function gdprRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /gdpr/export-me
   * Retourne tout ce qu'on a sur l'utilisateur, prêt à être archivé.
   */
  app.get("/gdpr/export-me", async (req, reply) => {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        contacts: {
          select: {
            type: true,
            value: true,
            isVerified: true,
            isPrimary: true,
            verifiedAt: true,
            createdAt: true,
          },
        },
        groupMemberships: {
          select: {
            role: true,
            joinedAt: true,
            doNotDisturb: true,
            group: {
              select: { id: true, name: true, type: true, defaultCurrency: true },
            },
          },
        },
        expensesPaid: {
          select: {
            id: true,
            description: true,
            amount: true,
            currency: true,
            category: true,
            occurredAt: true,
            createdAt: true,
            groupId: true,
          },
        },
        expenseShares: {
          select: {
            amountOwed: true,
            expense: {
              select: {
                id: true,
                description: true,
                groupId: true,
              },
            },
          },
        },
        settlementsFrom: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            proposedAt: true,
            confirmedByPayerAt: true,
            confirmedByPayeeAt: true,
            groupId: true,
            toUserId: true,
          },
        },
        settlementsTo: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            proposedAt: true,
            confirmedByPayerAt: true,
            confirmedByPayeeAt: true,
            groupId: true,
            fromUserId: true,
          },
        },
        tontineContributions: {
          select: {
            amount: true,
            status: true,
            paidAt: true,
            confirmedAt: true,
            paymentMethod: true,
            turnId: true,
          },
        },
        notifications: {
          select: {
            kind: true,
            title: true,
            body: true,
            createdAt: true,
            readAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    });
    if (!user) throw Errors.notFound("Compte introuvable");

    // Décimales → string pour préserver la précision dans le JSON
    const stringify = (v: unknown): unknown => {
      if (v === null || v === undefined) return v;
      if (typeof v === "object" && "toString" in v && "constructor" in v && (v as any).constructor?.name === "Decimal") {
        return (v as any).toString();
      }
      if (Array.isArray(v)) return v.map(stringify);
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          out[k] = stringify(val);
        }
        return out;
      }
      return v;
    };

    reply.header(
      "content-disposition",
      `attachment; filename="bmd-export-${user.id}-${Date.now()}.json"`,
    );
    return {
      _meta: {
        exportedAt: new Date().toISOString(),
        format: "BMD GDPR Export v1",
        userId: user.id,
        notice:
          "Cet export contient toutes tes données BMD au format JSON, conformément au droit à la portabilité (RGPD art. 20).",
      },
      user: {
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatar,
        defaultCurrency: user.defaultCurrency,
        defaultLocale: user.defaultLocale,
        planCode: user.planCode,
        reminderTone: user.reminderTone,
        twoFactorEnabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      contacts: stringify(user.contacts),
      groups: stringify(user.groupMemberships),
      expenses: {
        paidByMe: stringify(user.expensesPaid),
        myShares: stringify(user.expenseShares),
      },
      settlements: {
        iOwe: stringify(user.settlementsFrom),
        owedToMe: stringify(user.settlementsTo),
      },
      tontineContributions: stringify(user.tontineContributions),
      recentNotifications: stringify(user.notifications),
    };
  });

  /**
   * POST /gdpr/delete-me/request
   * Envoie un OTP de confirmation sur le contact primaire vérifié.
   */
  app.post("/gdpr/delete-me/request", async (req, reply) => {
    const userId = req.user.sub;
    const primary = await prisma.userContact.findFirst({
      where: { userId, isPrimary: true, isVerified: true },
    });
    if (!primary) {
      throw Errors.badRequest(
        "Tu n'as pas de contact principal vérifié — impossible de confirmer la suppression 🔐",
        {
          tip: "Vérifie au moins un contact (téléphone ou email) avant de pouvoir supprimer ton compte.",
        },
      );
    }
    const r = await requestOtp({
      contactType: primary.type,
      contactValue: primary.value,
    });
    return reply.code(202).send({
      sent: true,
      expiresAt: r.expiresAt.toISOString(),
    });
  });

  /**
   * POST /gdpr/delete-me/confirm
   * Vérifie l'OTP puis supprime définitivement le compte.
   * Précautions :
   *  - Si l'utilisateur est seul admin d'un groupe → le groupe est supprimé en cascade
   *  - Les ActivityLog sont anonymisés (actorId → null) plutôt que supprimés
   *  - Toutes les sessions sont révoquées immédiatement
   */
  app.post("/gdpr/delete-me/confirm", async (req) => {
    const userId = req.user.sub;
    const body = z.object({ code: z.string().min(4).max(8) }).parse(req.body);

    const primary = await prisma.userContact.findFirst({
      where: { userId, isPrimary: true, isVerified: true },
    });
    if (!primary) {
      throw Errors.badRequest("Aucun contact principal trouvé pour vérification.");
    }

    const otpResult = await verifyOtp({
      contactType: primary.type,
      contactValue: primary.value,
      code: body.code,
    });
    if (!otpResult.valid) {
      const reason =
        otpResult.reason === "expired"
          ? "Le code a expiré ⏰ — relance la demande pour un nouveau."
          : otpResult.reason === "max_attempts"
            ? "Trop de tentatives 🚫 — relance la demande."
            : "Le code ne correspond pas. Vérifie et retente.";
      throw Errors.unauthorized(reason);
    }

    // Identifie les groupes où l'utilisateur est seul admin → ils seront supprimés
    const myAdminGroups = await prisma.groupMember.findMany({
      where: { userId, role: "ADMIN" },
      select: { groupId: true },
    });
    const orphanGroupIds: string[] = [];
    for (const m of myAdminGroups) {
      const otherAdmins = await prisma.groupMember.count({
        where: { groupId: m.groupId, role: "ADMIN", userId: { not: userId } },
      });
      if (otherAdmins === 0) orphanGroupIds.push(m.groupId);
    }

    await prisma.$transaction(async (tx) => {
      // Anonymise les ActivityLog (préservation de l'audit chain)
      await tx.activityLog.updateMany({
        where: { actorId: userId },
        data: { actorId: null },
      });

      // Supprime les groupes orphelins (cascade Prisma sur expenses, etc.)
      if (orphanGroupIds.length > 0) {
        await tx.group.deleteMany({
          where: { id: { in: orphanGroupIds } },
        });
      }

      // Révoque toutes les sessions actives (sera de toute façon cascade)
      await tx.session.deleteMany({ where: { userId } });

      // Supprime l'utilisateur (cascade sur contacts, memberships, notifications, etc.)
      await tx.user.delete({ where: { id: userId } });
    });

    return { deleted: true, orphanGroupsDeleted: orphanGroupIds.length };
  });
}
