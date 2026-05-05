import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContactType } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { requestOtp } from "./otp.service.js";
import { verifyAndIssue } from "./auth.service.js";
import { revokeSession } from "./jwt.service.js";

const requestOtpSchema = z.object({
  contactType: z.nativeEnum(ContactType),
  contactValue: z.string().min(3),
  channel: z.enum(["SMS", "WHATSAPP", "EMAIL"]).optional(),
});

const verifyOtpSchema = z.object({
  contactType: z.nativeEnum(ContactType),
  contactValue: z.string().min(3),
  code: z.string().regex(/^\d{4,8}$/),
  displayName: z.string().min(1).max(80).optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/otp/request
   * Body: { contactType, contactValue, channel? }
   * Response: 202 { sent: true, expiresAt }
   * Toujours répond 202 même si le contact n'existe pas (anti-énumération).
   */
  app.post("/auth/otp/request", async (req, reply) => {
    const body = requestOtpSchema.parse(req.body);
    const result = await requestOtp(body);
    return reply.code(202).send(result);
  });

  /**
   * POST /auth/otp/verify
   * Body: { contactType, contactValue, code, displayName? }
   * Response: 200 { token, expiresAt, user }
   */
  app.post("/auth/otp/verify", async (req, reply) => {
    const body = verifyOtpSchema.parse(req.body);
    const result = await verifyAndIssue(app, {
      ...body,
      device: req.headers["user-agent"] ?? undefined,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        defaultCurrency: true,
        defaultLocale: true,
      },
    });

    return reply.send({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      user,
    });
  });

  /**
   * GET /auth/me
   * Headers: Authorization: Bearer <token>
   * Response: 200 { user, contacts }
   */
  app.get("/auth/me", { onRequest: [app.authenticate] }, async (req) => {
    const userId = req.user.sub;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        contacts: {
          select: {
            id: true,
            type: true,
            value: true,
            isVerified: true,
            isPrimary: true,
            verifiedAt: true,
          },
        },
      },
    });
    return { user };
  });

  /**
   * POST /auth/logout
   * Révoque la session courante.
   */
  app.post("/auth/logout", { onRequest: [app.authenticate] }, async (req, reply) => {
    await revokeSession(req.user.sid);
    return reply.code(204).send();
  });
}
