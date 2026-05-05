import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma — un seul client par process pour éviter d'épuiser le pool.
 * En tests, on ré-instancie volontairement à chaque suite (voir tests/setup.ts).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
