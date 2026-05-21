/**
 * Helpers Web Push côté client.
 *
 * Workflow :
 *  1. requestNotificationPermission() → l'utilisateur autorise
 *  2. subscribeToPush() → enregistre une PushSubscription côté navigateur
 *     ET appelle notre API /push/subscribe pour la persister
 *  3. unsubscribeFromPush() → désactive proprement
 *
 * Pour que ça marche : le service worker /sw.js doit être enregistré
 * (déjà fait par PwaRegister dans layout.tsx).
 */
import { api } from "./api-client";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

/** Vérifie si le navigateur supporte les push web. */
export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** État actuel de la permission de notification. */
export function getPushPermission(): PushPermission {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

/**
 * Demande la permission utilisateur. À appeler depuis un click handler
 * (les navigateurs refusent autrement).
 */
export async function requestNotificationPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  const result = await Notification.requestPermission();
  return result as PushPermission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Inscrit le navigateur courant aux push notifications.
 * Doit être appelé après que l'utilisateur ait autorisé les notifs.
 *
 * Retourne :
 *  - { ok: true, alreadySubscribed }
 *  - { ok: false, reason }
 */
export async function subscribeToPush(): Promise<
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; reason: string }
> {
  if (!pushSupported())
    return { ok: false, reason: "Ton navigateur ne supporte pas les push." };
  if (Notification.permission !== "granted")
    return { ok: false, reason: "Permission de notification non accordée." };

  // 1. Récupère la clé VAPID publique du serveur
  const cfg = await api.pushVapidPublicKey().catch(() => ({ enabled: false, key: null }));
  if (!cfg.enabled || !cfg.key)
    return {
      ok: false,
      reason:
        "Les notifications push ne sont pas encore activées sur ce serveur.",
    };

  // 2. Récupère le service worker registration
  const reg = await navigator.serviceWorker.ready;

  // 3. Vérifie si une subscription existe déjà pour ce browser
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // On envoie quand même au backend (au cas où il ne la connaîtrait pas)
    const json = existing.toJSON() as PushSubscriptionJSON;
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await api.pushSubscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    }
    return { ok: true, alreadySubscribed: true };
  }

  // 4. Crée une nouvelle subscription
  // Cast en BufferSource compatible avec PushSubscriptionOptionsInit (TS strict)
  const appServerKey = urlBase64ToUint8Array(cfg.key);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appServerKey.buffer.slice(
      appServerKey.byteOffset,
      appServerKey.byteOffset + appServerKey.byteLength,
    ) as ArrayBuffer,
  });
  const json = sub.toJSON() as PushSubscriptionJSON;
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "Subscription invalide retournée par le navigateur." };
  }
  await api.pushSubscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return { ok: true, alreadySubscribed: false };
}

/** Désinscrit le navigateur courant des push notifications. */
export async function unsubscribeFromPush(): Promise<{ ok: boolean }> {
  if (!pushSupported()) return { ok: false };
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (!existing) return { ok: true };
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  await api.pushUnsubscribe({ endpoint }).catch(() => {});
  return { ok: true };
}

interface PushSubscriptionJSON {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}
