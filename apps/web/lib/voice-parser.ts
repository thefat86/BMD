/**
 * Parser de commandes vocales pour la création de dépenses (spec §3.8).
 *
 * Reconnaît des phrases naturelles en français (avec un peu d'argot diaspora) :
 *  - "ajoute 25 euros resto avec Karim et Linda"
 *  - "j'ai payé 12,50 chez Carrefour pour les courses"
 *  - "30 mille XAF taxi avec Marie"
 *  - "ajoute 100 dollars Uber pour moi et Yacine"
 *
 * Pas d'IA externe : pure regex + heuristiques. Le résultat pré-remplit
 * le formulaire, l'utilisateur valide.
 */

export interface ParsedVoiceCommand {
  /** Description courte (ex: "Resto", "Carrefour", "Taxi") */
  description: string | null;
  /** Montant en string décimal (ex: "25.50") */
  amount: string | null;
  /** Code devise ISO 4217 deviné (ex: "EUR", "XAF", "USD") */
  currency: string | null;
  /** Catégorie devinée (resto, courses, transport, …) */
  category: string | null;
  /** Prénoms / noms cités après "avec" (à matcher avec les membres) */
  participantsHints: string[];
  /** Confiance globale (0-1) */
  confidence: number;
  /** Texte original (pour debug / affichage) */
  rawText: string;
  // ====== Sprint AC · enrichissement avec contexte de groupe ======
  /** UserId du payeur résolu (matché contre les membres). null si ambigu */
  paidByUserId?: string | null;
  /** UserIds des participants résolus. Vide → utiliser tout le groupe */
  participantIds?: string[];
  /** Mode de partage détecté */
  splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED" | null;
  /** Si UNEQUAL/PERCENTAGE : map userId → part */
  shares?: Record<string, number>;
  // ====== Sprint AC-3 · Multi-payeurs détectés en parole ======
  /**
   * Si l'utilisateur a dit "Karim a mis 30, Linda 50, moi 20" (toutes
   * langues), on remplit ce tableau avec une entrée par personne.
   * Mutuellement exclusif : amount XOR percent par entrée.
   * Le frontend bascule automatiquement le formulaire en mode multi-payeurs.
   */
  payers?: Array<{ userId: string; amount?: number; percent?: number }>;
}

const CURRENCY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(eur|euros?|€)\b/i, "EUR"],
  [/\b(usd|dollars?|\$)\b/i, "USD"],
  [/\b(gbp|livres?|£)\b/i, "GBP"],
  [/\b(xaf|fcfa.*beac|cfa centrale)\b/i, "XAF"],
  [/\b(xof|fcfa.*bceao|cfa ouest)\b/i, "XOF"],
  [/\b(fcfa|cfa|francs?\s*cfa)\b/i, "XOF"], // par défaut zone CFA = ouest (UEMOA)
  [/\b(mad|dirhams?)\b/i, "MAD"],
  [/\b(ngn|nairas?|₦)\b/i, "NGN"],
  [/\b(ghs|cedis?)\b/i, "GHS"],
  [/\b(kes|shillings?\s*kenyans?)\b/i, "KES"],
  [/\b(zar|rands?)\b/i, "ZAR"],
  [/\b(cny|yuan|￥)\b/i, "CNY"],
];

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(resto|restau|restaurant|brunch|d[ée]j(?:euner)?|d[îi]ner|kfc|mcdo|burger|pizza)\b/i, "resto"],
  [/\b(carrefour|auchan|leclerc|monoprix|courses?|march[ée]|alimentation|nourriture|food)\b/i, "courses"],
  [/\b(taxi|uber|bolt|m[ée]tro|bus|train|sncf|essence|carburant|p[ée]age|parking)\b/i, "transport"],
  [/\b(loyer|edf|gaz|eau|internet|orange|sfr|free|bouygues|charges|colocation)\b/i, "logement"],
  [/\b(cin[ée]ma|netflix|spotify|concert|sortie|bar|caf[ée]|ap[ée]ro|loisirs?)\b/i, "loisirs"],
  [/\b(pharmacie|m[ée]decin|h[ôo]pital|ordonnance|sant[ée])\b/i, "sante"],
];

// Multiplicateurs verbaux : "30 mille", "5 cents"
const MULTIPLIER_WORDS: Record<string, number> = {
  mille: 1000,
  k: 1000,
  millions: 1_000_000,
  million: 1_000_000,
};

/**
 * Tente de parser une commande vocale. Retourne null si on n'a rien compris
 * (pas de montant, pas de description plausible).
 */
export function parseVoiceCommand(text: string): ParsedVoiceCommand | null {
  if (!text || text.trim().length < 3) return null;
  const raw = text.trim();
  // Normalise : virgule décimale française → point
  const norm = raw
    .toLowerCase()
    // remplace "25,50" par "25.50" pour faciliter le parse
    .replace(/(\d),(\d)/g, "$1.$2");

  let confidence = 0.5;

  // === 1. Extraction du montant ===
  // Cherche un nombre éventuellement suivi d'un mot multiplicateur
  let amount: string | null = null;
  const amountMatch = norm.match(/(\d+(?:\.\d{1,4})?)\s*(mille|k|millions?)?/);
  if (amountMatch) {
    let value = parseFloat(amountMatch[1]!);
    const mult = amountMatch[2];
    if (mult && MULTIPLIER_WORDS[mult]) value *= MULTIPLIER_WORDS[mult]!;
    amount = value.toFixed(2).replace(/\.00$/, "");
    confidence += 0.2;
  }

  // === 2. Devise ===
  let currency: string | null = null;
  for (const [re, code] of CURRENCY_KEYWORDS) {
    if (re.test(norm)) {
      currency = code;
      confidence += 0.1;
      break;
    }
  }

  // === 3. Catégorie ===
  let category: string | null = null;
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(norm)) {
      category = cat;
      confidence += 0.1;
      break;
    }
  }

  // === 4. Participants après "avec" ===
  const participantsHints: string[] = [];
  // "avec Karim et Linda" / "avec Marie, Yacine"
  const withMatch = norm.match(/\bavec\b\s+([^.]+?)(?:\.|$)/);
  if (withMatch) {
    const namesPart = withMatch[1]!;
    const names = namesPart
      .split(/\s*(?:,|\bet\b|\bpuis\b)\s*/i)
      .map((n) => n.trim())
      .filter((n) => n && n.length >= 2 && n.length <= 30 && !/^\d/.test(n));
    participantsHints.push(...names);
    confidence += 0.05;
  }

  // === 5. Description : ce qui reste après nettoyage ===
  let description: string | null = null;
  let cleaned = norm
    // retire les amorces
    .replace(
      /^(ajoute|paye|pay[ée]|d[ée]pense|d[ée]penser|achet[ée]?|j['']?\s*ai\s+(pay[ée]|d[ée]pens[ée]|achet[ée]))\b/i,
      "",
    )
    // retire le montant + devise
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(mille|k|millions?|euros?|€|usd|dollars?|\$|gbp|livres?|£|xaf|xof|fcfa|cfa|mad|dirhams?|ngn|nairas?|ghs|cedis?|kes|zar|rands?|cny|yuan)?\b/gi,
      "",
    )
    // retire "avec ..." jusqu'à fin
    .replace(/\bavec\b.+$/i, "")
    // retire prepositions usuelles
    .replace(/\b(pour|chez|au|à|en|de|du|la|le|les|un|une)\b/gi, "")
    .replace(/[.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 2 && cleaned.length <= 80) {
    // Capitalize first letter
    description = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } else if (category) {
    // Si on n'a pas de description claire, on utilise la catégorie comme libellé
    description = category.charAt(0).toUpperCase() + category.slice(1);
  }

  if (!amount && !description) return null;

  return {
    description,
    amount,
    currency,
    category,
    participantsHints,
    confidence: Math.min(1, confidence),
    rawText: raw,
  };
}
