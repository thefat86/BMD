import argon2 from "argon2";
import { randomInt } from "node:crypto";
import { ContactType } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";

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

const consoleDelivery: DeliveryChannel = {
  async send({ contactType, contactValue, code, channel }) {
    // eslint-disable-next-line no-console
    console.log(
      `\n📨 [OTP-DEV] ${channel} → ${contactType}:${contactValue} → CODE: ${code}\n`,
    );
  },
};

let deliveryOverride: DeliveryChannel | null = null;
export function setDeliveryChannel(channel: DeliveryChannel | null): void {
  deliveryOverride = channel;
}

function getDelivery(): DeliveryChannel {
  if (deliveryOverride) return deliveryOverride;
  // En prod, brancher Twilio / WhatsApp Cloud API / Postmark ici.
  return consoleDelivery;
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
  if (!value) throw Errors.badRequest("Contact value required");

  // Rate limit : N demandes max par contact dans la dernière heure
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.otpCode.count({
    where: {
      contactType: input.contactType,
      contactValue: value,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recent >= env.OTP_RATE_LIMIT_PER_HOUR) {
    throw Errors.rateLimited(
      `Too many OTP requests for this contact. Try again later.`,
    );
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

  // Délivrer
  await getDelivery().send({
    contactType: input.contactType,
    contactValue: value,
    code,
    channel: pickChannel(input.contactType, input.channel),
  });

  return { sent: true, expiresAt };
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
