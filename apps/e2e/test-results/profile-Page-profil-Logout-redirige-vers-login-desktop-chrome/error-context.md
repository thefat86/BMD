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
  - link "Aller au contenu principal" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - link "BMD Back Mes Do" [ref=e6] [cursor=pointer]:
        - /url: /dashboard
        - generic [ref=e7]:
          - generic [ref=e8]: BMD
          - generic [ref=e9]: Back Mes Do
      - link "Tableau de bord" [ref=e11] [cursor=pointer]:
        - /url: /dashboard
        - generic [ref=e12]: 🏠
        - generic [ref=e13]: Tableau de bord
      - generic [ref=e14]:
        - generic [ref=e15]: Groupes
        - link "Groupes" [ref=e16] [cursor=pointer]:
          - /url: /dashboard
          - generic [ref=e17]: 👥
          - generic [ref=e18]: Groupes
        - link "Statistiques" [ref=e19] [cursor=pointer]:
          - /url: /dashboard/stats
          - generic [ref=e20]: 📊
          - generic [ref=e21]: Statistiques
      - generic [ref=e22]:
        - generic [ref=e23]: Mon profil
        - link "Mon profil" [ref=e24] [cursor=pointer]:
          - /url: /dashboard/profile
          - generic [ref=e25]: 👤
          - generic [ref=e26]: Mon profil
        - link "Mon forfait" [ref=e27] [cursor=pointer]:
          - /url: /dashboard/plans
          - generic [ref=e28]: ✨
          - generic [ref=e29]: Mon forfait
        - link "Espace commercial" [ref=e30] [cursor=pointer]:
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
          - link "Notifications" [ref=e43] [cursor=pointer]:
            - /url: /dashboard/profile
            - img [ref=e44]
          - link "E" [ref=e46] [cursor=pointer]:
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
                  - text: logout-tester-mp5ejdhs-wzfg@bmd-e2e.local
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
            - link "🛡️ Politique de confidentialité" [ref=e108] [cursor=pointer]:
              - /url: /legal/privacy
            - paragraph [ref=e109]: BMD respecte le RGPD. Tes données ne sont ni vendues, ni partagées. Tu peux les exporter ou les supprimer à tout moment.
          - generic [ref=e110]:
            - generic [ref=e111]:
              - img [ref=e113]
              - generic [ref=e115]:
                - generic [ref=e116]: Mon forfait
                - generic [ref=e117]: Découverte
                - generic [ref=e118]: Pour démarrer · 2 groupes, 8 membres, 3 scans IA / mois
            - list [ref=e119]:
              - listitem [ref=e120]:
                - img [ref=e121]
                - generic [ref=e126]: 2 groupes
              - listitem [ref=e127]:
                - img [ref=e128]
                - generic [ref=e131]: 8 membres/groupe
              - listitem [ref=e132]:
                - img [ref=e133]
                - generic [ref=e136]: 5 scans/mois
            - generic [ref=e137]:
              - generic [ref=e138]:
                - img [ref=e139]
                - strong [ref=e141]: Débloquer plus de fonctionnalités ?
                - text: Passe à un forfait supérieur — annulable à tout moment.
              - generic [ref=e142]:
                - link "Passer en Perso →" [ref=e143] [cursor=pointer]:
                  - /url: /dashboard/plans?upgrade=PERSONAL
                - link "Passer en Famille →" [ref=e144] [cursor=pointer]:
                  - /url: /dashboard/plans?upgrade=FAMILY
                - link "Passer en Pro →" [ref=e145] [cursor=pointer]:
                  - /url: /dashboard/plans?upgrade=PRO
                - link "Passer en Perso à vie →" [ref=e146] [cursor=pointer]:
                  - /url: /dashboard/plans?upgrade=LIFETIME_PERSONAL
                - link "Comparer tous les forfaits" [ref=e147] [cursor=pointer]:
                  - /url: /dashboard/plans
          - generic [ref=e148]:
            - generic [ref=e149]:
              - heading "🔐 Passkeys" [level=2] [ref=e150]
              - button "+ Ajouter" [ref=e151] [cursor=pointer]
            - paragraph [ref=e152]: Connecte-toi sans code OTP grâce à ton empreinte ou Face ID. La clé privée reste sur ton appareil — BMD ne voit que la clé publique.
            - generic [ref=e153]:
              - generic [ref=e154]: 🔑
              - text: Aucun passkey pour l'instant. Touche « + Ajouter » pour commencer — c'est plus rapide qu'un code OTP.
          - generic [ref=e155]:
            - generic [ref=e156]:
              - heading "🔐 Authentification 2 facteurs" [level=2] [ref=e157]
              - generic [ref=e158]: ○ INACTIVE
            - paragraph [ref=e159]: Une seconde couche de sécurité avec ton app authenticator (Google Authenticator, Authy, 1Password, Bitwarden…). Recommandé pour les comptes Premium et Communauté.
            - generic [ref=e160]:
              - strong [ref=e161]: 📱 Tu as besoin d'une app d'authentification
              - paragraph [ref=e162]: "Avant d'activer la 2FA, installe une de ces apps gratuites sur ton téléphone :"
              - list [ref=e163]:
                - listitem [ref=e164]:
                  - strong [ref=e165]: Google Authenticator
                  - link "iOS" [ref=e166] [cursor=pointer]:
                    - /url: https://apps.apple.com/app/google-authenticator/id388497605
                  - text: ·
                  - link "Android" [ref=e167] [cursor=pointer]:
                    - /url: https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2
                - listitem [ref=e168]:
                  - strong [ref=e169]: Authy
                  - text: ·
                  - strong [ref=e170]: 1Password
                  - text: ·
                  - strong [ref=e171]: Bitwarden
                  - text: (autres options)
              - paragraph [ref=e172]: 💡 Ces apps génèrent un code à 6 chiffres qui change toutes les 30 secondes. C'est ce code qui te servira à te connecter.
            - button "🔐 J'ai mon app — activer la 2FA" [ref=e173] [cursor=pointer]
          - button "🔓 Sessions actives 1" [ref=e175] [cursor=pointer]:
            - heading "🔓 Sessions actives" [level=2] [ref=e176]
            - generic [ref=e177]: "1"
            - generic [ref=e178]: ▸
          - generic [ref=e179]:
            - heading "📲 📲 Notifications push" [level=2] [ref=e180]
            - paragraph [ref=e181]: Reçois les rappels de tontine, paiements et résumés hebdo directement sur ton appareil — même quand l'onglet est fermé.
            - button "🚫 Bloquées par le navigateur" [disabled] [ref=e183]
          - generic [ref=e184]:
            - heading "Mes moyens de paiement" [level=2] [ref=e185]:
              - img [ref=e186]
              - generic [ref=e188]: Mes moyens de paiement
            - paragraph [ref=e189]: Sauvegarde tes numéros de Mobile Money, IBAN ou comptes en ligne pour les retrouver rapidement lors des règlements. Tout est chiffré (AES-256-GCM) — seul toi peux voir la valeur en clair.
            - button "＋ Ajouter un moyen de paiement" [ref=e190] [cursor=pointer]
          - generic [ref=e191]:
            - generic [ref=e192]:
              - heading "🎁 Mon parrainage" [level=2] [ref=e193]
              - generic [ref=e194]: 0 actif
            - generic [ref=e195]:
              - generic [ref=e196]: Mon code
              - generic [ref=e197]: REF-LJBU3G
              - generic [ref=e198]: http://localhost:3000/login?ref=REF-LJBU3G
            - generic [ref=e199]:
              - button "WhatsApp" [ref=e200] [cursor=pointer]:
                - generic [ref=e201]: 💬
                - text: WhatsApp
              - button "SMS" [ref=e202] [cursor=pointer]:
                - generic [ref=e203]: 📱
                - text: SMS
              - button "Email" [ref=e204] [cursor=pointer]:
                - generic [ref=e205]: ✉
                - text: Email
              - button "Copier" [ref=e206] [cursor=pointer]:
                - generic [ref=e207]: 🔗
                - text: Copier
              - button "Partager" [ref=e208] [cursor=pointer]:
                - generic [ref=e209]: 📲
                - text: Partager
            - generic [ref=e210]:
              - generic [ref=e211]:
                - generic [ref=e212]: Filleuls
                - generic [ref=e213]: "0"
              - generic [ref=e214]:
                - generic [ref=e215]: Filleuls actifs
                - generic [ref=e216]: "0"
              - generic [ref=e217]:
                - generic [ref=e218]: Crédit
                - generic [ref=e219]: 0.00 €
            - generic [ref=e220]:
              - generic [ref=e221]: Tu as un code de parrainage ?
              - generic [ref=e222]:
                - textbox "REF-XXXXXX" [ref=e223]
                - button "Appliquer" [disabled] [ref=e224]
          - generic [ref=e225]:
            - heading "🛡️ Mes données (RGPD)" [level=2] [ref=e226]
            - paragraph [ref=e227]: "Télécharge un fichier JSON avec tout ton historique BMD : profil, groupes, dépenses, paiements."
            - generic [ref=e228]:
              - heading "📥 Exporter mes données" [level=3] [ref=e229]
              - paragraph [ref=e230]: "Télécharge un fichier JSON avec tout ton historique BMD : profil, groupes, dépenses, paiements."
              - button "💾 Télécharger maintenant" [ref=e231] [cursor=pointer]
            - generic [ref=e232]:
              - heading "🗑️ Supprimer mon compte" [level=3] [ref=e233]
              - paragraph [ref=e234]:
                - text: Action
                - strong [ref=e235]: définitive
                - text: ": ton compte, tes contacts et tes notifications seront supprimés. Les groupes dont tu es seul admin seront dissous."
              - button "Demander la suppression…" [ref=e236] [cursor=pointer]
          - generic [ref=e237]:
            - button "🚪 Se déconnecter de BMD" [ref=e238] [cursor=pointer]
            - paragraph [ref=e239]: Tu pourras te reconnecter avec ton téléphone ou email à tout moment.
  - dialog "Déconnexion" [ref=e240]:
    - generic [ref=e241]:
      - generic [ref=e242]:
        - generic [ref=e243]: ⚠️
        - heading "Déconnexion" [level=3] [ref=e245]
      - paragraph [ref=e246]: Te déconnecter de BMD ? Tu devras te reconnecter avec ton téléphone ou email pour revenir.
      - generic [ref=e247]:
        - button "Rester connecté·e" [ref=e248] [cursor=pointer]
        - button "Se déconnecter" [active] [ref=e249] [cursor=pointer]
  - region "Notifications"
  - button "Open Next.js Dev Tools" [ref=e255] [cursor=pointer]:
    - img [ref=e256]
  - alert [ref=e259]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e260]:
    - generic [ref=e261]: DEV · 13:25:32
    - button "Force fresh (clear all caches and reload)" [ref=e262] [cursor=pointer]: 🧹
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