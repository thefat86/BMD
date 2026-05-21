"use client";

/**
 * V215.B2 — Sélecteur de devise compact pour formulaires V45-light.
 *
 * Usage : `<CurrencySelector value={currency} onChange={setCurrency} />`
 *
 * Affichage : select natif stylé V45, montre le code + symbole entre parenthèses
 * (ex: « EUR (€) », « XOF (FCFA) »). Le nom complet apparaît dans le menu
 * déroulant pour aider l'utilisateur à reconnaître la devise.
 *
 * Pour les caisses projet et dépenses : indique au backend quelle est la devise
 * de l'opération. Tous les autres membres voient ensuite la conversion FX dans
 * leur devise locale via les helpers existants.
 */

import { CURRENCIES } from "../currencies";

export function CurrencySelector({
  value,
  onChange,
  disabled,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel || "Devise"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        padding: "6px 9px",
        background: "#FFFFFF",
        border: "0.5px solid #D9C8A6",
        borderRadius: 7,
        fontSize: 12,
        color: "#2B1F15",
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} ({c.symbol}) — {c.name}
        </option>
      ))}
    </select>
  );
}
