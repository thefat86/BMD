import type { FastifyInstance } from "fastify";
import { isSupportedMime, scanReceiptFile } from "./ocr.service.js";
import { Errors } from "../../lib/errors.js";
import {
  assertCanUseOcr,
  getOcrUsage,
  startPremiumTrial,
} from "../../lib/plan-limits.js";

export async function ocrRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /me/ocr-usage
   * Retourne l'état de consommation OCR du user courant — pour afficher
   * le compteur visible sur le dashboard et le formulaire de scan.
   */
  app.get("/me/ocr-usage", async (req) => {
    return getOcrUsage((req.user as any).sub);
  });

  /**
   * POST /me/start-trial
   * Sprint AB · Active un essai gratuit 14 jours PREMIUM.
   * One-shot : un user ne peut activer un trial qu'une seule fois (champ
   * trialUsedAt en BDD). Réservé aux users sur le plan FREE.
   *
   * Le trial se termine naturellement après 14 jours sans cron : à chaque
   * appel de getUserLimits(), on vérifie trialEndsAt > now et on revient
   * au plan de base sinon.
   */
  app.post("/me/start-trial", async (req) => {
    return startPremiumTrial((req.user as any).sub);
  });

  /**
   * POST /receipts/scan
   * Body: multipart/form-data avec un champ "file"
   * Query (optionnel): ?groupId=<uuid>  → si fourni, l'utilisateur peut
   *   continuer à scanner même après son quota perso si l'admin du groupe
   *   a un plan avec OCR illimité. Politique : les 5 premiers scans
   *   personnels du mois sont déduits du quota du user, ensuite c'est
   *   l'admin payeur du groupe qui couvre.
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
    // Spec AB · groupId optionnel pour permettre le fallback sur le plan
    // de l'admin du groupe quand le quota perso est épuisé.
    const groupId =
      (req.query as any)?.groupId ?? (req.headers["x-group-id"] as string | undefined);
    await assertCanUseOcr((req.user as any).sub, groupId);
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
