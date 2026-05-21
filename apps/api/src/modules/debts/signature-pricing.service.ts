/**
 * V151 — Service tarification signatures eIDAS par niveau × pays.
 *
 * Logique :
 *  - Chaque niveau (SIMPLE / ADVANCED / NOTARIZED) peut avoir un tarif par
 *    pays + un tarif global "*" comme fallback.
 *  - getSignaturePricing(level, countryCode) renvoie d'abord le tarif pays-
 *    spécifique s'il existe et est actif, sinon le tarif global, sinon null.
 *  - Marge = priceCents - costCents (en valeur absolue) ; pct = marge / price.
 *
 * Sécurité : les mutations (upsert/delete) sont gated SuperAdmin côté routes.
 */

import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const prisma = prismaClient as any;

export type SignatureLevel = "SIMPLE" | "ADVANCED" | "NOTARIZED";

export interface SignaturePricing {
  id: string;
  level: SignatureLevel;
  countryCode: string;
  enabled: boolean;
  costCents: number;
  priceCents: number;
  currency: string;
  yousignLevel: string;
  notes: string | null;
  /// Champs dérivés (calculés à la volée)
  marginCents: number;
  marginPct: number;
  updatedAt: string;
}

/**
 * Récupère le tarif applicable pour un niveau × pays donné.
 * Fallback : si pas de tarif pour le pays, on cherche "*". Si désactivé,
 * renvoie null (le niveau est "fermé" pour ce pays).
 */
export async function getSignaturePricing(
  level: SignatureLevel,
  countryCode: string,
): Promise<SignaturePricing | null> {
  // 1. Cherche tarif spécifique au pays
  const specific = await prisma.signatureLevelPricing.findUnique({
    where: { level_countryCode: { level, countryCode } },
  });
  if (specific && specific.enabled) {
    return toPublicPricing(specific);
  }
  if (specific && !specific.enabled) {
    // Désactivé explicitement pour ce pays → on ne fallback PAS sur le global
    return null;
  }

  // 2. Fallback global "*"
  const fallback = await prisma.signatureLevelPricing.findUnique({
    where: { level_countryCode: { level, countryCode: "*" } },
  });
  if (fallback && fallback.enabled) {
    return toPublicPricing(fallback);
  }
  return null;
}

/**
 * Renvoie tous les tarifs disponibles pour un pays donné (3 niveaux maximum).
 * Utilisé par la page plans publique pour afficher l'offre signature.
 */
export async function getSignaturePricingForCountry(
  countryCode: string,
): Promise<Array<SignaturePricing>> {
  const levels: SignatureLevel[] = ["SIMPLE", "ADVANCED", "NOTARIZED"];
  const out: SignaturePricing[] = [];
  for (const level of levels) {
    const p = await getSignaturePricing(level, countryCode);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Liste exhaustive admin — toutes lignes (par niveau, par pays, actives ou non).
 */
export async function listAllSignaturePricings(): Promise<SignaturePricing[]> {
  const rows = await prisma.signatureLevelPricing.findMany({
    orderBy: [{ level: "asc" }, { countryCode: "asc" }],
  });
  return rows.map(toPublicPricing);
}

export interface UpsertPricingInput {
  level: SignatureLevel;
  countryCode: string;
  enabled?: boolean;
  costCents: number;
  priceCents: number;
  currency?: string;
  yousignLevel?: string;
  notes?: string | null;
}

/** Crée ou met à jour une ligne tarification. */
export async function upsertSignaturePricing(
  input: UpsertPricingInput,
): Promise<SignaturePricing> {
  // Validations basiques
  if (!["SIMPLE", "ADVANCED", "NOTARIZED"].includes(input.level)) {
    throw Errors.badRequest("Niveau invalide");
  }
  const cc = input.countryCode.trim();
  if (!cc) throw Errors.badRequest("countryCode obligatoire (ou '*')");
  if (cc !== "*" && cc.length !== 2) {
    throw Errors.badRequest("countryCode doit faire 2 lettres (ISO) ou '*'");
  }
  if (!Number.isInteger(input.costCents) || input.costCents < 0) {
    throw Errors.badRequest("costCents doit être un entier >= 0");
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw Errors.badRequest("priceCents doit être un entier >= 0");
  }
  if (input.priceCents < input.costCents) {
    throw Errors.badRequest(
      "priceCents doit être >= costCents (sinon marge négative)",
    );
  }
  const row = await prisma.signatureLevelPricing.upsert({
    where: { level_countryCode: { level: input.level, countryCode: cc } },
    create: {
      level: input.level,
      countryCode: cc,
      enabled: input.enabled ?? true,
      costCents: input.costCents,
      priceCents: input.priceCents,
      currency: input.currency ?? "EUR",
      yousignLevel: input.yousignLevel ?? defaultYousignLevel(input.level),
      notes: input.notes ?? null,
    },
    update: {
      enabled: input.enabled ?? true,
      costCents: input.costCents,
      priceCents: input.priceCents,
      currency: input.currency ?? "EUR",
      yousignLevel: input.yousignLevel ?? defaultYousignLevel(input.level),
      notes: input.notes ?? null,
    },
  });
  return toPublicPricing(row);
}

export async function deleteSignaturePricing(id: string): Promise<void> {
  await prisma.signatureLevelPricing.delete({ where: { id } });
}

/** Toggle rapide enabled/disabled sans toucher au reste. */
export async function setSignaturePricingEnabled(
  id: string,
  enabled: boolean,
): Promise<SignaturePricing> {
  const row = await prisma.signatureLevelPricing.update({
    where: { id },
    data: { enabled },
  });
  return toPublicPricing(row);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPublicPricing(row: any): SignaturePricing {
  const cost = Number(row.costCents);
  const price = Number(row.priceCents);
  const margin = price - cost;
  const marginPct = price > 0 ? margin / price : 0;
  return {
    id: row.id,
    level: row.level as SignatureLevel,
    countryCode: row.countryCode,
    enabled: row.enabled,
    costCents: cost,
    priceCents: price,
    currency: row.currency,
    yousignLevel: row.yousignLevel,
    notes: row.notes,
    marginCents: margin,
    marginPct,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function defaultYousignLevel(level: SignatureLevel): string {
  switch (level) {
    case "SIMPLE":
      return "electronic_signature";
    case "ADVANCED":
      return "advanced_electronic_signature";
    case "NOTARIZED":
      return "qualified_electronic_signature";
  }
}
