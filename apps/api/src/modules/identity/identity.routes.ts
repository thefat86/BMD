/**
 * V234 — Routes identité officielle.
 *
 *   GET    /identity/me        → retourne mon IdentityDocument (ou null)
 *   POST   /identity/scan      → upload + scan IA → IdentityDocument PENDING
 *   POST   /identity/verify    → l'user corrige/valide → status VERIFIED
 *
 * Auth obligatoire pour les trois routes. Un user ne peut scanner/valider
 * QUE son propre IdentityDocument (relation unique par userId).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getMyIdentity,
  scanIdentityDocument,
  verifyIdentityDocument,
} from "./identity.service.js";
import { recordUsage } from "../../lib/usage-tracker.js";

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  // ─── GET /identity/me ────────────────────────────────────────────────
  app.get("/identity/me", async (req) => {
    const { identity } = await getMyIdentity(req.user.sub);
    return { identity };
  });

  // ─── POST /identity/scan ─────────────────────────────────────────────
  app.post("/identity/scan", async (req, reply) => {
    const body = z
      .object({
        type: z.enum(["ID_CARD", "PASSPORT", "RESIDENCE", "DRIVER", "OTHER"]),
        fileBase64: z.string().min(100).max(20_000_000),
        mimeType: z.enum([
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          "application/pdf",
        ]),
      })
      .parse(req.body);

    const userId = req.user.sub;
    let hadError = false;
    try {
      const result = await scanIdentityDocument({
        userId,
        type: body.type,
        fileBase64: body.fileBase64,
        mimeType: body.mimeType,
      });
      return reply.code(201).send(result);
    } catch (e) {
      hadError = true;
      throw e;
    } finally {
      // Tracking conso IA (similaire OCR RIB V137)
      void recordUsage({
        userId,
        kind: "OCR_IDENTITY" as any,
        provider: "openai_vision",
        model: "gpt-4o-mini",
        units: 1,
        // Coût estimé : ~$0.001 par image high-detail
        costCents: 0.1,
        metadata: { feature: "identity_scan", docType: body.type },
        hadError,
      });
    }
  });

  // ─── POST /identity/verify ───────────────────────────────────────────
  app.post("/identity/verify", async (req) => {
    const body = z
      .object({
        edits: z
          .object({
            firstName: z.string().min(1).max(120).nullable().optional(),
            lastName: z.string().min(1).max(120).nullable().optional(),
            birthDate: z.string().nullable().optional(),
            birthPlace: z.string().max(160).nullable().optional(),
            documentNumber: z.string().max(80).nullable().optional(),
            issueDate: z.string().nullable().optional(),
            expiryDate: z.string().nullable().optional(),
            issuingCountry: z.string().length(2).nullable().optional(),
          })
          .optional(),
      })
      .parse(req.body ?? {});

    const result = await verifyIdentityDocument({
      userId: req.user.sub,
      edits: body.edits,
    });
    return result;
  });
}
