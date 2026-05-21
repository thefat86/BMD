# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: profile.spec.ts >> Page profil >> Logout redirige vers /login
- Location: tests/profile.spec.ts:44:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /déconnect|sign\s*out|me déconnecter|logout/i }).first()
    - locator resolved to <button type="button">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    9 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - link "BMD Back Mes Do" [ref=e6]:
        - /url: /dashboard
        - generic [ref=e7]:
          - generic [ref=e8]: BMD
          - generic [ref=e9]: Back Mes Do
      - link "Tableau de bord" [ref=e11]:
        - /url: /dashboard
        - generic [ref=e12]: 🏠
        - generic [ref=e13]: Tableau de bord
      - generic [ref=e14]:
        - generic [ref=e15]: Groupes
        - link "Groupes" [ref=e16]:
          - /url: /dashboard
          - generic [ref=e17]: 👥
          - generic [ref=e18]: Groupes
        - link "Statistiques" [ref=e19]:
          - /url: /dashboard/stats
          - generic [ref=e20]: 📊
          - generic [ref=e21]: Statistiques
      - generic [ref=e22]:
        - generic [ref=e23]: Mon profil
        - link "Mon profil" [ref=e24]:
          - /url: /dashboard/profile
          - generic [ref=e25]: 👤
          - generic [ref=e26]: Mon profil
        - link "Mon forfait" [ref=e27]:
          - /url: /dashboard/plans
          - generic [ref=e28]: ✨
          - generic [ref=e29]: Mon forfait
        - link "Espace commercial" [ref=e30]:
          - /url: /dashboard/affiliate
          - generic [ref=e31]: 🤝
          - generic [ref=e32]: Espace commercial
      - button "🚪 Se déconnecter" [ref=e34] [cursor=pointer]:
        - generic [ref=e35]: 🚪
        - text: Se déconnecter
    - generic [ref=e36]:
      - banner [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Mon compte
          - heading "Mon profil" [level=1] [ref=e40]
          - paragraph [ref=e41]: Compte et préférences
        - generic [ref=e42]:
          - link "Notifications" [ref=e43]:
            - /url: /dashboard/profile
            - img [ref=e44]
          - link "E" [ref=e46]:
            - /url: /dashboard/profile
      - main [ref=e47]:
        - generic [ref=e49]:
          - generic [ref=e50]:
            - generic [ref=e51]:
              - heading "Identité" [level=2] [ref=e52]
              - button "✎ Modifier" [ref=e53] [cursor=pointer]
            - generic [ref=e54]:
              - generic [ref=e55]:
                - generic [ref=e56]: E
                - generic [ref=e57]:
                  - generic [ref=e58]: E2E Tester
                  - generic [ref=e59]: Nom affiché aux autres membres
              - generic [ref=e60]:
                - img [ref=e62]
                - generic [ref=e67]:
                  - generic [ref=e68]: EUR
                  - generic [ref=e69]: Devise par défaut
              - generic [ref=e70]:
                - img [ref=e72]
                - generic [ref=e75]:
                  - generic [ref=e76]: 🇫🇷 Français
                  - generic [ref=e77]: Langue préférée
          - generic [ref=e78]:
            - generic [ref=e79]:
              - heading "📞 Contacts vérifiés" [level=2] [ref=e80]
              - generic [ref=e81]: "1"
            - generic [ref=e83]:
              - img [ref=e85]
              - generic [ref=e88]:
                - generic [ref=e89]:
                  - text: logout-tester-mp5es45d-m8gr@bmd-e2e.local
                  - generic [ref=e90]: ★ Principal
                - generic [ref=e91]: ✓ Vérifié · 14 mai 26
              - button "Supprimer" [ref=e92] [cursor=pointer]:
                - img [ref=e93]
            - button "＋ Ajouter un contact" [ref=e96] [cursor=pointer]
          - generic [ref=e97]:
            - heading "Sécurité" [level=2] [ref=e99]:
              - img [ref=e100]
              - text: Sécurité
            - button "↩ Me déconnecter" [ref=e103] [cursor=pointer]
            - paragraph [ref=e104]: Pour supprimer ton compte, écris à privacy@backmesdo.com
          - generic [ref=e105]:
            - heading "📜 Légal & vie privée" [level=2] [ref=e107]
            - link "🛡️ Politique de confidentialité" [ref=e108]:
              - /url: /legal/privacy
            - paragraph [ref=e109]: BMD respecte le RGPD. Tes données ne sont ni vendues, ni partagées. Tu peux les exporter ou les supprimer à tout moment.
          - region "Installer BMD sur l'écran d'accueil" [ref=e110]:
            - generic [ref=e111]:
              - heading "Active les notifications BMD" [level=2] [ref=e112]:
                - generic [ref=e113]: 📲
                - text: Active les notifications BMD
              - button "Fermer" [ref=e114] [cursor=pointer]: ✕
            - paragraph [ref=e115]: Sur iPhone, les notifications push (nouvelle dépense, rappel cotisation, paiement reçu) ne marchent que si BMD est installé sur ton écran d'accueil. C'est aussi plus rapide à ouvrir et tu auras une vraie app sans la barre Safari.
            - list [ref=e116]:
              - listitem [ref=e117]:
                - text: Tape sur le bouton
                - strong [ref=e118]: Partager
                - img [ref=e120]
                - text: en bas de Safari.
              - listitem [ref=e123]:
                - text: Choisis
                - strong [ref=e124]: « Sur l'écran d'accueil »
                - text: .
              - listitem [ref=e125]:
                - text: Touche
                - strong [ref=e126]: « Ajouter »
                - text: en haut à droite.
              - listitem [ref=e127]: Lance BMD depuis ton écran d'accueil et active les notifs dans ton profil.
            - paragraph [ref=e128]: 💡 Compatible iOS 16.4 et plus. iCloud Keychain garde ton passkey Face ID synchronisé entre tous tes appareils Apple.
          - generic [ref=e129]:
            - generic [ref=e130]:
              - img [ref=e132]
              - generic [ref=e134]:
                - generic [ref=e135]: Mon forfait
                - generic [ref=e136]: Découverte
                - generic [ref=e137]: Pour démarrer · 2 groupes, 8 membres, 3 scans IA / mois
            - list [ref=e138]:
              - listitem [ref=e139]:
                - img [ref=e140]
                - generic [ref=e145]: 2 groupes
              - listitem [ref=e146]:
                - img [ref=e147]
                - generic [ref=e150]: 8 membres/groupe
              - listitem [ref=e151]:
                - img [ref=e152]
                - generic [ref=e155]: 5 scans/mois
            - generic [ref=e156]:
              - generic [ref=e157]:
                - img [ref=e158]
                - strong [ref=e160]: Débloquer plus de fonctionnalités ?
                - text: Passe à un forfait supérieur — annulable à tout moment.
              - generic [ref=e161]:
                - link "Passer en Perso →" [ref=e162]:
                  - /url: /dashboard/plans?upgrade=PERSONAL
                - link "Passer en Famille →" [ref=e163]:
                  - /url: /dashboard/plans?upgrade=FAMILY
                - link "Passer en Pro →" [ref=e164]:
                  - /url: /dashboard/plans?upgrade=PRO
                - link "Passer en Perso à vie →" [ref=e165]:
                  - /url: /dashboard/plans?upgrade=LIFETIME_PERSONAL
                - link "Comparer tous les forfaits" [ref=e166]:
                  - /url: /dashboard/plans
          - generic [ref=e167]:
            - generic [ref=e168]:
              - heading "🔐 Passkeys" [level=2] [ref=e169]
              - button "+ Ajouter" [ref=e170] [cursor=pointer]
            - paragraph [ref=e171]: Connecte-toi sans code OTP grâce à ton empreinte ou Face ID. La clé privée reste sur ton appareil — BMD ne voit que la clé publique.
            - generic [ref=e172]:
              - generic [ref=e173]: 🔑
              - text: Aucun passkey pour l'instant. Touche « + Ajouter » pour commencer — c'est plus rapide qu'un code OTP.
          - generic [ref=e174]:
            - generic [ref=e175]:
              - heading "🔐 Authentification 2 facteurs" [level=2] [ref=e176]
              - generic [ref=e177]: ○ INACTIVE
            - paragraph [ref=e178]: Une seconde couche de sécurité avec ton app authenticator (Google Authenticator, Authy, 1Password, Bitwarden…). Recommandé pour les comptes Premium et Communauté.
            - generic [ref=e179]:
              - strong [ref=e180]: 📱 Tu as besoin d'une app d'authentification
              - paragraph [ref=e181]: "Avant d'activer la 2FA, installe une de ces apps gratuites sur ton téléphone :"
              - list [ref=e182]:
                - listitem [ref=e183]:
                  - strong [ref=e184]: Google Authenticator
                  - link "iOS" [ref=e185]:
                    - /url: https://apps.apple.com/app/google-authenticator/id388497605
                  - text: ·
                  - link "Android" [ref=e186]:
                    - /url: https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2
                - listitem [ref=e187]:
                  - strong [ref=e188]: Authy
                  - text: ·
                  - strong [ref=e189]: 1Password
                  - text: ·
                  - strong [ref=e190]: Bitwarden
                  - text: (autres options)
              - paragraph [ref=e191]: 💡 Ces apps génèrent un code à 6 chiffres qui change toutes les 30 secondes. C'est ce code qui te servira à te connecter.
            - button "🔐 J'ai mon app — activer la 2FA" [ref=e192] [cursor=pointer]
          - button "🔓 Sessions actives 1" [ref=e194] [cursor=pointer]:
            - heading "🔓 Sessions actives" [level=2] [ref=e195]
            - generic [ref=e196]: "1"
            - generic [ref=e197]: ▸
          - generic [ref=e198]:
            - heading "📲 📲 Notifications push" [level=2] [ref=e199]
            - paragraph [ref=e200]: Reçois les rappels de tontine, paiements et résumés hebdo directement sur ton appareil — même quand l'onglet est fermé.
            - paragraph [ref=e201]: ⚠️ Ton navigateur ne supporte pas les notifications push web.
          - generic [ref=e202]:
            - heading "Mes moyens de paiement" [level=2] [ref=e203]:
              - img [ref=e204]
              - generic [ref=e206]: Mes moyens de paiement
            - paragraph [ref=e207]: Sauvegarde tes numéros de Mobile Money, IBAN ou comptes en ligne pour les retrouver rapidement lors des règlements. Tout est chiffré (AES-256-GCM) — seul toi peux voir la valeur en clair.
            - button "＋ Ajouter un moyen de paiement" [ref=e208] [cursor=pointer]
          - generic [ref=e209]:
            - generic [ref=e210]:
              - heading "🎁 Mon parrainage" [level=2] [ref=e211]
              - generic [ref=e212]: 0 actif
            - generic [ref=e213]:
              - generic [ref=e214]: Mon code
              - generic [ref=e215]: REF-E33CLA
              - generic [ref=e216]: http://localhost:3000/login?ref=REF-E33CLA
            - generic [ref=e217]:
              - button "WhatsApp" [ref=e218] [cursor=pointer]:
                - generic [ref=e219]: 💬
                - text: WhatsApp
              - button "SMS" [ref=e220] [cursor=pointer]:
                - generic [ref=e221]: 📱
                - text: SMS
              - button "Email" [ref=e222] [cursor=pointer]:
                - generic [ref=e223]: ✉
                - text: Email
              - button "Copier" [ref=e224] [cursor=pointer]:
                - generic [ref=e225]: 🔗
                - text: Copier
              - button "Partager" [ref=e226] [cursor=pointer]:
                - generic [ref=e227]: 📲
                - text: Partager
            - generic [ref=e228]:
              - generic [ref=e229]:
                - generic [ref=e230]: Filleuls
                - generic [ref=e231]: "0"
              - generic [ref=e232]:
                - generic [ref=e233]: Filleuls actifs
                - generic [ref=e234]: "0"
              - generic [ref=e235]:
                - generic [ref=e236]: Crédit
                - generic [ref=e237]: 0.00 €
            - generic [ref=e238]:
              - generic [ref=e239]: Tu as un code de parrainage ?
              - generic [ref=e240]:
                - textbox "REF-XXXXXX" [ref=e241]
                - button "Appliquer" [disabled] [ref=e242]
          - generic [ref=e243]:
            - heading "🛡️ Mes données (RGPD)" [level=2] [ref=e244]
            - paragraph [ref=e245]: "Télécharge un fichier JSON avec tout ton historique BMD : profil, groupes, dépenses, paiements."
            - generic [ref=e246]:
              - heading "📥 Exporter mes données" [level=3] [ref=e247]
              - paragraph [ref=e248]: "Télécharge un fichier JSON avec tout ton historique BMD : profil, groupes, dépenses, paiements."
              - button "💾 Télécharger maintenant" [ref=e249] [cursor=pointer]
            - generic [ref=e250]:
              - heading "🗑️ Supprimer mon compte" [level=3] [ref=e251]
              - paragraph [ref=e252]:
                - text: Action
                - strong [ref=e253]: définitive
                - text: ": ton compte, tes contacts et tes notifications seront supprimés. Les groupes dont tu es seul admin seront dissous."
              - button "Demander la suppression…" [ref=e254] [cursor=pointer]
          - generic [ref=e255]:
            - button "🚪 Se déconnecter de BMD" [ref=e256] [cursor=pointer]
            - paragraph [ref=e257]: Tu pourras te reconnecter avec ton téléphone ou email à tout moment.
  - region "Notifications"
  - generic [ref=e262] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e263]:
      - img [ref=e264]
    - generic [ref=e269]:
      - button "Open issues overlay" [ref=e270]:
        - generic [ref=e271]:
          - generic [ref=e272]: "0"
          - generic [ref=e273]: "1"
        - generic [ref=e274]: Issue
      - button "Collapse issues badge" [ref=e275]:
        - img [ref=e276]
  - alert [ref=e278]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e279]:
    - generic [ref=e280]: DEV · 13:32:23
    - button "Force fresh (clear all caches and reload)" [ref=e281] [cursor=pointer]: 🧹
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
> 72  |     await logoutBtn.click();
      |                     ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
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
  83  |     await page.waitForURL(/\/(login|)$/, { timeout: 10_000 });
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