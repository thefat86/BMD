/**
 * SSO Apple Sign In · OAuth 2.0 + JWT ES256 (spec §7.2).
 *
 * Différences vs Google :
 *  - Apple ne fournit PAS de discovery JSON (URLs en dur)
 *  - Apple impose un client_secret JWT signé ES256 (au lieu d'un secret statique)
 *  - Apple ne renvoie le nom et l'email QU'À LA PREMIÈRE connexion
 *    → on les attache donc dès qu'on les voit
 *
 * Pré-requis côté Apple Developer :
 *  1. Identifiers → Services ID → activer Sign in with Apple
 *      → APPLE_CLIENT_ID (ex: app.bmd.web)
 *  2. Certificates → Keys → "+" → Sign in with Apple → télécharger le .p8
 *      → APPLE_KEY_ID (10 chars)
 *  3. Membership → APPLE_TEAM_ID (10 chars)
 *  4. Configurer une "Return URL" : https://bmd.app/auth/apple/callback
 *
 * Le flow client est `form_post` (Apple POST le code au callback) — on
 * gère donc le callback à la fois en GET (query) et POST (body).
 */
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createHmac,
  randomBytes,
  verify,
} from "node:crypto";
import { loadEnv } from "./env.js";
import { Errors } from "./errors.js";

const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";

const STATE_TTL_MS = 10 * 60 * 1000;

// ============================================================
// Encodages base64url
// ============================================================
function b64urlToBuffer(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from((s + pad).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function bufferToB64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ============================================================
// JWKS Apple (cache 24h)
// ============================================================
interface AppleJwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}
let jwksCache: { keys: AppleJwk[]; loadedAt: number } | null = null;
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

async function getJwks(): Promise<AppleJwk[]> {
  if (jwksCache && Date.now() - jwksCache.loadedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const r = await fetch(APPLE_KEYS_URL);
  if (!r.ok) throw Errors.internal("Apple JWKS indisponible");
  const body = (await r.json()) as { keys: AppleJwk[] };
  jwksCache = { keys: body.keys, loadedAt: Date.now() };
  return body.keys;
}

// ============================================================
// State CSRF (HMAC-signé)
// ============================================================
function signState(nonce: string, ts: number): string {
  const env = loadEnv();
  const payload = `${nonce}.${ts}`;
  const sig = createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function buildAppleState(): string {
  return signState(randomBytes(16).toString("base64url"), Date.now());
}
export function verifyAppleState(state: string): boolean {
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
// Génération du client_secret Apple (JWT ES256)
// ============================================================
//
// Apple veut un JWT signé ES256 valable max 6 mois, avec ces claims :
//   iss = TEAM_ID, iat, exp, aud = "https://appleid.apple.com", sub = CLIENT_ID
// La clé privée (.p8) est de la forme :
//   -----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----

function derEcdsaToJose(der: Buffer): Buffer {
  let p = 0;
  if (der[p++] !== 0x30) throw new Error("Bad DER");
  p++;
  if (der[p++] !== 0x02) throw new Error("Bad DER R");
  const rLen = der[p++]!;
  let r = der.subarray(p, p + rLen);
  p += rLen;
  if (der[p++] !== 0x02) throw new Error("Bad DER S");
  const sLen = der[p++]!;
  let s = der.subarray(p, p + sLen);
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);
  return Buffer.concat([
    Buffer.concat([Buffer.alloc(32 - r.length), r]),
    Buffer.concat([Buffer.alloc(32 - s.length), s]),
  ]);
}

function buildClientSecret(): string {
  const env = loadEnv();
  if (
    !env.APPLE_CLIENT_ID ||
    !env.APPLE_TEAM_ID ||
    !env.APPLE_KEY_ID ||
    !env.APPLE_PRIVATE_KEY
  ) {
    throw Errors.badRequest(
      "Le SSO Apple n'est pas configuré sur ce serveur 🛠️",
      {
        tip: "L'admin doit ajouter APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID et APPLE_PRIVATE_KEY (.p8) dans les variables d'environnement.",
      },
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = bufferToB64url(
    Buffer.from(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID })),
  );
  const payload = bufferToB64url(
    Buffer.from(
      JSON.stringify({
        iss: env.APPLE_TEAM_ID,
        iat: now,
        exp: now + 5 * 60, // 5 min — court par sécurité, on le régénère à chaque appel
        aud: APPLE_ISSUER,
        sub: env.APPLE_CLIENT_ID,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  // Le .p8 peut contenir des "\n" littéraux dans le .env → on convertit
  const pem = env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const der = signer.sign(createPrivateKey(pem));
  const sig = bufferToB64url(derEcdsaToJose(der));
  return `${signingInput}.${sig}`;
}

// ============================================================
// URL d'autorisation
// ============================================================
export function buildAppleAuthorizationUrl(state: string): string {
  const env = loadEnv();
  if (!env.APPLE_CLIENT_ID) {
    throw Errors.badRequest(
      "Le SSO Apple n'est pas configuré sur ce serveur 🛠️",
    );
  }
  const params = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID,
    redirect_uri: `${env.WEB_BASE_URL}/auth/apple/callback`,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
    state,
  });
  return `${APPLE_AUTH_URL}?${params.toString()}`;
}

// ============================================================
// Vérification id_token
// ============================================================
export interface AppleIdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
  exp: number;
  iat: number;
}

async function verifyAppleIdToken(idToken: string): Promise<AppleIdTokenClaims> {
  const env = loadEnv();
  const parts = idToken.split(".");
  if (parts.length !== 3) throw Errors.unauthorized("id_token Apple malformé");
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlToBuffer(headerB64!).toString("utf-8")) as {
    alg: string;
    kid: string;
  };
  const claims = JSON.parse(
    b64urlToBuffer(payloadB64!).toString("utf-8"),
  ) as AppleIdTokenClaims;

  const jwks = await getJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw Errors.unauthorized("Clé Apple introuvable pour ce token");

  const pubKey = createPublicKey({ key: jwk as any, format: "jwk" });
  const signedData = Buffer.from(`${headerB64}.${payloadB64}`);
  const sig = b64urlToBuffer(sigB64!);
  const valid = verify("RSA-SHA256", signedData, pubKey, sig);
  if (!valid) throw Errors.unauthorized("Signature Apple invalide");

  if (claims.iss !== APPLE_ISSUER) {
    throw Errors.unauthorized("Émetteur Apple inattendu");
  }
  if (claims.aud !== env.APPLE_CLIENT_ID) {
    throw Errors.unauthorized("Token Apple destiné à une autre application");
  }
  if (claims.exp * 1000 < Date.now()) {
    throw Errors.unauthorized("Token Apple expiré — réessaie");
  }
  // Apple renvoie email_verified en string ("true") ou booléen selon le canal
  const verified =
    claims.email_verified === true || claims.email_verified === "true";
  if (!verified && claims.email) {
    throw Errors.forbidden(
      "Ton email Apple n'est pas vérifié chez Apple 🙅",
      {
        tip: "Vérifie ton email côté Apple ID avant de te connecter à BMD avec.",
      },
    );
  }
  return claims;
}

// ============================================================
// Échange code → claims
// ============================================================
export async function exchangeAppleCodeForClaims(
  code: string,
): Promise<AppleIdTokenClaims> {
  const env = loadEnv();
  if (!env.APPLE_CLIENT_ID) {
    throw Errors.badRequest("Le SSO Apple n'est pas configuré sur ce serveur 🛠️");
  }
  const clientSecret = buildClientSecret();
  const r = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.APPLE_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: `${env.WEB_BASE_URL}/auth/apple/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!r.ok) {
    throw Errors.unauthorized(
      "Apple a refusé l'échange du code de connexion 🙅",
      {
        tip: "Le code a peut-être expiré. Reclique sur « Se connecter avec Apple » pour réessayer.",
      },
    );
  }
  const tokens = (await r.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw Errors.unauthorized("Apple n'a pas renvoyé d'id_token");
  }
  return verifyAppleIdToken(tokens.id_token);
}

/** Indique si le SSO Apple est configuré (pour masquer le bouton sinon). */
export function isAppleSsoConfigured(): boolean {
  const env = loadEnv();
  return Boolean(
    env.APPLE_CLIENT_ID &&
      env.APPLE_TEAM_ID &&
      env.APPLE_KEY_ID &&
      env.APPLE_PRIVATE_KEY,
  );
}
