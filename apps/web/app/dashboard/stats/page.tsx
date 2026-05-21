"use client";

/**
 * Page Stats utilisateur (spec §3.11).
 *
 * Tableau de bord global avec :
 *  - Métriques clés (total dépensé, solde net, nombre dépenses, groupes)
 *  - Sélecteur de période 6 / 12 / 24 mois
 *  - Timeline des dépenses (Sparkline)
 *  - Évolution du solde net (Sparkline)
 *  - Top catégories (DonutChart + détail)
 *  - Top payeurs (BarChart horizontal)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../lib/api-client";
import { ApiErrorAlert } from "../../../lib/ui/api-error-alert";
import dynamic from "next/dynamic";

// V37 — Lazy load des charts pour shrink le bundle initial (~100 kB).
// La page stats est consultée occasionnellement, recharts ne doit pas
// bloquer le LCP des pages plus fréquentes (dashboard, groups, profile).
// `ssr: false` car recharts n'a pas de support SSR.
const ChartSkeleton = () => (
  <div
    style={{
      width: "100%",
      height: 200,
      background: "rgba(244,228,193,0.04)",
      border: "1px solid rgba(244,228,193,0.06)",
      borderRadius: 14,
      animation: "bmd-skel-pulse 1.2s ease-in-out infinite",
    }}
  >
    <style>{`@keyframes bmd-skel-pulse { 0%,100% { opacity:0.5; } 50% { opacity:0.9; } }`}</style>
  </div>
);
const BarChart = dynamic(
  () => import("../../../lib/ui/charts").then((m) => m.BarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const DonutChart = dynamic(
  () => import("../../../lib/ui/charts").then((m) => m.DonutChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const Sparkline = dynamic(
  () => import("../../../lib/ui/charts").then((m) => m.Sparkline),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
// V41 — Refonte mobile dédiée (timeline + insights + top catégories).
import { MobileStatsView } from "../../../lib/ui/mobile-stats-view";
// V105 — Refonte desktop V45-light avec hero KPIs, insight IA, donut V45,
// timeline barres, top people cards, tableau détail mensuel.
import { DesktopStatsView } from "../../../lib/ui/desktop-stats-view";
// V148.C — Sous-onglet « Dettes » avec KPIs RDD et liste contrats actifs.
import { DebtsStatsView } from "../../../lib/ui/debts-stats-view";
import { SegmentedControl } from "../../../lib/ui/segmented-control";
import { usePullToRefresh } from "../../../lib/use-pull-to-refresh";
import { PullIndicator } from "../../../lib/ui/pull-indicator";
import { useT } from "../../../lib/i18n/app-strings";

type StatsTab = "groups" | "debts";

const STATS_TAB_STORAGE_KEY = "bmd_stats_subtab_v148";

type Range = 6 | 12 | 24;

interface Stats {
  currency: string;
  rangeMonths: Range;
  totalSpent: number;
  totalSettled: number;
  expenseCount: number;
  groupCount: number;
  myNet: number;
  timeline: Array<{
    period: string;
    totalSpent: number;
    myNet: number;
    expenseCount: number;
  }>;
  topCategories: Array<{
    category: string;
    totalAmount: number;
    expenseCount: number;
    percent: number;
  }>;
  topPayers: Array<{
    userId: string;
    displayName: string;
    totalPaid: number;
    totalOwed: number;
    net: number;
    expenseCount: number;
  }>;
}

const CATEGORY_PALETTE = [
  "#E8A33D",
  "#B54732",
  "#3A2F5B",
  "#10B981",
  "#5B6CFF",
  "#F59E0B",
  "#EC4899",
  "#7C6E93",
];

const CATEGORY_EMOJI: Record<string, string> = {
  resto: "🍽️",
  courses: "🛒",
  transport: "🚗",
  logement: "🏠",
  loisirs: "🎬",
  sante: "💊",
  santé: "💊",
  autres: "📦",
};

export default function StatsPage() {
  const router = useRouter();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const t = useT();
  const [range, setRange] = useState<Range>(6);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // V148.C — Sous-onglet Groupes/Dettes, persisté en localStorage pour
  // que l'utilisateur retombe sur la dernière vue qu'il a consultée.
  const [tab, setTab] = useState<StatsTab>("groups");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STATS_TAB_STORAGE_KEY);
      if (saved === "groups" || saved === "debts") setTab(saved);
    } catch {
      /* localStorage indisponible (Safari privé) — ignore */
    }
  }, []);
  function handleTabChange(next: StatsTab) {
    setTab(next);
    try {
      window.localStorage.setItem(STATS_TAB_STORAGE_KEY, next);
    } catch {
      /* idem */
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getMyStats(range);
      setStats(r);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Pull-to-refresh natif (mobile only)
  const { state: pullState, bindToScrollContainer } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([new Promise((r) => setTimeout(r, 600)), load()]);
    },
  });
  useEffect(() => {
    bindToScrollContainer(document.body);
  }, [bindToScrollContainer]);

  // V148.C — Sous-onglet Groupes/Dettes commun mobile + desktop.
  const subTabControl = (
    <div
      style={{
        padding: isMobile ? "0 16px 8px" : "0 0 12px",
        maxWidth: isMobile ? "100%" : 1100,
        margin: "0 auto",
      }}
    >
      <SegmentedControl
        value={tab}
        onChange={handleTabChange}
        segments={[
          {
            value: "groups",
            label: t("stats.subtabGroups") || "Groupes",
          },
          {
            value: "debts",
            label: t("stats.subtabDebts") || "Reconnaissances",
          },
        ]}
        ariaLabel={t("stats.subtabAriaLabel") || "Sous-onglet Stats"}
        size="sm"
      />
    </div>
  );

  // V41 — Bascule mobile vers vue dédiée (timeline SVG + top catégories en
  // barres horizontales + top personnes en cards). Placée APRÈS tous les
  // hooks pour respecter Rules of Hooks.
  // V73 — Pas de back button : page accessible depuis le bottom-nav.
  // V148.C — Avec sous-onglet Groupes/Dettes.
  if (bpReady && isMobile) {
    return (
      <ResponsiveShell
        breadcrumb={t("stats.title")}
        mobileTitle={t("stats.title")}
      >
        {subTabControl}
        {tab === "groups" ? (
          <MobileStatsView />
        ) : (
          <div style={{ padding: "0 16px" }}>
            <DebtsStatsView />
          </div>
        )}
      </ResponsiveShell>
    );
  }

  // V105 — Sur desktop, on bascule sur la vue refondue V45-light.
  // V148.C — Sous-onglet Groupes/Dettes au-dessus.
  if (!isMobile && stats) {
    return (
      <ResponsiveShell
        breadcrumb={t("stats.title")}
        desktopTitle={t("stats.title")}
        subtitle={t("stats.subtitle")}
        mobileTitle={t("stats.title")}
      >
        {subTabControl}
        {tab === "groups" ? (
          <DesktopStatsView
            stats={stats}
            range={range}
            onRangeChange={setRange}
          />
        ) : (
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <DebtsStatsView />
          </div>
        )}
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      breadcrumb={t("stats.title")}
      desktopTitle={t("stats.title")}
      subtitle={t("stats.subtitle")}
      mobileTitle={t("stats.title")}
    >
      <div
        style={{
          padding: isMobile ? "8px 16px 24px" : 0,
          maxWidth: isMobile ? "100%" : 1100,
          margin: "0 auto",
        }}
      >

      {/* Pull-to-refresh indicator (mobile only) */}
      {isMobile && <PullIndicator {...pullState} />}

      {error ? <ApiErrorAlert error={error} onClose={() => setError(null)} /> : null}

      {loading && !stats ? (
        <p className="muted">{t("common.loading")}</p>
      ) : stats ? (
        <>
          {/* === Métriques clés === */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <KpiCard
              label={t("stats.totalSpent")}
              value={fmt(stats.totalSpent, stats.currency)}
              hint={`${stats.expenseCount} dépense${stats.expenseCount > 1 ? "s" : ""}`}
              accent="saffron"
            />
            <KpiCard
              label={t("stats.netBalance")}
              value={fmt(stats.myNet, stats.currency)}
              hint={
                // V142 — Si net = 0, on remplace "On me doit" par une phrase
                // qui fait sens (à l'équilibre) plutôt qu'un label seul.
                stats.myNet === 0
                  ? t("stats.netEquilibrium") || "À l'équilibre"
                  : stats.myNet > 0
                    ? t("dashboard.owedToMe")
                    : t("dashboard.iOwe")
              }
              accent={
                stats.myNet === 0
                  ? "muted"
                  : stats.myNet > 0
                    ? "emerald"
                    : "terracotta"
              }
            />
            <KpiCard
              label={t("stats.totalReceived")}
              value={fmt(stats.totalSettled, stats.currency)}
              hint="Confirmé"
              accent="indigo"
            />
            <KpiCard
              label="Groupes"
              value={String(stats.groupCount)}
              hint="actifs"
              accent="muted"
            />
          </div>

          {/* === Timeline === */}
          <div className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ marginTop: 0, fontSize: 14 }}>
              📈 {t("stats.byMonth")}
            </h2>
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t("stats.totalSpent")} ({stats.currency})
              </div>
              <Sparkline
                data={stats.timeline.map((t) => t.totalSpent)}
                height={50}
                color="var(--saffron, #E8A33D)"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t("stats.netBalance")}
              </div>
              <Sparkline
                data={stats.timeline.map((t) => t.myNet)}
                height={50}
                color={
                  stats.myNet >= 0
                    ? "var(--emerald, #10b981)"
                    : "var(--terracotta, #b54732)"
                }
              />
            </div>
            {/* Mini légende mois */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
                fontSize: 9,
                color: "var(--muted)",
              }}
            >
              {stats.timeline.length > 0 && (
                <>
                  <span>{formatPeriod(stats.timeline[0]!.period)}</span>
                  <span>
                    {formatPeriod(
                      stats.timeline[stats.timeline.length - 1]!.period,
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* === Top catégories === */}
          {stats.topCategories.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h2 style={{ marginTop: 0, fontSize: 14 }}>
                🏷️ {t("stats.byCategory")}
              </h2>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 16,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  <DonutChart
                    data={stats.topCategories.map((c, i) => ({
                      label: c.category,
                      value: c.totalAmount,
                      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                    }))}
                    size={180}
                    unit={stats.currency}
                  />
                </div>
                <ul
                  style={{
                    flex: 1,
                    minWidth: 200,
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {stats.topCategories.map((c, i) => (
                    <li
                      key={c.category}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 0",
                        borderBottom:
                          i < stats.topCategories.length - 1
                            ? "1px solid var(--line-soft)"
                            : "none",
                        fontSize: 12,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, color: "var(--cream)" }}>
                        {CATEGORY_EMOJI[c.category.toLowerCase()] ?? "📂"}{" "}
                        {capitalize(c.category)}
                      </span>
                      <span
                        style={{
                          color: "var(--cream-soft)",
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {fmt(c.totalAmount, stats.currency)}
                      </span>
                      <span
                        style={{
                          color: "var(--muted)",
                          fontSize: 10,
                          minWidth: 40,
                          textAlign: "right",
                        }}
                      >
                        {c.percent.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* === Top payeurs === */}
          {stats.topPayers.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h2 style={{ marginTop: 0, fontSize: 14 }}>
                💸 {t("stats.byGroup")}
              </h2>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  margin: "0 0 8px",
                }}
              >
                Qui paie le plus dans tes groupes (toutes devises converties en{" "}
                {stats.currency})
              </p>
              <BarChart
                data={stats.topPayers.map((p) => ({
                  label: p.displayName,
                  value: p.totalPaid,
                }))}
                valueFormat={(n) => fmt(n, stats.currency)}
                unit={stats.currency}
              />
            </div>
          )}

          {/* === Tableau récap timeline détaillé === */}
          {stats.timeline.length > 0 && (
            <details
              className="card"
              style={{
                marginBottom: 14,
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--cream)",
                }}
              >
                📅 {t("stats.byMonth")}
              </summary>
              <div
                style={{
                  marginTop: 12,
                  overflowX: "auto",
                  WebkitOverflowScrolling: "touch",
                  // Indicateur visuel "scroll possible" sur mobile
                  ...(isMobile
                    ? {
                        background:
                          "linear-gradient(90deg, transparent 0%, transparent calc(100% - 24px), rgba(244,228,193,0.04) 100%)",
                      }
                    : {}),
                }}
              >
              <table
                style={{
                  width: "100%",
                  minWidth: isMobile ? 380 : undefined,
                  fontSize: 12,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      color: "var(--muted)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "6px 8px" }}>{t("stats.byMonth")}</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>
                      {t("stats.totalSpent")}
                    </th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>
                      {t("stats.netBalance")}
                    </th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>
                      Nb
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats.timeline].reverse().map((t) => (
                    <tr
                      key={t.period}
                      style={{
                        borderTop: "1px solid var(--line-soft)",
                        color: "var(--cream)",
                      }}
                    >
                      <td style={{ padding: "6px 8px" }}>
                        {formatPeriod(t.period)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          textAlign: "right",
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {fmt(t.totalSpent, stats.currency)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          textAlign: "right",
                          fontFamily: "ui-monospace, monospace",
                          color:
                            t.myNet >= 0
                              ? "var(--emerald, #10b981)"
                              : "var(--terracotta, #b54732)",
                        }}
                      >
                        {fmt(t.myNet, stats.currency)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          textAlign: "right",
                          color: "var(--muted)",
                        }}
                      >
                        {t.expenseCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </details>
          )}
        </>
      ) : null}
      </div>
    </ResponsiveShell>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: "saffron" | "emerald" | "indigo" | "terracotta" | "muted";
}) {
  const colors = {
    saffron: "#E8A33D",
    emerald: "#10B981",
    indigo: "#3A2F5B",
    terracotta: "#B54732",
    muted: "#7C6E93",
  };
  const accentColor = colors[accent];
  return (
    <div
      style={{
        background: "var(--overlay-2)",
        border: "1px solid var(--line-soft)",
        borderRadius: 12,
        padding: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          background: accentColor,
        }}
      />
      <div
        style={{
          fontSize: 10,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 4,
          paddingLeft: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--cream)",
          lineHeight: 1.1,
          paddingLeft: 6,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 10,
            color: "var(--cream-soft)",
            marginTop: 2,
            paddingLeft: 6,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function fmt(n: number, currency: string): string {
  const noDecimals = ["XAF", "XOF", "KES", "TZS", "UGX", "RWF", "CDF"];
  const decimals = noDecimals.includes(currency) ? 0 : 2;
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${currency}`;
}

function formatPeriod(period: string): string {
  // "2026-05" → "Mai 26"
  const [year, month] = period.split("-");
  const m = parseInt(month!, 10);
  const y = year!.slice(2);
  // Use Intl.DateTimeFormat for locale-aware month names
  const monthName = new Date(2000, m - 1).toLocaleString("fr-FR", { month: "short" });
  return `${monthName} ${y}`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
