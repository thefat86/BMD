"use client";

/**
 * <AdminCharts /> · Graphiques temps réel pour le dashboard admin.
 *
 * Affiche 4 séries temporelles sur les N derniers jours :
 *   1. Signups (nouveaux utilisateurs)
 *   2. Dépenses créées
 *   3. Volume cumulé (somme des montants, devises mixtes)
 *   4. Groupes créés
 *
 * Sources de données :
 *  - Initial : GET /admin/timeseries?days=14 (données historiques)
 *  - Live    : SSE /events/admin (incrémentation à la volée)
 *
 * Stratégie temps réel :
 *  - Au chargement, on fetch les buckets historiques.
 *  - Pour chaque event SSE reçu, on incrémente le bucket "aujourd'hui"
 *    en local — ça donne l'impression d'un dashboard vivant sans
 *    re-fetcher toute la série à chaque event.
 *  - Toutes les 60s on re-fetch silencieusement pour resync (au cas où
 *    on aurait raté des events pendant une coupure de connexion).
 *
 * Rendu : SVG inline (pas de dépendance Chart.js — on dessine nous-même).
 *  - Mini barres pour signups / expenses / groups
 *  - Mini ligne pour le volume
 *  - Tooltip natif via <title> SVG
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../api-client";

interface TsPoint {
  date: string;
  signups: number;
  expenses: number;
  volume: number;
  groups: number;
}

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? `http://${window.location.hostname}:4000`)
    : "http://localhost:4000";

/** Périodes prédéfinies — spec §3.11 demande 6/12/24 mois. */
const PERIOD_OPTIONS = [
  { days: 14, label: "14 j" },
  { days: 30, label: "1 mois" },
  { days: 90, label: "3 mois" },
  { days: 180, label: "6 mois" },
  { days: 365, label: "12 mois" },
  { days: 730, label: "24 mois" },
];

export function AdminCharts({ days: initialDays = 14 }: { days?: number }) {
  const [days, setDays] = useState(initialDays);
  const [points, setPoints] = useState<TsPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const lastSyncRef = useRef(0);

  // ---- Fetch initial + resync périodique -------------------------------
  useEffect(() => {
    let cancelled = false;
    async function fetchSeries() {
      try {
        const r = await api.adminTimeseries(days);
        if (!cancelled) {
          setPoints(r.points);
          lastSyncRef.current = Date.now();
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void fetchSeries();
    const resync = setInterval(() => void fetchSeries(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(resync);
    };
  }, [days]);

  // ---- SSE : incrémentation à la volée ---------------------------------
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(
      `${API_BASE}/events/admin?token=${encodeURIComponent(token)}`,
    );
    esRef.current = es;

    function bumpToday(field: keyof TsPoint, increment: number) {
      const today = new Date().toISOString().slice(0, 10);
      setPoints((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((p) => p.date === today);
        if (idx < 0) return prev; // fenêtre courante n'inclut pas today
        const copy = [...prev];
        const old = copy[idx];
        copy[idx] = {
          ...old,
          [field]: ((old[field] as number) ?? 0) + increment,
        } as TsPoint;
        return copy;
      });
    }

    es.addEventListener("expense.created", () => {
      bumpToday("expenses", 1);
      setLiveCount((c) => c + 1);
    });
    es.addEventListener("member.joined", () => {
      // Pas un signup — c'est un user qui rejoint un groupe.
      // Mais on bouge tout de même le compteur "live" pour donner du feedback.
      setLiveCount((c) => c + 1);
    });
    // Note : signups et group-creates ne passent pas (encore) par eventBus,
    // donc on les capte via le resync 60s. À ajouter si on les publie un jour.
    es.addEventListener("notification.new", () => setLiveCount((c) => c + 1));

    es.onerror = () => {
      // Le navigateur reconnecte tout seul — on log juste pour debug
      console.debug("[admin-sse] reconnect…");
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <div className="card error" role="alert">
        Impossible de charger les graphiques : {error}
      </div>
    );
  }
  if (!points) {
    return (
      <div className="card" style={{ color: "var(--cream-soft)" }}>
        Chargement des graphiques…
      </div>
    );
  }

  const currentLabel =
    PERIOD_OPTIONS.find((p) => p.days === days)?.label ?? `${days} j`;

  return (
    <div className="card" data-testid="admin-charts">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2>📈 Activité · {currentLabel}</h2>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setDays(opt.days)}
              className="btn-ghost btn-sm"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                background:
                  days === opt.days
                    ? "rgba(232,163,61,0.18)"
                    : "rgba(244,228,193,0.04)",
                borderColor:
                  days === opt.days
                    ? "var(--saffron)"
                    : "rgba(244,228,193,0.08)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <LivePulse count={liveCount} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <ChartCard
          label="Signups"
          color="var(--saffron, #e8a33d)"
          points={points}
          field="signups"
          mode="bars"
        />
        <ChartCard
          label="Dépenses"
          color="var(--emerald-soft, #66cdaa)"
          points={points}
          field="expenses"
          mode="bars"
        />
        <ChartCard
          label="Volume cumulé"
          color="var(--gold, #fcd34d)"
          points={points}
          field="volume"
          mode="line"
          format={(v) => fmtMoney(v)}
        />
        <ChartCard
          label="Nouveaux groupes"
          color="var(--terracotta, #b54732)"
          points={points}
          field="groups"
          mode="bars"
        />
      </div>
    </div>
  );
}

// =====================================================================
// SOUS-COMPOSANTS
// =====================================================================

function LivePulse({ count }: { count: number }) {
  const [bumped, setBumped] = useState(false);
  useEffect(() => {
    if (count === 0) return;
    setBumped(true);
    const t = setTimeout(() => setBumped(false), 600);
    return () => clearTimeout(t);
  }, [count]);
  return (
    <span
      title="Events reçus en direct depuis le bus SSE"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "var(--cream-soft)",
        padding: "3px 8px",
        borderRadius: 999,
        background: bumped
          ? "rgba(102,205,170,0.18)"
          : "rgba(244,228,193,0.06)",
        transition: "background 0.4s",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--emerald-soft, #66cdaa)",
          boxShadow: bumped ? "0 0 6px var(--emerald-soft)" : "none",
          transition: "box-shadow 0.4s",
        }}
      />
      LIVE · {count}
    </span>
  );
}

interface ChartCardProps {
  label: string;
  color: string;
  points: TsPoint[];
  field: keyof TsPoint;
  mode: "bars" | "line";
  format?: (v: number) => string;
}

function ChartCard({ label, color, points, field, mode, format }: ChartCardProps) {
  const values = useMemo(
    () => points.map((p) => Number(p[field]) || 0),
    [points, field],
  );
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const last = values[values.length - 1] ?? 0;
  const W = 240;
  const H = 60;
  const pad = 4;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  return (
    <div
      style={{
        background: "rgba(244,228,193,0.04)",
        border: "1px solid rgba(244,228,193,0.08)",
        borderRadius: 14,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            fontWeight: 700,
            color: "var(--cream-soft)",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}>
          Σ {format ? format(total) : total}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 800,
            fontFamily: "Cormorant Garamond, serif",
            color,
          }}
        >
          {format ? format(last) : last}
        </span>
        <span style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}>
          aujourd'hui
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block" }}
        aria-label={`Graphique ${label}`}
      >
        {mode === "bars"
          ? values.map((v, i) => {
              const bw = innerW / values.length - 2;
              const bx = pad + i * (innerW / values.length) + 1;
              const bh = (v / max) * innerH;
              const by = pad + (innerH - bh);
              const isToday = i === values.length - 1;
              return (
                <rect
                  key={i}
                  x={bx}
                  y={by}
                  width={bw}
                  height={bh}
                  fill={color}
                  opacity={isToday ? 1 : 0.55}
                  rx={2}
                >
                  <title>
                    {points[i].date} : {format ? format(v) : v}
                  </title>
                </rect>
              );
            })
          : (() => {
              const path = values
                .map((v, i) => {
                  const x = pad + (i / Math.max(1, values.length - 1)) * innerW;
                  const y = pad + innerH - (v / max) * innerH;
                  return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(" ");
              const fill = `${path} L ${pad + innerW} ${pad + innerH} L ${pad} ${pad + innerH} Z`;
              return (
                <>
                  <path d={fill} fill={color} opacity={0.18} />
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {values.map((v, i) => {
                    const x =
                      pad + (i / Math.max(1, values.length - 1)) * innerW;
                    const y = pad + innerH - (v / max) * innerH;
                    const isToday = i === values.length - 1;
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={isToday ? 2.5 : 1.5}
                        fill={color}
                        opacity={isToday ? 1 : 0.6}
                      >
                        <title>
                          {points[i].date} : {format ? format(v) : v}
                        </title>
                      </circle>
                    );
                  })}
                </>
              );
            })()}
      </svg>
    </div>
  );
}

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}
