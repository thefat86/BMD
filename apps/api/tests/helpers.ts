/**
 * Helpers used across test files.
 */
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/lib/db.js";

let cachedApp: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!cachedApp) cachedApp = await buildServer();
  return cachedApp;
}

/** Inject a request with auth header */
export async function authedRequest(
  app: FastifyInstance,
  opts: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    url: string;
    token: string;
    payload?: unknown;
  },
) {
  return app.inject({
    method: opts.method,
    url: opts.url,
    headers: { authorization: `Bearer ${opts.token}` },
    payload: opts.payload,
  });
}

/**
 * Sign up + log in a fresh user via the real OTP flow.
 * Returns { token, userId, displayName, contact }.
 */
export async function signupViaOtp(
  app: FastifyInstance,
  opts: { displayName: string; phone?: string; email?: string },
): Promise<{ token: string; userId: string }> {
  const contactType = opts.email ? "EMAIL" : "PHONE";
  const contactValue =
    opts.email ?? opts.phone ?? `+33000${Math.floor(Math.random() * 1e6)}`;

  // Request OTP
  const reqResp = await app.inject({
    method: "POST",
    url: "/auth/otp/request",
    payload: { contactType, contactValue },
  });
  if (reqResp.statusCode !== 202) {
    throw new Error(`OTP request failed: ${reqResp.statusCode} ${reqResp.body}`);
  }

  // Pull the OTP code straight from DB (only allowed in tests)
  const otp = await prisma.otpCode.findFirstOrThrow({
    where: { contactType, contactValue, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  // We can't read the original code — argon2 is one-way. Instead, generate a fresh OTP
  // by using the test seam : insert a known code.
  // Simpler approach : use a TEST-MODE flag that returns the code in the response.
  // We do that by reading from the DB after requesting, BUT we hashed it.
  // Alternative : in tests, we replace the delivery channel to capture the code.
  throw new Error(
    "Use captureOtp() helper instead of signupViaOtp — see tests/helpers.ts",
  );
}

/**
 * Replace the OTP delivery channel with one that captures the code into a queue,
 * so tests can read it without bruteforce.
 */
import { setDeliveryChannel, type DeliveryChannel } from "../src/modules/auth/otp.service.js";

const captured: Array<{ contactValue: string; code: string }> = [];

const captureChannel: DeliveryChannel = {
  async send({ contactValue, code }) {
    captured.push({ contactValue, code });
  },
};

export function startOtpCapture() {
  setDeliveryChannel(captureChannel);
  captured.length = 0;
}

export function stopOtpCapture() {
  setDeliveryChannel(null);
  captured.length = 0;
}

export function lastOtp(contactValue: string): string {
  for (let i = captured.length - 1; i >= 0; i--) {
    if (captured[i]!.contactValue === contactValue) return captured[i]!.code;
  }
  throw new Error(`No OTP captured for ${contactValue}`);
}

export async function quickSignup(
  app: FastifyInstance,
  opts: { displayName: string; phone?: string; email?: string },
): Promise<{ token: string; userId: string; contactValue: string }> {
  const contactType = opts.email ? "EMAIL" : "PHONE";
  const contactValue =
    opts.email ??
    opts.phone ??
    `+33${Math.floor(100000000 + Math.random() * 899999999)}`;

  startOtpCapture();
  await app.inject({
    method: "POST",
    url: "/auth/otp/request",
    payload: { contactType, contactValue },
  });
  const code = lastOtp(contactValue);

  const verifyResp = await app.inject({
    method: "POST",
    url: "/auth/otp/verify",
    payload: {
      contactType,
      contactValue,
      code,
      displayName: opts.displayName,
    },
  });
  stopOtpCapture();

  if (verifyResp.statusCode !== 200) {
    throw new Error(`Signup failed: ${verifyResp.statusCode} ${verifyResp.body}`);
  }
  const body = verifyResp.json() as { token: string; user: { id: string } };
  return { token: body.token, userId: body.user.id, contactValue };
}
