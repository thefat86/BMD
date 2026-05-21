"use client";

/**
 * Bottom-nav fixe pour la navigation principale sur mobile.
 *
 * Inspiré de la maquette BMD_maquettes.html — onglets : Maison, Groupes,
 * (FAB Nouveau au centre), Activité, Profil.
 *
 * Comportement :
 *  - Visible UNIQUEMENT sur viewport < 768px (desktop a déjà la nav top)
 *  - Reste fixée en bas avec safe-area-inset-bottom (notch / home indicator iOS)
 *  - Le FAB central déclenche un callback (ex: ouvrir le panel "nouvelle dépense")
 *  - L'onglet actif est highlight saffron, les autres sont gris cream-soft
 *  - Tous les labels sont localisés via useT() — suit la langue active
 *
 * Usage :
 *   <BottomNav active="home" onCreate={() => router.push("/dashboard")} />
 */
import Link from "next/link";
import { useT } from "../i18n/app-strings";

type ActiveTab = "home" | "groups" | "activity" | "profile" | "none";

interface Props {
  active?: ActiveTab;
  /** Callback du FAB central (par défaut : nav vers /dashboard avec le panel ouvert) */
  onCreate?: () => void;
  /** Permet de désactiver le FAB (ex: page profil où "créer" n'a pas de sens) */
  hideFab?: boolean;
}

export function BottomNav({ active = "none", onCreate, hideFab }: Props): JSX.Element {
  const t = useT();
  return (
    <>
      <style jsx global>{`
        /* Affiche uniquement sur mobile */
        .bmd-bottom-nav {
          display: none;
        }
        @media (max-width: 768px) {
          .bmd-bottom-nav {
            display: flex;
          }
          /* Padding-bottom pour le contenu sous-jacent (~68px nav + safe-area) */
          body {
            padding-bottom: calc(72px + env(safe-area-inset-bottom, 0));
          }
        }
      `}</style>
      <nav
        className="bmd-bottom-nav"
        aria-label={t("nav.dashboard")}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background:
            "linear-gradient(0deg, rgba(14,11,20,0.97), rgba(22,17,30,0.95))",
          borderTop: "1px solid rgba(244,228,193,0.08)",
          padding: "8px 16px",
          paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0))",
          alignItems: "flex-end",
          justifyContent: "space-around",
          zIndex: 50,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <NavItem
          href="/dashboard"
          icon="🏠"
          label={t("nav.dashboard")}
          active={active === "home"}
        />
        <NavItem
          href="/dashboard"
          icon="🪙"
          label={t("nav.groups")}
          active={active === "groups"}
        />
        {!hideFab && <Fab onClick={onCreate} />}
        {/* Sprint AC-4 — entrée Search globale (transcripts + dépenses) */}
        <NavItem
          href="/dashboard/search"
          icon="🔍"
          label={t("search.title")}
          active={active === "activity"}
        />
        <NavItem
          href="/dashboard/profile"
          icon="👤"
          label={t("nav.profile")}
          active={active === "profile"}
        />
      </nav>
    </>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}): JSX.Element {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        fontSize: 9,
        color: active ? "#E8A33D" : "#8A7B6B",
        fontWeight: 600,
        textDecoration: "none",
        padding: "4px 6px",
        minWidth: 56,
        minHeight: 44,
        justifyContent: "center",
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span style={{ letterSpacing: 0.3 }}>{label}</span>
    </Link>
  );
}

function Fab({ onClick }: { onClick?: () => void }): JSX.Element {
  if (!onClick) {
    // Fallback : Link vers la page dashboard si pas de callback
    return (
      <Link
        href="/dashboard"
        aria-label="Nouveau"
        style={fabStyle}
      >
        ＋
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        // Feedback haptique léger pour le tap du FAB principal — feel
        // banking app (no-op si l'API Vibration n'est pas dispo).
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(10);
          } catch {
            /* ignore */
          }
        }
        onClick();
      }}
      aria-label="Nouveau"
      style={{ ...fabStyle, border: "none", cursor: "pointer" }}
    >
      ＋
    </button>
  );
}

const fabStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #E8A33D, #B5462E)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#16111E",
  fontSize: 26,
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 8px 20px rgba(232,163,61,0.45)",
  marginTop: -22,
  flexShrink: 0,
};
