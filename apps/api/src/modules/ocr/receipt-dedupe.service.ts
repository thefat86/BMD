/**
 * V42 · Service de détection de doublons de factures.
 *
 * Une fois qu'une facture a été scannée et que le frontend a calculé un
 * SHA-256 du fichier optimisé, on peut détecter automatiquement les
 * doublons selon 2 stratégies :
 *
 *  1. **Hash strict** : si une dépense du même groupe a exactement le même
 *     receiptHash → c'est la même photo, c'est forcément un doublon.
 *
 *  2. **Fuzzy match** : si pas de match strict mais qu'il existe une dépense
 *     du même groupe avec le même montant, la même devise, le même marchand
 *     (Levenshtein-ish) et la même date (± 2 jours) → c'est très probablement
 *     un doublon (l'utilisateur a peut-être pris 2 photos différentes du
 *     même reçu).
 *
 * On retourne `null` si pas de doublon trouvé, sinon un objet avec l'ID
 * de la dépense existante + résumé pour l'afficher dans le warning UI.
 *
 * **Le doublon n'est jamais bloquant** — c'est un warning soft que
 * l'utilisateur peut ignorer s'il sait que c'est une dépense distincte
 * (ex: deux cafés au même endroit pour le même montant).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/db.js";

export interface DuplicateCandidate {
  expenseId: string;
  description: string;
  amount: string;
  date: string;
}

export interface DedupeQuery {
  /** Hash SHA-256 du fichier optimisé (peut être null si client legacy). */
  receiptHash?: string | null;
  groupId: string;
  /** Champs de fallback fuzzy : si pas de hash, on cherche par ceux-là. */
  merchant?: string | null;
  amount?: string | null;
  currency?: string;
  date?: string | null;
}

function normalizeMerchant(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(s: string | null | undefined): number {
  if (!s) return NaN;
  const n = parseFloat(String(s).replace(",", "."));
  return isFinite(n) ? n : NaN;
}

/**
 * Distance Levenshtein simple (suffisante pour matcher "Carrefour City"
 * vs "Carrefour City 75011" ou les fautes OCR).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  for (let i = 0; i <= b.length; i++) prev[i] = i;
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const min = Math.min(
        curr + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      prev[j - 1] = curr;
      curr = min;
    }
    prev[b.length] = curr;
  }
  return prev[b.length] ?? Math.max(a.length, b.length);
}

function similarMerchant(a: string, b: string): boolean {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Tolérance proportionnelle à la longueur (Levenshtein ratio)
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;
  const ratio = 1 - dist / maxLen;
  return ratio >= 0.78; // 78% similarité = même marchand probable
}

/**
 * Cherche un doublon dans le groupe donné. Retourne `null` si rien trouvé.
 * Best-effort : si la base est indisponible ou la requête timeout, on
 * retourne null (le scan continue sans warning doublon).
 */
export async function findPotentialDuplicate(
  query: DedupeQuery,
  prismaClient: PrismaClient = defaultPrisma,
): Promise<DuplicateCandidate | null> {
  // ===== Stratégie 1 : Hash strict =====
  if (query.receiptHash && query.receiptHash.length === 64) {
    try {
      // Cast `as any` requis tant que `prisma generate` n'a pas régénéré
      // le client après la migration V42 (ajout du champ receiptHash).
      const hit = await (prismaClient.expense as any).findFirst({
        where: {
          groupId: query.groupId,
          receiptHash: query.receiptHash,
        },
        select: {
          id: true,
          description: true,
          amount: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: "desc" },
      });
      if (hit) {
        return {
          expenseId: hit.id,
          description: hit.description,
          amount: hit.amount.toFixed(2),
          date: hit.occurredAt.toISOString().slice(0, 10),
        };
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[dedupe] hash lookup échoué:", e);
      // continue sur fuzzy
    }
  }

  // ===== Stratégie 2 : Fuzzy match (montant + date ± 2 jours + merchant) =====
  const amount = parseAmount(query.amount);
  if (!isFinite(amount) || amount <= 0) return null;
  if (!query.merchant || !query.merchant.trim()) return null;
  if (!query.date) return null;

  // Range de date ± 2 jours
  const baseDate = new Date(query.date);
  if (isNaN(baseDate.getTime())) return null;
  const dateMin = new Date(baseDate);
  dateMin.setDate(dateMin.getDate() - 2);
  const dateMax = new Date(baseDate);
  dateMax.setDate(dateMax.getDate() + 2);

  try {
    const candidates = await prismaClient.expense.findMany({
      where: {
        groupId: query.groupId,
        currency: query.currency ?? undefined,
        amount: {
          // Tolérance 1 centime sur le montant pour les arrondis OCR
          gte: new Prisma.Decimal(amount - 0.01),
          lte: new Prisma.Decimal(amount + 0.01),
        },
        occurredAt: {
          gte: dateMin,
          lte: dateMax,
        },
      },
      select: {
        id: true,
        description: true,
        amount: true,
        occurredAt: true,
      },
      take: 20,
    });

    for (const c of candidates) {
      if (similarMerchant(c.description, query.merchant)) {
        return {
          expenseId: c.id,
          description: c.description,
          amount: c.amount.toFixed(2),
          date: c.occurredAt.toISOString().slice(0, 10),
        };
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[dedupe] fuzzy lookup échoué:", e);
  }

  return null;
}
