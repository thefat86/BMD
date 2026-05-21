"use client";

/**
 * <AdminCohorts /> · Grille de rétention par cohorte.
 *
 * Affichage classique en heat map :
 *   ┌───────────┬─────┬─────┬─────┬─────┬─────┐
 *   │ Cohort    │ W0  │ W1  │ W2  │ W3  │ … │
 *   ├───────────┼─────┼─────┼─────┼─────┼─────┤
 *   │ 02/01     │100% │ 45% │ 28% │ 22% │   │
 *   │ 09/01     │100% │ 52% │ 31% │     │   │
 *   │ 16/01     │100% │ 48% │     │     │   │
 *   └───────────┴─────┴─────┴─────┴─────┴─────┘
 *
 * Couleur cellule : gradient saffron→emerald selon % retention.
 * Tooltip natif via title="" pour le détail (semaine, taille cohorte).
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";

export function AdminCohorts({ weeks = 8 }: { weeks?: number }) {
  const [rows, setRows] = useState<Array<{
    cohortWeek: string;
    size: number;
    retention: number[];
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.adminCohorts(weeks);
        if (!cancelled) setRows(r.rows);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weeks]);

  if (error) {
    return (
      <div className="card error" role="alert">
        Cohorts indisponibles : {error}
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="card" style={{ color: "var(--cream-soft)" }}>
        Chargement des cohortes…
      </div>
    );
  }

  const maxCols = rows.length > 0 ? rows[0].retention.length : weeks;

  return (
    <div className="card" data-testid="admin-cohorts">
      <div className="card-head">
        <h2>🧬 Rétention par cohorte · {weeks} sem.</h2>
        <span style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}>
          % d'utilisateurs revenus chaque semaine après inscription
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 4,
            fontSize: 11,
            minWidth: "100%",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  color: "var(--cream-soft)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Semaine
              </th>
              <th
                style={{
                  padding: "6px 8px",
                  color: "var(--cream-soft)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                N
              </th>
              {Array.from({ length: maxCols }).map((_, i) => (
                <th
                  key={i}
                  style={{
                    padding: "6px 4px",
                    color: "var(--cream-soft)",
                    fontWeight: 600,
                    minWidth: 36,
                  }}
                >
                  W{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cohortWeek}>
                <td
                  style={{
                    padding: "6px 8px",
                    color: "var(--cream)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtCohortDate(row.cohortWeek)}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    color: "var(--cream-soft)",
                    textAlign: "right",
                  }}
                >
                  {row.size}
                </td>
                {Array.from({ length: maxCols }).map((_, i) => {
                  const v = row.retention[i];
                  if (v === undefined || row.size === 0) {
                    return (
                      <td
                        key={i}
                        style={{
                          padding: "4px 4px",
                          textAlign: "center",
                          color: "var(--cream-muted, #555)",
                          background: "rgba(244,228,193,0.02)",
                          borderRadius: 4,
                          minWidth: 36,
                          fontSize: 10,
                        }}
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={i}
                      title={`${row.cohortWeek} · W${i} · ${v}% (${Math.round((v * row.size) / 100)} / ${row.size})`}
                      style={{
                        padding: "6px 4px",
                        textAlign: "center",
                        background: heatColor(v),
                        color: v > 50 ? "#16111E" : "var(--cream)",
                        borderRadius: 4,
                        fontWeight: 600,
                        minWidth: 36,
                        fontSize: 11,
                      }}
                    >
                      {v}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.every((r) => r.size === 0) && (
        <p
          className="muted text-center"
          style={{ fontSize: 12, marginTop: 12 }}
        >
          Pas assez de données — reviens après quelques semaines d'utilisation.
        </p>
      )}
    </div>
  );
}

/**
 * Heat map color : gradient saffron→emerald-soft selon % retention.
 *   0%   → terracotta / rouge atténué
 *   50%  → saffron / jaune-orange
 *   100% → emerald-soft / vert
 */
function heatColor(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  if (p === 0) return "rgba(244,228,193,0.03)";
  // Lerp entre 3 stops : terracotta → saffron → emerald
  if (p < 50) {
    const t = p / 50;
    const r = Math.round(181 + (232 - 181) * t);
    const g = Math.round(70 + (163 - 70) * t);
    const b = Math.round(46 + (61 - 46) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (p - 50) / 50;
    const r = Math.round(232 + (102 - 232) * t);
    const g = Math.round(163 + (205 - 163) * t);
    const b = Math.round(61 + (170 - 61) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function fmtCohortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}
