/**
 * Détection d'anomalies sur une dépense (spec §3.8).
 *
 * Pas d'IA externe : algorithmes statistiques sur l'historique du groupe.
 * Détecte :
 *  - **outlier_amount** : montant anormalement élevé vs la médiane historique
 *                        (> 3× médiane et > 50€ minimum pour éviter les faux positifs)
 *  - **likely_duplicate** : même description + même payeur + montant proche
 *                          dans les dernières 48h
 *  - **unusual_payer** : payeur très inhabituel (< 5% des dépenses du groupe)
 *  - **wrong_currency** : devise différente de toutes les dépenses récentes du groupe
 *
 * Utilisé en post-création d'une dépense pour afficher un warning UI :
 *   « Cette dépense semble inhabituelle, peux-tu confirmer ? ».
 *
 * Aucune dépense n'est bloquée — l'utilisateur garde la main.
 */
import { prisma } from "../../lib/db.js";
import { Prisma } from "@prisma/client";

export type AnomalyKind =
  | "outlier_amount"
  | "likely_duplicate"
  | "unusual_payer"
  | "wrong_currency";

export interface Anomaly {
  kind: AnomalyKind;
  severity: "info" | "warning";
  message: string;
  /** Données contextuelles pour l'UI (montant attendu, dépense doublon, etc.). */
  details?: Record<string, unknown>;
}

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const MIN_AMOUNT_FOR_OUTLIER = 50; // ne pas crier au scandale pour 12€

/**
 * Analyse une dépense et retourne la liste des anomalies détectées.
 * Tableau vide = tout va bien.
 *
 * Coût : O(N) sur les dernières 100 dépenses du groupe (rapide < 50ms).
 */
export async function detectAnomalies(input: {
  expenseId: string;
}): Promise<Anomaly[]> {
  const expense = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    select: {
      id: true,
      groupId: true,
      paidById: true,
      amount: true,
      currency: true,
      description: true,
      occurredAt: true,
      createdAt: true,
    },
  });
  if (!expense) return [];

  const recent = await prisma.expense.findMany({
    where: {
      groupId: expense.groupId,
      id: { not: expense.id },
    },
    orderBy: { occurredAt: "desc" },
    take: 100,
    select: {
      id: true,
      paidById: true,
      amount: true,
      currency: true,
      description: true,
      occurredAt: true,
      createdAt: true,
    },
  });

  if (recent.length === 0) return [];

  const anomalies: Anomaly[] = [];
  const newAmount = parseFloat(expense.amount.toString());

  // === outlier_amount : montant > 3× médiane et > 50€ ===
  const sameCurrencyAmounts = recent
    .filter((r) => r.currency === expense.currency)
    .map((r) => parseFloat(r.amount.toString()))
    .sort((a, b) => a - b);
  if (sameCurrencyAmounts.length >= 5 && newAmount >= MIN_AMOUNT_FOR_OUTLIER) {
    const median =
      sameCurrencyAmounts.length % 2 === 0
        ? (sameCurrencyAmounts[sameCurrencyAmounts.length / 2 - 1]! +
            sameCurrencyAmounts[sameCurrencyAmounts.length / 2]!) /
          2
        : sameCurrencyAmounts[Math.floor(sameCurrencyAmounts.length / 2)]!;
    if (median > 0 && newAmount > median * 3) {
      anomalies.push({
        kind: "outlier_amount",
        severity: "warning",
        message: `Ce montant (${newAmount.toFixed(2)} ${expense.currency}) est ${Math.round(newAmount / median)}× plus élevé que la médiane habituelle du groupe (${median.toFixed(2)} ${expense.currency}).`,
        details: { median, multiplier: newAmount / median },
      });
    }
  }

  // === likely_duplicate : même description + même payeur + montant ±10% en 48h ===
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  const targetDesc = normalize(expense.description);
  const fortyEightHoursAgo = new Date(Date.now() - FORTY_EIGHT_HOURS_MS);
  const candidates = recent.filter((r) => {
    if (r.paidById !== expense.paidById) return false;
    if (r.createdAt < fortyEightHoursAgo) return false;
    if (normalize(r.description) !== targetDesc) return false;
    const a = parseFloat(r.amount.toString());
    return Math.abs(a - newAmount) / Math.max(a, 1) < 0.1; // ±10%
  });
  if (candidates.length > 0) {
    const dup = candidates[0]!;
    anomalies.push({
      kind: "likely_duplicate",
      severity: "warning",
      message: `Une dépense identique (« ${expense.description} », ${parseFloat(dup.amount.toString()).toFixed(2)} ${dup.currency}) a déjà été enregistrée par le même payeur ${formatRelative(dup.createdAt)}.`,
      details: { duplicateId: dup.id, when: dup.createdAt.toISOString() },
    });
  }

  // === unusual_payer : payeur < 5% des dépenses du groupe ===
  const payerCounts = new Map<string, number>();
  for (const r of recent) {
    payerCounts.set(r.paidById, (payerCounts.get(r.paidById) ?? 0) + 1);
  }
  const myCount = payerCounts.get(expense.paidById) ?? 0;
  const myRatio = recent.length > 0 ? myCount / recent.length : 0;
  if (myRatio < 0.05 && recent.length >= 20) {
    // Pas une anomalie critique — juste un info
    const payer = await prisma.user.findUnique({
      where: { id: expense.paidById },
      select: { displayName: true },
    });
    anomalies.push({
      kind: "unusual_payer",
      severity: "info",
      message: `${payer?.displayName ?? "Cette personne"} paie rarement pour le groupe (${myCount} dépenses sur les ${recent.length} récentes). C'est un changement intéressant à noter.`,
      details: { payerCount: myCount, totalRecent: recent.length },
    });
  }

  // === wrong_currency : devise jamais utilisée auparavant ===
  const usedCurrencies = new Set(recent.map((r) => r.currency));
  if (
    !usedCurrencies.has(expense.currency) &&
    usedCurrencies.size > 0 &&
    recent.length >= 5
  ) {
    anomalies.push({
      kind: "wrong_currency",
      severity: "info",
      message: `Cette dépense est en ${expense.currency}, alors que le groupe utilise habituellement ${Array.from(usedCurrencies).join(", ")}. Vérifie que c'est bien voulu.`,
      details: {
        groupCurrencies: Array.from(usedCurrencies),
        thisCurrency: expense.currency,
      },
    });
  }

  return anomalies;
}

function formatRelative(date: Date): string {
  const ms = Date.now() - date.getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "il y a un instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * Décimales aware — utilitaire si besoin de comparer avec précision.
 */
export function decimalEquals(a: Prisma.Decimal | string, b: Prisma.Decimal | string): boolean {
  return new Prisma.Decimal(a.toString()).equals(new Prisma.Decimal(b.toString()));
}
