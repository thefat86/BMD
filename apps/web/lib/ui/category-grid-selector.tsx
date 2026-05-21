"use client";

/**
 * <CategoryGridSelector /> · V83 — Sélecteur de catégorie pour dépense.
 *
 * Grille 3-col de 6 chips (resto / courses / transport / logement / loisirs /
 * autres) avec icône V45 outline + libellé i18n. Pré-sélection passée en
 * props (provient de l'IA scan OCR ou voice) ; l'utilisateur peut surcharger
 * ou désélectionner (clic sur la chip active → repasse à null).
 *
 * Composant volontairement mince et stateless — pas de logique métier ici.
 * Réutilisable dans :
 *  - mobile-add-expense-sheet (V83 saisie manuelle)
 *  - édition d'une dépense existante
 *  - filtres futurs (vue par catégorie)
 */

import {
  EXPENSE_CATEGORY_VALUES,
  type ExpenseCategoryValue,
} from "@bmd/shared-types";
import { Icon, type IconName } from "./icons";
import { useT } from "../i18n/app-strings";
import { haptic } from "../platform";

/**
 * Mapping value → icône V45 outline. Source unique côté front pour
 * l'iconographie des catégories (CategoryRulesBlock utilise le même
 * registry pour la cohérence visuelle).
 */
const CATEGORY_ICONS: Record<ExpenseCategoryValue, IconName> = {
  resto: "utensils",
  courses: "shopping-cart",
  transport: "car",
  logement: "home",
  loisirs: "party-popper",
  autres: "folder",
};

/**
 * Labels par défaut FR — utilisés en fallback si la locale courante n'a
 * pas la clé i18n. Strict i18n rule BMD : fallback = EN ; mais ici on
 * laisse FR car ces 6 mots sont des noms communs courts qui marchent
 * presque tels quels dans les langues sœurs (resto / courses / etc.
 * sont aussi compris en luxembourgeois, italien, etc.). V83.5
 * complétera les vraies traductions.
 */
const CATEGORY_LABEL_FALLBACK: Record<ExpenseCategoryValue, string> = {
  resto: "Resto",
  courses: "Courses",
  transport: "Transport",
  logement: "Logement",
  loisirs: "Loisirs",
  autres: "Autres",
};

export interface CategoryGridSelectorProps {
  value: ExpenseCategoryValue | null;
  onChange: (next: ExpenseCategoryValue | null) => void;
  /** True = montre un libellé "Catégorie" + tag IA si pré-rempli. Défaut : true. */
  showLabel?: boolean;
  /**
   * True = la sélection a été pré-remplie par l'IA (scan ou voice). Affiche
   * un mini-tag "auto" pour signaler à l'utilisateur que c'est modifiable.
   */
  fromAI?: boolean;
  /** Désactive le composant (pendant submit, etc.). */
  disabled?: boolean;
}

export function CategoryGridSelector({
  value,
  onChange,
  showLabel = true,
  fromAI = false,
  disabled = false,
}: CategoryGridSelectorProps) {
  const t = useT();

  function handlePick(next: ExpenseCategoryValue) {
    if (disabled) return;
    haptic("tap");
    // Tap sur la chip déjà active = désélectionner (UX standard mobile).
    onChange(value === next ? null : next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {showLabel && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: 10,
              color: "var(--saffron)",
              textTransform: "uppercase",
              letterSpacing: 1.4,
              fontWeight: 700,
            }}
          >
            {t("category.label") || "Catégorie"}
          </label>
          {fromAI && value !== null && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "var(--v45-saffron, #C58A2E)",
                background:
                  "var(--v45-saffron-pale, rgba(232,163,61,0.18))",
                border:
                  "1px solid var(--v45-saffron-soft, rgba(232,200,136,0.6))",
                borderRadius: 999,
                padding: "2px 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              aria-label={t("category.detectedAria") || "Détecté automatiquement"}
            >
              <Icon
                name="sparkles"
                size={9}
                color="currentColor"
                strokeWidth={1.6}
              />
              {t("category.detected") || "Auto"}
            </span>
          )}
        </div>
      )}
      <div
        role="radiogroup"
        aria-label={t("category.label") || "Catégorie"}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {EXPENSE_CATEGORY_VALUES.map((cat) => {
          const isActive = value === cat;
          const iconName = CATEGORY_ICONS[cat];
          const label =
            t(`category.${cat}`) || CATEGORY_LABEL_FALLBACK[cat];
          return (
            <button
              key={cat}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={label}
              disabled={disabled}
              onClick={() => handlePick(cat)}
              className="bmd-tap"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "10px 6px",
                minHeight: 64,
                background: isActive
                  ? "linear-gradient(135deg, var(--v45-saffron-pale, rgba(232,163,61,0.18)), rgba(232,163,61,0.06))"
                  : "var(--v45-surface-soft, rgba(244,228,193,0.04))",
                border: isActive
                  ? "1.5px solid var(--v45-saffron, #C58A2E)"
                  : "1px solid var(--v45-border-soft, rgba(244,228,193,0.10))",
                borderRadius: 12,
                color: isActive
                  ? "var(--v45-saffron, #C58A2E)"
                  : "var(--cocoa-soft, var(--cream-soft))",
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: isActive ? 700 : 600,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                boxShadow: isActive
                  ? "0 4px 12px rgba(197,138,46,0.18)"
                  : "none",
                transition:
                  "transform 0.08s ease, background 0.15s ease, border 0.15s ease",
              }}
            >
              <Icon
                name={iconName}
                size={20}
                color="currentColor"
                strokeWidth={isActive ? 1.8 : 1.5}
              />
              <span
                style={{
                  letterSpacing: 0.2,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
