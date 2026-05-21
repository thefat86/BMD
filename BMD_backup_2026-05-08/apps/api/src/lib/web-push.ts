/**
 * Implémentation Web Push (RFC 8030 + RFC 8291) sans dépendance npm.
 *
 * Utilise uniquement node:crypto (P-256, HKDF, AES-128-GCM, ECDH).
 * Compatible avec :
 *  - Mozilla Push Service (Firefox)
 *  - Google FCM Web Push (Chrome, Edge)
 *  - Apple Push (Safari iOS 16.4+)
 *
 * Si VAPID_PUBLIC/PRIVATE_KEY ne sont pas configurées, sendPush() retourne
 * `{ ok: false }` silencieusement — pour ne pas casser l'app en dev.
 *
 * Chaque payload est chiffré pour le subscriber spécifique (clé p256dh + auth secret).
 *
 * Limitation : pas de retry automatique. Si un endpoint répond 404/410, on
 * supprime la subscription (= désinscrite côté navigateur).
 */
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  createSign,
  randomBytes,
  type ECDH,
} from "node:crypto";
import { loadEnv } from "./env.js";
import { prisma } from "./db.js";

// ============================================================
// Encodages base64url ↔ Buffer
// ============================================================
function b64urlToBuffer(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from((s + pad).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function bufferToB64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ============================================================
// HKDF — RFC 5869 (utilisé par Web Push pour dériver les clés)
// ============================================================
function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
  return createHmac("sha256", salt).update(ikm).digest();
}
function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  const out: Buffer[] = [];
  let prev = Buffer.alloc(0);
  let i = 1;
  while (Buffer.concat(out).length < length) {
    const data = Buffer.concat([prev, info, Buffer.from([i])]);
    prev = createHmac("sha256", prk).update(data).digest();
    out.push(prev);
    i += 1;
  }
  return Buffer.concat(out).subarray(0, length);
}

// ============================================================
// VAPID JWT (RFC 8292)
// ============================================================
/** Convertit la clé privée VAPID raw (base64url) en clé PKCS8 PEM utilisable pour signer. */
function vapidPrivateKeyToPem(privateKeyB64: string): string {
  const raw = b64urlToBuffer(privateKeyB64);
  if (raw.length !== 32) throw new Error("VAPID_PRIVATE_KEY doit être 32 bytes raw P-256");
  // ASN.1 DER pour clé EC P-256 PKCS8 (préambule statique + clé brute)
  const prefix = Buffer.from([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  // Pour notre cas on encode juste la clé brute en PKCS8 ; createSign acceptera un object
  // crypto via createPrivateKey.
  const der = Buffer.concat([prefix, raw]);
  const b64 = der.toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

/** Convertit signature DER ECDSA → format raw R||S 64 bytes attendu par les JWT ES256. */
function derToJoseSignature(der: Buffer): Buffer {
  // Format DER : 30 LEN 02 RLEN R 02 SLEN S
  let p = 0;
  if (der[p++] !== 0x30) throw new Error("Bad DER signature");
  p++; // skip total length
  if (der[p++] !== 0x02) throw new Error("Bad DER R");
  const rLen = der[p++]!;
  let r = der.subarray(p, p + rLen);
  p += rLen;
  if (der[p++] !== 0x02) throw new Error("Bad DER S");
  const sLen = der[p++]!;
  let s = der.subarray(p, p + sLen);
  // Strip leading zeros / pad to 32 bytes
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);
  const rPad = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  const sPad = Buffer.concat([Buffer.alloc(32 - s.length), s]);
  return Buffer.concat([rPad, sPad]);
}

interface VapidConfig {
  publicKey: string; // base64url raw P-256 65 bytes (uncompressed)
  privateKeyPem: string;
  subject: string;
}

let cachedVapid: VapidConfig | null = null;
function getVapidConfig(): VapidConfig | null {
  if (cachedVapid) return cachedVapid;
  const env = loadEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  cachedVapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKeyPem: vapidPrivateKeyToPem(env.VAPID_PRIVATE_KEY),
    subject: env.VAPID_SUBJECT,
  };
  return cachedVapid;
}

/** Construit l'en-tête Authorization pour un endpoint donné. */
function buildVapidAuthHeader(endpoint: string, vapid: VapidConfig): string {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12h max
  const header = bufferToB64url(
    Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const payload = bufferToB64url(
    Buffer.from(JSON.stringify({ aud, exp, sub: vapid.subject })),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const der = signer.sign(createPrivateKey(vapid.privateKeyPem));
  const sig = bufferToB64url(derToJoseSignature(der));
  const jwt = `${signingInput}.${sig}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

// ============================================================
// Chiffrement aes128gcm (RFC 8188 + RFC 8291)
// ============================================================
/**
 * Chiffre un payload pour un subscriber donné (sa clé publique p256dh + auth secret).
 * Retourne le body binaire à envoyer au push provider, et les en-têtes associés.
 */
function encryptPayload(
  payload: Buffer,
  subscriberPublicKey: Buffer,
  authSecret: Buffer,
): { body: Buffer; headers: Record<string, string> } {
  // 1. ECDH ephemeral
  const ecdh: ECDH = createECDH("prime256v1");
  ecdh.generateKeys();
  const ephemeralPubKey = ecdh.getPublicKey(); // 65 bytes uncompressed (0x04 + X + Y)

  // 2. Shared secret
  const sharedSecret = ecdh.computeSecret(subscriberPublicKey);

  // 3. PRK (HKDF-Extract)
  const authInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    subscriberPublicKey,
    ephemeralPubKey,
  ]);
  const prkKey = hkdfExpand(hkdfExtract(authSecret, sharedSecret), authInfo, 32);

  // 4. Salt + content encryption key + nonce
  const salt = randomBytes(16);
  const cekInfo = Buffer.from("Content-Encoding: aes128gcm\0");
  const cek = hkdfExpand(hkdfExtract(salt, prkKey), cekInfo, 16);
  const nonceInfo = Buffer.from("Content-Encoding: nonce\0");
  const nonce = hkdfExpand(hkdfExtract(salt, prkKey), nonceInfo, 12);

  // 5. Padding (aes128gcm record format) : payload + 0x02 (delimiter end-of-records)
  const plaintext = Buffer.concat([payload, Buffer.from([0x02])]);

  // 6. AES-128-GCM
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 7. En-tête binaire aes128gcm : salt(16) + rs(4) + idlen(1) + idkey(65)
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const idLen = Buffer.from([ephemeralPubKey.length]);
  const header = Buffer.concat([salt, recordSize, idLen, ephemeralPubKey]);

  const body = Buffer.concat([header, encrypted, tag]);
  return {
    body,
    headers: {
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      "content-length": String(body.length),
      ttl: "86400", // 24h
    },
  };
}

// ============================================================
// API publique : envoi à un user
// ============================================================
export interface PushPayload {
  title: string;
  body: string;
  /** URL relative à ouvrir au clic (ex: "/dashboard/groups/xyz") */
  url?: string;
  /** Tag pour grouper / remplacer les notifs (ex: "expense:abc") */
  tag?: string;
  /** Icône à afficher (path relatif à l'origin) */
  icon?: string;
}

interface SendResult {
  ok: boolean;
  delivered: number;
  pruned: number;
  errors: number;
}

/**
 * Envoie une notification push à toutes les subscriptions d'un user.
 * - Supprime automatiquement les subscriptions retournées en 404/410.
 * - Renvoie { ok:false } silencieusement si VAPID non configuré.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<SendResult> {
  const vapid = getVapidConfig();
  if (!vapid) return { ok: false, delivered: 0, pruned: 0, errors: 0 };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { ok: false, delivered: 0, pruned: 0, errors: 0 };

  const payloadBuf = Buffer.from(JSON.stringify(payload), "utf-8");
  let delivered = 0;
  let pruned = 0;
  let errors = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const subKey = b64urlToBuffer(sub.p256dh);
        const subAuth = b64urlToBuffer(sub.auth);
        const { body, headers } = encryptPayload(payloadBuf, subKey, subAuth);
        const r = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            ...headers,
            authorization: buildVapidAuthHeader(sub.endpoint, vapid),
          },
          // Buffer → Uint8Array : Node 20 a renforcé les types BodyInit
          // (Buffer<ArrayBufferLike> n'est plus assignable directement).
          body: new Uint8Array(body),
        });
        if (r.status === 404 || r.status === 410) {
          // Subscription invalide côté navigateur → on supprime
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
          pruned += 1;
          return;
        }
        if (r.ok) {
          delivered += 1;
          // Met à jour lastSuccessAt sans bloquer
          void prisma.pushSubscription
            .update({ where: { id: sub.id }, data: { lastSuccessAt: new Date() } })
            .catch(() => {});
        } else {
          errors += 1;
          // eslint-disable-next-line no-console
          console.warn(`[web-push] ${r.status} pour ${sub.endpoint.slice(0, 60)}…`);
        }
      } catch (e) {
        errors += 1;
        // eslint-disable-next-line no-console
        console.error("[web-push] error:", e instanceof Error ? e.message : e);
      }
    }),
  );

  return { ok: delivered > 0, delivered, pruned, errors };
}

/** Retourne la clé publique VAPID en base64url, à exposer au navigateur. */
export function getVapidPublicKey(): string | null {
  const v = getVapidConfig();
  return v?.publicKey ?? null;
}
