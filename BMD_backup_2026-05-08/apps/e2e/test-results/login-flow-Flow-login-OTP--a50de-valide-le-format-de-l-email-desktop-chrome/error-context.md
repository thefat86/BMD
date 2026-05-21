# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login-flow.spec.ts >> Flow login OTP >> Form de connexion : valide le format de l'email
- Location: tests/login-flow.spec.ts:51:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/email|téléphone|phone/i).first()

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
  4  |  * Tests E2E du flow de connexion OTP.
  5  |  *
  6  |  * Stratégie : on utilise le mode dev de l'API qui imprime le code OTP
  7  |  * dans la console (mode "console" par défaut). Les tests interceptent
  8  |  * les requêtes réseau pour récupérer le code via une route helper de
  9  |  * test (/auth/dev/last-otp ?contactValue=…).
  10 |  *
  11 |  * NOTE : ces helpers de test ne doivent PAS être déployés en prod.
  12 |  * On les protège côté serveur avec un check `NODE_ENV === "development"`.
  13 |  *
  14 |  * Pour le moment, ces tests sont en `test.skip` en attendant qu'on
  15 |  * implémente la route helper. À toi de l'ajouter côté API quand tu seras
  16 |  * prêt à wirer la CI.
  17 |  */
  18 | 
  19 | test.describe("Flow login OTP", () => {
  20 |   test("Email : reçoit OTP, le saisit, atterrit sur dashboard", async ({
  21 |     page,
  22 |   }) => {
  23 |     await page.goto("/login");
  24 | 
  25 |     // Saisie de l'email
  26 |     await page.getByPlaceholder(/email|téléphone|phone/i).first().fill("test@bmd-e2e.local");
  27 |     await page.getByRole("button", { name: /envoyer|send/i }).click();
  28 | 
  29 |     // Attend de passer à l'étape "code"
  30 |     await expect(page.getByPlaceholder(/code|otp/i).first()).toBeVisible({
  31 |       timeout: 10_000,
  32 |     });
  33 | 
  34 |     // En dev, le code OTP est loggué côté serveur. On le récupère via
  35 |     // une route helper /auth/dev/last-otp (à implémenter côté API).
  36 |     const otpResp = await page.request.get(
  37 |       "http://localhost:4000/auth/dev/last-otp?contact=test@bmd-e2e.local",
  38 |     );
  39 |     expect(otpResp.ok()).toBe(true);
  40 |     const { code } = await otpResp.json();
  41 |     expect(code).toMatch(/^\d{6}$/);
  42 | 
  43 |     // Saisie du code
  44 |     await page.getByPlaceholder(/code|otp/i).first().fill(code);
  45 |     await page.getByRole("button", { name: /valider|verify/i }).click();
  46 | 
  47 |     // Atterrit sur le dashboard
  48 |     await expect(page).toHaveURL(/\/dashboard/);
  49 |   });
  50 | 
  51 |   test("Form de connexion : valide le format de l'email", async ({ page }) => {
  52 |     await page.goto("/login");
  53 |     // Tape une valeur invalide
  54 |     const emailField = page.getByPlaceholder(/email|téléphone|phone/i).first();
> 55 |     await emailField.fill("pas-un-email");
     |                      ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  56 |     await page.getByRole("button", { name: /envoyer|send/i }).click();
  57 |     // Une erreur s'affiche
  58 |     await expect(
  59 |       page.locator(".error, [role='alert']").first(),
  60 |     ).toBeVisible({ timeout: 5000 });
  61 |   });
  62 | });
  63 | 
```