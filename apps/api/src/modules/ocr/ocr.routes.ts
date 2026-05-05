import type { FastifyInstance } from "fastify";
import { scanReceiptImage } from "./ocr.service.js";
import { Errors } from "../../lib/errors.js";

export async function ocrRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /receipts/scan
   * Body: multipart/form-data avec un champ "file"
   *
   * Réponse:
   * {
   *   merchant: "Le Petit Mboa" | null,
   *   amount: "67.40" | null,
   *   currency: "EUR",
   *   date: "2026-05-04T12:00:00.000Z" | null,
   *   category: "Restaurant" | null,
   *   confidence: 0.85,        // 0 à 1
   *   rawText: "..."           // texte OCR brut (debug)
   * }
   */
  app.post("/receipts/scan", async (req) => {
    // @fastify/multipart attache req.file()
    const data = await (req as any).file();
    if (!data) {
      throw Errors.badRequest("Aucun fichier reçu (utilise multipart/form-data avec un champ 'file')");
    }

    // Valider le type MIME
    const mime = (data.mimetype as string) ?? "";
    if (!/^image\/(png|jpeg|jpg|gif|webp|bmp|tiff)$/i.test(mime)) {
      throw Errors.badRequest(
        `Type de fichier non supporté : ${mime}. Utilise PNG, JPG, GIF ou WebP.`,
      );
    }

    const buffer = await data.toBuffer();
    const parsed = await scanReceiptImage(buffer);

    return parsed;
  });
}
