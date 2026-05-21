/**
 * MODULE M14 · Parser intelligent de tickets de caisse
 *
 * Prend du texte OCR brut (souvent imparfait) et extrait :
 *  - le marchand (1ère ligne signifiante)
 *  - le montant total
 *  - la devise (EUR par défaut, support XAF/USD/GBP/MAD/etc)
 *  - la date
 *  - la catégorie devinée à partir du marchand
 *
 * V83 · La catégorie retournée est désormais une des 6 valeurs canoniques
 * BMD (resto / courses / transport / logement / loisirs / autres), pas
 * un libellé en titre case. Source : @bmd/shared-types
 * (normalizeExpenseCategory + EXPENSE_CATEGORY_KEYWORDS). Avant V83 le
 * parser retournait "Restaurant" / "Voyage" qui ne matchaient AUCUNE
 * règle côté front (lowercase only).
 *
 * Aucune dépendance externe (à part shared-types) — pure logique, donc
 * 100% testable.
 */
import {
  EXPENSE_CATEGORY_KEYWORDS,
  EXPENSE_CATEGORY_VALUES,
  type ExpenseCategoryValue,
} from "@bmd/shared-types";

export interface ParsedReceipt {
  merchant: string | null;
  amount: string | null; // "12.34" comme string pour précision
  currency: string;
  date: string | null; // ISO 8601
  /** V83 · Catégorie canonique BMD ou null si non détectée. */
  category: ExpenseCategoryValue | null;
  confidence: number; // 0-1, indique la fiabilité
  rawText: string;
  /// Lignes d'items détectées (pour le mode ITEMIZED)
  items: ParsedItem[];
}

export interface ParsedItem {
  description: string;
  quantity: number;
  unitPrice: string; // "12.34"
  totalPrice: string;
}

// ============================================================
// HEURISTIQUES MARCHAND PAR CATÉGORIE
// ============================================================
// V83 · Les keywords sont désormais centralisés dans @bmd/shared-types
// (EXPENSE_CATEGORY_KEYWORDS) — voir docstring du module pour la motivation.
// Cette section n'a plus de table locale ; guessCategory() ci-dessous itère
// directement sur les 6 valeurs canoniques.

// ============================================================
// DEVISES SUPPORTÉES
// ============================================================

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR",
  EUR: "EUR",
  "$": "USD",
  USD: "USD",
  "£": "GBP",
  GBP: "GBP",
  CHF: "CHF",
  CFA: "XAF",
  FCFA: "XAF",
  XAF: "XAF",
  XOF: "XOF",
  MAD: "MAD",
  DH: "MAD",
  TND: "TND",
  NGN: "NGN",
  "₦": "NGN",
  KES: "KES",
  GHS: "GHS",
  CAD: "CAD",
};

// ============================================================
// EXTRACTION DU MONTANT TOTAL
// ============================================================

/**
 * Trouve le montant le plus probable (le "total") dans le texte.
 * Stratégie :
 *  1. Cherche "TOTAL", "TOTAL TTC", "MONTANT DÛ", "À PAYER" suivi d'un nombre
 *  2. Si pas trouvé, prend le plus grand nombre formaté monnaie du texte
 *  3. Si plusieurs candidats, prend le dernier (le total est souvent en bas)
 */
export function extractAmount(text: string): {
  amount: string | null;
  currency: string;
  confidence: number;
} {
  // Normaliser : remplacer les virgules décimales par des points
  // (ex: "12,34 €" → "12.34 €")
  const normalized = text.replace(/(\d),(\d{2})\b/g, "$1.$2");

  // Détection devise : chercher tous les symboles présents dans le texte
  let currency = "EUR";
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    // Match avec word boundary pour éviter les faux positifs
    const re = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b|${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    if (re.test(normalized)) {
      currency = code;
      break;
    }
  }

  // Pattern 1 : "TOTAL" / "MONTANT" / "À PAYER" suivi du nombre
  const totalKeywords = [
    "total\\s*ttc",
    "total\\s*à\\s*payer",
    "montant\\s*dû",
    "à\\s*payer",
    "net\\s*à\\s*payer",
    "net\\s*ttc",
    "total",
    "montant",
    "amount",
    "due",
    "grand\\s*total",
  ];
  for (const kw of totalKeywords) {
    const re = new RegExp(
      `${kw}[\\s:.\\-]*([0-9]{1,6}(?:[.,][0-9]{1,4})?)`,
      "i",
    );
    const m = normalized.match(re);
    if (m) {
      const value = m[1]!.replace(",", ".");
      return { amount: value, currency, confidence: 0.9 };
    }
  }

  // Pattern 2 : tous les nombres formatés monnaie dans le texte
  // Format : "12.34" ou "12.34 €" ou "12.34€" ou "EUR 12.34"
  const moneyRe = /\b([0-9]{1,5}\.[0-9]{2})\b/g;
  const matches = Array.from(normalized.matchAll(moneyRe), (m) =>
    parseFloat(m[1]!),
  );

  if (matches.length === 0) {
    return { amount: null, currency, confidence: 0 };
  }

  // Prendre le plus gros (heuristique : le total est presque toujours le max)
  // EXCEPT si > 10 000 (probablement un numéro de transaction, code postal, etc.)
  const filtered = matches.filter((n) => n > 0 && n < 10000);
  if (filtered.length === 0) {
    return { amount: null, currency, confidence: 0 };
  }

  const max = Math.max(...filtered);
  return {
    amount: max.toFixed(2),
    currency,
    confidence: 0.6, // moins fiable que le pattern explicite
  };
}

// ============================================================
// EXTRACTION DU MARCHAND
// ============================================================

/**
 * Le marchand est généralement dans les 3 premières lignes du ticket.
 * On évite les lignes qui ne sont que des dates, numéros, ou bruit.
 */
export function extractMerchant(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Patterns à exclure (numéros de ticket, dates, codes barres, adresses)
  const noiseRe =
    /^([0-9]+|[*\-=_]+|[a-z]\s*[a-z]\s*[a-z]?$|[0-9]{2}[/.][0-9]{2}|tel|tél|siret|tva)/i;

  for (const line of lines.slice(0, 8)) {
    if (line.length < 3 || line.length > 60) continue;
    if (noiseRe.test(line)) continue;
    // Doit contenir au moins 2 lettres
    const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letters.length < 3) continue;

    // Capitalize cleanly
    return line
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  return null;
}

// ============================================================
// EXTRACTION DE LA DATE
// ============================================================

/**
 * Cherche une date dans le ticket.
 * Formats supportés : DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD.
 */
export function extractDate(text: string): string | null {
  // DD/MM/YYYY ou DD/MM/YY
  const fr = text.match(/\b([0-3]?\d)[/.\-]([0-1]?\d)[/.\-](20\d{2}|\d{2})\b/);
  if (fr) {
    const [, d, m, yRaw] = fr;
    const day = d!.padStart(2, "0");
    const month = m!.padStart(2, "0");
    let year = yRaw!;
    if (year.length === 2) year = `20${year}`;
    const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  // ISO direct
  const iso = text.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

// ============================================================
// DÉTECTION CATÉGORIE
// ============================================================

/**
 * V83 · Retourne une catégorie canonique BMD ("resto" | "courses" |
 * "transport" | "logement" | "loisirs") ou null si rien ne matche.
 * Ne retourne JAMAIS "autres" — c'est un bucket de fallback côté UI,
 * pas une détection positive (les keywords "autres" sont vides).
 */
export function guessCategory(
  merchant: string | null,
  fullText: string,
): ExpenseCategoryValue | null {
  const haystack = `${merchant ?? ""} ${fullText}`.toLowerCase();
  for (const cat of EXPENSE_CATEGORY_VALUES) {
    if (cat === "autres") continue; // pas de keywords positifs pour "autres"
    const keywords = EXPENSE_CATEGORY_KEYWORDS[cat];
    for (const kw of keywords) {
      if (haystack.includes(kw)) return cat;
    }
  }
  return null;
}

// ============================================================
// PIPELINE COMPLET
// ============================================================

export function parseReceipt(rawText: string): ParsedReceipt {
  const cleaned = rawText.trim();
  const { amount, currency, confidence } = extractAmount(cleaned);
  const merchant = extractMerchant(cleaned);
  const date = extractDate(cleaned);
  const category = guessCategory(merchant, cleaned);
  const items = extractItems(cleaned, currency, amount);

  // Confiance globale = moyenne pondérée (le montant compte le plus)
  let globalConfidence = confidence * 0.6;
  if (merchant) globalConfidence += 0.2;
  if (date) globalConfidence += 0.1;
  if (category) globalConfidence += 0.1;

  return {
    merchant,
    amount,
    currency,
    date,
    category,
    confidence: Math.min(1, globalConfidence),
    rawText: cleaned,
    items,
  };
}

/**
 * Extrait les lignes d'items d'un ticket à partir du texte OCR.
 *
 * Heuristiques :
 *  1. On scanne ligne par ligne du texte OCR
 *  2. Une ligne d'item ressemble à : "<description...> <prix> [€/EUR/USD]"
 *     ou "<qty> x <description> <prix>"
 *     ou "<description> <prix>"
 *  3. On exclut les lignes contenant TVA / TOTAL / SOUS-TOTAL / SUBTOTAL /
 *     MERCI / THANK YOU / DATE / N° / TICKET / RECEIPT etc.
 *  4. La somme totale des items détectés doit être cohérente avec amount
 *     (à ±20% près) sinon on rejette les items (probablement des faux positifs)
 *
 * Cette fonction est volontairement conservative : il vaut mieux retourner
 * 0 item qu'un mauvais item. L'utilisateur peut toujours saisir manuellement.
 */
export function extractItems(
  text: string,
  currency: string,
  totalAmount: string | null,
): ParsedItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Mots-clés à exclure (insensibles à la casse) — ce ne sont pas des items
  const EXCLUDE_PATTERNS = [
    /\btva\b/i,
    /\bvat\b/i,
    /\btotal\b/i,
    /\bsous[\s-]?total\b/i,
    /\bsubtotal\b/i,
    /\bmerci\b/i,
    /\bthank\s*you\b/i,
    /\bdate\b/i,
    /\bn[°o]\s*\d/i,
    /\bticket\b/i,
    /\breceipt\b/i,
    /\bcaisse\b/i,
    /\bcashier\b/i,
    /\bcb\b/i,
    /\b(?:carte|card|espèces?|cash|cheque|check)\b/i,
    /\bmonnaie\b/i,
    /\bchange\b/i,
    /\bremise\b/i,
    /\bdiscount\b/i,
    /\bservice\b/i,
    /\bpourboire\b/i,
    /\btip\b/i,
    /^[-=*~_]{3,}$/,
    /^\d+\s*[/-]\s*\d+/,
    /^[\d:]+\s*$/,
  ];

  // Regex pour capturer prix en fin de ligne (avec ou sans symbole)
  // Ex: "Café latte ........ 4,50 €" ou "Pizza Margherita 12.50"
  const PRICE_AT_END = /(.+?)[\s.…_·-]{2,}([0-9]+[,.]\d{2})\s*[€$£¥]?\s*$/;
  const PRICE_NO_DOTS = /^(.+?)\s+([0-9]+[,.]\d{2})\s*[€$£¥]?\s*$/;
  // Quantité optionnelle au début : "2 x Coca 5.00" ou "2x Coca 5.00"
  const QTY_PREFIX = /^(\d+)\s*[x×*]\s*(.+)$/i;

  const items: ParsedItem[] = [];

  for (const line of lines) {
    if (line.length < 3 || line.length > 120) continue;
    if (EXCLUDE_PATTERNS.some((p) => p.test(line))) continue;
    // Si la ligne ne contient AUCUN chiffre, ce n'est pas un item
    if (!/\d/.test(line)) continue;

    let m = line.match(PRICE_AT_END);
    if (!m) m = line.match(PRICE_NO_DOTS);
    if (!m) continue;

    let description = m[1].trim();
    const priceStr = m[2].replace(",", ".");
    const totalPrice = parseFloat(priceStr);
    if (!Number.isFinite(totalPrice) || totalPrice <= 0 || totalPrice > 9999) {
      continue;
    }

    // Détecter quantité en préfixe
    let quantity = 1;
    const qm = description.match(QTY_PREFIX);
    if (qm) {
      const q = parseInt(qm[1], 10);
      if (q > 0 && q <= 99) {
        quantity = q;
        description = qm[2].trim();
      }
    }

    // Description finale : on enlève les caractères de ponctuation finaux
    description = description.replace(/[.…_·\-\s]+$/, "").trim();
    if (!description || description.length < 2) continue;
    // On évite que la description contienne juste des chiffres
    if (/^\d+$/.test(description)) continue;

    const unitPrice = (totalPrice / quantity).toFixed(2);
    items.push({
      description,
      quantity,
      unitPrice,
      totalPrice: totalPrice.toFixed(2),
    });
  }

  // Sanity check : si la somme des items détectés dépasse 200% du total
  // ou est inférieure à 30% du total, on considère qu'on a trop de bruit
  // et on retourne une liste vide (l'utilisateur saisira à la main).
  if (totalAmount && items.length > 0) {
    const total = parseFloat(totalAmount);
    const itemsSum = items.reduce(
      (s, it) => s + parseFloat(it.totalPrice),
      0,
    );
    if (total > 0 && (itemsSum > total * 2 || itemsSum < total * 0.3)) {
      return [];
    }
  }

  return items;
}
