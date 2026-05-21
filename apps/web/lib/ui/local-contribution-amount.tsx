"use client";

/**
 * <LocalContributionAmount> · Affiche le montant à payer dans la devise
 * locale du contributeur (spec §3.4 §4.4).
 *
 * Cas d'usage : tontine en EUR, mais Marie est à Yaoundé (XAF).
 * → on lui affiche "65 600 XAF (équivalent à 100 EUR au taux du jour)"
 *   pour qu'elle sache exactement combien envoyer via Orange Money.
 *
 * Si le contributeur a la même devise que la tontine, on n'affiche rien
 * (info redondante avec le montant déjà visible ailleurs).
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";

interface Props {
  contributionId: string;
  /** Affichage compact (1 ligne) ou détaillé (2 lignes avec taux). */
  compact?: boolean;
}

export function LocalContributionAmount({
  contributionId,
  compact = false,
}: Props) {
  const [data, setData] = useState<{
    amountInTontineCurrency: string;
    tontineCurrency: string;
    amountInMyCurrency: string;
    myCurrency: string;
    hasConversion: boolean;
    rate: number | null;
  } | null>(null);

  useEffect(() => {
    api
      .getMyContributionLocalAmount(contributionId)
      .then(setData)
      .catch(() => setData(null));
  }, [contributionId]);

  if (!data || !data.hasConversion) return null;

  const formattedLocal = formatAmount(
    parseFloat(data.amountInMyCurrency),
    data.myCurrency,
  );
  const formattedTontine = formatAmount(
    parseFloat(data.amountInTontineCurrency),
    data.tontineCurrency,
  );

  if (compact) {
    return (
      <span
        style={{
          fontSize: 11,
          color: "var(--saffron, #b54732)",
          fontWeight: 600,
        }}
        title={`Taux : 1 ${data.tontineCurrency} = ${data.rate?.toFixed(4)} ${data.myCurrency}`}
      >
        💱 ≈ {formattedLocal}
      </span>
    );
  }

  return (
    <div
      style={{
        background: "rgba(232,163,61,0.06)",
        border: "1px solid rgba(232,163,61,0.2)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: "var(--cream, #1a1625)",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>
        💱 À envoyer en {data.myCurrency} :{" "}
        <strong style={{ color: "var(--saffron, #b54732)" }}>
          {formattedLocal}
        </strong>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--muted, #7c6e93)",
          marginTop: 4,
        }}
      >
        Équivaut à {formattedTontine} (devise de la tontine) ·{" "}
        Taux du jour : 1 {data.tontineCurrency} ={" "}
        {data.rate?.toFixed(data.myCurrency === "XAF" || data.myCurrency === "XOF" ? 0 : 4)}{" "}
        {data.myCurrency}
      </div>
    </div>
  );
}

// Petite mise en forme locale-aware (XAF/XOF sans décimales, autres avec)
function formatAmount(amount: number, currency: string): string {
  const noDecimals = ["XAF", "XOF", "KES", "TZS", "UGX", "RWF", "CDF"];
  const decimals = noDecimals.includes(currency) ? 0 : 2;
  return `${amount.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${currency}`;
}
