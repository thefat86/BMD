"use client";

/**
 * V201 — Bannière légale « Registre » pour le module Caisses Projet.
 * =============================================================================
 * BMD agit en REGISTRE — jamais en dépositaire des fonds.
 *
 * Positionnement juridique (à valider par un avocat avant lancement) :
 *   - BMD enregistre les flux déclarés par les contributeurs et le trésorier
 *   - L'argent reste sur les comptes / supports physiques du trésorier
 *   - BMD ne reçoit, ne détient et ne transfère aucun fonds
 *   - Pas d'agrément CSSF / ACPR requis tant que ce modèle est respecté
 *
 * Cette notice DOIT apparaître :
 *   - Au moment de la création d'une caisse
 *   - Sur le détail d'une caisse (hero ou pied)
 *   - Sur le journal d'audit
 *   - Sur l'écran de déclaration de cotisation
 *
 * Elle peut être masquée sur certains contextes avec `variant="compact"`,
 * mais ne doit JAMAIS être totalement absente du flow.
 */

import { useT } from "../i18n/app-strings";

type Variant = "default" | "compact" | "inline";

interface Props {
  variant?: Variant;
  /**
   * Si renseigné, ajoute une 2e ligne avec le nom du trésorier nommé.
   * Renforce la transparence : « C'est X qui détient l'argent, pas BMD. »
   */
  treasurerName?: string | null;
}

export function FundsLegalNotice({ variant = "default", treasurerName }: Props) {
  const t = useT();

  const title = t("funds.legal.title") || "BMD est un registre, pas une banque";
  const body =
    t("funds.legal.body") ||
    "L'argent n'est jamais détenu par BMD. Le trésorier nommé est seul responsable de la garde des fonds. BMD enregistre les déclarations pour assurer la transparence entre contributeurs.";

  if (variant === "inline") {
    // Variante très discrète : juste une ligne explicative, sans encadré
    return (
      <p
        style={{
          fontSize: 11,
          color: "var(--cream-soft, #c9bfae)",
          margin: "8px 0 0",
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        {body}
        {treasurerName && (
          <>
            {" "}
            <strong style={{ color: "var(--saffron, #E8A33D)" }}>
              {t("funds.legal.treasurerLine", { name: treasurerName }) ||
                `Trésorier nommé : ${treasurerName}.`}
            </strong>
          </>
        )}
      </p>
    );
  }

  const isCompact = variant === "compact";

  return (
    <div
      role="note"
      aria-label={title}
      style={{
        background:
          "linear-gradient(135deg, rgba(31,122,87,0.10), rgba(197,138,46,0.06))",
        border: "1px solid rgba(31,122,87,0.28)",
        borderLeft: "3px solid var(--v45-emerald, #1F7A57)",
        borderRadius: 12,
        padding: isCompact ? "10px 12px" : "14px 14px 12px",
        display: "flex",
        gap: isCompact ? 10 : 12,
        alignItems: "flex-start",
      }}
    >
      <svg
        width={isCompact ? 18 : 22}
        height={isCompact ? 18 : 22}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--v45-emerald, #1F7A57)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ flexShrink: 0, marginTop: 1 }}
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: isCompact ? 11 : 12,
            fontWeight: 700,
            color: "var(--v45-emerald, #1F7A57)",
            letterSpacing: 0.3,
            textTransform: "uppercase",
            marginBottom: isCompact ? 2 : 4,
          }}
        >
          {title}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: isCompact ? 12 : 13,
            color: "var(--cream, #f0e6d8)",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
        {treasurerName && (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12,
              color: "var(--cream-soft, #c9bfae)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--saffron, #E8A33D)" }}>
              {t("funds.legal.treasurerLine", { name: treasurerName }) ||
                `Trésorier nommé : ${treasurerName}.`}
            </strong>
          </p>
        )}
      </div>
    </div>
  );
}
