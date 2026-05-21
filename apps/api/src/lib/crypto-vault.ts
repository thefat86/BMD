/**
 * Vault de chiffrement (spec §9.1) — AES-256-GCM avec authentification.
 *
 * Utilisé pour les moyens de paiement (numéros Mobile Money, IBAN, etc.)
 * et toute autre donnée sensible nécessitant un déchiffrement à la demande.
 *
 * Algorithme : AES-256-GCM (authenticated encryption with associated data).
 * - 256-bit key dérivée depuis PAYMENT_VAULT_KEY (env)
 * - 96-bit IV unique par chiffrement (NIST recommandation)
 * - 128-bit auth tag pour détection d'altération
 *
 * Format de sortie : { encryptedValue, iv, authTag } — tous en base64.
 *
 * Si la clé maître n'est pas configurée :
 *   - encryptValue lance une erreur explicite (sécurité par défaut)
 *   - decryptValue lance une erreur explicite
 * → l'admin doit configurer PAYMENT_VAULT_KEY avant d'utiliser le vault.
 *
 * Génération d'une clé : `openssl rand -base64 32`
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { loadEnv } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — recommandation NIST pour GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

interface EncryptedPayload {
  encryptedValue: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/**
 * Lit la clé maître depuis l'env. Throw si absente ou invalide.
 * Cache en mémoire pour éviter de re-décoder à chaque appel.
 */
let cachedKey: Buffer | null = null;
function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = loadEnv();
  if (!env.PAYMENT_VAULT_KEY) {
    throw new Error(
      "PAYMENT_VAULT_KEY non configurée — impossible de chiffrer/déchiffrer. " +
        "Génère une clé avec : openssl rand -base64 32",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(env.PAYMENT_VAULT_KEY, "base64");
  } catch {
    throw new Error("PAYMENT_VAULT_KEY n'est pas un base64 valide");
  }
  if (key.length !== 32) {
    throw new Error(
      `PAYMENT_VAULT_KEY doit faire 32 bytes (256 bits) après décodage base64, reçu ${key.length} bytes`,
    );
  }
  cachedKey = key;
  return key;
}

/**
 * Indique si le vault est utilisable (clé maître configurée).
 * À utiliser pour activer/désactiver l'UI de gestion des moyens de paiement.
 */
export function isVaultConfigured(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Chiffre une chaîne arbitraire avec AES-256-GCM.
 * Retourne 3 valeurs base64 : encryptedValue, iv, authTag.
 */
export function encryptValue(plaintext: string): EncryptedPayload {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptValue: plaintext vide ou invalide");
  }
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Déchiffre un payload AES-256-GCM. Throw si :
 *  - la clé est absente / invalide
 *  - le tag GCM ne correspond pas (donnée altérée)
 */
export function decryptValue(payload: EncryptedPayload): string {
  const key = getMasterKey();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.encryptedValue, "base64");
  if (iv.length !== IV_LENGTH) {
    throw new Error("decryptValue: IV invalide");
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("decryptValue: authTag invalide");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf-8");
  } catch {
    // Erreur GCM = donnée altérée OU mauvaise clé
    throw new Error(
      "decryptValue: échec d'authentification GCM (donnée altérée ou clé incorrecte)",
    );
  }
}

/**
 * Compare deux valeurs en temps constant. Utile si on doit comparer
 * un moyen de paiement déchiffré avec une valeur saisie sans risquer
 * un timing attack.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Hash SHA-256 d'une valeur — pour les indexes "déjà existant ?" sans
 * stocker la valeur en clair (ex: éviter d'ajouter 2 fois le même IBAN).
 * Le hash est dérivé de la clé maître pour ne pas être devinable hors serveur.
 */
export function fingerprintValue(value: string): string {
  const key = getMasterKey();
  return createHash("sha256")
    .update(key)
    .update(value)
    .digest("base64")
    .slice(0, 32);
}
