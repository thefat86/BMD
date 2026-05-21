import type { FastifyInstance } from "fastify";
import { isSupportedMime, scanReceiptFile } from "./ocr.service.js";
import { Errors } from "../../lib/errors.js";
import {
  assertCanUseOcr,
  getOcrUsage,
  getUserIaTier,
  startPremiumTrial,
} from "../../lib/plan-limits.js";
import { findPotentialDuplicate } from "./receipt-dedupe.service.js";
import {
  consumeBoosterScan,
  getRemainingBoosterScans,
} from "../../lib/booster-service.js";
// V72 — Tracking en LIVE de la conso IA (un event par scan)
import { trackOcrScan } from "../../lib/usage-tracker.js";

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

    // V42 — Le frontend envoie aussi un champ `hash` (SHA-256 du fichier
    // optimisé côté client) qu'on utilise pour le check anti-doublon.
    // @fastify/multipart expose les champs texte via `fields`.
    const fields = (data as any).fields ?? {};
    const receiptHash: string | null =
      typeof fields.hash?.value === "string"
        ? fields.hash.value.trim()
        : typeof fields.hash === "string"
          ? fields.hash.trim()
          : null;

    const buffer = await data.toBuffer();

    // V46 · pipeline IA adaptatif selon le tier du plan du payeur.
    // Le tier vient du Plan.limits.iaPipelineTier. Si on est dans un groupe
    // dont l'admin a un meilleur tier (ex: utilisateur Free qui scanne pour
    // un groupe d'admin Pro), on utilise le tier de l'admin (cohérence avec
    // la logique de quota assertCanUseOcr qui retombe sur le plan admin).
    const userId = (req.user as any).sub;
    let iaTier = await getUserIaTier(userId);
    if (groupId) {
      try {
        const grp = await (req as any).server?.prisma?.group?.findUnique?.({
          where: { id: groupId },
          select: { createdById: true },
        });
        const adminId = grp?.createdById;
        if (adminId && adminId !== userId) {
          const adminTier = await getUserIaTier(adminId);
          // On prend toujours le MEILLEUR tier (admin payeur offre son IA)
          const order = { economy: 0, standard: 1, premium: 2 } as const;
          if (order[adminTier] > order[iaTier]) {
            iaTier = adminTier;
          }
        }
      } catch {
        // best-effort, on garde le tier user
      }
    }

    const result = await scanReceiptFile({ buffer, mimetype: mime, iaTier });

    // V78 — Tracking AWAITED (et non plus fire-and-forget) : on persiste
    // l'UsageEvent AVANT de relire le quota / consommer un booster, car
    // depuis V78 c'est UsageEvent qui sert de source de vérité au décompte.
    // Si le tracking rate, on log mais on laisse passer (recordUsage ne
    // throw jamais — best-effort).
    await trackOcrScan({
      userId,
      provider: (result.provider ?? "tesseract") as
        | "mindee"
        | "openai_vision"
        | "tesseract",
      iaTier,
      groupId: typeof groupId === "string" ? groupId : undefined,
    });

    // V47 · Si le scan a réussi ET que le quota plan est dépassé, on
    // consomme un scan sur le Pack Booster actif (FIFO). assertCanUseOcr
    // a déjà vérifié qu'au moins UN scan était disponible quelque part
    // (plan ou booster), donc ici on essaie d'imputer au booster si le
    // plan est épuisé. C'est best-effort : si la déduction Booster échoue
    // (table absente, race condition), on laisse passer — l'ExpenseAttachment
    // créé sera compté dans le total mensuel et la prochaine tentative
    // déclenchera correctement la limite.
    try {
      const usage = await getOcrUsage(userId);
      // Quota plan dépassé OU dans le tout dernier scan dispo → consommer booster
      if (usage.max !== -1 && usage.used >= usage.max) {
        await consumeBoosterScan(userId);
      }
    } catch {
      // best-effort
    }

    // V42 — Check anti-doublon (uniquement si on a un groupId, sinon on ne
    // sait pas dans quel scope chercher). Best-effort : si la DB est down,
    // findPotentialDuplicate retourne null et on continue.
    let potentialDuplicateOf = null;
    if (groupId) {
      potentialDuplicateOf = await findPotentialDuplicate({
        receiptHash,
        groupId,
        merchant: result.merchant,
        amount: result.amount,
        currency: result.currency,
        date: result.date,
      });
    }

    return {
      ...result,
      receiptHash: receiptHash ?? undefined,
      potentialDuplicateOf,
    };
  });
}
