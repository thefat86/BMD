# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive-shell.spec.ts >> Séparation Mobile / Desktop >> Mobile : la home a le médaillon BMD plein écran
- Location: tests/responsive-shell.spec.ts:28:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h1').filter({ hasText: /tontines|argent|colocs|bmd/i })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('h1').filter({ hasText: /tontines|argent|colocs|bmd/i })

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
    - generic [ref=e53]: DEV · 13:28:05
    - button "Force fresh (clear all caches and reload)" [ref=e54] [cursor=pointer]: 🧹
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * Tests E2E vérifiant que l'app sert bien des CHROMES distinctes selon
  5  |  * le viewport (séparation mobile / desktop demandée par le user).
  6  |  *
  7  |  * Ces tests vérifient des artefacts visuels propres à chaque shell :
  8  |  *  - Desktop : sidebar 240px à gauche
  9  |  *  - Mobile : header sticky en haut + bottom-nav fixe en bas
  10 |  */
  11 | 
  12 | test.describe("Séparation Mobile / Desktop", () => {
  13 |   test("Desktop dashboard montre la sidebar (et pas le bottom-nav)", async ({
  14 |     page,
  15 |   }, testInfo) => {
  16 |     test.skip(
  17 |       !testInfo.project.name.startsWith("desktop"),
  18 |       "Test desktop uniquement",
  19 |     );
  20 |     // On ne peut pas vraiment tester le dashboard sans auth — on
  21 |     // vérifie au moins que /login a la sticky-header desktop attendue.
  22 |     await page.goto("/login");
  23 |     // Logo + slogan visibles dans le header sticky
  24 |     await expect(page.locator("img[alt='BMD']").first()).toBeVisible();
  25 |     await expect(page.getByText(/argent partagé/i)).toBeVisible();
  26 |   });
  27 | 
  28 |   test("Mobile : la home a le médaillon BMD plein écran", async ({
  29 |     page,
  30 |   }, testInfo) => {
  31 |     test.skip(
  32 |       !testInfo.project.name.startsWith("mobile"),
  33 |       "Test mobile uniquement",
  34 |     );
  35 |     await page.goto("/");
  36 |     // Présence du conteneur central avec gradient
  37 |     await expect(
  38 |       page.locator("h1").filter({ hasText: /tontines|argent|colocs|bmd/i }),
> 39 |     ).toBeVisible({ timeout: 10_000 });
     |       ^ Error: expect(locator).toBeVisible() failed
  40 |   });
  41 | 
  42 |   test("FX ticker présent sur la vitrine desktop, fixé en bas", async ({
  43 |     page,
  44 |   }, testInfo) => {
  45 |     test.skip(
  46 |       !testInfo.project.name.startsWith("desktop"),
  47 |       "Vitrine = desktop uniquement",
  48 |     );
  49 |     await page.goto("/");
  50 |     const ticker = page.getByRole("complementary", {
  51 |       name: /taux de change/i,
  52 |     });
  53 |     await expect(ticker).toBeAttached();
  54 |     // Vérifie que la position computed est `fixed`
  55 |     const position = await ticker.evaluate(
  56 |       (el) => window.getComputedStyle(el).position,
  57 |     );
  58 |     expect(position).toBe("fixed");
  59 |   });
  60 | });
  61 | 
```