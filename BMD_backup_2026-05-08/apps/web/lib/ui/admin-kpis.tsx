"use client";

/**
 * <AdminKpis /> · KPIs financiers MRR / ARPU / Churn / ARR.
 *
 * 4 grosses cartes hero + 1 mini-table de répartition MRR par plan.
 * Refresh manuel via le bouton (pas de SSE — ça bouge moins vite que
 * les events). Re-fetch toutes les 5 min en arrière-plan.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";

type Kpis = Awaited<ReturnType<typeof api.adminKpis>>;

export function AdminKpis() {
  const [data, setData] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchKpis() {
      try {
        const r = await api.adminKpis();
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void fetchKpis();
    const t = setInterval(() => void fetchKpis(), 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (error) {
    return (
      <div className="card error" role="alert">
        KPIs indisponibles : {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="card" style={{ color: "var(--cream-soft)" }}>
        Calcul des KPIs financiers…
      </div>
    );
  }

  const churnSeverity =
    data.churnRate30d > 10
      ? "danger"
      : data.churnRate30d > 5
        ? "warn"
        : "good";
  // Spec §9.3 : "couleurs jamais seules pour porter de l'information".
  // On ajoute un icône + signe en plus de la couleur (daltonisme-safe).
  const churnIcon =
    churnSeverity === "danger"
      ? "▲"
      : churnSeverity === "warn"
        ? "■"
        : "▼";
  const churnSign =
    churnSeverity === "danger" ? "+" : churnSeverity === "warn" ? "·" : "−";

  return (
    <div className="card" data-testid="admin-kpis">
      <div className="card-head">
        <h2>💎 KPIs financiers</h2>
        <span style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}>
          Calculé à partir des plans actifs · refresh 5 min
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <KpiCard
          label="MRR"
          hint="Monthly Recurring Revenue"
          value={fmtMoney(data.mrrCents)}
          accent="var(--saffron, #e8a33d)"
        />
        <KpiCard
          label="ARR"
          hint="Annual Run Rate (MRR × 12)"
          value={fmtMoney(data.arrCents)}
          accent="var(--gold, #fcd34d)"
        />
        <KpiCard
          label="ARPU"
          hint={`${data.payingUsers} utilisateur${data.payingUsers > 1 ? "s" : ""} payant${data.payingUsers > 1 ? "s" : ""}`}
          value={fmtMoney(data.arpuCents)}
          accent="var(--emerald-soft, #66cdaa)"
        />
        <KpiCard
          label="Churn 30j"
          hint={
            churnSeverity === "danger"
              ? "⚠ Élevé — investiguer"
              : churnSeverity === "warn"
                ? "À surveiller"
                : "Sain"
          }
          // Préfixe iconique + signe pour daltonisme (spec §9.3) — la couleur
          // n'est jamais l'unique signal sémantique.
          value={`${churnIcon} ${churnSign}${data.churnRate30d}%`}
          accent={
            churnSeverity === "danger"
              ? "var(--rose, #ec5e5e)"
              : churnSeverity === "warn"
                ? "var(--saffron, #e8a33d)"
                : "var(--emerald-soft, #66cdaa)"
          }
        />
      </div>

      {/* Mini-bandeau conversion paying */}
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 12,
          fontSize: 12,
          color: "var(--cream-soft)",
          marginBottom: 14,
        }}
      >
        🔁 <strong style={{ color: "var(--cream)" }}>Conversion paying</strong> :{" "}
        {data.paidConversion}% ·{" "}
        <span style={{ color: "var(--cream-muted, #aaa)" }}>
          {data.payingUsers} / {data.totalUsers} utilisateurs
        </span>
      </div>

      {/* Répartition MRR par plan (compact) */}
      {Object.keys(data.mrrByPlan).length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              color: "var(--cream-soft)",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Répartition MRR par plan
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {Object.entries(data.mrrByPlan)
              .sort(([, a], [, b]) => b - a)
              .map(([code, cents]) => {
                const pct = data.mrrCents > 0
                  ? Math.round((cents / data.mrrCents) * 100)
                  : 0;
                return (
                  <li
                    key={code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 80,
                        color: "var(--cream)",
                        fontWeight: 600,
                      }}
                    >
                      {code}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        background: "rgba(244,228,193,0.06)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background:
                            "linear-gradient(90deg, var(--saffron), var(--terracotta))",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        minWidth: 70,
                        textAlign: "right",
                        color: "var(--cream-soft)",
                      }}
                    >
                      {fmtMoney(cents)}
                    </span>
                    <span
                      style={{
                        minWidth: 38,
                        textAlign: "right",
                        color: "var(--cream-muted, #aaa)",
                        fontSize: 11,
                      }}
                    >
                      {pct}%
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  hint,
  value,
  accent,
}: {
  label: string;
  hint: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "rgba(244,228,193,0.04)",
        border: "1px solid rgba(244,228,193,0.08)",
        borderRadius: 14,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          color: "var(--cream-soft)",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 26,
          fontWeight: 800,
          color: accent,
          lineHeight: 1.1,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--cream-muted, #aaa)",
          lineHeight: 1.4,
        }}
      >
        {hint}
      </div>
    </div>
  );
}

function fmtMoney(cents: number): string {
  if (cents >= 1_000_000_00) {
    return `${(cents / 1_000_000_00).toFixed(1)}M €`;
  }
  if (cents >= 10_000_00) {
    return `${(cents / 100_000).toFixed(0)}k €`;
  }
  if (cents >= 1_000_00) {
    return `${(cents / 100_000).toFixed(1)}k €`;
  }
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}
