import { buildServer } from "./server.js";
import { loadEnv } from "./lib/env.js";

async function start() {
  const env = loadEnv();
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 BMD API ready on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
