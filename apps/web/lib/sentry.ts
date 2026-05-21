/**
 * Sentry — wrapper safe pour BMD web.
 * --------------------------------------------------------------
 * On utilise un wrapper plutôt que d'importer @sentry/nextjs directement
 * pour plusieurs raisons :
 *  1. Le package peut ne pas être installé localement (sandbox dev sans accès npm).
 *  2. En dev, on ne veut pas spammer Sentry avec les erreurs HMR / hot-reload.
 *  3. Sans DSN configuré (NEXT_PUBLIC_SENTRY_DSN), on noop silencieusement.
 *
 * Pour activer Sentry en prod :
 *  1. `npm install @sentry/nextjs --workspace=apps/web`
 *  2. Ajouter dans `.env` : NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
 *  3. Init au mount via `initSentry()` (déjà appelé dans error-boundary.tsx)
 *
 * Aucun code applicatif n'a besoin d'importer @sentry/nextjs directement —
 * tout passe par ce wrapper qui restera fonctionnel même si le package
 * est ajouté/retiré.
 */

let initialized = false;
let SentryModule: any = null;

/**
 * Init Sentry au démarrage de l'app. Idempotent. Safe à appeler plusieurs fois.
 * No-op si pas de DSN OU si le package n'est pas installé OU en dev.
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  try {
    // Import dynamique pour ne pas alourdir le bundle si Sentry pas utilisé.
    const Sentry = await import("@sentry/nextjs");
    SentryModule = Sentry;
    Sentry.init({
      dsn,
      // Sample rate volontairement bas en prod pour économiser le quota.
      // Augmente à 0.5-1.0 si tu chasses un bug actif.
      tracesSampleRate: 0.1,
      // Replay des sessions : utile pour reproduire les bugs en prod, mais
      // attention RGPD — les sessions sont enregistrées (masquage texte par
      // défaut OK, mais à valider avec ton DPO).
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      // Filtres : on ignore les erreurs réseau "normales" qui polluent.
      ignoreErrors: [
        "Network request failed",
        "Failed to fetch",
        "Load failed",
        "AbortError",
        "cancelled",
        "NotAllowedError", // WebAuthn refusés
      ],
      // Tags par défaut : permet de filtrer côté Sentry.
      initialScope: {
        tags: {
          app: "bmd-web",
          platform: detectPlatform(),
        },
      },
    });
    initialized = true;
    // eslint-disable-next-line no-console
    console.info("[BMD] Sentry initialisé");
  } catch {
    // Package non installé ou DSN invalide — on noop silencieusement.
  }
}

/** Capture manuelle d'une erreur (utilisé dans les catch importants). */
export function captureError(err: unknown, context?: Record<string, any>): void {
  if (!initialized || !SentryModule) return;
  try {
    SentryModule.withScope((scope: any) => {
      if (context) {
        for (const [k, v] of Object.entries(context)) {
          scope.setExtra(k, v);
        }
      }
      SentryModule.captureException(err);
    });
  } catch {
    /* fail silently */
  }
}

/** Capture un message informatif (warning, info important). */
export function captureMessage(
  msg: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!initialized || !SentryModule) return;
  try {
    SentryModule.captureMessage(msg, level);
  } catch {
    /* fail silently */
  }
}

/** Identifie l'utilisateur courant (utile pour debug par user). */
export function identifyUser(user: { id: string; displayName?: string }): void {
  if (!initialized || !SentryModule) return;
  try {
    SentryModule.setUser({
      id: user.id,
      username: user.displayName,
    });
  } catch {
    /* fail silently */
  }
}

/** Clear l'identification (au logout). */
export function clearUser(): void {
  if (!initialized || !SentryModule) return;
  try {
    SentryModule.setUser(null);
  } catch {
    /* fail silently */
  }
}

function detectPlatform(): string {
  if (typeof window === "undefined") return "ssr";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "web";
}
