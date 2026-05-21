"use client";

/**
 * <ResponsiveShell> · Choisit dynamiquement entre <MobileShell> et <DesktopShell>.
 *
 * Spec §8 : la vue mobile doit être une vraie app native, la vue desktop
 * doit être un vrai portail web. Les deux ne sont PAS responsifs l'un de
 * l'autre — ils ont des structures complètement différentes.
 *
 * Ce composant fait la bascule selon le breakpoint navigateur (≤ 768px
 * pour mobile, > 768px pour desktop).
 *
 * Pour éviter le flash de contenu mal positionné au mount (avant que
 * useBreakpoint ait détecté le viewport), on retourne un état de chargement
 * neutre tant que `ready === false`.
 */

import type { ReactNode } from "react";
import { useBreakpoint } from "../use-breakpoint";
import { MobileShell } from "./mobile-shell";
import { DesktopShell } from "./desktop-shell";

interface SharedProps {
  children: ReactNode;
}

interface MobileProps extends SharedProps {
  mobileTitle?: string;
  back?: { href: string; label?: string };
  hideBottomNav?: boolean;
  /** V69 — Cache le header (utilisé sur le profil pour immersion totale). */
  hideHeader?: boolean;
  hideFab?: boolean;
  onFabClick?: () => void;
  mobileHeaderRight?: ReactNode;
  /** V76 — Si true, le scroll se fait sur <body> au lieu d'un <main> avec
   *  overflow-y: auto. Utile pour les pages qui ont un hero PORTALISÉ en
   *  position: fixed → sur iOS Safari, un fixed enfant d'un scroller interne
   *  jitter pendant le scroll. En faisant scroller le body directement,
   *  position: fixed devient strictement viewport-relative et stable.
   *  À activer sur la page profil mobile. */
  mobileBodyScroll?: boolean;
}

interface DesktopProps extends SharedProps {
  breadcrumb?: string;
  desktopTitle?: string;
  subtitle?: string;
  primaryAction?: ReactNode;
}

interface Props extends MobileProps, DesktopProps {
  /**
   * Si true, on rend les enfants directement (pas de shell) en attendant
   * que le breakpoint soit détecté. Utile pour les pages publiques qui
   * doivent fonctionner sans aucun JS (login, page invité…).
   */
  skipShellOnInit?: boolean;
}

export function ResponsiveShell(props: Props) {
  const { isMobile, ready } = useBreakpoint();

  if (!ready) {
    if (props.skipShellOnInit) return <>{props.children}</>;
    // Fallback neutre : on évite de rendre une fausse vue qui flashera.
    // V103 — Fond ivory pour matcher la palette V45-light du shell final.
    return (
      <div
        style={{
          minHeight: "100dvh",
          background:
            "linear-gradient(180deg, var(--ivory, #FBF6EC) 0%, #F4ECD8 100%)",
        }}
      />
    );
  }

  if (isMobile) {
    return (
      <MobileShell
        title={props.mobileTitle}
        back={props.back}
        hideBottomNav={props.hideBottomNav}
        hideHeader={props.hideHeader}
        hideFab={props.hideFab}
        onFabClick={props.onFabClick}
        headerRight={props.mobileHeaderRight}
        bodyScroll={props.mobileBodyScroll}
      >
        {props.children}
      </MobileShell>
    );
  }

  return (
    <DesktopShell
      breadcrumb={props.breadcrumb}
      title={props.desktopTitle}
      subtitle={props.subtitle}
      primaryAction={props.primaryAction}
    >
      {props.children}
    </DesktopShell>
  );
}
