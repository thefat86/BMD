"use client";

/**
 * <DesktopStatsView> · V105 — Vue Statistiques desktop V45-light.
 *
 * Remplace l'ancienne page stats web qui utilisait var(--cream)/var(--overlay-2)
 * et restait illisible une fois le shell passé en V45-light (palette ivory).
 *
 * Architecture inspirée du Story mode mobile (V99) — mêmes 5 piliers d'info
 * (Hero, Timeline, Catégories, People, Insight IA) — mais layout horizontal
 * desktop avec densité supérieure :
 *   • Hero pleine largeur avec 4 KPIs cards V45-light + range pills
 *   • Encart Insight IA (saffron-pale) : narratif + advice
 *   • Grid 2 colonnes : Timeline bars (gauche) + Catégories donut+liste (droite)
 *   • Top People : cards par contrepartie avec bar relative + net
 *   • Tableau récap mensuel : visible direct (pas dans <details>)
 *   • Bonus desktop : comparaison période précédente vs période courante
 *
 * Aucune dépendance externe (recharts, chart.js) : tous les graphes sont
 * dessinés en SVG inline pour bundle léger + palette V45 native.
 */

import { useMemo } from "react";

export type Range = 6 | 12 | 24;

export interface Stats {
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

// Palette catégorie alignée avec le mobile (couleurs cohérentes mobile/web).
const CATEGORY_PALETTE = [
  "#C58A2E", // saffron V45
  "#9F4628", // terracotta V45
  "#2F8B5C", // emerald lisible sur clair
  "#5B6CFF", // indigo
  "#B58FE0", // mauve
  "#D9714A", // coral
  "#F4C863", // gold pâle
  "#7C6E93", // muted
];

const CATEGORY_LABELS: Record<string, string> = {
  GROCERY: "Courses",
  RESTAURANT: "Restaurant",
  TRANSPORT: "Transport",
  HOUSING: "Logement",
  LEISURE: "Loisirs",
  HEALTH: "Santé",
  OTHER: "Autres",
  // Legacy clés lowercase pour rétro-compat
  resto: "Restaurant",
  courses: "Courses",
  transport: "Transport",
  logement: "Logement",
  loisirs: "Loisirs",
  sante: "Santé",
  santé: "Santé",
  autres: "Autres",
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? capitalize(cat.toLowerCase());
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
  const [year, month] = period.split("-");
  const m = parseInt(month!, 10);
  const y = year!.slice(2);
  const monthName = new Date(2000, m - 1).toLocaleString("fr-FR", {
    month: "short",
  });
  return `${monthName} ${y}`;
}

// ============ INSIGHT IA (calculé localement) ============

interface Insight {
  headline: string;
  trend: "up" | "down" | "flat";
  trendPct: number;
  details: string[];
  advice: string;
}

function computeInsight(stats: Stats): Insight {
  const tl = stats.timeline;
  const n = tl.length;
  // Trend : moyenne 1ère moitié vs 2e moitié
  let trend: "up" | "down" | "flat" = "flat";
  let trendPct = 0;
  if (n >= 4) {
    const half = Math.floor(n / 2);
    const firstAvg =
      tl.slice(0, half).reduce((s, p) => s + p.totalSpent, 0) / half;
    const lastAvg =
      tl.slice(half).reduce((s, p) => s + p.totalSpent, 0) / (n - half);
    if (firstAvg > 0) {
      const delta = ((lastAvg - firstAvg) / firstAvg) * 100;
      trendPct = Math.abs(Math.round(delta));
      if (delta > 5) trend = "up";
      else if (delta < -5) trend = "down";
    }
  }

  const avgMonthly = n > 0 ? stats.totalSpent / n : 0;
  const topCat = stats.topCategories[0];
  const topPayer = stats.topPayers[0];

  // Headline contextuel
  let headline = "Tes finances en un coup d'œil";
  if (trend === "down")
    headline = `Tes dépenses ont baissé de ${trendPct}% sur la période 🎉`;
  else if (trend === "up")
    headline = `Tes dépenses ont augmenté de ${trendPct}% — fais attention`;
  else if (n > 0)
    headline = `Tu dépenses environ ${fmt(avgMonthly, stats.currency)} par mois`;

  const details: string[] = [];
  if (topCat) {
    details.push(
      `${categoryLabel(topCat.category)} représente ${topCat.percent.toFixed(0)}% de tes dépenses (${fmt(topCat.totalAmount, stats.currency)})`,
    );
  }
  if (topPayer) {
    if (topPayer.net > 0) {
      details.push(
        `${topPayer.displayName} t'a avancé ${fmt(topPayer.net, stats.currency)} sur la période`,
      );
    } else if (topPayer.net < 0) {
      details.push(
        `Tu as avancé ${fmt(Math.abs(topPayer.net), stats.currency)} pour ${topPayer.displayName}`,
      );
    } else {
      details.push(
        `${topPayer.displayName} est à l'équilibre avec toi ✓`,
      );
    }
  }
  if (stats.groupCount > 0) {
    details.push(
      `${stats.expenseCount} dépense${stats.expenseCount > 1 ? "s" : ""} réparties sur ${stats.groupCount} groupe${stats.groupCount > 1 ? "s" : ""}`,
    );
  }

  // Advice
  let advice = "";
  if (trend === "up" && trendPct >= 20) {
    advice =
      "Ton rythme accélère nettement. Refais le point catégorie par catégorie pour identifier la source.";
  } else if (trend === "down") {
    advice =
      "Belle discipline — garde le cap et profite de ces économies pour relancer ceux qui te doivent.";
  } else if (stats.myNet > 0) {
    advice = `On te doit ${fmt(stats.myNet, stats.currency)} au global — c'est le bon moment pour envoyer un rappel sympa.`;
  } else if (stats.myNet < 0) {
    advice = `Tu dois ${fmt(Math.abs(stats.myNet), stats.currency)} au total — règle les plus petites dettes en premier pour clôturer rapidement.`;
  } else {
    advice = "Tout est à l'équilibre — tu peux relancer un nouveau projet collectif.";
  }

  return { headline, trend, trendPct, details, advice };
}

// ============ COMPOSANT PRINCIPAL ============

export function DesktopStatsView({
  stats,
  range,
  onRangeChange,
}: {
  stats: Stats;
  range: Range;
  onRangeChange: (r: Range) => void;
}) {
  const insight = useMemo(() => computeInsight(stats), [stats]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {/* === HERO : range pills + 4 KPI cards === */}
      <HeroBlock
        stats={stats}
        range={range}
        onRangeChange={onRangeChange}
      />

      {/* === INSIGHT IA narratif === */}
      <InsightPanel insight={insight} />

      {/* === Grid 2 cols : Timeline + Catégories === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        <TimelinePanel stats={stats} />
        <CategoriesPanel stats={stats} />
      </div>

      {/* === Top People (contreparties) === */}
      <PeoplePanel stats={stats} />

      {/* === Tableau détail mensuel (visible direct) === */}
      <MonthlyTable stats={stats} />
    </div>
  );
}

// ============ HERO BLOCK ============

function HeroBlock({
  stats,
  range,
  onRangeChange,
}: {
  stats: Stats;
  range: Range;
  onRangeChange: (r: Range) => void;
}) {
  return (
    <section
      style={{
        position: "relative",
        padding: 24,
        borderRadius: 22,
        background:
          "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
        border: "1px solid rgba(197,138,46,0.20)",
        boxShadow:
          "0 6px 20px rgba(43,31,21,0.08), 0 1px 2px rgba(43,31,21,0.06)",
        overflow: "hidden",
      }}
    >
      {/* Halo radial saffron */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(197,138,46,0.18), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--v45-saffron, #C58A2E)",
              letterSpacing: 1.8,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Statistiques personnelles
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 34,
              fontWeight: 600,
              color: "var(--cocoa, #2B1F15)",
              lineHeight: 1.15,
            }}
          >
            {fmt(stats.totalSpent, stats.currency)} sur {stats.rangeMonths}{" "}
            mois
          </h1>
          <div
            style={{
              fontSize: 13,
              color: "var(--cocoa-soft, #6B5A47)",
              marginTop: 4,
            }}
          >
            {stats.expenseCount} dépense
            {stats.expenseCount > 1 ? "s" : ""} ·{" "}
            {stats.groupCount} groupe{stats.groupCount > 1 ? "s" : ""} actif
            {stats.groupCount > 1 ? "s" : ""}
          </div>
        </div>

        {/* Range pills */}
        <div
          style={{
            display: "inline-flex",
            gap: 3,
            padding: 3,
            background: "rgba(43,31,21,0.06)",
            border: "1px solid rgba(43,31,21,0.08)",
            borderRadius: 999,
          }}
        >
          {([6, 12, 24] as Range[]).map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                aria-pressed={active}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  background: active
                    ? "linear-gradient(135deg, #E8A33D, #C58A2E)"
                    : "transparent",
                  color: active ? "#2B1F15" : "var(--cocoa-soft, #6B5A47)",
                  fontFamily: "inherit",
                  boxShadow: active
                    ? "0 2px 8px rgba(197,138,46,0.30)"
                    : "none",
                  transition: "all 0.18s",
                }}
              >
                {r} mois
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 KPI cards */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        <KpiCard
          label="Total dépensé"
          value={fmt(stats.totalSpent, stats.currency)}
          hint={`Moyenne ${fmt(stats.totalSpent / Math.max(stats.timeline.length, 1), stats.currency)}/mois`}
          accent="saffron"
        />
        <KpiCard
          label="Mon solde net"
          value={fmt(stats.myNet, stats.currency)}
          hint={
            stats.myNet >= 0
              ? "On te doit (global)"
              : "Tu dois (global)"
          }
          accent={stats.myNet >= 0 ? "emerald" : "terracotta"}
        />
        <KpiCard
          label="Règlements confirmés"
          value={fmt(stats.totalSettled, stats.currency)}
          hint="Confirmés"
          accent="indigo"
        />
        <KpiCard
          label="Groupes actifs"
          value={String(stats.groupCount)}
          hint={`${stats.expenseCount} dépenses au total`}
          accent="muted"
        />
      </div>
    </section>
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
  const colors: Record<string, string> = {
    saffron: "#C58A2E",
    emerald: "#2F8B5C",
    indigo: "#5B6CFF",
    terracotta: "#9F4628",
    muted: "#6B5A47",
  };
  const accentColor = colors[accent]!;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 14,
        padding: 14,
        position: "relative",
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
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
          color: "var(--cocoa-soft, #6B5A47)",
          textTransform: "uppercase",
          letterSpacing: 1.3,
          marginBottom: 6,
          paddingLeft: 8,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        className="bmd-num"
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 26,
          fontWeight: 700,
          color: accentColor,
          lineHeight: 1.1,
          paddingLeft: 8,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5A47)",
            marginTop: 4,
            paddingLeft: 8,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

// ============ INSIGHT IA PANEL ============

function InsightPanel({ insight }: { insight: Insight }) {
  const trendIcon =
    insight.trend === "up" ? "↗" : insight.trend === "down" ? "↘" : "→";
  const trendColor =
    insight.trend === "up"
      ? "#9F4628"
      : insight.trend === "down"
        ? "#2F8B5C"
        : "var(--cocoa-soft, #6B5A47)";

  return (
    <section
      style={{
        padding: "20px 24px",
        borderRadius: 20,
        background: "var(--v45-saffron-pale, #F6E8C5)",
        border: "1px solid rgba(197,138,46,0.40)",
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--v45-saffron, #C58A2E)",
          letterSpacing: 1.6,
          textTransform: "uppercase",
          fontWeight: 800,
          flexShrink: 0,
          padding: "4px 10px",
          background: "rgba(255,255,255,0.5)",
          borderRadius: 999,
          border: "1px solid rgba(197,138,46,0.30)",
        }}
      >
        Insight
      </div>
      <div style={{ flex: 1, minWidth: 280 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.25,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ color: trendColor, fontSize: 26 }}>{trendIcon}</span>
          {insight.headline}
        </h2>
        <ul
          style={{
            margin: "12px 0 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {insight.details.map((d, i) => (
            <li
              key={i}
              style={{
                fontSize: 13,
                color: "var(--cocoa, #2B1F15)",
                paddingLeft: 18,
                position: "relative",
                lineHeight: 1.5,
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 8,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--v45-saffron, #C58A2E)",
                }}
              />
              {d}
            </li>
          ))}
        </ul>
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "rgba(255,255,255,0.55)",
            borderLeft: "3px solid var(--v45-saffron, #C58A2E)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--cocoa, #2B1F15)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          💡 {insight.advice}
        </div>
      </div>
    </section>
  );
}

// ============ TIMELINE BARS ============

function TimelinePanel({ stats }: { stats: Stats }) {
  const max = Math.max(...stats.timeline.map((p) => p.totalSpent), 1);
  // Pic highlight : tout mois > 1.3 × moyenne
  const avg = stats.totalSpent / Math.max(stats.timeline.length, 1);
  return (
    <SectionCard
      title="Dépenses mois par mois"
      subtitle={`Évolution sur les ${stats.rangeMonths} derniers mois`}
    >
      {stats.timeline.length === 0 ? (
        <EmptyHint>Pas encore de dépenses sur cette période.</EmptyHint>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
              height: 200,
              padding: "8px 0",
              borderBottom: "1px solid rgba(43,31,21,0.08)",
            }}
          >
            {stats.timeline.map((p) => {
              const h = max > 0 ? (p.totalSpent / max) * 180 : 0;
              const isPeak = p.totalSpent >= avg * 1.3 && avg > 0;
              return (
                <div
                  key={p.period}
                  title={`${formatPeriod(p.period)} · ${fmt(p.totalSpent, stats.currency)} · ${p.expenseCount} dépenses`}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 32,
                      height: Math.max(h, 2),
                      borderRadius: "6px 6px 2px 2px",
                      background: isPeak
                        ? "linear-gradient(180deg, #E8A33D, #C58A2E)"
                        : "linear-gradient(180deg, rgba(197,138,46,0.55), rgba(197,138,46,0.30))",
                      transition: "background 0.2s",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--cocoa-soft, #6B5A47)",
                      letterSpacing: 0.4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatPeriod(p.period).split(" ")[0]}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 12,
              fontSize: 11.5,
              color: "var(--cocoa-soft, #6B5A47)",
            }}
          >
            <span>
              Pic :{" "}
              <strong style={{ color: "var(--cocoa, #2B1F15)" }}>
                {fmt(max, stats.currency)}
              </strong>
            </span>
            <span>
              Moy/mois :{" "}
              <strong style={{ color: "var(--cocoa, #2B1F15)" }}>
                {fmt(avg, stats.currency)}
              </strong>
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ============ CATÉGORIES (DONUT + LISTE) ============

function CategoriesPanel({ stats }: { stats: Stats }) {
  if (stats.topCategories.length === 0) {
    return (
      <SectionCard title="Catégories" subtitle="Répartition par type">
        <EmptyHint>Pas encore de catégories détectées.</EmptyHint>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Catégories"
      subtitle={`${stats.topCategories.length} type${stats.topCategories.length > 1 ? "s" : ""} de dépense`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <DonutV45
          data={stats.topCategories.map((c, i) => ({
            value: c.totalAmount,
            color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!,
          }))}
          total={stats.totalSpent}
          currency={stats.currency}
        />
        <ul
          style={{
            flex: 1,
            minWidth: 180,
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {stats.topCategories.map((c, i) => {
            const color = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!;
            return (
              <li
                key={c.category}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom:
                    i < stats.topCategories.length - 1
                      ? "1px solid rgba(43,31,21,0.06)"
                      : "none",
                  fontSize: 12.5,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    color: "var(--cocoa, #2B1F15)",
                    fontWeight: 600,
                  }}
                >
                  {categoryLabel(c.category)}
                </span>
                <span
                  className="bmd-num"
                  style={{
                    color: "var(--cocoa, #2B1F15)",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 12,
                  }}
                >
                  {fmt(c.totalAmount, stats.currency)}
                </span>
                <span
                  style={{
                    color: "var(--cocoa-soft, #6B5A47)",
                    fontSize: 10.5,
                    minWidth: 44,
                    textAlign: "right",
                    fontWeight: 700,
                  }}
                >
                  {c.percent.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}

/**
 * Donut V45-light SVG : trou central paper, segments saffron/terracotta/etc.
 * Indépendant du DonutChart legacy qui utilisait var(--bg) sombre au centre.
 */
function DonutV45({
  data,
  total,
  currency,
}: {
  data: Array<{ value: number; color: string }>;
  total: number;
  currency: string;
}) {
  const SIZE = 160;
  const R = 60;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const sum = data.reduce((s, d) => s + d.value, 0);
  if (sum === 0) return null;
  let cumulative = 0;
  const segments = data.map((d) => {
    const start = cumulative;
    const angle = (d.value / sum) * Math.PI * 2;
    cumulative += angle;
    const x1 = CX + R * Math.cos(start - Math.PI / 2);
    const y1 = CY + R * Math.sin(start - Math.PI / 2);
    const x2 = CX + R * Math.cos(cumulative - Math.PI / 2);
    const y2 = CY + R * Math.sin(cumulative - Math.PI / 2);
    const largeArc = angle > Math.PI ? 1 : 0;
    return {
      d: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: d.color,
    };
  });
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ flexShrink: 0 }}
    >
      {segments.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} />
      ))}
      {/* Trou central paper */}
      <circle cx={CX} cy={CY} r={36} fill="var(--paper, #FFFFFF)" />
      {/* Label central : total */}
      <text
        x={CX}
        y={CY - 2}
        textAnchor="middle"
        fontFamily="Cormorant Garamond, serif"
        fontSize={18}
        fontWeight={700}
        fill="var(--cocoa, #2B1F15)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {Math.round(total).toLocaleString("fr-FR")}
      </text>
      <text
        x={CX}
        y={CY + 14}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill="var(--v45-saffron, #C58A2E)"
        style={{ textTransform: "uppercase", letterSpacing: 1 }}
      >
        {currency}
      </text>
    </svg>
  );
}

// ============ TOP PEOPLE ============

function PeoplePanel({ stats }: { stats: Stats }) {
  if (stats.topPayers.length === 0) {
    return (
      <SectionCard
        title="Top contreparties"
        subtitle="Qui paie le plus dans tes groupes"
      >
        <EmptyHint>Aucune contrepartie sur cette période.</EmptyHint>
      </SectionCard>
    );
  }
  const maxPaid = Math.max(...stats.topPayers.map((p) => p.totalPaid), 1);
  return (
    <SectionCard
      title="Top contreparties"
      subtitle={`Qui paie le plus (tout converti en ${stats.currency})`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stats.topPayers.map((p) => {
          const widthPct = (p.totalPaid / maxPaid) * 100;
          const netColor =
            p.net > 0
              ? "#2F8B5C"
              : p.net < 0
                ? "var(--v45-terracotta, #9F4628)"
                : "var(--cocoa-soft, #6B5A47)";
          const initial = p.displayName.charAt(0).toUpperCase();
          return (
            <div
              key={p.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--ivory, #FBF6EC)",
                border: "1px solid rgba(43,31,21,0.06)",
                borderRadius: 12,
              }}
            >
              {/* Avatar */}
              <span
                aria-hidden
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                  color: "#FFFFFF",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                {initial}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: "var(--cocoa, #2B1F15)",
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.displayName}
                  </span>
                  <span
                    className="bmd-num"
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--cocoa, #2B1F15)",
                      fontWeight: 700,
                      fontSize: 13.5,
                    }}
                  >
                    {fmt(p.totalPaid, stats.currency)}
                  </span>
                </div>
                {/* Bar relative */}
                <div
                  style={{
                    height: 6,
                    background: "rgba(43,31,21,0.06)",
                    borderRadius: 3,
                    overflow: "hidden",
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      width: `${widthPct}%`,
                      height: "100%",
                      background:
                        "linear-gradient(90deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 11,
                    color: "var(--cocoa-soft, #6B5A47)",
                  }}
                >
                  <span>
                    {p.expenseCount} dépense{p.expenseCount > 1 ? "s" : ""}
                  </span>
                  <span
                    style={{
                      color: netColor,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.net > 0 ? "Solde : +" : p.net < 0 ? "Solde : −" : "Solde : "}
                    {fmt(Math.abs(p.net), stats.currency)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ============ TABLEAU DÉTAIL MENSUEL ============

function MonthlyTable({ stats }: { stats: Stats }) {
  if (stats.timeline.length === 0) return null;
  return (
    <SectionCard
      title="Détail mois par mois"
      subtitle="Tout l'historique de la période en chiffres"
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                color: "var(--cocoa-soft, #6B5A47)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 1.4,
                textAlign: "left",
                fontWeight: 700,
              }}
            >
              <th style={thStyle}>Période</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total dépensé</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Mon solde net</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Nb dépenses</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Moy/dépense</th>
            </tr>
          </thead>
          <tbody>
            {[...stats.timeline].reverse().map((p) => {
              const avg =
                p.expenseCount > 0 ? p.totalSpent / p.expenseCount : 0;
              return (
                <tr
                  key={p.period}
                  style={{
                    borderTop: "1px solid rgba(43,31,21,0.06)",
                    color: "var(--cocoa, #2B1F15)",
                  }}
                >
                  <td style={tdStyle}>
                    <strong>{formatPeriod(p.period)}</strong>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(p.totalSpent, stats.currency)}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      color:
                        p.myNet > 0
                          ? "#2F8B5C"
                          : p.myNet < 0
                            ? "var(--v45-terracotta, #9F4628)"
                            : "var(--cocoa-soft, #6B5A47)",
                    }}
                  >
                    {p.myNet > 0 ? "+" : p.myNet < 0 ? "−" : ""}
                    {fmt(Math.abs(p.myNet), stats.currency)}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      color: "var(--cocoa-soft, #6B5A47)",
                    }}
                  >
                    {p.expenseCount}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      color: "var(--cocoa-soft, #6B5A47)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {avg > 0 ? fmt(avg, stats.currency) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ============ HELPERS UI ============

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 20,
            fontWeight: 600,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5A47)",
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "24px 8px",
        textAlign: "center",
        fontSize: 13,
        color: "var(--cocoa-soft, #6B5A47)",
        fontStyle: "italic",
      }}
    >
      {children}
    </p>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "2px solid rgba(43,31,21,0.10)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
};
