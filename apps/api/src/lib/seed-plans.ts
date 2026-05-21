/**
 * Seed des plans tarifaires · V46 (refonte mai 2026)
 *
 * Grille recentrée après V44.3 sur 5 types de groupes simplifiés (Tontine,
 * Coloc, Voyage&Sortie, Vie quotidienne, Autre) — plus de modules verticaux
 * paroisse/mariage spécialisés.
 *
 * Logique d'incitation :
 *   - FREE 0€ : découvrir BMD · 3 scans IA/mois · pubs · pousse au paid
 *     en 2-3 jours d'usage réel.
 *   - PERSO 39€/an : usage perso illimité · 50 scans + 20 voix · pas de pubs.
 *   - FAMILLE 69€/an : couple/foyer 5 pers · 200 scans + voix illimitée.
 *   - PRO 199€/an : asso/freelance/événement · 500 scans soft + IA file
 *     prioritaire Mindee Pro · dashboard admin · export FEC compta.
 *   - LIFETIME 99€ one-shot : Perso à vie (achat unique, capture engagement).
 *   - PACK BOOSTER 4,99€ one-shot : +100 scans IA pour un pic (mariage,
 *     voyage, grosse semaine). Soupape anti-paywall agressif.
 *
 * Pipeline IA adaptatif (cf. ocr-providers.ts V46) :
 *   - Free/Perso → Tesseract + OpenAI Vision fallback (~0,003€/scan)
 *   - Famille → Vision + Mindee fallback si confidence<75% (~0,01€)
 *   - Pro → Mindee Pro premium (Invoice+Receipts parallèle) + file prio
 *     (~0,07€/scan)
 *
 * Marges nettes estimées (1000 acquisitions Free, funnel typique) :
 *   80% Free → −5€ × 800 = −4 000€ (acquisition acceptable)
 *   15% Perso → +31€ × 150 = +4 650€
 *    4% Famille → +31€ × 40  = +1 240€
 *    1% Pro → +129€ × 10  = +1 290€
 *   Total : +3 180€/an pour 1000 acquisitions.
 *
 * Les anciens codes COMMUNITY / PARISH / EVENT sont conservés en seed (legacy)
 * mais marqués deprecated · isHidden=true pour ne plus s'afficher en frontend.
 * Les users existants restent migrés vers le plan équivalent (mapping :
 * COMMUNITY→FAMILY, PARISH→PRO, EVENT→PERSONAL + Pack Booster).
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

export const PLANS: PlanSeed[] = [
  {
    code: "FREE",
    name: "Découverte",
    priceCents: 0,
    limits: {
      // === Groupes & membres ===
      maxGroups: 2,
      maxMembersPerGroup: 8,
      // === IA (nouveau V46) ===
      // ocrPerMonth = scansPerMonth (alias gardé pour rétro-compat assertCanUseOcr)
      ocrPerMonth: 3, // V46 : était 5, descendu à 3 pour pousser à PERSO en 2-3j
      scansPerMonth: 3,
      voicePerMonth: 0, // Pas de voix premium en Free
      iaPipelineTier: "economy", // Tesseract + Vision fallback
      // === Features existantes ===
      whatsappBot: false,
      multiCurrency: false,
      debtSwap: false,
      exportPdfExcel: false,
      adsEnabled: true,
      twoFactor: false,
      customRoles: false,
      // V77 — Photo de profil visible aux autres membres :
      // FREE → false (les autres voient juste les initiales colorées).
      // L'user voit toujours sa propre photo (filtre côté backend uniquement
      // sur les responses qui exposent les members d'un groupe).
      profilePhotoVisible: false,
      // === Réunions audio (legacy AC-2) ===
      meetingsPerMonth: 0,
      meetingAddonCents: 0,
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
      // === V152 — Signatures électroniques RDD ===
      // FREE : aucune RDD signable, pousse à PERSO pour découvrir le module
      debtAgreementsPerMonth: 1, // 1 RDD DRAFT autorisée pour tester
      signaturesSimpleIncluded: 0,
      signaturesAdvancedIncluded: 0,
      // === V202 — Caisses Projet (mode REGISTRE strict) ===
      // FREE : 1 caisse max, force l'upgrade dès qu'une 2e est créée
      // (typique : 1 funérailles + 1 mariage de l'année → upgrade Perso).
      projectFundsMax: 1,
    },
    description: "Pour démarrer · 2 groupes, 8 membres, 3 scans IA / mois",
    displayOrder: 1,
  },
  {
    code: "PERSONAL",
    name: "Perso",
    priceCents: 399, // 3,99 €/mois (mensuel)
    priceCentsYearly: 3900, // 39 €/an (≈ 3,25 €/mois · −17%)
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      // === IA ===
      ocrPerMonth: 50,
      scansPerMonth: 50,
      voicePerMonth: 20,
      iaPipelineTier: "economy", // Tesseract + Vision (économie)
      // === Features ===
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      twoFactor: true,
      customRoles: false,
      // V77 — Photo de profil visible aux membres de tes groupes
      profilePhotoVisible: true,
      // === Réunions audio ===
      meetingsPerMonth: 1,
      meetingAddonCents: 299,
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
      // === V152 — Signatures RDD ===
      // PERSO : 2 SIMPLE incluses/mois, ADVANCED & NOTARIZED à l'unité
      debtAgreementsPerMonth: -1, // illimité (signatures gated séparément)
      signaturesSimpleIncluded: 2,
      signaturesAdvancedIncluded: 0,
      // === V202 — Caisses Projet ===
      // PERSO : 3 caisses actives — couvre la majorité des usages perso (mariage,
      // décès, cadeau commun) tout en gardant une marge pour upsell Famille.
      projectFundsMax: 3,
    },
    description:
      "Usage perso illimité · 50 scans IA + 20 voix / mois · sans pub · 27 devises",
    displayOrder: 2,
  },
  {
    code: "FAMILY",
    name: "Famille",
    priceCents: 599, // 5,99 €/mois
    priceCentsYearly: 6900, // 69 €/an (≈ 5,75 €/mois · −17%)
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      // === Comptes liés ===
      linkedAccounts: 5, // Jusqu'à 5 personnes synchronisées (couple, ados, parents)
      // === IA ===
      ocrPerMonth: 200,
      scansPerMonth: 200,
      voicePerMonth: -1, // illimité
      iaPipelineTier: "standard", // Vision + Mindee fallback
      // === Features ===
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      twoFactor: true,
      customRoles: false,
      // V77 — Photo visible aux membres + tous les linkedAccounts
      profilePhotoVisible: true,
      // === Réunions audio ===
      meetingsPerMonth: 4,
      meetingAddonCents: 199,
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
      // === V152 — Signatures RDD ===
      // FAMILY : 5 SIMPLE + 1 ADVANCED inclus/mois, NOTARIZED à l'unité
      debtAgreementsPerMonth: -1,
      signaturesSimpleIncluded: 5,
      signaturesAdvancedIncluded: 1,
      // === V202 — Caisses Projet ===
      // FAMILY : 10 caisses — couvre familles élargies diaspora (décès, mariages,
      // tontines événementielles multi-pays par exemple Lobi).
      projectFundsMax: 10,
    },
    description:
      "Couple · foyer · jusqu'à 5 personnes · 200 scans + voix illimitée",
    displayOrder: 3,
  },
  {
    code: "PRO",
    name: "Pro",
    priceCents: 1699, // 16,99 €/mois
    priceCentsYearly: 19900, // 199 €/an (≈ 16,60 €/mois · −17%)
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      linkedAccounts: 10,
      // === IA — soft cap 500/mois mais Mindee Pro qualité premium ===
      ocrPerMonth: 500, // soft cap protection coût · au-delà = Pack Booster
      scansPerMonth: 500,
      voicePerMonth: -1,
      iaPipelineTier: "premium", // Mindee Invoice+Receipts + file prio
      iaPriorityQueue: true, // traitement IA prioritaire (file dédiée)
      // === Features pro ===
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      exportFEC: true, // V46 · format légal France compta
      adsEnabled: false,
      adminDashboard: true,
      auditLogSigned: true, // V46 · audit log signé irréfutable
      taxReceipts: false,
      prioritySupport: true,
      supportSlaHours: 24,
      twoFactor: true,
      customRoles: true,
      // V77 — Photo visible aux membres (essentiel asso/événement)
      profilePhotoVisible: true,
      // === Réunions audio illimitées ===
      meetingsPerMonth: -1,
      meetingAddonCents: 0,
      meetingMaxDurationSeconds: 5400, // 1h30 pour réunions asso
      meetingWarnAtSeconds: 4800,
      audioProofMaxSeconds: 300,
      // === V152 — Signatures RDD ===
      // PRO : SIMPLE illimité + 3 ADVANCED inclus/mois, NOTARIZED à l'unité
      debtAgreementsPerMonth: -1,
      signaturesSimpleIncluded: -1,
      signaturesAdvancedIncluded: 3,
      // === V202 — Caisses Projet ===
      // PRO : illimité — assos, paroisses, événements multi-caisses.
      projectFundsMax: -1,
    },
    description:
      "Asso · freelance · événement · 500 scans IA + file prioritaire + dashboard admin + export FEC compta",
    displayOrder: 4,
  },
  {
    // V46 · Lifetime achat unique · capture les early adopters engagés
    // sans cannibaliser le MRR (positionné à 99€ = ~2,5 ans de Perso annuel)
    code: "LIFETIME_PERSONAL",
    name: "Perso à vie",
    priceCents: 9900, // 99 € one-shot
    priceCentsYearly: null as any,
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      ocrPerMonth: 50,
      scansPerMonth: 50,
      voicePerMonth: 20,
      iaPipelineTier: "economy",
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      twoFactor: true,
      customRoles: false,
      profilePhotoVisible: true, // V77 — comme PERSONAL
      oneShot: true, // marqueur : achat unique, pas de renouvellement
      lifetime: true, // accès à vie
      // === V152 — Signatures RDD ===
      // LIFETIME PERSO : équivalent PERSO (2 SIMPLE/mois inclus)
      debtAgreementsPerMonth: -1,
      signaturesSimpleIncluded: 2,
      signaturesAdvancedIncluded: 0,
      // V202 — Caisses Projet équivalent PERSO (3 max)
      projectFundsMax: 3,
      meetingsPerMonth: 1,
      meetingAddonCents: 299,
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
    },
    description:
      "Toutes les features Perso · à vie · paiement unique 99 €",
    displayOrder: 5,
  },
  // === ANCIENS PLANS · LEGACY · cachés en frontend (migration users en cours) ===
  // Garder pour ne pas casser les abonnements actifs.
  {
    code: "PREMIUM",
    name: "Premium (legacy → PERSONAL)",
    priceCents: 299,
    priceCentsYearly: 2900,
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      ocrPerMonth: 50,
      scansPerMonth: 50,
      voicePerMonth: 20,
      iaPipelineTier: "economy",
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      twoFactor: true,
      customRoles: false,
      profilePhotoVisible: true, // V77 — legacy payant
      meetingsPerMonth: 1,
      meetingAddonCents: 299,
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
      _legacyAlias: "PERSONAL",
      _hidden: true,
      projectFundsMax: 3, // V202 — aligné sur PERSONAL
    },
    description: "Legacy (V41) · renommé PERSO en V46",
    displayOrder: 99,
  },
  {
    code: "COMMUNITY",
    name: "Communauté (legacy → FAMILY)",
    priceCents: 1000,
    priceCentsYearly: 10000,
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      ocrPerMonth: 200,
      scansPerMonth: 200,
      voicePerMonth: -1,
      iaPipelineTier: "standard",
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      adminDashboard: true,
      prioritySupport: true,
      twoFactor: true,
      customRoles: true,
      profilePhotoVisible: true, // V77 — legacy payant
      meetingsPerMonth: 4,
      meetingAddonCents: 199,
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
      _legacyAlias: "FAMILY",
      _hidden: true,
      projectFundsMax: 10, // V202 — aligné sur FAMILY
    },
    description: "Legacy (V41) · renommé FAMILLE en V46",
    displayOrder: 100,
  },
  {
    code: "PARISH",
    name: "Paroisse (legacy → PRO)",
    priceCents: 1500,
    priceCentsYearly: 15000,
    limits: {
      maxGroups: -1,
      maxMembersPerGroup: -1,
      ocrPerMonth: 500,
      scansPerMonth: 500,
      voicePerMonth: -1,
      iaPipelineTier: "premium",
      iaPriorityQueue: true,
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      exportFEC: true,
      adsEnabled: false,
      adminDashboard: true,
      auditLogSigned: true,
      taxReceipts: true, // legacy paroisse · gardé pour les users existants
      prioritySupport: true,
      twoFactor: true,
      customRoles: true,
      profilePhotoVisible: true, // V77 — legacy payant
      meetingsPerMonth: -1,
      meetingAddonCents: 0,
      meetingMaxDurationSeconds: 5400,
      meetingWarnAtSeconds: 4800,
      audioProofMaxSeconds: 300,
      _legacyAlias: "PRO",
      _hidden: true,
      projectFundsMax: -1, // V202 — aligné sur PRO (illimité)
    },
    description: "Legacy (V41) · renommé PRO en V46",
    displayOrder: 101,
  },
  {
    code: "EVENT",
    name: "Événement (legacy → PERSONAL + Booster)",
    priceCents: 2900,
    priceCentsYearly: null as any,
    limits: {
      maxGroups: 1,
      maxMembersPerGroup: -1,
      ocrPerMonth: 100,
      scansPerMonth: 100,
      voicePerMonth: -1,
      iaPipelineTier: "standard",
      whatsappBot: true,
      multiCurrency: true,
      debtSwap: true,
      exportPdfExcel: true,
      adsEnabled: false,
      twoFactor: true,
      customRoles: false,
      profilePhotoVisible: true, // V77 — legacy payant
      oneShot: true,
      durationDays: 30,
      meetingsPerMonth: 2,
      meetingAddonCents: 299,
      meetingMaxDurationSeconds: 3600,
      meetingWarnAtSeconds: 3000,
      audioProofMaxSeconds: 300,
      _legacyAlias: "PERSONAL",
      _hidden: true,
      projectFundsMax: 1, // V202 — EVENT one-shot 30 jours, 1 caisse suffit
    },
    description: "Legacy (V41) · remplacé par PERSO + Pack Booster en V46",
    displayOrder: 102,
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
          // on met à jour seulement le name/description (et limits si nouveau plan)
          name: p.name,
          description: p.description,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[seed-plans] skip",
        p.code,
        (err as Error).message,
      );
    }
  }
}

/**
 * V46 · Pack IA Booster (achat unique).
 * Pas un Plan complet — c'est un add-on enregistré dans une table dédiée
 * (PlanBoosterPurchase, à créer) qui ajoute +100 scans au quota mensuel.
 * Validité : 30 jours après achat.
 */
export const BOOSTER_PACK = {
  code: "IA_BOOSTER_100",
  name: "Pack IA Booster",
  priceCents: 499, // 4,99 €
  scansAdded: 100,
  durationDays: 30,
  description:
    "+100 scans IA pour 30 jours · idéal pour un mariage, un voyage, une grosse semaine",
} as const;
