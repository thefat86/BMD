"use client";

/**
 * /onboarding/intent · Onboarding contextuel (spec §3.1).
 *
 * S'affiche après le 1er login OTP réussi, avant que l'utilisateur n'ait
 * jamais créé un groupe. Demande "tu es ici pour quoi ?" — la réponse
 * pré-remplit la création du 1er groupe (type + suggestion de noms).
 *
 * 6 cas d'usage selon la spec :
 *  - 🪙 Tontine
 *  - 🏠 Coloc
 *  - ✈️ Voyage
 *  - 💍 Événement (mariage, baptême)
 *  - ⚽ Club / association
 *  - ⛪ Paroisse
 *
 * Chaque card affiche :
 *  - Emoji + titre
 *  - Description courte ("ce que tu peux faire avec")
 *  - Au tap : skip vers /dashboard avec ?intent=TONTINE qui ouvre
 *    automatiquement le modal CreateGroup pré-rempli.
 *
 * Bouton "Plus tard" qui skip vers /dashboard sans rien pré-remplir.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "../../../lib/api-client";
import { haptic } from "../../../lib/platform";

interface Intent {
  type: string;
  emoji: string;
  title: string;
  hint: string;
  /** Suggestions de noms pour pré-remplir le champ "Nom du groupe" */
  nameSuggestions: string[];
  /** Couleur d'accent pour la bordure / glow au hover */
  accent: string;
}

const INTENTS: Intent[] = [
  {
    type: "TONTINE",
    emoji: "🪙",
    title: "Une tontine",
    hint: "Épargne tournante avec ma famille ou mes amis",
    nameSuggestions: ["Tontine de la famille", "Tontine du quartier", "Hui des amis"],
    accent: "#e8a33d",
  },
  {
    type: "TRAVEL",
    emoji: "✈️",
    title: "Un voyage",
    hint: "Dépenses partagées d'un trip — Dakar, Marrakech, Bali…",
    nameSuggestions: ["Voyage Dakar", "Trip Maroc", "Vacances été 2026"],
    accent: "#5b9eef",
  },
  {
    type: "COLOC",
    emoji: "🏠",
    title: "Une colocation",
    hint: "Loyer, factures, courses partagés au mois",
    nameSuggestions: ["Coloc Belleville", "Appart en colloc", "Notre maison"],
    accent: "#66cdaa",
  },
  {
    type: "EVENT",
    emoji: "💍",
    title: "Un événement",
    hint: "Mariage, baptême, anniversaire — collecte + dépenses",
    nameSuggestions: ["Mariage Kouassi", "Baptême Aïcha", "Anniv 30 ans"],
    accent: "#b54732",
  },
  {
    type: "CLUB",
    emoji: "⚽",
    title: "Un club ou une asso",
    hint: "Cotisations sportives, culturelles, étudiantes",
    nameSuggestions: ["Club de foot", "Association des anciens", "Club lecture"],
    accent: "#7d4caf",
  },
  {
    type: "PARISH",
    emoji: "⛪",
    title: "Une paroisse",
    hint: "Quêtes, projets, reçus fiscaux automatiques",
    nameSuggestions: ["Paroisse Saint-Martin", "Église protestante", "Mosquée du quartier"],
    accent: "#c9a24a",
  },
];

export default function OnboardingIntentPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  // Garde : pas authentifié → /login
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);

  function pickIntent(intent: Intent) {
    haptic("tap");
    setBusy(intent.type);
    // On stocke le choix dans localStorage. Le dashboard détectera la
    // valeur au mount et ouvrira automatiquement le CreateGroupModal
    // pré-rempli avec le type + suggestions de noms.
    try {
      window.localStorage.setItem(
        "bmd_pending_intent",
        JSON.stringify({
          type: intent.type,
          nameSuggestions: intent.nameSuggestions,
          at: new Date().toISOString(),
        }),
      );
    } catch {
      /* ignore */
    }
    router.push("/dashboard");
  }

  function skip() {
    try {
      window.localStorage.removeItem("bmd_pending_intent");
    } catch {
      /* ignore */
    }
    router.push("/dashboard");
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(900px 500px at 50% -10%, rgba(232,163,61,0.10), transparent 60%), " +
          "linear-gradient(180deg, #0E0B14 0%, #1F1429 100%)",
        color: "var(--cream, #f4e4c1)",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 32px)",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 6 }}>👋</div>
          <h1
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "var(--cream)",
            }}
          >
            Tu es ici pour quoi ?
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--cream-soft)",
              margin: 0,
              lineHeight: 1.5,
              maxWidth: 480,
            }}
          >
            Choisis ton cas d'usage principal — on te pré-remplit le 1er groupe
            pour aller vite. Tu pourras toujours en créer d'autres ensuite.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {INTENTS.map((intent) => (
            <button
              key={intent.type}
              type="button"
              onClick={() => pickIntent(intent)}
              disabled={!!busy}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
                padding: "18px 18px 16px",
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.10)",
                borderRadius: 16,
                color: "var(--cream)",
                cursor: busy ? "wait" : "pointer",
                textAlign: "left",
                transition:
                  "transform 0.15s, border-color 0.15s, background 0.15s, opacity 0.15s",
                fontFamily: "inherit",
                opacity: busy && busy !== intent.type ? 0.5 : 1,
                minHeight: 100,
              }}
              onMouseEnter={(e) => {
                if (busy) return;
                e.currentTarget.style.borderColor = intent.accent;
                e.currentTarget.style.background = `${intent.accent}14`;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(244,228,193,0.10)";
                e.currentTarget.style.background = "rgba(244,228,193,0.04)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                aria-hidden
                style={{
                  fontSize: 32,
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {intent.emoji}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: intent.accent,
                  fontFamily: "Cormorant Garamond, serif",
                }}
              >
                {intent.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--cream-soft)",
                  lineHeight: 1.45,
                }}
              >
                {intent.hint}
              </div>
              {busy === intent.type && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: intent.accent,
                  }}
                  aria-live="polite"
                >
                  Préparation…
                </div>
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={skip}
          disabled={!!busy}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--cream-muted, #8a7b6b)",
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
            padding: "12px 0",
            textAlign: "center",
            width: "100%",
            textDecoration: "underline",
            textUnderlineOffset: 4,
            opacity: busy ? 0.5 : 1,
          }}
        >
          Je passe — j'explorerai par moi-même
        </button>
      </div>
    </main>
  );
}
