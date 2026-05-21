"use client";

/**
 * V153.C — Graph d'amortissement RDD (SVG pur).
 *
 * Affiche l'évolution capital cumulé, intérêts cumulés et remboursé
 * cumulé au fil des échéances. SVG inline pour rester ultra-léger
 * (zéro dépendance Recharts), responsive et brand-aligned V45-light.
 */

import { useState } from "react";

interface Schedule {
  sequenceNumber: number;
  dueDate: string;
  expectedAmount: string;
  capitalAmount: string;
  interestAmount: string;
  status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
  paidAmount: string | null;
  paidAt: string | null;
}

interface Props {
  schedules: Schedule[];
  currency: string;
}

const CHART_W = 600;
const CHART_H = 280;
const PADDING = { top: 20, right: 16, bottom: 32, left: 48 };
const PLOT_W = CHART_W - PADDING.left - PADDING.right;
const PLOT_H = CHART_H - PADDING.top - PADDING.bottom;

export default function DebtAmortizationChart({
  schedules,
  currency,
}: Props): JSX.Element {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (schedules.length === 0) {
    return (
      <div
        style={{
          height: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6B5A47",
          fontSize: 13,
        }}
      >
        Aucune échéance à afficher.
      </div>
    );
  }

  // Construction de la série cumulée
  let cumulCapital = 0;
  let cumulInterest = 0;
  let cumulPaid = 0;
  const series = schedules.map((s) => {
    cumulCapital += parseFloat(s.capitalAmount);
    cumulInterest += parseFloat(s.interestAmount);
    if (s.status === "PAID" || s.status === "CONFIRMED") {
      cumulPaid += parseFloat(s.paidAmount ?? s.expectedAmount);
    }
    return {
      idx: s.sequenceNumber,
      dueDate: s.dueDate,
      capital: Math.round(cumulCapital * 100) / 100,
      interest: Math.round(cumulInterest * 100) / 100,
      paid: Math.round(cumulPaid * 100) / 100,
      isPaid: s.status === "PAID" || s.status === "CONFIRMED",
    };
  });

  // Échelle Y
  const maxY = Math.max(
    ...series.map((p) => p.capital + p.interest),
    1,
  );
  const yAxisTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => maxY * r);

  // Échelle X
  const n = series.length;
  const xScale = (i: number) =>
    PADDING.left + (n === 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const yScale = (v: number) =>
    PADDING.top + PLOT_H - (v / maxY) * PLOT_H;

  const fmt = (v: number) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v);
  const fmtFull = (v: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(v);

  // Aires (capital + intérêts + remboursé)
  const buildPath = (key: "capital" | "interest" | "paid") => {
    const points = series.map(
      (p, i) => `${xScale(i)},${yScale(p[key])}`,
    );
    const area = `M ${PADDING.left},${yScale(0)} L ${points.join(
      " L ",
    )} L ${xScale(n - 1)},${yScale(0)} Z`;
    const line = `M ${points.join(" L ")}`;
    return { area, line };
  };

  const capitalPaths = buildPath("capital");
  const interestPaths = buildPath("interest");
  const paidPaths = buildPath("paid");

  // Index "aujourd'hui" = dernière échéance payée
  const lastPaid = [...series].reverse().find((p) => p.isPaid);

  return (
    <div style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        height="280"
        style={{ display: "block" }}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Graphique d'amortissement"
      >
        <defs>
          <linearGradient id="capitalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F7A57" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#1F7A57" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="interestGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#854F0B" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#854F0B" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="paidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F6E56" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#0F6E56" stopOpacity={0.08} />
          </linearGradient>
        </defs>

        {/* Grille horizontale + ticks Y */}
        {yAxisTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={CHART_W - PADDING.right}
              y1={yScale(v)}
              y2={yScale(v)}
              stroke="rgba(43,31,21,0.08)"
              strokeDasharray="3,3"
            />
            <text
              x={PADDING.left - 6}
              y={yScale(v) + 3}
              textAnchor="end"
              fontSize="10"
              fill="#6B5A47"
            >
              {fmt(v)}
            </text>
          </g>
        ))}

        {/* Ligne "aujourd'hui" */}
        {lastPaid && (
          <g>
            <line
              x1={xScale(series.findIndex((p) => p.idx === lastPaid.idx))}
              x2={xScale(series.findIndex((p) => p.idx === lastPaid.idx))}
              y1={PADDING.top}
              y2={CHART_H - PADDING.bottom}
              stroke="#0F6E56"
              strokeDasharray="4,2"
            />
            <text
              x={xScale(series.findIndex((p) => p.idx === lastPaid.idx))}
              y={PADDING.top - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#0F6E56"
              fontWeight={600}
            >
              Aujourd'hui
            </text>
          </g>
        )}

        {/* Aires */}
        <path d={capitalPaths.area} fill="url(#capitalGrad)" />
        <path d={interestPaths.area} fill="url(#interestGrad)" />
        <path d={paidPaths.area} fill="url(#paidGrad)" />

        {/* Lignes */}
        <path
          d={capitalPaths.line}
          fill="none"
          stroke="#1F7A57"
          strokeWidth="2"
        />
        <path
          d={interestPaths.line}
          fill="none"
          stroke="#854F0B"
          strokeWidth="2"
        />
        <path
          d={paidPaths.line}
          fill="none"
          stroke="#0F6E56"
          strokeWidth="2.5"
        />

        {/* Points + axes X */}
        {series.map((p, i) => (
          <g
            key={p.idx}
            onMouseEnter={() => setHoverIdx(i)}
            style={{ cursor: "pointer" }}
          >
            {/* Zone interactive invisible */}
            <rect
              x={xScale(i) - 16}
              y={PADDING.top}
              width={32}
              height={PLOT_H}
              fill="transparent"
            />
            {/* Marqueurs visibles uniquement sur 1, mid, dernier */}
            {(i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
              <text
                x={xScale(i)}
                y={CHART_H - PADDING.bottom + 16}
                textAnchor="middle"
                fontSize="9"
                fill="#6B5A47"
              >
                {new Date(p.dueDate).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </text>
            )}
            {hoverIdx === i && (
              <>
                <circle
                  cx={xScale(i)}
                  cy={yScale(p.capital + p.interest)}
                  r={4}
                  fill="#854F0B"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
                <circle
                  cx={xScale(i)}
                  cy={yScale(p.paid)}
                  r={4}
                  fill="#0F6E56"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              </>
            )}
          </g>
        ))}

        {/* Tooltip */}
        {hoverIdx !== null && (
          <g>
            {(() => {
              const p = series[hoverIdx];
              const x = xScale(hoverIdx);
              const tipW = 160;
              const tipH = 80;
              const tipX = Math.min(
                CHART_W - PADDING.right - tipW,
                Math.max(PADDING.left, x - tipW / 2),
              );
              const tipY = PADDING.top + 6;
              return (
                <g>
                  <rect
                    x={tipX}
                    y={tipY}
                    width={tipW}
                    height={tipH}
                    rx={8}
                    fill="#FFFFFF"
                    stroke="rgba(43,31,21,0.14)"
                  />
                  <text
                    x={tipX + 10}
                    y={tipY + 18}
                    fontSize="10"
                    fontWeight={700}
                    fill="#2B1F15"
                  >
                    Échéance #{p.idx}
                  </text>
                  <text
                    x={tipX + 10}
                    y={tipY + 34}
                    fontSize="10"
                    fill="#1F7A57"
                  >
                    Capital : {fmtFull(p.capital)}
                  </text>
                  <text
                    x={tipX + 10}
                    y={tipY + 48}
                    fontSize="10"
                    fill="#854F0B"
                  >
                    Intérêts : {fmtFull(p.interest)}
                  </text>
                  <text
                    x={tipX + 10}
                    y={tipY + 62}
                    fontSize="10"
                    fill="#0F6E56"
                  >
                    Remboursé : {fmtFull(p.paid)}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>

      {/* Légende */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginTop: 4,
          fontSize: 11,
          color: "#6B5A47",
        }}
      >
        <LegendItem color="#1F7A57" label="Capital cumulé" />
        <LegendItem color="#854F0B" label="Intérêts cumulés" />
        <LegendItem color="#0F6E56" label="Remboursé" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}
