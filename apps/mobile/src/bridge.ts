/**
 * BMD Native Bridge — API unifiée exposée à la PWA via `window.bmdNative`.
 *
 * Pourquoi ce bridge ?
 *  La PWA tourne dans 3 contextes : navigateur web, PWA installée (sans
 *  Capacitor), et coque Capacitor (iOS/Android). Plutôt que de disperser
 *  des `if (Capacitor.isNativePlatform())` partout dans `apps/web/`, on
 *  expose UNE interface stable qui donne :
 *    - les vraies fonctions natives quand on est dans Capacitor
 *    - des fallbacks no-op (ou Web API) quand on est dans le navigateur
 *
 *  Côté PWA : `import { useNative } from '@/lib/use-native'` → hook React
 *  qui retourne `BmdNativeBridge | null`. Si null, on est en pur web.
 *
 *  Pourquoi exposer via `window.bmdNative` plutôt qu'un import partagé ?
 *  Parce que la PWA est servie depuis Vercel et le bundle Capacitor est
 *  injecté par-dessus côté natif — pas de bundler partagé. On passe donc
 *  par l'objet global, c'est le pattern Capacitor standard.
 */

import type { BiometryType } from "./native/biometric";
import type { DeepLink } from "./native/deep-links";
import type { CameraPhoto } from "./native/camera";
import type { ShareOptions } from "./native/share";
import type { ContactsResult } from "./native/contacts";
import type { AppleSignInResult } from "./native/sign-in-apple";
import type { IapPurchaseResult, IapProduct } from "./native/iap";
import type { HapticPattern } from "./native/haptics";

export interface BmdNativeBridge {
  /** Plateforme courante. `'web'` = pas dans Capacitor. */
  readonly platform: "ios" | "android" | "web";

  /** Version de l'app native (depuis `Info.plist` / `build.gradle`). */
  readonly appVersion: string;

  /**
   * Identifiant unique de l'appareil (UUID stable cross-reinstall sur iOS,
   * Android ID sur Android). Utile pour binder une session Passkey à un
   * device spécifique côté API BMD.
   */
  readonly deviceId: string;

  // === AUTHENTIFICATION ===

  biometric: {
    /** Quel type de biométrie est dispo (`faceId`, `touchId`, `fingerprint`, etc.). */
    available(): Promise<{ available: boolean; biometryType: BiometryType }>;
    /** Demande l'authentification. Throw si refus / annulation. */
    authenticate(reason: string): Promise<void>;
  };

  signInWithApple: {
    /** Lance le flow natif iOS / fallback web sur Android. */
    signIn(): Promise<AppleSignInResult>;
  };

  // === ABONNEMENTS (iOS uniquement, via RevenueCat / StoreKit) ===

  iap: {
    /** Charge la liste des produits configurés côté App Store Connect. */
    listProducts(): Promise<IapProduct[]>;
    /** Lance le flow d'achat StoreKit pour un produit. */
    purchase(productId: string): Promise<IapPurchaseResult>;
    /** Restaure les achats existants (obligatoire Apple). */
    restorePurchases(): Promise<IapPurchaseResult[]>;
  };

  // === DEEP LINKS / UNIVERSAL LINKS ===

  deepLinks: {
    /**
     * Enregistre un listener qui sera notifié quand l'utilisateur ouvre
     * un lien `https://backmesdo.com/*` qui résout vers l'app.
     */
    onLink(handler: (link: DeepLink) => void): () => void;
  };

  // === CAMERA / OCR ===

  camera: {
    /** Prend une photo (caméra) ou choisit dans la galerie. */
    capture(options?: { source?: "camera" | "gallery" }): Promise<CameraPhoto>;
  };

  // === PARTAGE NATIF ===

  share: {
    /** Ouvre la sheet de partage iOS / Android (WhatsApp, SMS, mail, etc.). */
    share(opts: ShareOptions): Promise<void>;
  };

  // === CONTACTS (RGPD : prompt explicite à la 1ʳᵉ utilisation) ===

  contacts: {
    /** Demande la permission utilisateur — peut afficher l'alerte système. */
    requestPermission(): Promise<{ granted: boolean }>;
    /** Récupère les contacts (nom + numéros + emails) après permission. */
    list(): Promise<ContactsResult>;
  };

  // === HAPTICS / VIBRATIONS ===

  haptics: {
    impact(pattern: HapticPattern): Promise<void>;
  };

  // === PUSH NOTIFICATIONS ===

  push: {
    /** Demande la permission utilisateur (iOS prompt, Android 13+ prompt). */
    requestPermission(): Promise<{ granted: boolean }>;
    /**
     * Récupère le token APNs (iOS) ou FCM (Android) pour l'envoyer côté API
     * BMD via `/push/register-device`.
     */
    register(): Promise<{ token: string; provider: "apns" | "fcm" }>;
    /** Listener pour les notifications reçues alors que l'app est ouverte. */
    onReceived(handler: (notif: { title: string; body: string; data: Record<string, string> }) => void): () => void;
    /** Listener pour les taps sur une notification (ouvre l'app sur la bonne route). */
    onTapped(handler: (notif: { data: Record<string, string> }) => void): () => void;
  };

  // === LIFECYCLE / NETWORK ===

  app: {
    /** L'app a-t-elle été ouverte via un cold start (iOS) ? Utile pour analytics. */
    readonly coldStart: boolean;
    /** Force la fermeture de l'app (Android only — Apple interdit ça sur iOS). */
    exit(): Promise<void>;
  };

  network: {
    /** État courant. */
    status(): Promise<{ connected: boolean; type: "wifi" | "cellular" | "none" | "unknown" }>;
    /** Listener pour changements de connectivité. */
    onChange(handler: (status: { connected: boolean }) => void): () => void;
  };

  // === STATUS BAR / KEYBOARD / SPLASH ===

  ui: {
    /** Cache la splash screen (à appeler quand le contenu est prêt à s'afficher). */
    hideSplash(): Promise<void>;
    /** Force le style de la barre de statut (BMD = toujours dark). */
    setStatusBarStyle(style: "dark" | "light"): Promise<void>;
    /** Hauteur du clavier en cours d'affichage (pour ajuster les inputs). */
    onKeyboardChange(handler: (info: { height: number; visible: boolean }) => void): () => void;
  };
}

/**
 * Type augmenté de `window` pour donner l'autocomplétion au code PWA.
 * Côté `apps/web/`, on importe ce type via `@bmd/mobile/dist/bridge`.
 */
declare global {
  interface Window {
    bmdNative?: BmdNativeBridge;
  }
}
