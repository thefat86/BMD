/**
 * Validateurs partagés entre frontend et backend pour garantir la cohérence
 * des contrôles d'entrée. La règle d'or : la même fonction est utilisée des
 * deux côtés pour éviter qu'une donnée acceptée côté client ne soit refusée
 * par le serveur (et vice-versa).
 *
 * Format imposé pour les téléphones : E.164 international.
 *   ✓ "+33612345678", "+237691234567", "+15551234567"
 *   ✗ "0612345678", "06 12 34 56 78", "+33 6 12 34 56 78 (sans normalisation)"
 *
 * On normalise systématiquement avant validation : on garde le "+" en tête
 * et uniquement les chiffres, puis on vérifie les bornes E.164 (8-15 chiffres).
 */

export interface ValidationResult {
  ok: boolean;
  /** Valeur normalisée si ok=true */
  value?: string;
  /** Code d'erreur stable, traduisible côté UI */
  code?:
    | "EMPTY"
    | "TOO_SHORT"
    | "TOO_LONG"
    | "INVALID_FORMAT"
    | "MISSING_PLUS"
    | "INVALID_DOMAIN"
    | "INVALID_LOCAL_PART";
  /** Message lisible en français */
  message?: string;
}

/**
 * Normalise un numéro saisi à la main (avec espaces, tirets, parenthèses)
 * en E.164. Ajoute "+" si absent quand on détecte un préfixe pays plausible.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  // Garder + en tête + chiffres
  let cleaned = raw.replace(/[^\d+]/g, "");
  // Si l'utilisateur a tapé "00" en préfixe international (usage français), convertir en "+"
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  // Si pas de + mais commence par 0 → on ne préfixe PAS automatiquement (ambigu)
  return cleaned;
}

/**
 * Valide un numéro au format E.164. Retourne {ok, value normalized, code}.
 *
 * Règles E.164 :
 *  - Doit commencer par "+"
 *  - Suivi du préfixe pays (1-3 chiffres) puis du numéro national
 *  - Total chiffres après "+" entre 8 et 15
 *  - Premier chiffre après "+" ne peut pas être 0
 */
export function validatePhone(raw: string): ValidationResult {
  const value = normalizePhone(raw);
  if (!value) {
    return { ok: false, code: "EMPTY", message: "Le numéro est requis" };
  }
  if (!value.startsWith("+")) {
    return {
      ok: false,
      code: "MISSING_PLUS",
      message:
        "Numéro au format international requis (ex: +33612345678 ou +237691234567)",
    };
  }
  const digits = value.slice(1);
  if (!/^\d+$/.test(digits)) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "Le numéro contient des caractères non valides",
    };
  }
  if (digits.length < 8) {
    return { ok: false, code: "TOO_SHORT", message: "Numéro trop court" };
  }
  if (digits.length > 15) {
    return { ok: false, code: "TOO_LONG", message: "Numéro trop long" };
  }
  if (digits.startsWith("0")) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "Le préfixe pays ne peut pas commencer par 0",
    };
  }
  return { ok: true, value };
}

/**
 * Valide un email selon une regex pragmatique conforme RFC 5322 simplifiée.
 *  - Local part : alphanumérique + . _ % + -
 *  - @ obligatoire
 *  - Domaine : alphanumérique + tirets, au moins 1 point
 *  - TLD : 2-24 caractères alphabétiques
 *  - Lowercase la value en sortie pour normalisation
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validateEmail(raw: string): ValidationResult {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) {
    return { ok: false, code: "EMPTY", message: "L'email est requis" };
  }
  if (value.length > 254) {
    return { ok: false, code: "TOO_LONG", message: "Email trop long" };
  }
  if (!EMAIL_REGEX.test(value)) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "Format email invalide (ex: nom@exemple.com)",
    };
  }
  // Vérifie que la partie locale ne commence/finit pas par un point
  const [local, domain] = value.split("@");
  if (
    !local ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return {
      ok: false,
      code: "INVALID_LOCAL_PART",
      message: "Partie avant le @ invalide",
    };
  }
  if (!domain || domain.startsWith("-") || domain.endsWith("-")) {
    return {
      ok: false,
      code: "INVALID_DOMAIN",
      message: "Domaine invalide",
    };
  }
  return { ok: true, value };
}

/**
 * Valide un contact (PHONE ou EMAIL) selon son type.
 */
export function validateContact(
  contactType: "PHONE" | "EMAIL",
  contactValue: string,
): ValidationResult {
  return contactType === "PHONE"
    ? validatePhone(contactValue)
    : validateEmail(contactValue);
}
