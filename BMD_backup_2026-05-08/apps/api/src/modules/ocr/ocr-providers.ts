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

export type OcrProviderName = "mindee" | "openai_vision" | "tesseract";

/**
 * Détermine quel provider est utilisable selon la config env.
 * Retourne `tesseract` par défaut si aucune clé externe n'est configurée.
 */
export function pickOcrProvider(forced?: string): OcrProviderName {
  const env = loadEnv();
  const mode = (forced ?? env.OCR_PROVIDER ?? "auto").toLowerCase();
  if (mode === "tesseract") return "tesseract";
  if (mode === "mindee" && env.MINDEE_API_KEY) return "mindee";
  if (mode === "openai_vision" && env.OPENAI_API_KEY) return "openai_vision";
  // Mode auto : meilleur dispo
  if (env.MINDEE_API_KEY) return "mindee";
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
    category: pred.category?.value ?? null,
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
    category: pred.category?.value ?? null,
    confidence,
    // Sérialise les métadonnées invoice dans rawText (legit hack) — le
    // frontend peut JSON.parse pour afficher TVA, IBAN, n° facture etc.
    rawText: JSON.stringify({ kind: "invoice", invoiceMeta }, null, 2),
    items,
  };
}

/**
 * Choisit entre le modèle Receipt (tickets) et Invoice (factures pro).
 * Heuristique simple :
 *   - PDF → c'est presque toujours une facture B2B (modèle Invoice)
 *   - Image → on tente d'abord Invoice (plus précis, plus de champs).
 *     Si Invoice échoue ou retourne un montant null → fallback sur Receipt.
 *
 * L'utilisateur peut forcer un type via `MINDEE_DOC_TYPE` env var
 * ou le query param `?docType=receipt` / `?docType=invoice` (à venir).
 */
async function scanWithMindee(
  buffer: Buffer,
  mimetype: string,
): Promise<ParsedReceipt> {
  const env = loadEnv();
  const force = env.MINDEE_DOC_TYPE;

  if (force === "receipt") return scanWithMindeeReceipt(buffer, mimetype);
  if (force === "invoice") return scanWithMindeeInvoice(buffer, mimetype);

  // Mode auto : PDF → Invoice (toujours), image → Invoice avec fallback.
  if (mimetype === "application/pdf") {
    return scanWithMindeeInvoice(buffer, mimetype);
  }

  try {
    const result = await scanWithMindeeInvoice(buffer, mimetype);
    // Heuristique : si Invoice n'a pas trouvé de montant ou de fournisseur,
    // c'est probablement un ticket de caisse → réessaie avec Receipt.
    if (!result.amount && !result.merchant) {
      return scanWithMindeeReceipt(buffer, mimetype);
    }
    return result;
  } catch {
    // Si Invoice plante (ex: image illisible), tente Receipt en fallback.
    return scanWithMindeeReceipt(buffer, mimetype);
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
export async function scanReceiptViaProvider(input: {
  buffer: Buffer;
  mimetype: string;
  tesseractFallback: () => Promise<ParsedReceipt>;
}): Promise<ParsedReceipt & { provider: OcrProviderName }> {
  const provider = pickOcrProvider();

  if (provider === "tesseract") {
    const r = await input.tesseractFallback();
    return { ...r, provider: "tesseract" };
  }

  try {
    if (provider === "mindee") {
      const r = await scanWithMindee(input.buffer, input.mimetype);
      return { ...r, provider: "mindee" };
    }
    if (provider === "openai_vision") {
      const r = await scanWithOpenAiVision(input.buffer, input.mimetype);
      return { ...r, provider: "openai_vision" };
    }
    throw new Error(`Unknown OCR provider: ${provider}`);
  } catch (e) {
    // Fallback gracieux sur Tesseract
    // eslint-disable-next-line no-console
    console.warn(
      `[ocr] ${provider} a échoué, fallback Tesseract :`,
      e instanceof Error ? e.message : e,
    );
    const r = await input.tesseractFallback();
    return { ...r, provider: "tesseract" };
  }
}
