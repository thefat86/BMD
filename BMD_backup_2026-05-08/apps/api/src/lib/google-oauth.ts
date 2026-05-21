/**
 * SSO Google · OAuth 2.0 Web flow (spec §7.2).
 *
 * Flow :
 *  1. Front clique "Se connecter avec Google" → POST /auth/google/start
 *  2. Backend retourne une URL d'autorisation Google + un `state` (CSRF)
 *  3. Front redirige vers Google → user autorise
 *  4. Google redirige vers /auth/google/callback?code=...&state=...
 *  5. Backend échange le code contre un id_token + access_token
 *  6. Backend vérifie l'id_token (signature + audience), extrait email + nom
 *  7. Si l'email existe → connecte ; sinon → crée le user
 *  8. Backend retourne un JWT BMD au front
 *
 * Sécurité :
 *  - state opaque signé HMAC pour éviter le CSRF
 *  - id_token vérifié via les clés JWK publiques de Google
 *  - L'email DOIT être verified par Google pour qu'on accepte la connexion
 */

import { createHmac, createPublicKey, verify, randomBytes } from "node:crypto";
import { loadEnv } from "./env.js";
import { Errors } from "./errors.js";

const GOOGLE_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min pour finaliser le flow OAuth

// ============================================================
// Discovery (cache 24h)
// ============================================================
interface GoogleDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

let discoveryCache: { data: GoogleDiscovery; loadedAt: number } | null = null;
const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;

async function getDiscovery(): Promise<GoogleDiscovery> {
  if (discoveryCache && Date.now() - discoveryCache.loadedAt < DISCOVERY_TTL_MS) {
    return discoveryCache.data;
  }
  const r = await fetch(GOOGLE_DISCOVERY_URL);
  if (!r.ok) throw Errors.internal("Google discovery indisponible");
  const data = (await r.json()) as GoogleDiscovery;
  discoveryCache = { data, loadedAt: Date.now() };
  return data;
}

// ============================================================
// JWKs (cache 24h) — pour vérifier les signatures id_token
// ============================================================
interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

let jwksCache: { keys: Jwk[]; loadedAt: number } | null = null;

async function getJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.loadedAt < DISCOVERY_TTL_MS) {
    return jwksCache.keys;
  }
  const { jwks_uri } = await getDiscovery();
  const r = await fetch(jwks_uri);
  if (!r.ok) throw Errors.internal("Google JWKS indisponible");
  const body = (await r.json()) as { keys: Jwk[] };
  jwksCache = { keys: body.keys, loadedAt: Date.now() };
  return body.keys;
}

// ============================================================
// State (CSRF) — signé HMAC avec JWT_SECRET, contient un timestamp
// ============================================================
function signState(nonce: string, ts: number): string {
  const env = loadEnv();
  const payload = `${nonce}.${ts}`;
  const sig = createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function buildState(): string {
  const nonce = randomBytes(16).toString("base64url");
  return signState(nonce, Date.now());
}

export function verifyState(state: string): boolean {
  const env = loadEnv();
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, ts, sig] = parts;
  const expected = createHmac("sha256", env.JWT_SECRET)
    .update(`${nonce}.${ts}`)
    .digest("base64url");
  if (sig !== expected) return false;
  const tsNum = parseInt(ts!, 10);
  if (!Number.isFinite(tsNum)) return false;
  if (Date.now() - tsNum > STATE_TTL_MS) return false;
  return true;
}

// ============================================================
// Vérification id_token (signature RS256 + claims)
// ============================================================
export interface GoogleIdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  exp: number;
  iat: number;
}

function base64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from((s + pad).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function verifyIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
  const env = loadEnv();
  const parts = idToken.split(".");
  if (parts.length !== 3) throw Errors.unauthorized("id_token Google malformé");

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64urlDecode(headerB64!).toString("utf-8")) as {
    alg: string;
    kid: string;
  };
  const claims = JSON.parse(
    base64urlDecode(payloadB64!).toString("utf-8"),
  ) as GoogleIdTokenClaims;

  // 1. Trouver la clé publique matching le kid
  const jwks = await getJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw Errors.unauthorized("Clé Google introuvable pour ce token");

  // 2. Vérifier la signature
  const pubKey = createPublicKey({
    key: jwk as any,
    format: "jwk",
  });
  const signedData = Buffer.from(`${headerB64}.${payloadB64}`);
  const sig = base64urlDecode(sigB64!);
  const valid = verify("RSA-SHA256", signedData, pubKey, sig);
  if (!valid) throw Errors.unauthorized("Signature Google invalide");

  // 3. Vérifier les claims
  const { issuer } = await getDiscovery();
  if (claims.iss !== issuer && claims.iss !== "accounts.google.com") {
    throw Errors.unauthorized("Émetteur Google inattendu");
  }
  if (claims.aud !== env.GOOGLE_CLIENT_ID) {
    throw Errors.unauthorized("Token Google destiné à une autre application");
  }
  if (claims.exp * 1000 < Date.now()) {
    throw Errors.unauthorized("Token Google expiré — réessaie");
  }
  if (!claims.email_verified) {
    throw Errors.forbidden(
      "Ton adresse Google n'est pas vérifiée chez Google 🙅",
      {
        tip: "Vérifie ton email côté Google avant de te connecter à BMD avec.",
      },
    );
  }
  return claims;
}

// ============================================================
// Construction de l'URL d'autorisation
// ============================================================
export async function buildAuthorizationUrl(state: string): Promise<string> {
  const env = loadEnv();
  if (!env.GOOGLE_CLIENT_ID) {
    throw Errors.badRequest(
      "Le SSO Google n'est pas configuré sur ce serveur 🛠️",
      {
        tip: "L'admin doit ajouter GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans les variables d'environnement.",
      },
    );
  }
  const { authorization_endpoint } = await getDiscovery();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.WEB_BASE_URL}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${authorization_endpoint}?${params.toString()}`;
}

// ============================================================
// Échange code → id_token + claims vérifiés
// ============================================================
export async function exchangeCodeForClaims(
  code: string,
): Promise<GoogleIdTokenClaims> {
  const env = loadEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw Errors.badRequest("Le SSO Google n'est pas configuré sur ce serveur 🛠️");
  }
  const { token_endpoint } = await getDiscovery();
  const r = await fetch(token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.WEB_BASE_URL}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw Errors.unauthorized(
      "Google a refusé l'échange du code de connexion 🙅",
      {
        tip:
          "Le code a peut-être expiré (durée de vie courte). Reclique sur le bouton « Se connecter avec Google » pour réessayer.",
        // pas de leak du body Google côté client
      },
    );
  }
  const tokens = (await r.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw Errors.unauthorized("Google n'a pas renvoyé d'id_token");
  }
  return verifyIdToken(tokens.id_token);
}

/** Indique si le SSO Google est configuré (pour masquer le bouton sinon). */
export function isGoogleSsoConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
