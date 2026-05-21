# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: profile.spec.ts >> Page profil >> Logout redirige vers /login
- Location: tests/profile.spec.ts:44:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
    - /url: "#main-content"
  - main [ref=e5]:
    - generic [ref=e8]:
      - region "Installer BMD sur l'écran d'accueil" [ref=e9]:
        - generic [ref=e10]:
          - heading "Active les notifications BMD" [level=2] [ref=e11]:
            - generic [ref=e12]: 📲
            - text: Active les notifications BMD
          - button "Fermer" [ref=e13] [cursor=pointer]: ✕
        - paragraph [ref=e14]: Sur iPhone, les notifications push (nouvelle dépense, rappel cotisation, paiement reçu) ne marchent que si BMD est installé sur ton écran d'accueil. C'est aussi plus rapide à ouvrir et tu auras une vraie app sans la barre Safari.
        - list [ref=e15]:
          - listitem [ref=e16]:
            - text: Tape sur le bouton
            - strong [ref=e17]: Partager
            - img [ref=e19]
            - text: en bas de Safari.
          - listitem [ref=e22]:
            - text: Choisis
            - strong [ref=e23]: « Sur l'écran d'accueil »
            - text: .
          - listitem [ref=e24]:
            - text: Touche
            - strong [ref=e25]: « Ajouter »
            - text: en haut à droite.
          - listitem [ref=e26]: Lance BMD depuis ton écran d'accueil et active les notifs dans ton profil.
        - paragraph [ref=e27]: 💡 Compatible iOS 16.4 et plus. iCloud Keychain garde ton passkey Face ID synchronisé entre tous tes appareils Apple.
      - link "Mon forfait Découverte Gratuit Perso dès 3.99 €/mois Upgrade →" [ref=e28]:
        - /url: /dashboard/plans
        - generic [ref=e29]:
          - img [ref=e31]
          - generic [ref=e33]:
            - generic [ref=e34]: Mon forfait
            - generic [ref=e35]: Découverte
          - generic [ref=e37]: Gratuit
          - generic [ref=e38]: ›
        - generic [ref=e39]:
          - generic [ref=e40]:
            - img [ref=e41]
            - strong [ref=e43]: Perso
            - generic [ref=e44]: dès 3.99 €/mois
          - generic [ref=e45]: Upgrade →
      - generic [ref=e46]:
        - generic [ref=e47]:
          - generic [ref=e48]:
            - heading "Sécurité" [level=2] [ref=e49]
            - generic [ref=e51]: Passkeys, 2FA, sessions
          - generic [ref=e52]:
            - button "Sécurité Passkeys, 2FA, sessions actives" [ref=e53] [cursor=pointer]:
              - generic [ref=e54]:
                - img [ref=e56]
                - img [ref=e60]
              - generic [ref=e62]:
                - generic [ref=e63]: Sécurité
                - generic [ref=e64]: Passkeys, 2FA, sessions actives
            - button "Données et confidentialité Export RGPD, droit à l'oubli" [ref=e65] [cursor=pointer]:
              - generic [ref=e66]:
                - img [ref=e68]
                - img [ref=e72]
              - generic [ref=e74]:
                - generic [ref=e75]: Données et confidentialité
                - generic [ref=e76]: Export RGPD, droit à l'oubli
        - generic [ref=e77]:
          - generic [ref=e78]:
            - heading "Préférences" [level=2] [ref=e79]
            - generic [ref=e81]: Devise, langue, notifications
          - generic [ref=e82]:
            - button "Préférences EUR · FR" [ref=e83] [cursor=pointer]:
              - generic [ref=e84]:
                - img [ref=e86]
                - img [ref=e90]
              - generic [ref=e92]:
                - generic [ref=e93]: Préférences
                - generic [ref=e94]: EUR · FR
            - button "Notifications Push web et alertes" [ref=e95] [cursor=pointer]:
              - generic [ref=e96]:
                - img [ref=e98]
                - img [ref=e102]
              - generic [ref=e104]:
                - generic [ref=e105]: Notifications
                - generic [ref=e106]: Push web et alertes
        - generic [ref=e107]:
          - generic [ref=e108]:
            - heading "Mon compte" [level=2] [ref=e109]
            - generic [ref=e111]: Identité, contacts, paiements
          - generic [ref=e112]:
            - button "Mon compte E2E Tester" [ref=e113] [cursor=pointer]:
              - generic [ref=e114]:
                - img [ref=e116]
                - img [ref=e120]
              - generic [ref=e122]:
                - generic [ref=e123]: Mon compte
                - generic [ref=e124]: E2E Tester
            - button "Contacts 1 vérifié" [ref=e125] [cursor=pointer]:
              - generic [ref=e126]:
                - img [ref=e128]
                - img [ref=e132]
              - generic [ref=e134]:
                - generic [ref=e135]: Contacts
                - generic [ref=e136]: 1 vérifié
            - button "Moyens de paiement Mobile Money, IBAN, comptes en ligne" [ref=e137] [cursor=pointer]:
              - generic [ref=e138]:
                - img [ref=e140]
                - img [ref=e144]
              - generic [ref=e146]:
                - generic [ref=e147]: Moyens de paiement
                - generic [ref=e148]: Mobile Money, IBAN, comptes en ligne
            - button "Avantages Codes promo et parrainage" [ref=e149] [cursor=pointer]:
              - generic [ref=e150]:
                - img [ref=e152]
                - img [ref=e156]
              - generic [ref=e158]:
                - generic [ref=e159]: Avantages
                - generic [ref=e160]: Codes promo et parrainage
      - generic [ref=e161]:
        - generic [ref=e162]:
          - heading "Session" [level=2] [ref=e163]
          - generic [ref=e165]: Déconnexion
        - button "🚪 Se déconnecter de BMD" [ref=e166] [cursor=pointer]:
          - img [ref=e167]
          - generic [ref=e170]: 🚪 Se déconnecter de BMD
        - generic [ref=e171]:
          - link "🛡️ Politique de confidentialité" [ref=e172]:
            - /url: /legal/privacy
            - img [ref=e173]
            - text: 🛡️ Politique de confidentialité
          - generic [ref=e175]: BMD · v0.1.0
  - dialog [ref=e176]:
    - generic [ref=e180]:
      - generic [ref=e181]:
        - generic [ref=e182]: ⚠️
        - heading "Déconnexion" [level=3] [ref=e184]
      - paragraph [ref=e185]: Es-tu sûr·e de vouloir te déconnecter ? Tu devras te reconnecter avec ton téléphone ou email.
      - generic [ref=e186]:
        - button "Annuler" [active] [ref=e187] [cursor=pointer]
        - button "Se déconnecter" [ref=e188] [cursor=pointer]
  - region "Notifications"
  - generic [ref=e193] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e194]:
      - img [ref=e195]
    - generic [ref=e200]:
      - button "Open issues overlay" [ref=e201]:
        - generic [ref=e202]:
          - generic [ref=e203]: "0"
          - generic [ref=e204]: "1"
        - generic [ref=e205]: Issue
      - button "Collapse issues badge" [ref=e206]:
        - img [ref=e207]
  - alert [ref=e209]
  - generic [ref=e211]:
    - link "Retour au tableau de bord" [ref=e212]:
      - /url: /dashboard
      - img [ref=e213]
    - button "Changer la photo de profil" [ref=e215] [cursor=pointer]:
      - generic [ref=e217]: E
      - img [ref=e219]
    - generic [ref=e222]:
      - generic [ref=e223]: E2E Tester
      - generic [ref=e224]: EUR · FR
    - link "FREE" [ref=e225]:
      - /url: /dashboard/plans
      - generic [ref=e226]: FREE
    - generic [ref=e227]:
      - generic [ref=e228]:
        - generic [ref=e229]: "0"
        - generic [ref=e230]: Groupes
      - generic [ref=e231]:
        - generic [ref=e232]: "0"
        - generic [ref=e233]: Tontines
      - generic [ref=e234]:
        - generic [ref=e235]: "0"
        - generic [ref=e236]: Dépenses
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e237]:
    - generic [ref=e238]: DEV · 13:27:59
    - button "Force fresh (clear all caches and reload)" [ref=e239] [cursor=pointer]: 🧹
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { loginAs, uniqueEmail } from "../fixtures/auth";
  3   | 
  4   | /**
  5   |  * Tests de la page /dashboard/profile.
  6   |  *
  7   |  * V88.C2 — Refondu pour matcher la nouvelle UI mobile-first (V74) :
  8   |  *  - Sections en tiles cliquables ouvrant des panels accordéon
  9   |  *  - SectionHeader rend maintenant un `<h2>` (V88.C2)
  10  |  *  - Les sous-sections (passkeys, sécurité) ne s'affichent que dans le panel
  11  |  *    correspondant (pas en init)
  12  |  *  - Le bouton Logout est en bas, peut être derrière le tile « Sécurité »
  13  |  *
  14  |  * On teste donc :
  15  |  *  - Le hero profil + le label « Sécurité » est visible (h2 SectionHeader)
  16  |  *  - On peut atteindre PasskeyManager via la tile « Sécurité »
  17  |  *  - Le logout fonctionne et déconnecte vraiment
  18  |  */
  19  | 
  20  | test.describe("Page profil", () => {
  21  |   test("Toutes les sections principales sont visibles", async ({ page }) => {
  22  |     const email = uniqueEmail("profilee");
  23  |     await loginAs(page, email);
  24  | 
  25  |     await page.goto("/dashboard/profile");
  26  | 
  27  |     // Au moins le titre du h2 « Sécurité » (SectionHeader V88.C2)
  28  |     await expect(
  29  |       page.getByRole("heading", { name: /sécurité/i }).first(),
  30  |     ).toBeVisible({ timeout: 10_000 });
  31  | 
  32  |     // Au moins une tile « Confidentialité » ou « Plan » visible
  33  |     // (les sections sont sous forme de MobileTile)
  34  |     await expect(
  35  |       page.getByText(/confidentialité|RGPD/i).first(),
  36  |     ).toBeVisible();
  37  | 
  38  |     // Au moins une mention du plan (PlanBlock affiche le plan code)
  39  |     await expect(
  40  |       page.getByText(/free|premium|découverte|personnel|famille|pro/i).first(),
  41  |     ).toBeVisible({ timeout: 5_000 });
  42  |   });
  43  | 
  44  |   test("Logout redirige vers /login", async ({ page }) => {
  45  |     const email = uniqueEmail("logout-tester");
  46  |     await loginAs(page, email);
  47  | 
  48  |     await page.goto("/dashboard/profile");
  49  | 
  50  |     // Configure dialog auto-accept (le logout passe par dialog.confirm)
  51  |     page.on("dialog", (dialog) => dialog.accept());
  52  | 
  53  |     // Le bouton Logout existe et fonctionne. Peut être directement visible
  54  |     // (footer mini mobile) ou derrière une tile « Sécurité » à ouvrir.
  55  |     const logoutBtn = page
  56  |       .getByRole("button", {
  57  |         name: /déconnect|sign\s*out|me déconnecter|logout/i,
  58  |       })
  59  |       .first();
  60  | 
  61  |     // Si pas immédiatement visible, ouvre la tile sécurité
  62  |     if (!(await logoutBtn.isVisible().catch(() => false))) {
  63  |       const securityTile = page
  64  |         .locator("button", { hasText: /sécurité/i })
  65  |         .first();
  66  |       if (await securityTile.isVisible().catch(() => false)) {
  67  |         await securityTile.click();
  68  |       }
  69  |     }
  70  |     await expect(logoutBtn).toBeVisible({ timeout: 5_000 });
  71  | 
  72  |     await logoutBtn.click();
  73  | 
  74  |     // Confirme dans le dialog si présent (custom dialog provider)
  75  |     const confirmBtn = page.getByRole("button", {
  76  |       name: /confirmer|déconnecter|^oui$/i,
  77  |     });
  78  |     if (await confirmBtn.isVisible().catch(() => false)) {
  79  |       await confirmBtn.click();
  80  |     }
  81  | 
  82  |     // Atterrit sur /login (ou /)
> 83  |     await page.waitForURL(/\/(login|)$/, { timeout: 10_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  84  | 
  85  |     // Token effacé du localStorage
  86  |     const tokenAfter = await page.evaluate(() =>
  87  |       window.localStorage.getItem("bmd_token"),
  88  |     );
  89  |     expect(tokenAfter).toBeNull();
  90  |   });
  91  | 
  92  |   test("PasskeyManager : section accessible via tile sécurité", async ({
  93  |     page,
  94  |   }) => {
  95  |     const email = uniqueEmail("passkey-checker");
  96  |     await loginAs(page, email);
  97  | 
  98  |     await page.goto("/dashboard/profile");
  99  | 
  100 |     // Le PasskeyManager est rendu dans le panel « Sécurité ». La tile
  101 |     // « Sécurité » ouvre ce panel — on l'ouvre pour accéder au heading
  102 |     // « 🔐 Passkeys » qui est rendu par PasskeyManager.
  103 |     const securityTile = page
  104 |       .locator("button", { hasText: /sécurité/i })
  105 |       .first();
  106 |     if (await securityTile.isVisible().catch(() => false)) {
  107 |       await securityTile.click();
  108 |     }
  109 | 
  110 |     // Le heading PasskeyManager doit être visible après ouverture
  111 |     const passkeyHeading = page.getByRole("heading", { name: /passkeys/i });
  112 |     await expect(passkeyHeading.first()).toBeVisible({ timeout: 5_000 });
  113 |   });
  114 | });
  115 | 
```