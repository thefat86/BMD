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
import { useMyEvents } from "../use-realtime";
import { useT } from "../i18n/app-strings";
// V52.C3 — SVG remplace EMOJI (icon registry V45)
import { Icon, type IconName } from "./icons";

// Polling fallback ralenti (60s au lieu de 30s) — le SSE prend désormais le
// relais pour le temps réel, on ne poll que pour les cas où SSE coupe.
const POLL_INTERVAL_MS = 60_000;

// V52.C3 — SVG remplace EMOJI : map kind → IconName du registry V45 outline.
// Tout emoji présent au rendu doit avoir un équivalent SVG.
const KIND_ICONS: Record<string, IconName> = {
  GROUP_INVITED: "users",
  MEMBER_JOINED: "user",
  EXPENSE_ADDED: "receipt",
  EXPENSE_UPDATED: "pencil",
  EXPENSE_DELETED: "trash-2",
  SETTLEMENT_PROPOSED: "credit-card",
  SETTLEMENT_CONFIRMED: "check",
  TONTINE_CREATED: "coins",
  TONTINE_ACTIVATED: "sparkles",
  TONTINE_TURN_DUE: "bell",
  TONTINE_TURN_DISTRIBUTED: "party-popper",
  TONTINE_DATE_CHANGED: "rotate-cw",
  SWAP_PROPOSED: "repeat",
  SWAP_ACCEPTED: "check",
  SWAP_REJECTED: "x",
  DEBT_TRANSFER_PROPOSED: "arrow-right",
  DEBT_TRANSFER_ACCEPTED: "check",
  DEBT_TRANSFER_REJECTED: "x",
  ROLE_CHANGED: "shield",
  GROUP_DELETED: "trash-2",
  ATTACHMENT_ADDED: "paperclip",
};

export function NotificationBell(): JSX.Element | null {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  // V118.B — SSE temps réel : dès qu'une nouvelle notif est créée côté
  // serveur, on incrémente le badge instantanément + on reload la liste
  // si elle est ouverte. Le `connected` retourné par le hook nous sert
  // à pauser le polling fallback : tant que la connexion SSE tient, on
  // évite la requête HTTP toutes les 60s (gain réseau + batterie mobile).
  const { connected: sseConnected } = useMyEvents((event) => {
    if (event.kind === "notification.created") {
      setUnreadCount((c) => c + 1);
      if (open) void loadItems();
    }
  });

  // Polling du badge — fallback uniquement quand SSE n'est PAS connecté.
  // Avant V118.B : `setInterval(tick, 60_000)` tournait en permanence
  // même quand le SSE recevait les events en temps réel → 1 requête
  // HTTP réseau toutes les 60s pour rien. Désormais l'effet se
  // désabonne dès que sseConnected passe à true, et se réabonne si
  // la connexion SSE coupe.
  useEffect(() => {
    if (!getToken()) return;
    if (sseConnected) return; // SSE OK → pas de polling fallback
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
  }, [sseConnected]);

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
        aria-label={`${t("notif.title")} (${unreadCount} non-lues)`}
        title={t("notif.title")}
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
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
        {/* V52.C3 — SVG remplace EMOJI (🔔 / 🔕). Quand pas de non-lues on
            réduit légèrement l'opacité pour signifier "muet" plutôt que de
            charger une icône bell-off non disponible au registry. */}
        <Icon
          name="bell"
          size={22}
          color="currentColor"
          strokeWidth={1.6}
          style={{ opacity: unreadCount > 0 ? 1 : 0.55 }}
        />
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
              background: "linear-gradient(180deg, #2A2244 0%, #1E1830 100%)",
              color: "var(--cream, #F4E4C1)",
              border: "1px solid rgba(232,163,61,0.20)",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
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
                {t("notif.title")} {unreadCount > 0 && `(${unreadCount})`}
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
                  {t("notif.markAllRead")}
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
                  {t("common.loading")}
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
                  {t("notif.empty")}
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
                    {/* V52.C3 — SVG remplace EMOJI. Fallback bell si kind inconnu. */}
                    <span
                      style={{
                        flexShrink: 0,
                        lineHeight: 1,
                        display: "inline-flex",
                        color: "var(--saffron, #e8a33d)",
                      }}
                    >
                      <Icon
                        name={KIND_ICONS[n.kind] ?? "bell"}
                        size={20}
                        color="currentColor"
                        strokeWidth={1.6}
                      />
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
