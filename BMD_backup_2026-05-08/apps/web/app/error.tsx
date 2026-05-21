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
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "var(--cream, #f4e4c1)",
        textAlign: "center",
        fontFamily:
          "var(--font-inter, Inter), -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 56,
          marginBottom: 12,
          filter: "drop-shadow(0 8px 24px rgba(232,163,61,0.4))",
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
        }}
      >
        Cette page a vrillé
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--cream-soft, #e8d5b7)",
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
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 12,
          color: "var(--cream-muted, #aaa)",
        }}
      >
        <summary
          style={{ cursor: "pointer", color: "var(--cream-soft)" }}
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
            color: "var(--rose, #d9714a)",
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
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "#16111E",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            minHeight: 48,
            boxShadow: "0 6px 18px rgba(181,70,46,0.25)",
            fontFamily: "inherit",
          }}
        >
          ↻ Réessayer
        </button>
        <a
          href="/dashboard"
          style={{
            padding: "12px 22px",
            background: "rgba(244,228,193,0.06)",
            border: "1px solid rgba(244,228,193,0.18)",
            color: "var(--cream)",
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
          color: "var(--cream-muted, #888)",
        }}
      >
        Si ça persiste, écris-nous à{" "}
        <a
          href="mailto:support@backmesdo.com"
          style={{ color: "var(--saffron, #e8a33d)" }}
        >
          support@backmesdo.com
        </a>
      </p>
    </div>
  );
}
