import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";

/**
 * Tests de la page /dashboard/profile.
 *
 * V88.C2 — Refondu pour matcher la nouvelle UI mobile-first (V74) :
 *  - Sections en tiles cliquables ouvrant des panels accordéon
 *  - SectionHeader rend maintenant un `<h2>` (V88.C2)
 *  - Les sous-sections (passkeys, sécurité) ne s'affichent que dans le panel
 *    correspondant (pas en init)
 *  - Le bouton Logout est en bas, peut être derrière le tile « Sécurité »
 *
 * On teste donc :
 *  - Le hero profil + le label « Sécurité » est visible (h2 SectionHeader)
 *  - On peut atteindre PasskeyManager via la tile « Sécurité »
 *  - Le logout fonctionne et déconnecte vraiment
 */

test.describe("Page profil", () => {
  test("Toutes les sections principales sont visibles", async ({ page }) => {
    const email = uniqueEmail("profilee");
    await loginAs(page, email);

    await page.goto("/dashboard/profile");

    // Au moins le titre du h2 « Sécurité » (SectionHeader V88.C2)
    await expect(
      page.getByRole("heading", { name: /sécurité/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Au moins une tile « Confidentialité » ou « Plan » visible
    // (les sections sont sous forme de MobileTile)
    await expect(
      page.getByText(/confidentialité|RGPD/i).first(),
    ).toBeVisible();

    // Au moins une mention du plan (PlanBlock affiche le plan code)
    await expect(
      page.getByText(/free|premium|découverte|personnel|famille|pro/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Logout redirige vers /login", async ({ page }) => {
    const email = uniqueEmail("logout-tester");
    await loginAs(page, email);

    await page.goto("/dashboard/profile");

    // Configure dialog auto-accept (le logout passe par dialog.confirm)
    page.on("dialog", (dialog) => dialog.accept());

    // Le bouton Logout existe et fonctionne. Peut être directement visible
    // (footer mini mobile) ou derrière une tile « Sécurité » à ouvrir.
    const logoutBtn = page
      .getByRole("button", {
        name: /déconnect|sign\s*out|me déconnecter|logout/i,
      })
      .first();

    // Si pas immédiatement visible, ouvre la tile sécurité
    if (!(await logoutBtn.isVisible().catch(() => false))) {
      const securityTile = page
        .locator("button", { hasText: /sécurité/i })
        .first();
      if (await securityTile.isVisible().catch(() => false)) {
        await securityTile.click();
      }
    }
    await expect(logoutBtn).toBeVisible({ timeout: 5_000 });

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

  test("PasskeyManager : section accessible via tile sécurité", async ({
    page,
  }) => {
    const email = uniqueEmail("passkey-checker");
    await loginAs(page, email);

    await page.goto("/dashboard/profile");

    // Le PasskeyManager est rendu dans le panel « Sécurité ». La tile
    // « Sécurité » ouvre ce panel — on l'ouvre pour accéder au heading
    // « 🔐 Passkeys » qui est rendu par PasskeyManager.
    const securityTile = page
      .locator("button", { hasText: /sécurité/i })
      .first();
    if (await securityTile.isVisible().catch(() => false)) {
      await securityTile.click();
    }

    // Le heading PasskeyManager doit être visible après ouverture
    const passkeyHeading = page.getByRole("heading", { name: /passkeys/i });
    await expect(passkeyHeading.first()).toBeVisible({ timeout: 5_000 });
  });
});
