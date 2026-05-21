/**
 * Dispatcher OCR · provider IA externe ou fallback Tesseract local.
 *
 * Stratégie de sélection (par ordre de priorité) :
 *  1. Si MINDEE_API_KEY défini → Mindee Receipt OCR (excellente précision tickets)
 *  2. Sinon si OPENAI_API_KEY défini → OpenAI Vision (gpt-4o-mini) avec prompt structuré
 *  3. Sinon → Tesseract.js local + parser regex (le pipeline historique)
 *
 * Tous les providers retournent le même format `ParsedReceipt` pour
 * ne rien casser côté frontend (api.scanReceipt continue de marcher).
 *
 * Mode "auto" sélectionne le meilleur disponible automatiquement.
 * Mode "tesseract" force le fallback local (utile pour les tests / hors-ligne).
 *
 * Tous les providers gèrent gracieusement les erreurs : si l'IA externe
 * répond mal, on retombe sur Tesseract automatiquement.
 */
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";
import type { ParsedReceipt, ParsedItem } from "./receipt-parser.js";
// V83 · Normalise les valeurs `category` retournées par Mindee / OpenAI
// Vision / LLM vers les 6 clés canoniques BMD. Sans ça, Mindee renvoie
// parfois ses propres labels ("food", "transportation"…) qui ne matchent
// aucune règle côté front.
import { normalizeExpenseCategory } from "@bmd/shared-types";

export type OcrProviderName = "mindee" | "openai_vision" | "tesseract";

/**
 * V46 · Tier IA selon le plan du payeur.
 *  - "economy"  → Tesseract local + OpenAI Vision fallback (~0,003€/scan)
 *  - "standard" → OpenAI Vision + Mindee fallback si confidence<75% (~0,01€)
 *  - "premium"  → Mindee Pro premium (Invoice+Receipts parallèle) + normalisation (~0,07€)
 *
 * Le tier provient des `Plan.limits.iaPipelineTier`. Si absent, on retombe sur
 * "economy" par sécurité (jamais de Mindee gratuit).
 */
export type IaPipelineTier = "economy" | "standard" | "premium";

/**
 * Détermine quel provider de PREMIER appel utiliser selon le tier IA.
 * Le fallback automatique (sur Tesseract) reste en place dans
 * scanReceiptViaProvider en cas d'erreur réseau.
 */
export function pickOcrProvider(
  forced?: string,
  tier: IaPipelineTier = "economy",
): OcrProviderName {
  const env = loadEnv();
  const mode = (forced ?? env.OCR_PROVIDER ?? "auto").toLowerCase();
  if (mode === "tesseract") return "tesseract";
  if (mode === "mindee" && env.MINDEE_API_KEY) return "mindee";
  if (mode === "openai_vision" && env.OPENAI_API_KEY) return "openai_vision";
  // Mode auto · choix selon tier IA du plan
  if (tier === "premium" && env.MINDEE_API_KEY) return "mindee";
  if (tier === "standard" && env.OPENAI_API_KEY) return "openai_vision";
  // economy → OpenAI Vision si dispo, sinon Tesseract
  if (env.OPENAI_API_KEY) return "openai_vision";
  return "tesseract";
}

// ============================================================
// MINDEE · Receipt OCR (https://developers.mindee.com)
// ============================================================
//
// Endpoint v5 utilisé : POST https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict
// Le format de réponse Mindee est très riche (ligne par ligne, taxes, devise…).
// On le mappe vers `ParsedReceipt` pour rester compatible avec notre frontend.

interface MindeeField<T> {
  value: T | null;
  confidence: number;
}
interface MindeePrediction {
  category?: MindeeField<string>;
  date?: MindeeField<string>;
  total_amount?: MindeeField<number>;
  total_net?: MindeeField<number>;
  locale?: { currency?: string };
  supplier_name?: MindeeField<string>;
  line_items?: Array<{
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    total_amount: number | null;
  }>;
}

async function scanWithMindeeReceipt(
  buffer: Buffer,
  mimetype: string,
): Promise<ParsedReceipt> {
  const env = loadEnv();
  const filename = `receipt.${mimetype.split("/")[1] ?? "bin"}`;
  // Cast Buffer → Uint8Array : Node 20 a renforcé les types (Buffer<ArrayBufferLike>
  // n'est plus assignable à BlobPart sans cast explicite).
  const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
  const form = new FormData();
  form.append("document", blob, filename);

  const r = await fetch(
    "https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict",
    {
      method: "POST",
      headers: { authorization: `Token ${env.MINDEE_API_KEY}` },
      body: form,
    },
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw Errors.internal(
      `Mindee a refusé la requête (${r.status}) : ${txt.slice(0, 120)}`,
    );
  }
  const body = (await r.json()) as {
    document?: { inference?: { prediction?: MindeePrediction } };
  };
  const pred = body.document?.inference?.prediction;
  if (!pred) {
    throw Errors.internal("Mindee a renvoyé une réponse sans prediction.");
  }

  const items: ParsedItem[] =
    (pred.line_items ?? [])
      .filter((li) => li.description && li.total_amount)
      .map((li) => ({
        description: li.description!,
        quantity: li.quantity ?? 1,
        unitPrice:
          li.unit_price !== null && li.unit_price !== undefined
            ? li.unit_price.toFixed(2)
            : (li.total_amount ?? 0).toFixed(2),
        totalPrice: (li.total_amount ?? 0).toFixed(2),
      })) ?? [];

  // Confidence : moyenne des champs principaux
  const confidences = [
    pred.total_amount?.confidence,
    pred.supplier_name?.confidence,
    pred.date?.confidence,
  ].filter((c): c is number => typeof c === "number");
  const confidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.85;

  return {
    merchant: pred.supplier_name?.value ?? null,
    amount: pred.total_amount?.value
      ? pred.total_amount.value.toFixed(2)
      : null,
    currency: (pred.locale?.currency ?? "EUR").toUpperCase(),
    date: pred.date?.value ?? null,
    // V83 · Normalise la valeur Mindee vers une clé canonique BMD.
    category: normalizeExpenseCategory(pred.category?.value),
    confidence,
    rawText: "",
    items,
  };
}

// ============================================================
// MINDEE · Invoice OCR (modèle factures pro v4)
// ============================================================
//
// Endpoint : POST https://api.mindee.net/v1/products/mindee/invoices/v4/predict
//
// Différences avec Receipts v5 :
//  - Reconnaît la TVA, les remises, les sous-totaux HT/TTC
//  - Extrait IBAN / BIC / RIB du fournisseur
//  - Parse les numéros de facture, dates d'échéance, conditions de paiement
//  - Plus précis sur les factures B2B « formelles » (PDF générés par compta)
//
// Le format de réponse est riche — on mappe tout dans `ParsedReceipt`
// (compatible avec le frontend existant) MAIS on garde un objet `invoiceMeta`
// pour les champs qui n'existent pas sur un ticket de caisse.

interface MindeeInvoicePrediction {
  category?: MindeeField<string>;
  invoice_number?: MindeeField<string>;
  date?: MindeeField<string>;
  due_date?: MindeeField<string>;
  total_amount?: MindeeField<number>; // TTC
  total_net?: MindeeField<number>; // HT
  total_tax?: MindeeField<number>; // TVA
  taxes?: Array<{
    rate: number | null;
    base: number | null;
    value: number | null;
    code?: string | null;
  }>;
  locale?: { currency?: string; language?: string };
  supplier_name?: MindeeField<string>;
  supplier_address?: MindeeField<string>;
  supplier_company_registrations?: Array<{
    type: string | null;
    value: string | null;
  }>;
  supplier_payment_details?: Array<{
    iban: string | null;
    swift: string | null;
    routing_number: string | null;
    account_number: string | null;
  }>;
  customer_name?: MindeeField<string>;
  customer_company_registrations?: Array<{
    type: string | null;
    value: string | null;
  }>;
  line_items?: Array<{
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    total_amount: number | null;
    tax_rate?: number | null;
    tax_amount?: number | null;
  }>;
}

async function scanWithMindeeInvoice(
  buffer: Buffer,
  mimetype: string,
): Promise<ParsedReceipt> {
  const env = loadEnv();
  const filename = `invoice.${mimetype.split("/")[1] ?? "bin"}`;
  const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
  const form = new FormData();
  form.append("document", blob, filename);

  const r = await fetch(
    "https://api.mindee.net/v1/products/mindee/invoices/v4/predict",
    {
      method: "POST",
      headers: { authorization: `Token ${env.MINDEE_API_KEY}` },
      body: form,
    },
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw Errors.internal(
      `Mindee Invoice a refusé la requête (${r.status}) : ${txt.slice(0, 120)}`,
    );
  }
  const body = (await r.json()) as {
    document?: { inference?: { prediction?: MindeeInvoicePrediction } };
  };
  const pred = body.document?.inference?.prediction;
  if (!pred) {
    throw Errors.internal("Mindee Invoice a renvoyé une réponse sans prediction.");
  }

  const items: ParsedItem[] =
    (pred.line_items ?? [])
      .filter((li) => li.description && li.total_amount !== null)
      .map((li) => ({
        description: li.description!,
        quantity: li.quantity ?? 1,
        unitPrice:
          li.unit_price !== null && li.unit_price !== undefined
            ? li.unit_price.toFixed(2)
            : (li.total_amount ?? 0).toFixed(2),
        totalPrice: (li.total_amount ?? 0).toFixed(2),
      })) ?? [];

  // Métadonnées factures pro (au-delà du ticket de caisse) — on les
  // attache à `rawText` en JSON pour les afficher dans la modale Scan
  // (bloc d'aperçu) et permettre à l'utilisateur de les copier.
  const supplier = pred.supplier_name?.value ?? null;
  const invoiceMeta = {
    invoiceNumber: pred.invoice_number?.value ?? null,
    dueDate: pred.due_date?.value ?? null,
    netHT: pred.total_net?.value?.toFixed(2) ?? null,
    taxTotal: pred.total_tax?.value?.toFixed(2) ?? null,
    taxes: pred.taxes
      ?.filter((t) => t.value !== null)
      .map((t) => ({
        rate: t.rate,
        base: t.base,
        value: t.value,
      })),
    supplier: {
      name: supplier,
      address: pred.supplier_address?.value ?? null,
      vatNumber:
        pred.supplier_company_registrations?.find(
          (r) => r.type === "VAT_NUMBER" || r.type === "TVA",
        )?.value ?? null,
      siret:
        pred.supplier_company_registrations?.find(
          (r) => r.type === "SIRET",
        )?.value ?? null,
      iban: pred.supplier_payment_details?.[0]?.iban ?? null,
      swift: pred.supplier_payment_details?.[0]?.swift ?? null,
    },
    customer: {
      name: pred.customer_name?.value ?? null,
      vatNumber:
        pred.customer_company_registrations?.find(
          (r) => r.type === "VAT_NUMBER" || r.type === "TVA",
        )?.value ?? null,
    },
  };

  const confidences = [
    pred.total_amount?.confidence,
    pred.supplier_name?.confidence,
    pred.date?.confidence,
    pred.invoice_number?.confidence,
  ].filter((c): c is number => typeof c === "number");
  const confidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.9;

  return {
    merchant: supplier,
    amount: pred.total_amount?.value
      ? pred.total_amount.value.toFixed(2)
      : null,
    currency: (pred.locale?.currency ?? "EUR").toUpperCase(),
    date: pred.date?.value ?? null,
    // V83 · Normalise la valeur Mindee vers une clé canonique BMD.
    category: normalizeExpenseCategory(pred.category?.value),
    confidence,
    // Sérialise les métadonnées invoice dans rawText (legit hack) — le
    // frontend peut JSON.parse pour afficher TVA, IBAN, n° facture etc.
    rawText: JSON.stringify({ kind: "invoice", invoiceMeta }, null, 2),
    items,
  };
}

/**
 * V42 · Mindee Invoice + Receipt en PARALLÈLE.
 *
 * Avant V42 : on appelait Invoice, puis si échec → Receipt (sériel, ~6-8s).
 * En V42 on lance les deux en même temps avec Promise.allSettled :
 *  - Pour les vraies factures (PDF B2B) Invoice gagne.
 *  - Pour les tickets de caisse Receipt gagne.
 *  - On choisit le résultat qui a la meilleure confidence ET qui a au moins
 *    un montant ET un marchand non null.
 *
 * Gain latence : -40% en moyenne (~4-5s → ~2.5-3s) car le plus long des deux
 * appels est désormais notre baseline, pas la somme.
 *
 * Coût : 2x plus d'appels Mindee. Mais les forfaits Mindee BMD sont
 * largement sous quota → no big deal. Si quota devient critique, on
 * pourra revenir au mode sériel via MINDEE_DOC_TYPE=invoice.
 */
async function scanWithMindee(
  buffer: Buffer,
  mimetype: string,
): Promise<ParsedReceipt> {
  const env = loadEnv();
  const force = env.MINDEE_DOC_TYPE;

  if (force === "receipt") return scanWithMindeeReceipt(buffer, mimetype);
  if (force === "invoice") return scanWithMindeeInvoice(buffer, mimetype);

  // PDF → toujours Invoice (les tickets de caisse en PDF n'existent pas)
  if (mimetype === "application/pdf") {
    return scanWithMindeeInvoice(buffer, mimetype);
  }

  // Mode parallèle : Invoice + Receipt simultanés, on garde le meilleur.
  const [invoiceResult, receiptResult] = await Promise.allSettled([
    scanWithMindeeInvoice(buffer, mimetype),
    scanWithMindeeReceipt(buffer, mimetype),
  ]);

  function score(r: ParsedReceipt | null): number {
    if (!r) return -1;
    let s = r.confidence;
    if (r.amount) s += 0.15;
    if (r.merchant) s += 0.1;
    if (r.items && r.items.length > 0) s += 0.05;
    return s;
  }

  const inv =
    invoiceResult.status === "fulfilled" ? invoiceResult.value : null;
  const rec =
    receiptResult.status === "fulfilled" ? receiptResult.value : null;

  if (!inv && !rec) {
    // Les 2 ont échoué → on laisse remonter l'erreur Invoice pour debug
    if (invoiceResult.status === "rejected") throw invoiceResult.reason;
    if (receiptResult.status === "rejected") throw receiptResult.reason;
    throw Errors.internal("Mindee : aucun résultat utilisable.");
  }

  if (score(inv) >= score(rec)) return inv ?? rec!;
  return rec!;
}

// ============================================================
// V42 · POST-TRAITEMENT LLM (Claude Haiku / GPT-4o-mini)
// ============================================================
//
// Après le scan OCR (Mindee/Vision), on passe le résultat à un LLM léger
// pour normaliser et valider :
//   - merchant : capitalisation correcte, nom canonique (ex: "CARREFOUR CITY" → "Carrefour City")
//   - date : strict ISO 8601 YYYY-MM-DD (les OCR renvoient parfois "5 mai 2026")
//   - currency : code ISO 4217 strict (ex: "€" → "EUR")
//   - amount : format string avec point décimal, validation sanity
//   - category : taxonomie BMD (resto, courses, transport, logement, loisirs, sante, autres)
//
// Ce passage coûte ~$0.001/facture (gpt-4o-mini ~300 tokens in, ~80 out)
// mais améliore notablement la propreté du résultat affiché.
// On utilise OpenAI car déjà configuré (Voice). Anthropic possible si besoin.

const LLM_NORMALIZE_PROMPT = `Tu es l'assistant de normalisation BMD pour les factures scannées.
On vient de te donner un résultat OCR (Mindee ou Vision). Ta mission : retourner UN JSON STRICT (rien d'autre, pas de markdown) avec les champs normalisés et corrigés. Si un champ est inutilisable, mets null.

{
  "merchant": "Nom propre, capitalisation correcte (ex: 'Carrefour City', pas 'CARREFOUR CITY 75011 PARIS'). Null si pas identifiable.",
  "amount": "Montant TTC total au format string décimal point (ex: '12.34'). Si le scan a renvoyé une virgule, convertir.",
  "currency": "Code ISO 4217 strict (EUR, USD, XAF, NGN, MAD, etc.). Si seulement un symbole (€, $), convertir.",
  "date": "Date ISO 8601 strict YYYY-MM-DD. Si l'OCR a renvoyé '5 mai 2026' ou '05/05/26', convertir. Null si introuvable.",
  "category": "UN seul mot parmi: resto, courses, transport, logement, loisirs, sante, autres. Choisi d'après le marchand."
}

INPUT (résultat OCR brut) :`;

interface LlmNormalizedFields {
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  date: string | null;
  category: string | null;
}

/**
 * Passe le résultat OCR brut à GPT-4o-mini pour normalisation et correction.
 * Best-effort : si l'appel échoue (réseau, quota), on retourne `parsed` tel quel.
 */
async function normalizeWithLLM(
  parsed: ParsedReceipt,
): Promise<ParsedReceipt> {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY) return parsed; // pas dispo → skip

  // Si on a déjà une très haute confiance ET tous les champs essentiels,
  // on skippe le LLM (économie). Au-dessus de 0.95 et merchant+amount+date
  // remplis, Mindee est généralement déjà très propre.
  if (
    parsed.confidence >= 0.95 &&
    parsed.merchant &&
    parsed.amount &&
    parsed.date
  ) {
    return parsed;
  }

  const ocrSnapshot = {
    merchant: parsed.merchant,
    amount: parsed.amount,
    currency: parsed.currency,
    date: parsed.date,
    category: parsed.category,
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // Modèle léger pour normalisation — gpt-4o-mini par défaut.
        // Override possible via env var pour A/B testing.
        model: process.env.OPENAI_NORMALIZE_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 250,
        temperature: 0,
        messages: [
          {
            role: "user",
            content:
              LLM_NORMALIZE_PROMPT +
              "\n" +
              JSON.stringify(ocrSnapshot, null, 2),
          },
        ],
      }),
    });

    if (!r.ok) return parsed; // best-effort

    const body = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return parsed;

    let normalized: LlmNormalizedFields;
    try {
      normalized = JSON.parse(content) as LlmNormalizedFields;
    } catch {
      return parsed;
    }

    // Merge : on conserve les items (le LLM ne les voit pas), on remplace
    // les champs scalaires si la valeur normalisée est non-null.
    return {
      ...parsed,
      merchant: normalized.merchant ?? parsed.merchant,
      amount: normalized.amount ?? parsed.amount,
      currency: (normalized.currency ?? parsed.currency).toUpperCase(),
      date: normalized.date ?? parsed.date,
      // V83 · Normalise la sortie LLM (peut renvoyer "Restaurant" ou
      // un libellé hors-liste) ; si rien d'utilisable, garde l'ancienne.
      category: normalizeExpenseCategory(normalized.category) ?? parsed.category,
      // Bump confidence quand le LLM a corrigé (signal qu'on a doublé-vérifié)
      confidence: Math.min(0.99, parsed.confidence + 0.05),
    };
  } catch {
    return parsed; // best-effort
  }
}

// ============================================================
// OPENAI VISION · gpt-4o-mini avec prompt structuré
// ============================================================
//
// On envoie l'image en base64 + un prompt qui demande un JSON strict.
// Coût : très bas (gpt-4o-mini accepte les images), précision excellente
// même sur les tickets multilingues / froissés.

const OPENAI_VISION_PROMPT = `Tu es un OCR expert en tickets de caisse / factures.
Analyse l'image et retourne UNIQUEMENT un JSON strict (rien d'autre, pas de markdown) :
{
  "merchant": "nom du commerçant ou null",
  "amount": "12.34",
  "currency": "EUR",
  "date": "2026-05-06",
  "category": "resto|courses|transport|logement|loisirs|sante|autres",
  "items": [
    { "description": "Café", "quantity": 1, "unitPrice": "2.50", "totalPrice": "2.50" }
  ]
}
- amount = montant total TTC payé, en string avec point décimal
- currency = code ISO 4217 (EUR, USD, XAF, NGN, MAD…)
- date = ISO 8601 (YYYY-MM-DD), null si introuvable
- items = liste des lignes du ticket (vide si non lisible)
Si l'image n'est pas un ticket, retourne {"merchant":null,"amount":null,"currency":"EUR","date":null,"category":null,"items":[]}.`;

async function scanWithOpenAiVision(
  buffer: Buffer,
  mimetype: string,
): Promise<ParsedReceipt> {
  const env = loadEnv();
  const dataUrl = `data:${mimetype};base64,${buffer.toString("base64")}`;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OPENAI_VISION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw Errors.internal(
      `OpenAI Vision a refusé la requête (${r.status}) : ${txt.slice(0, 120)}`,
    );
  }
  const body = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw Errors.internal("OpenAI Vision a renvoyé une réponse vide.");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw Errors.internal("OpenAI Vision : JSON invalide.");
  }

  const items: ParsedItem[] =
    Array.isArray(parsed.items)
      ? parsed.items
          .filter((it: any) => it && it.description && it.totalPrice)
          .map((it: any) => ({
            description: String(it.description),
            quantity:
              typeof it.quantity === "number" && it.quantity > 0
                ? it.quantity
                : 1,
            unitPrice:
              String(it.unitPrice ?? it.totalPrice ?? "0"),
            totalPrice: String(it.totalPrice ?? "0"),
          }))
      : [];

  return {
    merchant: parsed.merchant ?? null,
    amount: parsed.amount ?? null,
    currency: (parsed.currency ?? "EUR").toUpperCase(),
    date: parsed.date ?? null,
    category: parsed.category ?? null,
    // OpenAI Vision est très fiable sur les tickets nets — on tag à 0.92
    confidence: 0.92,
    rawText: "",
    items,
  };
}

// ============================================================
// API publique : scanReceiptViaProvider
// ============================================================
/**
 * Scanne un ticket avec le provider configuré, avec fallback automatique
 * sur Tesseract si le provider externe échoue (timeout, quota, panne…).
 *
 * `tesseractFallback` est passé en paramètre pour éviter la dépendance
 * circulaire avec `ocr.service.ts`.
 */
/**
 * V46 · Scan adaptatif selon le tier IA du plan du payeur.
 *
 * Stratégie d'économie : on n'appelle Mindee Pro (cher) QUE si le plan
 * du payeur le justifie. Sinon on utilise OpenAI Vision (cheap) ou
 * Tesseract local (gratuit) avec normalisation LLM par-dessus.
 *
 * Fallback intelligent :
 *   - PREMIUM tier (Pro plan) → Mindee Pro · si échec → Vision · si échec → Tesseract
 *   - STANDARD tier (Famille) → Vision direct · Mindee uniquement si confidence<75%
 *   - ECONOMY tier (Free/Perso) → Vision direct · Tesseract si échec · jamais Mindee
 *
 * Coût attendu par scan :
 *   - economy : ~0,003 €
 *   - standard : ~0,01 € (Mindee fallback rare)
 *   - premium : ~0,07 €
 */
export async function scanReceiptViaProvider(input: {
  buffer: Buffer;
  mimetype: string;
  tesseractFallback: () => Promise<ParsedReceipt>;
  /** V46 · tier IA du payeur (depuis Plan.limits.iaPipelineTier). Default economy. */
  iaTier?: IaPipelineTier;
}): Promise<ParsedReceipt & { provider: OcrProviderName }> {
  const tier: IaPipelineTier = input.iaTier ?? "economy";
  const env = loadEnv();

  // ===== PREMIUM (Pro plan) — Mindee qualité max =====
  if (tier === "premium" && env.MINDEE_API_KEY) {
    try {
      const raw = await scanWithMindee(input.buffer, input.mimetype);
      const normalized = await normalizeWithLLM(raw);
      return { ...normalized, provider: "mindee" };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[ocr][premium] Mindee échec → fallback Vision :",
        e instanceof Error ? e.message : e,
      );
      // Fallback Vision puis Tesseract
      if (env.OPENAI_API_KEY) {
        try {
          const raw = await scanWithOpenAiVision(input.buffer, input.mimetype);
          const normalized = await normalizeWithLLM(raw);
          return { ...normalized, provider: "openai_vision" };
        } catch (e2) {
          // eslint-disable-next-line no-console
          console.warn(
            "[ocr][premium] Vision échec aussi → Tesseract :",
            e2 instanceof Error ? e2.message : e2,
          );
        }
      }
      const r = await input.tesseractFallback();
      const normalized = await normalizeWithLLM(r);
      return { ...normalized, provider: "tesseract" };
    }
  }

  // ===== STANDARD (Famille) — Vision direct + Mindee fallback si confidence faible =====
  if (tier === "standard" && env.OPENAI_API_KEY) {
    try {
      const raw = await scanWithOpenAiVision(input.buffer, input.mimetype);
      // Si Vision retourne une confidence < 75% ET qu'on a Mindee, on
      // appelle Mindee comme « 2e avis » pour les cas difficiles. Coût
      // moyen reste bas car ~80% des scans passent OK avec Vision seul.
      if (raw.confidence < 0.75 && env.MINDEE_API_KEY) {
        try {
          const mindeeRaw = await scanWithMindee(
            input.buffer,
            input.mimetype,
          );
          // Si Mindee a une meilleure confidence, on l'utilise
          if (mindeeRaw.confidence > raw.confidence) {
            const normalized = await normalizeWithLLM(mindeeRaw);
            return { ...normalized, provider: "mindee" };
          }
        } catch {
          // Mindee fallback échec → on garde le résultat Vision
        }
      }
      const normalized =
        raw.confidence < 0.9 ? await normalizeWithLLM(raw) : raw;
      return { ...normalized, provider: "openai_vision" };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[ocr][standard] Vision échec → Tesseract :",
        e instanceof Error ? e.message : e,
      );
      const r = await input.tesseractFallback();
      const normalized = await normalizeWithLLM(r);
      return { ...normalized, provider: "tesseract" };
    }
  }

  // ===== ECONOMY (Free / Perso) — Vision direct, jamais Mindee =====
  if (env.OPENAI_API_KEY) {
    try {
      const raw = await scanWithOpenAiVision(input.buffer, input.mimetype);
      const normalized =
        raw.confidence < 0.9 ? await normalizeWithLLM(raw) : raw;
      return { ...normalized, provider: "openai_vision" };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[ocr][economy] Vision échec → Tesseract :",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Ultime fallback : Tesseract local (gratuit, plus lent, qualité moyenne)
  const r = await input.tesseractFallback();
  const normalized = await normalizeWithLLM(r);
  return { ...normalized, provider: "tesseract" };
}
