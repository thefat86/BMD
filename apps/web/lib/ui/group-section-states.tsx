"use client";

/**
 * V215.A2 + V215.A3 — Composants standardisés pour les sous-pages de groupe :
 * skeleton de chargement + écran d'erreur avec actions Retry / Retour au hub.
 *
 * Toutes les sous-pages d'un groupe (members, expenses, meetings, attachments,
 * activity, settings, tontine, funds, etc.) doivent utiliser ces helpers pour
 * que le ressenti soit cohérent :
 *
 *  - Le header avec le nom du groupe et le bouton "↩ Retour au hub" est déjà
 *    fourni par le `ResponsiveShell` parent (via `back={{ href: ... }}`).
 *  - À l'intérieur du shell, on affiche soit le skeleton (chargement) soit
 *    l'erreur (avec un Retry + un lien de secours vers le hub), soit le
 *    contenu chargé.
 *
 * Cela élimine les bugs de "chargement infini" : si une API plante, on
 * affiche un message + un Retry plutôt que de rester bloqué.
 */

import Link from "next/link";

export function GroupSectionSkeleton({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        color: "#8B6F47",
        fontSize: 13,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "2.5px solid #D9C8A6",
          borderTopColor: "#C58A2E",
          animation: "bmdSpin 0.9s linear infinite",
        }}
      />
      <div>{label}</div>
      <style>{`
        @keyframes bmdSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export function GroupSectionError({
  message,
  backHref,
  backLabel,
  retryLabel,
}: {
  message: string;
  backHref: string;
  backLabel: string;
  retryLabel: string;
}) {
  return (
    <div
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
        color: "#2B1F15",
      }}
    >
      <div style={{ fontSize: 13, color: "#9F4628", maxWidth: 420 }}>
        {message}
      </div>
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
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          style={{
            padding: "8px 16px",
            background: "#C58A2E",
            color: "#2B1F15",
            border: "none",
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {retryLabel}
        </button>
        <Link
          href={backHref}
          style={{
            padding: "8px 16px",
            background: "transparent",
            color: "#2B1F15",
            border: "0.5px solid #D9C8A6",
            borderRadius: 9,
            fontSize: 12,
            textDecoration: "none",
            fontFamily: "inherit",
            display: "inline-block",
          }}
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
