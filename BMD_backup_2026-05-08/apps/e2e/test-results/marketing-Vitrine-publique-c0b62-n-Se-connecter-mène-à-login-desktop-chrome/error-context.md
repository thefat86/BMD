# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketing.spec.ts >> Vitrine publique >> Le bouton 'Se connecter' mène à /login
- Location: tests/marketing.spec.ts:51:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: /se connecter|login|sign in/i }).first()

```

# Page snapshot

```yaml
- generic:
  - generic [active]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - navigation [ref=e6]:
            - button "previous" [disabled] [ref=e7]:
              - img "previous" [ref=e8]
            - generic [ref=e10]:
              - generic [ref=e11]: 1/
              - text: "1"
            - button "next" [disabled] [ref=e12]:
              - img "next" [ref=e13]
          - img
        - generic [ref=e15]:
          - link "Next.js 15.5.15 (outdated) Webpack" [ref=e16] [cursor=pointer]:
            - /url: https://nextjs.org/docs/messages/version-staleness
            - img [ref=e17]
            - generic "An outdated version detected (latest is 16.2.4), upgrade is highly recommended!" [ref=e19]: Next.js 15.5.15 (outdated)
            - generic [ref=e20]: Webpack
          - img
      - dialog "Build Error" [ref=e22]:
        - generic [ref=e25]:
          - generic [ref=e26]:
            - generic [ref=e27]:
              - generic [ref=e29]: Build Error
              - generic [ref=e30]:
                - button "Copy Error Info" [ref=e31] [cursor=pointer]:
                  - img [ref=e32]
                - link "Go to related documentation" [ref=e34] [cursor=pointer]:
                  - /url: https://nextjs.org/docs/messages/module-not-found
                  - img [ref=e35]
                - link "Learn more about enabling Node.js inspector for server code with Chrome DevTools" [ref=e37] [cursor=pointer]:
                  - /url: https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code
                  - img [ref=e38]
            - paragraph [ref=e47]: "Module not found: Can't resolve '@simplewebauthn/browser'"
          - generic [ref=e49]:
            - generic [ref=e51]:
              - img [ref=e53]
              - generic [ref=e56]: ./app/login/page.tsx (10:1)
              - button "Open in editor" [ref=e57] [cursor=pointer]:
                - img [ref=e59]
            - generic [ref=e62]:
              - generic [ref=e63]: Module not found
              - generic [ref=e64]: ": Can't resolve '"
              - text: "@simplewebauthn/browser"
              - generic [ref=e65]: "'"
              - generic [ref=e66]: 8 |
              - text: import
              - generic [ref=e67]: "{ rememberAppleState }"
              - text: from "../../lib/apple-sso";
              - generic [ref=e68]: 9 |
              - text: import
              - generic [ref=e69]: "{"
              - text: RateLimitScreen
              - generic [ref=e70]: "}"
              - text: from "../../lib/ui/rate-limit-screen"; >
              - generic [ref=e71]: 10 |
              - text: import
              - generic [ref=e72]: "{ startAuthentication }"
              - text: from "@simplewebauthn/browser";
              - generic [ref=e73]: "|"
              - text: ^
              - generic [ref=e74]: 11 |
              - generic [ref=e75]: 12 |
              - text: const PENDING_INVITE_KEY = "bmd_pending_invite_token";
              - generic [ref=e76]: 13 |
              - link "https://nextjs.org/docs/messages/module-not-found" [ref=e78] [cursor=pointer]:
                - /url: https://nextjs.org/docs/messages/module-not-found
        - generic [ref=e79]:
          - generic [ref=e80]: "1"
          - generic [ref=e81]: "2"
    - generic [ref=e86] [cursor=pointer]:
      - button "Open Next.js Dev Tools" [ref=e87]:
        - img [ref=e88]
      - button "Open issues overlay" [ref=e92]:
        - generic [ref=e93]:
          - generic [ref=e94]: "0"
          - generic [ref=e95]: "1"
        - generic [ref=e96]: Issue
  - alert [ref=e97]
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
     |                     ^ Error: locator.click: Test timeout of 30000ms exceeded.
  57 |     await expect(page).toHaveURL(/\/login/);
  58 |     // Logo BMD visible sur la page login
  59 |     await expect(page.locator("img[alt='BMD']").first()).toBeVisible();
  60 |   });
  61 | });
  62 | 
```