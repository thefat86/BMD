import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../lib/db.js";
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";
import type { FastifyInstance } from "fastify";

export interface JwtPayload {
  sub: string; // userId
  sid: string; // sessionId
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseExpiresIn(expiresIn: string): number {
  // Quick parser : "30d" => 30 * 86400 sec, "12h" => 12 * 3600, "60m" => 60 * 60
  const m = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!m) throw new Error("Invalid JWT_EXPIRES_IN format");
  const value = parseInt(m[1]!, 10);
  const unit = m[2]!;
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit]!;
  return value * mult;
}

export async function issueToken(
  app: FastifyInstance,
  userId: string,
  device?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const env = loadEnv();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + parseExpiresIn(env.JWT_EXPIRES_IN) * 1000);

  const payload: JwtPayload = { sub: userId, sid: sessionId };
  const token = app.jwt.sign(payload);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: hashToken(token),
      device: device ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Vérifie qu'une session JWT est toujours active (pas révoquée, pas expirée).
 * Appelé depuis le hook d'auth Fastify.
 */
export async function assertSessionActive(payload: JwtPayload, token: string): Promise<void> {
  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  if (!session) throw Errors.unauthorized("Session not found");
  if (session.revokedAt) throw Errors.unauthorized("Session revoked");
  if (session.expiresAt < new Date()) throw Errors.unauthorized("Session expired");
  if (session.tokenHash !== hashToken(token)) {
    throw Errors.unauthorized("Token mismatch");
  }
}
