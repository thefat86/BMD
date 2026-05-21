import { buildServer } from "./server.js";
import { loadEnv } from "./lib/env.js";
import { seedPlans } from "./lib/seed-plans.js";
import { seedCurrencies } from "./lib/seed-currencies.js";
import { seedLocales } from "./lib/seed-locales.js";
import { seedRegionsAndTiers } from "./lib/seed-regions.js";
import { startScheduler, stopScheduler } from "./lib/scheduler.js";

async function start() {
  const env = loadEnv();
  const app = await buildServer();
  // Seeds idempotents (n'écrasent pas les customisations admin)
  await seedPlans();
  await seedCurrencies();
  await seedLocales();
  // Régions tarifaires PPA + matrice prix régionalisés (spec §6.3)
  await seedRegionsAndTiers();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 BMD API ready on http://${env.HOST}:${env.PORT}`);
    // En dev, affiche aussi les IPs LAN pour test mobile facile.
    // L'utilisateur peut alors ouvrir http://<ip-lan>:3000 sur son
    // iPhone et l'app appellera automatiquement l'API sur la même IP.
    if (env.NODE_ENV === "development") {
      const os = await import("node:os");
      const nets = os.networkInterfaces();
      const lanIps: string[] = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] ?? []) {
          if (net.family === "IPv4" && !net.internal) {
            lanIps.push(net.address);
          }
        }
      }
      if (lanIps.length > 0) {
        // eslint-disable-next-line no-console
        console.log("");
        // eslint-disable-next-line no-console
        console.log("📱 Pour tester sur ton téléphone (même Wi-Fi) :");
        for (const ip of lanIps) {
          // eslint-disable-next-line no-console
          console.log(`   → Front : http://${ip}:3000`);
          // eslint-disable-next-line no-console
          console.log(`   → API  : http://${ip}:${env.PORT}`);
        }
        // eslint-disable-next-line no-console
        console.log("");
      }
    }
    // Lance les tâches planifiées (cron interne)
    startScheduler();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Arrêt propre — utile pour les redémarrages dev / SIGTERM en prod
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, async () => {
      // eslint-disable-next-line no-console
      console.log(`\n${sig} reçu, arrêt en cours…`);
      stopScheduler();
      await app.close();
      process.exit(0);
    });
  }
}

start();
