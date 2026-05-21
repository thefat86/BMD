# V133 — Push Android (FCM) · Ce que tu dois faire

Côté code, **tout est prêt**. Il te reste 3 actions à faire chez Google et 2
commandes à lancer en local. Compte ~10 min en tout, c'est gratuit.

---

## ✅ Ce qui est déjà livré côté repo

- Plugin Capacitor `@capacitor/push-notifications@7` (déjà installé)
- `AndroidManifest.xml` : permission `POST_NOTIFICATIONS` + meta-data FCM
  (icône, couleur, channel `bmd_default`)
- `res/values/colors.xml` : couleur d'accent saffron BMD
- `res/drawable/ic_notification.xml` : icône silhouette blanche (V133.A)
- `build.gradle` : plugin `com.google.gms:google-services:4.4.2` activé
  conditionnellement (s'auto-active dès que `google-services.json` apparaît)
- `apps/mobile/src/native/push.ts` : `ensureAndroidChannel()` crée le channel
  `bmd_default` au boot (obligatoire Android 8+)
- Backend FCM sender + endpoint `/push/register-native` + câblage dans
  `notifications.service.ts` (V132)
- `firebase-admin` ajouté en `optionalDependencies` du package.json API

---

## 🎯 Tes 3 actions

### Action 1 — Créer le projet Firebase + télécharger `google-services.json`

1. Va sur https://console.firebase.google.com
2. **Add project** → nom : `BMD` → Continue. (Analytics : tu peux skip ou
   garder ON, ne change rien pour les push.)
3. Dans le projet, clique l'icône Android (« + Add app » si déjà un projet) :
   - **Android package name** : `com.backmesdo.bmd`
     ⚠️ doit matcher EXACTEMENT `applicationId` dans
     `apps/mobile/android/app/build.gradle` (vérifié : c'est bien
     `com.backmesdo.bmd`).
   - App nickname : `BMD Android`
   - SHA-1 : optionnel (à ajouter plus tard pour Google Sign-In si besoin).
   - **Register app**.
4. **Download `google-services.json`** → place-le exactement ici :
   ```
   apps/mobile/android/app/google-services.json
   ```
   (Pas dans `app/src/main/`. À la racine de `app/`.)
5. Skip les étapes Gradle suivantes — le repo est déjà configuré.

### Action 2 — Générer la clé service account (pour le backend)

1. Firebase Console → ⚙️ **Project Settings**
2. Onglet **Service accounts** → bouton **Generate new private key**
3. Confirme → un JSON se télécharge. **Ne le commit JAMAIS** dans git.
4. Ouvre-le, **copie son contenu entier sur une seule ligne** :
   ```bash
   cat firebase-service-account.json | jq -c .
   ```
5. Colle-le dans `apps/api/.env` :
   ```bash
   FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"bmd-xxx",...}'
   ```
   ⚠️ Les `'` simples autour sont importants à cause des `"` dans le JSON.

### Action 3 — Installer `firebase-admin` côté API

```bash
cd apps/api
npm install firebase-admin
```

(Il est déjà déclaré en `optionalDependencies` — cette commande ne fait que
le matérialiser dans `node_modules`.)

---

## 🚀 Lancement

```bash
# 1. Resync Capacitor (copie le google-services.json dans le build)
cd apps/mobile
npx cap sync android

# 2. Rebuild + run sur ton device Android (USB ou émulateur)
npx cap run android
# OU dans Android Studio : Run → Debug 'app'

# 3. Côté API (autre terminal) — restart pour charger la nouvelle env
cd apps/api
npm run dev
```

---

## 🧪 Tester end-to-end

1. Sur ton device Android, ouvre l'app → accepte la permission
   **"Autoriser les notifications"** quand Android la demande.
2. Login normalement → l'app fait automatiquement :
   - `push.requestPermission()` → permission accordée
   - `push.register()` → reçoit un token FCM
   - `POST /push/register-native` → stocke le token côté backend
   - Tu peux voir le token apparaître dans les logs API.
3. Test manuel :
   ```bash
   curl -X POST http://localhost:4000/push/test \
     -H "Authorization: Bearer <ton_jwt>"
   ```
   Réponse attendue :
   ```json
   { "web": {...}, "native": { "delivered": 1, "failed": 0, "skipped": 0 } }
   ```
4. **Ton téléphone Android affiche une notif système** :
   « 🎉 Notifications activées · Si tu vois ce message, c'est que tout
   fonctionne ! »

---

## 🐛 Troubleshooting Android

### Le build échoue avec « google-services.json not found »

Tu as oublié de placer le fichier dans `apps/mobile/android/app/`. Vérifie
le chemin exact (pas dans `src/main/`, à la racine de `app/`).

### Le build échoue avec « package name doesn't match »

Le `package_name` dans `google-services.json` doit être `com.backmesdo.bmd`.
Re-télécharge depuis Firebase si tu as fait une faute de frappe.

### Pas de notif sur Android, logs API disent « delivered »

- Vérifie que tu as bien accepté la permission au démarrage de l'app.
  Sinon : **Paramètres système → Apps → BMD → Notifications → Autoriser**.
- Vérifie que **l'optimisation batterie** n'a pas mis BMD en veille agressive :
  Paramètres → Apps → BMD → Batterie → "Sans restriction".
- Sur certains Android (Xiaomi, Huawei, Samsung), il faut autoriser
  l'**autostart** de l'app pour recevoir les push en background.

### « table NativePushToken absente » dans les logs API

La migration V132 n'a pas été appliquée :
```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
```

### Logs API : « FIREBASE_SERVICE_ACCOUNT_JSON configuré mais firebase-admin non installé »

Tu n'as pas fait `npm install firebase-admin` côté API (Action 3 ci-dessus).

### L'icône de notif est un carré blanc anonyme

Sur les Android < 5 (Lollipop) ça arrivait. Depuis V133.A on a une icône
silhouette propre. Si ça arrive encore, vérifie que
`apps/mobile/android/app/src/main/res/drawable/ic_notification.xml` existe
bien après un `npx cap sync android`.

---

## 📋 Récap : ce que toi tu fais

| # | Action | Où | Durée |
|---|---|---|---|
| 1 | Créer projet Firebase + télécharger `google-services.json` | https://console.firebase.google.com | 3 min |
| 2 | Générer service account JSON → coller dans `.env` | Firebase Console + ton éditeur | 2 min |
| 3 | `npm install firebase-admin` | terminal `apps/api/` | 1 min |
| 4 | `npx cap sync android && npx cap run android` | terminal `apps/mobile/` | 3 min |
| 5 | Accepter perm sur le device + tester `POST /push/test` | device Android + curl | 1 min |

**Total** : ~10 min. Le code est entièrement prêt.

---

## 🔗 Voir aussi

- [Runbook iOS APNs (V132)](./V132-PUSH-NOTIFICATIONS-SETUP.md)
- [Architecture push complète](./V132-PUSH-NOTIFICATIONS-SETUP.md#architecture)
