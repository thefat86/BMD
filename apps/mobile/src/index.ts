/**
 * Entrypoint BMD natif — bootstrap appelé au démarrage de l'app Capacitor.
 *
 * Rôle :
 *  1. Détecter le contexte natif (vs web pur).
 *  2. Initialiser les paramètres de coque (status bar dark, splash).
 *  3. Brancher les bridges natifs sur `window.bmdNative` pour que la PWA
 *     y accède sans bundler partagé.
 *  4. Gérer le lifecycle global (cold start, resume, deep links).
 *
 * Ce fichier ne contient PAS de logique métier — la logique BMD reste dans
 * `apps/web/`. Les modules natifs (./native/*) sont juste des adaptateurs.
 */

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Device } from "@capacitor/device";

import type { BmdNativeBridge } from "./bridge";
import { biometric } from "./native/biometric";
import { signInWithApple } from "./native/sign-in-apple";
import { iap } from "./native/iap";
import { deepLinks } from "./native/deep-links";
import { camera } from "./native/camera";
import { share } from "./native/share";
import { contacts } from "./native/contacts";
import { haptics } from "./native/haptics";
import { push } from "./native/push";
import { network } from "./native/network";
import { ui } from "./native/ui";

/**
 * Cold start = première ouverture après que l'OS a tué l'app.
 * Utile pour analytics et pour décider si on doit afficher la splash.
 */
let coldStart = true;

async function buildBridge(): Promise<BmdNativeBridge> {
  const platform = Capacitor.getPlatform() as "ios" | "android" | "web";

  // Métadonnées device (récupérées une fois au boot, mémorisées)
  const [deviceInfo, appInfo] = await Promise.all([
    Device.getId().catch(() => ({ identifier: "" })),
    App.getInfo().catch(() => ({ version: "0.0.0" })),
  ]);

  return {
    platform,
    appVersion: appInfo.version,
    deviceId: deviceInfo.identifier,
    biometric,
    signInWithApple,
    iap,
    deepLinks,
    camera,
    share,
    contacts,
    haptics,
    push,
    network,
    app: {
      get coldStart() { return coldStart; },
      async exit() {
        if (platform === "android") {
          await App.exitApp();
        }
        // iOS : Apple interdit explicitement de fermer l'app par code (Guideline 2.5.4).
      },
    },
    ui,
  };
}

async function bootstrap(): Promise<void> {
  // Si on n'est pas dans Capacitor (ex : devtools sur Chrome), on skip
  // tous les bridges natifs — la PWA reste 100 % fonctionnelle en pur web.
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Status bar BMD : mode dark only (texte clair sur fond night #0E0B14)
  try {
    await ui.setStatusBarStyle("dark");
  } catch (err) {
    console.warn("[bmd-mobile] StatusBar init partiel:", err);
  }

  // Construire et exposer le bridge sur window
  try {
    const bridge = await buildBridge();
    window.bmdNative = bridge;

    // Notifier la PWA que les bridges sont prêts (les hooks React peuvent
    // attendre cet event si besoin).
    window.dispatchEvent(new CustomEvent("bmd:native-ready", { detail: { platform: bridge.platform } }));
  } catch (err) {
    console.error("[bmd-mobile] erreur init bridge:", err);
  }

  // Lifecycle global — la PWA peut écouter ces events pour rafraîchir
  void App.addListener("appStateChange", ({ isActive }) => {
    coldStart = false; // après le premier appStateChange, on n'est plus en cold start
    window.dispatchEvent(
      new CustomEvent(isActive ? "bmd:app-resumed" : "bmd:app-backgrounded"),
    );
  });

  // Hardware back Android — déléguer à l'historique de Next.js
  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  });

  // Première frame : on cache la splash après que la PWA a chargé
  // (la PWA peut aussi appeler `window.bmdNative.ui.hideSplash()` plus tôt
  // si elle veut un timing précis, ex: après hydration React).
  window.addEventListener("load", () => {
    setTimeout(() => void ui.hideSplash(), 100);
  });
}

void bootstrap();
