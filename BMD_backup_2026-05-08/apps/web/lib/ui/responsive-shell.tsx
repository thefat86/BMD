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
  hideFab?: boolean;
  onFabClick?: () => void;
  mobileHeaderRight?: ReactNode;
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
    // Fallback neutre : on évite de rendre une fausse vue qui flashera
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "linear-gradient(180deg, var(--indigo) 0%, var(--night) 100%)",
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
        hideFab={props.hideFab}
        onFabClick={props.onFabClick}
        headerRight={props.mobileHeaderRight}
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
