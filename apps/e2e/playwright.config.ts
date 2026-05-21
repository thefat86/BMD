import { defineConfig, devices } from "@playwright/test";

/**
 * Configuration Playwright pour les tests E2E BMD.
 *
 * On teste sur 3 viewports représentatifs :
 *  - Desktop Chrome (1280×720) → vue web standard
 *  - iPhone 13 (390×844) → vue mobile native
 *  - iPad (768×1024) → vue tablet (charnière entre les deux)
 *
 * Les tests démarrent automatiquement les serveurs API + web (webServer)
 * en attendant qu'ils soient prêts. Ils se ferment proprement à la fin.
 *
 * Pour lancer en local :
 *   pnpm --filter @bmd/e2e install:browsers   # 1ère fois uniquement
 *   pnpm --filter @bmd/e2e test
 *   pnpm --filter @bmd/e2e test:ui             # interface visuelle
 *
 * En CI : `playwright test --reporter=github` (variable d'env).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : [["html"], ["list"]],

  // V52.B12 — Timeouts élargis pour tolérer le cold start Next.js dev
  // mode. Quand une route comme /dashboard/plans n'est pas pré-compilée
  // et qu'on a beaucoup de composants V45 (split-donut, scan-frame,
  // numpad-keypad), la 1ère compilation peut prendre 30+ secondes.
  // Les goto suivants sont rapides (bundle en cache).
  timeout: 60_000, // 30→60s par test
  expect: { timeout: 10_000 }, // 5→10s pour les assertions toBeVisible etc.

  use: {
    baseURL: process.env.BMD_E2E_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    navigationTimeout: 45_000, // 30→45s pour page.goto + click qui déclenchent une nav
    actionTimeout: 10_000, // 5→10s pour click / fill / etc.
  },

  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "tablet-ipad",
      use: { ...devices["iPad (gen 7)"] },
    },
  ],

  // Démarre l'API + le frontend Next pendant la durée des tests
  // (commenté par défaut — décommente quand tu auras `npm run dev:all`
  // qui démarre tout d'un coup, OU configure tes deux webServers ici).
  //
  // webServer: [
  //   {
  //     command: "npm run dev --workspace=@bmd/api",
  //     url: "http://localhost:4000/health",
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120_000,
  //   },
  //   {
  //     command: "npm run dev --workspace=@bmd/web",
  //     url: "http://localhost:3000",
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120_000,
  //   },
  // ],
});
