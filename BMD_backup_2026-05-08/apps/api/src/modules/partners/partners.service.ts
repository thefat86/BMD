/**
 * Partners service · gestion des tokens API publics + webhooks (spec §6.10).
 *
 * Sécurité :
 *  - Token claire jamais stockée — uniquement SHA-256 hash
 *  - Préfixe public 8 caractères pour identifier sans exposer
 *  - Scopes JSON : autorisation fine par ressource
 *  - Webhooks signés HMAC SHA-256 pour authentification du payload
 *  - Désactivation auto après 5 échecs consécutifs (anti spam URL morte)
 *
 * Format token claire : "bmd_pk_<random32>" — bmd_pk = identifiant clair,
 * permet à un dev qui retrouve un token dans son code de comprendre
 * immédiatement à quoi il sert (vs un token "x4f9a2b1..." anonyme).
 */
import { createHash, randomBytes, createHmac } from "node:crypto";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const TOKEN_PREFIX = "bmd_pk_";

/**
 * Liste des scopes possibles. Le partenaire doit explicitement déclarer
 * lesquels il consomme — défaut = aucun (= refus systématique).
 */
export const ALLOWED_SCOPES = [
  // Lecture seule
  "groups:read",
  "expenses:read",
  "tontines:read",
  "settlements:read",
  "stats:read",
  // Écriture (à n'accorder qu'à des partenaires de confiance)
  "expenses:write",
  "settlements:write",
  // Admin (réservé aux partenaires qui ont signé un contrat type ERP/compta)
  "users:read",
] as const;

export type Scope = (typeof ALLOWED_SCOPES)[number];

export interface CreateTokenInput {
  name: string;
  scopes: string[];
  createdById: string;
  expiresAt?: Date | null;
}

export async function createApiToken(input: CreateTokenInput): Promise<{
  /** Valeur claire — à montrer UNE SEULE FOIS au partenaire. Non récupérable. */
  token: string;
  id: string;
  prefix: string;
  scopes: string[];
}> {
  // Validation des scopes
  const invalid = input.scopes.filter(
    (s) => !(ALLOWED_SCOPES as readonly string[]).includes(s),
  );
  if (invalid.length > 0) {
    throw Errors.badRequest(`Scopes invalides : ${invalid.join(", ")}`);
  }
  if (input.scopes.length === 0) {
    throw Errors.badRequest(
      "Un token doit avoir au moins 1 scope (sinon il ne peut rien faire).",
    );
  }

  // Génère 32 bytes random → URL-safe base64
  const randomPart = randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}${randomPart}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenPrefix = `${TOKEN_PREFIX}${randomPart.slice(0, 6)}`;

  const created = await prisma.partnerApiToken.create({
    data: {
      name: input.name.slice(0, 80),
      tokenHash,
      tokenPrefix,
      scopes: input.scopes as any,
      createdById: input.createdById,
      expiresAt: input.expiresAt ?? null,
    },
  });

  return {
    token,
    id: created.id,
    prefix: created.tokenPrefix,
    scopes: input.scopes,
  };
}

/**
 * Vérifie un Bearer token et retourne les infos associées.
 * Lève une erreur si invalide / expiré / révoqué.
 * Met à jour `lastUsedAt` + `lastUsedIp` (best-effort, async pour ne pas bloquer).
 */
export async function verifyApiToken(
  token: string,
  requestIp?: string,
): Promise<{
  id: string;
  name: string;
  scopes: string[];
  createdById: string;
}> {
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw Errors.unauthorized("Format de token invalide");
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const stored = await prisma.partnerApiToken.findUnique({
    where: { tokenHash },
  });
  if (!stored) {
    throw Errors.unauthorized("Token inconnu");
  }
  if (stored.revokedAt) {
    throw Errors.unauthorized("Token révoqué");
  }
  if (stored.expiresAt && stored.expiresAt < new Date()) {
    throw Errors.unauthorized("Token expiré");
  }

  // Update lastUsedAt en fire-and-forget
  void prisma.partnerApiToken
    .update({
      where: { id: stored.id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: requestIp?.slice(0, 64) ?? null,
      },
    })
    .catch(() => {
      /* ignore */
    });

  return {
    id: stored.id,
    name: stored.name,
    scopes: Array.isArray(stored.scopes) ? (stored.scopes as string[]) : [],
    createdById: stored.createdById,
  };
}

/**
 * Vérifie qu'un token autorise un scope donné. Throw 403 sinon.
 */
export function assertScope(
  scopes: string[],
  required: Scope,
): void {
  if (!scopes.includes(required)) {
    throw Errors.forbidden(
      `Ce token n'a pas le scope "${required}". Scopes accordés : ${scopes.join(", ") || "(aucun)"}`,
    );
  }
}

export async function listApiTokens(opts: { createdById?: string }) {
  const where = opts.createdById ? { createdById: opts.createdById } : {};
  return prisma.partnerApiToken.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      lastUsedIp: true,
      revokedAt: true,
    },
  });
}

export async function revokeApiToken(input: {
  id: string;
  actorUserId: string;
}): Promise<void> {
  // On vérifie que l'actor est bien le créateur OU un super-admin
  const tok = await prisma.partnerApiToken.findUnique({
    where: { id: input.id },
  });
  if (!tok) throw Errors.notFound("Token introuvable");
  if (tok.createdById !== input.actorUserId) {
    const u = await prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { isSuperAdmin: true },
    });
    if (!u?.isSuperAdmin) {
      throw Errors.forbidden(
        "Seul le créateur du token ou un super-admin peut le révoquer.",
      );
    }
  }
  await prisma.partnerApiToken.update({
    where: { id: input.id },
    data: { revokedAt: new Date() },
  });
}

// ============================================================
// WEBHOOKS — événements sortants signés HMAC
// ============================================================

export interface CreateWebhookInput {
  tokenId: string;
  url: string;
  events: string[];
}

export async function createWebhook(input: CreateWebhookInput) {
  // Validation URL : https requis en prod, http accepté en dev local
  try {
    const u = new URL(input.url);
    if (!["http:", "https:"].includes(u.protocol)) {
      throw new Error("Protocol must be http or https");
    }
  } catch {
    throw Errors.badRequest("URL de webhook invalide");
  }
  // Génère un secret HMAC partagé avec le partenaire
  const secret = randomBytes(32).toString("base64url");
  return prisma.partnerWebhook.create({
    data: {
      tokenId: input.tokenId,
      url: input.url,
      secret,
      events: input.events as any,
    },
  });
}

/**
 * Diffuse un event à tous les webhooks abonnés.
 * Signe le payload avec HMAC SHA-256 — le partenaire vérifie via son secret.
 *
 * Header émis : `X-BMD-Signature: sha256=<hex>`
 *               `X-BMD-Event: <event.kind>`
 *               `X-BMD-Delivery: <uuid>` (idempotency)
 *
 * Best-effort : si la livraison échoue, on incrémente failureCount.
 * Si failureCount >= 5, on désactive le webhook (disabled=true) pour éviter
 * de spam une URL morte. L'admin peut le réactiver manuellement.
 */
export async function dispatchWebhookEvent(input: {
  kind: string;
  data: Record<string, unknown>;
  /** Filtres optionnels : seuls les webhooks abonnés à ce kind reçoivent. */
}): Promise<void> {
  const { kind, data } = input;
  const subs = await prisma.partnerWebhook.findMany({
    where: {
      disabled: false,
      token: { revokedAt: null },
    },
  });
  // Filtre côté JS (events stocké en JSON, pas indexable via Prisma)
  const matching = subs.filter((s) => {
    const events = Array.isArray(s.events) ? (s.events as string[]) : [];
    return events.includes(kind) || events.includes("*");
  });

  for (const wh of matching) {
    void deliverOne(wh.id, wh.url, wh.secret, kind, data).catch(() => {
      /* ignore */
    });
  }
}

async function deliverOne(
  webhookId: string,
  url: string,
  secret: string,
  kind: string,
  data: Record<string, unknown>,
): Promise<void> {
  const deliveryId = randomBytes(8).toString("hex");
  const payload = JSON.stringify({
    event: kind,
    deliveryId,
    sentAt: new Date().toISOString(),
    data,
  });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  let status = 0;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BMD-Event": kind,
        "X-BMD-Delivery": deliveryId,
        "X-BMD-Signature": `sha256=${signature}`,
        "User-Agent": "BMD-Webhook/1.0",
      },
      body: payload,
      // 5s timeout (les partenaires doivent répondre vite)
      signal: AbortSignal.timeout(5000),
    });
    status = resp.status;
  } catch {
    status = 0; // network error / timeout
  }

  const ok = status >= 200 && status < 300;
  await prisma.partnerWebhook.update({
    where: { id: webhookId },
    data: {
      lastDeliveryAt: new Date(),
      lastStatus: status,
      failureCount: ok ? 0 : { increment: 1 },
      // Auto-désactivation après 5 échecs consécutifs
      ...(ok ? {} : await maybeDisable(webhookId)),
    },
  });
}

async function maybeDisable(
  webhookId: string,
): Promise<{ disabled?: boolean }> {
  const current = await prisma.partnerWebhook.findUnique({
    where: { id: webhookId },
    select: { failureCount: true },
  });
  if (current && current.failureCount + 1 >= 5) {
    return { disabled: true };
  }
  return {};
}
