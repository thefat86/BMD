"use client";

/**
 * V157 — CreateChoiceModal partagé.
 *
 * Modal de choix « Que veux-tu créer ? » avec 2 cards :
 *  - Créer un groupe (saffron) → callback onCreateGroup
 *  - Reconnaissance de dette (emerald) → callback onCreateDebt
 *
 * Utilisé par :
 *  - Le raccourci « Créer » du dashboard desktop (V156)
 *  - Le bouton « Nouveau » du header desktop (V157)
 *  - Le bouton « Nouveau » dans la section Mes groupes (V156)
 *
 * Palette V45-light cohérente avec le reste de l'app desktop.
 */

import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
  onCreateDebt: () => void;
  t: (k: string) => string;
}

export function CreateChoiceModal({
  open,
  onClose,
  onCreateGroup,
  onCreateDebt,
  t,
}: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 18,
          maxWidth: 540,
          width: "100%",
          boxShadow: "0 20px 60px rgba(43,31,21,0.30)",
          border: "1px solid rgba(43,31,21,0.10)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "22px 24px 14px",
            borderBottom: "1px solid rgba(43,31,21,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#854F0B",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {t("dashboard.createChoice.eyebrow") || "Que veux-tu créer ?"}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "#2B1F15",
              fontFamily: "Cormorant Garamond, serif",
            }}
          >
            {t("dashboard.createChoice.title") ||
              "Choisis le type de relation financière"}
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            padding: 24,
          }}
        >
          <ChoiceCard
            icon="👥"
            color="#854F0B"
            label={t("dashboard.createChoice.group") || "Créer un groupe"}
            hint={
              t("dashboard.createChoice.groupHint") ||
              "Partage de dépenses, tontine, événement…"
            }
            onClick={onCreateGroup}
          />
          <ChoiceCard
            icon="📜"
            color="#0F6E56"
            label={
              t("dashboard.createChoice.debt") || "Reconnaissance de dette"
            }
            hint={
              t("dashboard.createChoice.debtHint") ||
              "Prêt formalisé, signé, traçable"
            }
            onClick={onCreateDebt}
          />
        </div>
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid rgba(43,31,21,0.08)",
            display: "flex",
            justifyContent: "flex-end",
            background: "#FBF6EC",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid rgba(43,31,21,0.18)",
              borderRadius: 10,
              background: "transparent",
              color: "#2B1F15",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("common.cancel") || "Annuler"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  color,
  label,
  hint,
  onClick,
}: {
  icon: string;
  color: string;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "18px 18px 16px",
        background: "#FBF6EC",
        border: `1.5px solid ${color}30`,
        borderRadius: 14,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: "inherit",
        transition: "transform 0.12s ease, border-color 0.12s ease, background 0.12s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = color;
        (e.currentTarget as HTMLButtonElement).style.background = `${color}10`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}30`;
        (e.currentTarget as HTMLButtonElement).style.background = "#FBF6EC";
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          background: `${color}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#2B1F15",
            lineHeight: 1.2,
            marginBottom: 4,
            fontFamily: "Cormorant Garamond, serif",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#6B5A47",
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      </div>
    </button>
  );
}
