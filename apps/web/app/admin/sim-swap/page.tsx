"use client";

/**
 * Admin · Investigation SIM swap (spec §7.5).
 *
 * Liste les events SIM swap détectés, filtrable par status, avec :
 *  - score de risque colorisé (vert / ambre / rouge)
 *  - signaux détectés (lisibles humain)
 *  - boutons résoudre / dismisser (faux positif)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { ResponsiveShell } from "@/lib/ui/responsive-shell";
import { useBreakpoint } from "@/lib/use-breakpoint";

interface Event {
  id: string;
  userId: string;
  userName: string;
  riskScore: number;
  signals: any;
  contactValueAttempted: string | null;
  contactTypeAttempted: string | null;
  country: string;
  userAgent: string | null;
  status: string;
  verifiedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DETECTED: { label: "🔍 Détecté", color: "#b45309" },
  BLOCKED: { label: "🚨 Bloqué", color: "#991b1b" },
  VERIFIED: { label: "✓ Vérifié user", color: "#10b981" },
  RESOLVED: { label: "✓ Résolu admin", color: "#3a2f5b" },
  DISMISSED: { label: "🗑️ Faux positif", color: "#7c6e93" },
};

export default function SimSwapAdminPage() {
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.adminListSimSwapEvents(filter || undefined);
      setEvents(r);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function resolve(id: string, action: "resolve" | "dismiss") {
    setActingId(id);
    try {
      await api.adminResolveSimSwapEvent(id, { action, note });
      setNoteFor(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setActingId(null);
    }
  }

  return (
    <ResponsiveShell
      breadcrumb="Administration › Sécurité"
      desktopTitle="🛡️ SIM swap · investigation"
      subtitle="Détection des prises de contrôle suspectes via changement de SIM."
      mobileTitle="SIM swap"
      back={{ href: "/admin" }}
      hideFab
    >
      <div
        style={{
          padding: isMobile ? "8px 16px 24px" : 0,
          maxWidth: isMobile ? "100%" : 1100,
          margin: "0 auto",
        }}
      >
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        Connexions détectées comme suspectes (score ≥ 40). On cherche en
        priorité les <strong>BLOCKED</strong> non encore <strong>VERIFIED</strong> ni{" "}
        <strong>RESOLVED</strong>.
      </p>

      {/* Filtres status */}
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        {[
          { v: "", label: "Tous" },
          { v: "BLOCKED", label: "🚨 Bloqués" },
          { v: "DETECTED", label: "🔍 Détectés" },
          { v: "VERIFIED", label: "✓ Vérifiés" },
          { v: "RESOLVED", label: "✓ Résolus" },
          { v: "DISMISSED", label: "🗑️ Faux pos." },
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setFilter(opt.v)}
            aria-pressed={filter === opt.v}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid var(--line-soft)",
              background:
                filter === opt.v
                  ? "var(--saffron, #E8A33D)"
                  : "var(--overlay-2)",
              color: filter === opt.v ? "#16111e" : "var(--cream-soft)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error ? <ApiErrorAlert error={error} onClose={() => setError(null)} /> : null}

      {loading && events.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : events.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <p className="muted">
            🎉 Aucun événement pour ce filtre — tout va bien.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {events.map((e) => {
            const reasons = (e.signals?.reasons as string[]) ?? [];
            const status =
              STATUS_LABELS[e.status] ?? {
                label: e.status,
                color: "#7c6e93",
              };
            const isActive =
              e.status === "DETECTED" || e.status === "BLOCKED";
            const scoreColor =
              e.riskScore >= 80
                ? "#991b1b"
                : e.riskScore >= 60
                  ? "#b45309"
                  : "#7c6e93";
            return (
              <li
                key={e.id}
                className="card"
                style={{
                  marginBottom: 10,
                  borderLeft: `3px solid ${scoreColor}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--cream)",
                      }}
                    >
                      {e.userName}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--cream-soft)",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {e.userId.slice(0, 8)}…
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                  >
                    <span
                      style={{
                        padding: "3px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        background: status.color,
                        color: "white",
                        borderRadius: 999,
                      }}
                    >
                      {status.label}
                    </span>
                    <span
                      style={{
                        padding: "3px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: "ui-monospace, monospace",
                        background: scoreColor,
                        color: "white",
                        borderRadius: 999,
                      }}
                    >
                      {e.riskScore}/100
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cream-soft)",
                    marginBottom: 8,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 12px",
                  }}
                >
                  <span>
                    📅{" "}
                    {new Date(e.createdAt).toLocaleString("fr-FR", {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </span>
                  {e.country !== "??" && <span>🌍 {e.country}</span>}
                  {e.contactValueAttempted && (
                    <span>📞 {e.contactValueAttempted}</span>
                  )}
                </div>

                {e.userAgent && (
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "ui-monospace, monospace",
                      color: "var(--muted)",
                      marginBottom: 8,
                      padding: "4px 8px",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: 4,
                      overflowWrap: "break-word",
                    }}
                  >
                    {e.userAgent}
                  </div>
                )}

                {reasons.length > 0 && (
                  <details style={{ marginBottom: 8 }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 11,
                        color: "var(--cream-soft)",
                      }}
                    >
                      📋 Signaux détectés ({reasons.length})
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

                {e.resolutionNote && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--cream-soft)",
                      fontStyle: "italic",
                      padding: "6px 10px",
                      background: "rgba(232,163,61,0.06)",
                      borderRadius: 6,
                      marginBottom: 8,
                    }}
                  >
                    📝 {e.resolutionNote}
                  </div>
                )}

                {isActive && (
                  <>
                    {noteFor === e.id ? (
                      <div>
                        <textarea
                          value={note}
                          onChange={(ev) => setNote(ev.target.value)}
                          placeholder="Note de résolution (optionnel)…"
                          rows={2}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: 12,
                            background: "var(--overlay-2)",
                            border: "1px solid var(--line-soft)",
                            borderRadius: 8,
                            color: "var(--cream)",
                            resize: "vertical",
                            marginBottom: 6,
                          }}
                        />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => resolve(e.id, "resolve")}
                            disabled={actingId === e.id}
                            style={{ padding: "5px 12px", fontSize: 11 }}
                          >
                            ✓ Résoudre
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => resolve(e.id, "dismiss")}
                            disabled={actingId === e.id}
                            style={{ padding: "5px 12px", fontSize: 11 }}
                          >
                            🗑️ Faux positif
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => {
                              setNoteFor(null);
                              setNote("");
                            }}
                            style={{
                              padding: "5px 12px",
                              fontSize: 11,
                              color: "var(--muted)",
                            }}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setNoteFor(e.id);
                            setNote("");
                          }}
                          style={{ padding: "5px 12px", fontSize: 11 }}
                        >
                          ✏️ Marquer résolu
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </ResponsiveShell>
  );
}
