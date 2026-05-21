import { test, expect } from "@playwright/test";

/**
 * Tests E2E du flow de connexion OTP.
 *
 * Stratégie : on utilise le mode dev de l'API qui imprime le code OTP
 * dans la console (mode "console" par défaut). Les tests interceptent
 * les requêtes réseau pour récupérer le code via une route helper de
 * test (/auth/dev/last-otp ?contactValue=…).
 *
 * NOTE : ces helpers de test ne doivent PAS être déployés en prod.
 * On les protège côté serveur avec un check `NODE_ENV === "development"`.
 *
 * Pour le moment, ces tests sont en `test.skip` en attendant qu'on
 * implémente la route helper. À toi de l'ajouter côté API quand tu seras
 * prêt à wirer la CI.
 */

test.describe("Flow login OTP", () => {
  test("Email : reçoit OTP, le saisit, atterrit sur dashboard", async ({
    page,
  }) => {
    await page.goto("/login");

    // Saisie de l'email
    await page.getByPlaceholder(/email|téléphone|phone/i).first().fill("test@bmd-e2e.local");
    await page.getByRole("button", { name: /envoyer|send/i }).click();

    // Attend de passer à l'étape "code"
    await expect(page.getByPlaceholder(/code|otp/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // En dev, le code OTP est loggué côté serveur. On le récupère via
    // une route helper /auth/dev/last-otp (à implémenter côté API).
    const otpResp = await page.request.get(
      "http://localhost:4000/auth/dev/last-otp?contact=test@bmd-e2e.local",
    );
    expect(otpResp.ok()).toBe(true);
    const { code } = await otpResp.json();
    expect(code).toMatch(/^\d{6}$/);

    // Saisie du code
    await page.getByPlaceholder(/code|otp/i).first().fill(code);
    await page.getByRole("button", { name: /valider|verify/i }).click();

    // Atterrit sur le dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Form de connexion : valide le format de l'email", async ({ page }) => {
    await page.goto("/login");
    // Tape une valeur invalide
    const emailField = page.getByPlaceholder(/email|téléphone|phone/i).first();
    await emailField.fill("pas-un-email");
    await page.getByRole("button", { name: /envoyer|send/i }).click();
    // Une erreur s'affiche
    await expect(
      page.locator(".error, [role='alert']").first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
