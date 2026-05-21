"use client";

/**
 * <AdminProfitability> · V72 — Dashboard pro de rentabilité (LIVE).
 *
 * Bascule complète sur la table UsageEvent : tous les chiffres sont des
 * COÛTS RÉELS agrégés depuis chaque appel facturable (OpenAI, Mindee,
 * Twilio, Resend, WhatsApp). Plus d'estimations.
 *
 * Sections :
 *   1. Sélecteur de période (7j / 30j / 90j)
 *   2. KPIs : Revenu / Coût / Marge / Users en perte (badge "LIVE")
 *   3. Chart timeseries (Recharts) — coût par jour
 *   4. Breakdown par (provider, kind) — où part l'argent
 *   5. Tableau clients triable avec ventilation OCR/Voix/SMS/Email/LLM/Meetings
 *
 * Recharts est déjà importé ailleurs dans l'app (admin-charts).
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api-client";

type SortKey = "margin_asc" | "margin_desc" | "revenue_desc" | "cost_desc";
type Period = 7 | 30 | 90;

interface Props {
  limit?: number;
}

function formatEuros(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  if (abs < 100) return `${sign}${(abs / 100).toFixed(2)} €`;
  return `${sign}${(abs / 100).toFixed(2)} €`;
}

function formatShortEuros(cents: number): string {
  const abs = Math.abs(cents);
  if (abs >= 100_000) return `${(cents / 100000).toFixed(1)}k €`;
  return `${(cents / 100).toFixed(0)} €`;
}

export function AdminProfitability({ limit = 150 }: Props) {
  const [days, setDays] = useState<Period>(30);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.adminProfitability>
  > | null>(null);
  const [series, setSeries] = useState<Awaited<
    ReturnType<typeof api.adminUsageTimeseries>
  > | null>(null);
  const [breakdown, setBreakdown] = useState<Awaited<
    ReturnType<typeof api.adminUsageBreakdown>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("margin_asc");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.adminProfitability({
        sort,
        limit,
        days,
        search: searchDebounced || undefined,
      }),
      api.adminUsageTimeseries(days),
      api.adminUsageBreakdown(days),
    ])
      .then(([prof, ts, br]) => {
        if (cancelled) return;
        setData(prof);
        setSeries(ts);
        setBreakdown(br);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, days, limit, searchDebounced]);

  const chartData = useMemo(
    () =>
      series?.points.map((p) => ({
        day: p.day.slice(5), // MM-DD pour compacité
        cost: p.costCents / 100, // en € pour le label
        costCents: p.costCents,
        calls: p.count,
      })) ?? [],
    [series],
  );
  const chartMax = useMemo(
    () => Math.max(0.01, ...chartData.map((d) => d.cost)),
    [chartData],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Bandeau "live" + sélecteur période */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            background: "rgba(125,197,158,0.15)",
            border: "1px solid rgba(125,197,158,0.40)",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            color: "#7DC59E",
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#7DC59E",
              boxShadow: "0 0 0 0 rgba(125,197,158,0.6)",
              animation: "bmd-pulse 1.8s ease-out infinite",
            }}
            aria-hidden
          />
          Données live · UsageEvent
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {([7, 30, 90] as Period[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 8,
                border:
                  days === d
                    ? "1px solid var(--saffron)"
                    : "1px solid rgba(244,228,193,0.15)",
                background:
                  days === d
                    ? "rgba(232,163,61,0.20)"
                    : "rgba(244,228,193,0.04)",
                color: days === d ? "var(--saffron)" : "var(--cream-soft)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {d} jours
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes bmd-pulse {
          0% { box-shadow: 0 0 0 0 rgba(125,197,158,0.6); }
          70% { box-shadow: 0 0 0 8px rgba(125,197,158,0); }
          100% { box-shadow: 0 0 0 0 rgba(125,197,158,0); }
        }
      `}</style>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <KpiCard
          label={`Revenu (${days}j)`}
          value={data ? formatEuros(data.summary.totalRevenueCents) : "—"}
          sub={data ? `${data.summary.payingUsers} payant(s)` : ""}
          tone="neutral"
        />
        <KpiCard
          label="Coût réel IA + messaging"
          value={data ? formatEuros(data.summary.totalCostCents) : "—"}
          sub={
            data
              ? `${data.summary.totalOcr + data.summary.totalVoice + data.summary.totalMeetings + data.summary.totalLlm} appels IA · ${data.summary.totalSms + data.summary.totalVerify + data.summary.totalWhatsapp} SMS · ${data.summary.totalEmail} emails`
              : ""
          }
          tone="neutral"
        />
        <KpiCard
          label="Marge brute"
          value={data ? formatEuros(data.summary.totalMarginCents) : "—"}
          sub={
            data && data.summary.totalRevenueCents > 0
              ? `${((data.summary.totalMarginCents / data.summary.totalRevenueCents) * 100).toFixed(1)} % marge`
              : ""
          }
          tone={
            data && data.summary.totalMarginCents < 0 ? "danger" : "ok"
          }
        />
        <KpiCard
          label="Clients en perte"
          value={
            data
              ? `${data.summary.unprofitableUsers} / ${data.summary.userCount}`
              : "—"
          }
          sub={
            data && data.summary.unprofitableUsers > 0
              ? "À migrer vers un plan supérieur"
              : "Aucun client en perte sur la période"
          }
          tone={data && data.summary.unprofitableUsers > 0 ? "danger" : "ok"}
        />
      </div>

      {/* Chart timeseries — coût par jour */}
      <div
        style={{
          padding: 14,
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
          background: "rgba(244,228,193,0.02)",
        }}
      >
        <h3
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1.4,
            color: "var(--saffron)",
            margin: "0 0 10px",
            fontWeight: 700,
          }}
        >
          Coût quotidien (€) — {days} derniers jours
        </h3>
        <div style={{ width: "100%" }}>
          {chartData.length > 0 ? (
            <TimeseriesChart data={chartData} maxValue={chartMax} />
          ) : (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--cream-soft)",
                fontSize: 13,
              }}
            >
              {loading
                ? "Chargement…"
                : "Aucune donnée — la table UsageEvent est vide. Le tracking est en place : les prochaines actions y seront enregistrées."}
            </div>
          )}
        </div>
      </div>

      {/* Breakdown par provider+kind */}
      <div
        style={{
          padding: 14,
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
          background: "rgba(244,228,193,0.02)",
        }}
      >
        <h3
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1.4,
            color: "var(--saffron)",
            margin: "0 0 10px",
            fontWeight: 700,
          }}
        >
          Où part l'argent — ventilation par service ({days}j)
        </h3>
        {breakdown && breakdown.breakdown.length > 0 ? (
          <BreakdownBars
            items={breakdown.breakdown.slice(0, 10)}
            totalCostCents={breakdown.totalCostCents}
          />
        ) : (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              color: "var(--cream-soft)",
              fontSize: 12,
            }}
          >
            {loading ? "Chargement…" : "Aucun event sur la période."}
          </div>
        )}
      </div>

      {/* Toolbar table */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="search"
          placeholder="Filtrer un client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            padding: "10px 14px",
            background: "rgba(244,228,193,0.05)",
            border: "1px solid rgba(244,228,193,0.18)",
            borderRadius: 10,
            color: "var(--cream)",
            fontSize: 13,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--cream-soft)",
          }}
        >
          Tri :
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{
              padding: "8px 10px",
              background: "rgba(244,228,193,0.05)",
              border: "1px solid rgba(244,228,193,0.18)",
              borderRadius: 8,
              color: "var(--cream)",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            <option value="margin_asc">Marge ↑ (pertes en haut)</option>
            <option value="margin_desc">Marge ↓</option>
            <option value="revenue_desc">Revenu ↓</option>
            <option value="cost_desc">Coût ↓</option>
          </select>
        </label>
        {loading && (
          <span style={{ fontSize: 12, color: "var(--cream-soft)" }}>
            Chargement…
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            background: "rgba(228,124,95,0.10)",
            border: "1px solid rgba(228,124,95,0.35)",
            borderRadius: 10,
            color: "#E47C5F",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Tableau clients */}
      {data && data.rows.length > 0 ? (
        <div
          style={{
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                minWidth: 1000,
              }}
            >
              <thead
                style={{
                  background: "rgba(244,228,193,0.04)",
                  position: "sticky",
                  top: 0,
                }}
              >
                <tr>
                  <Th>Client</Th>
                  <Th>Plan</Th>
                  <Th align="right">Revenu</Th>
                  <Th align="right">OCR</Th>
                  <Th align="right">Voix</Th>
                  <Th align="right">Meetings</Th>
                  <Th align="right">LLM</Th>
                  <Th align="right">SMS+Vérif</Th>
                  <Th align="right">Email</Th>
                  <Th align="right">Coût total</Th>
                  <Th align="right">Marge</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.userId}
                    style={{
                      borderTop: "1px solid rgba(244,228,193,0.06)",
                      background: r.isUnprofitable
                        ? "rgba(228,124,95,0.06)"
                        : "transparent",
                    }}
                  >
                    <td style={{ padding: "9px 10px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "var(--cream)" }}>
                          {r.displayName}
                        </span>
                        {r.primaryContact && (
                          <span
                            style={{
                              fontSize: 10.5,
                              color: "var(--cream-soft)",
                              opacity: 0.7,
                            }}
                          >
                            {r.primaryContact.value}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "9px 10px" }}>
                      <span
                        style={{
                          padding: "2px 7px",
                          background: "rgba(232,163,61,0.10)",
                          border: "1px solid rgba(232,163,61,0.25)",
                          borderRadius: 6,
                          color: "var(--saffron)",
                          fontSize: 10.5,
                          fontWeight: 600,
                        }}
                      >
                        {r.planName}
                      </span>
                    </td>
                    <Cell className="bmd-num">
                      {formatShortEuros(r.revenueCents)}
                    </Cell>
                    <UsageCell count={r.ocr.count} costCents={r.ocr.costCents} />
                    <UsageCell
                      count={r.voice.count}
                      costCents={r.voice.costCents}
                    />
                    <UsageCell
                      count={r.meeting.count}
                      costCents={r.meeting.costCents}
                    />
                    <UsageCell count={r.llm.count} costCents={r.llm.costCents} />
                    <UsageCell
                      count={r.sms.count + r.verify.count}
                      costCents={r.sms.costCents + r.verify.costCents}
                    />
                    <UsageCell
                      count={r.email.count}
                      costCents={r.email.costCents}
                    />
                    <Cell
                      className="bmd-num"
                      style={{
                        color:
                          r.costCents > 0 ? "#E8A33D" : "var(--cream-soft)",
                        fontWeight: 600,
                      }}
                    >
                      {formatShortEuros(r.costCents)}
                    </Cell>
                    <Cell
                      className="bmd-num"
                      style={{
                        fontWeight: 700,
                        color:
                          r.marginCents < 0
                            ? "#E47C5F"
                            : r.marginCents > 0
                              ? "#7DC59E"
                              : "var(--cream-soft)",
                      }}
                    >
                      {r.isUnprofitable && (
                        <span aria-hidden style={{ marginRight: 3 }}>
                          ⚠
                        </span>
                      )}
                      {formatShortEuros(r.marginCents)}
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.truncated && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(244,228,193,0.03)",
                borderTop: "1px solid rgba(244,228,193,0.06)",
                fontSize: 11.5,
                color: "var(--cream-soft)",
                textAlign: "center",
              }}
            >
              {data.rows.length} sur {data.totalRows} clients — affine la
              recherche pour voir plus.
            </div>
          )}
        </div>
      ) : (
        !loading && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--cream-soft)",
              fontSize: 13,
            }}
          >
            {searchDebounced
              ? `Aucun client ne correspond à « ${searchDebounced} ».`
              : "Aucun client actif sur la période."}
          </div>
        )
      )}

      {/* Info pied de page */}
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(244,228,193,0.03)",
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 10,
          fontSize: 11.5,
          color: "var(--cream-soft)",
          lineHeight: 1.6,
        }}
      >
        Les chiffres sont basés sur la table <code>UsageEvent</code>, alimentée
        en temps réel à chaque appel facturable (OpenAI Whisper/Vision/Chat,
        Mindee OCR, Twilio SMS+Verify, Resend Email, WhatsApp Cloud API). Les
        tarifs sont définis dans{" "}
        <code>apps/api/src/lib/usage-tracker.ts</code> ; ajuste-les si OpenAI ou
        Twilio bougent leurs prix.
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "ok" | "danger" | "neutral";
  sub?: string;
}) {
  const accent =
    tone === "danger" ? "#E47C5F" : tone === "ok" ? "#7DC59E" : "var(--saffron)";
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "rgba(244,228,193,0.04)",
        border: "1px solid rgba(244,228,193,0.10)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          fontWeight: 700,
          color: "var(--cream-soft)",
        }}
      >
        {label}
      </div>
      <div
        className="bmd-num"
        style={{ fontSize: 22, fontWeight: 800, color: accent }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--cream-soft)", opacity: 0.78 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "9px 10px",
        textAlign: align,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.9,
        fontWeight: 700,
        color: "var(--saffron)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "9px 10px",
        textAlign: "right",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

/**
 * Chart timeseries SVG inline — coût quotidien (€) sur la fenêtre.
 *
 * Pas de dépendance externe. Polyline saffron + dots + tooltip hover via
 * `<title>` natif (accessible et léger). On laisse le viewBox responsive.
 */
function TimeseriesChart({
  data,
  maxValue,
}: {
  data: Array<{ day: string; cost: number; costCents: number; calls: number }>;
  maxValue: number;
}) {
  const W = 700;
  const H = 200;
  const PAD = { top: 14, right: 12, bottom: 22, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = data.length;
  // Y-axis : 4 ticks équidistants
  const yTicks = 4;
  const yStep = maxValue / yTicks;

  function x(i: number) {
    if (n <= 1) return PAD.left;
    return PAD.left + (i / (n - 1)) * innerW;
  }
  function y(value: number) {
    return PAD.top + innerH - (value / maxValue) * innerH;
  }

  const pathD = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.cost).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: 220, display: "block" }}
      role="img"
      aria-label="Évolution du coût quotidien"
    >
      {/* Gridlines + Y labels */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const v = yStep * (yTicks - i);
        const yy = PAD.top + (i / yTicks) * innerH;
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yy}
              y2={yy}
              stroke="rgba(244,228,193,0.08)"
              strokeDasharray="3 3"
            />
            <text
              x={PAD.left - 6}
              y={yy + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--cream-soft)"
            >
              {v.toFixed(2)}€
            </text>
          </g>
        );
      })}

      {/* X labels (premier, milieu, dernier) */}
      {[0, Math.floor(n / 2), n - 1]
        .filter((i) => i >= 0 && i < n)
        .map((i) => (
          <text
            key={`x-${i}`}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={10}
            fill="var(--cream-soft)"
          >
            {data[i]?.day}
          </text>
        ))}

      {/* Ligne du coût */}
      <path
        d={pathD}
        fill="none"
        stroke="#E8A33D"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Points avec hover tooltip (title natif) */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.cost)} r={2.5} fill="#E8A33D" />
          {/* Zone de hit invisible plus large pour tooltip */}
          <circle
            cx={x(i)}
            cy={y(d.cost)}
            r={8}
            fill="transparent"
            style={{ cursor: "pointer" }}
          >
            <title>
              {d.day} · {d.cost.toFixed(3)} € · {d.calls} appel(s)
            </title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

/**
 * Liste barres horizontales — ventilation par (provider, kind).
 * Pas de SVG, juste des div avec width % pour rester ultra-léger.
 */
function BreakdownBars({
  items,
  totalCostCents,
}: {
  items: Array<{
    kind: string;
    provider: string;
    count: number;
    costCents: number;
  }>;
  totalCostCents: number;
}) {
  const maxCost = Math.max(0.01, ...items.map((i) => i.costCents));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((b) => {
        const pct = totalCostCents > 0 ? (b.costCents / totalCostCents) * 100 : 0;
        const barPct = (b.costCents / maxCost) * 100;
        return (
          <div
            key={`${b.provider}-${b.kind}`}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr 90px 70px",
              gap: 10,
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--cream)", fontWeight: 600 }}>
              {b.provider}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 10,
                  color: "var(--cream-soft)",
                  opacity: 0.7,
                }}
              >
                · {b.kind.replace(/_/g, " ").toLowerCase()}
              </span>
            </span>
            <div
              style={{
                height: 14,
                background: "rgba(244,228,193,0.06)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${barPct}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, var(--saffron), var(--terracotta, #C58A2E))",
                  borderRadius: 4,
                  transition: "width 200ms ease",
                }}
              />
            </div>
            <span
              className="bmd-num"
              style={{
                color: "#E8A33D",
                fontWeight: 700,
                textAlign: "right",
              }}
            >
              {formatShortEuros(b.costCents)}
            </span>
            <span
              style={{
                color: "var(--cream-soft)",
                fontSize: 11,
                textAlign: "right",
              }}
            >
              {b.count} · {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Cellule compacte : "count\n€coût" empilé, gris si zéro */
function UsageCell({ count, costCents }: { count: number; costCents: number }) {
  const isZero = count === 0;
  return (
    <td style={{ padding: "9px 10px", textAlign: "right" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          alignItems: "flex-end",
        }}
      >
        <span
          className="bmd-num"
          style={{
            fontSize: 12,
            color: isZero ? "var(--cream-soft)" : "var(--cream)",
            opacity: isZero ? 0.4 : 1,
            fontWeight: 600,
          }}
        >
          {count}
        </span>
        {!isZero && (
          <span
            className="bmd-num"
            style={{
              fontSize: 10,
              color: "#E8A33D",
              opacity: 0.85,
            }}
          >
            {formatShortEuros(costCents)}
          </span>
        )}
      </div>
    </td>
  );
}
