"use client";

/**
 * Cloche de notifications avec badge + panel dropdown.
 *
 * Comportement :
 *  - Polling du compteur non-lues toutes les 30s (background)
 *  - Au clic sur la cloche, fetch la liste complète et affiche le dropdown
 *  - Au clic sur une notif, navigue vers son `link` puis marque comme lue
 *  - Bouton "Tout marquer lu"
 *
 * Mobile-first : panel plein écran sous 600px, dropdown au-dessus sinon.
 * Pas d'over-fetch : si le compteur est à 0, on n'expose pas le bouton "Voir tout".
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, isUnauthorized } from "../api-client";
import { useToast } from "./toast";

const POLL_INTERVAL_MS = 30_000;

const KIND_ICONS: Record<string, string> = {
  GROUP_INVITED: "👋",
  MEMBER_JOINED: "🧑",
  EXPENSE_ADDED: "💸",
  EXPENSE_UPDATED: "✏️",
  EXPENSE_DELETED: "🗑",
  SETTLEMENT_PROPOSED: "💳",
  SETTLEMENT_CONFIRMED: "✅",
  TONTINE_CREATED: "🪙",
  TONTINE_ACTIVATED: "🚀",
  TONTINE_TURN_DUE: "⏰",
  TONTINE_TURN_DISTRIBUTED: "🎉",
  TONTINE_DATE_CHANGED: "📅",
  SWAP_PROPOSED: "🔄",
  SWAP_ACCEPTED: "✅",
  SWAP_REJECTED: "✗",
  DEBT_TRANSFER_PROPOSED: "↔",
  DEBT_TRANSFER_ACCEPTED: "✅",
  DEBT_TRANSFER_REJECTED: "✗",
  ROLE_CHANGED: "🛡",
  GROUP_DELETED: "🗑",
  ATTACHMENT_ADDED: "📎",
};

export function NotificationBell(): JSX.Element | null {
  const router = useRouter();
  const toast = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Polling du badge
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;

    async function tick() {
      try {
        const r = await api.unreadNotificationsCount();
        if (!cancelled) setUnreadCount(r.count);
      } catch (e) {
        if (isUnauthorized(e)) {
          // Pas connecté : on stoppe le polling. La page de login redirigera.
          if (pollRef.current != null) clearInterval(pollRef.current);
          return;
        }
        // Échec réseau : ignore silencieusement (background poll)
      }
    }
    void tick();
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    function onVisibility() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (pollRef.current != null) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const list = await api.listNotifications(false, 30);
      setItems(list);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    if (!open) {
      void loadItems();
    }
    setOpen(!open);
  }

  async function handleClick(n: any) {
    // Marque comme lue (best-effort)
    if (!n.readAt) {
      try {
        await api.markNotificationRead(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  }

  async function handleMarkAllRead() {
    try {
      const r = await api.markAllNotificationsRead();
      setUnreadCount(0);
      // Marque local
      setItems((it) => it.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      toast.success(`${r.updated} notification${r.updated > 1 ? "s" : ""} marquée${r.updated > 1 ? "s" : ""} comme lue${r.updated > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e);
    }
  }

  // Pas affiché si pas connecté
  if (typeof window !== "undefined" && !getToken()) return null;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={toggleOpen}
        aria-label={`Notifications (${unreadCount} non-lues)`}
        title="Notifications"
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          fontSize: 22,
          cursor: "pointer",
          padding: 8,
          minHeight: 44,
          minWidth: 44,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "inherit",
        }}
      >
        {unreadCount > 0 ? "🔔" : "🔕"}
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              background: "#ef4444",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              padding: "0 5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--bg, #fff)",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop pour fermer en cliquant ailleurs */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
            }}
          />
          {/* Panel */}
          <div
            style={{
              position: "fixed",
              top: "calc(env(safe-area-inset-top, 0) + 64px)",
              right: 8,
              left: 8,
              maxWidth: 420,
              marginLeft: "auto",
              maxHeight: "70vh",
              background: "#fff",
              color: "#111827",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
              zIndex: 1001,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #f0f0f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <strong style={{ fontSize: 15 }}>
                Notifications {unreadCount > 0 && `(${unreadCount})`}
              </strong>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 12,
                    color: "#3b82f6",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  Tout marquer lu
                </button>
              )}
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {loading && (
                <p
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  Chargement…
                </p>
              )}
              {!loading && items.length === 0 && (
                <p
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  Aucune notification
                </p>
              )}
              {!loading &&
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: n.readAt ? "transparent" : "#eff6ff",
                      border: "none",
                      padding: "12px 16px",
                      borderBottom: "1px solid #f0f0f0",
                      cursor: "pointer",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}
                    >
                      {KIND_ICONS[n.kind] ?? "•"}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontWeight: n.readAt ? 500 : 700,
                          fontSize: 14,
                          color: "#111827",
                        }}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#6b7280",
                            marginTop: 2,
                          }}
                        >
                          {n.body}
                        </span>
                      )}
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: "#9ca3af",
                          marginTop: 4,
                        }}
                      >
                        {new Date(n.createdAt).toLocaleString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
