"use client";

/**
 * <DesktopShell> · Coque "vrai portail web" (spec §8, maquette portail).
 *
 * Structure inspirée des portails clients pro (Wise, Revolut Business) :
 *  - Sidebar gauche fixe (240px) avec navigation par sections + sous-items
 *  - Header haut (breadcrumb + actions principales + avatar)
 *  - Zone de contenu pleine largeur (max 1280px centré, padding 28-32px)
 *  - Pas de bottom nav (la sidebar suffit)
 *
 * Ce composant ne sert QUE pour les vues desktop (≥ 768px).
 * Il est utilisé par <ResponsiveShell> qui choisit entre Mobile et Desktop.
 *
 * Différences clés avec le mobile :
 *  - Sidebar persistante (pas de hamburger menu)
 *  - Police 13-14px (densité d'info plus élevée)
 *  - Multi-colonne (panels juxtaposés)
 *  - Pas de FAB, mais bouton "+ Nouveau" dans le header
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, getToken, isUnauthorized, clearToken } from "../api-client";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { ThemeToggle } from "./theme-toggle";

interface SidebarSection {
  /** Label de la section (ex: "Mes finances"). null = pas de header. */
  title: string | null;
  items: SidebarItem[];
}

interface SidebarItem {
  href: string;
  label: string;
  icon: string;
  match: (pathname: string) => boolean;
  /** Badge numérique optionnel (ex: notif non lues) */
  badge?: number;
}

const SIDEBAR_SECTIONS_STATIC: ReadonlyArray<SidebarSection> = [
  {
    title: null,
    items: [
      {
        href: "/dashboard",
        label: "Tableau de bord",
        icon: "🏠",
        match: (p) => p === "/dashboard" || p === "/",
      },
    ],
  },
  {
    title: "Mes finances",
    items: [
      {
        href: "/dashboard",
        label: "Mes groupes",
        icon: "👥",
        match: (p) =>
          p.startsWith("/dashboard/groups") &&
          !p.includes("/tontine") &&
          !p.includes("/print"),
      },
      {
        href: "/dashboard/stats",
        label: "Statistiques",
        icon: "📊",
        match: (p) => p.startsWith("/dashboard/stats"),
      },
    ],
  },
  {
    title: "Mon compte",
    items: [
      {
        href: "/dashboard/profile",
        label: "Mon profil",
        icon: "👤",
        match: (p) => p === "/dashboard/profile",
      },
      {
        href: "/dashboard/plans",
        label: "Mon forfait",
        icon: "✨",
        match: (p) => p.startsWith("/dashboard/plans"),
      },
      {
        href: "/dashboard/affiliate",
        label: "Espace commercial",
        icon: "🤝",
        match: (p) => p.startsWith("/dashboard/affiliate"),
      },
    ],
  },
];

interface Props {
  children: ReactNode;
  /** Breadcrumb (ex: "Tableau de bord", "Coloc Pigalle > Tontine") */
  breadcrumb?: string;
  /** Titre principal de la page */
  title?: string;
  /** Sous-titre (description courte) */
  subtitle?: string;
  /** Action en haut à droite (bouton primaire) */
  primaryAction?: ReactNode;
}

export function DesktopShell({
  children,
  breadcrumb,
  title,
  subtitle,
  primaryAction,
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const dialog = useDialog();
  const t = useT();

  // Sections de navigation traduites — recalculées à chaque changement
  // de locale (le hook useT consomme useLocale et déclenche un re-render).
  const SIDEBAR_SECTIONS_TRANSLATED: SidebarSection[] = [
    {
      title: null,
      items: [
        {
          href: "/dashboard",
          label: t("nav.dashboard"),
          icon: "🏠",
          match: (p) => p === "/dashboard" || p === "/",
        },
      ],
    },
    {
      title: t("nav.groups"),
      items: [
        {
          href: "/dashboard",
          label: t("nav.groups"),
          icon: "👥",
          match: (p) =>
            p.startsWith("/dashboard/groups") &&
            !p.includes("/tontine") &&
            !p.includes("/print"),
        },
        {
          href: "/dashboard/stats",
          label: t("nav.stats"),
          icon: "📊",
          match: (p) => p.startsWith("/dashboard/stats"),
        },
      ],
    },
    {
      title: t("profile.title"),
      items: [
        {
          href: "/dashboard/profile",
          label: t("nav.profile"),
          icon: "👤",
          match: (p) => p === "/dashboard/profile",
        },
        {
          href: "/dashboard/plans",
          label: t("nav.plans"),
          icon: "✨",
          match: (p) => p.startsWith("/dashboard/plans"),
        },
        {
          href: "/dashboard/affiliate",
          label: t("nav.affiliate"),
          icon: "🤝",
          match: (p) => p.startsWith("/dashboard/affiliate"),
        },
      ],
    },
  ];
  const [me, setMe] = useState<{
    displayName: string;
    avatar: string | null;
    isSuperAdmin?: boolean;
  } | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((r) =>
        setMe({
          displayName: r.user.displayName,
          avatar: r.user.avatar,
          isSuperAdmin: r.user.isSuperAdmin,
        }),
      )
      .catch((e) => {
        if (isUnauthorized(e)) router.replace("/login");
      });
    api
      .unreadNotificationsCount()
      .then((r) => setUnread(r.count))
      .catch(() => {
        /* ignore */
      });
  }, [router]);

  // Sections dynamiques : ajoute admin si super admin
  const sections: SidebarSection[] = [...SIDEBAR_SECTIONS_TRANSLATED];
  if (me?.isSuperAdmin) {
    sections.push({
      title: t("desktop.adminTitle"),
      items: [
        {
          href: "/admin",
          label: t("desktop.adminConsole"),
          icon: "🛡️",
          match: (p) => p === "/admin",
        },
        {
          href: "/admin/cms",
          label: t("desktop.adminCms"),
          icon: "📝",
          match: (p) => p.startsWith("/admin/cms"),
        },
        {
          href: "/admin/translations",
          label: t("desktop.adminTranslations"),
          icon: "🌍",
          match: (p) => p.startsWith("/admin/translations"),
        },
        {
          href: "/admin/audit-log",
          label: t("desktop.adminAuditLog"),
          icon: "📜",
          match: (p) => p.startsWith("/admin/audit-log"),
        },
        {
          href: "/admin/sim-swap",
          label: t("desktop.adminSecurity"),
          icon: "🛡️",
          match: (p) => p.startsWith("/admin/sim-swap"),
        },
      ],
    });
  }

  /**
   * Déconnexion façon app bancaire — confirmation avant action.
   * Évite les déconnexions accidentelles (un click sur le bouton et
   * c'est terminé) et incite l'utilisateur à valider.
   */
  async function handleLogout() {
    const ok = await dialog.confirm(t("desktop.logoutConfirm"), {
      variant: "warning",
      title: t("desktop.logoutTitle"),
      confirmLabel: t("desktop.logoutConfirmBtn"),
      cancelLabel: t("desktop.logoutCancelBtn"),
    });
    if (!ok) return;
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    clearToken();
    router.replace("/login");
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        background:
          "linear-gradient(180deg, var(--indigo) 0%, var(--night) 100%)",
        color: "var(--cream, #f4e4c1)",
      }}
    >
      {/* === Sidebar gauche === */}
      <aside
        style={{
          background: "rgba(14,11,20,0.6)",
          borderRight: "1px solid rgba(244,228,193,0.06)",
          padding: "24px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          position: "sticky",
          top: 0,
          height: "100dvh",
          overflowY: "auto",
        }}
      >
        {/* Logo + nom */}
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            textDecoration: "none",
            color: "var(--cream)",
            marginBottom: 14,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bmd-logo.svg" alt="" width={32} height={32} />
          <div>
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              BMD
            </div>
            <div
              style={{
                fontSize: 9,
                color: "var(--muted, #8a7b6b)",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Back Mes Do
            </div>
          </div>
        </Link>

        {/* Sections */}
        {sections.map((section, i) => (
          <div key={i} style={{ marginTop: 6 }}>
            {section.title && (
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  color: "var(--muted, #8a7b6b)",
                  textTransform: "uppercase",
                  padding: "10px 12px 6px",
                  fontWeight: 700,
                }}
              >
                {section.title}
              </div>
            )}
            {section.items.map((item) => (
              <SidebarLink key={item.href + item.label} item={item} pathname={pathname} />
            ))}
          </div>
        ))}

        {/* Footer sidebar : thème + déconnexion */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* V13 : ThemeToggle désactivé — voir theme-toggle.tsx pour le rationale */}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid rgba(244,228,193,0.08)",
              color: "var(--cream-soft, #d4c4a8)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span>🚪</span> {t("desktop.logout")}
          </button>
        </div>
      </aside>

      {/* === Zone principale === */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Header */}
        {(title || breadcrumb || primaryAction) && (
          <header
            style={{
              padding: "24px 32px 18px",
              borderBottom: "1px solid rgba(244,228,193,0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 24,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {breadcrumb && (
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 2,
                    color: "var(--saffron, #e8a33d)",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  {breadcrumb}
                </div>
              )}
              {title && (
                <h1
                  style={{
                    margin: 0,
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 30,
                    fontWeight: 600,
                    color: "var(--cream)",
                    lineHeight: 1.2,
                  }}
                >
                  {title}
                </h1>
              )}
              {subtitle && (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--cream-soft, #d4c4a8)",
                    margin: "4px 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              {primaryAction}
              {/* Bouton thème clair / sombre */}
              <ThemeToggle variant="ghost" size={38} />
              {/* Cloche notifications */}
              <Link
                href="/dashboard/profile"
                aria-label="Notifications"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "rgba(244,228,193,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--cream-soft)",
                  position: "relative",
                  textDecoration: "none",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {unread > 0 && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      background: "var(--terracotta, #b54732)",
                      border: "2px solid #0E0B14",
                      color: "white",
                      fontSize: 9,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                    }}
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              {/* Avatar */}
              <Link
                href="/dashboard/profile"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#16111E",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                {me?.displayName?.charAt(0).toUpperCase() ?? "?"}
              </Link>
            </div>
          </header>
        )}

        <main
          style={{
            padding: "28px 32px",
            maxWidth: 1280,
            width: "100%",
            margin: "0 auto",
            flex: 1,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  pathname,
}: {
  item: SidebarItem;
  pathname: string;
}) {
  const active = item.match(pathname);
  return (
    <Link
      href={item.href}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: active ? "var(--saffron, #e8a33d)" : "var(--cream-soft, #d4c4a8)",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        marginBottom: 2,
        textDecoration: "none",
        background: active
          ? "linear-gradient(135deg, rgba(232,163,61,0.15), rgba(181,70,46,0.08))"
          : "transparent",
        border: active
          ? "1px solid rgba(232,163,61,0.25)"
          : "1px solid transparent",
        transition: "all 0.15s",
      }}
      aria-current={active ? "page" : undefined}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        {item.icon}
      </span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge ? (
        <span
          style={{
            background: "rgba(232,163,61,0.15)",
            color: "var(--saffron)",
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
