/**
 * Hook React pour accéder au bridge natif Capacitor depuis la PWA.
 *
 * Pattern :
 *   const native = useNative();
 *   if (native?.platform === "ios") {
 *     // exclusivement iOS
 *   }
 *   await native?.haptics.impact("success");  // no-op en web
 *
 * Le hook retourne `null` si on est dans un navigateur classique (pas
 * dans la coque Capacitor). Tous les composants doivent traiter ce cas
 * et fournir un fallback web si nécessaire (ex: `navigator.share()`,
 * `navigator.vibrate()`, redirection OAuth web pour Sign in with Apple).
 *
 * Le hook réagit à l'event `bmd:native-ready` émis par `apps/mobile/src/index.ts`
 * — utile parce que le bridge se construit après le premier render.
 */

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Type strict du bridge — réimporté depuis @bmd/mobile pour autocomplétion.
 * On utilise un import dynamique TS-only (`import type`) pour ne PAS
 * embarquer le code mobile dans le bundle web (Next.js tree-shake).
 */
import type { BmdNativeBridge } from "@bmd/mobile/src/bridge";

let nativeReady = false;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((s) => s());
}

if (typeof window !== "undefined") {
  // Si le bridge est déjà là au moment où ce module charge (cold start
  // Capacitor avant le 1er render React), on est prêt direct.
  if (window.bmdNative) {
    nativeReady = true;
  }
  // Sinon, on attend l'event.
  window.addEventListener(
    "bmd:native-ready",
    () => {
      nativeReady = true;
      notify();
    },
    { once: true },
  );
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot(): BmdNativeBridge | null {
  if (typeof window === "undefined") return null;
  if (!nativeReady) return null;
  return window.bmdNative ?? null;
}

function getServerSnapshot(): BmdNativeBridge | null {
  return null; // SSR : pas de Capacitor
}

/**
 * Hook principal. Retourne le bridge ou `null`.
 */
export function useNative(): BmdNativeBridge | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Hook utilitaire : true si on est dans la coque iOS.
 * Pratique pour afficher Sign in with Apple comme bouton primaire,
 * ou pour utiliser StoreKit IAP au lieu de Stripe sur les abonnements.
 */
export function useIsIOS(): boolean {
  const native = useNative();
  return native?.platform === "ios";
}

/**
 * Hook utilitaire : true si on est dans la coque Android.
 */
export function useIsAndroid(): boolean {
  const native = useNative();
  return native?.platform === "android";
}

/**
 * Hook utilitaire : true si on est dans Capacitor (peu importe la plateforme).
 * Utile pour distinguer "PWA installée" (false) vs "app native" (true).
 */
export function useIsNativeApp(): boolean {
  const native = useNative();
  return native !== null;
}

/**
 * Hook simplifié pour appeler les haptics — fait un fallback gracieux
 * vers `navigator.vibrate()` en web pur.
 */
export function useHaptics() {
  const native = useNative();
  return {
    async impact(pattern: "tap" | "select" | "success" | "warn" | "error"): Promise<void> {
      if (native) {
        await native.haptics.impact(pattern);
        return;
      }
      // Fallback web — vibrate() ignoré sur iOS Safari mais marche sur Android.
      const durations: Record<typeof pattern, number | number[]> = {
        tap: 10,
        select: 5,
        success: [10, 30, 10],
        warn: [20, 50, 20],
        error: [30, 80, 30],
      };
      try {
        navigator.vibrate?.(durations[pattern] as any);
      } catch {
        // Pas de vibrate API — silent
      }
    },
  };
}

/**
 * Hook qui écoute les deep links arrivant via Universal Links iOS / App Links Android.
 * Branche sur le router Next.js automatiquement si on lui passe `useRouter().push`.
 */
export function useDeepLinkListener(handler: (link: { pathname: string; query: Record<string, string> }) => void): void {
  const native = useNative();
  useEffect(() => {
    if (!native) return;
    const unsub = native.deepLinks.onLink((link) => {
      handler({ pathname: link.pathname, query: link.query });
    });
    return unsub;
  }, [native, handler]);
}

/**
 * Hook pour récupérer la connectivité courante.
 */
export function useNetworkStatus(): { connected: boolean; type: string } {
  const native = useNative();
  const [status, setStatus] = useState<{ connected: boolean; type: string }>({
    connected: typeof navigator !== "undefined" ? navigator.onLine : true,
    type: "unknown",
  });

  useEffect(() => {
    if (!native) {
      // Web fallback
      const onOnline = () => setStatus({ connected: true, type: "unknown" });
      const onOffline = () => setStatus({ connected: false, type: "none" });
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      return () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    }
    void native.network.status().then(setStatus);
    const unsub = native.network.onChange(({ connected }) =>
      setStatus((s) => ({ ...s, connected })),
    );
    return unsub;
  }, [native]);

  return status;
}
