/**
 * Helpers d'authentification pour les tests E2E.
 *
 * Le flow OTP de BMD impose 2 étapes : email/téléphone → code 6 chiffres.
 * En dev, l'API expose `/auth/dev/last-otp` (réservée à NODE_ENV === "development")
 * qui retourne le dernier code envoyé pour un contact donné. Cette route est 404
 * silencieusement en prod.
 *
 * Usage :
 *   import { loginAs } from "../fixtures/auth";
 *   test("…", async ({ page }) => {
 *     await loginAs(page, "alice@bmd-e2e.local");
 *     // … test continue avec session active
 *   });
 *
 * Le helper retourne la page une fois /dashboard atteint (auth réussie).
 */
import type { Page } from "@playwright/test";

const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";

export async function loginAs(page: Page, contact: string): Promise<void> {
  await page.goto("/login");

  // Étape 1 : saisie du contact (email ou téléphone)
  const contactField = page.getByPlaceholder(/email|téléphone|phone/i).first();
  await contactField.fill(contact);
  await page.getByRole("button", { name: /envoyer|send/i }).click();

  // Attend l'étape "code"
  await page
    .getByPlaceholder(/code|otp/i)
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });

  // Étape 2 : récupère le code OTP via la route helper de dev
  const otpResp = await page.request.get(
    `${API_BASE}/auth/dev/last-otp?contact=${encodeURIComponent(contact)}`,
  );
  if (!otpResp.ok()) {
    throw new Error(
      `Impossible de récupérer l'OTP pour ${contact} (status=${otpResp.status()}). ` +
        `Vérifie que l'API tourne en NODE_ENV=development.`,
    );
  }
  const { code } = (await otpResp.json()) as { code?: string };
  if (!code || !/^\d{6}$/.test(code)) {
    throw new Error(`OTP invalide reçu : ${JSON.stringify(code)}`);
  }

  // Saisie du code + validation
  await page.getByPlaceholder(/code|otp/i).first().fill(code);
  await page.getByRole("button", { name: /valider|verify/i }).click();

  // Atterrissage dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

/**
 * Génère un email de test unique (timestamp + random) pour éviter les
 * collisions entre runs ou entre workers parallèles.
 */
export function uniqueEmail(prefix = "e2e"): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rnd}@bmd-e2e.local`;
}
