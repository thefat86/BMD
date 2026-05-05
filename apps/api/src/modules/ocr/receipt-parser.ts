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
 * Aucune dépendance externe — pure logique, donc 100% testable.
 */

export interface ParsedReceipt {
  merchant: string | null;
  amount: string | null; // "12.34" comme string pour précision
  currency: string;
  date: string | null; // ISO 8601
  category: string | null;
  confidence: number; // 0-1, indique la fiabilité
  rawText: string;
}

// ============================================================
// HEURISTIQUES MARCHAND PAR CATÉGORIE
// ============================================================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Restaurant: [
    "restaurant",
    "resto",
    "brasserie",
    "bistrot",
    "café",
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
  ],
  Courses: [
    "carrefour",
    "auchan",
    "leclerc",
    "intermarché",
    "monoprix",
    "casino",
    "lidl",
    "aldi",
    "franprix",
    "g20",
    "spar",
    "supermarché",
    "supermarket",
    "grocery",
    "épicerie",
    "marché",
    "halal",
    "biocoop",
  ],
  Transport: [
    "uber",
    "bolt",
    "kapten",
    "taxi",
    "ratp",
    "sncf",
    "tgv",
    "metro",
    "bus",
    "train",
    "essence",
    "carburant",
    "shell",
    "total",
    "esso",
    "bp",
    "péage",
  ],
  Logement: [
    "loyer",
    "edf",
    "engie",
    "veolia",
    "suez",
    "orange",
    "free",
    "sfr",
    "bouygues",
    "internet",
    "électricité",
    "gaz",
    "eau",
    "loyer",
  ],
  Loisirs: [
    "cinéma",
    "ugc",
    "pathé",
    "mk2",
    "concert",
    "théâtre",
    "musée",
    "spotify",
    "netflix",
    "amazon",
    "fnac",
  ],
  Voyage: [
    "hotel",
    "hôtel",
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
};

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

export function guessCategory(merchant: string | null, fullText: string): string | null {
  const haystack = `${merchant ?? ""} ${fullText}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (haystack.includes(kw)) return category;
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
  };
}
