import argon2 from "argon2";
import { randomInt } from "node:crypto";
import { ContactType } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";
import { deliverOtp } from "../../lib/messaging.js";

/**
 * Service OTP — émission, vérification, anti-bombing.
 *
 * Règles :
 * - Code à N chiffres généré cryptographiquement (randomInt)
 * - Stocké hashé avec argon2 (jamais en clair)
 * - Pepper en plus du hash pour défense en profondeur
 * - Anti-bombing : OTP_RATE_LIMIT_PER_HOUR demandes max / contact / heure
 * - Anti-bruteforce : OTP_MAX_ATTEMPTS essais max par code
 * - TTL : OTP_TTL_SECONDS secondes
 */

export interface DeliveryChannel {
  /** Canaux de livraison supportés. En dev, mode "console" log dans le terminal. */
  send(opts: {
    contactType: ContactType;
    contactValue: string;
    code: string;
    channel: "SMS" | "WHATSAPP" | "EMAIL";
  }): Promise<void>;
}

/**
 * Délégation au dispatcher central messaging.ts qui gère :
 *  - mode "console" (dev par défaut) → log dans le terminal
 *  - mode "twilio" / "whatsapp" / "resend" → envoi réel via API
 *  - mode "auto" → choix selon contact + ce qui est configuré
 *
 * V72 — On résout le userId par lookup UserContact si possible pour
 * que les SMS/email envoyés soient trackés dans UsageEvent (rentabilité
 * par client). Pour un signup (contact pas encore en DB), userId=null
 * et le tracker skip silencieusement.
 */
const realDelivery: DeliveryChannel = {
  async send({ contactType, contactValue, code, channel }) {
    // V72 — lookup user via contact (peut être null pour signup).
    // UserContact utilise les noms `type` et `value` (pas contactType/Value).
    let userId: string | undefined;
    try {
      const contact = await prisma.userContact.findFirst({
        where: { type: contactType, value: contactValue, isVerified: true },
        select: { userId: true },
      });
      userId = contact?.userId ?? undefined;
    } catch {
      // Pas grave : tracking optionnel
    }
    await deliverOtp({
      contactType,
      contactValue,
      code,
      ttlSeconds: loadEnv().OTP_TTL_SECONDS,
      channel,
      userId,
    });
  },
};

let deliveryOverride: DeliveryChannel | null = null;
/** Pour les tests : injecter un mock. `null` rétablit la delivery réelle. */
export function setDeliveryChannel(channel: DeliveryChannel | null): void {
  deliveryOverride = channel;
}

function getDelivery(): DeliveryChannel {
  if (deliveryOverride) return deliveryOverride;
  return realDelivery;
}

function generateCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

function pepper(code: string): string {
  return code + loadEnv().OTP_PEPPER;
}

function pickChannel(
  contactType: ContactType,
  preferred?: "SMS" | "WHATSAPP" | "EMAIL",
): "SMS" | "WHATSAPP" | "EMAIL" {
  if (preferred) return preferred;
  return contactType === "EMAIL" ? "EMAIL" : "SMS";
}

/**
 * Demande un nouveau code OTP. Vérifie le rate limit (anti-bombing).
 * Renvoie { sent: true } sans révéler si le contact existe déjà (anti-énumération).
 */
export async function requestOtp(input: {
  contactType: ContactType;
  contactValue: string;
  channel?: "SMS" | "WHATSAPP" | "EMAIL";
}): Promise<{ sent: true; expiresAt: Date }> {
  const env = loadEnv();
  const value = input.contactValue.trim();
  if (!value)
    throw Errors.invalidFormula({
      what: "ton contact",
      why: "Tu n'as pas saisi d'email ou de numéro.",
      fix: "Indique ton email ou ton numéro de téléphone pour recevoir le code de connexion.",
    });

  // Rate limit : N demandes max par contact dans la dernière heure.
  // En mode dev, on désactive complètement (DX bloquante sinon — on
  // teste souvent la même connexion plusieurs fois). Reste actif en
  // staging/prod pour empêcher le SMS-bombing (coût Twilio).
  if (env.NODE_ENV !== "development") {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await prisma.otpCode.findMany({
      where: {
        contactType: input.contactType,
        contactValue: value,
        createdAt: { gte: oneHourAgo },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (recent.length >= env.OTP_RATE_LIMIT_PER_HOUR) {
      // Calcule à QUEL moment l'utilisateur pourra réessayer : c'est
      // 1h après la PLUS ANCIENNE demande dans la fenêtre glissante
      // (algo classique de rate limit "leaky bucket").
      const oldest = recent[0]!.createdAt;
      const retryAt = new Date(oldest.getTime() + 60 * 60 * 1000);
      const retryAfterSec = Math.max(
        0,
        Math.ceil((retryAt.getTime() - Date.now()) / 1000),
      );
      throw Errors.rateLimited(
        "On t'a déjà envoyé plusieurs codes — fais une petite pause avant d'en redemander un 🐢",
        {
          retryAfter: retryAfterSec,
          retryAt: retryAt.toISOString(),
          tip: `Tu pourras redemander un code dans ${
            retryAfterSec >= 60
              ? Math.ceil(retryAfterSec / 60) + " min"
              : retryAfterSec + " sec"
          }. Vérifie tes SMS/emails — un code est peut-être déjà arrivé.`,
        },
      );
    }
  }

  // Invalider les codes pending précédents pour ce contact
  await prisma.otpCode.updateMany({
    where: {
      contactType: input.contactType,
      contactValue: value,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });

  // Générer + hasher
  const code = generateCode(env.OTP_LENGTH);
  const codeHash = await argon2.hash(pepper(code));
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  await prisma.otpCode.create({
    data: {
      contactType: input.contactType,
      contactValue: value,
      codeHash,
      expiresAt,
    },
  });

  // En MODE DEV uniquement : on stocke le code en clair dans une map
  // mémoire pour permettre aux tests E2E de le récupérer via la route
  // /auth/dev/last-otp. Jamais activé en prod (vérif NODE_ENV).
  if (env.NODE_ENV === "development") {
    storeDevOtp(input.contactType, value, code);
  }

  // Délivrer
  await getDelivery().send({
    contactType: input.contactType,
    contactValue: value,
    code,
    channel: pickChannel(input.contactType, input.channel),
  });

  return { sent: true, expiresAt };
}

// ============================================================
// DEV ONLY — Map en mémoire des codes OTP en clair
// ============================================================
// Utilisée par la route helper /auth/dev/last-otp pour les tests E2E
// Playwright. JAMAIS activée en prod (le service ne stocke même pas
// dans cette map quand NODE_ENV !== "development").
//
// Capacité : 100 entrées max (LRU naïf — on dégage le plus ancien si
// dépassement). Pas critique : c'est éphémère et limité au dev.

interface DevOtpEntry {
  code: string;
  contactType: ContactType;
  contactValue: string;
  storedAt: number;
}

const devOtpStore = new Map<string, DevOtpEntry>();
const DEV_OTP_MAX = 100;

function storeDevOtp(
  type: ContactType,
  value: string,
  code: string,
): void {
  const key = `${type}:${value.toLowerCase()}`;
  devOtpStore.set(key, {
    code,
    contactType: type,
    contactValue: value,
    storedAt: Date.now(),
  });
  // GC LRU : retire la plus ancienne si dépassement capacité
  if (devOtpStore.size > DEV_OTP_MAX) {
    const oldestKey = Array.from(devOtpStore.entries()).sort(
      (a, b) => a[1].storedAt - b[1].storedAt,
    )[0]?.[0];
    if (oldestKey) devOtpStore.delete(oldestKey);
  }
}

/**
 * DEV ONLY — récupère le dernier code OTP émis pour un contact.
 * Retourne null si aucune entrée pour ce contact, ou si on n'est pas en dev.
 */
export function getLastDevOtp(
  contact: string,
): { code: string; contactType: ContactType; contactValue: string } | null {
  const env = loadEnv();
  if (env.NODE_ENV !== "development") return null;
  // Recherche par contactValue insensible à la casse, pour tous les
  // types (le caller passe juste l'email ou le numéro)
  const target = contact.toLowerCase();
  for (const entry of devOtpStore.values()) {
    if (entry.contactValue.toLowerCase() === target) {
      return {
        code: entry.code,
        contactType: entry.contactType,
        contactValue: entry.contactValue,
      };
    }
  }
  return null;
}

/**
 * Vérifie un code OTP. Réponse explicite : valide, expiré, mauvais code, trop d'essais.
 * En cas de succès, marque le code comme consommé.
 */
export async function verifyOtp(input: {
  contactType: ContactType;
  contactValue: string;
  code: string;
}): Promise<{ valid: true } | { valid: false; reason: string }> {
  const env = loadEnv();
  const value = input.contactValue.trim();

  const otp = await prisma.otpCode.findFirst({
    where: {
      contactType: input.contactType,
      contactValue: value,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { valid: false, reason: "no_pending_code" };

  if (otp.expiresAt < new Date()) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    return { valid: false, reason: "expired" };
  }

  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    return { valid: false, reason: "too_many_attempts" };
  }

  const ok = await argon2.verify(otp.codeHash, pepper(input.code));
  if (!ok) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { valid: false, reason: "wrong_code" };
  }

  // Marquer consommé pour éviter rejeu
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  return { valid: true };
}
