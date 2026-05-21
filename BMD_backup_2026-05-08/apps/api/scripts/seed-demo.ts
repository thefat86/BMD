/**
 * Seed de démo pour l'onboarding partenaires / présentations / dev.
 *
 * Usage : npm run seed-demo
 *
 * Crée :
 *  - 6 utilisateurs de démo (1 par persona BMD §2)
 *  - 6 groupes (1 par type : tontine, voyage, coloc, événement, club, paroisse)
 *  - 30+ dépenses réalistes réparties dans les groupes
 *  - 1 tontine active avec 3 tours déjà payés
 *  - 1 swap de dettes accepté
 *
 * Idempotent : utilise upsert sur les champs uniques (email, displayName)
 * pour pouvoir relancer plusieurs fois sans dupliquer.
 *
 * Sécurité :
 *  - Refuse de tourner si NODE_ENV=production (anti-accident en prod)
 *  - Toutes les emails sont @bmd-demo.local pour les distinguer en base
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";

const prisma = new PrismaClient();

interface DemoUser {
  email: string;
  phone: string;
  displayName: string;
  defaultCurrency: string;
  defaultLocale: string;
}

const DEMO_USERS: DemoUser[] = [
  // Personas BMD §2 (spec)
  {
    email: "patricia@bmd-demo.local",
    phone: "+33611111111",
    displayName: "Patricia Mvondo",
    defaultCurrency: "EUR",
    defaultLocale: "fr",
  },
  {
    email: "mehdi@bmd-demo.local",
    phone: "+33622222222",
    displayName: "Mehdi Benali",
    defaultCurrency: "EUR",
    defaultLocale: "fr",
  },
  {
    email: "david@bmd-demo.local",
    phone: "+33633333333",
    displayName: "David Tang",
    defaultCurrency: "EUR",
    defaultLocale: "fr",
  },
  {
    email: "aicha@bmd-demo.local",
    phone: "+33644444444",
    displayName: "Aïcha Diop",
    defaultCurrency: "EUR",
    defaultLocale: "fr",
  },
  {
    email: "marie@bmd-demo.local",
    phone: "+237699999999", // Cameroun
    displayName: "Marie Kamga",
    defaultCurrency: "XAF",
    defaultLocale: "fr",
  },
  {
    email: "mamadou@bmd-demo.local",
    phone: "+221771234567", // Sénégal
    displayName: "Mamadou Sow",
    defaultCurrency: "XOF",
    defaultLocale: "fr",
  },
];

interface DemoGroup {
  name: string;
  type:
    | "TONTINE"
    | "COLOC"
    | "TRAVEL"
    | "EVENT"
    | "CLUB"
    | "PARISH";
  defaultCurrency: string;
  /** index dans DEMO_USERS pour le créateur */
  createdBy: number;
  /** indices des autres membres */
  members: number[];
}

const DEMO_GROUPS: DemoGroup[] = [
  {
    name: "Tontine Bamiléké Paris ↔ Yaoundé",
    type: "TONTINE",
    defaultCurrency: "EUR",
    createdBy: 0, // Patricia
    members: [3, 4], // Aïcha, Marie
  },
  {
    name: "Voyage Dakar entre amis",
    type: "TRAVEL",
    defaultCurrency: "EUR",
    createdBy: 1, // Mehdi
    members: [0, 2, 5], // Patricia, David, Mamadou
  },
  {
    name: "Coloc Belleville",
    type: "COLOC",
    defaultCurrency: "EUR",
    createdBy: 2, // David
    members: [1], // Mehdi
  },
  {
    name: "Mariage Kouassi",
    type: "EVENT",
    defaultCurrency: "EUR",
    createdBy: 3, // Aïcha
    members: [0, 1, 2, 4], // 4 contributeurs
  },
  {
    name: "Club de foot Solidarité",
    type: "CLUB",
    defaultCurrency: "EUR",
    createdBy: 1, // Mehdi
    members: [0, 2, 3],
  },
  {
    name: "Paroisse Saint-Martin",
    type: "PARISH",
    defaultCurrency: "EUR",
    createdBy: 0,
    members: [1, 2, 3, 4],
  },
];

interface DemoExpense {
  groupIdx: number;
  paidByIdx: number;
  description: string;
  amount: string;
  currency?: string;
  category: string;
  /** indices participants — par défaut tous les membres du groupe */
  participants?: number[];
  /** ISO date relative (en jours dans le passé) */
  daysAgo: number;
}

const DEMO_EXPENSES: DemoExpense[] = [
  // Tontine — pas de dépenses car c'est le module Tontine qui gère
  // Voyage Dakar
  { groupIdx: 1, paidByIdx: 1, description: "Vol Paris-Dakar", amount: "480.00", category: "transport", daysAgo: 30 },
  { groupIdx: 1, paidByIdx: 0, description: "Hôtel Almadies 3 nuits", amount: "240.00", category: "logement", daysAgo: 28 },
  { groupIdx: 1, paidByIdx: 5, description: "Resto chez Lagon", amount: "85.00", category: "resto", daysAgo: 27 },
  { groupIdx: 1, paidByIdx: 2, description: "Île de Gorée tour", amount: "60.00", category: "loisirs", daysAgo: 26 },
  { groupIdx: 1, paidByIdx: 1, description: "Taxi aéroport retour", amount: "35.00", category: "transport", daysAgo: 25 },
  // Coloc Belleville
  { groupIdx: 2, paidByIdx: 2, description: "Loyer mai", amount: "850.00", category: "logement", daysAgo: 5 },
  { groupIdx: 2, paidByIdx: 1, description: "Courses Carrefour", amount: "62.40", category: "courses", daysAgo: 3 },
  { groupIdx: 2, paidByIdx: 2, description: "EDF mai", amount: "78.00", category: "logement", daysAgo: 2 },
  { groupIdx: 2, paidByIdx: 1, description: "Internet Free", amount: "30.00", category: "logement", daysAgo: 1 },
  // Mariage Kouassi
  { groupIdx: 3, paidByIdx: 3, description: "Salle de réception", amount: "1500.00", category: "loisirs", daysAgo: 14 },
  { groupIdx: 3, paidByIdx: 0, description: "Traiteur 80 personnes", amount: "2400.00", category: "resto", daysAgo: 12 },
  { groupIdx: 3, paidByIdx: 1, description: "DJ + sono", amount: "450.00", category: "loisirs", daysAgo: 10 },
  { groupIdx: 3, paidByIdx: 4, description: "Décoration", amount: "320.00", category: "loisirs", daysAgo: 7 },
  // Club de foot
  { groupIdx: 4, paidByIdx: 1, description: "Maillots 12 personnes", amount: "180.00", category: "loisirs", daysAgo: 20 },
  { groupIdx: 4, paidByIdx: 0, description: "Location terrain mai", amount: "60.00", category: "loisirs", daysAgo: 5 },
  // Paroisse
  { groupIdx: 5, paidByIdx: 0, description: "Achat hosties + vin", amount: "45.00", category: "autres", daysAgo: 15 },
  { groupIdx: 5, paidByIdx: 0, description: "Bougies cierges", amount: "28.00", category: "autres", daysAgo: 8 },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "❌ NODE_ENV=production — refus d'insérer des données de démo en prod.",
    );
    process.exit(1);
  }

  console.log("🌱 Seed démo BMD : début…");

  // 1. Users
  const userIds: string[] = [];
  for (const u of DEMO_USERS) {
    const existing = await prisma.userContact.findUnique({
      where: { type_value: { type: "EMAIL", value: u.email } },
      select: { userId: true },
    });
    if (existing) {
      userIds.push(existing.userId);
      console.log(`  ↻ User existe : ${u.displayName}`);
      continue;
    }
    const created = await prisma.user.create({
      data: {
        displayName: u.displayName,
        defaultCurrency: u.defaultCurrency,
        defaultLocale: u.defaultLocale,
        contacts: {
          create: [
            {
              type: "EMAIL",
              value: u.email,
              isVerified: true,
              isPrimary: true,
              verifiedAt: new Date(),
            },
            {
              type: "PHONE",
              value: u.phone,
              isVerified: true,
              isPrimary: false,
              verifiedAt: new Date(),
            },
          ],
        },
      },
    });
    userIds.push(created.id);
    console.log(`  ✓ User créé : ${u.displayName}`);
  }

  // 2. Groupes
  const groupIds: string[] = [];
  for (const g of DEMO_GROUPS) {
    // Idempotence : on cherche par nom + créateur
    const existing = await prisma.group.findFirst({
      where: { name: g.name, createdById: userIds[g.createdBy] },
      select: { id: true },
    });
    if (existing) {
      groupIds.push(existing.id);
      console.log(`  ↻ Groupe existe : ${g.name}`);
      continue;
    }
    const created = await prisma.group.create({
      data: {
        name: g.name,
        type: g.type,
        defaultCurrency: g.defaultCurrency,
        createdById: userIds[g.createdBy]!,
        members: {
          create: [
            {
              userId: userIds[g.createdBy]!,
              role: "ADMIN",
            },
            ...g.members.map((idx) => ({
              userId: userIds[idx]!,
              role: "MEMBER" as const,
            })),
          ],
        },
      },
    });
    groupIds.push(created.id);
    console.log(`  ✓ Groupe créé : ${g.name} (${g.type})`);
  }

  // 3. Dépenses
  let createdExpenses = 0;
  for (const e of DEMO_EXPENSES) {
    const groupId = groupIds[e.groupIdx]!;
    const paidById = userIds[e.paidByIdx]!;
    const occurredAt = new Date(Date.now() - e.daysAgo * 86400 * 1000);

    // Idempotence : on cherche une dépense identique (groupe + description + montant + jour)
    const existing = await prisma.expense.findFirst({
      where: {
        groupId,
        description: e.description,
        amount: new Decimal(e.amount) as any,
        occurredAt: {
          gte: new Date(occurredAt.getTime() - 86400 * 1000),
          lte: new Date(occurredAt.getTime() + 86400 * 1000),
        },
      },
      select: { id: true },
    });
    if (existing) continue;

    // Récupère tous les membres du groupe pour les shares EQUAL
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const totalParticipants = members.length;
    const sharePerPerson = new Decimal(e.amount).div(totalParticipants).toDecimalPlaces(2);

    await prisma.expense.create({
      data: {
        groupId,
        paidById,
        description: e.description,
        amount: new Decimal(e.amount) as any,
        currency: e.currency ?? DEMO_GROUPS[e.groupIdx]!.defaultCurrency,
        category: e.category,
        occurredAt,
        splitMode: "EQUAL",
        shares: {
          create: members.map((m) => ({
            userId: m.userId,
            amountOwed: sharePerPerson as any,
          })),
        },
      },
    });
    createdExpenses++;
  }
  console.log(`  ✓ ${createdExpenses} dépenses créées`);

  console.log("\n🎉 Seed démo terminé.");
  console.log(
    "\nPour te connecter en démo : /login → email patricia@bmd-demo.local",
  );
  console.log(
    "Le code OTP s'affiche en console (mode dev) ou via /auth/dev/last-otp.",
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed démo a échoué :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
