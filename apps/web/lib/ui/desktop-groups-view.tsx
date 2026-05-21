"use client";

/**
 * <DesktopGroupsGrid> · V104 — Grille de tuiles "Mes groupes" pour desktop.
 *
 * Pendant longtemps, le clic sur "Mes groupes" dans la sidebar desktop
 * amenait l'utilisateur sur /dashboard qui affichait un simple tableau
 * dépouillé (rows cream-soft sur fond cream-translucide), illisible une
 * fois le shell passé en V45-light.
 *
 * Cette vue reprend le PRINCIPE du composant <MobileGroupsListView> mais
 * adapté au desktop :
 *   - Grille auto-fill 3-4 colonnes (au lieu de 2 en mobile)
 *   - Cards plus larges, ombre plus marquée pour une présence "portail pro"
 *   - Réutilise la palette par type (saffron pour TONTINE, vert pour COLOC,
 *     etc.) et les icônes SVG outline de l'icon registry V52.A2
 *   - 100% palette V45-light : fond paper, texte cocoa, accents saffron
 *
 * Volontairement PAS de hero "donut + KPI" ni de FAB : le DesktopDashboard
 * a déjà un hero solde XL en haut de page et un quick action "+ Nouveau
 * groupe" — pas besoin de redoubler. Cette vue est focalisée sur la mise
 * en valeur de chaque groupe sous forme de tuile.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { Icon, type IconName } from "./icons";
import { prewarmGroupApi } from "../use-prefetch";

export interface DesktopGroup {
  id: string;
  name: string;
  type: string;
  defaultCurrency: string;
  membersCount?: number;
  memberCount?: number;
  expenseCount?: number;
  role?: string;
  myNet: string;
  totalSpent?: string;
}

// Palette par type — alignée avec MobileGroupsListView pour cohérence
// mobile/web (un user qui passe de l'app au portail web reconnaît
// immédiatement ses groupes par la couleur).
const TYPE_THEME: Record<
  string,
  { color: string; iconName: IconName; label: string }
> = {
  TONTINE: { color: "#E8A33D", iconName: "coins", label: "Tontine" },
  COLOC: { color: "#7DC59E", iconName: "home", label: "Coloc" },
  TRAVEL: { color: "#5B6CFF", iconName: "plane", label: "Voyage" },
  EVENT: { color: "#D9714A", iconName: "party-popper", label: "Événement" },
  CLUB: { color: "#B58FE0", iconName: "users", label: "Club" },
  PARISH: { color: "#F4C863", iconName: "users", label: "Paroisse" },
  GENERIC: { color: "#94A3B8", iconName: "folder", label: "Groupe" },
};

export function DesktopGroupsGrid({
  groups,
}: {
  groups: DesktopGroup[];
}) {
  const t = useT();
  const { formatAmount } = useCurrency();

  return (
    <div
      style={{
        display: "grid",
        // Auto-fill : 3 cols sur écran standard (~280px par card),
        // 4 sur ultrawide, 2 sur petit desktop, 1 sur viewport étroit.
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 14,
      }}
    >
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} formatAmount={formatAmount} t={t} />
      ))}
    </div>
  );
}

function GroupCard({
  group,
  formatAmount,
  t,
}: {
  group: DesktopGroup;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  const router = useRouter();
  const theme = TYPE_THEME[group.type] ?? TYPE_THEME.GENERIC!;
  const members = group.membersCount ?? group.memberCount ?? 0;
  const net = parseFloat(group.myNet ?? "0");
  // Couleurs net : vert sombre pour positif, terracotta V45 pour négatif.
  // On évite le `--cream-soft` qui passait pour du blanc sur fond ivory.
  const netColor =
    net > 0
      ? "#2F8B5C"
      : net < 0
        ? "var(--v45-terracotta, #9F4628)"
        : "var(--cocoa-soft, #6B5A47)";
  const netSign = net > 0 ? "+" : net < 0 ? "−" : "";
  const totalSpentNum = parseFloat(group.totalSpent ?? "0");

  return (
    <Link
      href={`/dashboard/groups/${group.id}`}
      prefetch
      onMouseEnter={() => {
        // Pre-warm API + Next.js prefetch pour une navigation instantanée.
        prewarmGroupApi(group.id);
        router.prefetch(`/dashboard/groups/${group.id}`);
      }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 16px 14px",
        background: "var(--paper, #FFFFFF)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 18,
        color: "var(--cocoa, #2B1F15)",
        textDecoration: "none",
        overflow: "hidden",
        minHeight: 168,
        boxShadow: "0 2px 8px rgba(43,31,21,0.05)",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        WebkitTapHighlightColor: "transparent",
      }}
      // Lift hover desktop — petit décollement + ombre plus marquée
      onMouseOver={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(43,31,21,0.10)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(43,31,21,0.05)";
      }}
    >
      {/* Bandeau coloré gauche — signal visuel immédiat du type de groupe */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: theme.color,
        }}
      />

      {/* Halo coloré subtil en arrière-plan, coin haut-droit */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.color}26, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Ligne haut : icône + badge admin éventuel */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginLeft: 8,
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: `${theme.color}22`,
            border: `1px solid ${theme.color}55`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.color,
            flexShrink: 0,
          }}
        >
          <Icon name={theme.iconName} size={19} strokeWidth={1.7} />
        </span>
        {group.role === "ADMIN" && (
          <span
            style={{
              fontSize: 9,
              padding: "3px 7px",
              borderRadius: 4,
              background: "rgba(197,138,46,0.16)",
              color: "var(--v45-saffron, #C58A2E)",
              fontWeight: 800,
              letterSpacing: 0.6,
            }}
          >
            ADMIN
          </span>
        )}
      </div>

      {/* Nom du groupe (max 2 lignes) */}
      <div
        style={{
          position: "relative",
          fontSize: 15,
          fontWeight: 700,
          color: "var(--cocoa, #2B1F15)",
          marginLeft: 8,
          marginTop: 2,
          lineHeight: 1.3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          minHeight: 38,
        }}
      >
        {group.name}
      </div>

      {/* Solde net Cormorant — élément phare visuel */}
      <div
        className="bmd-num"
        style={{
          position: "relative",
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: netColor,
          marginLeft: 8,
          marginTop: "auto",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {net === 0
          ? t("groupsList.tileSettled") || "Réglé"
          : `${netSign}${formatAmount(Math.abs(net), group.defaultCurrency)}`}
      </div>

      {/* Footer : membres + total dépensé + chip type */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginLeft: 8,
          fontSize: 11,
          color: "var(--cocoa-soft, #6B5A47)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icon name="users" size={12} strokeWidth={1.7} />
          {members}
        </span>
        {totalSpentNum > 0 && (
          <span
            className="bmd-num"
            style={{
              fontVariantNumeric: "tabular-nums",
              opacity: 0.85,
            }}
          >
            {formatAmount(totalSpentNum, group.defaultCurrency)}
          </span>
        )}
        <span
          style={{
            fontWeight: 700,
            color: theme.color,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {theme.label}
        </span>
      </div>
    </Link>
  );
}
