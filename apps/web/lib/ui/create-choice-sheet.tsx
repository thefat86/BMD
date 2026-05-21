"use client";

/**
 * V148.D — Sheet de choix "Créer" : groupe vs reconnaissance de dette.
 *
 * Affiché au tap sur le raccourci "Créer" du dashboard. L'utilisateur choisit :
 *  - Créer un groupe → ouvre le wizard existant (V52.G1 MobileCreateGroupSheet)
 *  - Créer une reconnaissance → navigue vers /dashboard/debts/new
 *
 * Composant utilisable mobile + desktop (le wrapping est juste un overlay
 * centré + sheet bas mobile / modal centré desktop).
 */

import { useEffect } from "react";
import { useT } from "../i18n/app-strings";

interface Props {
  open: boolean;
  onClose: () => void;
  onPickGroup: () => void;
  onPickDebt: () => void;
}

export function CreateChoiceSheet({
  open,
  onClose,
  onPickGroup,
  onPickDebt,
}: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const t = useT();

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("create.choiceTitle") || "Que veux-tu créer ?"}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(14,11,20,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "bmd-fade-in 160ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#FBF6EC",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: "12px 16px calc(20px + env(safe-area-inset-bottom, 0))",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.30)",
          animation: "bmd-slide-up 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle */}
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            borderRadius: 999,
            background: "rgba(43,31,21,0.18)",
            margin: "0 auto 14px",
          }}
        />

        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 500,
            color: "#2B1F15",
            textAlign: "center",
            lineHeight: 1.2,
            marginBottom: 4,
          }}
        >
          {t("create.choiceTitle") || "Que veux-tu créer ?"}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "#6B5A47",
            textAlign: "center",
            marginBottom: 18,
            lineHeight: 1.4,
          }}
        >
          {t("create.choiceHint") ||
            "Choisis le type de relation financière à formaliser"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* === Choix 1 : Groupe === */}
          <button
            type="button"
            onClick={onPickGroup}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 16px",
              background: "#FFFFFF",
              border: "1px solid rgba(43,31,21,0.12)",
              borderRadius: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              transition: "border-color 160ms ease, transform 80ms ease",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(31,122,87,0.15)",
                color: "#0F6E56",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                width={26}
                height={26}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#2B1F15",
                  marginBottom: 2,
                }}
              >
                {t("create.choiceGroup") || "Créer un groupe"}
              </div>
              <div style={{ fontSize: 12, color: "#6B5A47", lineHeight: 1.4 }}>
                {t("create.choiceGroupHint") ||
                  "Partage de dépenses, tontine, événement…"}
              </div>
            </div>
            <span aria-hidden style={{ color: "#6B5A47", fontSize: 18 }}>
              ›
            </span>
          </button>

          {/* === Choix 2 : Reconnaissance de dette === */}
          <button
            type="button"
            onClick={onPickDebt}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 16px",
              background: "#FFFFFF",
              border: "1px solid rgba(43,31,21,0.12)",
              borderRadius: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              transition: "border-color 160ms ease, transform 80ms ease",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(197,138,46,0.18)",
                color: "#C58A2E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                width={26}
                height={26}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#2B1F15",
                  marginBottom: 2,
                }}
              >
                {t("create.choiceDebt") || "Créer une reconnaissance de dette"}
              </div>
              <div style={{ fontSize: 12, color: "#6B5A47", lineHeight: 1.4 }}>
                {t("create.choiceDebtHint") ||
                  "Prêt formalisé, signé, traçable"}
              </div>
            </div>
            <span aria-hidden style={{ color: "#6B5A47", fontSize: 18 }}>
              ›
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 14,
            background: "transparent",
            border: "none",
            color: "#6B5A47",
            fontSize: 13,
            fontWeight: 600,
            padding: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("common.cancel") || "Annuler"}
        </button>
      </div>

      <style>{`
        @keyframes bmd-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bmd-slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
