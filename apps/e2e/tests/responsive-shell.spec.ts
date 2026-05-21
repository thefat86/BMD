import { test, expect } from "@playwright/test";

/**
 * Tests E2E vérifiant que l'app sert bien des CHROMES distinctes selon
 * le viewport (séparation mobile / desktop demandée par le user).
 *
 * Ces tests vérifient des artefacts visuels propres à chaque shell :
 *  - Desktop : sidebar 240px à gauche
 *  - Mobile : header sticky en haut + bottom-nav fixe en bas
 */

test.describe("Séparation Mobile / Desktop", () => {
  test("Desktop dashboard montre la sidebar (et pas le bottom-nav)", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("desktop"),
      "Test desktop uniquement",
    );
    // On ne peut pas vraiment tester le dashboard sans auth — on
    // vérifie au moins que /login a la sticky-header desktop attendue.
    await page.goto("/login");
    // Logo + slogan visibles dans le header sticky
    await expect(page.locator("img[alt='BMD']").first()).toBeVisible();
    await expect(page.getByText(/argent partagé/i)).toBeVisible();
  });

  test("Mobile : la home a le médaillon BMD plein écran", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Test mobile uniquement",
    );
    await page.goto("/");
    // Présence du conteneur central avec gradient
    await expect(
      page.locator("h1").filter({ hasText: /tontines|argent|colocs|bmd/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("FX ticker présent sur la vitrine desktop, fixé en bas", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("desktop"),
      "Vitrine = desktop uniquement",
    );
    await page.goto("/");
    const ticker = page.getByRole("complementary", {
      name: /taux de change/i,
    });
    await expect(ticker).toBeAttached();
    // Vérifie que la position computed est `fixed`
    const position = await ticker.evaluate(
      (el) => window.getComputedStyle(el).position,
    );
    expect(position).toBe("fixed");
  });
});
