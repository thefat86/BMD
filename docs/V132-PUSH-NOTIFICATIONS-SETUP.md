# V132 — Push notifications natives · Runbook setup

Pour que ton iPhone (et tout Android) reçoive **vraiment** des notifications
système (pas juste in-app), il faut activer **APNs** côté Apple et **FCM** côté
Google. Le code BMD est déjà en place — il ne manque que les credentials.

---

## ⚠️ Pré-requis critiques

| Plateforme | Compte obligatoire | Coût |
|---|---|---|
| iOS | Apple Developer Program (payant) | 99 €/an |
| Android | Compte Google standard + Firebase (gratuit) | 0 € |

**Sans Apple Developer Program payant, les push iOS ne fonctionneront PAS** —
même en dev local avec ton iPhone branché à Xcode. Un compte "Personal Team"
gratuit ne donne PAS accès à APNs. Si tu n'es pas encore inscrit :
👉 https://developer.apple.com/programs/enroll/

---

## Partie 1 — iOS (APNs)

### 1.1 — Générer la clé APNs (.p8)

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles**
2. Onglet **Keys** → bouton **+**
3. Nom : `BMD APNs Key` (libre)
4. ✅ Cocher **Apple Push Notifications service (APNs)**
5. **Continue** → **Register**
6. ⚠️ **Télécharger immédiatement le fichier `.p8`** — non re-téléchargeable !
7. Note les valeurs affichées à l'écran :
   - **Key ID** (10 caractères, ex : `ABC1234DEF`)
   - **Team ID** (10 caractères, dans le coin supérieur droit du portail)

### 1.2 — Vérifier le Bundle ID

1. https://developer.apple.com/account → **Identifiers**
2. Cherche `com.backmesdo.bmd` (ou ton bundle ID actuel)
3. Édite-le → ✅ **Push Notifications** capability cochée
4. **Save**

### 1.3 — Activer la capability dans Xcode

1. Ouvre `apps/mobile/ios/App/App.xcworkspace` dans Xcode
2. **Targets → App → Signing & Capabilities**
3. Si la capability **Push Notifications** n'est pas déjà là :
   **+ Capability** → Push Notifications
4. Vérifie que le fichier `App.entitlements` contient bien :
   ```xml
   <key>aps-environment</key>
   <string>production</string>
   ```
   *(Xcode utilisera automatiquement `development` en signing dev — pas
   besoin de changer.)*

### 1.4 — Configurer les variables d'env API

Dans `apps/api/.env` :

```bash
# Bundle ID iOS (doit matcher exactement Xcode)
APNS_BUNDLE_ID=com.backmesdo.bmd

# Key ID (10 char) du .p8
APNS_KEY_ID=ABC1234DEF

# Team ID Apple Developer (10 char)
APNS_TEAM_ID=XYZ9876UVW

# Contenu intégral du fichier .p8 (PEM avec \n littéraux)
# Pour un fichier multi-lignes en .env, mets-le tout sur une ligne avec \n
APNS_KEY_P8="-----BEGIN PRIVATE KEY-----\nMIGTAg...\n...\n-----END PRIVATE KEY-----"

# false = sandbox (build dev/TestFlight signé avec profil Development)
# true = production (App Store + TestFlight final)
APNS_PRODUCTION=false
```

> 💡 Pour copier la .p8 multi-lignes en variable d'env :
> ```bash
> awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' AuthKey_ABC1234DEF.p8
> ```
> puis colle le résultat entre des `"..."`.

---

## Partie 2 — Android (FCM)

### 2.1 — Créer le projet Firebase

1. https://console.firebase.google.com → **Add project**
2. Nom : `BMD` → continue (analytics optionnel)
3. Dans le projet → ⚙️ → **Project Settings** → onglet **General**
4. **Your apps** → bouton **Android**
5. **Android package name** : `com.backmesdo.bmd` (doit matcher
   `apps/mobile/android/app/build.gradle` → `applicationId`)
6. Nickname : `BMD Android` → **Register app**
7. **Download `google-services.json`** → place-le dans
   `apps/mobile/android/app/google-services.json`
8. Skip les étapes Gradle (déjà configurées dans le repo).

### 2.2 — Générer la clé service account (côté API)

1. Firebase Console → ⚙️ → **Project Settings**
2. Onglet **Service accounts** → **Generate new private key** → **Generate key**
3. Sauvegarde le JSON téléchargé (NE PAS commit dans le repo).

### 2.3 — Installer firebase-admin côté API

```bash
cd apps/api
npm install firebase-admin
```

### 2.4 — Configurer la variable d'env API

Dans `apps/api/.env`, place le JSON entier sur une ligne (ou avec `\n` littéraux) :

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"bmd-...",...}'
```

> 💡 Pour aplatir le JSON en une ligne :
> ```bash
> cat firebase-service-account.json | jq -c .
> ```

### 2.5 — Rebuild Android

```bash
cd apps/mobile
npx cap sync android
cd android && ./gradlew clean assembleDebug
```

---

## Partie 3 — Tester end-to-end

### 3.1 — Sur ton iPhone (Xcode)

1. Connecte ton iPhone via USB
2. Xcode → sélectionne ton device → **▶️ Run**
3. À l'ouverture de l'app, accepte la permission **Notifications** quand iOS la demande
4. Login normalement → l'app appelle `push.register()` puis
   `POST /push/register-native` en arrière-plan (visible dans les logs API)
5. Ouvre `/dashboard/profile` (ou route équivalente) → tu dois voir ton
   device dans la liste `pushListNativeDevices()`
6. Test : depuis l'API, fais
   ```bash
   curl -X POST http://localhost:4000/push/test \
     -H "Authorization: Bearer <ton_jwt>"
   ```
   → ton iPhone reçoit une notif **« 🎉 Notifications activées »** sur
   l'écran de verrouillage en quelques secondes.

### 3.2 — Tester un trigger métier

Crée une dépense dans un groupe où un autre user est membre → ce user
reçoit instantanément une notif push avec :
- **Titre** : `<Ton nom> a ajouté <nom dépense>`
- **Body** : montant + date
- **Tap** → ouvre la page de la dépense

---

## Partie 4 — Troubleshooting

### "permission refusée" dans la console

- L'utilisateur a refusé le prompt OS. Sur iPhone : **Réglages → BMD →
  Notifications → Autoriser**. L'app retentera au prochain cold-start.

### Pas de notif sur iPhone mais logs API disent "delivered"

- Vérifie que `APNS_PRODUCTION` matche ton type de signing :
  - Build **Development** (Xcode → run) → `APNS_PRODUCTION=false`
  - Build **TestFlight / App Store** → `APNS_PRODUCTION=true`
- Vérifie que ton iPhone est **déverrouillé au moins une fois** depuis le
  redémarrage (APNs livre en background sinon).

### "table NativePushToken absente?" dans les logs API

- La migration V132 n'a pas été appliquée. Lance :
  ```bash
  cd apps/api
  npx prisma migrate deploy
  npx prisma generate
  ```

### Token APNs invalide / 410

- Le token est mort (app désinstallée, perm refusée). Le sender supprime
  automatiquement la row. Au prochain login, l'app régénère un token frais.

### Android : "google-services.json not found"

- Tu n'as pas encore placé le fichier dans `apps/mobile/android/app/`. Sans
  lui, le plugin `google-services` n'est pas appliqué et `register()` échoue.

---

## Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│  iPhone (Capacitor)  │     │  Android (Capacitor) │
│  push.register()     │     │  push.register()     │
└───────────┬──────────┘     └──────────┬───────────┘
            │ token APNs                │ token FCM
            ▼                           ▼
   ┌────────────────────────────────────────────┐
   │  POST /push/register-native (BMD API)      │
   │  → INSERT NativePushToken                  │
   └────────────────────────────────────────────┘

                  Trigger métier (ex: nouvelle dépense)
                              ▼
                  notifyMany(userIds, {...})
                              ▼
              ┌───────────────┴────────────────┐
              ▼                                ▼
   INSERT Notification row              sendNativePushToMany
              │                                │
              ▼                          ┌─────┴─────┐
   Apparait dans cloche                  ▼           ▼
   (poll + SSE)                       APNs HTTP/2   FCM
                                      (.p8 JWT)   (firebase-admin)
                                         │           │
                                         ▼           ▼
                                  📱 iPhone   📱 Android
                                  Notification système
```

---

## Fichiers clés (V132)

| Fichier | Rôle |
|---|---|
| `apps/api/src/lib/native-push.ts` | Sender APNs HTTP/2 + FCM lazy require |
| `apps/api/src/modules/push/push.routes.ts` | `/push/register-native`, `/push/unregister-native`, `/push/native-devices`, `/push/test` |
| `apps/api/src/modules/notifications/notifications.service.ts` | `notifyOne` / `notifyMany` câblés sur le push |
| `apps/api/prisma/migrations/20260529000000_v132_native_push_tokens/` | Migration table `NativePushToken` |
| `apps/web/lib/ui/native-push-boot.tsx` | Composant React qui appelle `push.register()` au login + handler tap |
| `apps/mobile/src/native/push.ts` | Wrapper Capacitor (+ `ensureAndroidChannel`) |
| `apps/mobile/ios/App/App/App.entitlements` | `aps-environment` capability |
| `apps/mobile/android/app/build.gradle` | Plugin `google-services` conditionnel |
