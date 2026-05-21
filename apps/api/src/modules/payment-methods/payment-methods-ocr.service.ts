/**
 * V137 — OCR RIB via OpenAI Vision.
 *
 * Le user prend une photo de son RIB (relevé d'identité bancaire) ou
 * d'un screenshot PayPal/Wero, on extrait :
 *  - IBAN (formaté, validé modulo 97)
 *  - BIC / SWIFT (optionnel)
 *  - Titulaire du compte
 *  - Nom de la banque
 *  - Devise déduite du pays IBAN
 *
 * Politique de confidentialité — IMPORTANT :
 *  - L'image est envoyée à OpenAI Vision (sub-processor déclaré dans la DPA)
 *  - L'image N'EST JAMAIS persistée côté BMD (ni disque, ni DB, ni cache)
 *  - Le buffer est garbage-collected dès la fin de la requête
 *  - Les données extraites (IBAN/BIC) sont retournées en JSON au front, qui
 *    affiche un formulaire pré-rempli pour validation user avant chiffrement
 *
 * Coût : ~$0.001 par scan (gpt-4o-mini accepte les images directement).
 */

import { Errors } from "../../lib/errors.js";
import { loadEnv } from "../../lib/env.js";

// ============================================================
// PROMPT — JSON strict, multilingue
// ============================================================
//
// On force `response_format: json_object` côté API, mais on rappelle dans
// le prompt pour les modèles qui ignoreraient le hint. On donne des
// exemples pour chaque format (RIB FR, screenshot PayPal, Wave, etc.).

const OCR_RIB_PROMPT = `Tu es un expert en extraction de coordonnées bancaires. L'image peut être :
- Un RIB français (Relevé d'Identité Bancaire) avec Code banque, Code guichet, N° compte, Clé RIB et IBAN International (FR76...) + BIC/SWIFT
- Un RIB / IBAN européen (DE, IT, ES, BE, LU, etc.)
- Un screenshot d'application de paiement (PayPal, Wero, Wise, Revolut, Wave, Orange Money, MTN MoMo, M-Pesa, etc.)
- Une carte de Mobile Money africain (numéro de téléphone + service)

EXTRAIS tout ce que tu peux lire, MÊME PARTIELLEMENT. Mieux vaut renvoyer un IBAN partiel et une confiance basse que de tout mettre à null.

Retourne UNIQUEMENT un JSON strict (rien d'autre, pas de markdown) :
{
  "type": "IBAN" | "PAYPAL" | "WERO" | "WISE" | "REVOLUT" | "WAVE" | "ORANGE_MONEY" | "MTN_MOMO" | "MPESA" | "AIRTEL_MONEY" | "MOOV_MONEY" | "LYDIA" | "TWINT" | "INTERAC" | "OTHER",
  "iban": "FR7630001007941234567890185" | null,
  "bic": "BNPAFRPP" | null,
  "holder": "Marie Dupont" | null,
  "bank": "BNP Paribas" | null,
  "phone": "+221771234567" | null,
  "email": "user@example.com" | null,
  "currency": "EUR" | "USD" | "XOF" | "XAF" | "MAD" | null,
  "confidence": 0.0-1.0
}

Règles d'extraction :
- iban : 2 lettres pays + 2 chiffres + 11-30 alphanum, SANS espaces ni tirets. Si tu vois "FR76 3000 4000 12 34567890185 99", concatène en "FR7630004000123456789018599". Ignore le RIB français au format BBAN (5 chiffres + 5 chiffres + 11 alphanum + 2 chiffres) — utilise UNIQUEMENT la ligne "IBAN".
- bic : 8 ou 11 caractères majuscules+chiffres (ex: BNPAFRPP, SOGEFRPP, REVOLUT21). Souvent étiqueté "BIC", "SWIFT", "Code BIC".
- holder : titulaire / bénéficiaire / nom du compte. Étiquettes typiques : "Titulaire", "Bénéficiaire", "Account holder", "Nom".
- bank : nom commercial de la banque (BNP Paribas, Boursorama, Revolut, Wave, Orange Money…). Souvent en haut/logo.
- phone : numéro E.164 (+ et chiffres) UNIQUEMENT pour Mobile Money. Pour un IBAN classique, laisse null même si un numéro de téléphone de contact est visible.
- email : email du compte (PayPal, Wise). Pour un IBAN classique, laisse null.
- currency : ISO 4217 — déduis-la du préfixe IBAN (FR/DE/IT/ES/BE/LU/PT/IE/AT/FI/GR/EE/LT/LV/MT/SK/SI/CY→EUR, GB→GBP, CH→CHF, US→USD, MA→MAD, TN→TND, SN/CI/BJ/BF/ML/NE/TG→XOF, CM/GA/CG/TD/CF→XAF, NG→NGN, KE→KES, ZA→ZAR, CA→CAD).
- confidence : 0.9+ si tout est parfaitement lisible, 0.6-0.8 si quelques caractères incertains, 0.3-0.5 si l'image est partiellement lisible mais qu'on peut quand même extraire l'IBAN/BIC, 0.0 SEULEMENT si l'image ne contient AUCUNE coordonnée bancaire détectable.

IMPORTANT : si tu vois un IBAN ou un BIC, même un seul, retourne-le. Ne mets pas tout à null par excès de prudence — l'utilisateur vérifiera et corrigera lui-même au besoin.

Si l'image n'est vraiment PAS une coordonnée bancaire (selfie, paysage, autre document totalement sans rapport), retourne :
{"type":"OTHER","iban":null,"bic":null,"holder":null,"bank":null,"phone":null,"email":null,"currency":null,"confidence":0}`;

// ============================================================
// VALIDATION IBAN — modulo 97
// ============================================================
//
// L'algorithme officiel ISO 13616 : on déplace les 4 premiers chars à la
// fin, on remplace chaque lettre par sa position 2-lettres (A=10, B=11…),
// puis on vérifie que le grand nombre obtenu modulo 97 = 1.

function ibanModulo97(iban: string): boolean {
  const cleaned = iban.replace(/[\s.-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleaned)) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  // On traite le grand nombre par tranches pour éviter le BigInt
  let remainder = 0;
  for (const c of rearranged) {
    const value =
      c >= "A" && c <= "Z"
        ? c.charCodeAt(0) - 55 // A=10, B=11, ... Z=35
        : Number(c);
    if (Number.isNaN(value)) return false;
    // Append digits and take mod 97
    const digits = value > 9 ? String(value) : String(value);
    for (const d of digits) {
      remainder = (remainder * 10 + Number(d)) % 97;
    }
  }
  return remainder === 1;
}

// ============================================================
// DEDUCTION DEVISE — depuis le code pays IBAN
// ============================================================

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // Zone Euro
  FR: "EUR",
  DE: "EUR",
  IT: "EUR",
  ES: "EUR",
  BE: "EUR",
  NL: "EUR",
  LU: "EUR",
  PT: "EUR",
  IE: "EUR",
  AT: "EUR",
  FI: "EUR",
  GR: "EUR",
  EE: "EUR",
  LT: "EUR",
  LV: "EUR",
  MT: "EUR",
  SK: "EUR",
  SI: "EUR",
  CY: "EUR",
  // Royaume-Uni
  GB: "GBP",
  // Suisse
  CH: "CHF",
  // USA
  US: "USD",
  // Maroc / Tunisie
  MA: "MAD",
  TN: "TND",
  // CFA Ouest (UEMOA)
  SN: "XOF",
  CI: "XOF",
  BJ: "XOF",
  BF: "XOF",
  ML: "XOF",
  NE: "XOF",
  TG: "XOF",
  // CFA Centre (CEMAC)
  CM: "XAF",
  GA: "XAF",
  CD: "XAF", // RDC en réalité CDF mais souvent XAF facturé
  CG: "XAF",
  TD: "XAF",
  CF: "XAF",
  // Nigeria
  NG: "NGN",
  // Kenya
  KE: "KES",
  // Afrique du Sud
  ZA: "ZAR",
  // Canada
  CA: "CAD",
};

function inferCurrencyFromIban(iban: string | null): string | null {
  if (!iban || iban.length < 2) return null;
  const cc = iban.slice(0, 2).toUpperCase();
  return COUNTRY_TO_CURRENCY[cc] ?? null;
}

// ============================================================
// RESULT TYPE
// ============================================================

export interface OcrRibResult {
  type: string;
  iban: string | null;
  bic: string | null;
  holder: string | null;
  bank: string | null;
  phone: string | null;
  email: string | null;
  currency: string | null;
  /** 0-1, score de confiance du modèle Vision */
  confidence: number;
  /** true si IBAN passe le modulo 97 (uniquement pour type === "IBAN") */
  ibanValid: boolean | null;
  /** Suggestion de "petit nom" — ex: "Compte BNP", "Wave Sénégal" */
  suggestedLabel: string | null;
}

// ============================================================
// MIME validation
// ============================================================

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — RIB photo ≈ 1-3 MB

// ============================================================
// MAIN — extractRibFromImage
// ============================================================

/**
 * Appelle OpenAI Vision sur l'image fournie. L'image n'est jamais persistée.
 * Lance des erreurs claires si le service est down, le buffer trop gros, etc.
 *
 * @param image base64 de l'image (sans préfixe data:) OU data URL complète
 * @param mimeType type MIME de l'image
 */
export async function extractRibFromImage(input: {
  imageBase64: string;
  mimeType: string;
}): Promise<OcrRibResult> {
  const env = loadEnv();

  if (!env.OPENAI_API_KEY) {
    throw Errors.badRequest(
      "Le scan RIB n'est pas activé sur ce serveur",
      {
        tip: "L'admin doit configurer OPENAI_API_KEY pour activer l'extraction.",
      },
    );
  }

  // Validation MIME
  const mime = input.mimeType.toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    throw Errors.badRequest(
      `Format d'image non supporté (${input.mimeType})`,
      {
        tip: "Formats acceptés : JPEG, PNG, WebP, HEIC. Prends une photo nette du RIB.",
      },
    );
  }

  // Validation taille (le base64 fait ~33% de plus que le binaire)
  const approxBytes = Math.floor((input.imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw Errors.badRequest(
      "L'image est trop lourde (max 8 MB)",
      {
        tip: "Réduis la résolution de la photo et réessaie.",
      },
    );
  }

  // Nettoie le base64 si le client a inclus le préfixe data:
  const cleanBase64 = input.imageBase64.replace(
    /^data:image\/[a-z]+;base64,/i,
    "",
  );
  const dataUrl = `data:${mime};base64,${cleanBase64}`;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 600,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_RIB_PROMPT },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    throw Errors.internal(
      `Le service OCR est injoignable : ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    // Status >= 500 = panne OpenAI ; 400-409 = problème payload (image refusée, etc.)
    if (response.status >= 500) {
      throw Errors.internal(
        `Le service OCR a rencontré une erreur temporaire (${response.status}). Réessaie dans un instant.`,
      );
    }
    throw Errors.badRequest(
      `Impossible d'analyser cette image (${response.status})`,
      {
        tip: txt.slice(0, 200),
      },
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw Errors.internal("L'OCR n'a renvoyé aucune réponse.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw Errors.internal("L'OCR a renvoyé un JSON invalide.");
  }

  // ============================================================
  // POST-PROCESSING — nettoyage + validation
  // ============================================================

  const rawIban: string | null = parsed.iban ?? null;
  const cleanedIban = rawIban
    ? rawIban.replace(/[\s.-]/g, "").toUpperCase()
    : null;
  const ibanValid =
    cleanedIban && /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleanedIban)
      ? ibanModulo97(cleanedIban)
      : null;

  const rawBic: string | null = parsed.bic ?? null;
  const cleanedBic = rawBic
    ? rawBic.replace(/\s/g, "").toUpperCase()
    : null;
  const bicValid = cleanedBic && /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanedBic);

  const type = (parsed.type ?? "OTHER") as string;
  const allowedTypes = new Set([
    "IBAN",
    "PAYPAL",
    "WERO",
    "WISE",
    "REVOLUT",
    "WAVE",
    "ORANGE_MONEY",
    "MTN_MOMO",
    "MPESA",
    "AIRTEL_MONEY",
    "MOOV_MONEY",
    "LYDIA",
    "TWINT",
    "INTERAC",
    "OTHER",
  ]);
  const safeType = allowedTypes.has(type) ? type : "OTHER";

  // Si le modèle a renvoyé IBAN mais qu'il échoue la validation modulo 97,
  // on garde l'IBAN brut pour permettre à l'user de corriger manuellement
  // (souvent un chiffre mal lu).

  const currency =
    (parsed.currency ?? null) ?? inferCurrencyFromIban(cleanedIban);

  // Construit un "petit nom" suggéré pour le PaymentMethod
  let suggestedLabel: string | null = null;
  if (safeType === "IBAN" && parsed.bank) {
    suggestedLabel = `Compte ${parsed.bank}`;
  } else if (safeType === "PAYPAL") {
    suggestedLabel = "PayPal";
  } else if (safeType === "WERO") {
    suggestedLabel = "Wero";
  } else if (parsed.bank) {
    suggestedLabel = String(parsed.bank);
  }

  return {
    type: safeType,
    iban: cleanedIban,
    bic: bicValid ? cleanedBic : null,
    holder: parsed.holder ?? null,
    bank: parsed.bank ?? null,
    phone: parsed.phone ?? null,
    email: parsed.email ? String(parsed.email).toLowerCase() : null,
    currency,
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    ibanValid,
    suggestedLabel: suggestedLabel ? suggestedLabel.slice(0, 80) : null,
  };
}
