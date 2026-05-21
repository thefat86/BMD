import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";

/**
 * Tests E2E du flow de connexion OTP.
 *
 * V88.B — Refactorisé pour utiliser le helper `loginAs` (déjà robuste aux
 * noms FR/EN actuels du formulaire de login refondu V50.1/V52.D2). Avant,
 * ce fichier ré-implémentait le login en cherchant des selectors obsolètes
 * (placeholder `/email|téléphone|phone/`, bouton `/envoyer|send/i`, bouton
 * `/valider|verify/`). Les CTAs réels sont maintenant « Recevoir un code »
 * et « ✓ Me connecter ».
 *
 * Stratégie : on utilise le mode dev de l'API qui expose /auth/dev/last-otp
 * pour récupérer le code OTP envoyé. Cette route est gardée par
 * `NODE_ENV === "development"` côté serveur.
 */

test.describe("Flow login OTP", () => {
  test("Email : reçoit OTP, le saisit, atterrit sur dashboard", async ({
    page,
  }) => {
    // Le helper loginAs gère le flow complet (méthode → contact → OTP →
    // validation), avec une regex permissive sur les noms de boutons FR/EN.
    // Il termine quand /dashboard ou /onboarding est atteint.
    const email = uniqueEmail("login-flow");
    await loginAs(page, email);

    // Atterrit sur le dashboard (ou onboarding pour un user neuf)
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  });

  test("Form de connexion : valide le format de l'email", async ({ page }) => {
    await page.goto("/login");

    // Bascule sur la méthode EMAIL dans le <select> (default = PHONE)
    const methodSelect = page.locator("select").first();
    await methodSelect.waitFor({ state: "visible", timeout: 15_000 });
    await methodSelect.selectOption("EMAIL");

    // Tape une valeur invalide dans l'input email
    const emailField = page.locator('input[type="email"]');
    await emailField.waitFor({ state: "visible", timeout: 5_000 });
    await emailField.fill("pas-un-email");

    // Tente d'envoyer — bouton « Recevoir un code » (clé i18n auth.receiveCode)
    await page
      .getByRole("button", {
        name: /recevoir un code|receive.*code|send code|envoyer/i,
      })
      .click();

    // Une erreur s'affiche (soit validation client live, soit erreur serveur)
    await expect(
      page.locator(".error, [role='alert']").first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
