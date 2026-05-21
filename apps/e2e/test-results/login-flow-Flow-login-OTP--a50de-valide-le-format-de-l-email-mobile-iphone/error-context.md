# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login-flow.spec.ts >> Flow login OTP >> Form de connexion : valide le format de l'email
- Location: tests/login-flow.spec.ts:33:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /recevoir un code|receive.*code|send code|envoyer/i })
    - locator resolved to <button disabled class="btn btn-block">Recevoir un code</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    19 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - generic [ref=e5]:
      - link "Retour à l'accueil" [ref=e7]:
        - /url: /
        - text: ← Accueil
      - link "BMD BMD· Back · Mes · Do L'argent partagé. L'amitié protégée." [ref=e8]:
        - /url: /
        - img "BMD" [ref=e10]
        - generic [ref=e11]: BMD·
        - generic [ref=e12]: Back · Mes · Do
        - generic [ref=e13]: L'argent partagé. L'amitié protégée.
    - generic [ref=e15]:
      - heading "Te connecter" [level=2] [ref=e16]
      - button "Se connecter avec Touch ID" [ref=e18] [cursor=pointer]:
        - img [ref=e20]
        - generic [ref=e24]: Clé de sécurité
      - generic [ref=e25]: Ou par code
      - generic [ref=e28]:
        - generic [ref=e29]: Méthode
        - combobox [ref=e30]:
          - option "📞 Téléphone"
          - option "✉️ Email" [selected]
      - generic [ref=e31]:
        - generic [ref=e32]: Adresse email
        - textbox "ton.email@exemple.com" [active] [ref=e33]: pas-un-email
      - generic [ref=e34]: "⚠ Format email invalide (ex: nom@exemple.com)"
      - button "Recevoir un code" [disabled] [ref=e35]
      - paragraph [ref=e36]: En mode dev, le code s'affiche dans la console du backend.
      - generic [ref=e37]: ou
      - link "⊞ Scanner le QR depuis l'app mobile" [ref=e40]:
        - /url: /login/qr
  - region "Notifications"
  - button "Open Next.js Dev Tools" [ref=e46] [cursor=pointer]:
    - img [ref=e47]
  - alert [ref=e52]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e53]:
    - generic [ref=e54]: DEV · 13:27:29
    - button "Force fresh (clear all caches and reload)" [ref=e55] [cursor=pointer]: 🧹
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { loginAs, uniqueEmail } from "../fixtures/auth";
  3  | 
  4  | /**
  5  |  * Tests E2E du flow de connexion OTP.
  6  |  *
  7  |  * V88.B — Refactorisé pour utiliser le helper `loginAs` (déjà robuste aux
  8  |  * noms FR/EN actuels du formulaire de login refondu V50.1/V52.D2). Avant,
  9  |  * ce fichier ré-implémentait le login en cherchant des selectors obsolètes
  10 |  * (placeholder `/email|téléphone|phone/`, bouton `/envoyer|send/i`, bouton
  11 |  * `/valider|verify/`). Les CTAs réels sont maintenant « Recevoir un code »
  12 |  * et « ✓ Me connecter ».
  13 |  *
  14 |  * Stratégie : on utilise le mode dev de l'API qui expose /auth/dev/last-otp
  15 |  * pour récupérer le code OTP envoyé. Cette route est gardée par
  16 |  * `NODE_ENV === "development"` côté serveur.
  17 |  */
  18 | 
  19 | test.describe("Flow login OTP", () => {
  20 |   test("Email : reçoit OTP, le saisit, atterrit sur dashboard", async ({
  21 |     page,
  22 |   }) => {
  23 |     // Le helper loginAs gère le flow complet (méthode → contact → OTP →
  24 |     // validation), avec une regex permissive sur les noms de boutons FR/EN.
  25 |     // Il termine quand /dashboard ou /onboarding est atteint.
  26 |     const email = uniqueEmail("login-flow");
  27 |     await loginAs(page, email);
  28 | 
  29 |     // Atterrit sur le dashboard (ou onboarding pour un user neuf)
  30 |     await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  31 |   });
  32 | 
  33 |   test("Form de connexion : valide le format de l'email", async ({ page }) => {
  34 |     await page.goto("/login");
  35 | 
  36 |     // Bascule sur la méthode EMAIL dans le <select> (default = PHONE)
  37 |     const methodSelect = page.locator("select").first();
  38 |     await methodSelect.waitFor({ state: "visible", timeout: 15_000 });
  39 |     await methodSelect.selectOption("EMAIL");
  40 | 
  41 |     // Tape une valeur invalide dans l'input email
  42 |     const emailField = page.locator('input[type="email"]');
  43 |     await emailField.waitFor({ state: "visible", timeout: 5_000 });
  44 |     await emailField.fill("pas-un-email");
  45 | 
  46 |     // Tente d'envoyer — bouton « Recevoir un code » (clé i18n auth.receiveCode)
  47 |     await page
  48 |       .getByRole("button", {
  49 |         name: /recevoir un code|receive.*code|send code|envoyer/i,
  50 |       })
> 51 |       .click();
     |        ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  52 | 
  53 |     // Une erreur s'affiche (soit validation client live, soit erreur serveur)
  54 |     await expect(
  55 |       page.locator(".error, [role='alert']").first(),
  56 |     ).toBeVisible({ timeout: 5_000 });
  57 |   });
  58 | });
  59 | 
```