/**
 * V150.C — Webhook handler Yousign.
 *
 * Route publique (pas d'authentification user, validée par HMAC HSA-256).
 * Reçoit les événements signature_request.* et signer.* envoyés par Yousign,
 * met à jour DebtAgreement.yousignStatus, marque les DebtParty.signatureStatus
 * et déclenche les transitions métier (NEGOTIATING → SIGNED quand tous les
 * signers sont DONE).
 *
 * Sécurité :
 *   - HMAC obligatoire (rejette tout si YOUSIGN_WEBHOOK_SECRET pas configuré)
 *   - Lecture brute du body via fastify raw body (raw=true)
 *   - Idempotent : on stocke event_id pour éviter les retours en double
 *
 * Référence : https://developers.yousign.com/reference/webhooks
 */

import type { FastifyInstance } from "fastify";
import { verifyYousignWebhook } from "../debts/yousign.service.js";
import { prisma as prismaClient } from "../../lib/db.js";
import { notifyOne } from "../notifications/notifications.service.js";

const prisma = prismaClient as any;

export async function yousignWebhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /webhooks/yousign
   * Body brut JSON signé. Header X-Yousign-Signature-256 obligatoire.
   */
  app.post(
    "/webhooks/yousign",
    {
      // Désactiver le parser JSON par défaut pour avoir le body brut
      // (nécessaire à la vérification HMAC).
      config: { rawBody: true } as any,
    },
    async (req, reply) => {
      const rawBody =
        (req as any).rawBody ??
        (typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body ?? {}));
      const signature =
        (req.headers["x-yousign-signature-256"] as string | undefined) ??
        (req.headers["X-Yousign-Signature-256"] as string | undefined);

      if (!verifyYousignWebhook(rawBody as string, signature)) {
        // eslint-disable-next-line no-console
        console.warn("[yousign-webhook] signature invalide ou secret manquant");
        return reply.code(401).send({ error: "invalid_signature" });
      }

      let payload: any;
      try {
        payload =
          typeof rawBody === "string" ? JSON.parse(rawBody) : (req.body as any);
      } catch {
        return reply.code(400).send({ error: "invalid_json" });
      }

      const eventName = String(payload?.event_name ?? "");
      const procedureId =
        payload?.data?.signature_request?.id ??
        payload?.data?.signer?.signature_request_id ??
        null;
      const signerId = payload?.data?.signer?.id ?? null;
      const signerStatus = payload?.data?.signer?.status ?? null;
      const requestStatus = payload?.data?.signature_request?.status ?? null;

      if (!procedureId) {
        // Pas d'ID procédure → on ne sait pas à quel contrat associer.
        // On 200 quand même pour ne pas faire retry-loop.
        return reply.send({ ok: true, skipped: "no_procedure_id" });
      }

      const debt = await prisma.debtAgreement.findFirst({
        where: { yousignProcedureId: procedureId },
        include: { parties: true },
      });
      if (!debt) {
        return reply.send({ ok: true, skipped: "debt_not_found" });
      }

      // 1. Update du statut Yousign sur le contrat (toujours).
      await prisma.debtAgreement.update({
        where: { id: debt.id },
        data: {
          yousignStatus: requestStatus ?? debt.yousignStatus,
          yousignLastEventAt: new Date(),
        },
      });

      // 2. Si on a un signer ID + status, on update la DebtParty correspondante.
      let updatedParty: any = null;
      if (signerId && signerStatus) {
        const party = debt.parties.find(
          (p: any) => p.yousignSignerId === signerId,
        );
        if (party) {
          const mappedStatus = mapYousignSignerStatus(signerStatus);
          updatedParty = await prisma.debtParty.update({
            where: { id: party.id },
            data: {
              signatureStatus: mappedStatus,
              signedAt:
                mappedStatus === "SIGNED" ? new Date() : party.signedAt,
              signatureProof:
                mappedStatus === "SIGNED"
                  ? `yousign:${signerId}`
                  : party.signatureProof,
            },
          });
        }
      }

      // 3. Log un DebtEvent pour traçabilité complète.
      await prisma.debtEvent.create({
        data: {
          debtId: debt.id,
          actorUserId: null,
          kind: "YOUSIGN_WEBHOOK",
          payload: {
            eventName,
            eventId: payload?.event_id ?? null,
            procedureStatus: requestStatus,
            signerId,
            signerStatus,
          },
        },
      });

      // 4. Transitions métier selon l'événement.
      if (
        eventName === "signature_request.done" ||
        requestStatus === "done"
      ) {
        // Tous les signataires ont signé → contrat SIGNED + startDate.
        if (debt.status !== "SIGNED" && debt.status !== "ACTIVE") {
          await prisma.debtAgreement.update({
            where: { id: debt.id },
            data: {
              status: "SIGNED",
              signedAt: new Date(),
              startDate: debt.startDate ?? new Date(),
            },
          });
          // Notifie créditeur + débiteur.
          for (const p of debt.parties as any[]) {
            if (!p.userId) continue;
            if (p.role !== "CREDITOR" && p.role !== "DEBTOR") continue;
            await notifyOne(p.userId, {
              kind: "DEBT_ACCEPTED" as any,
              title: `Contrat signé · RDD ${debt.publicCode}`,
              body: `Le contrat ${debt.publicCode} a été signé par toutes les parties via Yousign.`,
              link: `/dashboard/debts/${debt.id}`,
              payload: { debtId: debt.id, procedureId },
            } as any);
          }
        }
      } else if (
        eventName === "signature_request.cancelled" ||
        requestStatus === "cancelled" ||
        eventName === "signature_request.expired" ||
        requestStatus === "expired"
      ) {
        // Procédure annulée ou expirée → retour à NEGOTIATING.
        if (debt.status === "PROPOSED" || debt.status === "ACCEPTED") {
          await prisma.debtAgreement.update({
            where: { id: debt.id },
            data: { status: "NEGOTIATING" },
          });
        }
      }

      return reply.send({
        ok: true,
        eventName,
        debtId: debt.id,
        partyUpdated: updatedParty?.id ?? null,
      });
    },
  );
}

/** Mappe les statuts signataire Yousign vers DebtSignatureStatus interne. */
function mapYousignSignerStatus(
  status: string,
): "PENDING" | "SIGNED" | "DECLINED" | "EXPIRED" {
  switch (status) {
    case "signed":
    case "done":
      return "SIGNED";
    case "declined":
      return "DECLINED";
    case "expired":
      return "EXPIRED";
    case "notified":
    case "processing":
    case "consent_given":
    case "initiated":
    default:
      return "PENDING";
  }
}
