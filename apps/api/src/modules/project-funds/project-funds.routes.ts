/**
 * V200 — Routes HTTP module Caisses Projet.
 *
 * Endpoints :
 *   GET    /project-funds/feature-gate         → check kill switch (ouvert)
 *   GET    /groups/:groupId/project-funds      → liste des caisses du groupe
 *   POST   /groups/:groupId/project-funds      → créer une caisse
 *   GET    /project-funds/:fundId              → détail caisse + balances
 *   POST   /project-funds/:fundId/contribute   → déclarer une cotisation
 *   POST   /project-funds/:fundId/contributions/:contributionId/validate
 *   POST   /project-funds/:fundId/contributions/:contributionId/reject
 *   POST   /project-funds/:fundId/expenses     → proposer une dépense
 *   POST   /project-funds/:fundId/expenses/:expenseId/vote
 *   POST   /project-funds/:fundId/expenses/:expenseId/execute
 *   POST   /project-funds/:fundId/close        → clôturer la caisse
 *   GET    /project-funds/:fundId/audit-log    → journal d'audit
 *
 * Toutes les routes (sauf /feature-gate) requièrent un user connecté ET
 * passent par `assertFeatureEnabled()` qui throw 404 si SiteConfig
 * .projectFundsEnabled === false → kill switch instantané.
 *
 * Pattern JWT V180 : `req.user.sub` (pas `id`).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assertFeatureEnabled,
  createFund,
  listFundsForGroup,
  getFundDetail,
  contributeToFund,
  validateContribution,
  rejectContribution,
  proposeExpense,
  voteOnExpense,
  executeExpense,
  closeFund,
  getFundEvents,
  updateFund,
  getFundByPublicCode,
  getFundContributionsStatus,
} from "./project-funds.service.js";
import { generateFundReceiptPdf } from "./project-funds.pdf.js";
// V204.C — Upload preuve via Cloudinary (ou inline data URL si Cloudinary
// pas configuré). Réutilise le module photo-storage existant pour la
// cohérence (mêmes garde-fous taille/MIME).
import { storePhoto } from "../../lib/photo-storage.js";

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const createFundSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  template: z
    .enum(["EVENT", "PROJECT", "SOLIDARITY", "ASSOCIATION", "GIFT"])
    .optional(),
  targetAmount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  deadline: z.string().datetime({ offset: true }).optional(),
  treasurerUserId: z.string().uuid().optional(),
  voteThreshold: z.number().positive().optional(),
  voteApprovalRatio: z.number().min(0.5).max(1).optional(),
  // V215.C1 — Fréquence des versements + nombre custom (pour CUSTOM)
  frequency: z
    .enum(["ONE_SHOT", "WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"])
    .optional(),
  numberOfInstallments: z.number().int().min(1).max(120).optional(),
  // V218.G — Mode de contribution + montant imposé
  contributionMode: z.enum(["FREE", "FIXED"]).optional(),
  contributionAmount: z.number().positive().optional(),
});

const contributeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  method: z
    .enum(["TRANSFER", "MOBILE_MONEY", "CASH", "CARD", "OTHER"])
    .optional(),
  note: z.string().max(500).optional(),
  // V203.C — Accepte URL externe (https://…) OU data URI base64 (preuve
  // photo uploadée). Limite 1 Mo pour absorber une photo ~500 Ko en base64
  // sans casser un payload JSON typique.
  proofUrl: z.string().max(1_000_000).optional(),
});

const rejectContribSchema = z.object({
  reason: z.string().max(500).optional(),
});

const proposeExpenseSchema = z.object({
  motive: z.string().min(2).max(240),
  amount: z.number().positive(),
  beneficiary: z.string().max(240).optional(),
  // V203.C — Idem : accepte URL externe ou data URI base64
  proofUrl: z.string().max(1_000_000).optional(),
});

const voteSchema = z.object({
  vote: z.boolean(),
  comment: z.string().max(500).optional(),
});

// V202.E — Schéma édition (tous champs optionnels)
const updateFundSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  targetAmount: z.number().positive().nullable().optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  treasurerUserId: z.string().uuid().nullable().optional(),
  voteThreshold: z.number().positive().nullable().optional(),
  voteApprovalRatio: z.number().min(0.5).max(1).optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function projectFundsRoutes(app: FastifyInstance) {
  // ----------------------------------------------------------------------
  // GET /project-funds/feature-gate
  // Endpoint public (sans auth) qui renvoie l'état du kill switch.
  // Permet au front de cacher l'onglet « Caisses » sans erreur réseau.
  // ----------------------------------------------------------------------
  app.get("/project-funds/feature-gate", async (_req, reply) => {
    try {
      await assertFeatureEnabled();
      return { enabled: true };
    } catch {
      return reply.code(200).send({ enabled: false });
    }
  });

  // ----------------------------------------------------------------------
  // GET /groups/:groupId/project-funds — liste caisses du groupe
  // ----------------------------------------------------------------------
  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/project-funds",
    { onRequest: [app.authenticate] },
    async (req) => {
      // V180 — JWT BMD encode userId dans `sub`, pas `id`.
      const userId = req.user.sub;
      return listFundsForGroup(req.params.groupId, userId);
    },
  );

  // ----------------------------------------------------------------------
  // POST /groups/:groupId/project-funds — créer une caisse
  // ----------------------------------------------------------------------
  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/project-funds",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const body = createFundSchema.parse(req.body);
      return createFund({ ...body, groupId: req.params.groupId }, userId);
    },
  );

  // ----------------------------------------------------------------------
  // GET /project-funds/:fundId — détail caisse
  // ----------------------------------------------------------------------
  app.get<{ Params: { fundId: string } }>(
    "/project-funds/:fundId",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      return getFundDetail(req.params.fundId, userId);
    },
  );

  // ----------------------------------------------------------------------
  // POST /project-funds/:fundId/contribute — déclarer une cotisation
  // ----------------------------------------------------------------------
  app.post<{ Params: { fundId: string } }>(
    "/project-funds/:fundId/contribute",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const body = contributeSchema.parse(req.body);
      return contributeToFund({ ...body, fundId: req.params.fundId }, userId);
    },
  );

  // ----------------------------------------------------------------------
  // POST /project-funds/:fundId/contributions/:contributionId/validate
  // ----------------------------------------------------------------------
  app.post<{ Params: { fundId: string; contributionId: string } }>(
    "/project-funds/:fundId/contributions/:contributionId/validate",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      return validateContribution(
        req.params.fundId,
        req.params.contributionId,
        userId,
      );
    },
  );

  // ----------------------------------------------------------------------
  // POST /project-funds/:fundId/contributions/:contributionId/reject
  // ----------------------------------------------------------------------
  app.post<{ Params: { fundId: string; contributionId: string } }>(
    "/project-funds/:fundId/contributions/:contributionId/reject",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const body = rejectContribSchema.parse(req.body ?? {});
      return rejectContribution(
        req.params.fundId,
        req.params.contributionId,
        body.reason,
        userId,
      );
    },
  );

  // ----------------------------------------------------------------------
  // POST /project-funds/:fundId/expenses — proposer une dépense
  // ----------------------------------------------------------------------
  app.post<{ Params: { fundId: string } }>(
    "/project-funds/:fundId/expenses",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const body = proposeExpenseSchema.parse(req.body);
      return proposeExpense({ ...body, fundId: req.params.fundId }, userId);
    },
  );

  // ----------------------------------------------------------------------
  // POST /project-funds/:fundId/expenses/:expenseId/vote
  // ----------------------------------------------------------------------
  app.post<{ Params: { fundId: string; expenseId: string } }>(
    "/project-funds/:fundId/expenses/:expenseId/vote",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const body = voteSchema.parse(req.body);
      return voteOnExpense(
        req.params.fundId,
        req.params.expenseId,
        body.vote,
        body.comment,
        userId,
      );
    },
  );

  // ----------------------------------------------------------------------
  // POST /project-funds/:fundId/expenses/:expenseId/execute
  // ----------------------------------------------------------------------
  app.post<{ Params: { fundId: string; expenseId: string } }>(
    "/project-funds/:fundId/expenses/:expenseId/execute",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      return executeExpense(req.params.fundId, req.params.expenseId, userId);
    },
  );

  // ----------------------------------------------------------------------
  // POST /project-funds/:fundId/close — clôturer la caisse
  // ----------------------------------------------------------------------
  app.post<{ Params: { fundId: string } }>(
    "/project-funds/:fundId/close",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      return closeFund(req.params.fundId, userId);
    },
  );

  // ----------------------------------------------------------------------
  // GET /project-funds/:fundId/audit-log — journal d'audit complet
  // ----------------------------------------------------------------------
  app.get<{ Params: { fundId: string } }>(
    "/project-funds/:fundId/audit-log",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      return getFundEvents(req.params.fundId, userId);
    },
  );

  // ----------------------------------------------------------------------
  // V202.E — PATCH /project-funds/:fundId — éditer une caisse
  // ----------------------------------------------------------------------
  app.patch<{ Params: { fundId: string } }>(
    "/project-funds/:fundId",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const body = updateFundSchema.parse(req.body);
      return updateFund(req.params.fundId, body, userId);
    },
  );

  // ----------------------------------------------------------------------
  // V202.F — GET /public/project-funds/:publicCode — accès public read-only
  // ----------------------------------------------------------------------
  app.get<{ Params: { publicCode: string } }>(
    "/public/project-funds/:publicCode",
    async (req) => {
      return getFundByPublicCode(req.params.publicCode);
    },
  );

  // ----------------------------------------------------------------------
  // V204.C — POST /project-funds/upload-proof — upload preuve image
  // Body : { dataUrl: "data:image/jpeg;base64,..." }
  // Renvoie : { url } — soit URL Cloudinary HTTPS, soit data URL inline
  // si Cloudinary pas configuré. Auth requise (user authentifié).
  // ----------------------------------------------------------------------
  app.post(
    "/project-funds/upload-proof",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const schema = z.object({
        dataUrl: z.string().min(20).max(1_000_000),
      });
      const body = schema.parse(req.body);
      const url = await storePhoto(body.dataUrl, `fund-proof-${userId}`);
      return { url };
    },
  );

  // ----------------------------------------------------------------------
  // V222.C — GET /groups/:groupId/funds/:fundId/contributions-status
  // Renvoie pour chaque membre + chaque période son état de cotisation
  // (versé / attendu / retard / à jour). Permet d'afficher la grille
  // « qui à jour vs en retard » dans la page détail caisse.
  // ----------------------------------------------------------------------
  app.get<{ Params: { groupId: string; fundId: string } }>(
    "/groups/:groupId/funds/:fundId/contributions-status",
    { onRequest: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      return getFundContributionsStatus(
        req.params.groupId,
        req.params.fundId,
        userId,
      );
    },
  );

  // ----------------------------------------------------------------------
  // V202.G — GET /project-funds/:fundId/pdf-receipt — récap PDF brandé
  // ----------------------------------------------------------------------
  app.get<{ Params: { fundId: string } }>(
    "/project-funds/:fundId/pdf-receipt",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const pdfBytes = await generateFundReceiptPdf(req.params.fundId, userId);
      reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="bmd-fund-${req.params.fundId.slice(0, 8)}.pdf"`,
        );
      return reply.send(Buffer.from(pdfBytes));
    },
  );
}
