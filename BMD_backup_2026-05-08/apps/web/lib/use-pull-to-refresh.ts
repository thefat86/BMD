"use client";

/**
 * Hook `usePullToRefresh` — geste tactile natif "pull-down to refresh".
 *
 * Standard apps mobiles bancaires (Lydia, Wave, Revolut, banque mobile) :
 * l'utilisateur tire la zone de contenu vers le bas → un indicateur
 * apparaît → quand le seuil est franchi (~80px), le callback est exécuté.
 *
 * Conçu MOBILE ONLY :
 *  - Désactivé sur desktop (pointer fin = on garde le bouton refresh
 *    classique). On vérifie via matchMedia + détection touch device.
 *  - Désactivé si l'utilisateur n'est pas tout en haut du scroll
 *    (sinon ça interfère avec le scroll vertical normal).
 *  - Désactivé en cours de fetch (anti double-trigger).
 *
 * Comportement visuel exposé via `state` :
 *  - `pulling: true/false` — l'utilisateur est en train de tirer
 *  - `progress: 0-1` — fraction de la distance vers le seuil
 *  - `armed: true` — seuil dépassé, lâcher = refresh
 *  - `refreshing: true` — fetch en cours
 *
 * Le caller dessine un indicateur (spinner, flèche, logo BMD…) en
 * fonction de ces states, en haut de son contenu.
 *
 * Usage typique :
 *
 *   const { state, bindToScrollContainer } = usePullToRefresh({
 *     onRefresh: async () => { await fetchAll(); },
 *   });
 *   <main ref={bindToScrollContainer}>
 *     <PullIndicator {...state} />
 *     {content}
 *   </main>
 */

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 80; // distance à tirer pour armer le refresh
const MAX_PULL_PX = 140; // distance max au-delà de laquelle on plafonne
const RESISTANCE = 0.5; // facteur de résistance (1 = direct, 0.5 = "élastique")

export interface PullState {
  pulling: boolean;
  /** 0..1 — fraction de la distance vers le seuil */
  progress: number;
  /** true si seuil dépassé : un release déclenchera onRefresh */
  armed: boolean;
  /** true pendant l'exécution du callback onRefresh */
  refreshing: boolean;
  /** distance en px (pour appliquer un translateY au contenu si désiré) */
  pullDistance: number;
}

export interface UsePullToRefreshOptions {
  /** Callback async appelé quand l'utilisateur lâche au-delà du seuil */
  onRefresh: () => Promise<unknown> | void;
  /** Désactive complètement le hook (par exemple en desktop). Default false. */
  disabled?: boolean;
  /** Force l'activation même sans détection touch (debug). Default false. */
  forceEnable?: boolean;
}

const initialState: PullState = {
  pulling: false,
  progress: 0,
  armed: false,
  refreshing: false,
  pullDistance: 0,
};

export function usePullToRefresh(opts: UsePullToRefreshOptions): {
  state: PullState;
  bindToScrollContainer: (el: HTMLElement | null) => void;
} {
  const { onRefresh, disabled = false, forceEnable = false } = opts;
  const [state, setState] = useState<PullState>(initialState);
  const containerRef = useRef<HTMLElement | null>(null);
  const startY = useRef<number | null>(null);
  const refreshingRef = useRef(false);

  // Désactivé sur desktop — pas de pointer fin, pas de pull-to-refresh
  const isTouchDevice =
    typeof window !== "undefined" &&
    (("ontouchstart" in window) ||
      (window.matchMedia?.("(pointer: coarse)").matches ?? false));

  const enabled = !disabled && (forceEnable || isTouchDevice);

  const bindToScrollContainer = useCallback(
    (el: HTMLElement | null) => {
      containerRef.current = el;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current ?? document.body;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      // Pull-to-refresh actif uniquement si on est tout en haut du scroll
      const scrollTop =
        el === document.body
          ? window.scrollY
          : (el as HTMLElement).scrollTop;
      if (scrollTop > 2) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? null;
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (startY.current == null) return;
      const currentY = e.touches[0]?.clientY ?? 0;
      const rawDelta = currentY - startY.current;
      if (rawDelta <= 0) {
        // L'utilisateur scrolle vers le haut → on annule
        if (state.pulling) setState(initialState);
        return;
      }
      // Applique la résistance pour effet élastique
      const distance = Math.min(rawDelta * RESISTANCE, MAX_PULL_PX);
      const progress = Math.min(distance / THRESHOLD_PX, 1);
      const armed = distance >= THRESHOLD_PX;
      // Feedback haptique au moment précis où on dépasse le seuil
      // (transition pulling → armed). Tap discret = 10ms.
      if (
        armed &&
        !state.armed &&
        typeof navigator !== "undefined" &&
        navigator.vibrate
      ) {
        try {
          navigator.vibrate(10);
        } catch {
          /* ignore */
        }
      }
      setState({
        pulling: true,
        progress,
        armed,
        refreshing: false,
        pullDistance: distance,
      });
      // Empêche le bounce iOS pour bien sentir le pull
      if (e.cancelable) e.preventDefault();
    }

    async function onTouchEnd() {
      if (refreshingRef.current) {
        startY.current = null;
        return;
      }
      const wasArmed = state.armed;
      startY.current = null;
      if (!wasArmed) {
        setState(initialState);
        return;
      }
      // Trigger refresh
      refreshingRef.current = true;
      setState({
        pulling: false,
        progress: 1,
        armed: true,
        refreshing: true,
        pullDistance: THRESHOLD_PX,
      });
      try {
        await onRefresh();
      } catch {
        /* le caller log son erreur */
      } finally {
        refreshingRef.current = false;
        setState(initialState);
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    // touchmove non-passive pour pouvoir preventDefault et empêcher le
    // bounce navigateur natif qui interfère avec notre indicateur.
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state.armed, state.pulling]);

  return { state, bindToScrollContainer };
}
