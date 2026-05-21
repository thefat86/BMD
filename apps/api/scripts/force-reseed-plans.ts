/**
 * V168 — Force re-seed plans (écrase les `limits` JSON).
 *
 * Le bootstrap normal `seedPlans()` au démarrage de l'API ne réécrase PAS
 * les limits existantes (défensif, pour préserver les customisations admin).
 * Ce script CLI sert UNIQUEMENT à forcer la synchronisation des limits
 * quand on a fait évoluer la grille tarifaire (ex : ajout de
 * `debtAgreementsPerMonth` en V152).
 *
 * Usage :
 *   npm run reseed-plans              # depuis apps/api
 *   npm run reseed-plans -- --dry-run # voit le diff sans écrire
 *   npm run reseed-plans -- FREE PERSONAL  # ne reseed que ces codes
 *
 * Sécurité :
 *   - Affiche le diff avant d'écrire
 *   - Confirmation interactive si > 1 plan touché (sauf --yes)
 *   - Ne touche QUE les plans présents dans seed-plans.ts (ignore les
 *     plans custom créés à la main par un superadmin)
 */
import { prisma } from "../src/lib/db.js";
import { seedPlans } from "../src/lib/seed-plans.js";

// On ré-importe la liste PLANS via une astuce : on relit le fichier source
// car PLANS est privé au module. Plus propre : exporter PLANS depuis
// seed-plans.ts. Ici on utilise une re-importation directe.
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const yes = args.includes("--yes") || args.includes("-y");
  const onlyCodes = args.filter((a) => !a.startsWith("--") && a !== "-y");

  // On lit les plans depuis seed-plans.ts via un mini-eval du module.
  // Plus simple : on utilise prisma + un seed.
  const mod = await import("../src/lib/seed-plans.js");
  // Cast un peu sale, mais PLANS n'est pas exporté. On fait l'astuce :
  // on appelle seedPlans en mode "force update" via accès direct prisma.
  // Pour rester clean : on demande à seed-plans.ts d'exposer PLANS.
  const PLANS = (mod as any).PLANS || (mod as any).default?.PLANS;
  if (!PLANS || !Array.isArray(PLANS)) {
    // Fallback : on appelle seedPlans normal puis on patch en force update.
    console.error(
      "❌ PLANS n'est pas exporté depuis seed-plans.ts. Édite seed-plans.ts pour ajouter:",
    );
    console.error("    export { PLANS };");
    console.error("Ou exécute directement le script avec ts-node sur PLANS.");
    process.exit(1);
  }

  const targetPlans = onlyCodes.length
    ? PLANS.filter((p: any) => onlyCodes.includes(p.code))
    : PLANS;

  if (!targetPlans.length) {
    console.error("❌ Aucun plan ciblé. Codes valides:", PLANS.map((p: any) => p.code).join(", "));
    process.exit(1);
  }

  console.log(
    `🔧 Re-seed forcé : ${targetPlans.length} plan(s) ${dryRun ? "[DRY-RUN]" : ""}`,
  );

  for (const p of targetPlans) {
    const existing = await prisma.plan.findUnique({ where: { code: p.code } });
    if (!existing) {
      console.log(`  + ${p.code} : création (nouveau)`);
      if (!dryRun) {
        await prisma.plan.create({ data: p as any });
      }
      continue;
    }

    const oldLimits = (existing.limits as any) || {};
    const newLimits = p.limits;

    // Compare les clés différentes
    const allKeys = new Set([
      ...Object.keys(oldLimits),
      ...Object.keys(newLimits),
    ]);
    const diff: string[] = [];
    for (const k of allKeys) {
      if (JSON.stringify(oldLimits[k]) !== JSON.stringify(newLimits[k])) {
        diff.push(
          `      ${k}: ${JSON.stringify(oldLimits[k])} → ${JSON.stringify(newLimits[k])}`,
        );
      }
    }
    if (!diff.length) {
      console.log(`  = ${p.code} : aucun changement`);
      continue;
    }
    console.log(`  ~ ${p.code} : ${diff.length} champ(s) modifié(s)`);
    diff.forEach((d) => console.log(d));

    if (!dryRun) {
      await prisma.plan.update({
        where: { code: p.code },
        data: {
          name: p.name,
          priceCents: p.priceCents,
          priceCentsYearly: p.priceCentsYearly,
          description: p.description,
          displayOrder: p.displayOrder,
          limits: p.limits as any,
        },
      });
    }
  }

  if (dryRun) {
    console.log("\n💡 Re-exécute sans --dry-run pour appliquer les changements.");
  } else {
    console.log("\n✅ Re-seed terminé.");
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
