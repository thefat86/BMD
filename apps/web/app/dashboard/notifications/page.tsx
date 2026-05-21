"use client";

/**
 * /dashboard/notifications · Centre de notifications dédié.
 *
 * V52.I1 — Bascule mobile/desktop : early-return isMobile renvoie une vue
 * mobile-native dédiée (cards + bottom-sheet actions), sinon vue desktop
 * banking-web (tableau dense + filtres). Plus aucun responsive solo.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../lib/api-client";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
import { useT } from "../../../lib/i18n/app-strings";
import { MobileNotificationsView } from "../../../lib/ui/mobile-notifications-view";

interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  payload: any;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const t = useT();

  // V52.I1 — Mobile : early-return vers la vue dédiée mobile-native.
  if (bpReady && isMobile) {
    return (
      <ResponsiveShell
        mobileTitle={t("nav.notifications") || "Notifications"}
        breadcrumb={t("nav.dashboard")}
        back={{ href: "/dashboard" }}
      >
        <MobileNotificationsView />
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      desktopTitle={t("nav.notifications") || "Notifications"}
      breadcrumb={t("nav.dashboard")}
    >
      <DesktopNotificationsView router={router} />
    </ResponsiveShell>
  );
}

/**
 * Vue desktop banking-web : tableau dense + barre d'actions + filtres.
 * Différente du mobile : plus de densité par écran, pas de bottom sheet.
 */
function DesktopNotificationsView({
  router,
}: {
  router: ReturnType<typeof useRouter>;
}) {
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .listNotifications(false, 100)
      .then((r) => setNotifs(r))
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
      });
  }, [router]);

  async function markAllRead() {
    if (!notifs) return;
    const unread = notifs.filter((n) => !n.readAt);
    await Promise.all(
      unread.map((n) => api.markNotificationRead(n.id).catch(() => null)),
    );
    api.listNotifications(false, 100).then((r) => setNotifs(r));
  }

  const filtered = useMemo(() => {
    if (!notifs) return [];
    if (filter === "unread") return notifs.filter((n) => !n.readAt);
    return notifs;
  }, [notifs, filter]);

  const unreadCount = useMemo(
    () => (notifs ? notifs.filter((n) => !n.readAt).length : 0),
    [notifs],
  );

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <FilterPill
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="Tout"
            count={notifs?.length ?? 0}
          />
          <FilterPill
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
            label="Non lues"
            count={unreadCount}
            accent
          />
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            style={{
              padding: "8px 16px",
              background: "var(--paper, rgba(244,228,193,0.06))",
              border: "1px solid var(--cocoa-line, rgba(244,228,193,0.12))",
              borderRadius: 10,
              color: "var(--cocoa, var(--cream))",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Tout marquer lu
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 10,
            color: "var(--v45-terracotta, #FFB89A)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {notifs === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: 56,
                background: "var(--paper, rgba(244,228,193,0.04))",
                borderRadius: 10,
                opacity: 0.5 + (i % 2) * 0.2,
              }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: "var(--cocoa-soft, var(--cream-soft))",
            fontSize: 14,
          }}
        >
          {filter === "unread"
            ? "Aucune notification non lue."
            : "Aucune notification."}
        </div>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom:
                  "1px solid var(--cocoa-line, rgba(244,228,193,0.10))",
              }}
            >
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontWeight: 600,
                  color: "var(--cocoa-soft, var(--cream-soft))",
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Type
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontWeight: 600,
                  color: "var(--cocoa-soft, var(--cream-soft))",
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Notification
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "10px 12px",
                  fontWeight: 600,
                  color: "var(--cocoa-soft, var(--cream-soft))",
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <DesktopNotifRow
                key={n.id}
                notif={n}
                onClick={() => {
                  // V160 — Parité avec mobile : marque lu + route vers
                  // le détail générique ou le lien spécifique selon le kind.
                  if (!n.readAt) {
                    setNotifs((cur) =>
                      cur
                        ? cur.map((x) =>
                            x.id === n.id
                              ? { ...x, readAt: new Date().toISOString() }
                              : x,
                          )
                        : cur,
                    );
                    api.markNotificationRead(n.id).catch(() => {});
                  }
                  // Pour les kinds qui demandent une action interactive
                  // (réactions, accusé, accept/refuse), on route vers la
                  // page détail dédiée /notifications/[id] qui présente les
                  // actions adaptées. Sinon (notifs purement informatives
                  // avec link direct), on suit le link.
                  const interactiveKinds = [
                    "GROUP_INVITED",
                    "SETTLEMENT_PROPOSED",
                    "SWAP_PROPOSED",
                    "DEBT_TRANSFER_PROPOSED",
                    "DEBT_TRANSFER_ACCEPTED",
                    "TONTINE_TURN_DUE",
                    "TONTINE_TURN_PROPOSAL",
                    "DEBT_PROPOSED",
                    "DEBT_DISPUTED",
                    "MEETING_READY",
                    "NOTIF_RESPONSE",
                  ];
                  if (interactiveKinds.includes(n.kind)) {
                    router.push(`/notifications/${n.id}`);
                  } else if (n.link) {
                    router.push(n.link);
                  } else {
                    // Notif sans link ni action → page détail générique
                    router.push(`/notifications/${n.id}`);
                  }
                }}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  accent = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        background: active
          ? accent
            ? "var(--v45-saffron-pale, rgba(232,163,61,0.20))"
            : "var(--paper-stronger, rgba(244,228,193,0.10))"
          : "transparent",
        border: active
          ? accent
            ? "1px solid var(--v45-saffron, var(--saffron))"
            : "1px solid var(--cocoa-line, rgba(244,228,193,0.20))"
          : "1px solid transparent",
        borderRadius: 999,
        color: active
          ? accent
            ? "var(--v45-saffron, var(--saffron))"
            : "var(--cocoa, var(--cream))"
          : "var(--cocoa-soft, var(--cream-soft))",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      {label}
      <span
        style={{
          fontSize: 11,
          opacity: 0.7,
        }}
      >
        ({count})
      </span>
    </button>
  );
}

function DesktopNotifRow({
  notif,
  onClick,
}: {
  notif: Notif;
  onClick: () => void;
}) {
  const isUnread = !notif.readAt;
  return (
    <tr
      onClick={onClick}
      style={{
        borderBottom: "1px solid var(--cocoa-line, rgba(244,228,193,0.06))",
        cursor: "pointer",
        background: isUnread
          ? "var(--v45-saffron-pale, rgba(232,163,61,0.04))"
          : "transparent",
      }}
    >
      <td style={{ padding: "12px 12px", verticalAlign: "top", width: 110 }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 9px",
            background: "var(--paper, rgba(244,228,193,0.06))",
            border: "1px solid var(--cocoa-line, rgba(244,228,193,0.10))",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            color: "var(--cocoa-soft, var(--cream-soft))",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {notif.kind.replace(/_/g, " ").toLowerCase()}
        </span>
      </td>
      <td style={{ padding: "12px 12px", verticalAlign: "top" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: isUnread ? 700 : 500,
            color: "var(--cocoa, var(--cream))",
            marginBottom: 2,
          }}
        >
          {notif.title}
          {isUnread && (
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--v45-saffron, var(--saffron))",
                marginLeft: 8,
                verticalAlign: "middle",
              }}
            />
          )}
        </div>
        {notif.body && (
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, var(--cream-soft))",
              lineHeight: 1.4,
            }}
          >
            {notif.body}
          </div>
        )}
      </td>
      <td
        style={{
          padding: "12px 12px",
          verticalAlign: "top",
          textAlign: "right",
          fontSize: 11,
          color: "var(--cocoa-mute, var(--muted))",
          whiteSpace: "nowrap",
          width: 110,
        }}
      >
        {new Date(notif.createdAt).toLocaleString()}
      </td>
    </tr>
  );
}
