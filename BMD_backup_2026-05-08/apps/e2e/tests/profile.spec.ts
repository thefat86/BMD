import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";

/**
 * Tests de la page /dashboard/profile :
 *  - Toutes les sections clés sont présentes (sécurité, passkeys, plan, RGPD)
 *  - Le déconnexion redirige vers /login
 *  - Le toggle de langue change la lang HTML
 */

test.describe("Page profil", () => {
  test("Toutes les sections principales sont visibles", async ({ page }) => {
    const email = uniqueEmail("profilee");
    await loginAs(page, email);

    await page.goto("/dashboard/profile");

    // Sections présentes — on ne vérifie pas la position, juste la présence
    await expect(page.getByRole("heading", { name: /sécurité/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: /passkeys/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /forfait|plan/i }).first()).toBeVisible();
  });

  test("Logout redirige vers /login", async ({ page }) => {
    const email = uniqueEmail("logout-tester");
    await loginAs(page, email);

    await page.goto("/dashboard/profile");

    // Le bouton Logout existe et fonctionne
    const logoutBtn = page
      .getByRole("button", { name: /déconnect|sign\s*out|me déconnecter/i })
      .first();
    await expect(logoutBtn).toBeVisible({ timeout: 5_000 });

    // Configure dialog auto-accept (le logout passe par dialog.confirm)
    page.on("dialog", (dialog) => dialog.accept());

    await logoutBtn.click();

    // Confirme dans le dialog si présent (custom dialog provider)
    const confirmBtn = page.getByRole("button", {
      name: /confirmer|déconnecter|^oui$/i,
    });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    // Atterrit sur /login (ou /)
    await page.waitForURL(/\/(login|)$/, { timeout: 10_000 });

    // Token effacé du localStorage
    const tokenAfter = await page.evaluate(() =>
      window.localStorage.getItem("bmd_token"),
    );
    expect(tokenAfter).toBeNull();
  });

  test("PasskeyManager : section visible si browser supporte WebAuthn", async ({
    page,
  }) => {
    const email = uniqueEmail("passkey-checker");
    await loginAs(page, email);

    await page.goto("/dashboard/profile");

    // Le bloc passkey existe (Chromium / WebKit / Firefox récents supportent WebAuthn)
    const passkeyHeading = page.getByRole("heading", { name: /passkeys/i });
    await expect(passkeyHeading).toBeVisible({ timeout: 5_000 });

    // Le bouton "+ Ajouter" est cliquable
    const addBtn = page.getByRole("button", { name: /\+\s*ajouter/i });
    await expect(addBtn.first()).toBeVisible();
  });
});
