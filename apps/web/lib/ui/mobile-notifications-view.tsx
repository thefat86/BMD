"use client";

/**
 * V52.I1 — <MobileNotificationsView /> · Page notifications mobile-native.
 *
 * Vue 100% mobile (cards plein écran + bottom sheet actions), branchée
 * via early-return isMobile dans /dashboard/notifications. La vue desktop
 * reste dans la page (layout 2-col plus dense, banking-style).
 *
 * Layout mobile :
 *  - Header compteur "X non lues" + CTA "Tout marquer lu"
 *  - Buckets jour ("Aujourd'hui", "Hier", "Cette semaine", "Plus ancien")
 *  - Cards 14px radius, icône 36px, body 2 lignes max, temps relatif
 *  - Tap card → mark read + navigate (si link) OU ouvre action sheet
 *  - Kebab ⋯ → action sheet (mark lu/non lu, supprimer)
 *  - Empty state pleine page avec illustration
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../api-client";
import { useT } from "../i18n/app-strings";
import { BottomSheet } from "./bottom-sheet";

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

function NotifIcon({ kind }: { kind: string }) {
  const paths: Record<string, React.ReactNode> = {
    expense: (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    ),
    settlement: (
      <>
        <path d="M3 12h13M13 9l3 3-3 3M21 5v14" />
      </>
    ),
    invite: (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </>
    ),
    tontine: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8M12 8v8" />
      </>
    ),
    security: (
      <>
        <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    default: (
      <>
        <path d="M6 8a6 6 0 0112 0v5l1.5 3h-15L6 13V8z" />
        <path d="M10 19a2 2 0 004 0" />
      </>
    ),
  };
  const k = kind.toLowerCase();
  let node = paths.default;
  if (k.includes("expense") || k.includes("dépense")) node = paths.expense;
  else if (k.includes("settle") || k.includes("payment")) node = paths.settlement;
  else if (k.includes("invite") || k.includes("member")) node = paths.invite;
  else if (k.includes("tontine") || k.includes("contribution")) node = paths.tontine;
  else if (k.includes("security") || k.includes("login") || k.includes("session")) node = paths.security;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {node}
    </svg>
  );
}

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = (now - then) / 1000;
    if (diff < 60) return "à l'instant";
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} j`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

function dayBucket(iso: string): "today" | "yesterday" | "week" | "older" {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  if (d >= today) return "today";
  if (d >= yesterday) return "yesterday";
  if (d >= weekAgo) return "week";
  return "older";
}

const BUCKET_LABEL: Record<string, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  week: "Cette semaine",
  older: "Plus ancien",
};

export function MobileNotificationsView() {
  const router = useRouter();
  const t = useT();
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<Notif | null>(null);

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

  const buckets = useMemo(() => {
    if (!notifs) return null;
    const grouped: Record<string, Notif[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };
    for (const n of notifs) {
      grouped[dayBucket(n.createdAt)]?.push(n);
    }
    return grouped;
  }, [notifs]);

  const unreadCount = useMemo(
    () => (notifs ? notifs.filter((n) => !n.readAt).length : 0),
    [notifs],
  );

  return (
    <div style={{ padding: "0 16px 24px", maxWidth: "100%" }}>
      {notifs && notifs.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, var(--cream-soft))",
            }}
          >
            {unreadCount > 0 ? (
              <>
                <strong style={{ color: "var(--v45-saffron, var(--saffron))" }}>
                  {unreadCount}
                </strong>{" "}
                non lue{unreadCount > 1 ? "s" : ""} · {notifs.length} au total
              </>
            ) : (
              <>
                {notifs.length} notification{notifs.length > 1 ? "s" : ""}
              </>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              style={{
                padding: "8px 14px",
                background: "var(--paper, rgba(244,228,193,0.04))",
                border: "1px solid var(--cocoa-line, rgba(244,228,193,0.10))",
                borderRadius: 999,
                color: "var(--cocoa-soft, var(--cream-soft))",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                touchAction: "manipulation",
                minHeight: 32,
              }}
            >
              Tout marquer lu
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 12,
            color: "var(--v45-terracotta, #FFB89A)",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {notifs === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 72,
                background: "var(--paper, rgba(244,228,193,0.04))",
                border:
                  "1px solid var(--cocoa-line, rgba(244,228,193,0.06))",
                borderRadius: 14,
                opacity: 0.7,
                animation: `bmd-notif-skel 1.2s ease-in-out ${i * 0.08}s infinite`,
              }}
            />
          ))}
          <style jsx>{`
            @keyframes bmd-notif-skel {
              0%,
              100% {
                opacity: 0.5;
              }
              50% {
                opacity: 0.9;
              }
            }
          `}</style>
        </div>
      ) : notifs.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {(["today", "yesterday", "week", "older"] as const).map((b) => {
            const items = buckets?.[b] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={b} style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.6,
                    textTransform: "uppercase",
                    color: "var(--cocoa-mute, var(--muted))",
                    fontWeight: 700,
                    margin: "0 0 8px 2px",
                  }}
                >
                  {BUCKET_LABEL[b]}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {items.map((n) => (
                    <NotifCard
                      key={n.id}
                      notif={n}
                      onClick={() => {
                        if (!n.link) {
                          setActionTarget(n);
                          return;
                        }
                        if (!n.readAt) {
                          setNotifs((cur) =>
                            cur
                              ? cur.map((x) =>
                                  x.id === n.id
                                    ? {
                                        ...x,
                                        readAt: new Date().toISOString(),
                                      }
                                    : x,
                                )
                              : cur,
                          );
                          api.markNotificationRead(n.id).catch(() => {});
                        }
                        router.push(n.link);
                      }}
                      onMore={() => setActionTarget(n)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {actionTarget && (
        <BottomSheet
          open
          onClose={() => setActionTarget(null)}
          title={t("notif.actions") || "Actions"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* V98 — "Voir le détail" pointe maintenant sur la page
                générique de détail/action /notifications/[id] qui propose
                les actions adaptées au kind + réactions emoji + réponse
                texte. Le lien original reste accessible via la 2e action
                ci-dessous (« Ouvrir le contexte »). */}
            <ActionRow
              label={t("common.viewDetail") || "Voir le détail"}
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              }
              onClick={() => {
                const notifId = actionTarget.id;
                setActionTarget(null);
                router.push(`/notifications/${notifId}`);
              }}
            />
            {actionTarget.link && (
              <ActionRow
                label="Ouvrir le contexte"
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 3h7v7M10 14L21 3M21 14v7H3V3h7" />
                  </svg>
                }
                onClick={() => {
                  const link = actionTarget.link!;
                  if (!actionTarget.readAt) {
                    api.markNotificationRead(actionTarget.id).catch(() => {});
                  }
                  setActionTarget(null);
                  router.push(link);
                }}
              />
            )}
            {actionTarget.readAt ? (
              <ActionRow
                label="Marquer comme non lue"
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M3 5h18M3 19h18" />
                  </svg>
                }
                onClick={async () => {
                  const id = actionTarget.id;
                  setNotifs((cur) =>
                    cur
                      ? cur.map((x) =>
                          x.id === id ? { ...x, readAt: null } : x,
                        )
                      : cur,
                  );
                  setActionTarget(null);
                  try {
                    await api.markNotificationUnread(id);
                  } catch {
                    /* silent */
                  }
                }}
              />
            ) : (
              <ActionRow
                label="Marquer comme lue"
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                }
                onClick={async () => {
                  const id = actionTarget.id;
                  setNotifs((cur) =>
                    cur
                      ? cur.map((x) =>
                          x.id === id
                            ? {
                                ...x,
                                readAt: new Date().toISOString(),
                              }
                            : x,
                        )
                      : cur,
                  );
                  setActionTarget(null);
                  try {
                    await api.markNotificationRead(id);
                  } catch {
                    /* silent */
                  }
                }}
              />
            )}
            <ActionRow
              label="Supprimer"
              destructive
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
                </svg>
              }
              onClick={async () => {
                const id = actionTarget.id;
                setNotifs((cur) =>
                  cur ? cur.filter((x) => x.id !== id) : cur,
                );
                setActionTarget(null);
                try {
                  await api.deleteNotification(id);
                } catch {
                  api
                    .listNotifications(false, 100)
                    .then(setNotifs)
                    .catch(() => {});
                }
              }}
            />
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function ActionRow({
  label,
  icon,
  onClick,
  destructive = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "14px 8px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--cocoa-line, rgba(244,228,193,0.06))",
        color: destructive
          ? "var(--v45-terracotta, #FFB89A)"
          : "var(--cocoa, var(--cream))",
        fontSize: 14,
        fontWeight: 600,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        touchAction: "manipulation",
        minHeight: 48,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: destructive
            ? "var(--v45-terracotta, #FFB89A)"
            : "var(--v45-saffron, var(--saffron))",
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

function NotifCard({
  notif,
  onClick,
  onMore,
}: {
  notif: Notif;
  onClick: () => void;
  onMore: () => void;
}) {
  const isUnread = !notif.readAt;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        background: isUnread
          ? "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(197,138,46,0.02))"
          : "var(--paper, rgba(244,228,193,0.03))",
        border: isUnread
          ? "1px solid var(--v45-saffron-pale, rgba(232,163,61,0.25))"
          : "1px solid var(--cocoa-line, rgba(244,228,193,0.08))",
        borderRadius: 14,
        color: "var(--cocoa, var(--cream))",
        textAlign: "left",
        fontFamily: "inherit",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        width: "100%",
        minHeight: 64,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: isUnread
            ? "var(--v45-saffron-pale, rgba(232,163,61,0.22))"
            : "var(--paper, rgba(244,228,193,0.06))",
          border: isUnread
            ? "1px solid var(--v45-saffron-pale, rgba(232,163,61,0.35))"
            : "1px solid var(--cocoa-line, rgba(244,228,193,0.10))",
          color: isUnread
            ? "var(--v45-saffron, var(--saffron))"
            : "var(--cocoa-soft, var(--cream-soft))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <NotifIcon kind={notif.kind} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: isUnread ? 700 : 600,
              color: "var(--cocoa, var(--cream))",
              overflowWrap: "anywhere",
            }}
          >
            {notif.title}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--cocoa-mute, var(--muted))",
              flexShrink: 0,
              letterSpacing: 0.3,
            }}
          >
            {relativeTime(notif.createdAt)}
          </div>
        </div>
        {notif.body && (
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, var(--cream-soft))",
              marginTop: 3,
              lineHeight: 1.45,
              overflowWrap: "anywhere",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {notif.body}
          </div>
        )}
      </div>
      <span
        role="button"
        aria-label="Actions"
        onClick={(e) => {
          e.stopPropagation();
          onMore();
        }}
        style={{
          color: "var(--cocoa-soft, var(--cream-soft))",
          fontSize: 18,
          flexShrink: 0,
          padding: "4px 6px",
          marginTop: 2,
          opacity: 0.7,
          touchAction: "manipulation",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "60px 24px",
        textAlign: "center",
        color: "var(--cocoa-soft, var(--cream-soft))",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          margin: "0 auto 18px",
          borderRadius: 22,
          background:
            "linear-gradient(135deg, var(--v45-saffron-pale, rgba(232,163,61,0.18)), rgba(181,70,46,0.05))",
          border: "1px solid var(--v45-saffron-pale, rgba(232,163,61,0.25))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--v45-saffron, var(--saffron))",
        }}
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0112 0v5l1.5 3h-15L6 13V8z" />
          <path d="M10 19a2 2 0 004 0" />
        </svg>
      </div>
      <h3
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          margin: "0 0 8px",
          color: "var(--cocoa, var(--cream))",
        }}
      >
        Aucune notification
      </h3>
      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
        Tu seras notifié des nouvelles dépenses, des invitations, des
        contributions tontine et des alertes de sécurité.
      </p>
    </div>
  );
}
