/**
 * Routes WebAuthn / Passkeys (spec §7.5).
 *
 * 5 routes :
 *   POST /auth/passkey/register-options  (auth requise)
 *   POST /auth/passkey/register-finish   (auth requise)
 *   POST /auth/passkey/login-options     (publique)
 *   POST /auth/passkey/login-finish      (publique)
 *   GET  /me/passkeys                    (auth requise)
 *   PATCH /me/passkeys/:id               (auth requise) — rename
 *   DELETE /me/passkeys/:id              (auth requise) — delete
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors } from "../../lib/errors.js";
import { issueToken } from "./jwt.service.js";
import {
  deleteMyPasskey,
  finishLogin,
  finishRegister,
  generateLoginOptions,
  generateRegisterOptions,
  listMyPasskeys,
  renameMyPasskey,
} from "./passkey.service.js";

/**
 * Rate limit léger en mémoire pour les endpoints de generation d'options.
 * Limite par IP : 30 requests / minute (largement assez pour un usage légitime,
 * mais empêche un attaquant de générer des milliers de challenges).
 *
 * Pour un déploiement multi-instance, remplacer par Redis. Pour MVP
 * mono-instance, in-memory suffit (et c'est plus rapide).
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(req: FastifyRequest): void {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.ip ??
    "unknown";
  const key = `pk:${ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  b.count++;
  if (b.count > RATE_LIMIT_MAX) {
    throw Errors.rateLimited(
      "Trop de demandes passkey. Réessaie dans une minute.",
      { retryAfter: Math.ceil((b.resetAt - now) / 1000) },
    );
  }
}

// GC opportuniste : tous les ~5 min, drop les buckets expirés
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}, 5 * 60_000).unref();

export async function passkeyRoutes(app: FastifyInstance): Promise<void> {
  // ============================================================
  // REGISTRATION (auth requise — on ajoute un passkey à un compte existant)
  // ============================================================

  /**
   * POST /auth/passkey/register-options
   * Body: { deviceName?: string }
   * Réponse: { options: PublicKeyCredentialCreationOptionsJSON }
   */
  app.post(
    "/auth/passkey/register-options",
    { onRequest: [app.authenticate] },
    async (req) => {
      checkRateLimit(req); // anti-DoS sur la génération de challenge
      const body = z
        .object({ deviceName: z.string().min(1).max(80).optional() })
        .parse(req.body ?? {});
      const result = await generateRegisterOptions({
        userId: req.user.sub,
        deviceName: body.deviceName,
      });
      return result.options;
    },
  );

  /**
   * POST /auth/passkey/register-finish
   * Body: { response: RegistrationResponseJSON, deviceName?: string }
   */
  app.post(
    "/auth/passkey/register-finish",
    { onRequest: [app.authenticate] },
    async (req) => {
      const body = z
        .object({
          response: z.any(),
          deviceName: z.string().min(1).max(80).optional(),
        })
        .parse(req.body);
      const created = await finishRegister({
        userId: req.user.sub,
        response: body.response,
        deviceName: body.deviceName,
      });
      return { ok: true, passkey: created };
    },
  );

  // ============================================================
  // LOGIN (publique — l'utilisateur n'est pas encore authentifié)
  // ============================================================

  /**
   * POST /auth/passkey/login-options
   * Body: { contactValue?: string }
   *
   * Si `contactValue` est fourni, on résout l'userId et on retourne la liste
   * des credentialIds autorisés. Sinon, on retourne un challenge "discoverable"
   * qui marche avec les passkeys de type resident key (le browser propose au
   * user de choisir lui-même).
   */
  app.post(
    "/auth/passkey/login-options",
    { config: { skipAuth: true } as any },
    async (req) => {
      checkRateLimit(req); // anti-DoS / anti-énumération de comptes
      const body = z
        .object({
          contactValue: z.string().min(1).max(200).optional(),
        })
        .parse(req.body ?? {});
      const result = await generateLoginOptions({
        contactValue: body.contactValue,
      });
      // On ne renvoie PAS resolvedUserId pour ne pas leaker l'existence d'un compte
      return result.options;
    },
  );

  /**
   * POST /auth/passkey/login-finish
   * Body: { response: AuthenticationResponseJSON, device?: string }
   */
  app.post(
    "/auth/passkey/login-finish",
    { config: { skipAuth: true } as any },
    async (req) => {
      const body = z
        .object({
          response: z.any(),
          device: z.string().max(200).optional(),
        })
        .parse(req.body);

      const country =
        ((req.headers["cf-ipcountry"] as string | undefined) ?? "??")
          .slice(0, 2)
          .toUpperCase();

      const { userId, passkeyId } = await finishLogin({
        response: body.response,
      });

      const { token, expiresAt } = await issueToken(
        app,
        userId,
        body.device,
        country,
        // Pas de contactType/contactValue : le scoring SIM swap se fait
        // sur les flux OTP. Le passkey est intrinsèquement multi-facteur
        // (possession du device + biométrie).
      );

      return {
        token,
        expiresAt: expiresAt.toISOString(),
        userId,
        passkeyId,
      };
    },
  );

  // ============================================================
  // GESTION (auth requise) — list / rename / delete
  // ============================================================

  app.get(
    "/me/passkeys",
    { onRequest: [app.authenticate] },
    async (req) => {
      const list = await listMyPasskeys(req.user.sub);
      return { items: list };
    },
  );

  app.patch(
    "/me/passkeys/:id",
    { onRequest: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({ deviceName: z.string().min(1).max(80) })
        .parse(req.body);
      await renameMyPasskey({
        userId: req.user.sub,
        passkeyId: id,
        deviceName: body.deviceName,
      });
      return { ok: true };
    },
  );

  app.delete(
    "/me/passkeys/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteMyPasskey({ userId: req.user.sub, passkeyId: id });
      return reply.code(204).send();
    },
  );
}
