/**
 * Sentry — wrapper safe pour BMD api (Fastify backend).
 * --------------------------------------------------------------
 * Init au boot du serveur si SENTRY_DSN est set. Capture les erreurs
 * via le hook `onError` de Fastify (cf. server.ts).
 *
 * Pour activer en prod :
 *  1. `npm install @sentry/node --workspace=apps/api`
 *  2. Ajouter dans `.env` : SENTRY_DSN=https://...@sentry.io/...
 *  3. Init via `initSentry()` au début de server.ts
 *  4. Brancher `app.setErrorHandler` pour envoyer les erreurs (cf. server.ts)
 */

let initialized = false;
let SentryModule: any = null;

export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (process.env.NODE_ENV !== "production") return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/node");
    SentryModule = Sentry;
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      // Filtres : on ignore les erreurs "métier" attendues (ApiError) qui
      // ne sont PAS des bugs — juste des règles business (rate limit,
      // not found, unauthorized, etc.).
      beforeSend(event: any, hint: any) {
        const err = hint?.originalException;
        // Notre AppError a un status — on n'envoie que les 5xx en Sentry.
        if (err && typeof err === "object" && "status" in err) {
          const status = (err as { status: number }).status;
          if (status >= 400 && status < 500) {
            return null; // Skip les 4xx (erreurs client)
          }
        }
        return event;
      },
      initialScope: {
        tags: { app: "bmd-api" },
      },
    });
    initialized = true;
    // eslint-disable-next-line no-console
    console.info("[BMD api] Sentry initialisé");
  } catch {
    // Package non installé — noop.
  }
}

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

export function flushSentry(timeout = 2000): Promise<boolean> {
  if (!initialized || !SentryModule) return Promise.resolve(true);
  try {
    return SentryModule.flush(timeout);
  } catch {
    return Promise.resolve(true);
  }
}
