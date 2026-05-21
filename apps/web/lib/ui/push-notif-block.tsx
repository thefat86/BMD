"use client";

/**
 * Bloc d'activation des notifications push web (spec §8.5).
 *
 * À insérer dans la page profil. Détecte automatiquement :
 *  - le support navigateur
 *  - l'état de la permission
 *  - si une subscription existe déjà
 *
 * Permet d'activer / désactiver / tester les notifs en 1 clic.
 */

import { useEffect, useState } from "react";
import { ApiErrorAlert } from "./api-error-alert";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import {
  getPushPermission,
  pushSupported,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "../web-push";

export function PushNotifBlock() {
  const t = useT();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    setSupported(pushSupported());
    setPermission(getPushPermission());
    api.pushVapidPublicKey()
      .then((c) => setServerEnabled(c.enabled))
      .catch(() => setServerEnabled(false));
    if (pushSupported()) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((s) => setSubscribed(s !== null))
        .catch(() => setSubscribed(false));
    }
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMsg(
          perm === "denied"
            ? t("pushNotif.deniedPermission")
            : t("pushNotif.notGranted"),
        );
        return;
      }
      const r = await subscribeToPush();
      if (!r.ok) {
        setErr(new Error(r.reason));
        return;
      }
      setSubscribed(true);
      setMsg(
        r.alreadySubscribed
          ? t("pushNotif.alreadyEnabled")
          : t("pushNotif.enabled"),
      );
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      setMsg(t("pushNotif.disabled"));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await api.pushTest();
      // V132 — Pipeline test = web push (VAPID) + native push (APNs/FCM).
      // On agrège les deux canaux pour le compteur affiché.
      const totalDelivered = r.web.delivered + r.native.delivered;
      const webOk = r.web.ok || r.web.delivered > 0;
      if (webOk || r.native.delivered > 0) {
        setMsg(
          t("pushNotif.testSent", {
            count: String(totalDelivered),
            plural: totalDelivered > 1 ? "s" : "",
          }),
        );
      } else {
        setMsg(t("pushNotif.testNotDelivered"));
      }
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>📲 {t("profile.pushNotifTitle")}</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        {t("profile.pushNotifDescription")}
      </p>

      {!supported && (
        <p style={{ fontSize: 12, color: "#a89a8c", marginTop: 8 }}>
          ⚠️ {t("pushNotif.notSupported")}
        </p>
      )}

      {supported && serverEnabled === false && (
        <p style={{ fontSize: 12, color: "#a89a8c", marginTop: 8 }}>
          ⚠️ {t("pushNotif.noVapid")}
        </p>
      )}

      {supported && serverEnabled && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {subscribed ? (
            <>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={disable}
                disabled={busy}
                style={{ padding: "6px 14px" }}
              >
                🔕 {t("pushNotif.disable")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={sendTest}
                disabled={busy}
                style={{ padding: "6px 14px" }}
              >
                📨 {t("pushNotif.sendTest")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              onClick={enable}
              disabled={busy || permission === "denied"}
              style={{ padding: "6px 14px" }}
            >
              {permission === "denied"
                ? t("pushNotif.blockedByBrowser")
                : t("pushNotif.enableButton")}
            </button>
          )}
        </div>
      )}

      {msg && (
        <p
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#10b981",
            fontStyle: "italic",
          }}
        >
          {msg}
        </p>
      )}

      {err ? <div style={{ marginTop: 10 }}><ApiErrorAlert error={err} /></div> : null}
    </div>
  );
}
