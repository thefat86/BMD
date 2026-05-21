/**
 * Seed des plans tarifaires (spec §6.3).
 *
 * Appelé au démarrage du serveur — idempotent (upsert sur code).
 * Les valeurs par défaut viennent des spécifications ; la console admin
 * peut ensuite les modifier en live.
 */
import { prisma } from "./db.js";

interface PlanSeed {
  code: string;
  name: string;
  priceCents: number;
  priceCentsYearly?: number;
  limits: Record<string, number | boolean | string>;
  description: string;
  displayOrder: number;
}

const PLANS: PlanSeed[] = [
  {
    code: "FREE",
    name: "Découverte",
    priceCents: 0,
    limits: {
      maxGroups: 2,
      maxMembersPerGroup: 8,
      ocrPerMonth: 5,
      whatsappBot: false,
      multiCurrency: false,
      debtSwap: false,
      exportPdfExcel: false,
      adsEnabled: true,
      twoFactor: false, // 2FA réservée Premium/Communauté (spec §7.5)
      customRoles: false,
      // Sprint AC-2 · Réunions auto-PV (paywall direct sur FREE)
      meetingsPerMonth: 0,
      meetingAddonCents: 0, // pas d'addon — il faut un vrai forfait
      // Sprint AC-3 · Limites de durée (lecture serveur + UI)
      meetingMaxDurationSeconds: 3600, // 1h hard cap (tous plans)
      meetingWarnAtSeconds: 3000, // 50min : pop l'avertissement "il reste 10 min"
      audioProofMaxSeconds: 300, // 5min hard cap (preuve marché)
    },
    description: "Pour démarrer · 2 groupes, 8 membres/groupe, OCR limité",
    displayOrder: 1,
  },
  {
    code: "PREMIUM",
    name: "Premium",
    priceCents: 299, // 2,99 €
    priceCentsYearly: 2900, // 29 € (~ 2 mois offerts)
    limits: {
      maxGroups: -1, // -1 = illimité
      maxMembersPerGroup: -1,
      ocrPerMonth: -1,
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      twoFactor: true, // spec §7.5
      customRoles: false,
      // Sprint AC-2 · 1 réunion / mois incluse, addon 2,99 € au-delà
      meetingsPerMonth: 1,
      meetingAddonCents: 299,
      // Sprint AC-3 · Durées (overridables en console admin)
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
    },
    description: "Tout illimité, sans pub, swap de dettes, 25 devises",
    displayOrder: 2,
  },
  {
    code: "COMMUNITY",
    name: "Communauté",
    priceCents: 1000, // 10 €
    priceCentsYearly: 10000,
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      ocrPerMonth: -1,
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      adminDashboard: true,
      taxReceipts: false, // les reçus fiscaux sont sur PARISH (15€)
      prioritySupport: true,
      twoFactor: true,
      customRoles: true, // spec §6.10
      // Sprint AC-2 · 4 réunions / mois incluses, addon 1,99 € au-delà
      meetingsPerMonth: 4,
      meetingAddonCents: 199,
      // Sprint AC-3 · Durées
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
    },
    description:
      "Pour clubs et associations · dashboard admin + rôles custom",
    displayOrder: 3,
  },
  {
    // Spec §11.2 — paroisse 15€/mois avec reçus fiscaux Article 200 CGI
    code: "PARISH",
    name: "Paroisse",
    priceCents: 1500, // 15 €
    priceCentsYearly: 15000,
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      ocrPerMonth: -1,
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      adminDashboard: true,
      taxReceipts: true, // ✓ activé par défaut
      prioritySupport: true,
      twoFactor: true,
      customRoles: true,
      // Sprint AC-2 · Illimité (réunions hebdo de paroisse OK)
      meetingsPerMonth: -1,
      meetingAddonCents: 0,
      // Sprint AC-3 · Durées (PARISH peut avoir des assemblées plus longues)
      meetingMaxDurationSeconds: 5400, // 1h30 (paroisse)
      meetingWarnAtSeconds: 4800, // 1h20 (10 min avant le hard stop)
      audioProofMaxSeconds: 300,
    },
    description:
      "Pour paroisses & associations cultuelles · reçus fiscaux automatiques (Article 200 CGI)",
    displayOrder: 4,
  },
  {
    // Spec §11.3 — forfait événement 29€ one-shot, expire 30j post-event
    code: "EVENT",
    name: "Événement",
    priceCents: 2900, // 29 € one-shot (pas mensuel)
    priceCentsYearly: null as any, // pas d'annualisé pour un one-shot
    limits: {
      maxGroups: 1, // un seul groupe événement
      maxMembersPerGroup: -1,
      ocrPerMonth: -1,
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      adminDashboard: false,
      taxReceipts: false,
      prioritySupport: false,
      twoFactor: true,
      customRoles: false,
      oneShot: true, // marqueur : pas de récurrence Stripe, expire 30j
      durationDays: 30,
      // Sprint AC-2 · 2 réunions incluses sur les 30 jours du forfait événement
      meetingsPerMonth: 2,
      meetingAddonCents: 299,
      // Sprint AC-3 · Durées
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
    },
    description:
      "Pour gérer un mariage, un voyage ou un événement · paiement unique, valable 30 jours",
    displayOrder: 5,
  },
];

export async function seedPlans(): Promise<void> {
  for (const p of PLANS) {
    try {
      await prisma.plan.upsert({
        where: { code: p.code },
        create: p as any,
        update: {
          // Au démarrage on ne réécrase PAS les limites custom de l'admin :
          // on met à jour seulement le name/description si vides
          name: p.name,
          description: p.description,
        },
      });
    } catch (err) {
      // Si la table n'existe pas encore (avant migration), on log et continue
      console.warn("[seed-plans] skip", p.code, (err as Error).message);
    }
  }
}
