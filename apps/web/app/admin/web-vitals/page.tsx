"use client";

/**
 * V176 — Page admin Core Web Vitals.
 *
 * Affiche les 5 métriques Google (LCP/INP/CLS/FCP/TTFB) agrégées sur
 * 1, 7 ou 30 jours, avec p75/p95, distribution good/needs/poor, top 10
 * pages et breakdown mobile/desktop.
 *
 * Auth admin requise — gérée côté backend par `assertSuperAdmin`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { getToken } from "../../../lib/api-client";

type Period = 1 | 7 | 30;
type DeviceFilter = "all" | "mobile" | "desktop";

type MetricName = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";

interface MetricStat {
  p75: number;
  p95: number;
  samples: number;
  goodPct: number;
  needsImprovementPct: number;
  poorPct: number;
}

interface Summary {
  period: string;
  totalSamples: number;
  metrics: Record<MetricName, MetricStat>;
  byPage: Array<{ page: string; samples: number; lcpP75: number | null }>;
  byDevice: Record<string, { samples: number; lcpP75: number | null }>;
}

/**
 * Seuils Google Web Vitals (https://web.dev/vitals/).
 * `good` = ≤ ce nombre, `poor` = > ce nombre.
 */
const THRESHOLDS: Record<
  MetricName,
  { good: number; poor: number; unit: string }
> = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  INP: { good: 200, poor: 500, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "" },
  FCP: { good: 1800, poor: 3000, unit: "ms" },
  TTFB: { good: 800, poor: 1800, unit: "ms" },
};

const METRIC_LABELS: Record<MetricName, string> = {
  LCP: "Largest Contentful Paint",
  INP: "Interaction to Next Paint",
  CLS: "Cumulative Layout Shift",
  FCP: "First Contentful Paint",
  TTFB: "Time to First Byte",
};

function ratingFromP75(name: MetricName, p75: number): "good" | "needs" | "poor" {
  const t = THRESHOLDS[name];
  if (p75 <= t.good) return "good";
  if (p75 > t.poor) return "poor";
  return "needs";
}

function ratingColor(r: "good" | "needs" | "poor"): {
  bg: string;
  fg: string;
  label: string;
} {
  if (r === "good") return { bg: "rgba(5, 150, 105, 0.12)", fg: "#047857", label: "Bon" };
  if (r === "poor") return { bg: "rgba(220, 38, 38, 0.12)", fg: "#b91c1c", label: "Mauvais" };
  return { bg: "rgba(217, 119, 6, 0.12)", fg: "#b45309", label: "À améliorer" };
}

function formatValue(name: MetricName, value: number): string {
  if (name === "CLS") return value.toFixed(3);
  return `${Math.round(value)} ms`;
}

function apiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const tunnel =
      host.endsWith(".ngrok-free.dev") ||
      host.endsWith(".ngrok-free.app") ||
      host.endsWith(".ngrok.io") ||
      host.endsWith(".trycloudflare.com");
    if (tunnel) return `${window.location.protocol}//${host}/_api`;
    const envLocal =
      !!fromEnv && (fromEnv.includes("localhost") || fromEnv.includes("127.0.0.1"));
    const browserLocal = host === "localhost" || host === "127.0.0.1";
    if (fromEnv && !(envLocal && !browserLocal)) return fromEnv;
    return `${window.location.protocol}//${host}:4000`;
  }
  return fromEnv ?? "http://localhost:4000";
}

export default function AdminWebVitalsPage(): JSX.Element {
  const [period, setPeriod] = useState<Period>(7);
  const [device, setDevice] = useState<DeviceFilter>("all");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const token = getToken();
    fetch(`${apiBase()}/admin/web-vitals/summary?days=${period}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            `HTTP ${r.status} — vérifie que tu es bien super admin.`,
          );
        }
        return (await r.json()) as Summary;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Filtre device : applique côté front sur les samples disponibles
  const filteredDeviceLine = (() => {
    if (!data) return null;
    if (device === "all") return null;
    return data.byDevice[device] ?? { samples: 0, lcpP75: null };
  })();

  return (
    <ResponsiveShell>
      <div
        style={{
          padding: 24,
          maxWidth: 1200,
          margin: "0 auto",
          color: "var(--cocoa, #2b1d18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, margin: 0, fontWeight: 700 }}>
              Core Web Vitals
            </h1>
            <p style={{ margin: "4px 0 0", opacity: 0.7 }}>
              Mesures réelles des utilisateurs (p75 / p95 sur les SLA Google).
            </p>
          </div>
          <Link
            href="/admin"
            style={{
              fontSize: 14,
              color: "var(--cocoa, #2b1d18)",
              textDecoration: "underline",
              opacity: 0.7,
            }}
          >
            ← Retour console admin
          </Link>
        </div>

        {/* Filtres */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 20,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <FilterGroup
            label="Période"
            options={[
              { value: 1, label: "24h" },
              { value: 7, label: "7 jours" },
              { value: 30, label: "30 jours" },
            ]}
            value={period}
            onChange={(v) => setPeriod(v as Period)}
          />
          <FilterGroup
            label="Appareil"
            options={[
              { value: "all", label: "Tous" },
              { value: "mobile", label: "Mobile" },
              { value: "desktop", label: "Desktop" },
            ]}
            value={device}
            onChange={(v) => setDevice(v as DeviceFilter)}
          />
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>
            Chargement des métriques…
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "rgba(220, 38, 38, 0.1)",
              color: "#991b1b",
            }}
          >
            {error}
          </div>
        )}

        {data && !loading && !error && (
          <>
            <div
              style={{
                marginBottom: 16,
                fontSize: 14,
                opacity: 0.7,
              }}
            >
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                {data.totalSamples.toLocaleString("fr-FR")}
              </strong>{" "}
              échantillons sur la période ({data.period}).
              {filteredDeviceLine && (
                <>
                  {" — "}
                  <strong
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {filteredDeviceLine.samples.toLocaleString("fr-FR")}
                  </strong>{" "}
                  pour {device}.
                </>
              )}
            </div>

            {/* Grille des 5 métriques */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                marginBottom: 32,
              }}
            >
              {(Object.keys(METRIC_LABELS) as MetricName[]).map((name) => (
                <MetricCard
                  key={name}
                  name={name}
                  stat={data.metrics[name]}
                />
              ))}
            </div>

            {/* Top 10 pages */}
            <h2 style={{ fontSize: 20, marginTop: 24, marginBottom: 12 }}>
              Top pages par volume
            </h2>
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--ivory, #fdfaf4)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "rgba(0,0,0,0.03)",
                      textAlign: "left",
                    }}
                  >
                    <th style={cellStyle}>Page</th>
                    <th style={{ ...cellStyle, textAlign: "right" }}>
                      Samples
                    </th>
                    <th style={{ ...cellStyle, textAlign: "right" }}>
                      LCP p75
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPage.length === 0 && (
                    <tr>
                      <td
                        style={{ ...cellStyle, opacity: 0.6 }}
                        colSpan={3}
                      >
                        Pas encore de données sur cette période.
                      </td>
                    </tr>
                  )}
                  {data.byPage.map((row) => {
                    const lcp = row.lcpP75;
                    const rating = lcp != null ? ratingFromP75("LCP", lcp) : null;
                    const color = rating ? ratingColor(rating) : null;
                    return (
                      <tr
                        key={row.page}
                        style={{
                          borderTop: "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        <td
                          style={{
                            ...cellStyle,
                            fontFamily:
                              "var(--font-mono, ui-monospace, monospace)",
                          }}
                        >
                          {row.page}
                        </td>
                        <td
                          style={{
                            ...cellStyle,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {row.samples.toLocaleString("fr-FR")}
                        </td>
                        <td
                          style={{
                            ...cellStyle,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            color: color?.fg,
                            fontWeight: 600,
                          }}
                        >
                          {lcp != null ? `${lcp} ms` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Breakdown par device */}
            <h2 style={{ fontSize: 20, marginTop: 32, marginBottom: 12 }}>
              Par appareil
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 48,
              }}
            >
              {Object.entries(data.byDevice).map(([dev, stat]) => {
                const lcp = stat.lcpP75;
                const rating = lcp != null ? ratingFromP75("LCP", lcp) : null;
                const color = rating ? ratingColor(rating) : null;
                return (
                  <div
                    key={dev}
                    style={{
                      padding: 16,
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 12,
                      background: "var(--ivory, #fdfaf4)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        opacity: 0.7,
                        textTransform: "capitalize",
                      }}
                    >
                      {dev}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        marginTop: 6,
                        fontVariantNumeric: "tabular-nums",
                        color: color?.fg,
                      }}
                    >
                      {lcp != null ? `${lcp} ms` : "—"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      LCP p75 ·{" "}
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {stat.samples.toLocaleString("fr-FR")}
                      </span>{" "}
                      samples
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ResponsiveShell>
  );
}

// ============================================================================
// Sous-composants
// ============================================================================

const cellStyle: React.CSSProperties = { padding: "10px 14px" };

function FilterGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          display: "inline-flex",
          gap: 4,
          padding: 4,
          background: "rgba(0,0,0,0.04)",
          borderRadius: 999,
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                border: "none",
                background: active
                  ? "var(--saffron, #c79a3a)"
                  : "transparent",
                color: active ? "white" : "var(--cocoa, #2b1d18)",
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({
  name,
  stat,
}: {
  name: MetricName;
  stat: MetricStat;
}): JSX.Element {
  const rating = ratingFromP75(name, stat.p75);
  const color = ratingColor(rating);
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "var(--ivory, #fdfaf4)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Bandeau de couleur en fond léger */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: color.bg,
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
              background: color.fg,
              color: "white",
            }}
          >
            {color.label}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.65,
            marginBottom: 12,
          }}
        >
          {METRIC_LABELS[name]}
        </div>

        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: color.fg,
          }}
        >
          {stat.samples > 0 ? formatValue(name, stat.p75) : "—"}
        </div>
        <div
          style={{
            fontSize: 12,
            opacity: 0.7,
            marginBottom: 12,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          p75 · p95 :{" "}
          {stat.samples > 0 ? formatValue(name, stat.p95) : "—"}
        </div>

        {/* Distribution */}
        <div
          style={{
            display: "flex",
            height: 6,
            borderRadius: 999,
            overflow: "hidden",
            background: "rgba(0,0,0,0.06)",
          }}
        >
          {stat.samples > 0 && (
            <>
              <div
                style={{
                  width: `${stat.goodPct}%`,
                  background: "#10b981",
                }}
              />
              <div
                style={{
                  width: `${stat.needsImprovementPct}%`,
                  background: "#f59e0b",
                }}
              />
              <div
                style={{
                  width: `${stat.poorPct}%`,
                  background: "#ef4444",
                }}
              />
            </>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.65,
            marginTop: 6,
            display: "flex",
            justifyContent: "space-between",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>
            {stat.goodPct}% bon · {stat.needsImprovementPct}% moyen ·{" "}
            {stat.poorPct}% mauvais
          </span>
          <span>{stat.samples.toLocaleString("fr-FR")} samples</span>
        </div>
      </div>
    </div>
  );
}
