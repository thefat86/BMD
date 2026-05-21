/**
 * Helpers d'authentification pour les tests E2E.
 *
 * V50.1 — Mis à jour pour le login refondu (mai 2026) :
 *  - Le formulaire a maintenant un <select> "Méthode" (Téléphone / Email)
 *    qu'il faut basculer sur Email avant de saisir un email
 *  - L'input email est ciblé par `input[type="email"]` (robuste à i18n)
 *  - Le CTA s'appelle "Recevoir un code" (clé `auth.receiveCode`)
 *  - L'input OTP a `autocomplete="one-time-code"`
 *  - Le CTA validation est "✓ Me connecter" (clé `auth.signIn`)
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

  // Détecte si le contact est un email ou un téléphone.
  // BMD accepte les deux ; uniqueEmail() ci-dessous retourne toujours un email.
  const isEmail = /@/.test(contact);

  // Étape 0 : sélectionne la méthode dans le <select> "Méthode"
  // (le defaut est "PHONE" — on bascule sur "EMAIL" si nécessaire).
  // On cible le select via son `<label>` associé, sans dépendre de i18n.
  const methodSelect = page.locator("select").first();
  await methodSelect.waitFor({ state: "visible", timeout: 15_000 });
  await methodSelect.selectOption(isEmail ? "EMAIL" : "PHONE");

  // Étape 1 : saisie du contact.
  //  - email : input[type="email"]
  //  - phone : input[type="tel"]
  // Ces attributs sont stables, donc on évite les ennuis avec i18n.
  const contactField = page.locator(
    isEmail ? 'input[type="email"]' : 'input[type="tel"]',
  );
  // 10s au lieu de 5 : le tablet-ipad simulé met du temps à re-render
  // l'input après le selectOption (transition contactType state).
  await contactField.waitFor({ state: "visible", timeout: 10_000 });
  // En mode téléphone le champ est pré-rempli "+33" → on remplace.
  await contactField.fill(contact);

  // CTA "Recevoir un code" — i18n FR (locale Playwright est fr-FR).
  // On accepte plusieurs variantes pour rester compatible avec EN si besoin.
  await page
    .getByRole("button", { name: /recevoir un code|receive.*code|send code|envoyer/i })
    .click();

  // Étape 2 : récupère le code OTP via la route helper de dev.
  // L'input OTP a autocomplete="one-time-code" — selector stable.
  const otpField = page.locator('input[autocomplete="one-time-code"]');
  await otpField.waitFor({ state: "visible", timeout: 10_000 });

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

  // Saisie du code
  await otpField.fill(code);

  // Étape 3 (W1) : pour un user neuf, le formulaire affiche aussi un champ
  // prénom obligatoire (+ langue + devise avec defaults). Le backend rejette
  // l'inscription si le prénom est vide → on le remplit s'il est visible.
  // Pour un returning user (savedContact en localStorage), ce champ n'apparaît
  // pas et on saute directement à la validation.
  const firstNameField = page.locator(
    'input[autocomplete="given-name"]',
  );
  if (await firstNameField.isVisible().catch(() => false)) {
    await firstNameField.fill("E2E Tester");
  }

  // CTA "✓ Me connecter" — i18n FR ; on accepte aussi EN ("Sign in").
  await page
    .getByRole("button", {
      name: /me connecter|sign in|valider|verify/i,
    })
    .click();

  // Atterrissage dashboard (le routing peut passer par /onboarding pour
  // un user neuf — on accepte les deux chemins).
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
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
