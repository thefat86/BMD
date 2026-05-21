import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma — un seul client par process pour éviter d'épuiser le pool.
 * En tests, on ré-instancie volontairement à chaque suite (voir tests/setup.ts).
 *
 * === Connection pooling ===
 *
 * Prisma utilise par défaut un pool de `num_physical_cpus * 2 + 1` connexions
 * (ex: 9 sur un CPU 4 cœurs). Pour une API Fastify mono-instance servant
 * <500 req/s, c'est largement suffisant.
 *
 * Pour de la prod multi-instance avec PgBouncer en transaction mode :
 *  - Définir DATABASE_URL avec `?connection_limit=1&pool_timeout=30&pgbouncer=true`
 *    (PgBouncer gère le pool, Prisma ouvre une seule connexion par client)
 *  - PgBouncer en mode "transaction" mutualise les connexions entre N clients
 *  - Capacité totale : nb_clients × 1 conn (au lieu de nb_clients × 9)
 *
 * Le paramètre `pgbouncer=true` désactive prepared statements de Prisma
 * (incompatibles avec PgBouncer transaction mode). Performance impact
 * minime (~5%) pour gain pool énorme (10× plus de capacité).
 *
 * Côté code, rien à changer : Prisma lit DATABASE_URL et adapte automatiquement.
 *
 * Fast path : on définit `errorFormat: "minimal"` pour réduire la taille des
 * exceptions (utile si on les sérialise vers Sentry/Datadog).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Réduit la taille des stack traces dans les erreurs Prisma (perf logs).
    errorFormat: "minimal",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown : ferme le pool DB proprement quand le process s'arrête.
 * Évite les "connection refused" sporadiques pendant un déploiement rolling.
 */
if (process.env.NODE_ENV === "production") {
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, async () => {
      try {
        await prisma.$disconnect();
      } catch {
        /* ignore */
      }
    });
  }
}
