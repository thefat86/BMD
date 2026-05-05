import { buildServer } from "./server.js";
import { loadEnv } from "./lib/env.js";
import { seedPlans } from "./lib/seed-plans.js";

async function start() {
  const env = loadEnv();
  const app = await buildServer();
  // Seed des plans tarifaires (idempotent — n'écrase pas les limites custom)
  await seedPlans();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 BMD API ready on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
