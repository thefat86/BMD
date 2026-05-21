/**
 * V234 — Identité officielle scannée par OpenAI Vision.
 *
 * Pipeline analogue à `payment-methods-ocr.service.ts` (V137) mais pour
 * une pièce d'identité (CI, passeport, titre de séjour, permis). On
 * extrait :
 *   - firstName, lastName (officiels)
 *   - birthDate, birthPlace
 *   - documentNumber, issueDate, expiryDate
 *   - issuingCountry (ISO-3166-1 alpha-2)
 *
 * Différence avec OCR RIB : ici on PERSISTE le résultat (modèle
 * IdentityDocument) car ces données seront réutilisées dans la RDD,
 * les contrats Yousign, les reçus fiscaux nominatifs, etc.
 *
 * RGPD (TODO V236) :
 *  - Chiffrer at-rest les champs firstName/lastName/birthDate/documentNumber
 *    via pgcrypto ou crypto-vault.ts (V137 mode `vault`).
 *  - Stockage du fichier source : si Cloudinary, utiliser bucket privé
 *    + URLs signées avec TTL court (≤ 1h).
 *  - Journaliser les accès lecture (qui a vu quoi quand) via UsageEvent.
 *  - DELETE cascade depuis User déjà en place (droit à l'oubli).
 */

import { prisma } from "../../lib/db.js";
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";
import { storePhoto } from "../../lib/photo-storage.js";

// ============================================================
// Types
// ============================================================

export type IdentityDocumentType =
  | "ID_CARD"
  | "PASSPORT"
  | "RESIDENCE"
  | "DRIVER"
  | "OTHER";

export type IdentityVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export interface IdentityExtraction {
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;        // ISO yyyy-mm-dd
  birthPlace: string | null;
  documentNumber: string | null;
  issueDate: string | null;        // ISO yyyy-mm-dd
  expiryDate: string | null;       // ISO yyyy-mm-dd
  issuingCountry: string | null;   // ISO alpha-2
  confidence: number;              // 0..1
  type: IdentityDocumentType;
}

// ============================================================
// PROMPT OpenAI Vision
// ============================================================

const IDENTITY_PROMPT = `Tu es un expert en extraction de données d'état civil sur pièces d'identité. L'image peut être :
- Carte nationale d'identité (recto/verso ou MRZ)
- Passeport (page biométrique avec MRZ)
- Titre de séjour
- Permis de conduire
- N'importe quel document officiel d'identité

Extrais TOUT ce que tu peux lire, même partiellement. Retourne UNIQUEMENT un JSON strict (sans markdown) :
{
  "type": "ID_CARD" | "PASSPORT" | "RESIDENCE" | "DRIVER" | "OTHER",
  "firstName": "Marie Claire" | null,
  "lastName": "Dupont" | null,
  "birthDate": "1985-03-12" | null,
  "birthPlace": "Paris (75)" | null,
  "documentNumber": "12AB34567" | null,
  "issueDate": "2020-01-15" | null,
  "expiryDate": "2030-01-14" | null,
  "issuingCountry": "FR" | null,
  "confidence": 0.0-1.0
}

Règles strictes :
- firstName : tous les prénoms officiels (ex: "Marie Claire", pas seulement "Marie")
- lastName : nom de famille principal (ignore le nom d'épouse si nom de naissance distinct)
- birthDate / issueDate / expiryDate : format ISO yyyy-mm-dd UNIQUEMENT. Si tu lis "12.03.1985" en FR, convertis en "1985-03-12".
- documentNumber : tel qu'imprimé sur le document, sans espace
- issuingCountry : code ISO 3166-1 alpha-2 (FR, LU, CM, CI, MA, BE, DE, etc.) — déduis du pays émetteur visible
- confidence : 0.9+ si tout parfaitement lisible, 0.6-0.8 si certains champs incertains, 0.3-0.5 si extraction partielle mais utile, 0.0 si AUCUNE donnée d'identité détectable
- Si l'image n'est PAS une pièce d'identité (selfie, paysage…), retourne tous les champs à null avec confidence 0 et type "OTHER".`;

// ============================================================
// VALIDATION
// ============================================================

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set<IdentityDocumentType>([
  "ID_CARD",
  "PASSPORT",
  "RESIDENCE",
  "DRIVER",
  "OTHER",
]);

// ============================================================
// Service: scanIdentityDocument
// ============================================================

/**
 * Reçoit un fichier (base64), demande à OpenAI Vision d'extraire les
 * champs, persiste un IdentityDocument PENDING et retourne le résultat.
 *
 * Le frontend affiche les champs extraits dans un formulaire éditable
 * et appelle ensuite `verifyIdentityDocument()` quand l'user valide.
 */
export async function scanIdentityDocument(input: {
  userId: string;
  type: IdentityDocumentType;
  fileBase64: string;
  mimeType: string;
}): Promise<{
  identity: any;
  suggestions: IdentityExtraction;
}> {
  const env = loadEnv();

  // Validation des inputs
  if (!ALLOWED_TYPES.has(input.type)) {
    throw Errors.badRequest(
      `Type de document non supporté (${input.type})`,
      { tip: "Choisis Carte d'identité, Passeport, Titre de séjour ou Permis." },
    );
  }

  const mime = input.mimeType.toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    throw Errors.badRequest(
      `Format de fichier non supporté (${input.mimeType})`,
      { tip: "Formats acceptés : JPEG, PNG, WebP, HEIC, PDF." },
    );
  }

  const approxBytes = Math.floor((input.fileBase64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    throw Errors.badRequest("Le fichier est trop lourd (max 10 MB)", {
      tip: "Réduis la résolution de la photo et réessaie.",
    });
  }

  // ============================================================
  // Extraction IA (ou fallback si pas de clé)
  // ============================================================

  let extraction: IdentityExtraction;

  if (env.OPENAI_API_KEY && mime !== "application/pdf") {
    // OpenAI Vision n'accepte pas le PDF directement, on le skip pour
    // l'instant (TODO V236 : pdf-to-image converter ou Mindee fallback).
    extraction = await callOpenAiVision(input.fileBase64, mime, env.OPENAI_API_KEY);
  } else {
    // Stub fallback : retourne des valeurs vides, l'user remplira manuellement.
    extraction = {
      type: input.type,
      firstName: null,
      lastName: null,
      birthDate: null,
      birthPlace: null,
      documentNumber: null,
      issueDate: null,
      expiryDate: null,
      issuingCountry: null,
      confidence: 0,
    };
  }

  // ============================================================
  // Stockage du fichier (Cloudinary ou base64 inline selon config)
  // ============================================================

  let fileUrl: string | null = null;
  try {
    if (mime.startsWith("image/")) {
      const dataUrl = `data:${mime};base64,${stripBase64Prefix(input.fileBase64)}`;
      // storePhoto valide aussi taille/MIME (1 MB max images standards).
      // Pour identité on accepte jusqu'à 10 MB mais on tente quand même
      // si Cloudinary est dispo, sinon on tronque l'URL data.
      try {
        fileUrl = await storePhoto(dataUrl, input.userId);
      } catch {
        // Fallback : on stocke la data URL telle quelle si trop lourde
        // pour storePhoto (limite 1 MB) — accepté pour identité.
        fileUrl = dataUrl;
      }
    } else if (mime === "application/pdf") {
      // PDF : stockage data URL inline pour MVP. Cloudinary supporte
      // upload PDF en raw mode (TODO V236).
      fileUrl = `data:${mime};base64,${stripBase64Prefix(input.fileBase64)}`;
    }
  } catch (e) {
    // Non bloquant : on persiste sans fileUrl
    fileUrl = null;
  }

  // ============================================================
  // Upsert IdentityDocument (1 par user, le récent remplace l'ancien)
  // ============================================================

  const identity = await (prisma as any).identityDocument.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      type: input.type,
      firstName: extraction.firstName,
      lastName: extraction.lastName,
      birthDate: parseDate(extraction.birthDate),
      birthPlace: extraction.birthPlace,
      documentNumber: extraction.documentNumber,
      issueDate: parseDate(extraction.issueDate),
      expiryDate: parseDate(extraction.expiryDate),
      issuingCountry: extraction.issuingCountry,
      fileUrl,
      fileType: mime,
      fileSizeBytes: approxBytes,
      status: "PENDING",
      aiConfidence: extraction.confidence,
    },
    update: {
      type: input.type,
      firstName: extraction.firstName,
      lastName: extraction.lastName,
      birthDate: parseDate(extraction.birthDate),
      birthPlace: extraction.birthPlace,
      documentNumber: extraction.documentNumber,
      issueDate: parseDate(extraction.issueDate),
      expiryDate: parseDate(extraction.expiryDate),
      issuingCountry: extraction.issuingCountry,
      fileUrl,
      fileType: mime,
      fileSizeBytes: approxBytes,
      status: "PENDING",
      verifiedAt: null,
      aiConfidence: extraction.confidence,
      scannedAt: new Date(),
    },
  });

  return { identity, suggestions: extraction };
}

// ============================================================
// Service: verifyIdentityDocument
// ============================================================

/**
 * L'user a vu les champs extraits, les a corrigés si besoin, et valide.
 * Le statut passe à VERIFIED et `verifiedAt` est rempli.
 */
export async function verifyIdentityDocument(input: {
  userId: string;
  edits?: {
    firstName?: string | null;
    lastName?: string | null;
    birthDate?: string | null;
    birthPlace?: string | null;
    documentNumber?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    issuingCountry?: string | null;
  };
}): Promise<{ identity: any }> {
  const existing = await (prisma as any).identityDocument.findUnique({
    where: { userId: input.userId },
  });
  if (!existing) {
    throw Errors.notFound(
      "Aucune pièce d'identité scannée pour ce compte",
      { tip: "Scanne d'abord ta pièce d'identité." } as any,
    );
  }

  const edits = input.edits ?? {};

  // Validation minimale : firstName + lastName requis pour VERIFIED
  const finalFirstName = edits.firstName ?? existing.firstName;
  const finalLastName = edits.lastName ?? existing.lastName;
  if (!finalFirstName || !finalLastName) {
    throw Errors.badRequest(
      "Le prénom et le nom officiels sont obligatoires",
      { tip: "Complète les deux champs avant de valider." },
    );
  }

  const identity = await (prisma as any).identityDocument.update({
    where: { userId: input.userId },
    data: {
      firstName: finalFirstName,
      lastName: finalLastName,
      birthDate:
        "birthDate" in edits ? parseDate(edits.birthDate ?? null) : existing.birthDate,
      birthPlace:
        "birthPlace" in edits ? edits.birthPlace ?? null : existing.birthPlace,
      documentNumber:
        "documentNumber" in edits
          ? edits.documentNumber ?? null
          : existing.documentNumber,
      issueDate:
        "issueDate" in edits ? parseDate(edits.issueDate ?? null) : existing.issueDate,
      expiryDate:
        "expiryDate" in edits
          ? parseDate(edits.expiryDate ?? null)
          : existing.expiryDate,
      issuingCountry:
        "issuingCountry" in edits
          ? edits.issuingCountry ?? null
          : existing.issuingCountry,
      status: "VERIFIED",
      verifiedAt: new Date(),
    },
  });

  return { identity };
}

// ============================================================
// Service: getMyIdentity / getOfficialName
// ============================================================

export async function getMyIdentity(userId: string): Promise<{
  identity: any | null;
}> {
  const identity = await (prisma as any).identityDocument.findUnique({
    where: { userId },
  });
  return { identity };
}

/**
 * Helper : retourne le nom officiel à utiliser dans les documents
 * juridiques (RDD, contrats…).
 * - Si VERIFIED : { firstName, lastName, displayName } depuis IdentityDocument
 * - Sinon : fallback sur `user.displayName` (avec firstName/lastName null)
 */
export async function getOfficialName(userId: string): Promise<{
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  isOfficial: boolean;
}> {
  const [identity, user] = await Promise.all([
    (prisma as any).identityDocument.findUnique({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    }),
  ]);

  if (
    identity &&
    identity.status === "VERIFIED" &&
    identity.firstName &&
    identity.lastName
  ) {
    return {
      firstName: identity.firstName,
      lastName: identity.lastName,
      displayName: `${identity.firstName} ${identity.lastName}`,
      isOfficial: true,
    };
  }

  return {
    firstName: null,
    lastName: null,
    displayName: user?.displayName ?? "—",
    isOfficial: false,
  };
}

// ============================================================
// Helpers internes
// ============================================================

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function stripBase64Prefix(b64: string): string {
  return b64.replace(/^data:[^;]+;base64,/i, "");
}

async function callOpenAiVision(
  fileBase64: string,
  mime: string,
  apiKey: string,
): Promise<IdentityExtraction> {
  const clean = stripBase64Prefix(fileBase64);
  const dataUrl = `data:${mime};base64,${clean}`;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: loadEnv().OPENAI_VISION_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 700,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: IDENTITY_PROMPT },
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
      `Le service d'extraction d'identité est injoignable : ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    if (response.status >= 500) {
      throw Errors.internal(
        `Le service IA a rencontré une erreur temporaire (${response.status}).`,
      );
    }
    throw Errors.badRequest(
      `Impossible d'analyser ce document (${response.status})`,
      { tip: txt.slice(0, 200) },
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw Errors.internal("L'IA n'a renvoyé aucune réponse.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw Errors.internal("L'IA a renvoyé un JSON invalide.");
  }

  const rawType = (parsed.type ?? "OTHER") as string;
  const type = (ALLOWED_TYPES.has(rawType as IdentityDocumentType)
    ? rawType
    : "OTHER") as IdentityDocumentType;

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

  return {
    type,
    firstName: typeof parsed.firstName === "string" ? parsed.firstName : null,
    lastName: typeof parsed.lastName === "string" ? parsed.lastName : null,
    birthDate: typeof parsed.birthDate === "string" ? parsed.birthDate : null,
    birthPlace: typeof parsed.birthPlace === "string" ? parsed.birthPlace : null,
    documentNumber:
      typeof parsed.documentNumber === "string" ? parsed.documentNumber : null,
    issueDate: typeof parsed.issueDate === "string" ? parsed.issueDate : null,
    expiryDate: typeof parsed.expiryDate === "string" ? parsed.expiryDate : null,
    issuingCountry:
      typeof parsed.issuingCountry === "string"
        ? parsed.issuingCountry.toUpperCase().slice(0, 2)
        : null,
    confidence,
  };
}
