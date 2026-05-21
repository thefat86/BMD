"use client";

/**
 * <SimSwapAlerts> · Affiche les alertes de connexion suspecte (spec §7.5).
 *
 * Conçu pour rassurer plus que pour effrayer. Les events DETECTED/HIGH
 * apparaissent ici jusqu'à ce que l'utilisateur les verifie en 1 clic
 * (« C'était bien moi ») ou jusqu'à 30 jours.
 *
 * Multi-culturel : aucune référence géographique précise, message simple,
 * mots universels. Lecteurs d'écran supportés (aria-live, aria-label).
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { ApiErrorAlert } from "./api-error-alert";
import { useT } from "../i18n/app-strings";

interface Event {
  id: string;
  riskScore: number;
  signals: any;
  contactValueAttempted: string | null;
  contactTypeAttempted: string | null;
  country: string;
  userAgent: string | null;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

export function SimSwapAlerts() {
  const t = useT();
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    try {
      const r = await api.listMySimSwapEvents();
      setEvents(r);
    } catch {
      /* silencieux */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // On n'affiche QUE les events qui demandent une action (DETECTED ou BLOCKED)
  const actionable = events.filter(
    (e) => e.status === "DETECTED" || e.status === "BLOCKED",
  );

  async function verify(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.verifySimSwapEvent(id);
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, status: "VERIFIED", verifiedAt: new Date().toISOString() }
            : e,
        ),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (actionable.length === 0) return null;

  return (
    <div
      className="card"
      role="region"
      aria-live="polite"
      aria-label={t("simSwap.securityAlertsTitle")}
      style={{
        marginTop: 20,
        background:
          "linear-gradient(135deg, rgba(239,68,68,0.06), rgba(232,163,61,0.04))",
        border: "1px solid rgba(239,68,68,0.3)",
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 16, color: "var(--cream)" }}>
        🛡️ {t("simSwap.securityAlertsTitle")}
      </h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          margin: "0 0 12px",
          lineHeight: 1.5,
        }}
      >
        On a détecté des connexions à ton compte avec des signaux inhabituels.
        Pour chacune, dis-nous si c'était bien toi (en un clic) ou si tu as
        besoin d'aide pour sécuriser ton compte.
      </p>

      {error ? (
        <ApiErrorAlert error={error} onClose={() => setError(null)} />
      ) : null}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {actionable.map((e) => {
          const isBlocked = e.status === "BLOCKED";
          const reasons = (e.signals?.reasons as string[]) ?? [];
          return (
            <li
              key={e.id}
              style={{
                marginTop: 10,
                padding: 12,
                background: isBlocked
                  ? "rgba(239,68,68,0.10)"
                  : "rgba(232,163,61,0.08)",
                border: isBlocked
                  ? "1px solid rgba(239,68,68,0.4)"
                  : "1px solid rgba(232,163,61,0.4)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isBlocked ? "#991b1b" : "var(--cream)",
                    }}
                  >
                    {isBlocked ? "🚨 Connexion bloquée" : "⚠️ Connexion inhabituelle"}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--cream-soft)",
                      marginTop: 2,
                    }}
                  >
                    {new Date(e.createdAt).toLocaleString("fr-FR", {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                    {e.country !== "??" && ` · pays détecté : ${e.country}`}
                  </div>
                </div>
                <span
                  aria-label={`Score de risque : ${e.riskScore} sur 100`}
                  title={t("simSwap.riskScoreNote")}
                  style={{
                    flexShrink: 0,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "ui-monospace, monospace",
                    background: isBlocked ? "#991b1b" : "#b45309",
                    color: "white",
                    borderRadius: 999,
                  }}
                >
                  {e.riskScore}/100
                </span>
              </div>

              {reasons.length > 0 && (
                <details style={{ marginBottom: 10 }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: 11,
                      color: "var(--cream-soft)",
                    }}
                  >
                    Voir les détails ({reasons.length} signal
                    {reasons.length > 1 ? "s" : ""})
                  </summary>
                  <ul
                    style={{
                      margin: "6px 0 0 18px",
                      padding: 0,
                      fontSize: 11,
                      color: "var(--cream-soft)",
                      lineHeight: 1.5,
                    }}
                  >
                    {reasons.map((r, i) => (
                      <li key={i} style={{ marginBottom: 2 }}>
                        {r}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => verify(e.id)}
                  disabled={busy === e.id}
                  className="btn btn-sm"
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    background:
                      "linear-gradient(135deg, #10b981, #047857)",
                    color: "white",
                  }}
                >
                  {busy === e.id ? "…" : "✓ C'était bien moi"}
                </button>
                {isBlocked && (
                  <a
                    href="/dashboard/profile#two-factor"
                    className="btn-ghost btn-sm"
                    style={{
                      padding: "6px 14px",
                      fontSize: 12,
                      textDecoration: "none",
                      color: "#991b1b",
                    }}
                  >
                    Sécuriser mon compte →
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p
        style={{
          fontSize: 10,
          color: "var(--muted)",
          margin: "12px 0 0",
          fontStyle: "italic",
          lineHeight: 1.5,
        }}
      >
        Pourquoi tu reçois ces alertes ? On surveille les connexions à ton
        compte pour détecter les signes de SIM swap (quelqu'un qui prendrait le
        contrôle de ton numéro). Voir notre{" "}
        <a href="/legal" style={{ color: "var(--saffron)" }}>
          politique de sécurité
        </a>
        .
      </p>
    </div>
  );
}
