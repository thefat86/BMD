# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: create-group.spec.ts >> Flow création de groupe >> Crée un groupe VOYAGE et vérifie le type sur la page de détail
- Location: tests/create-group.spec.ts:98:3

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
  1  | /**
  2  |  * Helpers d'authentification pour les tests E2E.
  3  |  *
  4  |  * Le flow OTP de BMD impose 2 étapes : email/téléphone → code 6 chiffres.
  5  |  * En dev, l'API expose `/auth/dev/last-otp` (réservée à NODE_ENV === "development")
  6  |  * qui retourne le dernier code envoyé pour un contact donné. Cette route est 404
  7  |  * silencieusement en prod.
  8  |  *
  9  |  * Usage :
  10 |  *   import { loginAs } from "../fixtures/auth";
  11 |  *   test("…", async ({ page }) => {
  12 |  *     await loginAs(page, "alice@bmd-e2e.local");
  13 |  *     // … test continue avec session active
  14 |  *   });
  15 |  *
  16 |  * Le helper retourne la page une fois /dashboard atteint (auth réussie).
  17 |  */
  18 | import type { Page } from "@playwright/test";
  19 | 
  20 | const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";
  21 | 
  22 | export async function loginAs(page: Page, contact: string): Promise<void> {
  23 |   await page.goto("/login");
  24 | 
  25 |   // Étape 1 : saisie du contact (email ou téléphone)
  26 |   const contactField = page.getByPlaceholder(/email|téléphone|phone/i).first();
> 27 |   await contactField.fill(contact);
     |                      ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  28 |   await page.getByRole("button", { name: /envoyer|send/i }).click();
  29 | 
  30 |   // Attend l'étape "code"
  31 |   await page
  32 |     .getByPlaceholder(/code|otp/i)
  33 |     .first()
  34 |     .waitFor({ state: "visible", timeout: 10_000 });
  35 | 
  36 |   // Étape 2 : récupère le code OTP via la route helper de dev
  37 |   const otpResp = await page.request.get(
  38 |     `${API_BASE}/auth/dev/last-otp?contact=${encodeURIComponent(contact)}`,
  39 |   );
  40 |   if (!otpResp.ok()) {
  41 |     throw new Error(
  42 |       `Impossible de récupérer l'OTP pour ${contact} (status=${otpResp.status()}). ` +
  43 |         `Vérifie que l'API tourne en NODE_ENV=development.`,
  44 |     );
  45 |   }
  46 |   const { code } = (await otpResp.json()) as { code?: string };
  47 |   if (!code || !/^\d{6}$/.test(code)) {
  48 |     throw new Error(`OTP invalide reçu : ${JSON.stringify(code)}`);
  49 |   }
  50 | 
  51 |   // Saisie du code + validation
  52 |   await page.getByPlaceholder(/code|otp/i).first().fill(code);
  53 |   await page.getByRole("button", { name: /valider|verify/i }).click();
  54 | 
  55 |   // Atterrissage dashboard
  56 |   await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  57 | }
  58 | 
  59 | /**
  60 |  * Génère un email de test unique (timestamp + random) pour éviter les
  61 |  * collisions entre runs ou entre workers parallèles.
  62 |  */
  63 | export function uniqueEmail(prefix = "e2e"): string {
  64 |   const ts = Date.now().toString(36);
  65 |   const rnd = Math.random().toString(36).slice(2, 6);
  66 |   return `${prefix}-${ts}-${rnd}@bmd-e2e.local`;
  67 | }
  68 | 
```