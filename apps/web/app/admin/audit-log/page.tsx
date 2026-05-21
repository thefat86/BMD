"use client";

/**
 * Admin · Journal d'audit immuable (spec §6.10 + §9.1).
 *
 * Affiche les ActivityLog de tous les groupes paginées + permet
 * de vérifier l'intégrité de la chaîne hash de chaque groupe.
 *
 * Permissions : super-admin uniquement (assertSuperAdmin côté backend).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, isUnauthorized } from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { ResponsiveShell } from "@/lib/ui/responsive-shell";
import { useBreakpoint } from "@/lib/use-breakpoint";

interface AuditEntry {
  id: string;
  kind: string;
  groupId: string;
  groupName: string;
  actorId: string | null;
  actorName: string | null;
  payload: any;
  createdAt: string;
  hasHash: boolean;
}

const PAGE_SIZE = 50;

const KIND_EMOJI: Record<string, string> = {
  GROUP_CREATED: "🌱",
  GROUP_RENAMED: "✏️",
  GROUP_DELETED: "🗑️",
  MEMBER_JOINED: "👋",
  MEMBER_LEFT: "👋",
  MEMBER_REMOVED: "🚪",
  ROLE_CHANGED: "🛡️",
  EXPENSE_ADDED: "💸",
  EXPENSE_UPDATED: "📝",
  EXPENSE_DELETED: "🗑️",
  TONTINE_CREATED: "🪙",
  TONTINE_TURN_DISTRIBUTED: "🎁",
  SWAP_PROPOSED: "↔️",
  SWAP_ACCEPTED: "✅",
  SWAP_REJECTED: "❌",
  INVITE_LINK_CREATED: "🔗",
};

export default function AuditLogPage() {
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filterKind, setFilterKind] = useState("");

  // Vérification d'intégrité (à la demande)
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    checkedAt: string;
    totalGroups: number;
    validGroups: number;
    brokenGroups: Array<{ groupId: string; groupName: string; brokenAt?: number }>;
  } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.adminAuditLog({
        limit: PAGE_SIZE,
        offset,
        kind: filterKind || undefined,
      });
      setItems(r.items);
      setTotal(r.total);
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
  }, [offset, filterKind]);

  async function runVerifyAll() {
    setVerifying(true);
    setError(null);
    try {
      const r = await api.adminVerifyAllAuditChains();
      setVerifyResult(r);
    } catch (e) {
      setError(e);
    } finally {
      setVerifying(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <ResponsiveShell
      breadcrumb="Administration › Audit log"
      desktopTitle="🛡️ Journal d'audit"
      subtitle="Trace immuable de toutes les actions sur la plateforme."
      mobileTitle="Audit log"
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
      {/* Bandeau "intégrité" */}
      <div
        className="card"
        style={{
          background:
            "linear-gradient(135deg,rgba(232,163,61,0.10),rgba(16,185,129,0.06))",
          border: "1px solid var(--line)",
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div className="between" style={{ alignItems: "center", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: "var(--cream)" }}>
              Intégrité de la chaîne hash
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--cream-soft)",
                lineHeight: 1.4,
              }}
            >
              Chaque entrée est liée à la précédente par un hash SHA-256.
              Une altération a posteriori serait immédiatement détectée.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={runVerifyAll}
            disabled={verifying}
            style={{ flexShrink: 0 }}
          >
            {verifying ? "Vérification…" : "Vérifier tout"}
          </button>
        </div>

        {verifyResult && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              background:
                verifyResult.brokenGroups.length === 0
                  ? "rgba(16,185,129,0.10)"
                  : "rgba(239,68,68,0.10)",
              border:
                verifyResult.brokenGroups.length === 0
                  ? "1px solid rgba(16,185,129,0.4)"
                  : "1px solid rgba(239,68,68,0.4)",
              fontSize: 12,
              color: "var(--cream)",
            }}
          >
            {verifyResult.brokenGroups.length === 0 ? (
              <>
                ✅ <strong>{verifyResult.validGroups}/{verifyResult.totalGroups}</strong>{" "}
                groupes vérifiés — toutes les chaînes sont intactes.
              </>
            ) : (
              <>
                ⚠️ <strong>{verifyResult.brokenGroups.length}</strong> groupe(s)
                avec une chaîne corrompue :
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {verifyResult.brokenGroups.map((g) => (
                    <li key={g.groupId}>
                      {g.groupName}{" "}
                      {g.brokenAt !== undefined && (
                        <span style={{ color: "var(--muted)" }}>
                          (entrée #{g.brokenAt})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: "var(--muted)",
              }}
            >
              Vérifié à {new Date(verifyResult.checkedAt).toLocaleString("fr-FR")}
            </div>
          </div>
        )}
      </div>

      {/* Filtre par kind */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label style={{ fontSize: 12, color: "var(--cream-soft)" }}>
          Filtrer par type :
        </label>
        <select
          value={filterKind}
          onChange={(e) => {
            setFilterKind(e.target.value);
            setOffset(0);
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--line-soft)",
            background: "var(--overlay-2)",
            color: "var(--cream)",
            fontSize: 12,
          }}
        >
          <option value="">Tous</option>
          {Object.keys(KIND_EMOJI).map((k) => (
            <option key={k} value={k}>
              {KIND_EMOJI[k]} {k}
            </option>
          ))}
        </select>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          {total} entrée{total > 1 ? "s" : ""} · page {currentPage}/{totalPages || 1}
        </span>
      </div>

      {error ? (
        <ApiErrorAlert error={error} onClose={() => setError(null)} />
      ) : null}

      {/* Tableau */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && items.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>
            Chargement…
          </p>
        ) : items.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>
            Aucune entrée dans le journal pour ce filtre.
          </p>
        ) : (
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  background: "var(--overlay)",
                  textAlign: "left",
                  color: "var(--muted)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                <th style={{ padding: "8px 12px" }}>Quand</th>
                <th style={{ padding: "8px 12px" }}>Type</th>
                <th style={{ padding: "8px 12px" }}>Groupe</th>
                <th style={{ padding: "8px 12px" }}>Auteur</th>
                <th style={{ padding: "8px 12px" }}>Détails</th>
                <th style={{ padding: "8px 12px", width: 24 }}>🔒</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr
                  key={e.id}
                  style={{
                    borderTop: "1px solid var(--line-soft)",
                    color: "var(--cream)",
                  }}
                >
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    {new Date(e.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ marginRight: 4 }}>
                      {KIND_EMOJI[e.kind] ?? "📌"}
                    </span>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                      {e.kind}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <Link
                      href={`/dashboard/groups/${e.groupId}`}
                      style={{ color: "var(--saffron)", textDecoration: "none" }}
                    >
                      {e.groupName}
                    </Link>
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--cream-soft)" }}>
                    {e.actorName ?? <em style={{ color: "var(--muted)" }}>système</em>}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 10,
                      color: "var(--muted)",
                    }}
                    title={JSON.stringify(e.payload)}
                  >
                    {e.payload ? JSON.stringify(e.payload) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "center",
                      color: e.hasHash ? "var(--emerald, #10b981)" : "var(--muted)",
                    }}
                    title={e.hasHash ? "Entrée signée par hash" : "Sans hash (héritage)"}
                  >
                    {e.hasHash ? "✓" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginTop: 14,
          }}
        >
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            ← Précédent
          </button>
          <span
            style={{
              color: "var(--muted)",
              fontSize: 12,
              padding: "6px 8px",
            }}
          >
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Suivant →
          </button>
        </div>
      )}
      </div>
    </ResponsiveShell>
  );
}
