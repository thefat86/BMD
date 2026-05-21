/**
 * Helpers pour les moyens de paiement (spec §9.1).
 *
 * - normalizeValue : nettoie la saisie utilisateur (espaces, tirets…)
 * - autoDetectType : devine le type depuis le format de la valeur
 * - extractLast4   : 4 derniers caractères significatifs pour affichage
 */

export type PaymentMethodType =
  | "LYDIA"
  | "WAVE"
  | "ORANGE_MONEY"
  | "MTN_MOMO"
  | "MPESA"
  | "AIRTEL_MONEY"
  | "MOOV_MONEY"
  | "WERO"
  | "WISE"
  | "REVOLUT"
  | "PAYPAL"
  | "IBAN"
  | "TWINT"
  | "INTERAC"
  | "OTHER";

export const PAYMENT_METHOD_TYPES: ReadonlyArray<PaymentMethodType> = [
  "LYDIA",
  "WAVE",
  "ORANGE_MONEY",
  "MTN_MOMO",
  "MPESA",
  "AIRTEL_MONEY",
  "MOOV_MONEY",
  "WERO",
  "WISE",
  "REVOLUT",
  "PAYPAL",
  "IBAN",
  "TWINT",
  "INTERAC",
  "OTHER",
];

const TYPE_LABELS: Record<PaymentMethodType, { name: string; emoji: string }> =
  {
    LYDIA: { name: "Lydia", emoji: "💙" },
    WAVE: { name: "Wave", emoji: "🌊" },
    ORANGE_MONEY: { name: "Orange Money", emoji: "🟠" },
    MTN_MOMO: { name: "MTN MoMo", emoji: "🟡" },
    MPESA: { name: "M-Pesa", emoji: "📱" },
    AIRTEL_MONEY: { name: "Airtel Money", emoji: "🔴" },
    MOOV_MONEY: { name: "Moov Money", emoji: "🔵" },
    WERO: { name: "Wero (SEPA Instant)", emoji: "💶" },
    WISE: { name: "Wise", emoji: "🌍" },
    REVOLUT: { name: "Revolut", emoji: "🟣" },
    PAYPAL: { name: "PayPal", emoji: "🅿️" },
    IBAN: { name: "IBAN / Virement", emoji: "🏦" },
    TWINT: { name: "TWINT", emoji: "🇨🇭" },
    INTERAC: { name: "Interac", emoji: "🇨🇦" },
    OTHER: { name: "Autre", emoji: "💳" },
  };

export function getTypeLabel(t: string): { name: string; emoji: string } {
  return TYPE_LABELS[t as PaymentMethodType] ?? TYPE_LABELS.OTHER;
}

/**
 * Nettoie une valeur saisie : supprime espaces, tirets, points.
 * Pour IBAN : on garde uniquement alphanumérique en majuscules.
 * Pour téléphone : on garde le `+` initial + chiffres.
 * Pour email : on lowercase + trim.
 */
export function normalizeValue(
  type: PaymentMethodType,
  raw: string,
): string {
  const trimmed = raw.trim();
  switch (type) {
    case "IBAN":
      return trimmed.replace(/[\s.-]/g, "").toUpperCase();
    case "PAYPAL":
      return trimmed.toLowerCase();
    case "WISE":
      // Wise = email ou identifiant, on lower si email
      return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
    default:
      // Mobile Money / téléphones : garder + et chiffres
      return trimmed.replace(/[\s.-]/g, "");
  }
}

/**
 * Tente de deviner le type depuis le format de la valeur.
 * Heuristique : si l'utilisateur ne précise pas, on propose le plus probable.
 *
 * - "FR76 3000 4000…" → IBAN
 * - "+33 6 12 34 56 78" → MOBILE_GENERIC (l'user choisit le service précis)
 * - "user@gmail.com" → PAYPAL (le plus commun) ou WISE
 * - sinon → OTHER
 */
export function autoDetectType(raw: string): PaymentMethodType {
  const cleaned = raw.trim();
  // IBAN : 2 lettres pays + 2 chiffres + 11-30 alphanum
  if (/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/i.test(cleaned)) return "IBAN";
  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return "PAYPAL";
  // Téléphone E.164 ou numéro local FR
  if (/^\+?\d[\d\s.-]{6,20}$/.test(cleaned)) return "ORANGE_MONEY"; // par défaut suggestion
  return "OTHER";
}

/**
 * Extrait les 4 derniers caractères significatifs pour affichage.
 *  - IBAN → 4 derniers chiffres du compte
 *  - Téléphone → 4 derniers chiffres
 *  - Email → 4 derniers caractères avant le @
 *  - Sinon → 4 derniers caractères
 *
 * N'EXPOSE JAMAIS plus de 4 caractères de la valeur en clair.
 */
export function extractLast4(type: PaymentMethodType, value: string): string {
  if (type === "PAYPAL" || type === "WISE") {
    const at = value.lastIndexOf("@");
    const local = at > 0 ? value.slice(0, at) : value;
    return local.slice(-4).padStart(4, "•");
  }
  // Pour IBAN et téléphones : 4 derniers caractères alphanumériques
  const alnum = value.replace(/[^A-Z0-9]/gi, "");
  return alnum.slice(-4).padStart(4, "•");
}

/**
 * Validation basique côté serveur. Retourne null si OK, sinon un message
 * d'erreur chaleureux.
 */
export function validateValueForType(
  type: PaymentMethodType,
  value: string,
): string | null {
  if (!value || value.length < 4) return "Valeur trop courte.";
  if (value.length > 100) return "Valeur trop longue (max 100 caractères).";
  if (type === "IBAN") {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value)) {
      return "L'IBAN doit commencer par 2 lettres + 2 chiffres + 10 à 30 caractères alphanumériques.";
    }
  }
  if (type === "PAYPAL" || (type === "WISE" && value.includes("@"))) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return "Format d'email invalide.";
    }
  }
  return null;
}
