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
 * Diagramme en barres horizontales — lisible partout, mobile et desktop.
 *
 * Plutôt que des barres verticales qui s'écrasent quand il y a beaucoup
 * de données ou peu de largeur, on utilise des barres horizontales :
 * chaque valeur a sa ligne avec label à gauche, barre proportionnelle
 * au milieu, valeur à droite. Ça scale parfaitement de 320px à 1200px.
 */
export function BarChart({
  data,
  height,
  valueFormat = (n) => n.toFixed(0),
  unit = "",
}: BarChartProps): JSX.Element {
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
  return (
    <div
      role="img"
      aria-label={`Données : ${data.length} valeurs ${unit}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        // height utilisé en hauteur min pour préserver l'API existante
        ...(height && { minHeight: height }),
      }}
    >
      {data.map((d, i) => {
        const pct = (Math.abs(d.value) / max) * 100;
        const color = d.color ?? "var(--saffron, #E8A33D)";
        const isNegative = d.value < 0;
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(60px, 100px) 1fr auto",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <span
              style={{
                color: "var(--cream-soft, #E8D5B7)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={d.label}
            >
              {d.label}
            </span>
            <div
              style={{
                height: 14,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 7,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(2, pct)}%`,
                  background: isNegative
                    ? "linear-gradient(90deg, #B5462E, #D9714A)"
                    : `linear-gradient(90deg, ${color}, var(--terracotta, #B5462E))`,
                  borderRadius: 7,
                  transition: "width 0.4s ease-out",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 700,
                color: "var(--cream, #F4E4C1)",
                fontSize: 14,
                whiteSpace: "nowrap",
                minWidth: 50,
                textAlign: "right",
              }}
            >
              {valueFormat(d.value)}
              {unit && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--saffron, #E8A33D)",
                    marginLeft: 2,
                  }}
                >
                  {unit}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
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
