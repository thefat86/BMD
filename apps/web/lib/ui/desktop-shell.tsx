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
        href: "/dashboard/groups",
        label: "Mes groupes",
        icon: "👥",
        match: (p) =>
          p.startsWith("/dashboard/groups") &&
          !p.includes("/tontine") &&
          !p.includes("/print"),
      },
      {
        href: "/dashboard/debts",
        label: "Reconnaissances",
        icon: "📜",
        match: (p) => p.startsWith("/dashboard/debts"),
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
          href: "/dashboard/groups",
          label: t("nav.groups"),
          icon: "👥",
          match: (p) =>
            p.startsWith("/dashboard/groups") &&
            !p.includes("/tontine") &&
            !p.includes("/print"),
        },
        {
          href: "/dashboard/debts",
          label: t("nav.debts"),
          icon: "📜",
          match: (p) => p.startsWith("/dashboard/debts"),
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
    /** V164 — Statut ambassadeur / commercial agréé */
    isAmbassador?: boolean;
    isCommercialAgreed?: boolean;
  } | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!getToken()) return;
    // V164 — On récupère aussi le statut ambassadeur via l'endpoint dédié
    Promise.all([
      api.me().catch(() => null),
      api.getAmbassadorStatus().catch(() => null),
    ])
      .then(([meRes, ambRes]) => {
        if (!meRes) return;
        setMe({
          displayName: meRes.user.displayName,
          avatar: meRes.user.avatar,
          isSuperAdmin: meRes.user.isSuperAdmin,
          isAmbassador: ambRes?.isAmbassador ?? false,
          isCommercialAgreed: ambRes?.isCommercialAgreed ?? false,
        });
      })
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

  // V174.C — Le lien "Espace commercial" n'est visible QUE pour les ambassadeurs
  // ou commerciaux agréés (parité avec mobile-dashboard.tsx, bloc V164
  // "Espace commercial en queue, conditionnel"). Pour tous les autres users,
  // on filtre complètement l'entrée /dashboard/affiliate.
  const isCommercialUser = !!(me?.isAmbassador || me?.isCommercialAgreed);
  for (const section of SIDEBAR_SECTIONS_TRANSLATED) {
    if (isCommercialUser) {
      section.items = section.items.map((it) =>
        it.href === "/dashboard/affiliate"
          ? {
              ...it,
              href: "/dashboard/commercial",
              label: me?.isCommercialAgreed
                ? t("nav.commercialAgreed") || "Espace commercial"
                : t("nav.ambassador") || "Espace ambassadeur",
              icon: me?.isCommercialAgreed ? "💼" : "🤝",
              match: (p) => p.startsWith("/dashboard/commercial"),
            }
          : it,
      );
    } else {
      section.items = section.items.filter(
        (it) => it.href !== "/dashboard/affiliate",
      );
    }
  }

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
          // V164 — Module Commercial : ambassadeurs + commerciaux + commission
          href: "/admin/commercials",
          label: t("desktop.adminCommercials") || "Commerciaux",
          icon: "💼",
          match: (p) => p.startsWith("/admin/commercials"),
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

  // V103 — DesktopShell V45-light : fond ivory chaud, sidebar paper, texte
  // cocoa, accents saffron. Aligne le shell desktop avec la palette V45 du
  // reste de l'app (avant : gradient indigo→night avec texte cream, source
  // principale des "écrans noirs" perçus sur la version web).
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        background:
          "linear-gradient(180deg, var(--ivory, #FBF6EC) 0%, #F4ECD8 100%)",
        color: "var(--cocoa, #2B1F15)",
      }}
    >
      {/* === Sidebar gauche === */}
      <aside
        style={{
          background: "var(--paper, #FFFFFF)",
          borderRight: "1px solid rgba(43,31,21,0.08)",
          padding: "24px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          position: "sticky",
          top: 0,
          height: "100dvh",
          overflowY: "auto",
          boxShadow: "1px 0 2px rgba(43,31,21,0.03)",
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
            color: "var(--cocoa, #2B1F15)",
            marginBottom: 14,
          }}
        >
          {/* V181 — fetchPriority + decoding async pour optimiser le LCP du logo sidebar (toujours visible au mount desktop). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bmd-logo.svg"
            alt=""
            width={32}
            height={32}
            decoding="async"
            // React 19+ supporte officiellement fetchPriority en camelCase.
            // Avant cette version, on utilisait l'attribut HTML lowercase
            // (`fetchpriority`) avec un @ts-expect-error — désormais inutile.
            fetchPriority="high"
          />
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
                color: "var(--cocoa-soft, #6B5A47)",
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
                  color: "var(--cocoa-soft, #6B5A47)",
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
              border: "1px solid rgba(43,31,21,0.10)",
              color: "var(--cocoa-soft, #6B5A47)",
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
        {/* Header — V45-light : bordure cocoa pâle, titre cocoa */}
        {(title || breadcrumb || primaryAction) && (
          <header
            style={{
              padding: "24px 32px 18px",
              borderBottom: "1px solid rgba(43,31,21,0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 24,
              background: "var(--paper, #FFFFFF)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {breadcrumb && (
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 2,
                    color: "var(--v45-saffron, #C58A2E)",
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
                    color: "var(--cocoa, #2B1F15)",
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
                    color: "var(--cocoa-soft, #6B5A47)",
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
              {/* Cloche notifications — V160 : pointe vers la vraie page
                  notifications (avant : /dashboard/profile, bug critique). */}
              <Link
                href="/dashboard/notifications"
                aria-label="Notifications"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "var(--ivory, #FBF6EC)",
                  border: "1px solid rgba(43,31,21,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--cocoa-soft, #6B5A47)",
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
                      background: "var(--v45-terracotta, #9F4628)",
                      border: "2px solid var(--paper, #FFFFFF)",
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
            // V79 — Anti scroll lateral : clip tout débordement horizontal
            // peu importe ce que les enfants font (carousel, table large, etc.).
            // `clip` n'affecte pas `position: sticky` (contrairement à hidden).
            overflowX: "clip" as any,
            minWidth: 0, // permet au flex item de rétrécir sous son contenu
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
  // V103 — SidebarLink V45-light : actif saffron solide sur fond saffron-pale,
  // inactif cocoa-soft. Plus de cream-soft sur fond paper (invisible).
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
        color: active
          ? "var(--v45-saffron, #C58A2E)"
          : "var(--cocoa-soft, #6B5A47)",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        marginBottom: 2,
        textDecoration: "none",
        background: active
          ? "linear-gradient(135deg, rgba(197,138,46,0.14), rgba(232,201,136,0.10))"
          : "transparent",
        border: active
          ? "1px solid rgba(197,138,46,0.30)"
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
            background: "rgba(197,138,46,0.18)",
            color: "var(--v45-saffron, #C58A2E)",
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
