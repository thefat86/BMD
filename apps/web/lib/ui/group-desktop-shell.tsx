"use client";

/**
 * V211.A — Wrapper desktop pour toutes les vues secondaires du groupe.
 * =============================================================================
 * Garantit que toutes les sections (Dépenses, Tontine, Caisses, Membres,
 * Réunions, Documents, Activité, Réglages) partagent :
 *
 *   - même header avec breadcrumb + titre + actions
 *   - bouton « ↩ Hub » toujours visible à droite
 *   - même padding/marges
 *
 * Du coup la navigation est fluide : où qu'on soit, on revient au hub
 * d'un seul clic et on retrouve le même placement des contrôles.
 */

import Link from "next/link";
import { ReactNode } from "react";
import { useT } from "../i18n/app-strings";

type DesktopGroupSectionShellProps = {
  groupId: string;
  groupName: string;
  sectionLabel: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
};

export function DesktopGroupSectionShell({
  groupId,
  groupName,
  sectionLabel,
  subtitle,
  primaryAction,
  secondaryActions,
  children,
  noPadding = false,
}: DesktopGroupSectionShellProps) {
  const t = useT();

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: noPadding ? 0 : "0 24px 32px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: noPadding ? "12px 24px" : "8px 0 14px",
          borderBottom: noPadding ? "0.5px solid #D9C8A6" : undefined,
          marginBottom: noPadding ? 0 : 14,
        }}
      >
        {/* V222.E — Bouton « Retour au hub » repositionné en GAUCHE du header
            (avant le breadcrumb). Position uniforme dans toutes les sections,
            là où les utilisateurs s'attendent à trouver un bouton retour. */}
        <GroupBackToHubButton groupId={groupId} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              color: "#8B6F47",
              marginBottom: 2,
              textTransform: "lowercase",
              letterSpacing: "0.04em",
            }}
          >
            {t("group.title") || "Groupes"} ›{" "}
            <Link
              href={`/dashboard/groups/${groupId}`}
              style={{ color: "#8B6F47", textDecoration: "none" }}
            >
              {groupName}
            </Link>{" "}
            ›
          </div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 500,
              margin: 0,
              color: "#2B1F15",
            }}
          >
            {sectionLabel}
            {subtitle && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 12,
                  fontWeight: 400,
                  color: "#8B6F47",
                  letterSpacing: "normal",
                }}
              >
                · {subtitle}
              </span>
            )}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {secondaryActions}
          {primaryAction}
        </div>
      </header>
      <div>{children}</div>
    </div>
  );
}

/**
 * Bouton « ← Retour au hub » uniforme — utilisé dans toutes les sections secondaires.
 * V222.E — Positionné à gauche du header (cf. shell ci-dessus), rendu saillant
 * (background sable + bordure + icône) pour qu'on le trouve toujours au même
 * endroit du premier coup d'œil. Cohérence visuelle + position fixe = la nav
 * devient intuitive.
 */
export function GroupBackToHubButton({ groupId }: { groupId: string }) {
  const t = useT();
  return (
    <Link
      href={`/dashboard/groups/${groupId}`}
      prefetch
      // V222.E — Style saillant : sable + bordure + icône. Avant : fond
      // transparent quasi-invisible. Le bouton doit attirer l'œil dès l'arrivée.
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 13px",
        background: "#F4ECD9",
        border: "0.5px solid #D9C8A6",
        borderRadius: 9,
        color: "#2B1F15",
        textDecoration: "none",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>←</span>
      {t("group.hub.backToHub") || "Retour au hub"}
    </Link>
  );
}
