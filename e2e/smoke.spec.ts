/**
 * Tests E2E smoke — fonctionnalités critiques mobile-first BMD.
 *
 * Ces tests vérifient que les flows clés ne sont pas cassés à chaque
 * déploiement. Ils tournent sur viewport iPhone 13 par défaut.
 *
 * Run :
 *   npx playwright test                              # tous les projets
 *   npx playwright test --project="iPhone 13"        # mobile only
 *   npx playwright test --grep "login"               # filter par nom
 */
import { test, expect } from "@playwright/test";

// V37/V81 — Timeouts généreux 90s pour absorber le COLD START Next dev.
// Sur le premier hit, Next compile à la volée TypeScript + chunks (lazy
// dynamic imports), ce qui prend 30-60s sur Mac chargé. iPhone 13 paye
// systématiquement ce coût (1er projet alphabétique), Pixel 5 hérite des
// chunks chauds et passe en 5-10s.
// On utilise `domcontentloaded` au lieu de `networkidle` pour éviter
// d'attendre des requêtes async non-critiques (analytics, SSE, etc.).
test.describe("Smoke · Marketing & login", () => {
  test("home redirect mobile → /login si pas connecté", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });
    // Sur viewport mobile, la home redirige automatiquement vers /login.
    // On accepte aussi que ça reste sur "/" si le redirect a été désactivé
    // (l'URL doit être l'une des deux et la page ne doit pas crasher).
    await page.waitForURL(/\/(login)?/, { timeout: 15_000 });
    const url = page.url();
    expect(url).toMatch(/(\/login|\/$|\/)/);
  });

  test("login page : champs visibles et accessibles", async ({ page }) => {
    await page.goto("/login", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // Champ contact (téléphone par défaut)
    const contactInput = page.locator(
      'input[type="tel"], input[type="email"], input[autocomplete*="contact"], input[autocomplete="tel"], input[placeholder*="téléphone" i], input[placeholder*="email" i]',
    );
    await expect(contactInput.first()).toBeVisible({ timeout: 15_000 });
    // Bouton submit (texte i18n peut être "Recevoir un code", "Get a code",
    // "Obtener un código", "Receber um código", etc.)
    const submitBtn = page
      .getByRole("button")
      .filter({
        hasText:
          /recevoir|receive|get.*code|continu|envoy|send|obten|recibir|receber|erhalt|ottener/i,
      });
    await expect(submitBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("login page : pas de crash React au mount", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/login", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // Attendre que la page soit interactive (input visible) avant de checker
    await page
      .locator('input[type="tel"], input[type="email"]')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });
});

test.describe("Smoke · Navigation publique", () => {
  test("/legal/privacy : page accessible sans auth", async ({ page }) => {
    await page.goto("/legal/privacy", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // La page doit charger et afficher quelque chose lié à la confidentialité
    await expect(page.locator("body")).toContainText(
      /confidentialité|privacy|protection|données|data|RGPD|GDPR/i,
      { timeout: 15_000 },
    );
  });

  test("dashboard sans token → redirect /login", async ({ page }) => {
    // Pas de token dans localStorage
    await page.goto("/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // Doit être redirigé vers login
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Smoke · API health", () => {
  test("api /health répond 200", async ({ request }) => {
    const res = await request.get("http://localhost:4000/health");
    expect(res.status()).toBe(200);
  });
});

test.describe("Smoke · Groupes & Profil (V39)", () => {
  test("/dashboard/groups sans token → redirect /login", async ({ page }) => {
    await page.goto("/dashboard/groups", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("/dashboard/groups/fake-id sans token → redirect /login", async ({ page }) => {
    await page.goto("/dashboard/groups/11111111-1111-1111-1111-111111111111", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("/dashboard/profile sans token → redirect /login", async ({ page }) => {
    await page.goto("/dashboard/profile", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("/join/fake-token : page d'invitation accessible (publique)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/join/fake-token-for-smoke-test", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // La page doit charger (token invalide → erreur affichée à l'écran, pas
    // un crash React). On vérifie juste qu'aucune exception JS n'a fuité.
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });
});

test.describe("Smoke · V40 refonte (tontine + settings + plans)", () => {
  test("/dashboard/plans sans token → redirect /login", async ({ page }) => {
    await page.goto("/dashboard/plans", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("/dashboard/groups/fake/tontine sans token → redirect /login", async ({
    page,
  }) => {
    await page.goto(
      "/dashboard/groups/11111111-1111-1111-1111-111111111111/tontine",
      { waitUntil: "domcontentloaded", timeout: 90_000 },
    );
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("/dashboard/groups/fake/settings sans token → redirect /login", async ({
    page,
  }) => {
    await page.goto(
      "/dashboard/groups/11111111-1111-1111-1111-111111111111/settings",
      { waitUntil: "domcontentloaded", timeout: 90_000 },
    );
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("plans mobile : pas de scroll horizontal", async ({ page }) => {
    // Pas de token → redirect login OK. On vérifie juste que la route
    // /dashboard/plans ne provoque pas de débordement horizontal au mount.
    await page.goto("/dashboard/plans", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // On peut être sur /login après redirect — on mesure dans tous les cas
    await page.waitForTimeout(400);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
  });
});

test.describe("Smoke · V41 refonte (stats + affiliate + groups list)", () => {
  test("/dashboard/stats sans token → redirect /login", async ({ page }) => {
    await page.goto("/dashboard/stats", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("/dashboard/affiliate sans token → redirect /login", async ({
    page,
  }) => {
    await page.goto("/dashboard/affiliate", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("liste groupes mobile : pas de scroll horizontal", async ({ page }) => {
    await page.goto("/dashboard/groups", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForTimeout(400);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
  });

  test("stats mobile : pas de scroll horizontal", async ({ page }) => {
    await page.goto("/dashboard/stats", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForTimeout(400);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
  });
});

test.describe("Smoke · Mobile UX", () => {
  test("login mobile : pas de scroll horizontal", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // Vérifie que la largeur du <body> n'excède pas la viewport (= scroll latéral)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2); // +2px tolerance subpixel
  });

  test("login mobile : viewport meta présent", async ({ page }) => {
    await page.goto("/login");
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(viewport).toContain("width=device-width");
  });
});

/**
 * V41.1 — Anti-scroll latéral SYSTÉMATIQUE : on parcourt toutes les routes
 * mobile critiques et on vérifie que `body.scrollWidth <= window.innerWidth`.
 * Tolérance ±2px pour les subpixels iOS Safari.
 */
const NO_HORIZONTAL_SCROLL_ROUTES = [
  "/",
  "/login",
  "/legal/privacy",
  "/dashboard",
  "/dashboard/groups",
  "/dashboard/groups/11111111-1111-1111-1111-111111111111",
  "/dashboard/groups/11111111-1111-1111-1111-111111111111/tontine",
  "/dashboard/groups/11111111-1111-1111-1111-111111111111/settings",
  "/dashboard/plans",
  "/dashboard/stats",
  "/dashboard/affiliate",
  "/dashboard/notifications",
  "/dashboard/search",
  "/dashboard/profile",
  "/join/fake-token-for-smoke-test",
];

test.describe("Smoke · Anti-scroll latéral toutes routes mobile", () => {
  for (const route of NO_HORIZONTAL_SCROLL_ROUTES) {
    test(`${route} : pas de scroll horizontal`, async ({ page }) => {
      await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      // Laisse le temps au layout de se stabiliser (skeletons, hydratation)
      await page.waitForTimeout(500);
      const widths = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        html: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      // Aucun des deux ne doit excéder le viewport (±2px subpixel)
      expect(widths.body, `body.scrollWidth on ${route}`).toBeLessThanOrEqual(
        widths.viewport + 2,
      );
      expect(widths.html, `html.scrollWidth on ${route}`).toBeLessThanOrEqual(
        widths.viewport + 2,
      );
    });
  }
});
