/**
 * V150.C — Service Yousign (signature électronique qualifiée eIDAS).
 *
 * Wrapper minimaliste autour de l'API Yousign v3. Le service est prêt mais
 * **inactif** tant que `YOUSIGN_API_KEY` n'est pas configurée. Toutes les
 * fonctions exportées vérifient `isYousignConfigured()` avant d'appeler
 * Yousign et lancent une erreur explicite sinon.
 *
 * RUNBOOK D'ACTIVATION
 * --------------------
 * 1. Créer un compte sur https://yousign.com (sandbox gratuit).
 * 2. Console Yousign → Workspaces → API → Generate API key (sandbox).
 *    Format attendu : `yousign_sandbox_xxxxxxxxxxxxx`.
 * 3. Configurer côté BMD .env :
 *      YOUSIGN_API_KEY=yousign_sandbox_xxx
 *      YOUSIGN_API_BASE_URL=https://api-sandbox.yousign.app/v3
 *      YOUSIGN_DEFAULT_LEVEL=advanced_electronic_signature
 *      YOUSIGN_WEBHOOK_SECRET=<random-32-bytes-hex>
 * 4. Console Yousign → Webhooks → Add → URL = `https://api.<domain>/webhooks/yousign`,
 *    events = ["signature_request.activated", "signer.done", "signer.declined",
 *              "signature_request.done", "signature_request.expired",
 *              "signature_request.cancelled"], secret = même que .env.
 * 5. Tester en sandbox via la page détail RDD → bouton "Demander signature qualifiée".
 * 6. Quand validation OK, basculer en production :
 *      YOUSIGN_API_KEY=yousign_prod_xxx
 *      YOUSIGN_API_BASE_URL=https://api.yousign.app/v3
 *
 * RÉFÉRENCES
 *   - API : https://developers.yousign.com/reference
 *   - Webhooks : https://developers.yousign.com/reference/webhooks
 *   - eIDAS levels : ES (basic) < AES < AES+ < QES (force exécutoire)
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface YousignSigner {
  /// Email du signataire (Yousign envoie le lien de signature à cette adresse)
  email: string;
  firstName: string;
  lastName: string;
  /// Numéro de téléphone E.164 (ex: +33612345678) — obligatoire pour AES+
  phoneNumber?: string;
  /// Tag interne BMD pour retrouver la DebtParty au webhook
  /// (on stocke ce tag dans le custom_field Yousign)
  bmdPartyId: string;
  /// Niveau de signature pour ce signataire (override le niveau global).
  signatureLevel?: YousignSignatureLevel;
}

export type YousignSignatureLevel =
  | "electronic_signature"
  | "advanced_electronic_signature"
  | "advanced_electronic_signature_with_qualified_certificate"
  | "qualified_electronic_signature";

export interface CreateSignatureRequestInput {
  /// Nom lisible pour la procédure (visible dans console Yousign)
  name: string;
  /// PDF de l'acte sous seing privé (Uint8Array)
  pdfBytes: Uint8Array;
  /// Nom du fichier PDF (ex: "BMD-AB12CD-acte.pdf")
  pdfFilename: string;
  /// Liste des signataires (ordre = ordre de signature si signature séquentielle)
  signers: YousignSigner[];
  /// Date d'expiration de la demande (ISO 8601). Yousign refuse > 90j.
  expiresAt?: Date;
  /// Mode de signature : "sequential" (un après l'autre) ou "parallel" (tous en même temps)
  signingFlow?: "sequential" | "parallel";
}

export interface CreateSignatureRequestResult {
  /// UUID de la Signature Request Yousign
  procedureId: string;
  /// Statut initial ("draft" puis "ongoing" après activation)
  status: string;
  /// Mapping bmdPartyId → yousignSignerId (à persister sur DebtParty)
  signerIds: Record<string, string>;
}

export interface YousignWebhookPayload {
  /// Type d'événement Yousign (ex: "signer.done", "signature_request.done")
  event_name: string;
  event_id: string;
  event_time: string;
  data: {
    signature_request?: {
      id: string;
      status: string;
      name?: string;
    };
    signer?: {
      id: string;
      status: string;
      info?: { email?: string };
    };
  };
}

// ---------------------------------------------------------------------------
// Helpers configuration
// ---------------------------------------------------------------------------

/**
 * Renvoie true si Yousign est activé (clé API présente).
 * Utilisé partout pour gater les routes/UI.
 */
export function isYousignConfigured(): boolean {
  return Boolean(loadEnv().YOUSIGN_API_KEY);
}

function getApiKey(): string {
  const env = loadEnv();
  if (!env.YOUSIGN_API_KEY) {
    throw Errors.badRequest(
      "Yousign n'est pas configuré sur cette instance (YOUSIGN_API_KEY manquante)",
    );
  }
  return env.YOUSIGN_API_KEY;
}

function getBaseUrl(): string {
  return loadEnv().YOUSIGN_API_BASE_URL;
}

// ---------------------------------------------------------------------------
// HTTP wrapper bas niveau
// ---------------------------------------------------------------------------

async function yousignFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<any> {
  const apiKey = getApiKey();
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  let body: BodyInit | undefined = init.body as BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const r = await fetch(url, { ...init, headers, body });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw Errors.badRequest(
      `Yousign API error ${r.status}: ${txt.slice(0, 500)}`,
    );
  }
  if (r.status === 204) return null;
  return r.json();
}

async function yousignFetchMultipart(
  path: string,
  form: FormData,
): Promise<any> {
  const apiKey = getApiKey();
  const url = `${getBaseUrl()}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: form,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw Errors.badRequest(
      `Yousign API error ${r.status}: ${txt.slice(0, 500)}`,
    );
  }
  return r.json();
}

// ---------------------------------------------------------------------------
// API publique du service
// ---------------------------------------------------------------------------

/**
 * Crée une Signature Request Yousign à partir d'un PDF + liste de signataires.
 *
 * Flow :
 *   1. POST /signature_requests (draft)
 *   2. POST /signature_requests/:id/documents (upload PDF)
 *   3. POST /signature_requests/:id/signers (× N pour chaque signataire)
 *   4. POST /signature_requests/:id/activate (envoie les emails)
 *
 * Note : ce service ne place pas les "fields" de signature visuels sur le PDF
 * (champs draggable). Pour le MVP, on s'appuie sur la mention "Bon pour accord"
 * acceptée par Yousign en niveau AES. À étendre en V150.C3 pour placer un
 * cadre signature visible sur la dernière page.
 */
export async function createYousignSignatureRequest(
  input: CreateSignatureRequestInput,
): Promise<CreateSignatureRequestResult> {
  if (!isYousignConfigured()) {
    throw Errors.badRequest(
      "Yousign n'est pas configuré (YOUSIGN_API_KEY manquante). Ajoute la clé dans .env pour activer la signature qualifiée.",
    );
  }
  const env = loadEnv();
  const defaultLevel = env.YOUSIGN_DEFAULT_LEVEL;
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 30 * 86_400_000);

  // 1. Création du Signature Request en draft.
  const sr = await yousignFetch("/signature_requests", {
    method: "POST",
    json: {
      name: input.name,
      delivery_mode: "email",
      timezone: "Europe/Paris",
      expiration_date: expiresAt.toISOString().slice(0, 10),
      ordered_signers: (input.signingFlow ?? "parallel") === "sequential",
    },
  });
  const procedureId = sr.id as string;

  // 2. Upload du PDF en pièce jointe.
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.pdfBytes)], { type: "application/pdf" }),
    input.pdfFilename,
  );
  form.append("nature", "signable_document");
  await yousignFetchMultipart(
    `/signature_requests/${procedureId}/documents`,
    form,
  );

  // 3. Création des signataires.
  const signerIds: Record<string, string> = {};
  for (const s of input.signers) {
    const created = await yousignFetch(
      `/signature_requests/${procedureId}/signers`,
      {
        method: "POST",
        json: {
          info: {
            first_name: s.firstName,
            last_name: s.lastName,
            email: s.email,
            phone_number: s.phoneNumber,
            locale: "fr",
          },
          signature_level: s.signatureLevel ?? defaultLevel,
          signature_authentication_mode: s.phoneNumber ? "otp_sms" : "no_otp",
          custom_field: { bmdPartyId: s.bmdPartyId },
        },
      },
    );
    signerIds[s.bmdPartyId] = created.id as string;
  }

  // 4. Activation (envoie les emails de signature).
  const activated = await yousignFetch(
    `/signature_requests/${procedureId}/activate`,
    { method: "POST" },
  );

  return {
    procedureId,
    status: activated.status ?? "ongoing",
    signerIds,
  };
}

/**
 * Récupère l'état actuel d'une Signature Request (utilisé pour polling
 * fallback si les webhooks tardent).
 */
export async function getYousignSignatureRequest(
  procedureId: string,
): Promise<{ id: string; status: string; signers: Array<{ id: string; status: string }> }> {
  const sr = await yousignFetch(`/signature_requests/${procedureId}`, {
    method: "GET",
  });
  return {
    id: sr.id,
    status: sr.status,
    signers: (sr.signers ?? []).map((s: any) => ({
      id: s.id,
      status: s.status,
    })),
  };
}

/**
 * Annule une Signature Request en cours.
 */
export async function cancelYousignSignatureRequest(
  procedureId: string,
  reason: string,
): Promise<void> {
  await yousignFetch(`/signature_requests/${procedureId}/cancel`, {
    method: "POST",
    json: { reason },
  });
}

/**
 * Récupère le PDF signé final (audit trail inclus).
 */
export async function downloadYousignSignedPdf(
  procedureId: string,
): Promise<Uint8Array> {
  const env = loadEnv();
  const r = await fetch(
    `${getBaseUrl()}/signature_requests/${procedureId}/documents/download`,
    {
      headers: {
        Authorization: `Bearer ${env.YOUSIGN_API_KEY}`,
        Accept: "application/pdf",
      },
    },
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw Errors.badRequest(
      `Yousign signed PDF download error ${r.status}: ${txt.slice(0, 500)}`,
    );
  }
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Webhook validation
// ---------------------------------------------------------------------------

/**
 * Vérifie la signature HMAC d'un webhook Yousign.
 *
 * Yousign signe chaque webhook avec HMAC-SHA256 sur le body brut + un secret
 * partagé (`YOUSIGN_WEBHOOK_SECRET`). Le header attendu est `X-Yousign-Signature-256`
 * au format `sha256=<hex>`.
 *
 * Renvoie true si la signature est valide, false sinon (ou si pas de secret
 * configuré → on rejette).
 */
export function verifyYousignWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
): boolean {
  const env = loadEnv();
  if (!env.YOUSIGN_WEBHOOK_SECRET) {
    // eslint-disable-next-line no-console
    console.warn(
      "[yousign-webhook] YOUSIGN_WEBHOOK_SECRET not configured, rejecting all webhooks",
    );
    return false;
  }
  if (!signatureHeader) return false;
  const cleaned = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  let expectedHex: string;
  try {
    expectedHex = createHmac("sha256", env.YOUSIGN_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
  } catch {
    return false;
  }
  try {
    const a = Buffer.from(cleaned, "hex");
    const b = Buffer.from(expectedHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
