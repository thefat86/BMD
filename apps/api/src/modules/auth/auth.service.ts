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
    // V86 — Fix bug : otp.service.ts renvoie `wrong_code` et
    // `no_pending_code`, pas `invalid_code`. Le check précédent ne
    // matchait jamais → message générique pour tout (mauvais code, code
    // déjà consommé, etc.). Désormais on aiguille correctement.
    const niceReason =
      result.reason === "expired"
        ? "Ce code a expiré ⏰ — demande-en un nouveau, c'est instantané."
        : result.reason === "max_attempts"
          ? "Trop de tentatives sur ce code 🚫 — demande-en un nouveau pour repartir à zéro."
          : result.reason === "wrong_code"
            ? "Le code ne correspond pas — vérifie le SMS/email et retente."
            : result.reason === "no_pending_code"
              ? "Aucun code en attente — demande-en un nouveau."
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
    // V89 — Fallback tolérant : si le front oublie d'envoyer displayName
    // (champ "Prénom" caché par le clavier OTP sur iPhone, ou bug
    // d'affichage côté UI), on dérive un nom temporaire propre depuis le
    // contact au lieu de bloquer l'inscription avec une erreur opaque.
    //
    // Le user pourra renommer immédiatement depuis /dashboard/profile.
    // Cas couverts :
    //   - Email "alice@gmail.com" → "Alice"  (capitalize local-part, sans .)
    //   - Téléphone "+33614123456" → "Membre 3456" (4 derniers chiffres)
    //   - Sinon → "Nouveau membre"
    //
    // On garde une trace dans les logs pour pouvoir corriger l'UX si ce
    // fallback se déclenche trop souvent en prod.
    const submitted = (input.displayName ?? "").trim();
    let displayName = submitted;
    if (!displayName) {
      if (input.contactType === "EMAIL") {
        const local = value.split("@")[0] ?? "";
        const cleaned = local.replace(/[._-]+/g, " ").trim();
        if (cleaned) {
          displayName =
            cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
        }
      } else if (input.contactType === "PHONE") {
        const digits = value.replace(/\D/g, "");
        const last4 = digits.slice(-4);
        if (last4) displayName = `Membre ${last4}`;
      }
      if (!displayName) displayName = "Nouveau membre";
      app.log.warn(
        {
          contactType: input.contactType,
          contactValue: value.replace(/.(?=.{4})/g, "•"), // masque le contact
          fallback: displayName,
        },
        "[auth] verifyAndIssue: displayName missing for new user — used fallback",
      );
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
