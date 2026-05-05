/**
 * Validateurs locaux pour le frontend web (E.164 / RFC 5322 simplifié).
 * Doublé sur apps/api/src/lib/validators.ts — garder les deux en sync.
 */

export interface ValidationResult {
  ok: boolean;
  value?: string;
  code?:
    | "EMPTY"
    | "TOO_SHORT"
    | "TOO_LONG"
    | "INVALID_FORMAT"
    | "MISSING_PLUS"
    | "INVALID_DOMAIN"
    | "INVALID_LOCAL_PART";
  message?: string;
}

export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  return cleaned;
}

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

export function validateContact(
  contactType: "PHONE" | "EMAIL",
  contactValue: string,
): ValidationResult {
  return contactType === "PHONE"
    ? validatePhone(contactValue)
    : validateEmail(contactValue);
}
