/**
 * V93.5 — Audit des 71 contacts en BDD.
 *
 * Catégorise tous les UserContact pour comprendre d'où ils viennent :
 *   - E2E Playwright (domaine bmd-e2e.local)
 *   - Seed fixture (numéros +33612360001, +33612360100..102)
 *   - Comptes réels Tsakou / Julie / etc.
 *   - Autres
 *
 * Affiche aussi les 10 derniers users créés (pour identifier les sources
 * actives récemment).
 *
 * Usage :
 *   cd apps/api && npx tsx scripts/audit-contacts.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

interface Bucket {
  name: string;
  pattern: RegExp;
  examples: string[];
  count: number;
}

async function main() {
  const allContacts = await p.userContact.findMany({
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          createdAt: true,
          isSuperAdmin: true,
          _count: { select: { groupMemberships: true } },
        },
      },
    },
    orderBy: { user: { createdAt: "desc" } },
  });

  console.log(`\n=== Total: ${allContacts.length} contacts ===\n`);

  const buckets: Bucket[] = [
    {
      name: "E2E Playwright tests",
      pattern: /@bmd-e2e\.local$/i,
      examples: [],
      count: 0,
    },
    {
      name: "Seed dev fixture (numéros +33612360XXX)",
      pattern: /^\+33612360\d{3}$/,
      examples: [],
      count: 0,
    },
    {
      name: "Comptes Tsakou (vrais)",
      pattern: /tsakou|julieetfab/i,
      examples: [],
      count: 0,
    },
    {
      name: "Autres emails @gmail.com",
      pattern: /@gmail\.com$/i,
      examples: [],
      count: 0,
    },
    {
      name: "Autres téléphones +33",
      pattern: /^\+33/,
      examples: [],
      count: 0,
    },
  ];

  const orphans: string[] = [];

  for (const c of allContacts) {
    let placed = false;
    for (const b of buckets) {
      if (b.pattern.test(c.value)) {
        b.count++;
        if (b.examples.length < 3) b.examples.push(c.value);
        placed = true;
        break;
      }
    }
    if (!placed) orphans.push(c.value);
  }

  console.log("=== Catégorisation ===");
  for (const b of buckets) {
    if (b.count === 0) continue;
    console.log(`\n📊 ${b.name}: ${b.count}`);
    for (const ex of b.examples) console.log(`     • ${ex}`);
    if (b.count > b.examples.length) {
      console.log(`     … et ${b.count - b.examples.length} autres`);
    }
  }
  if (orphans.length > 0) {
    console.log(`\n❓ Non classés: ${orphans.length}`);
    for (const o of orphans.slice(0, 10)) console.log(`     • ${o}`);
  }

  console.log("\n=== 10 derniers users créés (du plus récent au plus ancien) ===");
  for (const c of allContacts.slice(0, 10)) {
    const u = c.user;
    const ageMin = Math.round(
      (Date.now() - u.createdAt.getTime()) / 60_000,
    );
    console.log(
      `  ${u.createdAt.toISOString()}  ${c.value.padEnd(45)} ` +
        `(${u.displayName ?? "no name"}, ${ageMin}min ago, ${u._count.groupMemberships} groupe(s))${u.isSuperAdmin ? " ⭐ ADMIN" : ""}`,
    );
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
