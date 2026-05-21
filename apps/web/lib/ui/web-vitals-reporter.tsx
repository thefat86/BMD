"use client";

/**
 * V176 — Reporter Core Web Vitals (LCP / INP / CLS / FCP / TTFB).
 *
 * Branché une seule fois dans `app/layout.tsx`. À chaque mesure remontée
 * par la lib `web-vitals`, on POST l'événement au backend
 * (`/metrics/web-vitals`, route publique). Utilise `keepalive: true` pour
 * que la requête survive même si l'utilisateur quitte la page.
 *
 * Choix techniques :
 *  - Import dynamique de `web-vitals` (pas dans le bundle initial).
 *  - Un seul navigationId par session de page (UUID si dispo).
 *  - Best-effort silent : si le POST échoue, on l'ignore (rien ne doit
 *    bloquer l'expérience user).
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Un navigationId stable pour toute la durée de vie de la page.
// Permet plus tard d'agréger les 5 métriques côté admin si besoin.
const NAV_ID: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function getDeviceType(): "mobile" | "desktop" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function getConnectionType(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  // `navigator.connection` est non-standard mais largement supporté
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } })
    .connection;
  return conn?.effectiveType;
}

/**
 * Calcule l'URL de l'API pour le POST métrique.
 * Stratégie alignée sur `lib/api-client.ts` : env si valide, sinon dérive
 * depuis window.location.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isTunnel =
      host.endsWith(".ngrok-free.dev") ||
      host.endsWith(".ngrok-free.app") ||
      host.endsWith(".ngrok.io") ||
      host.endsWith(".trycloudflare.com");
    if (isTunnel) {
      return `${window.location.protocol}//${host}/_api`;
    }
    const envIsLocalhost =
      !!fromEnv && (fromEnv.includes("localhost") || fromEnv.includes("127.0.0.1"));
    const browserIsLocalhost = host === "localhost" || host === "127.0.0.1";
    if (fromEnv && !(envIsLocalhost && !browserIsLocalhost)) return fromEnv;
    return `${window.location.protocol}//${host}:4000`;
  }
  return fromEnv ?? "";
}

interface WebVitalMetric {
  name: string;
  value: number;
  rating: string;
}

export function WebVitalsReporter(): null {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    let cancelled = false;
    // Import dynamique pour ne pas alourdir le bundle initial (LCP de
    // notre propre app, justement). La lib est ~5 KB gzip.
    import("web-vitals")
      .then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
        if (cancelled) return;
        const apiUrl = resolveApiUrl();

        const report = (metric: WebVitalMetric) => {
          try {
            const body = JSON.stringify({
              name: metric.name,
              value: metric.value,
              rating: metric.rating,
              page: pathname,
              deviceType: getDeviceType(),
              locale:
                typeof document !== "undefined"
                  ? document.documentElement.lang || undefined
                  : undefined,
              connectionType: getConnectionType(),
              userAgent:
                typeof navigator !== "undefined"
                  ? navigator.userAgent.slice(0, 500)
                  : undefined,
              navigationId: NAV_ID,
            });
            // `keepalive: true` permet à la requête de survivre à un
            // unload (essentiel pour LCP/CLS qui se résolvent à la fin).
            void fetch(`${apiUrl}/metrics/web-vitals`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              keepalive: true,
              body,
            }).catch(() => {
              /* silent */
            });
          } catch {
            /* silent */
          }
        };

        onLCP(report);
        onINP(report);
        onCLS(report);
        onFCP(report);
        onTTFB(report);
      })
      .catch(() => {
        // web-vitals pas installé ou indisponible → no-op
      });

    return () => {
      cancelled = true;
    };
    // Pas de dépendance sur `pathname` pour les callbacks (web-vitals
    // gère son propre cycle de vie par navigation). Mais on re-bind à
    // chaque pathname change pour capturer le `page` actuel.
  }, [pathname]);

  return null;
}
