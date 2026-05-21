/**
 * Push notifications — APNs (iOS) + FCM (Android).
 *
 * Workflow :
 *  1. App native demande la permission utilisateur (prompt système).
 *  2. Si accordée, on récupère un token unique device.
 *  3. On envoie ce token à `/push/register-device` côté API BMD.
 *  4. Le backend stocke le token dans `PushSubscription` lié à l'utilisateur.
 *  5. Quand le scheduler ou un event business veut notifier, il pousse
 *     vers APNs (iOS) ou FCM (Android) avec le token.
 *
 * Côté natif Phase 3 :
 *  iOS — Activer Push Notifications dans Capabilities Xcode + uploader le
 *  certificat .p8 vers le serveur (variables BMD_APNS_KEY_ID, BMD_APNS_TEAM_ID).
 *  Android — Ajouter `google-services.json` dans `android/app/`.
 */

import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";

type ReceivedHandler = (notif: { title: string; body: string; data: Record<string, string> }) => void;
type TappedHandler = (notif: { data: Record<string, string> }) => void;

const receivedHandlers = new Set<ReceivedHandler>();
const tappedHandlers = new Set<TappedHandler>();
let listenersAttached = false;

async function attachListenersOnce(): Promise<void> {
  if (listenersAttached) return;
  listenersAttached = true;

  await PushNotifications.addListener("pushNotificationReceived", (notif) => {
    const payload = {
      title: notif.title ?? "",
      body: notif.body ?? "",
      data: (notif.data as Record<string, string>) ?? {},
    };
    receivedHandlers.forEach((h) => h(payload));
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const payload = {
      data: (action.notification.data as Record<string, string>) ?? {},
    };
    tappedHandlers.forEach((h) => h(payload));
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("[bmd-push] registration error:", err.error);
  });
}

export const push = {
  async requestPermission(): Promise<{ granted: boolean }> {
    if (Capacitor.getPlatform() === "web") return { granted: false };
    const { receive } = await PushNotifications.requestPermissions();
    return { granted: receive === "granted" };
  },

  /**
   * V132 — Crée le Notification Channel par défaut côté Android (obligatoire
   * à partir d'Android 8.0 / API 26). Sans channel, les push FCM n'affichent
   * AUCUNE notif système même si tout le reste est bon.
   *
   * No-op côté iOS (Apple gère les channels via les Notification Categories,
   * pas nécessaire pour le MVP).
   */
  async ensureAndroidChannel(): Promise<void> {
    if (Capacitor.getPlatform() !== "android") return;
    try {
      await (PushNotifications as any).createChannel?.({
        id: "bmd_default",
        name: "BMD",
        description: "Notifications BMD : dépenses, règlements, tontines",
        importance: 4, // IMPORTANCE_HIGH → notif visible + son
        visibility: 1, // VISIBILITY_PUBLIC
        sound: "default",
        vibration: true,
        lights: true,
        lightColor: "#C58A2E",
      });
    } catch (err) {
      console.warn("[bmd-push] createChannel failed:", err);
    }
  },

  async register(): Promise<{ token: string; provider: "apns" | "fcm" }> {
    if (Capacitor.getPlatform() === "web") {
      throw new Error("push.register() inutile en web — utiliser Web Push (VAPID) côté PWA");
    }

    // V132 — Toujours s'assurer du channel Android AVANT register (idempotent).
    await this.ensureAndroidChannel();
    await attachListenersOnce();

    return new Promise((resolve, reject) => {
      const tokenListener = PushNotifications.addListener("registration", (info) => {
        void tokenListener.then((l) => l.remove());
        resolve({
          token: info.value,
          provider: Capacitor.getPlatform() === "ios" ? "apns" : "fcm",
        });
      });

      // Lance la registration ; le callback `registration` ci-dessus reçoit le token.
      PushNotifications.register().catch(reject);
    });
  },

  onReceived(handler: ReceivedHandler): () => void {
    receivedHandlers.add(handler);
    void attachListenersOnce();
    return () => receivedHandlers.delete(handler);
  },

  onTapped(handler: TappedHandler): () => void {
    tappedHandlers.add(handler);
    void attachListenersOnce();
    return () => tappedHandlers.delete(handler);
  },
};
