"use client";

/**
 * <DashboardEmptyState /> · Premier contact d'un user sans aucun groupe.
 *
 * Refondre l'ancien "🌱 Aucun groupe pour l'instant" en une page
 * d'onboarding inviting :
 *  - Hero gradient saffron→terracotta avec illustration SVG
 *  - Mini-titre + slogan
 *  - 4 cartes-suggestions cliquables (Tontine / Voyage / Coloc / Événement)
 *    qui pré-remplissent le type au moment de l'ouverture du modal
 *  - Petit bandeau "Tu as déjà un lien d'invitation ?" qui pousse vers /join
 *
 * Le composant est utilisé en mobile ET en desktop — il s'adapte via
 * grid template + media query inline.
 */
import Link from "next/link";

interface Suggestion {
  type: string;
  emoji: string;
  title: string;
  hint: string;
  /** Couleur d'accent pour la bordure/glow */
  accent: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    type: "TONTINE",
    emoji: "🪙",
    title: "Tontine",
    hint: "L'épargne tournante en famille ou entre amis",
    accent: "#e8a33d",
  },
  {
    type: "TRAVEL",
    emoji: "✈️",
    title: "Voyage",
    hint: "Dépenses partagées d'un trip — Dakar, Marrakech, Bali…",
    accent: "#5b9eef",
  },
  {
    type: "COLOC",
    emoji: "🏠",
    title: "Coloc",
    hint: "Loyer, courses, factures partagés au mois",
    accent: "#66cdaa",
  },
  {
    type: "EVENT",
    emoji: "💍",
    title: "Événement",
    hint: "Mariage, baptême, anniversaire — collecte + dépenses",
    accent: "#b54732",
  },
];

export function DashboardEmptyState({
  onCreate,
  /** Si défini, le callback reçoit le type pré-sélectionné. */
  onCreateWithType,
}: {
  onCreate?: () => void;
  onCreateWithType?: (type: string) => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.08))",
        border: "1px solid rgba(232,163,61,0.25)",
        borderRadius: 18,
        padding: "32px 22px 22px",
        overflow: "hidden",
      }}
      data-testid="dashboard-empty-state"
    >
      {/* Décor géométrique léger en arrière-plan (cercles concentriques) */}
      <svg
        aria-hidden
        width="200"
        height="200"
        viewBox="0 0 200 200"
        style={{
          position: "absolute",
          right: -50,
          top: -50,
          opacity: 0.22,
          pointerEvents: "none",
        }}
      >
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke="var(--saffron, #e8a33d)"
          strokeWidth="0.6"
        />
        <circle
          cx="100"
          cy="100"
          r="65"
          fill="none"
          stroke="var(--saffron, #e8a33d)"
          strokeWidth="0.6"
        />
        <circle
          cx="100"
          cy="100"
          r="40"
          fill="none"
          stroke="var(--saffron, #e8a33d)"
          strokeWidth="0.6"
        />
        <circle cx="100" cy="100" r="6" fill="var(--saffron, #e8a33d)" />
      </svg>

      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 8 }}>👋</div>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 26,
            lineHeight: 1.15,
            fontWeight: 700,
            color: "var(--cream)",
            margin: "0 0 6px",
          }}
        >
          Bienvenue dans BMD
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--cream-soft)",
            lineHeight: 1.5,
            margin: "0 0 20px",
            maxWidth: 480,
          }}
        >
          Crée ton premier groupe pour gérer une tontine, un voyage, une coloc
          ou un événement. Touche un modèle ci-dessous, on te pré-remplit
          l'essentiel.
        </p>

        {/* Grille de suggestions */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            marginBottom: 18,
          }}
        >
          {SUGGESTIONS.map((s) => (
            <button
              key={s.type}
              type="button"
              onClick={() => {
                if (onCreateWithType) onCreateWithType(s.type);
                else onCreate?.();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 4,
                padding: "14px 14px 12px",
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.10)",
                borderRadius: 14,
                color: "var(--cream)",
                cursor: "pointer",
                textAlign: "left",
                transition: "transform 0.15s, border-color 0.15s, background 0.15s",
                fontFamily: "inherit",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = s.accent;
                e.currentTarget.style.background = `${s.accent}12`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor =
                  "rgba(244,228,193,0.10)";
                e.currentTarget.style.background = "rgba(244,228,193,0.04)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                aria-hidden
                style={{
                  fontSize: 24,
                  lineHeight: 1,
                  marginBottom: 2,
                }}
              >
                {s.emoji}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: s.accent,
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--cream-muted, #aaa)",
                  lineHeight: 1.4,
                }}
              >
                {s.hint}
              </div>
            </button>
          ))}
        </div>

        {/* CTA principal — bouton générique pour ceux qui veulent custom */}
        <button
          type="button"
          onClick={onCreate}
          style={{
            width: "100%",
            padding: "13px 20px",
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "#16111E",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: 0.3,
            boxShadow: "0 4px 14px rgba(181,70,46,0.25)",
          }}
        >
          ＋ Créer un groupe personnalisé
        </button>

        {/* Bandeau "déjà invité ?" */}
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.08)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12,
            color: "var(--cream-soft)",
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>
            🔗
          </span>
          <span style={{ flex: 1 }}>
            Tu as un lien d'invitation ?
          </span>
          <Link
            href="/join"
            style={{
              color: "var(--saffron, #e8a33d)",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Le coller →
          </Link>
        </div>
      </div>
    </div>
  );
}
