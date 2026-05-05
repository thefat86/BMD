/**
 * Promeut un utilisateur en super admin BMD.
 *
 * Usage :
 *   npx tsx apps/api/scripts/make-admin.ts <email_ou_telephone>
 *
 * Exemples :
 *   npx tsx apps/api/scripts/make-admin.ts fabricetsakou@gmail.com
 *   npx tsx apps/api/scripts/make-admin.ts +33612345678
 *
 * À utiliser une seule fois pour bootstrapper le premier admin.
 * Ensuite, le super admin peut promouvoir d'autres users via l'API.
 */
import { PrismaClient, ContactType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    console.error("❌ Usage : npx tsx apps/api/scripts/make-admin.ts <email_ou_telephone>");
    process.exit(1);
  }

  const type: ContactType = arg.includes("@") ? "EMAIL" : "PHONE";
  const value = arg;

  const contact = await prisma.userContact.findUnique({
    where: { type_value: { type, value } },
    include: { user: true },
  });

  if (!contact) {
    console.error(`❌ Aucun utilisateur trouvé avec ${type} = ${value}`);
    console.error("   Astuce : assure-toi de t'être déjà connecté au moins une fois sur l'app avec ce contact.");
    process.exit(1);
  }

  if (contact.user.isSuperAdmin) {
    console.log(`✓ ${contact.user.displayName} (${value}) est déjà super admin.`);
    process.exit(0);
  }

  await prisma.user.update({
    where: { id: contact.userId },
    data: { isSuperAdmin: true },
  });

  console.log(`✅ ${contact.user.displayName} (${value}) est maintenant SUPER ADMIN.`);
  console.log(`   Connecte-toi sur http://localhost:3000/admin pour accéder à la console.`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
