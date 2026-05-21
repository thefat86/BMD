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

// ============================================================
// CMS Pages (spec §6.7) — éditeur drag-drop multi-langue
// ============================================================
//
// Format JSON typé des blocs de pages CMS. Chaque bloc a un id stable
// (uuid) pour permettre le drag & drop sans perdre la sélection.
//
// Les chaînes sont des objets {locale → texte}, avec "fr" comme langue
// de référence obligatoire. Les autres langues sont optionnelles ;
// si manquantes, on tombe en fallback sur "fr".

/** Texte multi-langue : {fr: "...", en?: "...", ar?: "...", ...} */
export type CmsLocalizedText = { fr: string } & Record<string, string>;

export type CmsBlockHeading = {
  id: string;
  type: "heading";
  level: 1 | 2 | 3;
  text: CmsLocalizedText;
  /** Alignement texte */
  align?: "left" | "center" | "right";
};

export type CmsBlockParagraph = {
  id: string;
  type: "paragraph";
  text: CmsLocalizedText;
  align?: "left" | "center" | "right" | "justify";
};

export type CmsBlockImage = {
  id: string;
  type: "image";
  /** URL de l'image (peut être un asset BMD ou externe) */
  src: string;
  alt: CmsLocalizedText;
  /** Légende optionnelle sous l'image */
  caption?: CmsLocalizedText;
  /** Largeur max en % (default: 100) */
  maxWidthPct?: number;
};

export type CmsBlockButton = {
  id: string;
  type: "button";
  label: CmsLocalizedText;
  /** URL de destination (relative ou absolue) */
  href: string;
  /** Style visuel — primary par défaut */
  variant?: "primary" | "ghost" | "subtle";
  /** Ouvre dans un nouvel onglet */
  newTab?: boolean;
};

export type CmsBlockDivider = {
  id: string;
  type: "divider";
  /** Style visuel : "solid" (trait) | "dotted" | "stars" (★ ★ ★) */
  style?: "solid" | "dotted" | "stars";
};

export type CmsBlockQuote = {
  id: string;
  type: "quote";
  text: CmsLocalizedText;
  /** Auteur de la citation (non localisé — c'est un nom propre) */
  author?: string;
};

export type CmsBlock =
  | CmsBlockHeading
  | CmsBlockParagraph
  | CmsBlockImage
  | CmsBlockButton
  | CmsBlockDivider
  | CmsBlockQuote;

export type CmsBlockType = CmsBlock["type"];

export interface CmsPagePublic {
  slug: string;
  title: string;
  blocks: CmsBlock[];
  publishedAt: string | null;
}

/**
 * Helper : retourne le texte localisé. Si la locale demandée n'a pas de
 * traduction, on tombe sur le français (langue de référence).
 */
export function getLocalizedText(
  text: CmsLocalizedText,
  locale: string,
): string {
  if (!text) return "";
  return text[locale] ?? text.fr ?? "";
}

// ============================================================
// V83 · CATÉGORIES DE DÉPENSE — source de vérité unique
// ============================================================
//
// Liste fermée des 6 catégories canoniques utilisées dans tout BMD :
//   resto / courses / transport / logement / loisirs / autres.
//
// Pourquoi un module partagé ? Avant V83 :
//   - apps/web/lib/ui/category-rules-block.tsx hardcodait ces 6 valeurs
//   - apps/api/src/modules/ai/ai.service.ts les redéclarait pour le LLM
//   - apps/api/src/modules/ocr/receipt-parser.ts utilisait "Restaurant" /
//     "Voyage" (titre case + 6e clé hors-liste) → mismatch silencieux :
//     un scan "Voyage" ne matchait aucune règle côté front.
//
// Cette source unique élimine ce risque. Les apps importent :
//   - `ExpenseCategoryValue` (type fermé)
//   - `EXPENSE_CATEGORY_VALUES` (array readonly pour les loops)
//   - `normalizeExpenseCategory(any)` (helper tolérant : accepte
//     "Restaurant", "RESTO", "voyage", "Other"... et renvoie une valeur
//     canonique ou null si introuvable).
//
// Les LABELS et ICÔNES restent côté apps (i18n + icon registry V45).

export type ExpenseCategoryValue =
  | "resto"
  | "courses"
  | "transport"
  | "logement"
  | "loisirs"
  | "autres";

// V87 — Type explicite + `as const` simple. Avant : `as const satisfies
// readonly ExpenseCategoryValue[]` faisait planter tsx watch (parser
// CHALOIR de la combinaison). Tsc l'acceptait → vitest passait, mais
// le runtime dev (`npm run dev` via tsx) ratait silencieusement TOUS
// les exports suivants (EXPENSE_CATEGORY_KEYWORDS, normalizeExpenseCategory)
// → l'API plantait au démarrage : `does not provide an export named ...`.
export const EXPENSE_CATEGORY_VALUES: readonly ExpenseCategoryValue[] = [
  "resto",
  "courses",
  "transport",
  "logement",
  "loisirs",
  "autres",
];

/**
 * Mots-clés associés à chaque catégorie — utilisés par le parser OCR
 * (apps/api/src/modules/ocr/receipt-parser.ts) ET par le fallback
 * heuristique du voice/parse-expense (ai.service.ts) quand le LLM échoue.
 *
 * Convention : tous les mots-clés sont en minuscules, accents conservés
 * pour matcher du texte normalisé en lowercase. Les noms d'enseignes FR
 * dominent (BMD = diaspora francophone) mais on inclut quelques chaînes
 * anglo pour les groupes qui voyagent (Uber, Booking, etc.).
 *
 * Les voyages (hôtel / airbnb / vols / billets) sont placés sous
 * "loisirs" et non "transport" car BMD est avant tout une app de
 * dépenses partagées sociales (vacances, weekends entre amis).
 */
export const EXPENSE_CATEGORY_KEYWORDS: Record<ExpenseCategoryValue, string[]> = {
  resto: [
    "resto",
    "restaurant",
    "brasserie",
    "bistrot",
    "café",
    "cafe",
    "bar",
    "pizza",
    "kebab",
    "sushi",
    "burger",
    "mcdonald",
    "kfc",
    "subway",
    "tacos",
    "asian",
    "thai",
    "chinois",
    "indien",
    "africain",
    "libanais",
    "déjeuner",
    "diner",
    "dîner",
    "brunch",
    "dining",
    "lunch",
    "dinner",
    // V84.3 — Tickets africains francophones (Cameroun, Côte d'Ivoire, Sénégal)
    // — vrais marqueurs gustatifs présents sur les tickets diaspora BMD.
    "poulet",
    "plat",
    "menu",
    "boisson",
    "bissap",
    "ndolé",
    "ndole",
    "mboa",
    "yaoundé",
    "yaounde",
    "thiéboudienne",
    "thieboudienne",
    "mafé",
    "mafe",
    "attiéké",
    "attieke",
  ],
  courses: [
    "courses",
    "carrefour",
    "auchan",
    "leclerc",
    "intermarché",
    "intermarche",
    "monoprix",
    "casino",
    "lidl",
    "aldi",
    "franprix",
    "g20",
    "spar",
    "supermarché",
    "supermarche",
    "supermarket",
    "grocery",
    "groceries",
    "épicerie",
    "epicerie",
    "marché",
    "marche",
    "halal",
    "biocoop",
  ],
  transport: [
    "uber",
    "bolt",
    "kapten",
    "taxi",
    "ratp",
    "sncf",
    "tgv",
    "métro",
    "metro",
    "bus",
    "train",
    "tram",
    "tcl",
    "essence",
    "carburant",
    "shell",
    // V84.3 — Retiré "total" : faux positif sur "TOTAL TTC" qui apparaît
    // sur 99% des tickets de caisse. La marque "Total" essence est
    // détectable par contexte (souvent associée à un montant en euros).
    // À ré-injecter sous forme plus précise si besoin : "total access",
    // "totalenergies".
    "totalenergies",
    "esso",
    "bp",
    "péage",
    "peage",
    "parking",
  ],
  logement: [
    "loyer",
    "loyers",
    "rent",
    "edf",
    "engie",
    "veolia",
    "suez",
    "orange",
    "free",
    "sfr",
    "bouygues",
    "internet",
    "wifi",
    "électricité",
    "electricite",
    "gaz",
    "eau",
    "facture",
  ],
  loisirs: [
    "cinéma",
    "cinema",
    "cine",
    "ugc",
    "pathé",
    "pathe",
    "mk2",
    "concert",
    "festival",
    "théâtre",
    "theatre",
    "musée",
    "musee",
    "bowling",
    "spa",
    "spotify",
    "netflix",
    "amazon prime",
    "fnac",
    // Voyages personnels → loisirs (dépense partagée typique BMD)
    "voyage",
    "voyages",
    "hôtel",
    "hotel",
    "airbnb",
    "booking",
    "ryanair",
    "easyjet",
    "air france",
    "klm",
    "lufthansa",
    "emirates",
    "vol",
    "billet",
  ],
  autres: [],
};

/**
 * Alias usuels qu'on peut recevoir d'autres sources (LLM hésitant, OCR
 * legacy en titre case, libellés anglais, etc.). Mappe vers une valeur
 * canonique. Tout est comparé en lowercase trim.
 */
const EXPENSE_CATEGORY_ALIASES: Record<string, ExpenseCategoryValue> = {
  // Anciennes valeurs OCR pré-V83 (titre case → canonical)
  restaurant: "resto",
  restaurants: "resto",
  food: "resto",
  meal: "resto",
  meals: "resto",
  grocery: "courses",
  groceries: "courses",
  shopping: "courses",
  supermarket: "courses",
  trans: "transport",
  transit: "transport",
  travel: "loisirs",
  voyage: "loisirs",
  voyages: "loisirs",
  hotel: "loisirs",
  leisure: "loisirs",
  fun: "loisirs",
  loisir: "loisirs",
  rent: "logement",
  loyer: "logement",
  housing: "logement",
  utilities: "logement",
  house: "logement",
  home: "logement",
  other: "autres",
  others: "autres",
  misc: "autres",
  miscellaneous: "autres",
  autre: "autres",
  "sans-categorie": "autres",
  "sans catégorie": "autres",
  uncategorized: "autres",
};

/**
 * Normalise n'importe quel input texte vers une catégorie canonique.
 * Renvoie `null` si l'input est vide ou non reconnaissable — dans ce
 * cas le caller laisse `category = null` côté Prisma (toléré par le schéma).
 *
 * Logique :
 *  1. Si déjà une valeur canonique → renvoyée telle quelle.
 *  2. Sinon match contre la table des alias usuels.
 *  3. Sinon match par contains sur les keywords (utile quand on reçoit
 *     un libellé comme "Restaurant chinois" ou "Carrefour Market").
 *  4. Sinon `null`.
 */
export function normalizeExpenseCategory(
  input: string | null | undefined,
): ExpenseCategoryValue | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Match canonique direct
  if ((EXPENSE_CATEGORY_VALUES as readonly string[]).includes(lower)) {
    return lower as ExpenseCategoryValue;
  }

  // 2. Alias usuel
  const alias = EXPENSE_CATEGORY_ALIASES[lower];
  if (alias) return alias;

  // 3. Contains sur les keywords (un libellé long peut contenir un kw)
  for (const cat of EXPENSE_CATEGORY_VALUES) {
    if (cat === "autres") continue; // ne match jamais "autres" par keyword
    const kws = EXPENSE_CATEGORY_KEYWORDS[cat];
    for (const kw of kws) {
      if (lower.includes(kw)) return cat;
    }
  }

  return null;
}

/**
 * Variante stricte : retourne `"autres"` au lieu de `null` quand
 * la catégorie ne peut pas être déterminée. Utile côté front quand on
 * veut TOUJOURS afficher une bucket (ex : vue groupée par catégorie).
 */
export function normalizeExpenseCategoryOrAutres(
  input: string | null | undefined,
): ExpenseCategoryValue {
  return normalizeExpenseCategory(input) ?? "autres";
}
