"use client";

/**
 * V222.C — FundContributionsStatus
 * =============================================================================
 * Grille « qui est à jour vs en retard » sur une caisse projet à fréquence
 * régulière (MONTHLY/WEEKLY/BIWEEKLY) en mode FIXED.
 *
 * Layout :
 *   - 3 mini-stats globales en haut (collecté / attendu / membres à jour)
 *   - Tableau dense lignes = membres, colonnes = périodes (6 dernières par
 *     défaut, scroll horizontal pour plus)
 *   - Chaque cellule = badge :
 *       VALIDATED → check sage
 *       PENDING   → diamond saffron
 *       absent    → vide
 *   - À gauche de chaque ligne : avatar + nom + chip « à jour » / « en retard de X »
 *
 * Modes :
 *   - FIXED + fréquence régulière → grille pleine (cas principal)
 *   - FREE ou ONE_SHOT/CUSTOM    → vue simplifiée : liste totaux par membre
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { AvatarColored } from "./avatar-colored";

interface Props {
  groupId: string;
  fundId: string;
  /** Locale BCP-47 pour formatter labels périodes (défaut : navigateur). */
  locale?: string;
  /** Nombre de périodes à afficher par défaut (scroll si plus). */
  defaultColumns?: number;
}

type Data = Awaited<ReturnType<typeof api.getFundContributionsStatus>>;

export function FundContributionsStatus({
  groupId,
  fundId,
  locale,
  defaultColumns = 6,
}: Props) {
  const t = useT();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .getFundContributionsStatus(groupId, fundId)
      .then((d) => mounted && setData(d))
      .catch((e: Error) => mounted && setError(e.message));
    return () => {
      mounted = false;
    };
  }, [groupId, fundId]);

  // Locale safe pour Intl
  const resolvedLocale = useMemo(() => {
    if (locale) return locale;
    if (typeof navigator !== "undefined") return navigator.language;
    return "fr-FR";
  }, [locale]);

  // Reformatte les labels de période selon la locale du user
  const periodsLocalized = useMemo(() => {
    if (!data) return [] as Array<{ start: string; end: string; label: string }>;
    if (data.fund.frequency === "MONTHLY") {
      const fmt = new Intl.DateTimeFormat(resolvedLocale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      return data.periods.map((p) => ({
        ...p,
        label: capitalize(fmt.format(new Date(p.start))),
      }));
    }
    if (data.fund.frequency === "WEEKLY" || data.fund.frequency === "BIWEEKLY") {
      const fmt = new Intl.DateTimeFormat(resolvedLocale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
      return data.periods.map((p) => ({
        ...p,
        label: fmt.format(new Date(p.start)),
      }));
    }
    return data.periods;
  }, [data, resolvedLocale]);

  if (error) {
    return (
      <div style={errorStyle}>
        {t("funds.status.loadError") || "Impossible de charger l'état des cotisations."}
      </div>
    );
  }
  if (!data) {
    return (
      <div style={loadingStyle}>{t("common.loading") || "Chargement…"}</div>
    );
  }

  const { fund, membersStatus, totals } = data;
  const isStructured =
    fund.frequency !== "ONE_SHOT" && fund.frequency !== "CUSTOM";
  const isFixed = fund.contributionMode === "FIXED";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* 3 mini-stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isFixed && isStructured ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
          gap: 10,
        }}
      >
        <MiniStat
          label={t("funds.status.totalCollected") || "Total collecté"}
          value={`${totals.collected.toFixed(0)} ${fund.currency}`}
          tint="var(--v45-emerald, #1F7A57)"
        />
        {isFixed && isStructured && totals.expected !== null && (
          <MiniStat
            label={t("funds.status.totalExpected") || "Attendu à date"}
            value={`${totals.expected.toFixed(0)} ${fund.currency}`}
            tint="var(--saffron, #C58A2E)"
          />
        )}
        <MiniStat
          label={(
            (t("funds.status.membersUpToDate")) ||
            "{n} / {total} membres à jour"
          )
            .replace("{n}", String(totals.membersUpToDate))
            .replace("{total}", String(totals.membersTotal))}
          value={`${totals.membersUpToDate}/${totals.membersTotal}`}
          tint="var(--cocoa, #2B1F15)"
        />
      </div>

      {/* Tableau ou liste simple */}
      {isFixed && isStructured && periodsLocalized.length > 0 ? (
        <StructuredGrid
          fund={fund}
          membersStatus={membersStatus}
          periods={periodsLocalized}
          defaultColumns={defaultColumns}
          t={t}
        />
      ) : (
        <FreeList fund={fund} membersStatus={membersStatus} t={t} />
      )}
    </div>
  );
}

// ============================================================================
// Sous-composants
// ============================================================================

function StructuredGrid({
  fund,
  membersStatus,
  periods,
  defaultColumns,
  t,
}: {
  fund: Data["fund"];
  membersStatus: Data["membersStatus"];
  periods: Array<{ start: string; end: string; label: string }>;
  defaultColumns: number;
  t: (key: string) => string | undefined;
}) {
  // Affiche au plus defaultColumns colonnes au départ ; scroll horizontal
  // au-delà. Périodes triées du plus récent au plus ancien (cf. backend).
  const columns = periods.slice(0, Math.min(periods.length, defaultColumns + 6));

  return (
    <div
      style={{
        background: "var(--cream, #FAF6EE)",
        border: "1px solid var(--border, #D9C8A6)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 320 + columns.length * 88,
          }}
        >
          <thead>
            <tr style={{ background: "rgba(217,200,166,0.20)" }}>
              <th
                style={{
                  ...thStyle,
                  textAlign: "left",
                  position: "sticky",
                  left: 0,
                  background: "rgba(247,238,221,1)",
                  zIndex: 1,
                  minWidth: 220,
                }}
              >
                {t("funds.status.member") || "Membre"}
              </th>
              {columns.map((p) => (
                <th key={p.start} style={{ ...thStyle, textAlign: "center" }}>
                  {p.label}
                </th>
              ))}
              <th style={{ ...thStyle, textAlign: "right" }}>
                {t("funds.status.contributedTotal") || "Versé"}
              </th>
            </tr>
          </thead>
          <tbody>
            {membersStatus.map((m) => (
              <tr
                key={m.userId}
                style={{
                  borderTop: "1px solid var(--border, #D9C8A6)",
                }}
              >
                <td
                  style={{
                    ...tdStyle,
                    position: "sticky",
                    left: 0,
                    background: "var(--cream, #FAF6EE)",
                    zIndex: 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <AvatarColored
                      userId={m.userId}
                      initials={m.displayName}
                      photoUrl={m.avatar ?? undefined}
                      size={32}
                    />
                    <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          color: "var(--cocoa, #2B1F15)",
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 160,
                        }}
                      >
                        {m.displayName}
                      </span>
                      <StatusChip member={m} fund={fund} t={t} />
                    </div>
                  </div>
                </td>
                {columns.map((p) => {
                  const key = p.start.slice(0, 10);
                  const cell = m.contributionsByPeriod[key];
                  return (
                    <td
                      key={p.start}
                      style={{
                        ...tdStyle,
                        textAlign: "center",
                        padding: "10px 4px",
                      }}
                    >
                      <PeriodBadge cell={cell} currency={fund.currency} t={t} />
                    </td>
                  );
                })}
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    fontFamily: "var(--bmd-num, inherit)",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 700,
                    color: "var(--cocoa, #2B1F15)",
                  }}
                >
                  {m.contributedTotal.toFixed(0)} {fund.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FreeList({
  fund,
  membersStatus,
  t,
}: {
  fund: Data["fund"];
  membersStatus: Data["membersStatus"];
  t: (key: string) => string | undefined;
}) {
  return (
    <div
      style={{
        background: "var(--cream, #FAF6EE)",
        border: "1px solid var(--border, #D9C8A6)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {membersStatus.length === 0 && (
        <div style={emptyStyle}>
          {t("funds.status.noMembers") || "Aucun membre dans ce groupe."}
        </div>
      )}
      {membersStatus.map((m, idx) => (
        <div
          key={m.userId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderTop:
              idx === 0 ? "none" : "1px solid var(--border, #D9C8A6)",
          }}
        >
          <AvatarColored
            userId={m.userId}
            initials={m.displayName}
            photoUrl={m.avatar ?? undefined}
            size={36}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                color: "var(--cocoa, #2B1F15)",
                fontSize: 14,
              }}
            >
              {m.displayName}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted, #7a7164)" }}>
              {m.contributionsCount > 0
                ? `${m.contributionsCount} ${
                    t("funds.status.payments") || "versements"
                  }`
                : t("funds.status.noPayment") || "Aucun versement"}
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--bmd-num, inherit)",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              fontSize: 15,
              color:
                m.contributedTotal > 0
                  ? "var(--v45-emerald, #1F7A57)"
                  : "var(--muted, #7a7164)",
            }}
          >
            {m.contributedTotal.toFixed(0)} {fund.currency}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusChip({
  member,
  fund,
  t,
}: {
  member: Data["membersStatus"][number];
  fund: Data["fund"];
  t: (key: string) => string | undefined;
}) {
  if (fund.contributionMode === "FREE") {
    // En mode libre : pas de notion de retard. On affiche juste "X versements".
    if (member.contributionsCount === 0) {
      return (
        <span style={chipMutedStyle}>
          {t("funds.status.noPayment") || "Aucun versement"}
        </span>
      );
    }
    return (
      <span style={chipMutedStyle}>
        {member.contributionsCount} {t("funds.status.payments") || "versements"}
      </span>
    );
  }
  if (member.late > 0) {
    return (
      <span style={chipLateStyle}>
        {((t("funds.status.lateAmount")) ||
          "En retard de {amount}").replace(
          "{amount}",
          `${member.late.toFixed(0)} ${fund.currency}`,
        )}
      </span>
    );
  }
  if (member.ahead > 0) {
    return (
      <span style={chipAheadStyle}>
        {((t("funds.status.aheadAmount")) ||
          "{amount} en avance").replace(
          "{amount}",
          `${member.ahead.toFixed(0)} ${fund.currency}`,
        )}
      </span>
    );
  }
  return (
    <span style={chipOkStyle}>{t("funds.status.upToDate") || "À jour"}</span>
  );
}

function PeriodBadge({
  cell,
  currency,
  t,
}: {
  cell:
    | {
        amount: number;
        status: "PENDING" | "VALIDATED";
        contributionId: string;
        currency: string;
      }
    | undefined;
  currency: string;
  t: (key: string) => string | undefined;
}) {
  if (!cell) {
    return <span style={{ color: "rgba(122,113,100,0.35)", fontSize: 18 }}>·</span>;
  }
  const tooltip = `${cell.amount.toFixed(0)} ${currency} — ${
    cell.status === "VALIDATED"
      ? t("funds.status.confirmed") || "Confirmé"
      : t("funds.status.pending") || "En attente"
  }`;
  if (cell.status === "VALIDATED") {
    return (
      <span title={tooltip} style={badgeOkStyle}>
        ✓
      </span>
    );
  }
  return (
    <span title={tooltip} style={badgePendingStyle}>
      ◇
    </span>
  );
}

function MiniStat({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div
      style={{
        background: "var(--cream, #FAF6EE)",
        border: "1px solid var(--border, #D9C8A6)",
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--muted, #7a7164)",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: tint,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================================
// Styles
// ============================================================================

const thStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--muted, #7a7164)",
  padding: "10px 8px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 8px",
  verticalAlign: "middle",
  color: "var(--cocoa, #2B1F15)",
};

const chipBaseStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  padding: "2px 7px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};

const chipOkStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "rgba(31,122,87,0.14)",
  color: "var(--v45-emerald, #1F7A57)",
};

const chipLateStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "rgba(159,70,40,0.14)",
  color: "var(--v45-terracotta, #9F4628)",
};

const chipAheadStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "rgba(197,138,46,0.14)",
  color: "var(--saffron, #C58A2E)",
};

const chipMutedStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "rgba(122,113,100,0.14)",
  color: "var(--muted, #7a7164)",
};

const badgeOkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 999,
  background: "rgba(31,122,87,0.16)",
  color: "var(--v45-emerald, #1F7A57)",
  fontWeight: 700,
  cursor: "default",
};

const badgePendingStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 999,
  background: "rgba(197,138,46,0.18)",
  color: "var(--saffron, #C58A2E)",
  fontWeight: 700,
  cursor: "default",
};

const loadingStyle: React.CSSProperties = {
  padding: "24px 16px",
  textAlign: "center",
  color: "var(--muted, #7a7164)",
  fontSize: 13,
};

const errorStyle: React.CSSProperties = {
  padding: "16px",
  background: "rgba(159,70,40,0.08)",
  border: "1px solid rgba(159,70,40,0.30)",
  borderRadius: 12,
  color: "var(--v45-terracotta, #9F4628)",
  fontSize: 13,
};

const emptyStyle: React.CSSProperties = {
  padding: "20px",
  textAlign: "center",
  color: "var(--muted, #7a7164)",
  fontSize: 13,
};
