"use client";

/**
 * <NativePushBoot /> · V132 — Câblage push natif Capacitor (APNs iOS / FCM Android).
 *
 * Placé dans le layout dashboard (après auth gate). Se déclenche une seule
 * fois par session quand :
 *   - on est dans la coque Capacitor (pas en PWA pur)
 *   - le user est authentifié (bmd_token présent)
 *
 * Workflow :
 *   1. Demande la permission OS (alerte iOS / dialog Android 13+)
 *   2. Si accordée → register() → reçoit un token APNs/FCM opaque
 *   3. POST /push/register-native avec le token + meta device
 *   4. Attache un listener tap → navigue vers data.link (deeplink natif)
 *
 * Anti-spam :
 *   - On ne redemande pas la permission si déjà refusée ou déjà accordée
 *     pour ce token (dédup par localStorage `bmd_push_token`).
 *   - Si l'OS rejette (mode Avion, etc.) → silent, log console, on réessaie
 *     au prochain mount.
 *
 * Ce composant ne render RIEN — c'est juste un side-effect.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNative } from "../use-native";
import { api } from "../api-client";

const LOCAL_KEY_LAST_TOKEN = "bmd_push_native_token";

// Sentinelle module — empêche le double mount React StrictMode de relancer
// la registration. Vidée au logout (cf. /logout côté shell qui clear le
// localStorage + reload).
let bootDone = false;

export function NativePushBoot(): null {
  const native = useNative();
  const router = useRouter();
  const handlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Bail-outs : pas de coque Capacitor, ou déjà démarré ce process
    if (!native) return;
    if (bootDone) return;

    // Auth gate : pas de token → pas de register (cas où le composant est
    // monté sur une route publique par erreur, ou que le user vient juste
    // de logout).
    if (typeof window === "undefined") return;
    const authToken = window.localStorage.getItem("bmd_token");
    if (!authToken) return;

    bootDone = true;
    let cancelled = false;

    void (async () => {
      try {
        // 1. Permission OS (no-op si déjà accordée)
        const { granted } = await native.push.requestPermission();
        if (!granted) {
          console.info("[bmd-push] permission refusée par l'utilisateur");
          return;
        }
        if (cancelled) return;

        // 2. Register auprès du provider OS (APNs / FCM)
        const { token, provider } = await native.push.register();
        if (cancelled) return;

        // 3. Send au backend (idempotent — réenregistre si rebind device)
        const lastSent = window.localStorage.getItem(LOCAL_KEY_LAST_TOKEN);
        if (lastSent === token) {
          // Token déjà sync — skip pour éviter du trafic inutile au cold-start.
          // Le backend a un `lastSeenAt` mais on s'en occupe à la prochaine
          // rotation du token (ou au login fresh).
        } else {
          await api
            .pushRegisterNative({
              platform: provider === "apns" ? "ios" : "android",
              token,
              deviceName: getDeviceLabel(native.platform),
              appVersion: native.appVersion,
              capacitorDeviceId: native.deviceId || undefined,
            })
            .then(() => {
              window.localStorage.setItem(LOCAL_KEY_LAST_TOKEN, token);
            })
            .catch((err) => {
              console.warn("[bmd-push] register-native API failed:", err);
            });
        }

        // 4. Listener tap → navigation deeplink
        //    `data.link` = route relative (`/dashboard/groups/<id>`)
        //    Sinon fallback `/notifications/<id>` puis dashboard.
        const offTap = native.push.onTapped(({ data }) => {
          const link = (data?.link ?? "").trim();
          const notifId = (data?.notificationId ?? "").trim();
          let target = "/dashboard";
          if (link.startsWith("/")) {
            target = link;
          } else if (notifId) {
            target = `/notifications/${notifId}`;
          }
          try {
            router.push(target);
          } catch (err) {
            console.warn("[bmd-push] router.push failed:", err);
          }
        });

        handlerRef.current = offTap;
      } catch (err) {
        console.warn("[bmd-push] boot failed:", err);
        // On laisse bootDone=true pour ne pas spammer en boucle. Au prochain
        // cold-start (kill app + relance), on retentera.
      }
    })();

    return () => {
      cancelled = true;
      handlerRef.current?.();
      handlerRef.current = null;
    };
  }, [native, router]);

  return null;
}

/** Label user-friendly du device (ex: "iPhone (iOS)" / "Android device"). */
function getDeviceLabel(platform: string): string {
  if (platform === "ios") return "iPhone (iOS)";
  if (platform === "android") return "Android";
  return "Unknown device";
}
