/**
 * V215.B2 — Liste centralisée des devises supportées par BMD.
 *
 * Utilisée par :
 *  - <CurrencySelector> dans la création de dépense et de caisse projet
 *  - <LangCurrencyModal> dashboard pour changer la devise d'affichage user
 *  - Conversion FX (helpers tontines-fx / formatAmount)
 *
 * Couverture : zone Euro + USD/CHF/GBP/CAD + Afrique francophone (XOF, XAF,
 * MAD, DZD, TND), Afrique anglophone (NGN, KES, GHS, ZAR), grandes diasporas
 * (BRL, INR, CNY, JPY). Liste pensée pour la diaspora — pas exhaustive ISO 4217.
 */

export interface CurrencyOption {
  /** Code ISO 4217 (3 lettres majuscules). */
  code: string;
  /** Symbole d'affichage (€, $, FCFA…). */
  symbol: string;
  /** Nom complet de la devise (i18n côté UI si besoin). */
  name: string;
}

export const CURRENCIES: CurrencyOption[] = [
  // Zone Euro + grandes devises réserves
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  // Afrique francophone (diaspora cible BMD)
  { code: "XOF", symbol: "FCFA", name: "Franc CFA Ouest" },
  { code: "XAF", symbol: "FCFA", name: "Franc CFA Central" },
  { code: "MAD", symbol: "DH", name: "Dirham marocain" },
  { code: "DZD", symbol: "DA", name: "Dinar algérien" },
  { code: "TND", symbol: "DT", name: "Dinar tunisien" },
  // Afrique anglophone & autres
  { code: "NGN", symbol: "₦", name: "Naira" },
  { code: "KES", symbol: "KSh", name: "Shilling kenyan" },
  { code: "GHS", symbol: "₵", name: "Cedi" },
  { code: "ZAR", symbol: "R", name: "Rand sud-africain" },
  // Diasporas non-africaines courantes
  { code: "BRL", symbol: "R$", name: "Real brésilien" },
  { code: "INR", symbol: "₹", name: "Roupie indienne" },
  { code: "CNY", symbol: "¥", name: "Yuan" },
  { code: "JPY", symbol: "¥", name: "Yen" },
];

/** Retrouve une devise par code ISO. Retourne undefined si inconnu. */
export function findCurrency(code: string): CurrencyOption | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return CURRENCIES.find((c) => c.code === upper);
}

/** Symbole d'une devise (fallback = code lui-même si introuvable). */
export function currencySymbol(code: string): string {
  return findCurrency(code)?.symbol ?? code;
}
