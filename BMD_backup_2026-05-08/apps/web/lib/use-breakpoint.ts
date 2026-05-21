"use client";

/**
 * Hook de détection de breakpoint mobile / desktop (spec §8).
 *
 * Stratégie :
 *  - On utilise `window.matchMedia("(max-width: 768px)")` pour réagir
 *    aux changements en temps réel (rotation, redimensionnement…)
 *  - SSR-safe : on retourne "desktop" par défaut côté serveur, et la
 *    valeur réelle se met à jour au montage (évite hydration mismatch
 *    en initialisant à null + flag `mounted`).
 *  - Le seuil 768px correspond au breakpoint Tailwind `md:` standard.
 *
 * Usage :
 *   const { isMobile, isDesktop, ready } = useBreakpoint();
 *   if (!ready) return null; // évite le flash de la mauvaise vue au mount
 *   return isMobile ? <MobileView /> : <DesktopView />;
 */

import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 768px)";

export interface BreakpointState {
  isMobile: boolean;
  isDesktop: boolean;
  /** True une fois que la détection navigateur a tourné (post-mount). */
  ready: boolean;
}

export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>({
    isMobile: false,
    isDesktop: true,
    ready: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => {
      setState({
        isMobile: mq.matches,
        isDesktop: !mq.matches,
        ready: true,
      });
    };
    apply();
    // Compat moderne (addEventListener) + fallback IE/Safari ancien
    if ("addEventListener" in mq) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    // @ts-expect-error - addListener legacy
    mq.addListener(apply);
    return () => {
      // @ts-expect-error
      mq.removeListener(apply);
    };
  }, []);

  return state;
}
