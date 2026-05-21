"use client";

/**
 * <MobileNotificationCenter /> · Centre de notifications mobile natif.
 *
 * Sheet plein-écran (slide-up depuis le bas), liste de notifications
 * tapables qui :
 *  - Marque la notif comme lue au tap
 *  - Navigue vers `link` (groupe, dépense, paiement…)
 *  - Refresh via pull-to-refresh
 *  - Affiche skeleton loaders pendant le chargement
 *  - Bouton "Tout marquer lu" en haut
 *  - Empty state inviting si pas de notif
 *
 * UX cible : feel app banking style — zéro frictiion, scroll fluide,
 * tap = action immédiate.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { haptic } from "../platform";
import { useToast } from "./toast";
// V52.C2 — SVG remplace EMOJI : icon registry V52.A2
import { Icon, type IconName } from "./icons";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  payload?: Record<string, unknown>;
}

// V52.C2 — SVG remplace EMOJI : map vers IconName (registry V52.A2)
const KIND_ICONS: Record<string, IconName> = {
  GROUP_INVITED: "share-2",
  MEMBER_JOINED: "user",
  EXPENSE_ADDED: "receipt",
  EXPENSE_UPDATED: "pencil",
  EXPENSE_DELETED: "trash-2",
  SETTLEMENT_PROPOSED: "credit-card",
  SETTLEMENT_PAID: "credit-card",
  SETTLEMENT_CONFIRMED: "check",
  TONTINE_CREATED: "coins",
  TONTINE_ACTIVATED: "sparkles",
  TONTINE_TURN_DUE: "alert-triangle",
  TONTINE_TURN_DISTRIBUTED: "party-popper",
  TONTINE_DATE_CHANGED: "file-text",
  WEEKLY_SUMMARY: "bar-chart-2",
  SWAP_PROPOSED: "repeat",
  SWAP_ACCEPTED: "check",
  SWAP_REJECTED: "x",
  DEBT_TRANSFER_PROPOSED: "arrow-right",
  DEBT_TRANSFER_ACCEPTED: "check",
  DEBT_TRANSFER_REJECTED: "x",
  ROLE_CHANGED: "shield",
  GROUP_DELETED: "trash-2",
  ATTACHMENT_ADDED: "paperclip",
  PASSKEY_REGISTERED: "key-round",
  SIM_SWAP_ALERT: "alert-triangle",
  SUBSCRIPTION_GRACE: "alert-triangle",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

export function MobileNotificationCenter({
  open,
  onClose,
  onUnreadChange,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [animateClose, setAnimateClose] = useState(false);

  async function load() {
    setError(null);
    try {
      const list = (await api.listNotifications(false, 50)) as Notification[];
      setItems(list);
      const unread = list.filter((n) => !n.readAt).length;
      onUnreadChange?.(unread);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
    // Body scroll lock pendant l'ouverture
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC pour fermer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    setAnimateClose(true);
    setTimeout(() => {
      setAnimateClose(false);
      onClose();
    }, 220);
  }

  async function handleTap(n: Notification) {
    haptic("tap");
    if (!n.readAt) {
      try {
        await api.markNotificationRead(n.id);
        setItems((prev) =>
          prev
            ? prev.map((x) =>
                x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
              )
            : prev,
        );
        onUnreadChange?.(
          (items?.filter((x) => !x.readAt && x.id !== n.id).length ?? 0),
        );
      } catch {
        /* ignore */
      }
    }
    handleClose();
    if (n.link) {
      router.push(n.link);
    }
  }

  async function handleMarkAll() {
    try {
      const r = await api.markAllNotificationsRead();
      haptic("success");
      setItems((prev) =>
        prev
          ? prev.map((x) => ({
              ...x,
              readAt: x.readAt ?? new Date().toISOString(),
            }))
          : prev,
      );
      onUnreadChange?.(0);
      toast.success(
        `${r.updated} notification${r.updated > 1 ? "s" : ""} marquée${r.updated > 1 ? "s" : ""} comme lue${r.updated > 1 ? "s" : ""}`,
      );
    } catch (e) {
      toast.error(e);
    }
  }

  if (!open) return null;

  const unreadCount = items?.filter((n) => !n.readAt).length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        background: "rgba(14,11,20,0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: animateClose
          ? "bmd-nc-fadeout 0.2s forwards"
          : "bmd-nc-fadein 0.2s",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(180deg, #2A2244 0%, #1E1830 100%)",
          border: "1px solid rgba(232,163,61,0.30)",
          borderBottom: "none",
          borderRadius: "22px 22px 0 0",
          width: "100%",
          maxWidth: 600,
          height: "min(85dvh, 720px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          display: "flex",
          flexDirection: "column",
          color: "var(--cream)",
          animation: animateClose
            ? "bmd-nc-slidedown 0.22s forwards"
            : "bmd-nc-slideup 0.3s ease-out",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div
          aria-hidden
          style={{
            padding: "10px 0 6px",
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: "rgba(244,228,193,0.25)",
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            padding: "0 20px 12px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              flex: 1,
              color: "var(--cream)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* V52.C2 — SVG remplace EMOJI */}
            <Icon name="bell" size={20} strokeWidth={1.6} color="var(--saffron)" />
            Notifications
          </h2>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="btn-ghost btn-sm"
              style={{ fontSize: 11, padding: "6px 10px" }}
            >
              Tout marquer lu
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(244,228,193,0.06)",
              border: "1px solid rgba(244,228,193,0.10)",
              color: "var(--cream-soft)",
              cursor: "pointer",
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* V52.C2 — SVG remplace EMOJI */}
            <Icon name="x" size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* Liste */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "0 16px 16px",
          }}
        >
          {error ? (
            <div className="error" role="alert">
              {error}
            </div>
          ) : items === null ? (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
              aria-busy="true"
            >
              {[0, 1, 2, 3].map((i) => (
                <li
                  key={i}
                  style={{
                    height: 70,
                    background:
                      "linear-gradient(90deg, rgba(244,228,193,0.04) 0%, rgba(244,228,193,0.10) 50%, rgba(244,228,193,0.04) 100%)",
                    backgroundSize: "200% 100%",
                    animation: "bmd-skel-shimmer 1.4s linear infinite",
                    borderRadius: 14,
                  }}
                />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "var(--cream-soft)",
              }}
            >
              {/* V52.C2 — SVG remplace EMOJI : bell outline pour empty state */}
              <div style={{ marginBottom: 10, color: "var(--saffron)", display: "flex", justifyContent: "center" }}>
                <Icon name="bell" size={56} strokeWidth={1.3} />
              </div>
              <div
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--cream)",
                  marginBottom: 6,
                }}
              >
                Tout est calme
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                Aucune notification pour l'instant. On te préviendra dès qu'il
                se passe quelque chose dans tes groupes.
              </div>
            </div>
          ) : (
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
              {items.map((n) => {
                const unread = !n.readAt;
                // V52.C2 — SVG remplace EMOJI : iconName depuis registry (fallback bell)
                const iconName: IconName = KIND_ICONS[n.kind] ?? "bell";
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleTap(n)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: 12,
                        background: unread
                          ? "rgba(232,163,61,0.08)"
                          : "rgba(244,228,193,0.03)",
                        border: unread
                          ? "1px solid rgba(232,163,61,0.25)"
                          : "1px solid rgba(244,228,193,0.06)",
                        borderRadius: 14,
                        color: "var(--cream)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        position: "relative",
                        minHeight: 64,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: unread
                            ? "rgba(232,163,61,0.18)"
                            : "rgba(244,228,193,0.06)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: unread ? "var(--saffron)" : "var(--cream-soft)",
                          flexShrink: 0,
                        }}
                      >
                        {/* V52.C2 — SVG remplace EMOJI */}
                        <Icon name={iconName} size={18} strokeWidth={1.6} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: unread ? 700 : 600,
                            fontSize: 13,
                            color: "var(--cream)",
                            marginBottom: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {n.title}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--cream-soft)",
                            lineHeight: 1.4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {n.body}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--cream-muted, #888)",
                            marginTop: 4,
                          }}
                        >
                          {fmtRelative(n.createdAt)}
                        </div>
                      </div>
                      {unread && (
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "var(--saffron)",
                            position: "absolute",
                            top: 14,
                            right: 14,
                          }}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes bmd-nc-fadein {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes bmd-nc-fadeout {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        @keyframes bmd-nc-slideup {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes bmd-nc-slidedown {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(100%);
          }
        }
        @keyframes bmd-skel-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}

function fmtRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffDays = Math.floor(diffH / 24);
  if (diffDays < 7) return `il y a ${diffDays} j`;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
