"use client";

/**
 * <Money> · affichage universel de montant qui suit la devise active.
 *
 * Pourquoi ce composant existe :
 * Avant, chaque composant affichait `${amount} ${currency}` à la main, donc
 * quand l'utilisateur changeait sa devise depuis son profil, RIEN ne se
 * reconvertit en temps réel. Avec <Money>, on s'abonne au CurrencyProvider
 * via useCurrency() — chaque changement de devise déclenche un re-render
 * automatique de TOUS les <Money> de l'écran avec le bon taux du jour.
 *
 * Usage :
 *   <Money amount={75.50} currency="EUR" />
 *   <Money amount="12000" currency="XAF" showFxHint />
 *
 * Props :
 *  - amount : montant brut (number ou string décimal)
 *  - currency : devise du montant SOURCE (3 lettres ISO 4217)
 *  - showFxHint : si true et qu'une conversion FX a eu lieu, affiche un
 *    petit badge "≈" à côté du montant pour signaler que c'est converti.
 *  - signed : si true, prefix "+" pour les montants positifs, "−" pour négatifs
 *    (utile pour afficher des soldes "+ 247,50 €" / "− 89,00 €")
 *  - className / style : pass-through
 */

import { useCurrency } from "../currency-provider";

interface Props {
  amount: number | string;
  currency: string;
  showFxHint?: boolean;
  signed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Hide the converted-from-tooltip even when relevant (compact UI) */
  hideTooltip?: boolean;
}

export function Money({
  amount,
  currency,
  showFxHint,
  signed,
  className,
  style,
  hideTooltip,
}: Props): JSX.Element {
  const { code: activeCode, formatAmount, convert } = useCurrency();
  const num =
    typeof amount === "string" ? parseFloat(amount || "0") : amount;
  const safeNum = Number.isFinite(num) ? num : 0;
  const sign = signed ? (safeNum > 0 ? "+ " : safeNum < 0 ? "− " : "") : "";
  const absAmount = signed ? Math.abs(safeNum) : safeNum;
  const formatted = formatAmount(absAmount, currency);
  const wasConverted =
    currency.toUpperCase() !== activeCode.toUpperCase();

  const tooltip =
    !hideTooltip && wasConverted
      ? `${num.toLocaleString("fr-FR")} ${currency.toUpperCase()} → ${formatted} (taux du jour)`
      : undefined;

  return (
    <span
      className={className}
      style={style}
      title={tooltip}
      data-currency-source={currency.toUpperCase()}
      data-currency-display={activeCode.toUpperCase()}
    >
      {sign}
      {formatted}
      {showFxHint && wasConverted && (
        <span
          aria-hidden="true"
          style={{
            marginLeft: 4,
            fontSize: "0.75em",
            opacity: 0.6,
            fontWeight: 500,
          }}
        >
          ≈
        </span>
      )}
    </span>
  );
}

/**
 * Helper hook : version impérative pour les contextes qui ne peuvent pas
 * rendre du JSX (titles dynamiques, dialogues, exports CSV).
 */
export function useMoneyFormat() {
  const { formatAmount, convert, code } = useCurrency();
  return { format: formatAmount, convert, code };
}
