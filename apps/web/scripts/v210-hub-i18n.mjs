#!/usr/bin/env node
/**
 * V210.E — i18n fanout pour les clés du Hub Bento desktop de la vue groupe.
 *
 * Stratégie : on ajoute les clés natives en FR (+ FR_CI + FR_CM) et EN.
 * Les 23 autres locales du fichier `app-strings.ts` font déjà du fallback
 * EN automatique quand une clé manque. Aucun risque d'afficher du FR à
 * un anglophone — la règle stricte mémoire BMD est respectée.
 *
 * Usage : node scripts/v210-hub-i18n.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "lib", "i18n", "locales");

const HUB_FR = {
  "group.hub.addExpense": "Ajouter",
  "group.hub.yourBalance": "ton solde dans ce groupe",
  "group.hub.owesYou": "te doit",
  "group.hub.youOwe": "tu dois",
  "group.hub.expenses": "Dépenses",
  "group.hub.entries": "entrées",
  "group.hub.viewAll": "Tout voir",
  "group.hub.expensesEmpty": "Aucune dépense pour l'instant",
  "group.hub.addFirstExpense": "Ajouter la première",
  "group.hub.tontine": "Tontine",
  "group.hub.openDetails": "détails",
  "group.hub.currentTurn": "tour en cours",
  "group.hub.tontineDraft": "Tontine prête à démarrer",
  "group.hub.tontineEmpty": "Pas encore de tontine — clique pour en créer une",
  "group.hub.funds": "Caisses",
  "group.hub.fundsEmpty": "Pas encore de caisse — clique pour en créer une",
  "group.hub.fundsTotal": "caisses au total",
  "group.hub.fundsTotalSingular": "caisse au total",
  "group.hub.fundsActive": "en cours",
  "group.hub.fundsClosed": "terminées",
  "group.hub.totalCollected": "Collecté",
  "group.hub.fundsDisabled": "Caisses projet désactivées",
  "group.hub.members": "Membres",
  "group.hub.invite": "inviter",
  "group.hub.peoplePlural": "personnes",
  "group.hub.peopleSingular": "personne",
  "group.hub.secondaryNav": "Sections secondaires",
  "group.hub.meetings": "Réunions",
  "group.hub.documents": "Documents",
  "group.hub.activity": "Activité",
  "group.hub.backToHub": "Retour au hub",
  "group.membersCount": "membres",
  "group.type.tontine": "Tontine",
  "group.type.travel": "Voyage",
  "group.type.coloc": "Coloc",
  "group.type.event": "Événement",
  "group.type.club": "Club",
  "group.type.parish": "Paroisse",
  "group.type.generic": "Groupe",
};

const HUB_FR_CI = {
  ...HUB_FR,
  "group.hub.yourBalance": "ton solde dans le groupe",
  "group.hub.expensesEmpty": "Pas encore de dépense",
  "group.hub.tontineEmpty": "Pas encore de tontine — touche pour en créer une",
  "group.hub.fundsEmpty": "Pas encore de caisse — touche pour en créer une",
};

const HUB_FR_CM = {
  ...HUB_FR,
  "group.hub.yourBalance": "ton solde dans ce groupe-là",
  "group.hub.owesYou": "te dois",
};

const HUB_EN = {
  "group.hub.addExpense": "Add",
  "group.hub.yourBalance": "your balance in this group",
  "group.hub.owesYou": "owes you",
  "group.hub.youOwe": "you owe",
  "group.hub.expenses": "Expenses",
  "group.hub.entries": "entries",
  "group.hub.viewAll": "View all",
  "group.hub.expensesEmpty": "No expense yet",
  "group.hub.addFirstExpense": "Add the first one",
  "group.hub.tontine": "Tontine",
  "group.hub.openDetails": "details",
  "group.hub.currentTurn": "current turn",
  "group.hub.tontineDraft": "Tontine ready to start",
  "group.hub.tontineEmpty": "No tontine yet — click to create one",
  "group.hub.funds": "Funds",
  "group.hub.fundsEmpty": "No fund yet — click to create one",
  "group.hub.fundsTotal": "funds total",
  "group.hub.fundsTotalSingular": "fund total",
  "group.hub.fundsActive": "active",
  "group.hub.fundsClosed": "closed",
  "group.hub.totalCollected": "Collected",
  "group.hub.fundsDisabled": "Project funds disabled",
  "group.hub.members": "Members",
  "group.hub.invite": "invite",
  "group.hub.peoplePlural": "people",
  "group.hub.peopleSingular": "person",
  "group.hub.secondaryNav": "Secondary sections",
  "group.hub.meetings": "Meetings",
  "group.hub.documents": "Documents",
  "group.hub.activity": "Activity",
  "group.hub.backToHub": "Back to hub",
  "group.membersCount": "members",
  "group.type.tontine": "Tontine",
  "group.type.travel": "Travel",
  "group.type.coloc": "Coloc",
  "group.type.event": "Event",
  "group.type.club": "Club",
  "group.type.parish": "Parish",
  "group.type.generic": "Group",
};

/**
 * Insère un objet de clés dans un fichier locale ts.
 * Stratégie : on cherche la ligne `const dict: Record<string, string> = {`
 * et on insère les clés juste après, en idempotent (si la clé existe déjà,
 * on la remplace par la nouvelle valeur).
 */
function patchLocale(code, dict) {
  const file = join(LOCALES_DIR, `${code}.ts`);
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    console.log(`  ✗ ${code}.ts introuvable — skip`);
    return 0;
  }

  let added = 0;
  let updated = 0;

  for (const [key, value] of Object.entries(dict)) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const keyEscaped = key.replace(/\./g, "\\.");
    const re = new RegExp(`("${keyEscaped}":\\s*)"[^"]*"`, "g");

    if (re.test(content)) {
      // Clé déjà présente — on la met à jour
      content = content.replace(re, `$1"${escaped}"`);
      updated++;
    } else {
      // Clé absente — on l'insère juste après l'ouverture du dict
      const insertRe = /(const dict: Record<string, string> = \{\n)/;
      content = content.replace(
        insertRe,
        `$1    "${key}": "${escaped}",\n`,
      );
      added++;
    }
  }

  writeFileSync(file, content, "utf8");
  console.log(`  ✓ ${code}.ts (${added} ajoutées, ${updated} mises à jour)`);
  return added + updated;
}

console.log("🌐 V210.E — i18n Hub Bento desktop\n");

let total = 0;
total += patchLocale("fr", HUB_FR);
total += patchLocale("fr_ci", HUB_FR_CI);
total += patchLocale("fr_cm", HUB_FR_CM);
total += patchLocale("en", HUB_EN);

console.log(`\n✅ ${total} entrées i18n écrites au total.`);
console.log(
  "ℹ️  Les 23 autres locales feront du fallback EN automatique (règle BMD : pas de fallback FR).",
);
