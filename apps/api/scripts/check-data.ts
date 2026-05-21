/**
 * V89 — Script de diagnostic data : compte rapidement ce qu'il y a dans la
 * BDD et liste les comptes Tsakou. Utile quand l'app se comporte comme si
 * les données avaient disparu.
 *
 * Usage :
 *   cd apps/api && npx tsx scripts/check-data.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const counts = {
    users: await p.user.count(),
    contacts: await p.userContact.count(),
    groups: await p.group.count(),
    expenses: await p.expense.count(),
    tontines: await p.tontine.count(),
  };
  console.log("\n=== Comptes BDD ===");
  console.table(counts);

  const tsakouUsers = await p.user.findMany({
    where: {
      contacts: {
        some: { value: { contains: "tsakou", mode: "insensitive" } },
      },
    },
    include: {
      contacts: true,
      _count: { select: { groupMemberships: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(
    `\n=== Comptes Tsakou trouvés (${tsakouUsers.length}) ===`,
  );
  for (const u of tsakouUsers) {
    console.log({
      id: u.id,
      displayName: u.displayName,
      plan: u.planCode,
      createdAt: u.createdAt.toISOString(),
      groups: u._count.groupMemberships,
      contacts: u.contacts
        .map(
          (c) => `${c.type}:${c.value} (verified=${c.isVerified})`,
        )
        .join(", "),
    });
  }

  // V89 — Liste les groupes + dépenses pour voir qui les possède
  const groups = await p.group.findMany({
    include: {
      _count: { select: { members: true, expenses: true } },
      members: { include: { user: { include: { contacts: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\n=== Groupes en base (${groups.length}) ===`);
  for (const g of groups) {
    console.log({
      id: g.id,
      name: g.name,
      type: g.type,
      currency: g.defaultCurrency,
      createdAt: g.createdAt.toISOString(),
      membersCount: g._count.members,
      expensesCount: g._count.expenses,
      members: g.members.map((m) => {
        const primary = m.user.contacts.find((c) => c.isPrimary) || m.user.contacts[0];
        return `${m.user.displayName} <${primary?.value ?? "no contact"}> [${m.role}]`;
      }),
    });
  }

  // V89 — Si aucun Tsakou trouvé, on liste quand même les 5 derniers users
  // pour comprendre ce qu'il y a (peut-être que la BDD est vraiment vide,
  // ou alors elle contient autre chose qu'on n'attendait pas).
  if (tsakouUsers.length === 0) {
    const lastUsers = await p.user.findMany({
      take: 5,
      include: { contacts: true },
      orderBy: { createdAt: "desc" },
    });
    console.log(`\n=== Derniers users en base (${lastUsers.length}) ===`);
    for (const u of lastUsers) {
      console.log({
        id: u.id,
        displayName: u.displayName,
        plan: u.planCode,
        createdAt: u.createdAt.toISOString(),
        contacts: u.contacts
          .map((c) => `${c.type}:${c.value}`)
          .join(", "),
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
