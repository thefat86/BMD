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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { api, getToken, isUnauthorized } from "../api-client";
import { MobileNotificationCenter } from "./mobile-notification-center";
import { ThemeToggle } from "./theme-toggle";
import { useT } from "../i18n/app-strings";

// V41.3 — Game changer : Quick Add Expense (voice/scan). Lazy-load car
// contient OCR Tesseract (~120 KB) + Web Speech parser.
const MobileQuickAddSheet = dynamic(
  () =>
    import("./mobile-quick-add-sheet").then((m) => ({
      default: m.MobileQuickAddSheet,
    })),
  { ssr: false },
);

interface NavItem {
  /** Chemin Next.js qu'on cherche à matcher */
  match: (pathname: string) => boolean;
  href: string;
  /** Clé i18n résolue dynamiquement via useT() — la nav suit la langue */
  labelKey:
    | "nav.short.home"
    | "nav.short.groups"
    | "nav.short.stats"
    | "nav.profile"
    | "nav.short.search"
    | "nav.short.debts";
  icon: ReactNode;
}

// V148 — Refonte de l'ordre : Home · Groupes · [FAB] · Reconnaissances · Stats.
// Le bouton Recherche a été retiré (intégré dans le header de chaque page).
// "Reconnaissances de dette" remplace l'ancienne tile, et "Statistiques" reste
// en dernière position. L'ordre du grid : NAV_ITEMS[0] = Home, [1] = Groupes,
// [FAB centre], [2] = Reconnaissances, [3] = Stats.
const NAV_ITEMS: NavItem[] = [
  {
    match: (p) => p === "/dashboard" || p === "/",
    href: "/dashboard",
    labelKey: "nav.short.home",
    icon: <NavIcon name="home" />,
  },
  {
    match: (p) => p.startsWith("/dashboard/groups"),
    href: "/dashboard/groups",
    labelKey: "nav.short.groups",
    icon: <NavIcon name="groups" />,
  },
  {
    // V148 — Nouvelle entrée Reconnaissances de dette (RDD).
    // Match aussi /dashboard/debts/[id] et /dashboard/debts/new.
    match: (p) => p.startsWith("/dashboard/debts"),
    href: "/dashboard/debts",
    labelKey: "nav.short.debts",
    icon: <NavIcon name="contract" />,
  },
  {
    match: (p) => p.startsWith("/dashboard/stats"),
    href: "/dashboard/stats",
    labelKey: "nav.short.stats",
    icon: <NavIcon name="chart" />,
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
  /** V69 — Cache le header (utilisé sur la page profil pour immersion totale) */
  hideHeader?: boolean;
  /** Cache le FAB central (si la page n'a pas d'action « + ») */
  hideFab?: boolean;
  /** Callback du FAB. Défaut : navigue vers création groupe */
  onFabClick?: () => void;
  /** Action droite du header (ex: bouton créer, partager) */
  headerRight?: ReactNode;
  /** V76 — Si true, le scroll se fait sur <body> au lieu du <main>. */
  bodyScroll?: boolean;
}

export function MobileShell({
  children,
  title,
  back,
  hideBottomNav,
  hideHeader,
  hideFab,
  onFabClick,
  headerRight,
  bodyScroll,
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
  /** Photo de profil stockée en localStorage (MVP — pas encore synchronisée
   *  serveur). Modifiable depuis /dashboard/profile via la tile Identité. */
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((r) => {
        setMe({
          displayName: r.user.displayName,
          avatar: r.user.avatar,
        });
        // V37 — Si le serveur a un avatar synced, on l'utilise comme source
        // de vérité pour l'avatar header (override du localStorage si différent).
        if (r.user.avatar) {
          setLocalPhoto(r.user.avatar);
          try {
            window.localStorage.setItem(
              "bmd_profile_photo_v1",
              r.user.avatar,
            );
          } catch {
            /* quota — pas grave */
          }
        } else {
          // V178.A — Le serveur dit explicitement "pas de photo".
          // On purge le localStorage stale (qui pourrait contenir la
          // photo d'un autre user ayant utilisé ce browser avant) et
          // on remet le state à null. Sinon, fresh signup affiche la
          // photo d'un précédent compte → bug rapporté Fabrice.
          setLocalPhoto(null);
          try {
            window.localStorage.removeItem("bmd_profile_photo_v1");
          } catch {
            /* ignore */
          }
        }
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
    // Lecture initiale photo locale
    try {
      const p = window.localStorage.getItem("bmd_profile_photo_v1");
      if (p) setLocalPhoto(p);
    } catch {
      /* ignore */
    }
    // On écoute les events `storage` (multi-tab) ET `bmd:profile-photo`
    // (custom event émis quand l'user change sa photo dans la même session)
    function onStorage(e: StorageEvent) {
      if (e.key === "bmd_profile_photo_v1") {
        setLocalPhoto(e.newValue);
      }
    }
    function onCustom() {
      try {
        const p = window.localStorage.getItem("bmd_profile_photo_v1");
        setLocalPhoto(p ?? null);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("bmd:profile-photo", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("bmd:profile-photo", onCustom);
    };
  }, [router]);

  // V41.3 — Quick Add Sheet (game-changer voice/scan). Si `onFabClick` est
  // fourni par la page parent, on lui laisse la priorité (override). Sinon
  // on ouvre le quick-add par défaut.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  function handleFab() {
    if (onFabClick) {
      onFabClick();
      return;
    }
    setQuickAddOpen(true);
  }

  // V76 — Mode bodyScroll : on ne crée PAS de scroller interne sur <main>.
  // Le <body> scrolle naturellement, ce qui rend les éléments position:fixed
  // strictement viewport-relative (fini le jitter iOS Safari sur le hero).
  // On le déclenche aussi côté CSS via une classe sur <html>/<body> pour
  // éviter qu'un overflow hidden global du shell parent bloque le scroll.
  useEffect(() => {
    if (!bodyScroll) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.minHeight;
    html.style.overflow = "auto";
    body.style.overflow = "visible";
    body.style.minHeight = "100dvh";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.minHeight = prevBodyHeight;
    };
  }, [bodyScroll]);

  return (
    <div
      style={{
        // V76 — En bodyScroll, on ne force PAS minHeight 100dvh sur le wrapper
        // pour que le <body> soit le scroller. En mode classique, on garde
        // la hauteur écran pour que le <main> overflowY:auto soit borné.
        minHeight: bodyScroll ? undefined : "100dvh",
        background:
          "linear-gradient(180deg, var(--indigo) 0%, var(--night) 100%)",
        color: "var(--cream, #f4e4c1)",
        display: "flex",
        flexDirection: "column",
        // V55 — Plus de paddingTop wrapper : le safe-area-inset-top notch
        // est désormais ABSORBÉ par le header lui-même (paddingTop ci-dessous).
        // Avant : 47px de "ligne vide" entre notch et header → fini.
        paddingBottom: "env(safe-area-inset-bottom)",
        // V79 — Anti-scroll lateral : le wrapper shell coupe tout débordement
        // horizontal de ses enfants. Combiné au clip du <main>, à celui du
        // <body>, et à width: 100% partout, garantit l'absence de scroll X.
        overflowX: "clip" as any,
        width: "100%",
        maxWidth: "100vw",
      }}
    >
      {/* === Header V69 : fixed top, insensible au scroll, masquable === */}
      {hideHeader ? null : (
      <header
        style={{
          // V69 — position fixed au lieu de sticky : insensible au scroll
          // peu importe le contexte de scroll (body, main, document).
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background:
            "linear-gradient(180deg, rgba(14,11,20,0.95), rgba(14,11,20,0.75))",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(244,228,193,0.06)",
          padding: "calc(12px + env(safe-area-inset-top)) 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 56,
        }}
      >
        {back ? (
          <Suspense fallback={null}>
            <SmartBackButton fallbackHref={back.href} label={t("common.back")} />
          </Suspense>
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
            {/* V181 — fetchPriority + decoding async pour optimiser le LCP du logo en header (toujours visible au mount). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bmd-logo.svg"
              alt=""
              width={32}
              height={32}
              decoding="async"
              // @ts-expect-error fetchPriority HTML standard non encore typé par React
              fetchpriority="high"
            />
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

        {/* Cloche notifications — navigue vers la page /dashboard/notifications
            (au lieu d'ouvrir un BottomSheet rapide qui ne montrait que les 5
            dernières). Pattern Revolut/Wise : tap = vraie page consultable. */}
        <Link
          href="/dashboard/notifications"
          prefetch
          aria-label={`Notifications${unread > 0 ? ` (${unread} non lues)` : ""}`}
          data-tour="notif-bell"
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            background: "rgba(244,228,193,0.04)",
            color: "var(--cream-soft)",
            position: "relative",
            cursor: "pointer",
            flexShrink: 0,
            fontFamily: "inherit",
            textDecoration: "none",
            touchAction: "manipulation",
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
        </Link>

        {/* Avatar profil — photo locale si dispo, sinon initiale gradient */}
        <Link
          href="/dashboard/profile"
          prefetch
          aria-label={t("nav.profile")}
          data-tour="header-avatar"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: localPhoto
              ? `url(${localPhoto}) center/cover no-repeat`
              : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#16111E",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
            flexShrink: 0,
            border: localPhoto ? "1.5px solid rgba(232,163,61,0.4)" : "none",
            overflow: "hidden",
          }}
        >
          {!localPhoto && (me?.displayName?.charAt(0).toUpperCase() ?? "?")}
        </Link>
      </header>
      )}

      {/* === Contenu V69 : compense le header fixed avec paddingTop dynamique ===
          V76 — En bodyScroll, <main> n'a PAS de scroller interne. Le <body>
          scrolle directement → fini le jitter iOS Safari du fixed dans
          scroller interne. Le contenu pousse simplement le body. */}
      <main
        style={{
          flex: bodyScroll ? undefined : 1,
          overflowY: bodyScroll ? "visible" : "auto",
          // V79 — Bloque tout scroll horizontal au niveau du <main>, peu
          // importe ce que les enfants font (carousel avec margin négatif,
          // contenu un peu trop large, etc.). `clip` ne crée pas de scroll
          // container donc n'affecte pas `position: sticky` ; il coupe juste
          // visuellement ce qui dépasse l'axe X. Fallback hidden via le CSS
          // global (cf. globals.css @supports not (overflow-x: clip)).
          overflowX: "clip" as any,
          // V69/V76 — header est position:fixed donc on doit pousser le contenu
          // de la hauteur du header. En bodyScroll + hideHeader (page profil),
          // le hero portalisé couvre déjà le notch → paddingTop=0 pour qu'il
          // n'y ait AUCUN gap entre le hero et le contenu scrollable.
          paddingTop: bodyScroll && hideHeader
            ? 0
            : hideHeader
              ? "env(safe-area-inset-top, 0px)"
              : "calc(80px + env(safe-area-inset-top, 0px))",
          paddingBottom: hideBottomNav ? 16 : 90,
          overscrollBehavior: bodyScroll ? "auto" : "contain",
          // V79 — Sécurité supplémentaire : largeur 100% strict, jamais plus
          width: "100%",
          maxWidth: "100%",
        }}
      >
        {children}
      </main>

      {/* === Bottom tab bar + FAB V147 : 100% TRANSPARENT === */}
      {/* V147 — Suppression totale du gradient sombre + blur + borderTop qui
          créaient le fond gris. Le contenu de la page défile maintenant
          entièrement visible derrière les icônes. Les icônes elles-mêmes
          ont un halo blanc (drop-shadow) qui les rend lisibles sur n'importe
          quel fond — clair, sombre, photo, gradient. */}
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
            background: "transparent",
            border: "none",
            // Pas d'interception des taps sur les zones vides du nav
            pointerEvents: "none",
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
                aria-label={
                  t("nav.quickAdd") || "Ajout express IA"
                }
                data-tour="fab-ia"
                className="bmd-game-changer-fab"
                style={{
                  // V147 — pointer-events: auto pour que le FAB reste
                  // cliquable malgré le pointer-events: none du <nav> parent
                  // (qui laisse passer les taps sur les zones vides).
                  pointerEvents: "auto",
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  border: "2px solid rgba(244,228,193,0.30)",
                  background:
                    "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                  color: "#16111E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow:
                    "0 10px 30px rgba(232,163,61,0.55), 0 2px 6px rgba(0,0,0,0.35)",
                  marginTop: -32,
                  marginInline: "auto",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  position: "relative",
                }}
              >
                {/* V41.3 — Sigil game-changer : sparkle SVG plus expressif
                    qu'un simple "+". Suggère l'aspect IA (création magique). */}
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3z" />
                  <path d="M19 17l0.9 2.1L22 20l-2.1 0.9L19 23l-0.9-2.1L16 20l2.1-0.9L19 17z" />
                </svg>
                <style jsx>{`
                  .bmd-game-changer-fab::after {
                    content: "";
                    position: absolute;
                    inset: -6px;
                    border-radius: 50%;
                    border: 1px solid rgba(232, 163, 61, 0.35);
                    pointer-events: none;
                    animation: bmd-fab-pulse 2.4s ease-out infinite;
                  }
                  @keyframes bmd-fab-pulse {
                    0% {
                      transform: scale(0.85);
                      opacity: 0.8;
                    }
                    100% {
                      transform: scale(1.35);
                      opacity: 0;
                    }
                  }
                `}</style>
              </button>
            )}
            <BottomTab item={NAV_ITEMS[2]!} pathname={pathname} />
            <BottomTab item={NAV_ITEMS[3]!} pathname={pathname} />
          </div>
        </nav>
      )}

      {/* Centre de notifications mobile : on garde le component en arrière-plan
          uniquement pour qu'il mette à jour le badge `unread` via SSE/polling
          (sans afficher de BottomSheet — la cloche du header navigue
          maintenant vers /dashboard/notifications). */}
      <MobileNotificationCenter
        open={false}
        onClose={() => setNotifOpen(false)}
        onUnreadChange={setUnread}
      />

      {/* V41.3 — Game-changer Quick Add Sheet (voice/scan). Rendu au niveau
          shell pour être accessible depuis n'importe quelle page mobile.
          Le FAB central l'ouvre par défaut quand aucun onFabClick custom
          n'est fourni par la page. */}
      {quickAddOpen && (
        <MobileQuickAddSheet
          open={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * V54 — Bouton retour intelligent.
 *
 * Avant : back href hardcodé sur chaque page (ex: /dashboard/plans pointait
 * sur /dashboard/profile). Si l'utilisateur arrivait depuis dashboard (via
 * raccourci), il atterrissait sur profile au retour. Bug UX.
 *
 * Après : 3 stratégies dans l'ordre :
 *  1. `?from=...` query param présent → on retourne là (URL propre, contrôlée)
 *  2. history.length > 2 → `router.back()` (l'utilisateur navigue dans l'app,
 *     on respecte sa pile native)
 *  3. fallback `fallbackHref` (deep-link first load → pas d'historique)
 */
function SmartBackButton({
  fallbackHref,
  label,
}: {
  fallbackHref: string;
  label: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const fromParam = sp?.get("from");

  function handleClick(e: React.MouseEvent | React.PointerEvent) {
    e.preventDefault();
    if (fromParam) {
      router.push(fromParam);
      return;
    }
    // history.length > 2 = il y a au moins une navigation côté client.
    // (Note : navigators retournent souvent length=1 sur first load deep-link,
    // length=2 après une nav, donc on prend une marge.)
    if (typeof window !== "undefined" && window.history.length > 2) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className="bmd-tap"
      style={{
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        background: "rgba(244,228,193,0.06)",
        color: "var(--cream)",
        border: "none",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function BottomTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const t = useT();
  const label = t(item.labelKey);
  // V147.1 — État actif clair et inattaquable :
  //  - Inactif : cocoa #2B1F15 + halo blanc fort → lisible sur tout fond
  //  - Actif   : saffron #C58A2E + FOND PILL saffron-pale derrière l'icône
  //              + halo blanc réduit (le pill suffit à indiquer "tu es ici")
  //  - Le pill est la signature visuelle universelle "onglet sélectionné"
  //    (Apple Music, iOS Settings, Instagram, etc.)
  // V178.C — Attribut data-tour pour permettre au DiscoveryTour de
  // cibler l'onglet RDD ("/dashboard/debts" → data-tour="nav-debts").
  const tourTag = item.href === "/dashboard/debts" ? "nav-debts" : undefined;
  return (
    <Link
      href={item.href}
      prefetch
      aria-current={active ? "page" : undefined}
      aria-label={label}
      data-tour={tourTag}
      className="bmd-tap bmd-no-scale"
      onTouchStart={() => {
        if (active) return;
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(8);
          } catch {
            /* ignore */
          }
        }
      }}
      style={{
        // V147 — pointer-events: auto pour cliquer même si le nav parent
        // a pointer-events: none (pour laisser passer les taps sur les vides).
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "4px 4px 8px",
        minHeight: 48,
        textDecoration: "none",
        color: active ? "#C58A2E" : "#2B1F15",
        fontSize: 11,
        fontWeight: 800,
        // V147.1 — Halo plus fort sur inactif (besoin lisibilité), plus
        // discret sur actif (le pill saffron prend le relais visuel).
        filter: active
          ? "drop-shadow(0 0 2px rgba(255,255,255,0.55))"
          : "drop-shadow(0 0 3px rgba(255,255,255,0.90)) drop-shadow(0 0 6px rgba(255,255,255,0.55)) drop-shadow(0 1px 1px rgba(0,0,0,0.30))",
      }}
    >
      {/* V147.2 — Conteneur icône compact avec fond pill saffron-pale UNIQUEMENT
          si actif. C'est ce pill (sur les 4 NavItems) qui indique l'onglet
          courant. Le FAB central est un composant TOTALEMENT séparé : il ne
          reçoit jamais ce pill et garde son gradient saffron→terracotta
          permanent, peu importe la page. */}
      <span
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 32,
          borderRadius: 999,
          background: active ? "rgba(197,138,46,0.22)" : "transparent",
          border: active
            ? "1px solid rgba(197,138,46,0.45)"
            : "1px solid transparent",
          transition: "background 160ms ease, border-color 160ms ease",
        }}
      >
        {item.icon}
      </span>
      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {label}
      </span>
    </Link>
  );
}

function NavIcon({
  name,
}: {
  name: "home" | "groups" | "chart" | "user" | "search" | "contract";
}) {
  // V147 — Icônes vraiment GRAS et plus grandes :
  //  - 30x30 au lieu de 22x22 (mieux remplit le span 32x32 du BottomTab)
  //  - strokeWidth 3.0 au lieu de 2.0 (vrai trait épais visible)
  const props = {
    width: 30,
    height: 30,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 3,
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
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    // V148 — Icône "contract" pour Reconnaissance de dette : document plié
    // avec lignes de texte + corner pour signifier un acte signé.
    case "contract":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
  }
}
