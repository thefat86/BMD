/**
 * V89.1 — Promouvoir un user en SuperAdmin par email.
 *
 * Usage :
 *   cd apps/api
 *   npx tsx scripts/promote-admin.ts <email>
 *
 * Exemple :
 *   npx tsx scripts/promote-admin.ts fabricetsakou@gmail.com
 *
 * Match case-insensitive sur le contact EMAIL primaire. Imprime un récap
 * avant/après pour confirmer le changement.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("❌ Usage : npx tsx scripts/promote-admin.ts <email>");
    process.exit(1);
  }

  const user = await p.user.findFirst({
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

  if (!user) {
    console.error(`❌ Aucun user trouvé avec l'email ${email}`);
    console.error(
      "   Vérifie l'orthographe ou crée d'abord le compte en te connectant.",
    );
    process.exit(1);
  }

  console.log("\n=== AVANT ===");
  console.log({
    id: user.id,
    displayName: user.displayName,
    isSuperAdmin: user.isSuperAdmin,
    plan: user.planCode,
    email: user.contacts.find((c) => c.type === "EMAIL")?.value,
  });

  if (user.isSuperAdmin) {
    console.log("\n✅ Ce user est déjà SuperAdmin — rien à faire.");
    return;
  }

  const updated = await p.user.update({
    where: { id: user.id },
    data: { isSuperAdmin: true },
  });

  console.log("\n=== APRÈS ===");
  console.log({
    id: updated.id,
    displayName: updated.displayName,
    isSuperAdmin: updated.isSuperAdmin,
  });
  console.log(`\n✅ ${email} est maintenant SuperAdmin.`);
  console.log(
    "   Déconnecte-toi de l'app puis reconnecte-toi pour que le token reflète ce statut.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
