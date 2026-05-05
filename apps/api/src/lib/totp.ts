/**
 * TOTP (Time-based One-Time Password) selon RFC 6238.
 *
 * Implémentation pure Node sans dépendance externe — utilise
 * `node:crypto` qui supporte HMAC-SHA1 nativement.
 *
 * Compatible avec toutes les apps standard : Google Authenticator,
 * Authy, 1Password, Bitwarden, etc. (qui suivent la RFC).
 *
 * Paramètres standards :
 *  - Algorithme : HMAC-SHA1
 *  - Période : 30 secondes
 *  - Digits : 6
 *  - Encoding du secret : base32 (compatible Google Authenticator)
 */
import { createHmac, randomBytes } from "crypto";

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALGO = "sha1" as const;

/**
 * Encode des bytes en base32 (RFC 4648 sans padding) — compat Google Authenticator.
 */
function bytesToBase32(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Décode un secret base32 en buffer.
 */
function base32ToBytes(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.toUpperCase().replace(/\s+|=+$/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of cleaned) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) throw new Error(`Caractère base32 invalide : ${c}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Génère un secret aléatoire de 20 octets (160 bits) — encodé en base32.
 * 32 caractères base32 = standard pour TOTP.
 */
export function generateTotpSecret(): string {
  const buf = randomBytes(20);
  return bytesToBase32(buf);
}

/**
 * Calcule le code TOTP pour un secret donné à l'instant `time` (Unix seconds).
 * Si `time` est omis, utilise l'instant courant.
 */
export function generateTotpCode(secret: string, time?: number): string {
  const t = Math.floor((time ?? Date.now() / 1000) / PERIOD_SECONDS);
  const counter = Buffer.alloc(8);
  // counter : 64 bits big-endian
  counter.writeBigUInt64BE(BigInt(t), 0);

  const key = base32ToBytes(secret);
  const hmac = createHmac(ALGO, key).update(counter).digest();

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const num = code % 10 ** DIGITS;
  return String(num).padStart(DIGITS, "0");
}

/**
 * Vérifie un code TOTP fourni par l'utilisateur.
 *  - Tolérance ±1 fenêtre (90s total) pour gérer le décalage horloge
 *  - Comparaison constant-time pour éviter les timing attacks
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  time?: number,
): boolean {
  const t = time ?? Date.now() / 1000;
  for (const drift of [-1, 0, 1]) {
    const expected = generateTotpCode(secret, t + drift * PERIOD_SECONDS);
    if (constantTimeEqual(expected, code)) return true;
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Construit l'URI otpauth:// standard à scanner par les apps TOTP.
 * Format : otpauth://totp/Issuer:label?secret=XXX&issuer=Issuer&...
 */
export function buildOtpauthUri(input: {
  label: string;
  issuer: string;
  secret: string;
}): string {
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  const safeLabel = encodeURIComponent(`${input.issuer}:${input.label}`);
  return `otpauth://totp/${safeLabel}?${params.toString()}`;
}
