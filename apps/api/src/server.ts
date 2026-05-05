import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import { loadEnv } from "./lib/env.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { groupsRoutes } from "./modules/groups/groups.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { settlementsRoutes } from "./modules/settlements/settlements.routes.js";
import { assertSessionActive, type JwtPayload } from "./modules/auth/jwt.service.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === "development"
                ? { target: "pino-pretty", options: { colorize: true, singleLine: true } }
                : undefined,
          },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate("authenticate", async function (req: any, _reply: any) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    await req.jwtVerify();
    await assertSessionActive(req.user, token);
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Invalid request body",
        details: err.flatten(),
      });
    }
    if ((err as any).statusCode === 401) {
      return reply.code(401).send({
        error: "unauthorized",
        message: err.message ?? "Authentication required",
      });
    }
    app.log.error({ err }, "Unhandled error");
    return reply.code(500).send({
      error: "internal",
      message: "Internal server error",
    });
  });

  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Mount module routes
  await app.register(authRoutes);
  await app.register(groupsRoutes);
  await app.register(expensesRoutes);
  await app.register(settlementsRoutes);

  return app;
}
