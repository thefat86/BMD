/**
 * Routes invitations V97.
 *
 * Trois endpoints sont PUBLICS (pas d'auth, lookup par token) :
 *  - GET    /invitations/:token            → infos pour la page d'acceptation
 *  - POST   /invitations/:token/accept     → accepte (auth requise pour créer le member)
 *  - POST   /invitations/:token/decline    → refuse avec motif (auth optionnel)
 *
 * Les endpoints "admin du groupe" sont eux montés dans groups.routes.ts
 * (hérite du `addHook("onRequest", authenticate)`).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acceptInvitation,
  declineInvitation,
  DECLINE_REASON_MIN_LENGTH,
  getInvitationByToken,
} from "./invitations.service.js";

export async function invitationsPublicRoutes(
  app: FastifyInstance,
): Promise<void> {
  // === GET /invitations/:token === (public, pour la page /invite/[token])
  app.get("/invitations/:token", async (req) => {
    const { token } = z
      .object({ token: z.string().min(10).max(64) })
      .parse(req.params);
    return getInvitationByToken(token);
  });

  // === POST /invitations/:token/accept ===
  //
  // Nécessite que l'invité soit authentifié — sinon on retourne 401 et
  // le frontend redirige vers /login avec ?next=/invite/{token} pour qu'il
  // revienne ici une fois connecté.
  app.post("/invitations/:token/accept", async (req, reply) => {
    const { token } = z
      .object({ token: z.string().min(10).max(64) })
      .parse(req.params);

    // Auth manuelle (le hook global est désactivé sur ce plugin)
    try {
      await (req as any).jwtVerify();
    } catch {
      return reply.code(401).send({
        error: "unauthorized",
        message:
          "Tu dois être connecté·e pour accepter cette invitation 🔐",
        details: {
          tip: "Connecte-toi avec l'email/numéro qui a reçu le lien — l'invitation se valide automatiquement après ta connexion.",
        },
      });
    }
    return acceptInvitation({
      token,
      acceptingUserId: req.user.sub,
    });
  });

  // === POST /invitations/:token/decline ===
  //
  // Pas besoin d'être connecté pour refuser : on permet à n'importe qui en
  // possession du token de dire « non ». Le motif est obligatoire (15 chars).
  app.post("/invitations/:token/decline", async (req) => {
    const { token } = z
      .object({ token: z.string().min(10).max(64) })
      .parse(req.params);
    const body = z
      .object({
        reason: z
          .string()
          .min(
            DECLINE_REASON_MIN_LENGTH,
            `Motif trop court (${DECLINE_REASON_MIN_LENGTH} caractères min).`,
          )
          .max(500),
      })
      .parse(req.body);

    // Lie l'invité connecté si c'est le cas (best-effort, optionnel)
    let decliningUserId: string | undefined;
    try {
      await (req as any).jwtVerify();
      decliningUserId = req.user.sub;
    } catch {
      // pas connecté, OK
    }
    return declineInvitation({
      token,
      reason: body.reason,
      decliningUserId,
    });
  });
}
