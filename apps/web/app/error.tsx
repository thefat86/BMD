"use client";

/**
 * Global error boundary Next.js (app dir).
 *
 * S'affiche quand une route render-server ou render-client throw une erreur
 * qui remonte hors de notre <ErrorBoundary> React. Différent de la
 * `<ErrorBoundary>` dans layout.tsx (qui couvre les enfants synchrones du
 * layout) — ici Next.js capture les erreurs de route async aussi.
 *
 * UX cohérente avec le composant <DefaultFallback> : illustration 🌪️,
 * détail technique repliable, boutons « Réessayer » + « Accueil ».
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log structuré pour télémétrie (à brancher Sentry/Datadog plus tard).
    // eslint-disable-next-line no-console
    console.error("[BMD Route Error]", error.digest, error.message, error.stack);
  }, [error]);

  return (
    <div
      role="alert"
      // V129 — Migration V45-light : écran d'erreur global cohérent avec
      // le reste de l'app (avant : gradient dark indigo→night sur un fond
      // déjà light → flash perturbant). Couleurs ivory/paper/cocoa de la
      // palette V45.
      style={{
        minHeight: "100dvh",
        background: "var(--ivory, #FBF6EC)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "var(--cocoa, #2B1F15)",
        textAlign: "center",
        fontFamily:
          "var(--font-inter, Inter), -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 56,
          marginBottom: 12,
          filter: "drop-shadow(0 8px 24px rgba(197,138,46,0.30))",
        }}
        aria-hidden
      >
        🌪️
      </div>
      <h1
        style={{
          fontFamily:
            "var(--font-cormorant, 'Cormorant Garamond'), Georgia, serif",
          fontSize: 32,
          fontWeight: 700,
          margin: "0 0 8px",
          maxWidth: 480,
          color: "var(--cocoa, #2B1F15)",
        }}
      >
        Cette page a vrillé
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--cocoa-soft, #6B5B47)",
          margin: "0 0 20px",
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        Une erreur a empêché le chargement. Tes données sont en sécurité.
        Tu peux réessayer ou rentrer à l'accueil.
      </p>

      <details
        style={{
          maxWidth: 480,
          width: "100%",
          textAlign: "left",
          marginBottom: 24,
          background: "var(--paper, #FFFFFF)",
          border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 12,
          color: "var(--cocoa-mute, #A99580)",
        }}
      >
        <summary
          style={{ cursor: "pointer", color: "var(--cocoa-soft, #6B5B47)" }}
        >
          Détail technique{error.digest ? ` · ${error.digest}` : ""}
        </summary>
        <pre
          style={{
            marginTop: 8,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "var(--v45-terracotta, #B54732)",
          }}
        >
          {error.message}
        </pre>
      </details>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "12px 22px",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #B54732))",
            color: "var(--paper, #FFFFFF)",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            minHeight: 48,
            boxShadow: "0 6px 18px rgba(197,138,46,0.25)",
            fontFamily: "inherit",
          }}
        >
          ↻ Réessayer
        </button>
        <a
          href="/dashboard"
          style={{
            padding: "12px 22px",
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.12))",
            color: "var(--cocoa, #2B1F15)",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            minHeight: 48,
          }}
        >
          ← Accueil
        </a>
      </div>

      <p
        style={{
          marginTop: 30,
          fontSize: 11,
          color: "var(--cocoa-mute, #A99580)",
        }}
      >
        Si ça persiste, écris-nous à{" "}
        <a
          href="mailto:support@backmesdo.com"
          style={{ color: "var(--v45-saffron, #C58A2E)" }}
        >
          support@backmesdo.com
        </a>
      </p>
    </div>
  );
}
