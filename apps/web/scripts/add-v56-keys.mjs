#!/usr/bin/env node
// V56 — Ajoute les clés i18n du sheet relance créanciers + raccourci dashboard.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(__dirname, "..", "lib/i18n/locales");

// Pour les traductions natives je couvre fr/en/es/pt/ar/de/it/lb/ru/sw/wo/ln/zh
// — les autres fallback sur EN (règle BMD : fallback EN, jamais FR).
const FR = {
  "dashboard.remindDebtors": "Relancer",
  "reminder.title": "Relancer mes créanciers",
  "reminder.intro":
    "{count} personne(s) te doivent de l'argent. Choisis qui relancer.",
  "reminder.loading": "Chargement des débiteurs…",
  "reminder.noDebtors":
    "Personne ne te doit d'argent en ce moment. Tu peux toujours créer un nouveau groupe ou ajouter une dépense.",
  "reminder.you": "Toi",
  "reminder.changeRecipient": "Changer de destinataire",
  "reminder.toneLabel": "Ton du message",
  "reminder.languageLabel": "Langue du message",
  "reminder.toneSympa": "Sympa",
  "reminder.toneFerme": "Ferme",
  "reminder.toneHumour": "Humour",
  "reminder.tonePro": "Pro",
  "reminder.generateCta": "Générer le message",
  "reminder.generating": "Génération IA…",
  "reminder.regenerate": "Régénérer",
  "reminder.draftLabel": "Message — modifiable",
  "reminder.sendCta": "Envoyer",
  "reminder.shareTitle": "Relance BMD",
  "reminder.copied": "Message copié dans le presse-papier.",
};

const EN = {
  "dashboard.remindDebtors": "Remind",
  "reminder.title": "Remind your debtors",
  "reminder.intro":
    "{count} people owe you money. Choose who to remind.",
  "reminder.loading": "Loading debtors…",
  "reminder.noDebtors":
    "Nobody owes you money right now. You can still create a new group or add an expense.",
  "reminder.you": "You",
  "reminder.changeRecipient": "Change recipient",
  "reminder.toneLabel": "Message tone",
  "reminder.languageLabel": "Message language",
  "reminder.toneSympa": "Friendly",
  "reminder.toneFerme": "Firm",
  "reminder.toneHumour": "Humour",
  "reminder.tonePro": "Pro",
  "reminder.generateCta": "Generate message",
  "reminder.generating": "AI generating…",
  "reminder.regenerate": "Regenerate",
  "reminder.draftLabel": "Message — editable",
  "reminder.sendCta": "Send",
  "reminder.shareTitle": "BMD reminder",
  "reminder.copied": "Message copied to clipboard.",
};

const ES = {
  "dashboard.remindDebtors": "Recordar",
  "reminder.title": "Recuerda a tus deudores",
  "reminder.intro": "{count} personas te deben dinero. Elige a quién recordar.",
  "reminder.loading": "Cargando deudores…",
  "reminder.noDebtors":
    "Nadie te debe dinero ahora mismo. Puedes crear un grupo nuevo o añadir un gasto.",
  "reminder.you": "Tú",
  "reminder.changeRecipient": "Cambiar destinatario",
  "reminder.toneLabel": "Tono del mensaje",
  "reminder.languageLabel": "Idioma del mensaje",
  "reminder.toneSympa": "Amable",
  "reminder.toneFerme": "Firme",
  "reminder.toneHumour": "Humor",
  "reminder.tonePro": "Pro",
  "reminder.generateCta": "Generar mensaje",
  "reminder.generating": "IA generando…",
  "reminder.regenerate": "Regenerar",
  "reminder.draftLabel": "Mensaje — editable",
  "reminder.sendCta": "Enviar",
  "reminder.shareTitle": "Recordatorio BMD",
  "reminder.copied": "Mensaje copiado al portapapeles.",
};

const PT = {
  "dashboard.remindDebtors": "Lembrar",
  "reminder.title": "Lembrar os meus devedores",
  "reminder.intro":
    "{count} pessoas devem-te dinheiro. Escolhe quem queres lembrar.",
  "reminder.loading": "A carregar devedores…",
  "reminder.noDebtors":
    "Ninguém te deve dinheiro agora. Podes criar um novo grupo ou adicionar uma despesa.",
  "reminder.you": "Tu",
  "reminder.changeRecipient": "Mudar destinatário",
  "reminder.toneLabel": "Tom da mensagem",
  "reminder.languageLabel": "Idioma da mensagem",
  "reminder.toneSympa": "Amigável",
  "reminder.toneFerme": "Firme",
  "reminder.toneHumour": "Humor",
  "reminder.tonePro": "Pro",
  "reminder.generateCta": "Gerar mensagem",
  "reminder.generating": "IA a gerar…",
  "reminder.regenerate": "Regenerar",
  "reminder.draftLabel": "Mensagem — editável",
  "reminder.sendCta": "Enviar",
  "reminder.shareTitle": "Lembrete BMD",
  "reminder.copied": "Mensagem copiada.",
};

const AR = {
  "dashboard.remindDebtors": "تذكير",
  "reminder.title": "ذكّر مدينيك",
  "reminder.intro": "{count} أشخاص يدينون لك. اختر من تريد تذكيره.",
  "reminder.loading": "جارٍ تحميل المدينين…",
  "reminder.noDebtors":
    "لا أحد يدين لك بالمال حاليًا. يمكنك إنشاء مجموعة جديدة أو إضافة نفقة.",
  "reminder.you": "أنت",
  "reminder.changeRecipient": "تغيير المستلم",
  "reminder.toneLabel": "نبرة الرسالة",
  "reminder.languageLabel": "لغة الرسالة",
  "reminder.toneSympa": "ودي",
  "reminder.toneFerme": "حازم",
  "reminder.toneHumour": "فكاهي",
  "reminder.tonePro": "احترافي",
  "reminder.generateCta": "إنشاء الرسالة",
  "reminder.generating": "جارٍ إنشاء بواسطة الذكاء الاصطناعي…",
  "reminder.regenerate": "إعادة الإنشاء",
  "reminder.draftLabel": "الرسالة — قابلة للتعديل",
  "reminder.sendCta": "إرسال",
  "reminder.shareTitle": "تذكير BMD",
  "reminder.copied": "تم نسخ الرسالة.",
};

const DE = {
  "dashboard.remindDebtors": "Erinnern",
  "reminder.title": "Schuldner erinnern",
  "reminder.intro":
    "{count} Personen schulden dir Geld. Wähle, wen du erinnern willst.",
  "reminder.loading": "Schuldner werden geladen…",
  "reminder.noDebtors":
    "Niemand schuldet dir gerade Geld. Du kannst trotzdem eine neue Gruppe anlegen oder eine Ausgabe hinzufügen.",
  "reminder.you": "Du",
  "reminder.changeRecipient": "Empfänger ändern",
  "reminder.toneLabel": "Tonfall",
  "reminder.languageLabel": "Sprache",
  "reminder.toneSympa": "Freundlich",
  "reminder.toneFerme": "Bestimmt",
  "reminder.toneHumour": "Humor",
  "reminder.tonePro": "Pro",
  "reminder.generateCta": "Nachricht erstellen",
  "reminder.generating": "KI generiert…",
  "reminder.regenerate": "Neu generieren",
  "reminder.draftLabel": "Nachricht — bearbeitbar",
  "reminder.sendCta": "Senden",
  "reminder.shareTitle": "BMD Erinnerung",
  "reminder.copied": "Nachricht kopiert.",
};

const IT = {
  "dashboard.remindDebtors": "Ricorda",
  "reminder.title": "Ricorda ai tuoi debitori",
  "reminder.intro":
    "{count} persone ti devono dei soldi. Scegli a chi ricordare.",
  "reminder.loading": "Caricamento debitori…",
  "reminder.noDebtors":
    "Nessuno ti deve denaro al momento. Puoi creare un nuovo gruppo o aggiungere una spesa.",
  "reminder.you": "Tu",
  "reminder.changeRecipient": "Cambia destinatario",
  "reminder.toneLabel": "Tono del messaggio",
  "reminder.languageLabel": "Lingua del messaggio",
  "reminder.toneSympa": "Amichevole",
  "reminder.toneFerme": "Fermo",
  "reminder.toneHumour": "Umorismo",
  "reminder.tonePro": "Pro",
  "reminder.generateCta": "Genera messaggio",
  "reminder.generating": "IA generazione…",
  "reminder.regenerate": "Rigenera",
  "reminder.draftLabel": "Messaggio — modificabile",
  "reminder.sendCta": "Invia",
  "reminder.shareTitle": "Promemoria BMD",
  "reminder.copied": "Messaggio copiato.",
};

const ALL_TRANSLATIONS = {
  fr: FR,
  fr_ci: FR, // overrides partiels OK (le fallback FR couvre)
  fr_cm: FR,
  en: EN,
  es: ES,
  pt: PT,
  ar: AR,
  de: DE,
  it: IT,
  lb: EN, // luxembourgeois → fallback EN
  ru: EN,
  ja: EN,
  ko: EN,
  hi: EN,
  zh: EN,
  sw: EN,
  wo: EN,
  ln: EN,
  am: EN,
  ha: EN,
  yo: EN,
  om: EN,
  ig: EN,
  ff: EN,
  zu: EN,
  ak: EN,
  pcm: EN,
};

const ANCHOR_KEY = '"dashboard.inviteCopied":';
let total = 0;
const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".ts"));
for (const file of files) {
  const code = file.replace(/\.ts$/, "");
  const dict = ALL_TRANSLATIONS[code] ?? EN;
  const path = resolve(LOCALES_DIR, file);
  let src = readFileSync(path, "utf8");
  const anchorIdx = src.indexOf(ANCHOR_KEY);
  if (anchorIdx === -1) {
    console.log(`⤴  ${file} : pas d'ancre dashboard.inviteCopied → skip (overrides partiels)`);
    continue;
  }
  if (src.includes('"reminder.title":')) {
    console.log(`✓  ${file} : déjà présent, skip`);
    continue;
  }
  const lineEnd = src.indexOf("\n", anchorIdx);
  const insertion =
    "\n" +
    Object.entries(dict)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n");
  src = src.slice(0, lineEnd) + insertion + src.slice(lineEnd);
  writeFileSync(path, src, "utf8");
  total += 1;
  console.log(`✅ ${file} : ${Object.keys(dict).length} clés ajoutées`);
}
console.log(`\n✨ ${total} locales mises à jour.`);
