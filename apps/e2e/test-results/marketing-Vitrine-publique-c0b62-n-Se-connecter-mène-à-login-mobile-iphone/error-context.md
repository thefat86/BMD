# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketing.spec.ts >> Vitrine publique >> Le bouton 'Se connecter' mène à /login
- Location: tests/marketing.spec.ts:51:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: /se connecter|login|sign in/i }).first()
    - waiting for" http://localhost:3000/login" navigation to finish...
    - navigated to "http://localhost:3000/login"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
          - option "📞 Téléphone" [selected]
          - option "✉️ Email"
      - generic [ref=e31]:
        - generic [ref=e32]: Numéro de téléphone
        - textbox "+33 6 12 34 56 78" [ref=e33]: "+33"
      - button "Recevoir un code" [ref=e34] [cursor=pointer]
      - paragraph [ref=e35]: En mode dev, le code s'affiche dans la console du backend.
      - generic [ref=e36]: ou
      - link "⊞ Scanner le QR depuis l'app mobile" [ref=e39]:
        - /url: /login/qr
  - region "Notifications"
  - button "Open Next.js Dev Tools" [ref=e45] [cursor=pointer]:
    - img [ref=e46]
  - alert [ref=e51]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e52]:
    - generic [ref=e53]: DEV · 13:27:50
    - button "Force fresh (clear all caches and reload)" [ref=e54] [cursor=pointer]: 🧹
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * Tests E2E vitrine publique — pas besoin d'auth.
  5  |  *
  6  |  * Couvre :
  7  |  *  - La page d'accueil charge sans erreur sur desktop ET mobile
  8  |  *  - Le sticky header et le FX ticker bottom sont présents
  9  |  *  - Le sélecteur de langue switche les libellés
  10 |  *  - Le CTA principal mène vers /login
  11 |  */
  12 | 
  13 | test.describe("Vitrine publique", () => {
  14 |   test("Desktop : la page d'accueil charge avec sticky nav + ticker", async ({
  15 |     page,
  16 |     browserName,
  17 |   }, testInfo) => {
  18 |     // Skip mobile viewport ici — la vitrine bascule sur MobileWelcome
  19 |     test.skip(
  20 |       testInfo.project.name.startsWith("mobile"),
  21 |       "Mobile testé séparément",
  22 |     );
  23 | 
  24 |     await page.goto("/");
  25 |     // Logo BMD visible
  26 |     await expect(page.getByRole("link", { name: /BMD/i }).first()).toBeVisible();
  27 |     // Tarifs cliquable dans la nav
  28 |     await expect(page.getByRole("link", { name: /tarifs|pricing/i })).toBeVisible();
  29 |     // FX ticker présent en bas (peut être hors viewport — on vérifie l'existence)
  30 |     await expect(
  31 |       page.getByRole("complementary", { name: /taux de change/i }),
  32 |     ).toBeAttached();
  33 |   });
  34 | 
  35 |   test("Mobile : la home affiche le médaillon BMD + 2 CTA", async ({
  36 |     page,
  37 |   }, testInfo) => {
  38 |     test.skip(
  39 |       !testInfo.project.name.startsWith("mobile"),
  40 |       "Test spécifique mobile",
  41 |     );
  42 |     await page.goto("/");
  43 |     // Le gros logo BMD médaillon
  44 |     await expect(page.getByRole("link", { name: /accueil|home/i }).first()).toBeAttached();
  45 |     // CTA "Se connecter"
  46 |     await expect(
  47 |       page.getByRole("link", { name: /se connecter|login|sign in/i }).first(),
  48 |     ).toBeVisible();
  49 |   });
  50 | 
  51 |   test("Le bouton 'Se connecter' mène à /login", async ({ page }) => {
  52 |     await page.goto("/");
  53 |     const loginLink = page
  54 |       .getByRole("link", { name: /se connecter|login|sign in/i })
  55 |       .first();
> 56 |     await loginLink.click();
     |                     ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  57 |     await expect(page).toHaveURL(/\/login/);
  58 |     // Logo BMD visible sur la page login
  59 |     await expect(page.locator("img[alt='BMD']").first()).toBeVisible();
  60 |   });
  61 | });
  62 | 
```