/**
 * Routes Export — génération de fichiers (PDF / CSV / JSON) côté serveur.
 *
 *   GET /groups/:id/export/pdf   → PDF résumé du groupe (auth requise)
 *
 * Permissions : seul un membre du groupe peut exporter. La feature est
 * plan-gated (`exportPdfExcel`) → bloquée pour les FREE.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateGroupPdf } from "./exports.service.js";
import { generateGroupXlsx } from "./exports-xlsx.service.js";
import { generateTaxReceiptPdf } from "./tax-receipt.service.js";

export async function exportsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/groups/:id/export/pdf", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const buffer = await generateGroupPdf({
      groupId: id,
      actorUserId: req.user.sub,
    });
    reply.header("content-type", "application/pdf");
    reply.header(
      "content-disposition",
      `attachment; filename="bmd-group-${id}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    reply.header("cache-control", "private, max-age=0, no-cache");
    return reply.send(Buffer.from(buffer));
  });

  app.get("/groups/:id/export/xlsx", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const buffer = await generateGroupXlsx({
      groupId: id,
      actorUserId: req.user.sub,
    });
    reply.header(
      "content-type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    reply.header(
      "content-disposition",
      `attachment; filename="bmd-group-${id}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    reply.header("cache-control", "private, max-age=0, no-cache");
    return reply.send(buffer);
  });

  /**
   * GET /expenses/:id/tax-receipt
   * Reçu fiscal officiel (Article 200 CGI) pour une dépense de type don,
   * dans un groupe association (PARISH / CLUB) avec plan COMMUNITY.
   */
  app.get("/expenses/:id/tax-receipt", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const buffer = await generateTaxReceiptPdf({
      expenseId: id,
      actorUserId: req.user.sub,
    });
    reply.header("content-type", "application/pdf");
    reply.header(
      "content-disposition",
      `attachment; filename="recu-fiscal-${id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    reply.header("cache-control", "private, max-age=0, no-cache");
    return reply.send(Buffer.from(buffer));
  });
}
