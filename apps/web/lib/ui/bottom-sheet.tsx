"use client";

/**
 * <BottomSheet /> · Pattern modal natif mobile (slide-up depuis le bas).
 *
 * Sur mobile, les modals "centrés" cassent l'illusion d'app native — les
 * vraies apps utilisent des bottom sheets qui glissent depuis le bas, avec
 * un drag handle visible et la possibilité de glisser vers le bas pour
 * fermer (gesture standard iOS / Material).
 *
 * Sur desktop, on retombe sur un modal centré classique (le bottom sheet
 * n'a pas de sens sur grand écran).
 *
 * Le composant gère :
 *  - Animation slide-up à l'ouverture
 *  - Drag down pour fermer (touch only)
 *  - Backdrop click pour fermer
 *  - Escape pour fermer (clavier)
 *  - Focus trap basique (premier élément focusable)
 *  - safe-area-inset-bottom pour iPhone home bar
 *  - Scroll lock du body pendant l'ouverture
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBreakpoint } from "../use-breakpoint";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Titre lu par les screen readers (aria-labelledby). */
  title?: string;
  /** Si true (mobile) : drag down pour fermer. Default: true. */
  enableSwipeDown?: boolean;
}

const SWIPE_DOWN_THRESHOLD = 80; // px

export function BottomSheet({
  open,
  onClose,
  children,
  title,
  enableSwipeDown = true,
}: Props) {
  const { isMobile } = useBreakpoint();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [animateClose, setAnimateClose] = useState(false);

  // === Body scroll lock pendant l'ouverture ===
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // === ESC pour fermer ===
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // === Focus le premier élément focusable à l'ouverture ===
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
      'input, textarea, select, button:not([aria-label="Fermer"])',
    );
    focusables[0]?.focus();
  }, [open]);

  const handleClose = useCallback(() => {
    setAnimateClose(true);
    // Laisse l'anim se jouer avant d'unmount
    setTimeout(() => {
      setAnimateClose(false);
      setDragOffset(0);
      onClose();
    }, 200);
  }, [onClose]);

  // === Drag down (mobile only) ===
  function onTouchStart(e: React.TouchEvent) {
    if (!enableSwipeDown || !isMobile) return;
    startY.current = e.touches[0]?.clientY ?? null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!enableSwipeDown || !isMobile) return;
    if (startY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    if (dy > 0) {
      setDragOffset(dy);
    }
  }
  function onTouchEnd() {
    if (!enableSwipeDown || !isMobile) return;
    if (startY.current == null) return;
    if (dragOffset > SWIPE_DOWN_THRESHOLD) {
      handleClose();
    } else {
      setDragOffset(0);
    }
    startY.current = null;
  }

  if (!open) return null;

  // === Bottom sheet (mobile + tablet) ===
  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "bmd-bs-title" : undefined}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(43,31,21,0.50)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          animation: animateClose
            ? "bmd-bs-fadeout 0.2s forwards"
            : "bmd-bs-fadein 0.2s",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        {/* V106 — Sheet mobile : fond V45-light par défaut directement en
            inline (évite tout flash sombre avant que les overrides CSS soient
            appliqués). Les overrides `html[data-theme="v45-light"]
            .bmd-bottom-sheet` restent en place pour les inputs/h2/etc. */}
        <div
          ref={sheetRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="bmd-bottom-sheet"
          style={{
            background:
              "linear-gradient(180deg, #FBF6EC 0%, #F4ECD8 100%)",
            border: "1px solid rgba(197,138,46,0.25)",
            borderBottom: "none",
            borderRadius: "22px 22px 0 0",
            width: "100%",
            maxWidth: 600,
            maxHeight: "90dvh",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            transform: animateClose
              ? "translateY(100%)"
              : `translateY(${dragOffset}px)`,
            transition:
              dragOffset === 0 || animateClose ? "transform 0.25s ease-out" : "none",
            animation: animateClose
              ? undefined
              : "bmd-bs-slideup 0.3s ease-out",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            color: "var(--cocoa, #2B1F15)",
            boxShadow: "0 -10px 40px rgba(43,31,21,0.18)",
          }}
        >
          {/* Drag handle visible en haut */}
          <div
            aria-hidden
            style={{
              padding: "10px 0 6px",
              display: "flex",
              justifyContent: "center",
              cursor: "grab",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "rgba(43,31,21,0.18)",
              }}
            />
          </div>

          {title && (
            <h2
              id="bmd-bs-title"
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 22,
                fontWeight: 700,
                margin: "0 22px 14px",
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              {title}
            </h2>
          )}

          <div
            style={{
              padding: "0 20px 12px",
              overflowY: "auto",
              flex: 1,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {children}
          </div>
        </div>

        <style jsx>{`
          @keyframes bmd-bs-fadein {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes bmd-bs-fadeout {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          @keyframes bmd-bs-slideup {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // === Centered modal (desktop) ===
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "bmd-bs-title" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(14,11,20,0.7)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* V106 — Modal desktop centré : on lui pose la classe `bmd-bottom-sheet`
          pour qu'il bénéficie des mêmes overrides V45-light que la version
          mobile (inputs, h2/h3, drag handle), et on met le fond V45 par
          défaut directement en inline pour éviter tout flash sombre avant
          l'application des règles CSS. */}
      <div
        ref={sheetRef}
        className="bmd-bottom-sheet"
        style={{
          background:
            "linear-gradient(135deg, #FBF6EC 0%, #F4ECD8 100%)",
          border: "1px solid rgba(197,138,46,0.25)",
          borderRadius: 22,
          padding: 24,
          maxWidth: 460,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          color: "var(--cocoa, #2B1F15)",
          boxShadow:
            "0 18px 60px rgba(43,31,21,0.22), 0 4px 12px rgba(43,31,21,0.10)",
        }}
      >
        {title && (
          <h2
            id="bmd-bs-title"
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 18px",
              color: "var(--cocoa, #2B1F15)",
            }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
