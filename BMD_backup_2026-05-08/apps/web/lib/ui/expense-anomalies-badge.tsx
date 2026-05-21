"use client";

/**
 * <ExpenseAnomaliesBadge /> · Banner d'avertissement sur une dépense
 * (spec §3.8).
 *
 * Le service `detectAnomalies` côté API retourne une liste de signalements
 * pour une dépense :
 *  - Montant inhabituel (> 3× la moyenne du groupe)
 *  - Doublon potentiel (description/montant proches d'une dépense récente)
 *  - Retard récurrent (le payeur a souvent oublié des cotisations)
 *
 * Ce composant se monte au mount de la dépense et fetch les anomalies.
 * S'il y en a, affiche un banner cliquable avec le détail. Sinon, render null.
 *
 * UX : non bloquant — c'est un signal informatif, l'utilisateur reste libre.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";

interface Anomaly {
  kind: string;
  severity: "info" | "warning" | "alert";
  message: string;
}

const SEVERITY_STYLE: Record<
  Anomaly["severity"],
  { bg: string; border: string; color: string; icon: string }
> = {
  info: {
    bg: "rgba(91,156,239,0.10)",
    border: "rgba(91,156,239,0.30)",
    color: "#5b9eef",
    icon: "ℹ",
  },
  warning: {
    bg: "rgba(232,163,61,0.10)",
    border: "rgba(232,163,61,0.30)",
    color: "var(--saffron, #e8a33d)",
    icon: "⚠",
  },
  alert: {
    bg: "rgba(217,113,74,0.10)",
    border: "rgba(217,113,74,0.30)",
    color: "var(--rose, #d9714a)",
    icon: "🚨",
  },
};

export function ExpenseAnomaliesBadge({
  expenseId,
}: {
  expenseId: string;
}) {
  const t = useT();
  const [anomalies, setAnomalies] = useState<Anomaly[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.expenseAnomalies(expenseId);
        if (!cancelled) setAnomalies(r.anomalies);
      } catch {
        // Silencieux : si le check échoue, pas de banner — non bloquant
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (!anomalies || anomalies.length === 0) return null;

  // Sévérité max parmi les anomalies → couleur du badge réduit
  const order: Anomaly["severity"][] = ["alert", "warning", "info"];
  const maxSev =
    order.find((s) => anomalies.some((a) => a.severity === s)) ?? "info";
  const style = SEVERITY_STYLE[maxSev];

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`${anomalies.length} signalement${anomalies.length > 1 ? "s" : ""} sur cette dépense`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          background: style.bg,
          border: `1px solid ${style.border}`,
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          color: style.color,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden>{style.icon}</span>
        {anomalies.length} signalement{anomalies.length > 1 ? "s" : ""}
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label={t("expense.anomaliesDetected")}
      style={{
        marginTop: 6,
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: style.color,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        <span aria-hidden>{style.icon}</span>
        <span style={{ flex: 1 }}>
          {anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""} détectée
          {anomalies.length > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Fermer"
          style={{
            background: "transparent",
            border: "none",
            color: style.color,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
      <ul
        style={{
          margin: 0,
          padding: "0 0 0 18px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          color: "var(--cream, #f4e4c1)",
        }}
      >
        {anomalies.map((a, i) => (
          <li key={i}>
            <span
              style={{
                fontSize: 10,
                color: SEVERITY_STYLE[a.severity].color,
                fontWeight: 700,
                marginRight: 6,
              }}
            >
              {SEVERITY_STYLE[a.severity].icon}
            </span>
            {a.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
