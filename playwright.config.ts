/**
 * Playwright config — tests E2E mobile-first BMD.
 * --------------------------------------------------------------
 * Tests des flows critiques sur viewport mobile par défaut (iPhone 13).
 *
 * Pour activer :
 *   1. `npm install -D @playwright/test --workspace-root`
 *   2. `npx playwright install chromium webkit`
 *   3. `npm run test:e2e` (cf. scripts/playwright.sh)
 *
 * Les tests assument que :
 *   - L'API tourne sur http://localhost:4000
 *   - Le web tourne sur http://localhost:3000
 * Soit lancer `npm run dev` en parallèle, soit utiliser `webServer` ci-dessous
 * pour que Playwright spawn les serveurs automatiquement.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT_WEB = process.env.PORT_WEB ? Number(process.env.PORT_WEB) : 3000;
const BASE_URL = `http://localhost:${PORT_WEB}`;

export default defineConfig({
  testDir: "./e2e",
  // V60 — Timeout par test : 90s. Next.js en mode dev compile à la demande,
  // et la 1re visite d'une route sur WebKit (iPhone 13 Playwright) peut
  // prendre 35-45s pour le 1er hit (sass + i18n + Stripe + recharts → bundle
  // initial costaud). 30s causait des timeouts sur "/", "/login", "/join/*".
  // En prod build, c'est < 2s donc on est très large pour le mode dev.
  timeout: 90_000,
  // Concurrence : limitée pour éviter de saturer la DB de test
  workers: process.env.CI ? 2 : 4,
  fullyParallel: true,
  // V60 — 1 retry local (la 1re tentative déclenche la compilation Next,
  // la 2e bénéficie du cache → quasi-instantanée et fiable).
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    // Trace activée à la 1ère retry pour debug
    trace: "on-first-retry",
    // Screenshot uniquement en cas d'échec
    screenshot: "only-on-failure",
    // Vidéo uniquement en cas d'échec
    video: "retain-on-failure",
    // Locale par défaut : fr (les tests vérifient les libellés FR)
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },

  projects: [
    {
      name: "iPhone 13",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "iPhone SE 3rd gen",
      use: { ...devices["iPhone SE (3rd gen)"] },
    },
    {
      name: "Pixel 5",
      use: { ...devices["Pixel 5"] },
    },
    // Desktop pour vérifier que les tests passent aussi en responsive
    {
      name: "Desktop Safari",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  // Auto-spawn des serveurs dev (commenter si tu les lances déjà manuellement)
  // webServer: [
  //   {
  //     command: "npm run dev --workspace=apps/web",
  //     url: BASE_URL,
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120_000,
  //   },
  //   {
  //     command: "npm run dev --workspace=apps/api",
  //     url: "http://localhost:4000/health",
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120_000,
  //   },
  // ],
});
