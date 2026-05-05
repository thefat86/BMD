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
  },
): Promise<{ token: string; userId: string; expiresAt: Date }> {
  const value = input.contactValue.trim();

  const result = await verifyOtp({
    contactType: input.contactType,
    contactValue: value,
    code: input.code,
  });
  if (!result.valid) {
    throw Errors.unauthorized(`OTP verification failed: ${result.reason}`);
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
      throw Errors.badRequest(
        "displayName is required for first-time signup",
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

  const { token, expiresAt } = await issueToken(app, userId, input.device);
  return { token, userId, expiresAt };
}
