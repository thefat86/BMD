#!/usr/bin/env node
/**
 * V201 — Ajout des ~80 clés i18n UI Caisses Projet × 27 locales.
 *
 * Stratégie de fallback (respect règle mémoire "pas de fallback FR — si fallback, alors EN") :
 *   - FR : natif soigné
 *   - EN : natif soigné
 *   - 25 autres locales : valeur identique à EN (fallback international intelligent)
 *
 * Un sprint d'affinage natif par locale pourra être lancé ultérieurement.
 * Idempotent : skip silencieusement les clés déjà présentes.
 *
 * Usage : node scripts/v201-add-funds-ui-i18n.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "lib", "i18n", "locales");

// ---- Référence FR + EN ----
const FR = {
  "funds.title": "Caisses projet",
  "funds.createNew": "Nouvelle caisse",
  "funds.contributors": "contributeurs",
  "funds.viewProof": "Voir la preuve",
  "funds.beneficiary": "Bénéficiaire",
  "funds.backToList": "Toutes les caisses",
  "funds.statusClosed": "Clôturée",
  "funds.treasurerYou": "Toi",
  "funds.viewsLabel": "Vues de la caisse",
  "funds.emptyTitle": "Aucune caisse encore",
  "funds.emptyBody":
    "Une caisse projet permet de collecter des contributions pour un événement, un projet ou un acte de solidarité. BMD enregistre, tu gardes l'argent.",
  "funds.createFirst": "Créer la première caisse",
  "funds.createdToast": "Caisse créée !",
  "funds.createSheetTitle": "Nouvelle caisse projet",
  "funds.disabled.title": "Bientôt disponible",
  "funds.disabled.body":
    "Le module Caisses Projet sera activé après validation juridique. Reviens bientôt.",

  // Tabs
  "funds.tabContributions": "Cotisations",
  "funds.tabExpenses": "Dépenses",
  "funds.tabAudit": "Audit",
  "funds.noContributions":
    "Aucune cotisation pour le moment. Sois le premier à participer !",
  "funds.noExpenses": "Aucune dépense proposée pour le moment.",
  "funds.noAudit": "Aucun événement.",

  // Statuts cotisation
  "funds.status.pending": "En attente",
  "funds.status.validated": "Validée",
  "funds.status.rejected": "Refusée",
  // Statuts dépense
  "funds.expenseStatus.pendingVote": "Vote en cours",
  "funds.expenseStatus.approved": "Approuvée",
  "funds.expenseStatus.rejected": "Refusée",
  "funds.expenseStatus.executed": "Exécutée",

  // Stats hero
  "funds.stats.spent": "Dépensé",
  "funds.stats.balance": "Disponible",
  "funds.stats.contributors": "Contributeurs",

  // Wizard création
  "funds.step": "Étape {n}/{total}",
  "funds.create.step1Title": "De quoi s'agit-il ?",
  "funds.create.step2Title": "Objectif et échéance",
  "funds.create.step3Title": "Trésorier et règles",
  "funds.create.templateLabel": "Type de caisse",
  "funds.create.nameLabel": "Nom de la caisse",
  "funds.create.namePlaceholder": "Ex: Funérailles Tata Marie",
  "funds.create.descriptionLabel": "Description (optionnel)",
  "funds.create.descriptionPlaceholder":
    "À quoi servira l'argent collecté ?",
  "funds.create.currencyLabel": "Devise de la caisse",
  "funds.create.targetLabel": "Objectif (optionnel)",
  "funds.create.targetHint":
    "Sert à afficher une jauge de progression. Laisse vide pour collecte ouverte.",
  "funds.create.deadlineLabel": "Date d'échéance (optionnel)",
  "funds.create.treasurerLabel": "Trésorier (responsable des fonds)",
  "funds.create.treasurerSelf": "Moi (par défaut)",
  "funds.create.treasurerHint":
    "Le trésorier détient l'argent et valide les cotisations. BMD n'encaisse jamais.",
  "funds.create.voteThresholdLabel": "Seuil de vote (optionnel)",
  "funds.create.voteThresholdPlaceholder": "500",
  "funds.create.voteThresholdHint":
    "Au-delà de ce montant, une dépense doit être votée par les contributeurs. Laisse vide pour utiliser la valeur globale.",
  "funds.create.submit": "Créer la caisse",

  // Cotisations
  "funds.contribute.cta": "Je cotise",
  "funds.contribute.kicker": "Cotisation",
  "funds.contribute.amountLabel": "Montant",
  "funds.contribute.currencyLabel": "Devise",
  "funds.contribute.fxNote":
    "Convertie automatiquement en {fundCurrency} selon le taux du jour.",
  "funds.contribute.sameCurrencyNote": "Même devise que la caisse.",
  "funds.contribute.methodLabel": "Moyen de paiement",
  "funds.contribute.proofLabel": "Lien vers la preuve (optionnel)",
  "funds.contribute.proofHint":
    "Capture du virement, photo du reçu mobile money, etc. Renforce la confiance.",
  "funds.contribute.noteLabel": "Note (optionnel)",
  "funds.contribute.notePlaceholder": "Un mot à propos…",
  "funds.contribute.submit": "Déclarer ma cotisation",
  "funds.contribDeclaredToast": "Cotisation déclarée",
  "funds.contribValidatedToast": "Cotisation validée",
  "funds.contribRejectedToast": "Cotisation refusée",
  "funds.validate": "Valider",
  "funds.reject": "Refuser",

  // Méthodes paiement
  "funds.method.transfer": "Virement",
  "funds.method.mobile_money": "Mobile money",
  "funds.method.cash": "Espèces",
  "funds.method.card": "Carte",
  "funds.method.other": "Autre",

  // Templates
  "funds.template.event": "Événement",
  "funds.template.project": "Projet",
  "funds.template.solidarity": "Solidarité",
  "funds.template.association": "Association",
  "funds.template.gift": "Cadeau collectif",

  // Refus cotisation
  "funds.reject.title": "Refuser la cotisation",
  "funds.reject.kicker": "Refus",
  "funds.reject.reasonLabel": "Motif (recommandé)",
  "funds.reject.reasonPlaceholder":
    "Ex: Preuve illisible, montant incohérent, double déclaration…",
  "funds.reject.reasonHint":
    "Le contributeur verra ce motif. Sois clair et respectueux.",
  "funds.reject.submit": "Refuser",
  "funds.rejectionReasonLabel": "Motif",

  // Dépenses
  "funds.proposeExpense.cta": "Proposer dépense",
  "funds.proposeExpense.kicker": "Dépense",
  "funds.proposeExpense.title": "Proposer une dépense",
  "funds.proposeExpense.balanceAvailable":
    "Solde disponible : {balance} {currency}",
  "funds.proposeExpense.motiveLabel": "Motif",
  "funds.proposeExpense.motivePlaceholder": "Ex: Achat fleurs cérémonie",
  "funds.proposeExpense.amountLabel": "Montant ({currency})",
  "funds.proposeExpense.exceedsBalance":
    "Le montant dépasse le solde disponible. La dépense ne pourra pas être exécutée tant que la caisse n'aura pas reçu assez de cotisations.",
  "funds.proposeExpense.beneficiaryLabel": "Bénéficiaire (optionnel)",
  "funds.proposeExpense.beneficiaryPlaceholder":
    "Nom du destinataire / fournisseur",
  "funds.proposeExpense.proofLabel": "Lien vers la preuve (optionnel)",
  "funds.proposeExpense.submit": "Proposer la dépense",
  "funds.expenseProposedToast": "Dépense proposée",

  // Vote
  "funds.voteFor": "Pour",
  "funds.voteAgainst": "Contre",
  "funds.voteForToast": "Vote pour enregistré",
  "funds.voteAgainstToast": "Vote contre enregistré",
  "funds.voteClosesIn": "Vote jusqu'à",

  // Exécution dépense
  "funds.executeAction": "Exécuter",
  "funds.executeTitle": "Exécuter la dépense",
  "funds.executeConfirm":
    "Confirmer l'exécution de cette dépense ({amount} {currency}) ?",
  "funds.executedToast": "Dépense exécutée",

  // Clôture caisse
  "funds.closeAction": "Clôturer",
  "funds.closeTitle": "Clôturer la caisse",
  "funds.closeConfirm":
    "Clôturer cette caisse ? Plus aucune cotisation ni dépense ne sera possible.",
  "funds.closedToast": "Caisse clôturée",

  // Détail page
  "funds.detail.title": "Détail de la caisse",
  "funds.detail.breadcrumb": "Caisses › Détail",

  // Audit log
  "funds.auditHashTooltip": "Hash d'intégrité SHA-256",
  "funds.event.FUND_CREATED": "Caisse créée",
  "funds.event.FUND_UPDATED": "Caisse modifiée",
  "funds.event.TREASURER_NAMED": "Trésorier désigné",
  "funds.event.CONTRIBUTION_DECLARED": "Cotisation déclarée",
  "funds.event.CONTRIBUTION_VALIDATED": "Cotisation validée",
  "funds.event.CONTRIBUTION_REJECTED": "Cotisation refusée",
  "funds.event.EXPENSE_PROPOSED": "Dépense proposée",
  "funds.event.EXPENSE_VOTED": "Vote sur dépense",
  "funds.event.EXPENSE_APPROVED": "Dépense approuvée",
  "funds.event.EXPENSE_REJECTED": "Dépense refusée",
  "funds.event.EXPENSE_EXECUTED": "Dépense exécutée",
  "funds.event.FUND_CLOSED": "Caisse clôturée",
  "funds.event.FUND_ARCHIVED": "Caisse archivée",

  // Notice légale
  "funds.legal.title": "BMD est un registre, pas une banque",
  "funds.legal.body":
    "L'argent n'est jamais détenu par BMD. Le trésorier nommé est seul responsable de la garde des fonds. BMD enregistre les déclarations pour assurer la transparence entre contributeurs.",
  "funds.legal.treasurerLine": "Trésorier nommé : {name}.",

  // Tile nav groupe
  "group.tabFunds": "Caisses",
};

const EN = {
  "funds.title": "Project funds",
  "funds.createNew": "New fund",
  "funds.contributors": "contributors",
  "funds.viewProof": "View proof",
  "funds.beneficiary": "Beneficiary",
  "funds.backToList": "All funds",
  "funds.statusClosed": "Closed",
  "funds.treasurerYou": "You",
  "funds.viewsLabel": "Fund views",
  "funds.emptyTitle": "No fund yet",
  "funds.emptyBody":
    "A project fund lets you collect contributions for an event, a project, or a solidarity action. BMD records, you hold the money.",
  "funds.createFirst": "Create the first fund",
  "funds.createdToast": "Fund created!",
  "funds.createSheetTitle": "New project fund",
  "funds.disabled.title": "Coming soon",
  "funds.disabled.body":
    "The Project Funds module will be activated after legal review. Check back soon.",

  "funds.tabContributions": "Contributions",
  "funds.tabExpenses": "Expenses",
  "funds.tabAudit": "Audit",
  "funds.noContributions": "No contributions yet. Be the first to chip in!",
  "funds.noExpenses": "No expenses proposed yet.",
  "funds.noAudit": "No event.",

  "funds.status.pending": "Pending",
  "funds.status.validated": "Validated",
  "funds.status.rejected": "Rejected",
  "funds.expenseStatus.pendingVote": "Voting",
  "funds.expenseStatus.approved": "Approved",
  "funds.expenseStatus.rejected": "Rejected",
  "funds.expenseStatus.executed": "Executed",

  "funds.stats.spent": "Spent",
  "funds.stats.balance": "Available",
  "funds.stats.contributors": "Contributors",

  "funds.step": "Step {n}/{total}",
  "funds.create.step1Title": "What is it about?",
  "funds.create.step2Title": "Target & deadline",
  "funds.create.step3Title": "Treasurer & rules",
  "funds.create.templateLabel": "Fund type",
  "funds.create.nameLabel": "Fund name",
  "funds.create.namePlaceholder": "E.g.: Auntie Marie's funeral",
  "funds.create.descriptionLabel": "Description (optional)",
  "funds.create.descriptionPlaceholder":
    "What will the collected money be used for?",
  "funds.create.currencyLabel": "Fund currency",
  "funds.create.targetLabel": "Target (optional)",
  "funds.create.targetHint":
    "Used to show a progress gauge. Leave empty for an open collection.",
  "funds.create.deadlineLabel": "Deadline (optional)",
  "funds.create.treasurerLabel": "Treasurer (responsible for the funds)",
  "funds.create.treasurerSelf": "Me (default)",
  "funds.create.treasurerHint":
    "The treasurer holds the money and validates contributions. BMD never takes payments.",
  "funds.create.voteThresholdLabel": "Voting threshold (optional)",
  "funds.create.voteThresholdPlaceholder": "500",
  "funds.create.voteThresholdHint":
    "Above this amount, an expense must be voted by contributors. Leave empty to use the global value.",
  "funds.create.submit": "Create the fund",

  "funds.contribute.cta": "Contribute",
  "funds.contribute.kicker": "Contribution",
  "funds.contribute.amountLabel": "Amount",
  "funds.contribute.currencyLabel": "Currency",
  "funds.contribute.fxNote":
    "Automatically converted to {fundCurrency} at today's rate.",
  "funds.contribute.sameCurrencyNote": "Same currency as the fund.",
  "funds.contribute.methodLabel": "Payment method",
  "funds.contribute.proofLabel": "Link to proof (optional)",
  "funds.contribute.proofHint":
    "Transfer screenshot, mobile money receipt photo, etc. Strengthens trust.",
  "funds.contribute.noteLabel": "Note (optional)",
  "funds.contribute.notePlaceholder": "A word about it…",
  "funds.contribute.submit": "Declare my contribution",
  "funds.contribDeclaredToast": "Contribution declared",
  "funds.contribValidatedToast": "Contribution validated",
  "funds.contribRejectedToast": "Contribution rejected",
  "funds.validate": "Validate",
  "funds.reject": "Reject",

  "funds.method.transfer": "Bank transfer",
  "funds.method.mobile_money": "Mobile money",
  "funds.method.cash": "Cash",
  "funds.method.card": "Card",
  "funds.method.other": "Other",

  "funds.template.event": "Event",
  "funds.template.project": "Project",
  "funds.template.solidarity": "Solidarity",
  "funds.template.association": "Association",
  "funds.template.gift": "Group gift",

  "funds.reject.title": "Reject contribution",
  "funds.reject.kicker": "Refusal",
  "funds.reject.reasonLabel": "Reason (recommended)",
  "funds.reject.reasonPlaceholder":
    "E.g.: Unreadable proof, inconsistent amount, duplicate declaration…",
  "funds.reject.reasonHint":
    "The contributor will see this reason. Be clear and respectful.",
  "funds.reject.submit": "Reject",
  "funds.rejectionReasonLabel": "Reason",

  "funds.proposeExpense.cta": "Propose expense",
  "funds.proposeExpense.kicker": "Expense",
  "funds.proposeExpense.title": "Propose an expense",
  "funds.proposeExpense.balanceAvailable":
    "Available balance: {balance} {currency}",
  "funds.proposeExpense.motiveLabel": "Reason",
  "funds.proposeExpense.motivePlaceholder": "E.g.: Ceremony flowers",
  "funds.proposeExpense.amountLabel": "Amount ({currency})",
  "funds.proposeExpense.exceedsBalance":
    "The amount exceeds the available balance. The expense cannot be executed until enough contributions are received.",
  "funds.proposeExpense.beneficiaryLabel": "Beneficiary (optional)",
  "funds.proposeExpense.beneficiaryPlaceholder":
    "Recipient / vendor name",
  "funds.proposeExpense.proofLabel": "Link to proof (optional)",
  "funds.proposeExpense.submit": "Propose the expense",
  "funds.expenseProposedToast": "Expense proposed",

  "funds.voteFor": "For",
  "funds.voteAgainst": "Against",
  "funds.voteForToast": "Vote for recorded",
  "funds.voteAgainstToast": "Vote against recorded",
  "funds.voteClosesIn": "Voting until",

  "funds.executeAction": "Execute",
  "funds.executeTitle": "Execute the expense",
  "funds.executeConfirm":
    "Confirm execution of this expense ({amount} {currency})?",
  "funds.executedToast": "Expense executed",

  "funds.closeAction": "Close",
  "funds.closeTitle": "Close the fund",
  "funds.closeConfirm":
    "Close this fund? No more contributions or expenses will be possible.",
  "funds.closedToast": "Fund closed",

  "funds.detail.title": "Fund details",
  "funds.detail.breadcrumb": "Funds › Details",

  "funds.auditHashTooltip": "SHA-256 integrity hash",
  "funds.event.FUND_CREATED": "Fund created",
  "funds.event.FUND_UPDATED": "Fund updated",
  "funds.event.TREASURER_NAMED": "Treasurer designated",
  "funds.event.CONTRIBUTION_DECLARED": "Contribution declared",
  "funds.event.CONTRIBUTION_VALIDATED": "Contribution validated",
  "funds.event.CONTRIBUTION_REJECTED": "Contribution rejected",
  "funds.event.EXPENSE_PROPOSED": "Expense proposed",
  "funds.event.EXPENSE_VOTED": "Expense voted",
  "funds.event.EXPENSE_APPROVED": "Expense approved",
  "funds.event.EXPENSE_REJECTED": "Expense rejected",
  "funds.event.EXPENSE_EXECUTED": "Expense executed",
  "funds.event.FUND_CLOSED": "Fund closed",
  "funds.event.FUND_ARCHIVED": "Fund archived",

  "funds.legal.title": "BMD is a register, not a bank",
  "funds.legal.body":
    "The money is never held by BMD. The named treasurer is solely responsible for safeguarding the funds. BMD records declarations to ensure transparency between contributors.",
  "funds.legal.treasurerLine": "Named treasurer: {name}.",

  "group.tabFunds": "Funds",
};

// ---- Patch des fichiers .ts (format export const) ----
// Les locales BMD sont en TypeScript (lib/i18n/locales/<code>.ts), pas en JSON.
// On insère les nouvelles clés juste avant le `};` fermant. La règle de
// fallback (FR uniquement pour fr/fr_ci/fr_cm, EN partout ailleurs) est
// appliquée locale par locale.

function dictForLocale(code) {
  // Les variantes FR (fr_ci, fr_cm) reprennent le dictionnaire FR.
  // Toutes les autres locales reçoivent la version EN (fallback international,
  // respect règle mémoire "si fallback, alors EN").
  if (code === "fr" || code === "fr_ci" || code === "fr_cm") return FR;
  return EN;
}

function patchLocale(code) {
  const file = join(LOCALES_DIR, `${code}.ts`);
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    console.log(`  ✗ ${code}.ts introuvable — skip`);
    return { added: 0, skipped: 0 };
  }
  // Idempotence : si la clé sentinelle `funds.title` (V201) est déjà
  // présente dans CETTE locale, on saute pour ne pas dupliquer.
  if (content.includes('"funds.title":')) {
    console.log(`  ⚠️  ${code}.ts : clés V201 déjà présentes — skip`);
    return { added: 0, skipped: Object.keys(EN).length };
  }
  const dict = dictForLocale(code);
  const lines = Object.entries(dict).map(([key, value]) => {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `    "${key}": "${escaped}",`;
  });
  const patched = content.replace(/^};$/m, `${lines.join("\n")}\n};`);
  if (patched === content) {
    console.log(`  ✗ ${code}.ts : motif "};" introuvable — skip`);
    return { added: 0, skipped: 0 };
  }
  writeFileSync(file, patched, "utf8");
  console.log(`  ✓ ${code}.ts (+${lines.length} clés)`);
  return { added: lines.length, skipped: 0 };
}

function listLocaleCodes() {
  return readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".ts.bak"))
    .map((f) => f.replace(/\.ts$/, ""));
}

const localeCodes = listLocaleCodes();
console.log(`📚 Locales détectées : ${localeCodes.length}`);
console.log(`🔑 Nouvelles clés V201 : ${Object.keys(EN).length}`);

let totalAdded = 0;
let totalSkipped = 0;

for (const code of localeCodes) {
  const { added, skipped } = patchLocale(code);
  totalAdded += added;
  totalSkipped += skipped;
}

console.log(
  `\n✅ V201 i18n fanout terminé : ${totalAdded} clés ajoutées, ${totalSkipped} déjà présentes.`,
);
console.log(
  "ℹ️  FR + variantes FR (fr_ci, fr_cm) reçoivent la version FR native.",
);
console.log(
  "    Les 24 autres locales reçoivent la version EN (fallback international).",
);
console.log(
  "    Un sprint d'affinage natif par locale pourra être lancé ultérieurement.",
);
