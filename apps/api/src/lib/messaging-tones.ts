/**
 * Tonalité des rappels (spec §3.8) — sympa | ferme | humour | pro.
 *
 * Chaque utilisateur choisit son ton préféré dans son profil
 * (User.reminderTone). Toutes les notifications composées qui le mentionnent
 * passent par ce module pour adapter le wording.
 *
 * 4 tons disponibles :
 *  - sympa  : amical, émojis chaleureux, ton décontracté (défaut)
 *  - ferme  : direct, factuel, focus sur l'action
 *  - humour : léger, expressions argot diaspora, jamais agressif
 *  - pro    : sobre, formel, comme un email professionnel
 *
 * Pas d'IA externe : pure templates en mémoire. Faciles à étendre/traduire.
 */

import { prisma } from "./db.js";

export type ReminderTone = "sympa" | "ferme" | "humour" | "pro";

const VALID_TONES = new Set<ReminderTone>(["sympa", "ferme", "humour", "pro"]);

/** Cache mémoire des tons utilisateur (TTL 5 min) — évite la requête DB pour chaque notif. */
const toneCache = new Map<string, { tone: ReminderTone; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getUserTone(userId: string): Promise<ReminderTone> {
  const hit = toneCache.get(userId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.tone;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { reminderTone: true },
  });
  const tone =
    user && VALID_TONES.has(user.reminderTone as ReminderTone)
      ? (user.reminderTone as ReminderTone)
      : "sympa";
  toneCache.set(userId, { tone, loadedAt: Date.now() });
  return tone;
}

export function invalidateToneCache(userId?: string): void {
  if (userId) toneCache.delete(userId);
  else toneCache.clear();
}

// ============================================================
// Templates par événement × ton
// ============================================================

export interface TontineReminderArgs {
  groupName: string;
  beneficiaryName: string;
  daysAhead: number; // 7, 3 ou 1
  amount: string; // "100.00"
  currency: string;
}

export function tontineReminderTitle(
  tone: ReminderTone,
  a: TontineReminderArgs,
): string {
  if (a.daysAhead === 1) {
    switch (tone) {
      case "ferme":
        return `Action requise : cotisation due demain pour ${a.beneficiaryName}`;
      case "humour":
        return `🚨 J-1 ! ${a.beneficiaryName} attend ses sous demain 😅`;
      case "pro":
        return `Rappel J-1 : cotisation à effectuer demain (${a.groupName})`;
      case "sympa":
      default:
        return `🔔 C'est demain ! Cotisation pour ${a.beneficiaryName}`;
    }
  }
  if (a.daysAhead === 3) {
    switch (tone) {
      case "ferme":
        return `Cotisation prévue dans 3 jours pour ${a.beneficiaryName}`;
      case "humour":
        return `⏰ J-3 : pense à mettre l'argent de côté pour ${a.beneficiaryName} 💸`;
      case "pro":
        return `Rappel J-3 : cotisation à programmer (${a.groupName})`;
      case "sympa":
      default:
        return `⏰ Dans 3 jours : cotisation pour ${a.beneficiaryName}`;
    }
  }
  // J-7
  switch (tone) {
    case "ferme":
      return `Cotisation prévue dans 7 jours pour ${a.beneficiaryName}`;
    case "humour":
      return `📅 Petit rappel : c'est ${a.beneficiaryName} qui touche dans une semaine 🎁`;
    case "pro":
      return `Rappel J-7 : prochaine cotisation (${a.groupName})`;
    case "sympa":
    default:
      return `📆 Dans 7 jours : cotisation pour ${a.beneficiaryName}`;
  }
}

export function tontineReminderBody(
  tone: ReminderTone,
  a: TontineReminderArgs,
): string {
  const amountStr = `${a.amount} ${a.currency}`;
  switch (tone) {
    case "ferme":
      return `Tontine "${a.groupName}" — montant à verser : ${amountStr}. Mets à jour ton statut dès paiement.`;
    case "humour":
      return `${a.beneficiaryName} compte sur toi pour ${amountStr} 🤲 Tu peux faire ton p'tit truc et marquer "payé" dans BMD ?`;
    case "pro":
      return `Tontine "${a.groupName}". Montant attendu : ${amountStr}. Merci de confirmer le paiement dans l'application.`;
    case "sympa":
    default:
      return `Petit rappel : ${amountStr} pour ${a.beneficiaryName} dans la tontine "${a.groupName}". Marque "payé" quand c'est fait 🤝`;
  }
}

// ============================================================
// Settlement proposed (spec §3.5)
// ============================================================
export interface SettlementProposedArgs {
  fromName: string;
  toName: string;
  amount: string;
  currency: string;
  groupName: string;
}

export function settlementProposedTitle(
  tone: ReminderTone,
  a: SettlementProposedArgs,
): string {
  switch (tone) {
    case "ferme":
      return `Règlement à effectuer : ${a.amount} ${a.currency} → ${a.toName}`;
    case "humour":
      return `💰 Hé ${a.fromName}, ${a.toName} attend ses ${a.amount} ${a.currency} 😉`;
    case "pro":
      return `Proposition de règlement (${a.groupName})`;
    case "sympa":
    default:
      return `💸 Petit règlement à faire : ${a.amount} ${a.currency} pour ${a.toName}`;
  }
}

// ============================================================
// Weekly summary (spec §3.12)
// ============================================================
export interface WeeklySummaryArgs {
  groupName: string;
  expensesAdded: number;
  settlementsConfirmed: number;
}

export function weeklySummaryTitle(
  tone: ReminderTone,
  a: WeeklySummaryArgs,
): string {
  switch (tone) {
    case "ferme":
      return `Résumé hebdomadaire — ${a.groupName}`;
    case "humour":
      return `📊 Bilan de la semaine pour "${a.groupName}" — ça bouge ! 🎉`;
    case "pro":
      return `Récapitulatif hebdomadaire — ${a.groupName}`;
    case "sympa":
    default:
      return `📊 Résumé de la semaine — ${a.groupName}`;
  }
}

export function weeklySummaryBody(
  tone: ReminderTone,
  a: WeeklySummaryArgs,
): string {
  const exp = a.expensesAdded > 0
    ? `${a.expensesAdded} dépense${a.expensesAdded > 1 ? "s" : ""}`
    : null;
  const stl = a.settlementsConfirmed > 0
    ? `${a.settlementsConfirmed} règlement${a.settlementsConfirmed > 1 ? "s" : ""} confirmé${a.settlementsConfirmed > 1 ? "s" : ""}`
    : null;
  const items = [exp, stl].filter(Boolean).join(" · ");
  switch (tone) {
    case "ferme":
      return `Activité de la semaine : ${items}.`;
    case "humour":
      return `Cette semaine dans la team : ${items}. Tout roule ! 🚀`;
    case "pro":
      return `Activité enregistrée cette semaine : ${items}.`;
    case "sympa":
    default:
      return `Cette semaine : ${items} ✨`;
  }
}
