"use client";

/**
 * <SharedLangPicker /> · Picker de langue avec la même organisation partout.
 *
 * Sprint AD-1 : avant ce composant, le site avait DEUX UX différentes pour
 * choisir la langue : (1) le LangPicker raffiné de la vitrine (5 groupes
 * accordion) et (2) un simple <select> dans login + profil. Le user veut
 * la même UX partout pour rester cohérent.
 *
 * Ce composant reproduit EXACTEMENT le LangPicker vitrine :
 *  - Groupes : Main (FR+EN visibles) + 4 sous-groupes accordion repliables
 *    (Européennes / Asiatiques / Arabes / Africaines)
 *  - Comportement accordion : un seul groupe ouvert à la fois
 *  - Auto-ouverture du groupe contenant la locale active
 *  - Click outside / Escape ferme le picker et replie tous les groupes
 *  - Style cohérent (saffron pour locale active, indigo background)
 *
 * Usage :
 *   <SharedLangPicker locale={locale} onChange={(l) => setLocale(l)} />
 *
 * Variant `inline` : pour les formulaires où on veut le picker visible
 * directement (pas en dropdown). Le bouton trigger est masqué et la liste
 * de groupes s'affiche directement.
 */

import { useEffect, useRef, useState } from "react";
import {
  AFRICAN_LOCALES,
  ARABIC_LOCALES,
  ASIAN_LOCALES,
  EUROPEAN_LOCALES,
  LOCALE_FLAGS,
  LOCALE_NAMES,
  MAIN_LOCALES,
  type Locale,
} from "../i18n/marketing-translations";
import { useT } from "../i18n/app-strings";

type LangGroupKey = "european" | "asian" | "arabic" | "african";

interface SharedLangPickerProps {
  /** Locale actuellement sélectionnée. */
  locale: string;
  /** Callback quand l'utilisateur choisit une nouvelle locale. */
  onChange: (locale: Locale) => void;
  /** RTL (pour ar/he) : aligne le dropdown à gauche au lieu de droite. */
  rtl?: boolean;
  /** `inline` (form embedded) ou `dropdown` (header trigger). Défaut: dropdown. */
  variant?: "dropdown" | "inline";
  /** Liste blanche optionnelle des locales à afficher (pour filtrer côté form). */
  whitelist?: string[];
  /** Style override pour le bouton trigger (dropdown variant). */
  triggerStyle?: React.CSSProperties;
}

export function SharedLangPicker({
  locale,
  onChange,
  rtl = false,
  variant = "dropdown",
  whitelist,
  triggerStyle,
}: SharedLangPickerProps) {
  const t = useT();

  // Inline = toujours "ouvert"
  const [show, setShow] = useState(variant === "inline");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Si la locale active appartient à un sous-groupe, on l'ouvre par défaut.
  const inGroup = (l: string): LangGroupKey | null => {
    if ((EUROPEAN_LOCALES as string[]).includes(l)) return "european";
    if ((ASIAN_LOCALES as string[]).includes(l)) return "asian";
    if ((ARABIC_LOCALES as string[]).includes(l)) return "arabic";
    if ((AFRICAN_LOCALES as string[]).includes(l)) return "african";
    return null;
  };
  const [openGroup, setOpenGroup] = useState<LangGroupKey | null>(inGroup(locale));

  const toggleGroup = (key: LangGroupKey) => {
    setOpenGroup((prev) => (prev === key ? null : key));
  };

  // Click outside / Escape (dropdown only).
  useEffect(() => {
    if (variant === "inline") return;
    if (!show) return;
    function handlePointerDown(ev: MouseEvent | TouchEvent) {
      const target = ev.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      setShow(false);
      setOpenGroup(null);
    }
    function handleEscape(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        setShow(false);
        setOpenGroup(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("touchstart", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("touchstart", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [show, variant]);

  const labels = {
    main: t("langPicker.main"),
    european: t("langPicker.european"),
    asian: t("langPicker.asian"),
    arabic: t("langPicker.arabic"),
    african: t("langPicker.african"),
  };

  const filterAllowed = (list: readonly Locale[]): Locale[] =>
    whitelist
      ? list.filter((l) => whitelist.includes(l as string))
      : (list as Locale[]);

  /** Bouton item d'une locale. */
  const renderItem = (l: Locale, indented = false) => (
    <button
      key={l}
      type="button"
      onClick={() => {
        onChange(l);
        if (variant === "dropdown") {
          setShow(false);
          setOpenGroup(null);
        }
      }}
      style={{
        display: "block",
        width: "100%",
        textAlign: rtl ? "right" : "left",
        background: l === locale ? "rgba(232,163,61,0.15)" : "transparent",
        border: "none",
        padding: indented ? "9px 16px" : "9px 12px",
        color: l === locale ? "var(--saffron, #e8a33d)" : "var(--cream, #f4e4c1)",
        cursor: "pointer",
        borderRadius: 8,
        fontSize: 13,
        minHeight: 38,
        fontFamily: "inherit",
      }}
    >
      {LOCALE_FLAGS[l]} {LOCALE_NAMES[l]}
    </button>
  );

  /** En-tête repliable d'un sous-groupe. */
  const renderGroupHeader = (
    icon: string,
    label: string,
    open: boolean,
    onToggle: () => void,
  ) => (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        textAlign: rtl ? "right" : "left",
        background: "transparent",
        border: "none",
        padding: "9px 12px",
        color: "var(--cream-soft, #d4c4a8)",
        cursor: "pointer",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        fontFamily: "inherit",
        minHeight: 36,
      }}
    >
      <span>
        {icon} {label}
      </span>
      <span
        style={{
          fontSize: 14,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.18s ease",
        }}
        aria-hidden
      >
        ▾
      </span>
    </button>
  );

  const list = (
    <>
      {/* Main : FR + EN */}
      <div
        style={{
          padding: "8px 10px 4px",
          fontSize: 10,
          color: "var(--cream-muted, #aaa)",
          textTransform: "uppercase",
          letterSpacing: 1.2,
          fontWeight: 700,
        }}
      >
        {labels.main}
      </div>
      {filterAllowed(MAIN_LOCALES).map((l) => renderItem(l))}

      {/* Européennes */}
      <div
        style={{
          marginTop: 6,
          borderTop: "1px solid rgba(244,228,193,0.08)",
          paddingTop: 4,
        }}
      >
        {renderGroupHeader("🇪🇺", labels.european, openGroup === "european", () =>
          toggleGroup("european"),
        )}
        {openGroup === "european" &&
          filterAllowed(EUROPEAN_LOCALES).map((l) => renderItem(l, true))}
      </div>

      {/* Asiatiques */}
      <div
        style={{
          borderTop: "1px solid rgba(244,228,193,0.08)",
          paddingTop: 4,
        }}
      >
        {renderGroupHeader("🌏", labels.asian, openGroup === "asian", () =>
          toggleGroup("asian"),
        )}
        {openGroup === "asian" &&
          filterAllowed(ASIAN_LOCALES).map((l) => renderItem(l, true))}
      </div>

      {/* Arabes */}
      <div
        style={{
          borderTop: "1px solid rgba(244,228,193,0.08)",
          paddingTop: 4,
        }}
      >
        {renderGroupHeader("☪️", labels.arabic, openGroup === "arabic", () =>
          toggleGroup("arabic"),
        )}
        {openGroup === "arabic" &&
          filterAllowed(ARABIC_LOCALES).map((l) => renderItem(l, true))}
      </div>

      {/* Africaines */}
      <div
        style={{
          borderTop: "1px solid rgba(244,228,193,0.08)",
          paddingTop: 4,
        }}
      >
        {renderGroupHeader("🌍", labels.african, openGroup === "african", () =>
          toggleGroup("african"),
        )}
        {openGroup === "african" &&
          filterAllowed(AFRICAN_LOCALES).map((l) => renderItem(l, true))}
      </div>
    </>
  );

  // Variant inline : la liste s'affiche directement (no trigger)
  if (variant === "inline") {
    return (
      <div
        ref={containerRef}
        style={{
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
          padding: 4,
          maxHeight: "min(60vh, 480px)",
          overflowY: "auto",
        }}
      >
        {list}
      </div>
    );
  }

  // Variant dropdown : bouton + popover
  const currentLocaleAsLocale = locale as Locale;
  const currentFlag = LOCALE_FLAGS[currentLocaleAsLocale] ?? "🌐";
  const currentName = LOCALE_NAMES[currentLocaleAsLocale] ?? locale;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          if (show) {
            setShow(false);
            setOpenGroup(null);
          } else {
            setShow(true);
          }
        }}
        aria-label={t("langPicker.changeLanguage")}
        aria-expanded={show}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 10,
          padding: "8px 12px",
          color: "var(--cream, #f4e4c1)",
          cursor: "pointer",
          fontSize: 13,
          minHeight: 40,
          fontFamily: "inherit",
          ...triggerStyle,
        }}
      >
        {currentFlag} {currentName} ▾
      </button>
      {show && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            ...(rtl ? { left: 0 } : { right: 0 }),
            background: "var(--indigo, #16111e)",
            border: "1px solid rgba(232,163,61,0.18)",
            borderRadius: 10,
            padding: 4,
            minWidth: 240,
            maxHeight: "min(75vh, 560px)",
            overflowY: "auto",
            zIndex: 100,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          {list}
        </div>
      )}
    </div>
  );
}
