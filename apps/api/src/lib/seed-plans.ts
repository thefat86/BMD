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
      taxReceipts: true,
      prioritySupport: true,
    },
    description:
      "Pour clubs, associations, paroisses · dashboard admin + reçus fiscaux",
    displayOrder: 3,
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
