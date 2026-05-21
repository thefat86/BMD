# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v45-features.spec.ts >> V45 features — smoke tests runtime >> Page /dashboard/search mobile-native rend sans erreur (input search visible)
- Location: tests/v45-features.spec.ts:184:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
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
      - heading "Saisir le code" [level=2] [ref=e16]
      - paragraph [ref=e17]:
        - text: Code envoyé à
        - strong [ref=e18]: v52-search-mp5enmge-vlum@bmd-e2e.local
      - generic [ref=e19]:
        - generic [ref=e20]:
          - text: Code à 6 chiffres
          - button "Code à 6 chiffres" [ref=e21] [cursor=pointer]: 🙈 Masquer
        - textbox "123456" [ref=e22]: "677035"
      - generic [ref=e23]:
        - generic [ref=e24]: Ton prénom (1ère connexion uniquement)
        - textbox "Aïcha" [ref=e25]: E2E Tester
        - paragraph [ref=e26]: Si tu te connectes pour la première fois, choisis aussi ta langue et ta devise de base. Tu pourras toujours les changer ensuite depuis ton profil.
      - generic [ref=e27]:
        - generic [ref=e28]:
          - text: 🌍 Langue
          - button "Changer de langue" [ref=e30] [cursor=pointer]: 🇫🇷 Français ▾
        - generic [ref=e31]:
          - text: 💱 Devise
          - combobox "💱 Devise" [ref=e32]:
            - option "🇪🇺 EUR · Euro" [selected]
            - option "🇺🇸 USD · Dollar US"
            - option "🇬🇧 GBP · Livre sterling"
            - option "🇨🇭 CHF · Franc suisse"
            - option "🇨🇦 CAD · Dollar canadien"
            - option "🇦🇺 AUD · Dollar australien"
            - option "🇨🇳 CNY · Yuan"
            - option "🇨🇲 XAF · Franc CFA BEAC"
            - option "🇸🇳 XOF · Franc CFA BCEAO"
            - option "🇲🇦 MAD · Dirham marocain"
            - option "🇹🇳 TND · Dinar tunisien"
            - option "🇩🇿 DZD · Dinar algérien"
            - option "🇪🇬 EGP · Livre égyptienne"
            - option "🇳🇬 NGN · Naira"
            - option "🇬🇭 GHS · Cedi"
            - option "🇰🇪 KES · Shilling kényan"
            - option "🇹🇿 TZS · Shilling tanzanien"
            - option "🇺🇬 UGX · Shilling ougandais"
            - option "🇷🇼 RWF · Franc rwandais"
            - option "🇪🇹 ETB · Birr"
            - option "🇨🇩 CDF · Franc congolais"
            - option "🇿🇦 ZAR · Rand"
      - button "✓ Me connecter" [ref=e33] [cursor=pointer]
      - button "← Modifier le contact" [ref=e34] [cursor=pointer]
  - region "Notifications"
  - button "Open Next.js Dev Tools" [ref=e40] [cursor=pointer]:
    - img [ref=e41]
  - alert [ref=e46]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e47]:
    - generic [ref=e48]: DEV · 13:28:40
    - button "Force fresh (clear all caches and reload)" [ref=e49] [cursor=pointer]: 🧹
```

# Test source

```ts
  6   |  *    qu'il faut basculer sur Email avant de saisir un email
  7   |  *  - L'input email est ciblé par `input[type="email"]` (robuste à i18n)
  8   |  *  - Le CTA s'appelle "Recevoir un code" (clé `auth.receiveCode`)
  9   |  *  - L'input OTP a `autocomplete="one-time-code"`
  10  |  *  - Le CTA validation est "✓ Me connecter" (clé `auth.signIn`)
  11  |  *
  12  |  * Le flow OTP de BMD impose 2 étapes : email/téléphone → code 6 chiffres.
  13  |  * En dev, l'API expose `/auth/dev/last-otp` (réservée à NODE_ENV === "development")
  14  |  * qui retourne le dernier code envoyé pour un contact donné. Cette route est 404
  15  |  * silencieusement en prod.
  16  |  *
  17  |  * Usage :
  18  |  *   import { loginAs } from "../fixtures/auth";
  19  |  *   test("…", async ({ page }) => {
  20  |  *     await loginAs(page, "alice@bmd-e2e.local");
  21  |  *     // … test continue avec session active
  22  |  *   });
  23  |  *
  24  |  * Le helper retourne la page une fois /dashboard atteint (auth réussie).
  25  |  */
  26  | import type { Page } from "@playwright/test";
  27  | 
  28  | const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";
  29  | 
  30  | export async function loginAs(page: Page, contact: string): Promise<void> {
  31  |   await page.goto("/login");
  32  | 
  33  |   // Détecte si le contact est un email ou un téléphone.
  34  |   // BMD accepte les deux ; uniqueEmail() ci-dessous retourne toujours un email.
  35  |   const isEmail = /@/.test(contact);
  36  | 
  37  |   // Étape 0 : sélectionne la méthode dans le <select> "Méthode"
  38  |   // (le defaut est "PHONE" — on bascule sur "EMAIL" si nécessaire).
  39  |   // On cible le select via son `<label>` associé, sans dépendre de i18n.
  40  |   const methodSelect = page.locator("select").first();
  41  |   await methodSelect.waitFor({ state: "visible", timeout: 15_000 });
  42  |   await methodSelect.selectOption(isEmail ? "EMAIL" : "PHONE");
  43  | 
  44  |   // Étape 1 : saisie du contact.
  45  |   //  - email : input[type="email"]
  46  |   //  - phone : input[type="tel"]
  47  |   // Ces attributs sont stables, donc on évite les ennuis avec i18n.
  48  |   const contactField = page.locator(
  49  |     isEmail ? 'input[type="email"]' : 'input[type="tel"]',
  50  |   );
  51  |   // 10s au lieu de 5 : le tablet-ipad simulé met du temps à re-render
  52  |   // l'input après le selectOption (transition contactType state).
  53  |   await contactField.waitFor({ state: "visible", timeout: 10_000 });
  54  |   // En mode téléphone le champ est pré-rempli "+33" → on remplace.
  55  |   await contactField.fill(contact);
  56  | 
  57  |   // CTA "Recevoir un code" — i18n FR (locale Playwright est fr-FR).
  58  |   // On accepte plusieurs variantes pour rester compatible avec EN si besoin.
  59  |   await page
  60  |     .getByRole("button", { name: /recevoir un code|receive.*code|send code|envoyer/i })
  61  |     .click();
  62  | 
  63  |   // Étape 2 : récupère le code OTP via la route helper de dev.
  64  |   // L'input OTP a autocomplete="one-time-code" — selector stable.
  65  |   const otpField = page.locator('input[autocomplete="one-time-code"]');
  66  |   await otpField.waitFor({ state: "visible", timeout: 10_000 });
  67  | 
  68  |   const otpResp = await page.request.get(
  69  |     `${API_BASE}/auth/dev/last-otp?contact=${encodeURIComponent(contact)}`,
  70  |   );
  71  |   if (!otpResp.ok()) {
  72  |     throw new Error(
  73  |       `Impossible de récupérer l'OTP pour ${contact} (status=${otpResp.status()}). ` +
  74  |         `Vérifie que l'API tourne en NODE_ENV=development.`,
  75  |     );
  76  |   }
  77  |   const { code } = (await otpResp.json()) as { code?: string };
  78  |   if (!code || !/^\d{6}$/.test(code)) {
  79  |     throw new Error(`OTP invalide reçu : ${JSON.stringify(code)}`);
  80  |   }
  81  | 
  82  |   // Saisie du code
  83  |   await otpField.fill(code);
  84  | 
  85  |   // Étape 3 (W1) : pour un user neuf, le formulaire affiche aussi un champ
  86  |   // prénom obligatoire (+ langue + devise avec defaults). Le backend rejette
  87  |   // l'inscription si le prénom est vide → on le remplit s'il est visible.
  88  |   // Pour un returning user (savedContact en localStorage), ce champ n'apparaît
  89  |   // pas et on saute directement à la validation.
  90  |   const firstNameField = page.locator(
  91  |     'input[autocomplete="given-name"]',
  92  |   );
  93  |   if (await firstNameField.isVisible().catch(() => false)) {
  94  |     await firstNameField.fill("E2E Tester");
  95  |   }
  96  | 
  97  |   // CTA "✓ Me connecter" — i18n FR ; on accepte aussi EN ("Sign in").
  98  |   await page
  99  |     .getByRole("button", {
  100 |       name: /me connecter|sign in|valider|verify/i,
  101 |     })
  102 |     .click();
  103 | 
  104 |   // Atterrissage dashboard (le routing peut passer par /onboarding pour
  105 |   // un user neuf — on accepte les deux chemins).
> 106 |   await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
      |              ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  107 | }
  108 | 
  109 | /**
  110 |  * Génère un email de test unique (timestamp + random) pour éviter les
  111 |  * collisions entre runs ou entre workers parallèles.
  112 |  */
  113 | export function uniqueEmail(prefix = "e2e"): string {
  114 |   const ts = Date.now().toString(36);
  115 |   const rnd = Math.random().toString(36).slice(2, 6);
  116 |   return `${prefix}-${ts}-${rnd}@bmd-e2e.local`;
  117 | }
  118 | 
```