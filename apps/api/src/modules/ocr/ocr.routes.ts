import type { FastifyInstance } from "fastify";
import { isSupportedMime, scanReceiptFile } from "./ocr.service.js";
import { Errors } from "../../lib/errors.js";

export async function ocrRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /receipts/scan
   * Body: multipart/form-data avec un champ "file"
   *
   * Formats acceptés :
   *   - Images : PNG, JPG, GIF, WebP, BMP, TIFF
   *   - PDF    : extraction de texte natif (très rapide pour reçus digitaux)
   *
   * Réponse:
   * {
   *   merchant: "Le Petit Mboa" | null,
   *   amount: "67.40" | null,
   *   currency: "EUR",
   *   date: "2026-05-04T12:00:00.000Z" | null,
   *   category: "Restaurant" | null,
   *   confidence: 0.85,        // 0 à 1
   *   rawText: "..."           // texte extrait (debug)
   * }
   */
  app.post("/receipts/scan", async (req) => {
    // @fastify/multipart attache req.file()
    const data = await (req as any).file();
    if (!data) {
      throw Errors.badRequest(
        "Aucun fichier reçu (utilise multipart/form-data avec un champ 'file')",
      );
    }

    const mime = (data.mimetype as string) ?? "";
    if (!isSupportedMime(mime)) {
      throw Errors.badRequest(
        `Type de fichier non supporté : ${mime}. Utilise PNG, JPG, GIF, WebP, BMP, TIFF ou PDF.`,
      );
    }

    const buffer = await data.toBuffer();
    return scanReceiptFile({ buffer, mimetype: mime });
  });
}
