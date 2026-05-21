import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  computeBalanceWithSuggestions,
  computePersonBalances,
  computeUserGlobalBalance,
} from "./balance.service.js";
import {
  cancelCrossGroupSettlement,
  confirmCrossGroupSettlement,
  createCrossGroupSettlement,
} from "./cross-group-settlement.service.js";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { cacheGetOrSet, cacheDel } from "../../lib/cache.js";

export async function settlementsRoutes(app: FastifyInstance): Promise<void> {
  /* ===== Routes publiques (mode invité — pas d'auth requise) ===== */

  /**
   * GET /pay-info/:token
   * Récupère les infos publiques d'un token de paiement (mode invité).
   * Pas d'auth requise — utilisé par la page publique /pay/[token].
   */
  app.get(
    "/pay-info/:token",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const { token } = z
        .object({ token: z.string().min(20).max(80) })
        .parse(req.params);
      const t = await prisma.settlementPaymentToken.findUnique({
        where: { token },
        include: {
          settlement: {
            include: {
              group: { select: { name: true } },
              fromUser: { select: { displayName: true } },
              toUser: { select: { displayName: true } },
            },
          },
        },
      });
      if (!t) return reply.code(404).send({ error: "not_found" });
      if (t.expiresAt < new Date()) {
        return reply.code(410).send({ error: "expired" });
      }
      if (t.usedAt) {
        return reply.code(409).send({ error: "already_used" });
      }
      return {
        groupName: t.settlement.group.name,
        from: t.settlement.fromUser.displayName,
        to: t.settlement.toUser.displayName,
        amount: t.settlement.amount.toString(),
        currency: t.settlement.currency,
        status: t.settlement.status,
      };
    },
  );

  /**
   * POST /pay-confirm/:token
   * Marque le règlement comme PAID (côté payeur invité).
   * Le créancier devra confirmer côté app pour finaliser.
   */
  app.post(
    "/pay-confirm/:token",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const { token } = z
        .object({ token: z.string().min(20).max(80) })
        .parse(req.params);
      const t = await prisma.settlementPaymentToken.findUnique({
        where: { token },
        include: { settlement: true },
      });
      if (!t) return reply.code(404).send({ error: "not_found" });
      if (t.expiresAt < new Date()) {
        return reply.code(410).send({ error: "expired" });
      }
      if (t.usedAt) {
        return reply.code(409).send({ error: "already_used" });
      }
      await prisma.$transaction([
        prisma.settlement.update({
          where: { id: t.settlementId },
          data: {
            status: "PAID",
            confirmedByPayerAt: new Date(),
          },
        }),
        prisma.settlementPaymentToken.update({
          where: { id: t.id },
          data: { usedAt: new Date() },
        }),
      ]);
      return { confirmed: true };
    },
  );

  /* ===== Routes authentifiées ===== */

  app.addHook("onRequest", app.authenticate);

  /**
   * GET /groups/:id/balance
   * Returns net balance per member + suggested settlements.
   */
  app.get("/groups/:id/balance", async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await computeBalanceWithSuggestions(
      params.id,
      req.user.sub,
    );
    return {
      currency: result.currency,
      balances: result.balances.map((b) => ({
        userId: b.userId,
        displayName: b.displayName,
        net: b.net.toString(),
      })),
      suggestions: result.suggestions.map((s) => ({
        fromUserId: s.fromUserId,
        fromName: s.fromName,
        toUserId: s.toUserId,
        toName: s.toName,
        amount: s.amount.toString(),
        currency: s.currency,
      })),
    };
  });

  /**
   * GET /me/global-balance
   * Solde global de l'utilisateur sur tous ses groupes.
   * Utilisé par le dashboard pour afficher la "balance card" en haut.
   */
  app.get("/me/global-balance", async (req) => {
    return computeUserGlobalBalance(req.user.sub);
  });

  /**
   * V26 · GET /me/balances/by-person
   * Vue **par personne** du dashboard : pour chaque contrepartie avec qui
   * l'utilisateur partage au moins un groupe, le solde net agrégé en devise
   * utilisateur, avec un breakdown par groupe pour drill-down.
   *
   * Cache 30 s (clé personnelle) pour absorber les rechargements rapides du
   * dashboard sans recalculer à chaque appel. L'invalidation automatique se
   * fait quand une Expense est créée/supprimée (hook `expense.changed` SSE)
   * — pour que le solde se mette à jour en quasi-temps-réel.
   */
  app.get("/me/balances/by-person", async (req) => {
    return cacheGetOrSet(`person-balances:${req.user.sub}`, 30, () =>
      computePersonBalances(req.user.sub),
    );
  });

  /**
   * POST /groups/:id/settlements
   * Crée un règlement explicite (le payeur ou un admin déclare une dette
   * à régler en dehors de l'app — Mobile Money, virement, espèces).
   */
  app.post("/groups/:id/settlements", async (req) => {
    const { id: groupId } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        fromUserId: z.string().uuid(),
        toUserId: z.string().uuid(),
        amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
        currency: z.string().length(3).optional(),
      })
      .parse(req.body);
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        defaultCurrency: true,
        members: { select: { userId: true } },
      },
    });
    if (!group) throw Errors.notFound("Ce groupe est introuvable 🔍");
    const isMember = group.members.some(
      (m) => m.userId === req.user.sub,
    );
    if (!isMember) throw Errors.notMember("ce groupe");
    return prisma.settlement.create({
      data: {
        groupId,
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: new Prisma.Decimal(body.amount),
        currency: body.currency ?? group.defaultCurrency,
        status: "PROPOSED",
      },
    });
  });

  /**
   * POST /settlements/:id/payment-tokens (mode invité — spec §7.6)
   * Génère un token public pour permettre au payeur de confirmer
   * le règlement sans créer de compte. TTL 14 jours.
   */
  app.post("/settlements/:id/payment-tokens", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        group: {
          select: {
            members: { select: { userId: true, role: true } },
          },
        },
      },
    });
    if (!settlement) throw Errors.notFound("Ce règlement est introuvable 🔍");
    const member = settlement.group.members.find(
      (m) => m.userId === req.user.sub,
    );
    if (!member) throw Errors.notMember("ce groupe");
    // Le créancier OU un admin peut générer un lien de paiement
    if (
      settlement.toUserId !== req.user.sub &&
      member.role !== "ADMIN"
    ) {
      throw Errors.forbidden(
        "Seul le créancier ou un admin du groupe peut créer un lien de paiement 🔗",
        {
          tip: "Le créancier (la personne qui doit recevoir l'argent) garde la main sur les liens de paiement de ses créances.",
        },
      );
    }
    const { randomBytes } = await import("crypto");
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
    return prisma.settlementPaymentToken.create({
      data: {
        token,
        settlementId: id,
        createdById: req.user.sub,
        expiresAt,
      },
    });
  });

  /**
   * POST /settlements/:id/confirm
   * Le créancier confirme avoir reçu le paiement (statut PAID → CONFIRMED).
   */
  app.post("/settlements/:id/confirm", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const s = await prisma.settlement.findUnique({ where: { id } });
    if (!s) throw Errors.notFound("Règlement introuvable");
    if (s.toUserId !== req.user.sub) {
      throw Errors.forbidden(
        "Seule la personne qui devait recevoir l'argent peut confirmer ce règlement 💰",
        {
          tip: "Le créancier confirme la réception — c'est ce qui marque le règlement comme « finalisé ».",
        },
      );
    }
    if (s.status !== "PAID") {
      throw Errors.invalidState({
        what: "Ce règlement",
        currentState:
          s.status === "PROPOSED"
            ? "encore en attente du paiement"
            : s.status === "CONFIRMED"
              ? "déjà confirmé ✅"
              : "annulé",
        tip:
          s.status === "PROPOSED"
            ? "Le débiteur doit d'abord déclarer avoir payé avant que tu puisses confirmer la réception."
            : "Pas besoin de confirmer deux fois — c'est déjà bouclé.",
      });
    }
    // V26 — Invalidation explicite des caches pair-à-pair pour les 2 parties
    // après confirmation. Le calcul prend en compte les Settlements CONFIRMED
    // depuis V26-1, donc le solde change au moment du passage à CONFIRMED.
    // Sans cette invalidation, le user verrait les anciennes valeurs jusqu'à
    // 30s (TTL du cache).
    await Promise.all([
      cacheDel(`person-balances:${s.fromUserId}`),
      cacheDel(`person-balances:${s.toUserId}`),
    ]);

    return prisma.settlement.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedByPayeeAt: new Date(),
      },
    });
  });

  // ===================================================================
  // V30 · Cross-group settlements (règlement multi-groupe en 1 tap)
  // ===================================================================

  /**
   * V30 · POST /me/cross-settlements
   *
   * Crée un règlement multi-groupe : 1 parent + N child Settlements
   * (un par groupe affecté), en transaction Prisma. Status initial =
   * PROPOSED. Le créancier devra ensuite confirmer la réception.
   *
   * Body :
   * ```json
   * {
   *   "counterpartyUserId": "uuid",
   *   "netDirection": "actorPays" | "actorReceives",
   *   "totalAmount": "142.50",
   *   "currency": "EUR",
   *   "memo": "MoMo ABC123" (optionnel),
   *   "children": [
   *     { "groupId": "uuid", "direction": "actorReceives", "amount": "80.00", "currency": "EUR" },
   *     { "groupId": "uuid", "direction": "actorReceives", "amount": "100.00", "currency": "EUR" },
   *     { "groupId": "uuid", "direction": "actorPays",     "amount": "37.50",  "currency": "EUR" }
   *   ]
   * }
   * ```
   */
  app.post("/me/cross-settlements", async (req) => {
    const body = z
      .object({
        counterpartyUserId: z.string().uuid(),
        netDirection: z.enum(["actorPays", "actorReceives"]),
        totalAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
        currency: z.string().length(3),
        memo: z.string().max(200).optional(),
        children: z
          .array(
            z.object({
              groupId: z.string().uuid(),
              direction: z.enum(["actorPays", "actorReceives"]),
              amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
              currency: z.string().length(3),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(req.body);

    const result = await createCrossGroupSettlement({
      actorUserId: req.user.sub,
      counterpartyUserId: body.counterpartyUserId,
      netDirection: body.netDirection,
      totalAmount: body.totalAmount,
      currency: body.currency,
      memo: body.memo,
      children: body.children,
    });

    return result;
  });

  /**
   * V30 · POST /cross-settlements/:id/confirm
   *
   * Le créancier net confirme la réception des fonds. Tous les child
   * Settlements passent à CONFIRMED en cascade dans la même transaction
   * Prisma. Les caches person-balances des 2 parties sont invalidés.
   */
  app.post("/cross-settlements/:id/confirm", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await confirmCrossGroupSettlement(id, req.user.sub);
    return { ok: true };
  });

  /**
   * V30 · POST /cross-settlements/:id/cancel
   *
   * Annule un règlement encore non-confirmé (PROPOSED ou PAID).
   * Cascade vers les enfants → tous CANCELLED.
   */
  app.post("/cross-settlements/:id/cancel", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await cancelCrossGroupSettlement(id, req.user.sub);
    return { ok: true };
  });

  /**
   * V30 · GET /me/cross-settlements
   *
   * Liste les cross-settlements de l'utilisateur (ceux qu'il a initiés OU
   * dont il est le bénéficiaire). Trié par date desc, limité aux 50 derniers
   * pour éviter de paginer dans une simple page d'historique.
   */
  app.get("/me/cross-settlements", async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const px = prisma as any;
    // Z2-fix · Si Prisma client n'a pas été régénéré après V30, le modèle
    // crossGroupSettlement n'existe pas → on retourne [] au lieu de crasher
    // l'endpoint avec un 500 "Cannot read properties of undefined".
    // Cas typique : dev qui a fait `git pull` mais oublié `npm run db:generate`.
    if (!px.crossGroupSettlement) {
      req.log?.warn?.(
        "[cross-settlements] Prisma model missing — run `npm run db:generate` in apps/api",
      );
      return [];
    }
    const items = await px.crossGroupSettlement.findMany({
      where: {
        OR: [{ fromUserId: req.user.sub }, { toUserId: req.user.sub }],
      },
      orderBy: { proposedAt: "desc" },
      take: 50,
      include: {
        fromUser: { select: { id: true, displayName: true } },
        toUser: { select: { id: true, displayName: true } },
        children: {
          select: {
            id: true,
            groupId: true,
            amount: true,
            currency: true,
            status: true,
            group: { select: { name: true } },
          },
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.map((c: any) => ({
      id: c.id,
      fromUser: c.fromUser,
      toUser: c.toUser,
      totalAmount: c.totalAmount.toString(),
      currency: c.currency,
      status: c.status,
      proposedAt: c.proposedAt.toISOString(),
      confirmedByPayerAt: c.confirmedByPayerAt?.toISOString() ?? null,
      confirmedByPayeeAt: c.confirmedByPayeeAt?.toISOString() ?? null,
      memo: c.memo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: c.children.map((ch: any) => ({
        id: ch.id,
        groupId: ch.groupId,
        groupName: ch.group.name,
        amount: ch.amount.toString(),
        currency: ch.currency,
        status: ch.status,
      })),
    }));
  });
}
