"use client";

/**
 * <ErrorBoundary> · Capture les erreurs React et affiche un fallback.
 *
 * À placer haut dans l'arbre (layout.tsx) pour qu'un crash isolé d'un
 * composant ne fasse pas planter toute l'app. Stratégie :
 *  - Affiche une page d'excuses élégante avec :
 *    1. Le message de l'erreur (utile pour le user qui doit reporter)
 *    2. Un bouton "Réessayer" qui reset l'état React
 *    3. Un bouton "Retour à l'accueil" pour s'extraire du contexte cassé
 *  - Log dans la console (et future télémétrie) pour debugging
 *  - Auto-recovery : si l'erreur est passagère (network blip), un simple
 *    reset suffit. Sinon le user va vers l'accueil.
 *
 * Note : les Error Boundaries ne capturent PAS :
 *  - Les erreurs dans les event handlers (try/catch perso)
 *  - Le code asynchrone (utiliser .catch())
 *  - Les erreurs côté serveur (SSR) — Next a son propre error.tsx
 *  - Les erreurs dans le boundary lui-même
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Fallback UI custom (par défaut : DefaultFallback). */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log structuré pour debugging — à brancher sur Sentry / Datadog plus tard
    // eslint-disable-next-line no-console
    console.error("[BMD ErrorBoundary]", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const Fallback = this.props.fallback ?? DefaultFallback;
      return <Fallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "var(--cream, #f4e4c1)",
        textAlign: "center",
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
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 32,
          fontWeight: 700,
          margin: "0 0 8px",
          maxWidth: 480,
        }}
      >
        Oups, un grain de sable
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
        BMD a rencontré un imprévu. Tes données sont en sécurité — c'est
        juste l'affichage qui a craqué. Tu peux réessayer ou rentrer à
        l'accueil.
      </p>

      {/* Détail technique pour debug — repliable pour ne pas effrayer */}
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
        <summary style={{ cursor: "pointer", color: "var(--cream-soft)" }}>
          Détail technique
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
        Si ça persiste, contacte-nous à{" "}
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
