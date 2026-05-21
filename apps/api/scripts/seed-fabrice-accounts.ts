/**
 * V93 — Restauration rapide des 3 comptes critiques BMD.
 *
 * Recrée (idempotent) :
 *   - fabricetsakou@gmail.com (SuperAdmin)
 *   - familletsakou@gmail.com
 *   - julieetfab2014@gmail.com
 *
 * Si un compte existe déjà, on le met à jour ; sinon on le crée.
 * Aucune donnée existante n'est effacée — script ADDITIVE-only.
 *
 * Usage :
 *   cd apps/api
 *   npx tsx scripts/seed-fabrice-accounts.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

interface AccountSeed {
  email: string;
  displayName: string;
  isSuperAdmin?: boolean;
  planCode?: string;
}

const ACCOUNTS: AccountSeed[] = [
  {
    email: "fabricetsakou@gmail.com",
    displayName: "Fabrice Tsakou",
    isSuperAdmin: true,
    planCode: "FREE",
  },
  {
    email: "familletsakou@gmail.com",
    displayName: "Famille Tsakou",
    planCode: "FREE",
  },
  {
    email: "julieetfab2014@gmail.com",
    displayName: "Julie & Fab",
    planCode: "FREE",
  },
];

async function upsertAccount(seed: AccountSeed): Promise<void> {
  const email = seed.email.toLowerCase();

  // Cherche un user existant avec ce contact (case-insensitive)
  const existing = await p.user.findFirst({
    where: {
      contacts: {
        some: {
          type: "EMAIL",
          value: { equals: email, mode: "insensitive" },
        },
      },
    },
    include: { contacts: true },
  });

  if (existing) {
    // Mise à jour des flags admin / displayName si différents
    const updates: Record<string, unknown> = {};
    if (seed.isSuperAdmin !== undefined && existing.isSuperAdmin !== seed.isSuperAdmin) {
      updates.isSuperAdmin = seed.isSuperAdmin;
    }
    if (seed.displayName && existing.displayName !== seed.displayName) {
      updates.displayName = seed.displayName;
    }
    if (Object.keys(updates).length > 0) {
      await p.user.update({ where: { id: existing.id }, data: updates });
      console.log(`✏️  ${email} mis à jour :`, updates);
    } else {
      console.log(
        `✓  ${email} déjà à jour (id=${existing.id}, isSuperAdmin=${existing.isSuperAdmin}, plan=${existing.planCode})`,
      );
    }
    return;
  }

  // Création
  const user = await p.user.create({
    data: {
      displayName: seed.displayName,
      planCode: seed.planCode ?? "FREE",
      isSuperAdmin: seed.isSuperAdmin ?? false,
      contacts: {
        create: {
          type: "EMAIL",
          value: email,
          isVerified: true,
          isPrimary: true,
          verifiedAt: new Date(),
        },
      },
    },
  });
  console.log(
    `✅ ${email} créé (id=${user.id}, isSuperAdmin=${user.isSuperAdmin}, plan=${user.planCode})`,
  );
}

async function main() {
  console.log("\n=== Restauration comptes critiques BMD ===\n");
  for (const acct of ACCOUNTS) {
    try {
      await upsertAccount(acct);
    } catch (e) {
      console.error(`❌ ${acct.email} échec :`, e);
    }
  }
  console.log("\n=== Terminé ===\n");
  console.log(
    "Pour te connecter : tu peux maintenant taper ton email dans l'app et\n" +
      "recevoir le code OTP. Les 3 comptes existent maintenant avec contact\n" +
      "EMAIL vérifié — le verifyOtp côté backend les reconnaîtra (au lieu de\n" +
      "créer un duplicate).\n",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
