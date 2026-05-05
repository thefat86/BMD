"use client";

/**
 * Mini-charts SVG inline (sans dépendance externe).
 *
 * Pourquoi pas Chart.js / recharts ?
 *  - Bundle size : on évite ~50-100kb juste pour 2 graphiques simples
 *  - Cohérence visuelle : même palette terracotta/saffron que le reste de l'UI
 *  - Mobile-first : SVG s'adapte naturellement à la largeur
 *
 * Composants exposés :
 *  - <BarChart>     : barres verticales (ex: dépenses par mois, gains par membre)
 *  - <DonutChart>   : circulaire (ex: répartition par catégorie)
 *  - <Sparkline>    : ligne mini compacte (ex: évolution solde personnel)
 */
import { useId } from "react";

export interface BarDatum {
  label: string;
  value: number;
  /** Couleur optionnelle (défaut: saffron) */
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  /** Hauteur du graphique en pixels */
  height?: number;
  /** Format pour les valeurs affichées au-dessus des barres */
  valueFormat?: (n: number) => string;
  /** Suffixe pour l'aria-label (ex: "EUR") */
  unit?: string;
}

/**
 * Diagramme en barres responsive (largeur 100% du conteneur).
 * Les valeurs négatives sont dessinées en miroir vers le bas.
 */
export function BarChart({
  data,
  height = 200,
  valueFormat = (n) => n.toFixed(0),
  unit = "",
}: BarChartProps): JSX.Element {
  const id = useId();
  if (data.length === 0) {
    return (
      <p
        style={{
          textAlign: "center",
          color: "var(--cream-soft, #c9bfae)",
          fontSize: 12,
          padding: 20,
        }}
      >
        Aucune donnée à afficher
      </p>
    );
  }
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const barWidth = 100 / data.length;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Graphique en barres : ${data.length} valeurs ${unit}`}
      style={{ overflow: "visible" }}
    >
      {/* Ligne de base */}
      <line
        x1={0}
        y1={height - 30}
        x2={100}
        y2={height - 30}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={0.2}
      />

      {data.map((d, i) => {
        const x = i * barWidth + barWidth * 0.1;
        const w = barWidth * 0.8;
        const barH = (Math.abs(d.value) / max) * (height - 60);
        const y = height - 30 - (d.value >= 0 ? barH : 0);
        const color = d.color ?? "var(--saffron, #E8A33D)";
        return (
          <g key={`${id}-${i}`}>
            {/* Valeur au-dessus */}
            <text
              x={x + w / 2}
              y={y - 4}
              fontSize={6}
              textAnchor="middle"
              fill="var(--cream, #f0e6d8)"
              style={{ fontFamily: "system-ui" }}
            >
              {valueFormat(d.value)}
            </text>
            {/* Barre */}
            <rect
              x={x}
              y={y}
              width={w}
              height={barH}
              fill={color}
              rx={1}
              opacity={0.85}
            >
              <title>
                {d.label} : {valueFormat(d.value)} {unit}
              </title>
            </rect>
            {/* Label en bas */}
            <text
              x={x + w / 2}
              y={height - 18}
              fontSize={5}
              textAnchor="middle"
              fill="var(--cream-soft, #c9bfae)"
              style={{ fontFamily: "system-ui" }}
            >
              {d.label.length > 10 ? d.label.slice(0, 10) + "…" : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface DonutDatum {
  label: string;
  value: number;
  color?: string;
}

/**
 * Donut chart simple (pour répartition par catégorie).
 * Utilise des arcs SVG calculés en cercle unitaire.
 */
export function DonutChart({
  data,
  size = 180,
  unit = "",
}: {
  data: DonutDatum[];
  size?: number;
  unit?: string;
}): JSX.Element {
  const id = useId();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <p
        style={{
          textAlign: "center",
          color: "var(--cream-soft, #c9bfae)",
          fontSize: 12,
          padding: 20,
        }}
      >
        Aucune donnée
      </p>
    );
  }
  const r = 40;
  const cx = 50;
  const cy = 50;
  const palette = [
    "#E8A33D",
    "#B5462E",
    "#8B5A1F",
    "#C9A14A",
    "#D9714A",
    "#5B7C99",
    "#7BA05B",
  ];
  let cumulative = 0;
  const segments = data.map((d, i) => {
    const start = cumulative;
    const angle = (d.value / total) * Math.PI * 2;
    cumulative += angle;
    const x1 = cx + r * Math.cos(start - Math.PI / 2);
    const y1 = cy + r * Math.sin(start - Math.PI / 2);
    const x2 = cx + r * Math.cos(cumulative - Math.PI / 2);
    const y2 = cy + r * Math.sin(cumulative - Math.PI / 2);
    const largeArc = angle > Math.PI ? 1 : 0;
    return {
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: d.color ?? palette[i % palette.length],
      label: d.label,
      value: d.value,
      pct: ((d.value / total) * 100).toFixed(0),
    };
  });
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Répartition ${unit}`}
      >
        {segments.map((s, i) => (
          <path key={`${id}-${i}`} d={s.d} fill={s.color}>
            <title>
              {s.label} : {s.value} {unit} ({s.pct}%)
            </title>
          </path>
        ))}
        {/* Trou central pour effet donut */}
        <circle cx={cx} cy={cy} r={20} fill="var(--bg, #0E0B14)" />
      </svg>
      <div style={{ flex: 1, minWidth: 120 }}>
        {segments.map((s, i) => (
          <div
            key={`${id}-leg-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              marginBottom: 4,
              color: "var(--cream-soft, #c9bfae)",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                background: s.color,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>{s.label}</span>
            <strong style={{ color: "var(--cream, #f0e6d8)" }}>
              {s.value}
              {unit ? ` ${unit}` : ""}
            </strong>
            <small>({s.pct}%)</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Sparkline : ligne brisée minimaliste (ex: évolution sur N jours).
 */
export function Sparkline({
  data,
  height = 40,
  color = "var(--saffron, #E8A33D)",
}: {
  data: number[];
  height?: number;
  color?: string;
}): JSX.Element {
  if (data.length < 2) {
    return <div style={{ height, color: "var(--cream-soft)", fontSize: 11 }}>—</div>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const path = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      role="img"
    >
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
