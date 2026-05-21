# Phase 3 — Compliance stores anti-rejet

> Guide complet de ce qui a été préparé en code et de ce qu'il reste à
> faire côté Apple Developer Portal et Google Play Console.
>
> **Objectif zéro** : passer la review iOS et Android **du premier coup**.

---

## ✅ Déjà préparé en code

### iOS

| Fichier | Rôle |
|---|---|
| `ios/App/App/Info.plist` | Permissions utilisateur (Caméra, Photos, Contacts, Face ID, Micro), Background Modes (push + audio meeting), encryption export, ATS, URL scheme `bmd://`, locales. |
| `ios/App/App/PrivacyInfo.xcprivacy` | Privacy Manifest **obligatoire** depuis mai 2024. Déclare 9 catégories de données collectées + 4 Required Reason APIs avec leurs reason codes Apple. |
| `ios/App/App/App.entitlements` | Capabilities iOS : Associated Domains (Universal Links), Push Notifications (APNs), Sign in with Apple, In-App Purchase. |

### Android

| Fichier | Rôle |
|---|---|
| `android/app/src/main/AndroidManifest.xml` | Permissions justifiées (INTERNET, POST_NOTIFICATIONS, CAMERA, READ_CONTACTS, VIBRATE, USE_BIOMETRIC, RECORD_AUDIO), App Links autoVerify pour `backmesdo.com`, intent filter `bmd://`, FCM meta-data. |

### Web (Vercel)

| Fichier | Rôle |
|---|---|
| `apps/web/public/.well-known/apple-app-site-association` | Apple validation Universal Links. |
| `apps/web/public/.well-known/assetlinks.json` | Google validation App Links. |
| `apps/web/next.config.js` | Headers `Content-Type: application/json` strict pour les 2 fichiers ci-dessus. |

---

## 🔧 À faire côté Apple Developer Portal

### Étape 1 — Activer ton compte Apple Developer (99 $/an)

1. https://developer.apple.com/programs/enroll/
2. Connexion avec ton Apple ID, validation paiement (carte, ~99 $/an).
3. Choisir "Individual" ou "Organization" :
   - **Individual** : ton nom apparaît comme éditeur dans App Store. Plus simple.
   - **Organization** : "TPL Mobility" apparaît comme éditeur. Plus pro mais nécessite un D-U-N-S Number (~10 jours pour l'obtenir).
   → **Recommandation** : démarre en Individual pour la beta, migre vers Organization plus tard si nécessaire.
4. Attends la validation Apple (1-3 jours).

### Étape 2 — Récupérer ton Team ID

Une fois validé : https://developer.apple.com/account → Membership → **Team ID** (10 caractères alphanumériques, ex : `A1B2C3D4E5`).

**Action** : remplace `TEAM_ID_PLACEHOLDER` dans `apps/web/public/.well-known/apple-app-site-association` par ce vrai Team ID. Le format final sera `A1B2C3D4E5.com.backmesdo.bmd`.

### Étape 3 — Créer le bundle ID `com.backmesdo.bmd`

https://developer.apple.com/account/resources/identifiers/list

1. **+** → App IDs → App
2. Description : `BMD`
3. Bundle ID : `com.backmesdo.bmd` (Explicit, pas Wildcard)
4. **Capabilities à activer** (cocher) :
   - ✓ Associated Domains
   - ✓ Push Notifications
   - ✓ Sign in with Apple
   - ✓ In-App Purchase
   - (Apple Pay si tu veux à terme — pas urgent)
5. Continue → Register

### Étape 4 — Créer le Services ID pour Sign in with Apple

https://developer.apple.com/account/resources/identifiers/list/serviceId

1. **+** → Services IDs
2. Description : `BMD Sign In`
3. Identifier : **`com.backmesdo.signin`** (le code BMD attend déjà cette valeur, cf. `apps/api/src/lib/apple-oauth.ts`)
4. Activer Sign In with Apple, Configure :
   - Primary App ID : `com.backmesdo.bmd` (celui créé en étape 3)
   - Domains and Subdomains : `api.backmesdo.com`, `app.backmesdo.com`, `backmesdo.com`
   - Return URLs : `https://api.backmesdo.com/auth/apple/callback`
5. Save.

### Étape 5 — Créer une Key Sign in with Apple

https://developer.apple.com/account/resources/authkeys/list

1. **+** → Sign in with Apple
2. Configure → Choose Primary App ID : `com.backmesdo.bmd`
3. Save → Continue → Register
4. **Téléchargement immédiat du fichier `.p8`** — tu ne pourras plus jamais le re-télécharger.
5. Note le Key ID (10 caractères, ex : `XYZ1234567`).

**Action** : ajouter dans `apps/api/.env` :
```
APPLE_CLIENT_ID=com.backmesdo.signin
APPLE_TEAM_ID=A1B2C3D4E5
APPLE_KEY_ID=XYZ1234567
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"
```
(Le contenu du `.p8` doit être collé en une seule ligne avec `\n` échappés.)

### Étape 6 — Configurer App Store Connect

https://appstoreconnect.apple.com → Mes Apps → **+** → Nouvelle App.

1. Plateforme : iOS
2. Nom : `BMD — Back Mes Do`
3. Langue principale : Français
4. Bundle ID : `com.backmesdo.bmd` (sélection dans la liste)
5. SKU : `bmd-ios-001` (référence interne, non visible)
6. Accès utilisateur : Full Access

**Configurer ensuite** :
- **App Information** :
  - Catégorie principale : **Finance** (ou Productivity en secondaire)
  - Privacy Policy URL : `https://backmesdo.com/legal/privacy`
- **Pricing and Availability** : Free (les abonnements sont configurés séparément).
- **App Privacy** : remplir le formulaire en se basant sur `PrivacyInfo.xcprivacy` (les données déclarées sont les mêmes).
- **App Store** → Version 1.0 :
  - Description (en FR + EN minimum)
  - Keywords : `tontine, dépenses partagées, diaspora, mariage, voyage, paiement`
  - Screenshots 6.7" iPhone Pro Max + 6.5" + iPad 12.9" + 13"
  - URL de support : `https://backmesdo.com/support` (à créer ou rediriger vers privacy)
  - URL marketing : `https://www.backmesdo.com`
  - Build : à uploader via Xcode après archive.

### Étape 7 — Créer les abonnements In-App Purchase

App Store Connect → ton app → **Monetization** → **Subscriptions** → **+**

Créer un Subscription Group nommé "BMD Plans". Dans ce groupe, créer 4 abonnements :

| Reference Name | Product ID | Type | Prix base USD |
|---|---|---|---|
| BMD Premium Monthly | `PREMIUM_MONTHLY` | Auto-Renewable | 4,99 |
| BMD Premium Yearly | `PREMIUM_YEARLY` | Auto-Renewable | 49,99 |
| BMD Community Monthly | `COMMUNITY_MONTHLY` | Auto-Renewable | 19,99 |
| BMD Parish Monthly | `PARISH_MONTHLY` | Auto-Renewable | 14,99 |

Pour chaque, configurer :
- Display Name (FR + EN minimum)
- Description (FR + EN minimum, max 250 chars, expliquer la valeur)
- Localized prices (utiliser la fonctionnalité PPA d'Apple — auto)

Et un **consumable** séparé pour EVENT :
| Name | Product ID | Type | Prix |
|---|---|---|---|
| BMD Event Pack | `EVENT_29` | Consumable | 28,99 |

---

## 🔧 À faire côté Google Play Console

### Étape 1 — Activer ton compte Google Play Developer (25 $ one-shot)

1. https://play.google.com/console/signup
2. Choisir "Individual" ou "Organization" (idem Apple, Individual plus simple).
3. Payer 25 $ par carte (one-shot, pas annuel).
4. Validation 24-48h.

### Étape 2 — Créer l'app

Console Play → **All apps** → **Create app**.

- App name : `BMD`
- Default language : Français (France)
- App or game : App
- Free or paid : Free
- Declarations : oui aux conditions, oui RGPD.

### Étape 3 — Récupérer l'empreinte SHA-256 du certificat de signature

Pour les App Links autoVerify, Google a besoin du SHA-256 de ton APK signé.

**Première fois (debug)** :
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep "SHA256:"
```

**Pour production**, utiliser Play App Signing (recommandé) :
- Console Play → ton app → **Setup** → **App integrity** → Play App Signing
- Google génère une clé de signature et te donne le SHA-256 de cette clé.

**Action** : remplace `SHA256_FINGERPRINT_PLACEHOLDER` dans
`apps/web/public/.well-known/assetlinks.json` par ce SHA-256 (format `XX:XX:XX:...`).

Tu peux mettre **plusieurs SHA-256** dans le tableau si tu veux supporter
debug + release (utile pour tester en local avec App Links).

### Étape 4 — App Content Declarations

Console Play → ton app → **Policy** → **App content** :

- **Privacy policy** : `https://backmesdo.com/legal/privacy`
- **App access** : "All functionality is available without restrictions" (ou décrire les credentials de test pour la review).
- **Ads** : No ads (BMD plan FREE a des pubs douces — à déclarer si activées).
- **Content rating** : remplir le questionnaire (BMD = `Everyone` ou `PEGI 3`).
- **Target audience** : 18+ (fintech).
- **News app** : No.
- **COVID-19 contact tracing app** : No.
- **Data safety form** : ⚠️ **section critique anti-rejet** — voir ci-dessous.
- **Government app** : No.
- **Health connect** : No.
- **Financial features** : Yes — déclarer "Personal banking & wallet" (orchestration sans séquestre de fonds).

### Étape 5 — Data Safety Form (le plus important)

Console Play → ton app → **Policy** → **App content** → **Data safety**.

Ce formulaire doit refléter exactement ce que dit `apps/web/app/legal/privacy/page.tsx`. Données collectées :

- ✓ **Personal info** : Name, Email, Phone number, User ID
- ✓ **Financial info** : Other financial info (montants des dépenses, soldes — pas de carte)
- ✓ **Photos and videos** : Photos (tickets de caisse)
- ✓ **Audio files** : Voice or sound recordings (réunions de groupe)
- ✓ **App activity** : App interactions (analytics anonymisés)
- ✓ **Device or other IDs** : Device or other IDs
- ✓ **Diagnostics** : Crash logs, Performance data

Pour chaque, déclarer :
- Collected & shared : Collected
- Required or optional : Required (sauf Audio = Optional)
- Encrypted in transit : Yes (HTTPS)
- Can be deleted : Yes (RGPD route `/gdpr/delete-me`)

### Étape 6 — Configurer le Closed Testing Track

Pour la beta : **Testing** → **Closed testing** → Create new track → ajouter ta liste de 50 testeurs par email.

---

## 🔧 À faire côté Vercel (déploiement web)

Quand tu déploies `apps/web/` sur Vercel, vérifier :
1. Les fichiers `.well-known/*` sont bien servis (Vercel les déploie depuis `public/` automatiquement).
2. Les headers du `next.config.js` sont appliqués (test : `curl -I https://backmesdo.com/.well-known/apple-app-site-association` doit retourner `Content-Type: application/json`).
3. HTTPS partout, pas de redirect HTTP → HTTPS imparfait (sinon Apple ne valide pas Universal Links).

---

## 📋 Checklist finale Phase 3

### Code (déjà fait)
- [x] `Info.plist` enrichi avec toutes les `*UsageDescription`
- [x] `PrivacyInfo.xcprivacy` (privacy manifest)
- [x] `App.entitlements` (capabilities)
- [x] `AndroidManifest.xml` enrichi
- [x] `apple-app-site-association` (avec placeholder Team ID)
- [x] `assetlinks.json` (avec placeholder SHA-256)
- [x] Headers Next.js pour servir les `.well-known/*` en `application/json`

### Apple (à faire de ton côté)
- [ ] Compte Apple Developer activé (99 $/an)
- [ ] Bundle ID `com.backmesdo.bmd` créé avec capabilities cochées
- [ ] Services ID `com.backmesdo.signin` créé pour Sign in with Apple
- [ ] Key Sign in with Apple créée + `.p8` téléchargé
- [ ] Variables `APPLE_*` ajoutées dans `apps/api/.env`
- [ ] Team ID remplacé dans `apple-app-site-association`
- [ ] App créée dans App Store Connect avec metadata
- [ ] Subscriptions créés (PREMIUM_MONTHLY, PREMIUM_YEARLY, COMMUNITY_MONTHLY, PARISH_MONTHLY, EVENT_29)

### Google (à faire de ton côté)
- [ ] Compte Google Play Console activé (25 $)
- [ ] App créée dans Play Console
- [ ] Play App Signing activé → SHA-256 récupéré
- [ ] SHA-256 remplacé dans `assetlinks.json`
- [ ] Data Safety Form rempli (8 catégories)
- [ ] Content rating questionnaire rempli
- [ ] Closed Testing Track configuré avec testeurs

### RevenueCat (à faire de ton côté avant Phase 5)
- [ ] Compte RevenueCat créé (gratuit jusqu'à 10k MAU)
- [ ] App iOS reliée à App Store Connect (App-Specific Shared Secret)
- [ ] Products mappés (PREMIUM, COMMUNITY, PARISH, EVENT)
- [ ] Webhook configuré vers `https://api.backmesdo.com/iap/apple/webhook`

### Vercel (à faire avant build prod)
- [ ] Déploiement actif sur `app.backmesdo.com`
- [ ] DNS validé Universal Links (`curl` retourne `application/json`)
- [ ] HSTS activé partout
