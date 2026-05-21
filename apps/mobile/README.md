# BMD · App mobile (Capacitor)

> Coque iOS + Android sur la web app BMD. La logique métier reste dans
> `apps/web/` ; ce package gère uniquement les bridges natifs (push,
> Face ID, deep links, camera, partage, contacts, etc.).

**Bundle ID gravé** : `com.backmesdo.bmd`
**Display name (icône)** : BMD
**Display name (stores)** : BMD — Back Mes Do
**Stratégie servi** : remote (l'app charge `app.backmesdo.com`)
**Stratégie abonnements iOS** : StoreKit (Apple IAP) — Stripe partout ailleurs

---

## Pré-requis (côté ton Mac)

| Outil | Version | Rôle |
|---|---|---|
| Node 20+ | déjà installé | runtime du monorepo |
| Xcode 16+ | App Store gratuit | build iOS, simulateur, soumission |
| CocoaPods | `sudo gem install cocoapods` | gestion deps natives iOS |
| Android Studio | gratuit | build Android, émulateur, soumission |
| Android SDK Platform 34 | via Android Studio | compatibilité Play Store |
| Compte Apple Developer | 99 $/an | publication iOS |
| Compte Google Play Console | 25 $ one-shot | publication Android |

---

## Installation initiale (à faire une seule fois sur ton Mac)

```bash
# Depuis la racine du monorepo
npm install   # installe @bmd/mobile + Capacitor

# Initialiser le projet iOS — depuis apps/mobile/
cd apps/mobile
npx cap add ios
# → crée le dossier ios/ avec un projet Xcode prêt

# Initialiser le projet Android
npx cap add android
# → crée le dossier android/ avec un projet Gradle prêt

# Vérifier la santé du setup
npx cap doctor
```

---

## Workflow dev (boucle quotidienne)

```bash
# Terminal 1 — lance le Next.js (depuis la racine)
npm run dev

# Terminal 2 — lance l'app mobile en mode "remote LAN" pour live reload.
# Récupère l'IP LAN affichée par l'API au boot (ex: 192.168.1.42).
cd apps/mobile
BMD_MOBILE_ENV=dev BMD_MOBILE_DEV_HOST=192.168.1.42 npx cap sync

# Ouvrir Xcode pour iOS
npx cap open ios
# Puis Cmd+R pour lancer le simulateur

# Ouvrir Android Studio
npx cap open android
# Puis Run pour lancer l'émulateur
```

---

## Workflow prod (build pour soumission stores)

```bash
cd apps/mobile

# Build avec config production (pointe vers app.backmesdo.com)
BMD_MOBILE_ENV=production npx cap sync

# iOS — Xcode → Product → Archive → Distribute → App Store Connect
npx cap open ios

# Android — Android Studio → Build → Generate Signed Bundle/APK
npx cap open android
```

---

## Architecture

```
apps/mobile/
├── capacitor.config.ts     # Config bundle ID, server URL, plugins
├── src/
│   └── index.ts             # Bridges natifs (lifecycle, deep links, back btn)
├── ios/                     # Projet Xcode (généré + custom)
│   └── App/
│       ├── App.xcworkspace  # à ouvrir dans Xcode
│       ├── App/Info.plist   # permissions, encryption export, etc.
│       └── App/PrivacyInfo.xcprivacy  # privacy manifest (Phase 3)
├── android/                 # Projet Android Studio (généré + custom)
│   └── app/
│       ├── build.gradle
│       ├── src/main/AndroidManifest.xml
│       └── src/main/java/.../MainActivity.java
└── www/                     # Vide — l'app est en mode remote
```

---

## Plugins natifs (Phase 2 — déjà câblés en code TS)

Les modules natifs sont structurés par responsabilité dans `src/native/` :

| Module | Plugin Capacitor | Rôle |
|---|---|---|
| `biometric.ts` | `@aparajita/capacitor-biometric-auth` | Face ID / Touch ID / Empreinte |
| `sign-in-apple.ts` | `@capacitor-community/sign-in-with-apple` | SSO Apple natif iOS (fallback web Android) |
| `iap.ts` | `@revenuecat/purchases-capacitor` | Abonnements StoreKit iOS via RevenueCat |
| `deep-links.ts` | `@capacitor/app` | Universal Links iOS / App Links Android |
| `push.ts` | `@capacitor/push-notifications` | APNs (iOS) + FCM (Android) |
| `camera.ts` | `@capacitor/camera` | Scan tickets pour OCR |
| `share.ts` | `@capacitor/share` | Sheet partage native (WhatsApp/SMS/Mail) |
| `contacts.ts` | `@capacitor-community/contacts` | Carnet d'adresses (RGPD : consentement explicite) — **V96 actif** (lecture native iOS/Android via picker BMD scrutable) |
| `haptics.ts` | `@capacitor/haptics` | Taptic Engine iOS / vibration Android |
| `network.ts` | `@capacitor/network` | Connectivité online/offline |
| `ui.ts` | `@capacitor/splash-screen` + `@capacitor/status-bar` + `@capacitor/keyboard` | Coque visuelle |

Le bridge unifié est défini dans `src/bridge.ts` (interface `BmdNativeBridge`) et exposé sur `window.bmdNative` au boot par `src/index.ts`. Côté PWA, on l'utilise via le hook React `useNative()` dans `apps/web/lib/use-native.ts`.

### Permissions natives requises (Phase 3)

Chaque plugin a ses propres clés `Info.plist` (iOS) et `AndroidManifest.xml` (Android) à ajouter. Cf. en-têtes des modules `src/native/*` pour les copies exactes des messages utilisateur (`NSCameraUsageDescription`, `NSContactsUsageDescription`, etc.).

---

## Anti-rejet stores — checklist (à compléter en Phase 3)

### Apple App Store

- [ ] `PrivacyInfo.xcprivacy` rempli (required reason APIs)
- [ ] `Info.plist` `ITSAppUsesNonExemptEncryption=YES` + exemption qualifiée
- [ ] Sign in with Apple présent dès qu'on offre Sign in with Google
- [ ] Pas de bouton "S'abonner avec Stripe" sur iOS — uniquement StoreKit
- [ ] Description App Store : mettre en avant Face ID, push, scan OCR
- [ ] Privacy Policy + Support URL actifs sur backmesdo.com
- [ ] Screenshots 6.7" + 6.5" + 5.5" + iPad 12.9" + 13" en FR/EN/ES/fr-cm/fr-ci

### Google Play Console

- [ ] Data Safety Form rempli (basé sur `legal/privacy/page.tsx`)
- [ ] Target SDK 34 (Android 14)
- [ ] 64-bit ABIs uniquement
- [ ] Permissions justifiées dans le manifeste
- [ ] Politique paiements respectée (Stripe pour services réels OK)
- [ ] Privacy Policy URL active

---

## Migration future

Capacitor est notre choix pour le go-live. Migration ultérieure prévue
si traction confirmée :

- **Vers React Native** : refactor des écrans `mobile-*` en `<View>`/`<Text>`,
  réutilisation des `@bmd/shared-types` et de l'API. ~3-4 mois solo.
- **Vers natif pur** : seulement si besoin spécifique (CarPlay, widgets
  système, intégrations OS profondes). Pas avant 100k+ users actifs.

Cf. `BMD_handoff.md` et la mémoire `project_bmd_decisions.md`.
