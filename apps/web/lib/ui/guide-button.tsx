"use client";

/**
 * V223.G — `<GuideButton>` réutilisable.
 *
 * Pattern extrait du drawer dépense desktop (V218.B) : un footer "sticky"
 * qui combine 3 états visuels selon l'avancement d'un formulaire :
 *  1. Erreur backend (terracotta) → banner ✕ + bouton actif (peut retenter).
 *  2. Actions manquantes (saffron) → banner avec la 1ère action + pill
 *     "+N étapes restantes" + bouton grisé "Compléter pour activer".
 *  3. Tout est ok → pas de banner + bouton coloré actif (saffron/cocoa/sage/
 *     terracotta selon `variant`).
 *
 * Le composant est volontairement autonome — il n'a pas besoin d'autre
 * dépendance que `useT()`. Aucune logique métier dedans : c'est au parent
 * de calculer `missingActions` et `errorMessage`.
 *
 * Usage typique :
 * ```tsx
 * const missingActions = useMemo(() => {
 *   const list: string[] = [];
 *   if (!name) list.push("Indique le nom");
 *   if (amount <= 0) list.push("Indique un montant");
 *   return list;
 * }, [name, amount]);
 *
 * <GuideButton
 *   missingActions={missingActions}
 *   label="Créer la chose"
 *   errorMessage={submitError}
 *   onErrorDismiss={() => setSubmitError(null)}
 *   onSubmit={handleSubmit}
 *   submitting={saving}
 * />
 * ```
 */

import { useT } from "../i18n/app-strings";

export type GuideButtonVariant = "saffron" | "cocoa" | "sage" | "terracotta";

/**
 * V238.A — Le banner erreur supporte désormais 2 formats :
 *  - `string` (rétrocompat : tout ce qui existait avant V238)
 *  - `{ title, body }` (nouveau, produit par `parseApiError()` dans
 *    `lib/api-errors.ts`). `title` est affiché en bold, `body` en dessous
 *    avec un wrap propre. Permet des messages parlants type
 *    « Connexion impossible / Vérifie ta connexion internet ».
 */
export type GuideButtonError =
  | string
  | { title: string; body?: string }
  | null
  | undefined;

export interface GuideButtonProps {
  /**
   * Liste des actions manquantes, cascadée. Le 1er élément est celui
   * affiché en banner — le compteur "+N étapes restantes" reprend les
   * autres. Si vide, le bouton est actif (sauf submitting / error).
   */
  missingActions: string[];
  /** Texte du bouton quand actif. */
  label: string;
  /** Texte du bouton quand grisé. Défaut: "Compléter pour activer". */
  disabledLabel?: string;
  /** Couleur du bouton actif. Défaut: saffron. */
  variant?: GuideButtonVariant;
  /** Erreur backend persistante. Si non-null, prend priorité sur le banner saffron. */
  errorMessage?: GuideButtonError;
  /** Callback pour fermer le banner erreur (croix ✕). */
  onErrorDismiss?: () => void;
  /** Click sur le bouton actif. */
  onSubmit: () => void;
  /** Affiche "…" à la place du label et grise le bouton. */
  submitting?: boolean;
  /** Mode compact : padding et fontSize réduits. */
  compact?: boolean;
  /** Texte du bouton "Annuler" optionnel à gauche. */
  secondaryLabel?: string;
  /** Click sur Annuler. */
  onSecondary?: () => void;
}

const VARIANT_COLORS: Record<GuideButtonVariant, { bg: string; fg: string }> = {
  saffron: { bg: "#C58A2E", fg: "#2B1F15" },
  cocoa: { bg: "#2B1F15", fg: "#FAF6EE" },
  sage: { bg: "#1F7A57", fg: "#FFFFFF" },
  terracotta: { bg: "#9F4628", fg: "#FFFFFF" },
};

export function GuideButton({
  missingActions,
  label,
  disabledLabel,
  variant = "saffron",
  errorMessage,
  onErrorDismiss,
  onSubmit,
  submitting = false,
  compact = false,
  secondaryLabel,
  onSecondary,
}: GuideButtonProps): JSX.Element {
  const t = useT();
  // V238.A — Normalise errorMessage en { title, body } pour homogénéiser
  // l'affichage. `string` legacy → { title, body: "" }.
  const errorObj =
    typeof errorMessage === "string"
      ? { title: errorMessage, body: "" }
      : errorMessage && typeof errorMessage === "object"
        ? { title: errorMessage.title, body: errorMessage.body ?? "" }
        : null;
  const hasError = Boolean(errorObj);
  const hasMissing = !hasError && missingActions.length > 0;
  const canSubmit = !hasMissing && !submitting;
  const colors = VARIANT_COLORS[variant];

  const bannerPaddingY = compact ? 10 : 14;
  const bannerPaddingX = compact ? 14 : 18;
  const bannerRadius = compact ? 9 : 11;
  const bannerFontSize = compact ? 11 : 12;

  const buttonPadding = compact ? "8px 16px" : "10px 22px";
  const buttonFontSize = compact ? 12 : 13;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* Banner erreur backend (priorité maximale)
          V238.A — Affichage `title` en bold + `body` en dessous (si fourni). */}
      {hasError && errorObj && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: `${bannerPaddingY}px ${bannerPaddingX}px`,
            background: "rgba(159,70,40,0.08)",
            border: "0.5px solid rgba(159,70,40,0.35)",
            borderLeft: "3px solid #9F4628",
            borderRadius: bannerRadius,
            color: "#9F4628",
            fontSize: bannerFontSize,
            transition: "opacity 0.2s ease",
          }}
        >
          <span
            style={{
              fontSize: bannerFontSize + 2,
              lineHeight: 1.2,
              marginTop: 1,
            }}
            aria-hidden="true"
          >
            !
          </span>
          <span
            style={{
              flex: 1,
              color: "#2B1F15",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 0,
              wordBreak: "break-word",
            }}
          >
            <strong style={{ fontWeight: 600 }}>{errorObj.title}</strong>
            {errorObj.body ? (
              <span style={{ color: "#5A4632", fontSize: bannerFontSize - 1 }}>
                {errorObj.body}
              </span>
            ) : null}
          </span>
          {onErrorDismiss && (
            <button
              type="button"
              onClick={onErrorDismiss}
              aria-label={t("guide.dismissError") || "Fermer"}
              style={{
                background: "transparent",
                border: "none",
                color: "#9F4628",
                cursor: "pointer",
                padding: "0 4px",
                fontFamily: "inherit",
                fontSize: bannerFontSize + 2,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Banner actions manquantes (saffron) */}
      {hasMissing && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: `${bannerPaddingY}px ${bannerPaddingX}px`,
            background: "#FAEFD3",
            border: "0.5px solid rgba(197,138,46,0.35)",
            borderLeft: "3px solid #C58A2E",
            borderRadius: bannerRadius,
            color: "#2B1F15",
            fontSize: bannerFontSize,
            transition: "opacity 0.2s ease",
          }}
        >
          <span style={{ fontSize: bannerFontSize + 2, color: "#C58A2E" }}>
            →
          </span>
          <span style={{ flex: 1, color: "#2B1F15" }}>
            {missingActions[0]}
          </span>
          {missingActions.length > 1 && (
            <span
              style={{
                background: "rgba(43,31,21,0.08)",
                color: "#5A4632",
                padding: "2px 7px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {/* V225 — t() BMD interpole `{count}` single-brace directement */}
              {t("guide.stepsRemaining", {
                count: String(missingActions.length - 1),
              }) || `+${missingActions.length - 1} étapes restantes`}
            </span>
          )}
        </div>
      )}

      {/* Ligne bouton(s) */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            disabled={submitting}
            style={{
              padding: buttonPadding,
              background: "transparent",
              color: "#8B6F47",
              border: "none",
              borderRadius: 9,
              fontSize: buttonFontSize,
              cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          // En mode erreur on garde le bouton cliquable (retry possible).
          // En mode actions manquantes on grise (visuellement non-cliquable).
          disabled={hasMissing || submitting}
          style={{
            padding: buttonPadding,
            background: hasMissing || submitting ? "#D9C8A6" : colors.bg,
            color: hasMissing || submitting ? "#2B1F15" : colors.fg,
            border: "none",
            borderRadius: 9,
            fontSize: buttonFontSize,
            fontWeight: 500,
            cursor: hasMissing
              ? "not-allowed"
              : submitting
                ? "wait"
                : "pointer",
            opacity: hasMissing ? 0.4 : 1,
            fontFamily: "inherit",
            transition: "opacity 0.2s ease, background 0.2s ease",
          }}
        >
          {submitting
            ? "…"
            : hasMissing
              ? disabledLabel ||
                t("guide.completeToActivate") ||
                "Compléter pour activer"
              : label}
        </button>
      </div>
    </div>
  );
}

export default GuideButton;
