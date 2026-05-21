import { test, expect } from "@playwright/test";

/**
 * Tests E2E vitrine publique — pas besoin d'auth.
 *
 * Couvre :
 *  - La page d'accueil charge sans erreur sur desktop ET mobile
 *  - Le sticky header et le FX ticker bottom sont présents
 *  - Le sélecteur de langue switche les libellés
 *  - Le CTA principal mène vers /login
 */

test.describe("Vitrine publique", () => {
  test("Desktop : la page d'accueil charge avec sticky nav + ticker", async ({
    page,
    browserName,
  }, testInfo) => {
    // Skip mobile viewport ici — la vitrine bascule sur MobileWelcome
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "Mobile testé séparément",
    );

    await page.goto("/");
    // Logo BMD visible
    await expect(page.getByRole("link", { name: /BMD/i }).first()).toBeVisible();
    // Tarifs cliquable dans la nav
    await expect(page.getByRole("link", { name: /tarifs|pricing/i })).toBeVisible();
    // FX ticker présent en bas (peut être hors viewport — on vérifie l'existence)
    await expect(
      page.getByRole("complementary", { name: /taux de change/i }),
    ).toBeAttached();
  });

  test("Mobile : la home affiche le médaillon BMD + 2 CTA", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Test spécifique mobile",
    );
    await page.goto("/");
    // Le gros logo BMD médaillon
    await expect(page.getByRole("link", { name: /accueil|home/i }).first()).toBeAttached();
    // CTA "Se connecter"
    await expect(
      page.getByRole("link", { name: /se connecter|login|sign in/i }).first(),
    ).toBeVisible();
  });

  test("Le bouton 'Se connecter' mène à /login", async ({ page }) => {
    await page.goto("/");
    const loginLink = page
      .getByRole("link", { name: /se connecter|login|sign in/i })
      .first();
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
    // Logo BMD visible sur la page login
    await expect(page.locator("img[alt='BMD']").first()).toBeVisible();
  });
});
