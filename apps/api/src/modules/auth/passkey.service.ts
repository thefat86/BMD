/**
 * WebAuthn / Passkeys service (spec §7.5).
 *
 * Architecture :
 *  1. REGISTRATION (ajouter un passkey à un compte existant) :
 *     - Le user est déjà authentifié (JWT classique).
 *     - Server : génère un challenge + options registration.
 *     - Browser : appelle navigator.credentials.create(...).
 *     - Server : vérifie la response, stocke credentialId + publicKey.
 *
 *  2. LOGIN (se connecter avec passkey) :
 *     - User saisit son contact (email/phone) → server résout l'userId.
 *     - Server : génère challenge + liste des credentialIds autorisés.
 *     - Browser : appelle navigator.credentials.get(...).
 *     - Server : vérifie la signature, retourne JWT.
 *
 * Sécurité :
 *  - Challenge 32 bytes random, à usage unique, TTL 5 min.
 *  - On stocke uniquement la clé publique côté serveur.
 *  - Le compteur (signature counter) protège contre les clones.
 *  - rpID dérivé de WEB_BASE_URL — éviter les hostnames non sécurisés en prod.
 *
 * Compatibilité : @simplewebauthn/server gère les attestations none/packed/
 * fido-u2f/android-key/etc. On utilise "none" par défaut (suffit pour
 * l'usage public d'un site grand public ; entreprise = packed/full).
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { loadEnv } from "../../lib/env.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extrait rpID + origin.
 *  - Si `requestOrigin` est fourni (lu depuis le header Origin de la requête HTTP),
 *    on l'utilise en priorité — utile en DEV où on peut tester depuis plusieurs
 *    origines (localhost, IP LAN, tunnel ngrok). WebAuthn EXIGE que le rpID
 *    matche le hostname de l'origin où le browser tourne.
 *  - Sinon fallback sur WEB_BASE_URL (prod).
 *
 *  - rpID = hostname (sans port)
 *  - origin = protocol + hostname + port
 */
function getRpInfo(requestOrigin?: string | null): {
  rpID: string;
  rpName: string;
  origin: string;
  expectedOrigins: string[];
} {
  const env = loadEnv();
  const fallback = new URL(env.WEB_BASE_URL);

  // Liste blanche d'hostnames acceptés en dev (sécurité minimale : on n'accepte
  // que les patterns connus pour ne pas permettre n'importe quelle origin).
  const isAllowedDevOrigin = (origin: string): boolean => {
    try {
      const u = new URL(origin);
      const host = u.hostname;
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        // IPs LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        /^192\.168\./.test(host) ||
        /^10\./.test(host) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
        // Tunnels publics couramment utilisés en dev
        host.endsWith(".ngrok-free.dev") ||
        host.endsWith(".ngrok-free.app") ||
        host.endsWith(".ngrok.io") ||
        host.endsWith(".trycloudflare.com") ||
        host.endsWith(".loca.lt")
      );
    } catch {
      return false;
    }
  };

  const isProd = env.NODE_ENV === "production";

  // En PROD : on respecte STRICTEMENT WEB_BASE_URL (pas de spoofing d'origin)
  // En DEV  : on accepte l'origin de la requête si elle est dans la whitelist
  let chosen: URL;
  const expectedOrigins: string[] = [fallback.origin];

  if (!isProd && requestOrigin && isAllowedDevOrigin(requestOrigin)) {
    chosen = new URL(requestOrigin);
    if (!expectedOrigins.includes(chosen.origin)) {
      expectedOrigins.push(chosen.origin);
    }
  } else {
    chosen = fallback;
  }

  return {
    rpID: chosen.hostname,
    rpName: "BMD · Back Mes Do",
    origin: chosen.origin,
    expectedOrigins,
  };
}

/**
 * Convertit un Buffer/Uint8Array en base64url (sans padding, URL-safe).
 */
function bufToB64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

/**
 * Convertit du base64url en Uint8Array.
 */
function b64urlToBuf(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64url"));
}

// ============================================================
// REGISTRATION (ajouter un passkey à un compte existant)
// ============================================================

export async function generateRegisterOptions(input: {
  userId: string;
  deviceName?: string;
  /** Origin du browser (depuis header Origin) — utilisé pour rpID dynamique en dev */
  requestOrigin?: string | null;
}): Promise<{
  options: PublicKeyCredentialCreationOptionsJSONOut;
}> {
  const { rpID, rpName } = getRpInfo(input.requestOrigin);

  // Récupère les passkeys déjà enregistrés pour exclude (pas re-register le même)
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: {
      passkeys: { select: { credentialId: true, transports: true } },
    },
  });
  if (!user) throw Errors.notFound("User not found");

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.displayName,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.credentialId,
      transports: parseTransports(p.transports),
    })),
    authenticatorSelection: {
      // On laisse undefined pour `authenticatorAttachment` : ça permet à
      // l'utilisateur de choisir entre Touch/Face ID intégré (platform)
      // ET clé USB externe (cross-platform). Forcer "platform" exclurait
      // les Yubikey ; forcer "cross-platform" exclurait Face ID. La
      // sélection se fait côté UI via la conditional UI / autofill.
      residentKey: "preferred", // discoverable credentials = autofill mobile
      userVerification: "preferred", // demande biométrie quand dispo
    },
    supportedAlgorithmIDs: [-7, -257, -8], // ES256, RS256, EdDSA
  });

  // Stocke le challenge sur le user (1 seul à la fois)
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      passkeyChallenge: options.challenge,
      passkeyChallengeAt: new Date(),
    },
  });

  return { options: options as unknown as PublicKeyCredentialCreationOptionsJSONOut };
}

export async function finishRegister(input: {
  userId: string;
  response: RegistrationResponseJSON;
  deviceName?: string;
  /** Origin du browser (depuis header Origin) — pour rpID dynamique en dev */
  requestOrigin?: string | null;
}): Promise<{ id: string; deviceName: string }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
  });
  if (!user) throw Errors.notFound("User not found");
  if (!user.passkeyChallenge || !user.passkeyChallengeAt) {
    throw Errors.badRequest("Aucun challenge en cours — recommence l'inscription");
  }
  if (
    Date.now() - user.passkeyChallengeAt.getTime() >
    CHALLENGE_TTL_MS
  ) {
    throw Errors.badRequest("Challenge expiré — recommence l'inscription");
  }

  const { rpID, expectedOrigins } = getRpInfo(input.requestOrigin);
  // SÉCU §7.5 : on consume le challenge AVANT vérification (puis on l'efface
  // de toute façon en finally). Empêche toute tentative de replay si la
  // vérification échoue puis qu'un attaquant essaie avec un autre device.
  const expectedChallenge = user.passkeyChallenge;
  await prisma.user.update({
    where: { id: user.id },
    data: { passkeyChallenge: null, passkeyChallengeAt: null },
  });

  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge,
      // expectedOrigin accepte un tableau pour autoriser plusieurs origines
      // (localhost + ngrok + LAN IP en dev, single en prod).
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
    });
  } catch (err) {
    throw Errors.badRequest(
      `Vérification passkey échouée : ${(err as Error).message}`,
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw Errors.badRequest("Passkey non vérifiable");
  }

  const ri = verification.registrationInfo;
  // simplewebauthn v10 expose credential.id (string base64url) directement
  const credentialId = ri.credential.id;
  const publicKey = bufToB64url(ri.credential.publicKey);
  const counter = BigInt(ri.credential.counter ?? 0);
  const aaguid = ri.aaguid ?? null;

  const created = await prisma.passkey.create({
    data: {
      userId: user.id,
      credentialId,
      publicKey,
      counter,
      algorithm: -7, // par défaut ES256, peut être détecté plus finement via COSE
      transports: input.response.response.transports?.join(",") ?? null,
      deviceName: input.deviceName?.slice(0, 80) ?? "Passkey",
      aaguid,
    },
  });
  // (Challenge déjà clear ci-dessus avant verify, anti-replay sécu)

  return { id: created.id, deviceName: created.deviceName };
}

// ============================================================
// LOGIN (se connecter avec passkey)
// ============================================================

export async function generateLoginOptions(input: {
  /** Optionnel : si on connaît l'userId (passkey-only flow), on pré-fill allowCredentials */
  userId?: string;
  /** Optionnel : si on connaît le contact (email/phone), on résout l'userId */
  contactValue?: string;
  /** Origin du browser (depuis header Origin) — pour rpID dynamique en dev */
  requestOrigin?: string | null;
}): Promise<{
  options: PublicKeyCredentialRequestOptionsJSONOut;
  /** L'userId résolu (utile pour le finishLogin) — null si discoverable credential */
  resolvedUserId: string | null;
}> {
  const { rpID } = getRpInfo(input.requestOrigin);
  let userId: string | null = input.userId ?? null;

  if (!userId && input.contactValue) {
    const contact = await prisma.userContact.findFirst({
      where: { value: input.contactValue, isVerified: true },
      select: { userId: true },
    });
    userId = contact?.userId ?? null;
  }

  let allowCredentials: Array<{ id: string; transports?: AuthenticatorTransportFuture[] }> = [];
  if (userId) {
    const passkeys = await prisma.passkey.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    allowCredentials = passkeys.map((p) => ({
      id: p.credentialId,
      transports: parseTransports(p.transports),
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: "preferred",
  });

  // Stocke le challenge sur le user (si on l'a) sinon sur un user "anonymous-pending"…
  // En MVP : si userId connu, on stocke dessus. Sinon, on retourne le challenge tel
  // quel et on fera la résolution au moment du finishLogin via le credentialId.
  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passkeyChallenge: options.challenge,
        passkeyChallengeAt: new Date(),
      },
    });
  }

  return {
    options: options as unknown as PublicKeyCredentialRequestOptionsJSONOut,
    resolvedUserId: userId,
  };
}

export async function finishLogin(input: {
  response: AuthenticationResponseJSON;
  /** Si fourni, on s'attend à ce challenge. Sinon, on lit depuis le user résolu. */
  expectedChallenge?: string;
  /** Origin du browser (depuis header Origin) — pour rpID dynamique en dev */
  requestOrigin?: string | null;
}): Promise<{ userId: string; passkeyId: string }> {
  const credentialId = input.response.id;

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId },
    include: { user: true },
  });
  if (!passkey) {
    throw Errors.badRequest("Passkey inconnu — utilise un autre moyen de te connecter");
  }

  const user = passkey.user;
  if (user.suspendedAt) {
    throw Errors.forbidden("Compte suspendu");
  }

  // Récupère le challenge attendu
  const expectedChallenge =
    input.expectedChallenge ?? user.passkeyChallenge ?? null;
  if (!expectedChallenge) {
    throw Errors.badRequest("Aucun challenge en cours — recommence");
  }
  if (
    user.passkeyChallengeAt &&
    Date.now() - user.passkeyChallengeAt.getTime() > CHALLENGE_TTL_MS
  ) {
    // Clear quand même pour ne pas laisser un challenge expiré en base
    await prisma.user.update({
      where: { id: user.id },
      data: { passkeyChallenge: null, passkeyChallengeAt: null },
    });
    throw Errors.badRequest("Challenge expiré — recommence");
  }

  // SÉCU : on efface le challenge AVANT verify (anti-replay strict).
  // Si verify throw, le challenge est de toute façon perdu — l'attaquant
  // ne peut pas réessayer avec un autre device sur le même challenge.
  await prisma.user.update({
    where: { id: user.id },
    data: { passkeyChallenge: null, passkeyChallengeAt: null },
  });

  const { rpID, expectedOrigins } = getRpInfo(input.requestOrigin);
  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: b64urlToBuf(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: parseTransports(passkey.transports),
      },
      requireUserVerification: false,
    });
  } catch (err) {
    throw Errors.badRequest(
      `Authentification passkey échouée : ${(err as Error).message}`,
    );
  }

  if (!verification.verified) {
    throw Errors.badRequest("Authentification passkey non vérifiable");
  }

  // Met à jour le compteur + lastUsedAt (challenge déjà cleared avant verify)
  const newCounter = BigInt(verification.authenticationInfo.newCounter ?? 0);
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });

  return { userId: user.id, passkeyId: passkey.id };
}

// ============================================================
// LISTING / DELETION (gestion par l'utilisateur)
// ============================================================

export async function listMyPasskeys(userId: string) {
  const list = await prisma.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      deviceName: true,
      createdAt: true,
      lastUsedAt: true,
      transports: true,
    },
  });
  return list.map((p) => ({
    id: p.id,
    deviceName: p.deviceName,
    createdAt: p.createdAt.toISOString(),
    lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
    transports: parseTransports(p.transports),
  }));
}

export async function renameMyPasskey(input: {
  userId: string;
  passkeyId: string;
  deviceName: string;
}): Promise<void> {
  const pk = await prisma.passkey.findUnique({
    where: { id: input.passkeyId },
  });
  if (!pk || pk.userId !== input.userId) {
    throw Errors.notFound("Passkey introuvable");
  }
  await prisma.passkey.update({
    where: { id: input.passkeyId },
    data: { deviceName: input.deviceName.slice(0, 80) },
  });
}

export async function deleteMyPasskey(input: {
  userId: string;
  passkeyId: string;
}): Promise<void> {
  const pk = await prisma.passkey.findUnique({
    where: { id: input.passkeyId },
  });
  if (!pk || pk.userId !== input.userId) {
    throw Errors.notFound("Passkey introuvable");
  }
  await prisma.passkey.delete({ where: { id: input.passkeyId } });
}

// ============================================================
// UTILS
// ============================================================

type AuthenticatorTransportFuture =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";

function parseTransports(
  csv: string | null,
): AuthenticatorTransportFuture[] | undefined {
  if (!csv) return undefined;
  const allowed: AuthenticatorTransportFuture[] = [
    "ble",
    "cable",
    "hybrid",
    "internal",
    "nfc",
    "smart-card",
    "usb",
  ];
  const parts = csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AuthenticatorTransportFuture =>
      (allowed as string[]).includes(s),
    );
  return parts.length > 0 ? parts : undefined;
}

// Types simplifiés pour les options retournées au front (évite d'exposer
// tous les types internes de @simplewebauthn).
type PublicKeyCredentialCreationOptionsJSONOut = Record<string, unknown>;
type PublicKeyCredentialRequestOptionsJSONOut = Record<string, unknown>;
