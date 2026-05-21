"use client";

/**
 * <MobileShell> · Coque "vraie app mobile native" (spec §8.5, maquette).
 *
 * Structure inspirée des apps bancaires / trading (Lydia, Wave, Revolut) :
 *  - Header sticky compact (logo + avatar + cloche notif)
 *  - Zone de contenu pleine hauteur scrollable
 *  - Bottom tab bar fixe avec 5 sections + FAB central « + »
 *  - Safe-area aware (notch iPhone, gesture bar Android)
 *
 * Ce composant ne sert QUE pour les vues mobiles (< 768px).
 * Il est utilisé par <ResponsiveShell> qui choisit entre Mobile et Desktop.
 *
 * UX dépouillée pour cible diaspora :
 *  - Boutons gros (≥ 48px tactile)
 *  - Police 14-16px (lisible mobile)
 *  - Couleurs Indigo/Safran de la maquette
 *  - Animation FAB pulse pour attirer l'attention
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, getToken, isUnauthorized } from "../api-client";
import { MobileNotificationCenter } from "./mobile-notification-center";
import { ThemeToggle } from "./theme-toggle";
import { useT } from "../i18n/app-strings";

interface NavItem {
  /** Chemin Next.js qu'on cherche à matcher */
  match: (pathname: string) => boolean;
  href: string;
  /** Clé i18n résolue dynamiquement via useT() — la nav suit la langue */
  labelKey:
    | "nav.dashboard"
    | "nav.groups"
    | "nav.stats"
    | "nav.profile";
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    match: (p) => p === "/dashboard" || p === "/",
    href: "/dashboard",
    labelKey: "nav.dashboard",
    icon: <NavIcon name="home" />,
  },
  {
    match: (p) => p.startsWith("/dashboard/groups"),
    href: "/dashboard",
    labelKey: "nav.groups",
    icon: <NavIcon name="groups" />,
  },
  {
    match: (p) => p.startsWith("/dashboard/stats"),
    href: "/dashboard/stats",
    labelKey: "nav.stats",
    icon: <NavIcon name="chart" />,
  },
  {
    match: (p) => p.startsWith("/dashboard/profile"),
    href: "/dashboard/profile",
    labelKey: "nav.profile",
    icon: <NavIcon name="user" />,
  },
];

interface Props {
  children: ReactNode;
  /** Texte affiché en haut (titre de la page) */
  title?: string;
  /** Bouton de retour (cache la nav avec le logo) */
  back?: { href: string; label?: string };
  /** Cache le bottom-nav (utile pour les pages plein-écran : OCR, login…) */
  hideBottomNav?: boolean;
  /** Cache le FAB central (si la page n'a pas d'action « + ») */
  hideFab?: boolean;
  /** Callback du FAB. Défaut : navigue vers création groupe */
  onFabClick?: () => void;
  /** Action droite du header (ex: bouton créer, partager) */
  headerRight?: ReactNode;
}

export function MobileShell({
  children,
  title,
  back,
  hideBottomNav,
  hideFab,
  onFabClick,
  headerRight,
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const t = useT();
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [me, setMe] = useState<{
    displayName: string;
    avatar: string | null;
  } | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((r) =>
        setMe({
          displayName: r.user.displayName,
          avatar: r.user.avatar,
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

  function handleFab() {
    if (onFabClick) onFabClick();
    else router.push("/dashboard");
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, var(--indigo) 0%, var(--night) 100%)",
        color: "var(--cream, #f4e4c1)",
        display: "flex",
        flexDirection: "column",
        // Safe area iOS notch + gesture bar
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* === Header sticky === */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background:
            "linear-gradient(180deg, rgba(14,11,20,0.95), rgba(14,11,20,0.75))",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(244,228,193,0.06)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 56,
        }}
      >
        {back ? (
          <Link
            href={back.href}
            aria-label={t("common.back")}
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              background: "rgba(244,228,193,0.06)",
              color: "var(--cream)",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          <Link
            href="/dashboard"
            aria-label={t("nav.dashboard")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              color: "var(--cream)",
              flexShrink: 0,
            }}
          >
            {/* Logo BMD */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bmd-logo.svg" alt="" width={32} height={32} />
          </Link>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {title ? (
            <h1
              style={{
                margin: 0,
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 20,
                fontWeight: 700,
                color: "var(--cream)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </h1>
          ) : (
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--cream)",
              }}
            >
              BMD
            </div>
          )}
        </div>

        {headerRight}

        {/* Bouton thème clair/sombre — petit, discret */}
        <ThemeToggle variant="ghost" size={36} />

        {/* Cloche notifications — ouvre le NotificationCenter en bottom sheet */}
        <button
          type="button"
          onClick={() => setNotifOpen(true)}
          aria-label={`Notifications${unread > 0 ? ` (${unread} non lues)` : ""}`}
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            background: "rgba(244,228,193,0.04)",
            border: "none",
            color: "var(--cream-soft)",
            position: "relative",
            cursor: "pointer",
            flexShrink: 0,
            fontFamily: "inherit",
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
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--terracotta, #b54732)",
                border: "2px solid #0E0B14",
              }}
            />
          )}
        </button>

        {/* Avatar profil */}
        <Link
          href="/dashboard/profile"
          aria-label={t("nav.profile")}
          style={{
            width: 36,
            height: 36,
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
            flexShrink: 0,
          }}
        >
          {me?.displayName?.charAt(0).toUpperCase() ?? "?"}
        </Link>
      </header>

      {/* === Contenu === */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: hideBottomNav ? 16 : 90,
        }}
      >
        {children}
      </main>

      {/* === Bottom tab bar + FAB === */}
      {!hideBottomNav && (
        <nav
          aria-label={t("nav.dashboard")}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            paddingBottom: "env(safe-area-inset-bottom)",
            background:
              "linear-gradient(0deg, rgba(14,11,20,0.97) 0%, rgba(22,17,30,0.92) 100%)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(244,228,193,0.08)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 80px 1fr 1fr",
              alignItems: "center",
              padding: "8px 12px 10px",
              maxWidth: 600,
              margin: "0 auto",
            }}
          >
            <BottomTab item={NAV_ITEMS[0]!} pathname={pathname} />
            <BottomTab item={NAV_ITEMS[1]!} pathname={pathname} />
            {/* FAB central */}
            {hideFab ? (
              <div />
            ) : (
              <button
                type="button"
                onClick={handleFab}
                aria-label={t("nav.create")}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  border: "none",
                  background:
                    "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                  color: "#16111E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow:
                    "0 8px 24px rgba(232,163,61,0.45), 0 2px 4px rgba(0,0,0,0.3)",
                  marginTop: -28,
                  marginInline: "auto",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
            <BottomTab item={NAV_ITEMS[2]!} pathname={pathname} />
            <BottomTab item={NAV_ITEMS[3]!} pathname={pathname} />
          </div>
        </nav>
      )}

      {/* Centre de notifications mobile (bottom sheet plein écran) */}
      <MobileNotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onUnreadChange={setUnread}
      />
    </div>
  );
}

function BottomTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const t = useT();
  // Résolution dynamique du label : suit la locale active via useLocale
  const label = t(item.labelKey);
  return (
    <Link
      href={item.href}
      prefetch
      aria-current={active ? "page" : undefined}
      aria-label={label}
      onTouchStart={() => {
        if (active) return; // pas de feedback si on tape la tab déjà active
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(8);
          } catch {
            /* ignore */
          }
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "6px 4px",
        textDecoration: "none",
        color: active ? "var(--saffron, #e8a33d)" : "var(--muted, #8a7b6b)",
        fontSize: 10,
        fontWeight: 600,
        WebkitTapHighlightColor: "transparent",
        // Feedback transition pour le changement d'onglet
        transition: "color 0.15s ease, transform 0.05s ease",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
        }}
      >
        {item.icon}
      </span>
      {label}
    </Link>
  );
}

function NavIcon({ name }: { name: "home" | "groups" | "chart" | "user" }) {
  const props = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "groups":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
        </svg>
      );
    case "user":
      return (
        <svg {...props}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
  }
}
