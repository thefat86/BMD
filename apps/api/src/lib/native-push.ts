/**
 * V132 — Push notifications natives APNs (iOS) + FCM (Android).
 *
 * Architecture :
 *   sendNativePushToUser(userId, payload)
 *     → SELECT NativePushToken WHERE userId
 *     → pour chaque token : route APNs (platform=ios) ou FCM (platform=android)
 *     → best-effort : un échec sur un token ne bloque pas les autres
 *     → si 410 (APNs) ou NotRegistered (FCM) → supprime le token (cleanup auto)
 *
 * Choix d'implémentation :
 *   - APNs HTTP/2 en Node `node:http2` pur (pas de lib externe). Réutilise
 *     la connexion via `http2Session` cachée tant qu'elle est ouverte. Apple
 *     ferme la session après idle 1h, on reconnecte à la demande.
 *   - FCM : `firebase-admin` en optional dependency (lazy require). Si la
 *     lib n'est pas installée mais que l'env FIREBASE_* est set, on log un
 *     warn et on skip Android — sans crasher le boot.
 *
 * Feature flag :
 *   - Si APNS_KEY_P8/APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID absents → iOS push désactivés.
 *   - Si FIREBASE_SERVICE_ACCOUNT_JSON absent → Android push désactivés.
 *   - Si ni l'un ni l'autre → la fonction est un no-op silencieux. Le système
 *     in-app continue de fonctionner (notifications DB toujours créées).
 *
 * JWT APNs :
 *   - Apple veut un JWT ES256 signé avec la clé .p8.
 *   - Le JWT est valide 1h, on le cache puis on régénère.
 *   - Header `authorization: bearer <jwt>` sur chaque requête.
 */

import http2 from "node:http2";
import crypto from "node:crypto";
import { prisma } from "./db.js";
import { loadEnv } from "./env.js";

export interface NativePushPayload {
  /** Titre court (ligne 1 de la notif système) */
  title: string;
  /** Corps (ligne 2) — peut être omis pour les notifs minimalistes */
  body?: string;
  /**
   * Data "silencieuse" embarquée (deeplink, ids, kind, …). Côté Capacitor,
   * cette payload arrive dans `notification.data` au tap.
   *
   * Convention BMD :
   *   - `link` : route relative à ouvrir (`/dashboard/groups/<id>`)
   *   - `kind` : NotificationKind (EXPENSE_ADDED, SETTLEMENT_PROPOSED, …)
   *   - `notificationId` : id de la row Notification (pour markAsRead au tap)
   */
  data?: Record<string, string>;
  /** Badge à afficher (iOS uniquement). null → ne pas modifier le badge. */
  badge?: number;
}

interface SendResult {
  delivered: number;
  failed: number;
  skipped: number;
}

// ============================================================
// Helpers config
// ============================================================

function isApnsConfigured(): boolean {
  const env = loadEnv();
  return Boolean(
    env.APNS_BUNDLE_ID && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_KEY_P8,
  );
}

function isFcmConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

/**
 * Indique si au moins un provider natif est configuré. Utile pour
 * gating UI (par ex. ne pas afficher le bouton "envoyer notif test"
 * si rien n'est branché).
 */
export function isNativePushEnabled(): boolean {
  return isApnsConfigured() || isFcmConfigured();
}

// ============================================================
// APNs — JWT ES256 (cache 50 min)
// ============================================================

let cachedApnsJwt: { token: string; expiresAt: number } | null = null;

function generateApnsJwt(): string {
  const env = loadEnv();
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_KEY_P8) {
    throw new Error("APNs not configured");
  }
  // Cache 50 min (Apple invalide à 60 min)
  const now = Date.now();
  if (cachedApnsJwt && cachedApnsJwt.expiresAt > now) {
    return cachedApnsJwt.token;
  }
  const header = {
    alg: "ES256",
    kid: env.APNS_KEY_ID,
  };
  const payload = {
    iss: env.APNS_TEAM_ID,
    iat: Math.floor(now / 1000),
  };
  const b64url = (obj: object): string =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  // Le .p8 peut arriver avec \n littéraux (vars d'env multi-lignes) — on normalise.
  const pemKey = env.APNS_KEY_P8.replace(/\\n/g, "\n");
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  sign.end();
  const der = sign.sign({ key: pemKey, dsaEncoding: "ieee-p1363" });
  const sig = der
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const token = `${signingInput}.${sig}`;
  cachedApnsJwt = { token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

// ============================================================
// APNs — HTTP/2 session (réutilisée)
// ============================================================

let apnsSession: http2.ClientHttp2Session | null = null;

function getApnsSession(): http2.ClientHttp2Session {
  if (apnsSession && !apnsSession.closed && !apnsSession.destroyed) {
    return apnsSession;
  }
  const env = loadEnv();
  const host = env.APNS_PRODUCTION
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
  apnsSession = http2.connect(host);
  apnsSession.on("error", (err) => {
    console.warn("[native-push] APNs session error:", err.message);
  });
  apnsSession.on("close", () => {
    apnsSession = null;
  });
  return apnsSession;
}

/**
 * Envoie une push APNs à un token donné. Retourne true si délivré (200),
 * false sur erreur transient, et "invalid" si le token est mort (410 ou
 * BadDeviceToken) → on doit le supprimer.
 */
async function sendOneApns(
  token: string,
  payload: NativePushPayload,
): Promise<"ok" | "fail" | "invalid"> {
  const env = loadEnv();
  if (!isApnsConfigured()) return "fail";

  const session = getApnsSession();
  const jwt = generateApnsJwt();

  // Format payload APNs (cf. Apple Push Notification Service docs).
  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body ?? "" },
    sound: "default",
  };
  if (typeof payload.badge === "number") aps.badge = payload.badge;

  const body = JSON.stringify({
    aps,
    // Data custom — récupérée côté Capacitor via notification.data
    ...(payload.data ?? {}),
  });

  return new Promise<"ok" | "fail" | "invalid">((resolve) => {
    let settled = false;
    const safeResolve = (v: "ok" | "fail" | "invalid") => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "apns-topic": env.APNS_BUNDLE_ID!,
      "apns-push-type": "alert",
      authorization: `bearer ${jwt}`,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body).toString(),
    });

    let status = 0;
    let responseBody = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.on("data", (chunk) => {
      responseBody += chunk.toString();
    });
    req.on("end", () => {
      if (status === 200) {
        safeResolve("ok");
        return;
      }
      // 410 = token périmé (app désinstallée / refus notif).
      // 400 + BadDeviceToken = même chose.
      if (status === 410 || /BadDeviceToken/i.test(responseBody)) {
        safeResolve("invalid");
        return;
      }
      console.warn(
        `[native-push] APNs ${status}: ${responseBody.slice(0, 200)}`,
      );
      safeResolve("fail");
    });
    req.on("error", (err) => {
      console.warn("[native-push] APNs req error:", err.message);
      safeResolve("fail");
    });

    req.setEncoding("utf8");
    req.write(body);
    req.end();

    // Garde-fou : timeout 10s
    setTimeout(() => safeResolve("fail"), 10_000);
  });
}

// ============================================================
// FCM — firebase-admin lazy require
// ============================================================

let firebaseAdmin: any = null;
let firebaseAttempted = false;

function getFirebaseAdmin(): any | null {
  if (firebaseAttempted) return firebaseAdmin;
  firebaseAttempted = true;

  const env = loadEnv();
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin");
    // Idempotent : si déjà init, on réutilise.
    if (!admin.apps.length) {
      const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, "\n");
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    firebaseAdmin = admin;
    return admin;
  } catch (err) {
    console.warn(
      "[native-push] FIREBASE_SERVICE_ACCOUNT_JSON configuré mais `firebase-admin` non installé / JSON invalide:",
      (err as Error).message,
    );
    return null;
  }
}

async function sendOneFcm(
  token: string,
  payload: NativePushPayload,
): Promise<"ok" | "fail" | "invalid"> {
  const admin = getFirebaseAdmin();
  if (!admin) return "fail";

  try {
    await admin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body ?? "" },
      data: payload.data ?? {},
      android: {
        priority: "high",
        notification: {
          channelId: "bmd_default",
          sound: "default",
        },
      },
    });
    return "ok";
  } catch (err: any) {
    const code = err?.code ?? err?.errorInfo?.code ?? "";
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      return "invalid";
    }
    console.warn(`[native-push] FCM ${code}: ${err?.message ?? err}`);
    return "fail";
  }
}

// ============================================================
// API publique
// ============================================================

/**
 * Envoie un push natif à TOUS les devices enregistrés d'un user.
 * Best-effort : silencieux si rien n'est configuré, log les échecs
 * individuellement, ne throw jamais. Cleanup auto des tokens morts.
 */
export async function sendNativePushToUser(
  userId: string,
  payload: NativePushPayload,
): Promise<SendResult> {
  const result: SendResult = { delivered: 0, failed: 0, skipped: 0 };

  // Court-circuit si rien n'est configuré
  if (!isApnsConfigured() && !isFcmConfigured()) {
    return { ...result, skipped: 1 };
  }

  // V132 · `as any` sur le model tant que Prisma generate n'a pas tourné
  const tokens = (prisma as any).nativePushToken;
  const rows = await tokens
    .findMany({
      where: { userId },
      select: { id: true, platform: true, token: true },
    })
    .catch((err: Error) => {
      // Migration pas encore appliquée — silent skip.
      console.warn("[native-push] table NativePushToken absente?", err.message);
      return [] as Array<{ id: string; platform: string; token: string }>;
    });

  if (rows.length === 0) return { ...result, skipped: 1 };

  await Promise.all(
    rows.map(async (row: { id: string; platform: string; token: string }) => {
      let outcome: "ok" | "fail" | "invalid" = "fail";
      if (row.platform === "ios" && isApnsConfigured()) {
        outcome = await sendOneApns(row.token, payload);
      } else if (row.platform === "android" && isFcmConfigured()) {
        outcome = await sendOneFcm(row.token, payload);
      } else {
        result.skipped += 1;
        return;
      }

      if (outcome === "ok") {
        result.delivered += 1;
        // Best-effort : refresh lastSuccessAt (pas critique si ça échoue)
        await tokens
          .update({
            where: { id: row.id },
            data: { lastSuccessAt: new Date() },
          })
          .catch(() => undefined);
      } else if (outcome === "invalid") {
        // Token mort → cleanup auto (app désinstallée, perm refusée)
        result.failed += 1;
        await tokens
          .delete({ where: { id: row.id } })
          .catch(() => undefined);
      } else {
        result.failed += 1;
      }
    }),
  );

  return result;
}

/**
 * Envoie un push à plusieurs users en parallèle. Wrapper de confort
 * pour les notifications "groupe" (notifyGroupMembers).
 */
export async function sendNativePushToMany(
  userIds: string[],
  payload: NativePushPayload,
): Promise<SendResult> {
  if (userIds.length === 0) {
    return { delivered: 0, failed: 0, skipped: 0 };
  }
  if (!isApnsConfigured() && !isFcmConfigured()) {
    return { delivered: 0, failed: 0, skipped: userIds.length };
  }
  const results = await Promise.all(
    userIds.map((uid) => sendNativePushToUser(uid, payload)),
  );
  return results.reduce<SendResult>(
    (acc, r) => ({
      delivered: acc.delivered + r.delivered,
      failed: acc.failed + r.failed,
      skipped: acc.skipped + r.skipped,
    }),
    { delivered: 0, failed: 0, skipped: 0 },
  );
}
