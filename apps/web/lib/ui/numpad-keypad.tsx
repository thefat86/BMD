"use client";

/**
 * V52.A4 — Numpad custom V45 réutilisable.
 *
 * Composant signature V45 (cf. AUDIT-V45-VS-PROD.md écrans 5 « Add Expense
 * Numpad » et 16 « Création tontine équation live »). V45 demande explicite-
 * ment un numpad UI dédié plutôt qu'un `<input inputMode="decimal">` natif
 * — pour éviter le clavier OS qui mange l'écran et casse l'UX premium.
 *
 * Spec V45 :
 *  - Grille 4×3 (1-9, ',' / 0 / ⌫)
 *  - Touches paper avec ombre douce
 *  - Texte en Cormorant Garamond (signature serif)
 *  - Haptic au tap (vibrate 10ms)
 *  - Bouton backspace = SVG outline (pas d'emoji)
 *
 * Le composant est CONTROLLED — l'appelant gère la `value` (string).
 * Le numpad ne fait que mutater la chaîne et appeler `onChange`.
 *
 * Usage :
 *   const [amount, setAmount] = useState("");
 *   <NumpadKeypad
 *     value={amount}
 *     onChange={setAmount}
 *     maxDecimals={2}
 *   />
 *
 *   // Avec montant max et désactivation conditionnelle
 *   <NumpadKeypad
 *     value={amount}
 *     onChange={setAmount}
 *     maxIntegerDigits={6}
 *     decimalSeparator=","
 *   />
 */
import type { CSSProperties } from "react";
import { Icon } from "./icons/icon";

export interface NumpadKeypadProps {
  /** Valeur courante (string pour conserver "12," intermédiaire). */
  value: string;
  /** Appelé à chaque modification de la valeur. */
  onChange: (next: string) => void;
  /** Séparateur décimal affiché sur la touche. Défaut : ",". */
  decimalSeparator?: "," | ".";
  /** Nombre max de décimales autorisé. Défaut : 2 (devises). */
  maxDecimals?: number;
  /** Nombre max de chiffres dans la partie entière. Défaut : 10. */
  maxIntegerDigits?: number;
  /** Désactive tout le numpad (busy state). */
  disabled?: boolean;
  /** Classe CSS additionnelle sur le wrapper. */
  className?: string;
  /** Style inline supplémentaire. */
  style?: CSSProperties;
  /** Désactive le haptic feedback (utile pour tests Playwright). */
  noHaptic?: boolean;
  /**
   * V123 — Mode compact (padding réduit, fontSize plus petit). Utile
   * pour les sheets/wizards où l'on veut tenir sur 1 viewport sans
   * scroll. La hauteur totale du numpad passe d'environ ~265 px (mode
   * défaut) à ~195 px (compact), et à ~150 px (ultra-compact).
   * Lisibilité préservée : touches restent au-dessus du seuil tactile
   * recommandé (≥40 px de hauteur effective).
   *
   * - `compact: false` (défaut) : padding 16, fontSize 28, gap 8.
   * - `compact: true` : padding 10, fontSize 22, gap 6.
   * - `compact: "ultra"` : padding 6, fontSize 20, gap 5.
   */
  compact?: boolean | "ultra";
}

/**
 * Déclenche un haptic feedback bref. Silencieux si l'API n'existe pas
 * (Safari iOS < 16, browsers non-mobiles, etc.).
 */
function lightTap(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      (navigator as Navigator & { vibrate: (n: number) => void }).vibrate(10);
    } catch {
      /* noop */
    }
  }
}

/**
 * Numpad 4×3 V45 — composant signature à utiliser pour toute saisie
 * monétaire mobile-first (Add Expense, Tontine Create, Booster top-up).
 */
export function NumpadKeypad({
  value,
  onChange,
  decimalSeparator = ",",
  maxDecimals = 2,
  maxIntegerDigits = 10,
  disabled = false,
  className,
  style,
  noHaptic = false,
  compact = false,
}: NumpadKeypadProps) {
  /** Append un caractère à la valeur courante en respectant les contraintes. */
  function appendChar(ch: string): void {
    if (disabled) return;
    if (!noHaptic) lightTap();

    // Cas séparateur décimal : refuser si déjà présent.
    if (ch === decimalSeparator) {
      if (value.includes(decimalSeparator)) return;
      // Pas de "," seul → préfixer "0,"
      onChange(value === "" ? `0${decimalSeparator}` : `${value}${decimalSeparator}`);
      return;
    }

    // Cas chiffre : respecter les limites.
    const [intPart, decPart = ""] = value.split(decimalSeparator);
    const isDecimal = value.includes(decimalSeparator);

    if (isDecimal) {
      // On est dans la partie décimale → respecter maxDecimals.
      if (decPart.length >= maxDecimals) return;
      onChange(`${intPart}${decimalSeparator}${decPart}${ch}`);
    } else {
      // Partie entière → respecter maxIntegerDigits + interdire "0" leading.
      if (intPart === "0") {
        // Remplacer le "0" leading par le nouveau chiffre (sauf si on tape "0" à nouveau).
        if (ch === "0") return;
        onChange(ch);
        return;
      }
      if (intPart.length >= maxIntegerDigits) return;
      onChange(`${intPart}${ch}`);
    }
  }

  function backspace(): void {
    if (disabled || value === "") return;
    if (!noHaptic) lightTap();
    onChange(value.slice(0, -1));
  }

  // Layout 4 lignes × 3 colonnes (style V45) :
  // [1] [2] [3]
  // [4] [5] [6]
  // [7] [8] [9]
  // [,] [0] [⌫]
  const keys: Array<{
    label: string;
    onClick: () => void;
    isAction?: boolean;
  }> = [
    { label: "1", onClick: () => appendChar("1") },
    { label: "2", onClick: () => appendChar("2") },
    { label: "3", onClick: () => appendChar("3") },
    { label: "4", onClick: () => appendChar("4") },
    { label: "5", onClick: () => appendChar("5") },
    { label: "6", onClick: () => appendChar("6") },
    { label: "7", onClick: () => appendChar("7") },
    { label: "8", onClick: () => appendChar("8") },
    { label: "9", onClick: () => appendChar("9") },
    { label: decimalSeparator, onClick: () => appendChar(decimalSeparator) },
    { label: "0", onClick: () => appendChar("0") },
    { label: "⌫", onClick: backspace, isAction: true },
  ];

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        // V123 — Gap selon mode : default 8, compact 6, ultra 5.
        gap: compact === "ultra" ? 5 : compact ? 6 : 8,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
        ...style,
      }}
    >
      {keys.map((k, idx) => (
        <button
          key={`${k.label}-${idx}`}
          type="button"
          onClick={k.onClick}
          disabled={disabled}
          aria-label={
            k.isAction
              ? "Effacer le dernier chiffre"
              : k.label === decimalSeparator
                ? "Séparateur décimal"
                : `Chiffre ${k.label}`
          }
          style={{
            // Touche style V45 : paper card avec ombre douce
            background: "var(--paper, #FFFFFF)",
            color: "var(--cocoa, #2B1F15)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
            borderRadius: compact === "ultra" ? 10 : compact ? 12 : 14,
            // V123 — Padding selon mode : default 16, compact 10, ultra 6.
            padding:
              compact === "ultra" ? "6px 0" : compact ? "10px 0" : "16px 0",
            // Cormorant Garamond pour les chiffres — signature V45
            fontFamily: k.isAction
              ? "inherit"
              : "'Cormorant Garamond', Georgia, serif",
            // V123 — Taille du chiffre : default 28, compact 22, ultra 20.
            fontSize: k.isAction
              ? 0
              : compact === "ultra"
                ? 20
                : compact
                  ? 22
                  : 28,
            fontWeight: 600,
            lineHeight: 1,
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "transform 0.08s ease, background 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            // Ombre paper V45
            boxShadow: "0 1px 3px rgba(43,31,21,0.04), 0 2px 8px rgba(43,31,21,0.03)",
            WebkitTapHighlightColor: "transparent",
            userSelect: "none",
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "scale(0.96)";
            e.currentTarget.style.background = "var(--v45-saffron-pale, #F6E8C5)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.background = "var(--paper, #FFFFFF)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.background = "var(--paper, #FFFFFF)";
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = "scale(0.96)";
            e.currentTarget.style.background = "var(--v45-saffron-pale, #F6E8C5)";
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.background = "var(--paper, #FFFFFF)";
          }}
        >
          {k.isAction ? (
            // Backspace SVG outline (pas d'emoji)
            <Icon
              name="x"
              size={24}
              color="var(--cocoa-soft, #6B5A47)"
              strokeWidth={1.8}
              ariaLabel="Effacer"
            />
          ) : (
            k.label
          )}
        </button>
      ))}
    </div>
  );
}
