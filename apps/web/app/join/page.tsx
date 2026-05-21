"use client";

/**
 * V174.D — Page /join : coller un lien d'invitation
 *
 * Pré-existait /join/[token] mais pas /join → cliquer "Le coller →" depuis
 * le dashboard donnait 404. On crée ici une page d'accueil simple où l'user
 * colle un lien BMD reçu par WhatsApp/SMS/email et on l'envoie sur la bonne
 * route /join/[token] ou /invite/[token].
 *
 * Robustesse :
 *  - Accepte un URL complet (https://app.bmd.com/join/xxxx) OU juste le token
 *  - Accepte aussi /invite/[token] (vieux liens)
 *  - Trim + validation token alphanumérique non vide
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "../../lib/i18n/app-strings";

function extractToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Cas 1 : URL contenant /join/xxx ou /invite/xxx
  const match = trimmed.match(/\/(?:join|invite)\/([A-Za-z0-9_-]+)/);
  if (match) return match[1] ?? null;

  // Cas 2 : juste le token brut (alphanumérique + tirets)
  if (/^[A-Za-z0-9_-]{6,}$/.test(trimmed)) return trimmed;

  return null;
}

export default function JoinIndexPage(): JSX.Element {
  const router = useRouter();
  const t = useT();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = extractToken(value);
    if (!token) {
      setError(
        t("join.invalidLink") ||
          "Ce lien n'a pas l'air valide. Vérifie et réessaie.",
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    // On préfère /join/[token] qui gère lookup + auth flow
    router.replace(`/join/${encodeURIComponent(token)}`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--v45-bg, #fff7e8)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        color: "var(--v45-ink, #2a1f12)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--v45-surface, #ffffff)",
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 24px 48px rgba(42,31,18,0.08)",
          border: "1px solid var(--v45-border, rgba(42,31,18,0.08))",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }} aria-hidden>
          🔗
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 6px",
            fontFamily: "var(--v45-font-display, inherit)",
          }}
        >
          {t("join.heading") || "Coller ton lien d'invitation"}
        </h1>
        <p
          style={{
            fontSize: 14,
            opacity: 0.7,
            margin: "0 0 20px",
            lineHeight: 1.5,
          }}
        >
          {t("join.description") ||
            "Colle ici le lien BMD que tu as reçu (WhatsApp, SMS, email). On te redirige automatiquement."}
        </p>

        <form onSubmit={onSubmit}>
          <input
            type="text"
            inputMode="url"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="https://app.bmd.com/join/..."
            aria-label={t("join.linkLabel") || "Lien d'invitation"}
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: 15,
              borderRadius: 12,
              border: error
                ? "1px solid #c0392b"
                : "1px solid var(--v45-border, rgba(42,31,18,0.12))",
              background: "var(--v45-bg, #fff7e8)",
              color: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {error && (
            <div
              role="alert"
              style={{
                color: "#c0392b",
                fontSize: 13,
                marginTop: 8,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !value.trim()}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "13px 18px",
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 12,
              border: "none",
              background: "var(--v45-accent, #e8a33d)",
              color: "#fff",
              cursor:
                submitting || !value.trim() ? "not-allowed" : "pointer",
              opacity: submitting || !value.trim() ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {submitting
              ? t("join.opening") || "Ouverture…"
              : t("join.cta") || "Rejoindre"}
          </button>
        </form>

        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid var(--v45-border, rgba(42,31,18,0.08))",
            fontSize: 13,
            opacity: 0.7,
            textAlign: "center",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              color: "var(--v45-accent, #e8a33d)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ← {t("join.back") || "Retour au tableau de bord"}
          </Link>
        </div>
      </div>
    </main>
  );
}
