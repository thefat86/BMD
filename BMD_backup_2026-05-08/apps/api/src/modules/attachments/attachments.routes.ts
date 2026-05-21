import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createReadStream } from "fs";
import {
  deleteAttachment,
  getAttachmentForDownload,
  listAttachments,
  uploadAttachment,
  MAX_FILE_SIZE,
} from "./attachments.service.js";

/**
 * Routes pour la gestion des pièces jointes aux dépenses.
 *  - POST /expenses/:id/attachments  (multipart upload)
 *  - GET  /expenses/:id/attachments  (liste les attachments)
 *  - GET  /attachments/:id/download  (télécharge un attachment)
 *  - DELETE /attachments/:id         (supprime un attachment)
 *
 * Tous les membres du groupe peuvent VOIR/TÉLÉCHARGER.
 * Seul le payeur ou un admin peut UPLOAD.
 * L'uploader, le payeur ou un admin peut SUPPRIMER.
 */
export async function attachmentsRoutes(app: FastifyInstance): Promise<void> {
  // POST /expenses/:id/attachments — upload multipart
  app.post(
    "/expenses/:id/attachments",
    {
      preHandler: [app.authenticate],
      bodyLimit: MAX_FILE_SIZE + 1024, // +1k pour les en-têtes multipart
    },
    async (req, reply) => {
      const { id: expenseId } = z
        .object({ id: z.string().uuid() })
        .parse(req.params);

      // @fastify/multipart est déjà register dans server.ts
      const part = await (req as any).file();
      if (!part) {
        return reply
          .code(400)
          .send({ error: "no_file", message: "Aucun fichier reçu" });
      }
      const buffer = await part.toBuffer();
      // Sprint AC-2 · le client peut préciser `kind` (RECEIPT / AUDIO_PROOF / …)
      // via un champ form-data. Si absent, le service auto-détecte sur le mime.
      const kindRaw =
        typeof part.fields?.kind?.value === "string"
          ? part.fields.kind.value.toUpperCase()
          : null;
      const kind =
        kindRaw === "RECEIPT" ||
        kindRaw === "PHOTO" ||
        kindRaw === "AUDIO_PROOF" ||
        kindRaw === "DOCUMENT"
          ? (kindRaw as any)
          : undefined;
      const result = await uploadAttachment({
        expenseId,
        actorUserId: (req.user as any).sub,
        fileName: part.filename ?? "fichier",
        mimeType: part.mimetype ?? "application/octet-stream",
        buffer,
        kind,
      });
      return reply.code(201).send(result);
    },
  );

  // GET /expenses/:id/attachments — liste
  app.get(
    "/expenses/:id/attachments",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id: expenseId } = z
        .object({ id: z.string().uuid() })
        .parse(req.params);
      return listAttachments({
        expenseId,
        actorUserId: (req.user as any).sub,
      });
    },
  );

  // GET /attachments/:id/download — télécharge
  app.get(
    "/attachments/:id/download",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { fullPath, fileName, mimeType } = await getAttachmentForDownload({
        attachmentId: id,
        actorUserId: (req.user as any).sub,
      });
      // Encode le filename pour gérer les accents (RFC 5987)
      const safeFileName = encodeURIComponent(fileName);
      reply
        .header("content-type", mimeType)
        .header(
          "content-disposition",
          `inline; filename*=UTF-8''${safeFileName}`,
        );
      return reply.send(createReadStream(fullPath));
    },
  );

  // DELETE /attachments/:id
  app.delete(
    "/attachments/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteAttachment({
        attachmentId: id,
        actorUserId: (req.user as any).sub,
      });
      return reply.code(204).send();
    },
  );
}
