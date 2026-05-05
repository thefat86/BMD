/**
 * @bmd/shared-types
 * Types partagés entre le backend, le client web et (à venir) les apps mobiles.
 * Ces types reflètent le contrat d'API public — ne pas mélanger avec les types Prisma internes.
 */

// === ENUMS ===

export type ContactType = "PHONE" | "EMAIL";

export type GroupType =
  | "TONTINE"
  | "COLOC"
  | "TRAVEL"
  | "EVENT"
  | "CLUB"
  | "PARISH"
  | "GENERIC";

export type MemberRole = "ADMIN" | "TREASURER" | "MEMBER" | "OBSERVER";

export type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE";

export type SettlementStatus = "PROPOSED" | "PAID" | "CONFIRMED" | "CANCELLED";

// === DTO PUBLICS ===

export interface UserPublic {
  id: string;
  displayName: string;
  avatar: string | null;
  defaultCurrency: string;
  defaultLocale: string;
}

export interface ContactPublic {
  id: string;
  type: ContactType;
  value: string;
  isVerified: boolean;
  isPrimary: boolean;
  verifiedAt: string | null;
}

export interface GroupPublic {
  id: string;
  name: string;
  type: GroupType;
  defaultCurrency: string;
  createdAt: string;
  membersCount: number;
}

export interface GroupMemberPublic {
  id: string;
  user: UserPublic;
  role: MemberRole;
  joinedAt: string;
}

export interface ExpenseSharePublic {
  userId: string;
  displayName: string;
  amountOwed: string; // decimal as string for precision
}

export interface ExpensePublic {
  id: string;
  groupId: string;
  description: string;
  amount: string;
  currency: string;
  category: string | null;
  paidBy: UserPublic;
  splitMode: SplitMode;
  occurredAt: string;
  shares: ExpenseSharePublic[];
}

export interface BalancePublic {
  userId: string;
  displayName: string;
  net: string; // positive = owed to you, negative = you owe
  currency: string;
}

export interface SuggestedSettlementPublic {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: string;
  currency: string;
}

// === REQUESTS ===

export interface RequestOtpBody {
  contactType: ContactType;
  contactValue: string;
  channel?: "SMS" | "WHATSAPP" | "EMAIL";
}

export interface VerifyOtpBody {
  contactType: ContactType;
  contactValue: string;
  code: string;
  displayName?: string;
}

export interface CreateGroupBody {
  name: string;
  type: GroupType;
  defaultCurrency?: string;
}

export interface InviteMemberBody {
  contactType: ContactType;
  contactValue: string;
  role?: MemberRole;
}

export interface CreateExpenseBody {
  description: string;
  amount: string;
  currency?: string;
  category?: string;
  paidByUserId?: string; // defaults to current user
  splitMode: SplitMode;
  participants: Array<{ userId: string; share?: number }>; // share = weight or percent depending on splitMode
  occurredAt?: string;
}

// === RESPONSES ===

export interface AuthResponse {
  token: string;
  user: UserPublic;
  expiresAt: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

// === VALIDATORS ===
// Inlined here (au lieu de `export * from "./validators"`) car le package
// shared-types n'est pas en ESM strict, ce qui faisait échouer la résolution
// du re-export quand l'API (ESM) l'importait via tsx watch.

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
 * en E.164. Garde "+" en tête + chiffres uniquement.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.replace(/[^\d+]/g, "");
  // "00..." → "+..." (usage français pour préfixe international)
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  return cleaned;
}

/**
 * Valide un numéro au format E.164.
 *  - Doit commencer par "+"
 *  - 8 à 15 chiffres après le +
 *  - Premier chiffre ne peut pas être 0
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

const EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Valide un email selon une regex pragmatique RFC 5322 simplifiée.
 * Lowercase la value pour normalisation.
 */
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
