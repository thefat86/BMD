# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive-shell.spec.ts >> Séparation Mobile / Desktop >> Desktop dashboard montre la sidebar (et pas le bottom-nav)
- Location: tests/responsive-shell.spec.ts:13:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('img[alt=\'BMD\']').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('img[alt=\'BMD\']').first()

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
> 24 |     await expect(page.locator("img[alt='BMD']").first()).toBeVisible();
     |                                                          ^ Error: expect(locator).toBeVisible() failed
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
  39 |     ).toBeVisible({ timeout: 10_000 });
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