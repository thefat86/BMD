/**
 * V163 — Service Custom Logo PDF (logo personnalisé sur les PDF générés).
 *
 * Fonctions :
 *   - getActivePricing(currency) : récupère le prix mensuel actif depuis
 *     CustomLogoPricing (fallback EUR si la devise demandée n'existe pas).
 *   - isCustomLogoActive(group) : true si le groupe a un logo perso valide
 *     (URL non null ET activeUntil > now()).
 *   - uploadCustomLogo({ groupId, actorUserId, imageDataUrl }) : enregistre
 *     une image base64 en URL data: sur le groupe. Limite 500 Ko.
 *   - removeCustomLogo({ groupId, actorUserId }) : retire l'image (l'abonnement
 *     reste actif jusqu'à la fin du cycle Stripe — l'utilisateur peut ré-uploader).
 *   - activateForGroup({ groupId, until, stripeSubId }) : invoqué par le
 *     webhook Stripe pour étendre la validité.
 *
 * Permission : admin du groupe (ou créateur).
 */

import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const prisma = prismaClient as any;

const MAX_LOGO_DATA_URL_BYTES = 500 * 1024; // 500 Ko
const ALLOWED_MIME_PREFIXES = [
  "data:image/png;base64,",
  "data:image/jpeg;base64,",
  "data:image/webp;base64,",
  "data:image/svg+xml;base64,",
];

export interface CustomLogoPricingDTO {
  currency: string;
  monthlyPriceCents: number;
  monthlyPriceFormatted: string;
  enabled: boolean;
}

/**
 * Récupère le prix mensuel actif pour la devise demandée. Si la devise
 * n'a pas de tarif spécifique, fallback sur EUR. Si EUR n'existe pas
 * (ne devrait jamais arriver post-seed), 999 c€ par défaut.
 */
export async function getActivePricing(
  currency: string = "EUR",
): Promise<CustomLogoPricingDTO> {
  const upper = currency.toUpperCase();
  let row = await prisma.customLogoPricing.findUnique({
    where: { currency: upper },
  });
  if (!row || !row.enabled) {
    row = await prisma.customLogoPricing.findUnique({
      where: { currency: "EUR" },
    });
  }
  const cents = row?.monthlyPriceCents ?? 999;
  const cur = row?.currency ?? "EUR";
  return {
    currency: cur,
    monthlyPriceCents: cents,
    monthlyPriceFormatted: formatMoney(cents, cur),
    enabled: row?.enabled ?? true,
  };
}

/**
 * Liste tous les tarifs (pour la console admin).
 */
export async function listAllPricings() {
  return prisma.customLogoPricing.findMany({
    orderBy: { currency: "asc" },
  });
}

/**
 * Met à jour un tarif (création si la devise n'existait pas).
 * Réservé admin.
 */
export async function upsertPricing(input: {
  currency: string;
  monthlyPriceCents: number;
  enabled?: boolean;
  notes?: string | null;
}) {
  const cur = input.currency.toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(cur)) {
    throw Errors.badRequest("Code devise invalide (ISO 4217 requis, ex: EUR)");
  }
  if (
    typeof input.monthlyPriceCents !== "number" ||
    input.monthlyPriceCents < 0 ||
    input.monthlyPriceCents > 100_000
  ) {
    throw Errors.badRequest(
      "Prix mensuel invalide (en centimes, entre 0 et 100 000)",
    );
  }
  return prisma.customLogoPricing.upsert({
    where: { currency: cur },
    create: {
      currency: cur,
      monthlyPriceCents: input.monthlyPriceCents,
      enabled: input.enabled ?? true,
      notes: input.notes ?? null,
    },
    update: {
      monthlyPriceCents: input.monthlyPriceCents,
      enabled: input.enabled ?? undefined,
      notes: input.notes ?? undefined,
    },
  });
}

/**
 * True si le groupe a un logo perso valide.
 */
export function isCustomLogoActive(group: {
  customLogoUrl?: string | null;
  customLogoActiveUntil?: Date | null;
}): boolean {
  if (!group.customLogoUrl) return false;
  if (!group.customLogoActiveUntil) return false;
  return new Date(group.customLogoActiveUntil).getTime() > Date.now();
}

/**
 * Upload d'une image base64 comme logo perso. Active pas l'abonnement —
 * il faut avoir activeUntil > now() pour que le logo apparaisse réellement
 * sur les PDF. Permet à un admin de préparer son logo avant d'activer.
 */
export async function uploadCustomLogo(input: {
  groupId: string;
  actorUserId: string;
  imageDataUrl: string;
}): Promise<{ ok: true; bytes: number }> {
  await assertGroupAdmin(input.groupId, input.actorUserId);

  if (!input.imageDataUrl || typeof input.imageDataUrl !== "string") {
    throw Errors.badRequest("imageDataUrl manquant");
  }
  if (input.imageDataUrl.length > MAX_LOGO_DATA_URL_BYTES * 1.4) {
    // overhead base64 ~33%
    throw Errors.badRequest(
      `Logo trop lourd. Limite 500 Ko (PNG/JPEG/WEBP/SVG).`,
    );
  }
  const isAllowed = ALLOWED_MIME_PREFIXES.some((p) =>
    input.imageDataUrl.startsWith(p),
  );
  if (!isAllowed) {
    throw Errors.badRequest(
      "Format non supporté. Utilise PNG, JPEG, WebP ou SVG (data URL base64).",
    );
  }

  await prisma.group.update({
    where: { id: input.groupId },
    data: { customLogoUrl: input.imageDataUrl },
  });

  return { ok: true, bytes: input.imageDataUrl.length };
}

/**
 * Retire le logo perso (mais ne touche pas à l'abonnement Stripe — celui-ci
 * reste actif jusqu'à la fin du cycle, l'utilisateur peut ré-uploader).
 */
export async function removeCustomLogo(input: {
  groupId: string;
  actorUserId: string;
}): Promise<void> {
  await assertGroupAdmin(input.groupId, input.actorUserId);
  await prisma.group.update({
    where: { id: input.groupId },
    data: { customLogoUrl: null },
  });
}

/**
 * Active/étend la validité du logo perso pour un groupe. Invoqué par :
 *   - le webhook Stripe à chaque cycle de facturation (V163.C2)
 *   - le mock-activate admin (pour tester en dev sans Stripe live)
 */
export async function activateForGroup(input: {
  groupId: string;
  until: Date;
  stripeSubId?: string | null;
}): Promise<void> {
  await prisma.group.update({
    where: { id: input.groupId },
    data: {
      customLogoActiveUntil: input.until,
      customLogoStripeSubId: input.stripeSubId ?? undefined,
    },
  });
}

/**
 * Lecture du statut custom logo (pour l'UI).
 */
export async function getStatus(input: {
  groupId: string;
  actorUserId: string;
}) {
  // Tout membre du groupe peut lire le status (read-only).
  const member = await prisma.groupMember.findFirst({
    where: { groupId: input.groupId, userId: input.actorUserId },
    select: { id: true },
  });
  if (!member) throw Errors.forbidden("Tu n'es pas membre de ce groupe");

  const group = await prisma.group.findUnique({
    where: { id: input.groupId },
    select: {
      customLogoUrl: true,
      customLogoActiveUntil: true,
      customLogoStripeSubId: true,
      defaultCurrency: true,
    },
  });
  if (!group) throw Errors.notFound("Groupe introuvable");

  const pricing = await getActivePricing(group.defaultCurrency ?? "EUR");
  const active = isCustomLogoActive(group);

  return {
    hasLogo: !!group.customLogoUrl,
    logoUrl: group.customLogoUrl ?? null,
    active,
    activeUntil: group.customLogoActiveUntil?.toISOString() ?? null,
    stripeSubId: group.customLogoStripeSubId ?? null,
    pricing,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertGroupAdmin(groupId: string, actorUserId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { createdById: true },
  });
  if (!group) throw Errors.notFound("Groupe introuvable");
  if (group.createdById === actorUserId) return;
  const m = await prisma.groupMember.findFirst({
    where: { groupId, userId: actorUserId, role: "ADMIN" },
    select: { id: true },
  });
  if (!m) {
    throw Errors.forbidden(
      "Seul un admin du groupe peut modifier le logo personnalisé.",
    );
  }
}

function formatMoney(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
