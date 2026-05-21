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
 * V92 — On utilise `router.push()` programmatique (History API) au lieu de
 * `<Link>` (qui rend un `<a href>`). Sur Capacitor iOS WKWebView, les clics
 * sur `<a>` peuvent être interprétés comme navigation externe et ouvrir
 * Safari par-dessus l'app. Le push programmatique reste dans la WebView
 * dans 100% des cas car il n'y a pas de `<a>` à intercepter.
 *
 * Usage :
 *   <BottomNav active="home" onCreate={() => router.push("/dashboard")} />
 */
import { useRouter } from "next/navigation";
import { useT } from "../i18n/app-strings";
import { Icon, type IconName } from "./icons";

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
          /* V147 — Padding-bottom revu pour la nouvelle taille d'icônes (32px)
             + label (10.5px) + padding interne + gap. ~72px nécessaires pour
             que le contenu de la page ne soit jamais masqué par les icônes
             flottantes, peu importe le safe-area du device. */
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
          // V73 — Fond 100% transparent : on ne voit plus que les icônes
          // flotter au-dessus du contenu. Pas de bordure top non plus.
          // Les pages doivent respecter le safe-area-bottom + ~80px pour
          // ne pas avoir leur contenu caché sous le nav (déjà géré par
          // le padding-bottom global du body).
          background: "transparent",
          padding: "10px 16px",
          paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0))",
          alignItems: "flex-end",
          justifyContent: "space-around",
          zIndex: 50,
          // Pas de blur (le fond est transparent) — `pointer-events: none`
          // sur le conteneur, mais on rétablit pour chaque enfant ci-dessous,
          // afin que les zones vides du nav n'interceptent pas les taps qui
          // doivent traverser vers le contenu en dessous.
          pointerEvents: "none",
        }}
      >
        {/* V52.C3 — SVG home remplace EMOJI */}
        <NavItem
          href="/dashboard"
          icon="home"
          label={t("nav.dashboard")}
          active={active === "home"}
        />
        {/* V52.C3 — SVG coins remplace EMOJI */}
        <NavItem
          href="/dashboard"
          icon="coins"
          label={t("nav.groups")}
          active={active === "groups"}
        />
        {!hideFab && <Fab onClick={onCreate} />}
        {/* Sprint AC-4 — entrée Search globale (transcripts + dépenses) */}
        {/* V52.C3 — SVG search remplace EMOJI */}
        <NavItem
          href="/dashboard/search"
          icon="search"
          label={t("search.title")}
          active={active === "activity"}
        />
        {/* V52.C3 — SVG user remplace EMOJI */}
        <NavItem
          href="/dashboard/profile"
          icon="user"
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
  icon: IconName;
  label: string;
  active: boolean;
}): JSX.Element {
  const router = useRouter();
  // V147 — Icônes ultra-visibles sur fond 100% transparent.
  //
  // Problème observé par Fabrice : à 26px avec strokeWidth 2.6 et un
  // drop-shadow doux, les 4 icônes nav étaient à peine visibles — on ne
  // savait pas qu'il y avait des boutons. Fix radical :
  //
  // 1. Taille 32px (vs 26) — vraiment visibles sans être agressifs
  // 2. strokeWidth 3.0/3.2 — vrai trait BOLD, pas "medium-bold"
  // 3. Filter avec 3 drop-shadows superposés :
  //    - Halo blanc épais (3px / 0.85) → détache de tout fond clair
  //    - Halo blanc moyen (5px / 0.5)  → diffuse le contour
  //    - Ombre sombre (1px / 0.25)     → ancrage sur fond clair ivory
  //    Résultat : l'icône cocoa "flotte" toujours nettement, même posée sur
  //    du texte ou un fond complexe.
  // 4. Label fontSize 10.5px + fontWeight 700 + même filter halo
  //
  // V92 — `<button>` + `router.push()` au lieu de `<Link>` (anti-WKWebView).
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      aria-label={label}
      style={{
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        border: "none",
        padding: "6px 4px",
        cursor: "pointer",
        fontFamily: "inherit",
        textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        minWidth: 48,
        minHeight: 48,
        // V147 — Triple drop-shadow pour halo lumineux + ancrage.
        // L'icône cocoa devient lisible sur n'importe quelle page :
        // ivory V45-light, dark login, photo de membre en arrière-plan, etc.
        filter:
          "drop-shadow(0 0 3px rgba(255,255,255,0.85)) drop-shadow(0 0 5px rgba(255,255,255,0.50)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
      }}
    >
      <span
        style={{
          color: active ? "#C58A2E" : "#2B1F15",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "color 160ms ease",
        }}
      >
        {/* V147 — Taille 32px (vs 26) et trait 3.0/3.2 (vs 2.6/2.8) pour un
            vrai effet BOLD bien visible. */}
        <Icon
          name={icon}
          size={32}
          color="currentColor"
          strokeWidth={active ? 3.2 : 3.0}
        />
      </span>
      {/* V147 — Label en 10.5px + opacité 0.95 + même halo via le filter
          parent. Plus de contraste, plus de présence. */}
      <span
        aria-hidden
        style={{
          fontSize: 10.5,
          letterSpacing: 0.3,
          fontWeight: 700,
          color: active ? "#C58A2E" : "#2B1F15",
          opacity: active ? 1 : 0.95,
        }}
      >
        {label}
      </span>
    </button>
  );
}

function Fab({ onClick }: { onClick?: () => void }): JSX.Element {
  const router = useRouter();
  if (!onClick) {
    // V92 — Fallback : button + router.push au lieu de <Link> (anti-WKWebView).
    return (
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        aria-label="Nouveau"
        style={{ ...fabStyle, border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        ＋
      </button>
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
  // V73 — re-active les clics (le nav parent a pointer-events:none)
  pointerEvents: "auto",
  width: 56,
  height: 56,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #E8A33D, #B5462E)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#16111E",
  fontSize: 28,
  fontWeight: 700,
  textDecoration: "none",
  boxShadow:
    "0 12px 28px rgba(232,163,61,0.55), 0 4px 10px rgba(0,0,0,0.35)",
  marginTop: -22,
  flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
  touchAction: "manipulation",
};
