import { ContactType } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { verifyOtp } from "./otp.service.js";
import { issueToken } from "./jwt.service.js";
import type { FastifyInstance } from "fastify";

/**
 * Verify the OTP and issue a session.
 *
 * Behaviour :
 *  - If the contact exists and is verified → log in.
 *  - If the contact exists but unverified → mark verified + log in.
 *  - If the contact doesn't exist → create user + contact (verified) + log in.
 *  - displayName is required only when creating a new user.
 */
export async function verifyAndIssue(
  app: FastifyInstance,
  input: {
    contactType: ContactType;
    contactValue: string;
    code: string;
    displayName?: string;
    device?: string;
    /** Pays dérivé des headers proxy (CF-IPCountry…) — utilisé pour la détection "nouveau pays". */
    country?: string;
  },
): Promise<{ token: string; userId: string; expiresAt: Date }> {
  const value = input.contactValue.trim();

  const result = await verifyOtp({
    contactType: input.contactType,
    contactValue: value,
    code: input.code,
  });
  if (!result.valid) {
    const niceReason =
      result.reason === "expired"
        ? "Ce code a expiré ⏰ — demande-en un nouveau, c'est instantané."
        : result.reason === "max_attempts"
          ? "Trop de tentatives sur ce code 🚫 — demande-en un nouveau pour repartir à zéro."
          : result.reason === "invalid_code"
            ? "Le code ne correspond pas — vérifie le SMS/email et retente."
            : "Code de connexion invalide.";
    throw Errors.unauthorized(niceReason);
  }

  // Find existing contact
  const existing = await prisma.userContact.findUnique({
    where: { type_value: { type: input.contactType, value } },
    include: { user: true },
  });

  let userId: string;

  if (existing) {
    userId = existing.userId;
    if (!existing.isVerified) {
      await prisma.userContact.update({
        where: { id: existing.id },
        data: { isVerified: true, verifiedAt: new Date() },
      });
    }
  } else {
    // New user
    const displayName = (input.displayName ?? "").trim();
    if (!displayName) {
      throw Errors.invalidFormula({
        what: "ton inscription",
        why: "On a besoin de savoir comment t'appeler pour créer ton compte 👋",
        fix: "Indique ton prénom (ou un pseudo) — tu pourras le changer plus tard depuis ton profil.",
      });
    }

    const user = await prisma.user.create({
      data: {
        displayName,
        contacts: {
          create: {
            type: input.contactType,
            value,
            isVerified: true,
            isPrimary: true,
            verifiedAt: new Date(),
          },
        },
      },
    });
    userId = user.id;
  }

  const { token, expiresAt } = await issueToken(
    app,
    userId,
    input.device,
    input.country,
    {
      contactType: input.contactType,
      contactValue: value,
    },
  );
  return { token, userId, expiresAt };
}
