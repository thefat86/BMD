"use client";

/**
 * <AdminFxBlock /> · Surcharge manuelle des taux FX (spec §6.5).
 *
 * Affiche tous les taux actuels avec leur source (provider / fixed / manual_override)
 * et permet à un super-admin de surcharger un taux quand le provider donne
 * une valeur aberrante (panne API, anomalie de marché, etc.).
 *
 * Workflow :
 *  1. Admin voit la liste des 25 devises avec rateToEur + source + fetchedAt
 *  2. Cliquer "✏️" ouvre un input de saisie + champ note optionnel
 *  3. Le clic sur "✓" PATCH le taux + crée une ligne FxRateHistory
 *  4. Cliquer "🔄 Restaurer provider" lève la surcharge
 *  5. Cliquer "📜 Historique" liste les N derniers changements (qui, quand, quoi)
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";

interface FxRate {
  code: string;
  rateToEur: string;
  source: string;
  fetchedAt: string;
}

interface HistoryItem {
  id: string;
  previousRate: string;
  newRate: string;
  source: string;
  actorId: string | null;
  actorName: string | null;
  note: string | null;
  changedAt: string;
}

export function AdminFxBlock() {
  const [rates, setRates] = useState<FxRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editNote, setEditNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [historyCode, setHistoryCode] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  async function load() {
    try {
      const r = await api.adminListFxRates();
      setRates(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(rate: FxRate) {
    setEditingCode(rate.code);
    setEditValue(rate.rateToEur);
    setEditNote("");
  }

  async function saveOverride(code: string) {
    setBusy(code);
    setError(null);
    try {
      const num = parseFloat(editValue.replace(",", "."));
      if (isNaN(num) || num <= 0) {
        throw new Error("Taux invalide");
      }
      await api.adminOverrideFxRate(code, num, editNote || undefined);
      setEditingCode(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function clearOverride(code: string) {
    setBusy(code);
    setError(null);
    try {
      await api.adminClearFxOverride(code);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function showHistory(code: string) {
    setHistoryCode(code);
    setHistory(null);
    try {
      const h = await api.adminFxRateHistory(code, 50);
      setHistory(h);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card" data-testid="admin-fx-block">
      <div className="card-head">
        <h2>💱 Taux FX</h2>
        <span style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}>
          25 devises · refresh auto chaque heure
        </span>
      </div>

      <p style={{ fontSize: 12, color: "var(--cream-soft)", margin: "0 0 12px" }}>
        Surcharger un taux lève la mise à jour automatique pour cette devise.
        Tous les changements sont audités (qui, quand, pourquoi).
      </p>

      {error && (
        <div className="error" role="alert" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!rates ? (
        <p style={{ color: "var(--cream-soft)" }}>Chargement…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(244,228,193,0.10)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--cream-soft)" }}>
                Code
              </th>
              <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--cream-soft)" }}>
                1 EUR =
              </th>
              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--cream-soft)" }}>
                Source
              </th>
              <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--cream-soft)" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const isEditing = editingCode === r.code;
              const isOverride = r.source === "manual_override";
              const isFixed = r.source === "fixed";
              return (
                <tr
                  key={r.code}
                  style={{
                    borderBottom: "1px solid rgba(244,228,193,0.05)",
                    background: isOverride
                      ? "rgba(232,163,61,0.04)"
                      : "transparent",
                  }}
                >
                  <td style={{ padding: "8px", fontWeight: 700, color: "var(--cream)" }}>
                    {r.code}
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      textAlign: "right",
                      fontFamily: "ui-monospace, monospace",
                      color: "var(--cream)",
                    }}
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                        style={{
                          width: 120,
                          padding: "4px 8px",
                          background: "rgba(244,228,193,0.06)",
                          border: "1px solid var(--saffron, #e8a33d)",
                          color: "var(--cream)",
                          borderRadius: 4,
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 12,
                        }}
                      />
                    ) : (
                      parseFloat(r.rateToEur).toFixed(4)
                    )}
                  </td>
                  <td style={{ padding: "8px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: isOverride
                          ? "rgba(232,163,61,0.18)"
                          : isFixed
                            ? "rgba(102,205,170,0.18)"
                            : "rgba(244,228,193,0.04)",
                        color: isOverride
                          ? "var(--saffron, #e8a33d)"
                          : isFixed
                            ? "var(--emerald-soft, #66cdaa)"
                            : "var(--cream-soft)",
                        fontWeight: 600,
                      }}
                    >
                      {isOverride ? "✏️ admin" : isFixed ? "🔒 fixe" : "🔄 auto"}
                    </span>
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          placeholder="note (optionnel)"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          style={{
                            marginRight: 4,
                            padding: "3px 6px",
                            fontSize: 10,
                            background: "rgba(244,228,193,0.06)",
                            border: "1px solid rgba(244,228,193,0.18)",
                            color: "var(--cream)",
                            borderRadius: 4,
                            width: 110,
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => saveOverride(r.code)}
                          disabled={busy === r.code}
                          className="btn-ghost btn-sm"
                          style={{ fontSize: 11, padding: "3px 8px" }}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCode(null)}
                          className="btn-ghost btn-sm"
                          style={{ fontSize: 11, padding: "3px 8px", marginLeft: 2 }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        {!isFixed && (
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className="btn-ghost btn-sm"
                            title="Surcharger ce taux"
                            style={{ fontSize: 11, padding: "3px 8px" }}
                          >
                            ✏️
                          </button>
                        )}
                        {isOverride && (
                          <button
                            type="button"
                            onClick={() => clearOverride(r.code)}
                            disabled={busy === r.code}
                            className="btn-ghost btn-sm"
                            title="Lever la surcharge — refresh provider au prochain tick"
                            style={{
                              fontSize: 11,
                              padding: "3px 8px",
                              marginLeft: 2,
                            }}
                          >
                            🔄
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => showHistory(r.code)}
                          className="btn-ghost btn-sm"
                          title="Voir l'historique"
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            marginLeft: 2,
                          }}
                        >
                          📜
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Modal historique */}
      {historyCode && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(14,11,20,0.85)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setHistoryCode(null);
            }
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #2A2244, #1E1830)",
              border: "1px solid rgba(232,163,61,0.30)",
              borderRadius: 16,
              maxWidth: 720,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <h2
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 22,
                  margin: 0,
                  color: "var(--cream)",
                }}
              >
                📜 Historique · {historyCode}
              </h2>
              <button
                type="button"
                onClick={() => setHistoryCode(null)}
                className="btn-ghost btn-sm"
              >
                ✕
              </button>
            </div>
            {!history ? (
              <p style={{ color: "var(--cream-soft)" }}>Chargement…</p>
            ) : history.length === 0 ? (
              <p style={{ color: "var(--cream-soft)" }}>
                Pas encore d'historique pour cette devise.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {history.map((h) => (
                  <li
                    key={h.id}
                    style={{
                      padding: 10,
                      background: "rgba(244,228,193,0.04)",
                      border: "1px solid rgba(244,228,193,0.08)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{ display: "flex", gap: 12, fontFamily: "ui-monospace, monospace" }}
                    >
                      <span style={{ color: "var(--cream-soft)" }}>
                        {parseFloat(h.previousRate).toFixed(4)}
                      </span>
                      <span style={{ color: "var(--saffron)" }}>→</span>
                      <span style={{ color: "var(--cream)", fontWeight: 700 }}>
                        {parseFloat(h.newRate).toFixed(4)}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 10, color: "var(--cream-muted, #aaa)" }}>
                        {h.source} ·{" "}
                        {new Date(h.changedAt).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    {(h.actorName || h.note) && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--cream-soft)",
                          marginTop: 4,
                        }}
                      >
                        {h.actorName && <strong>{h.actorName}</strong>}
                        {h.note && <> · {h.note}</>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
