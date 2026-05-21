#!/usr/bin/env node
// V62 — Clés i18n du Quick Add chooser (hero + 3e card manuel + attachment).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(__dirname, "..", "lib/i18n/locales");

const FR = {
  "quickAdd.heroTitle": "Crée ta dépense",
  "quickAdd.manualCardTitle": "Saisie manuelle",
  "quickAdd.manualCardBody": "Tape les infos ou attache un PDF de justificatif",
  "quickAdd.attachment": "Justificatif (optionnel)",
  "quickAdd.attachCta": "Joindre un PDF ou une image",
  "common.remove": "Retirer",
};
const EN = {
  "quickAdd.heroTitle": "Create your expense",
  "quickAdd.manualCardTitle": "Manual entry",
  "quickAdd.manualCardBody": "Type the details or attach a PDF receipt",
  "quickAdd.attachment": "Receipt (optional)",
  "quickAdd.attachCta": "Attach a PDF or image",
  "common.remove": "Remove",
};
const ES = {
  "quickAdd.heroTitle": "Crea tu gasto",
  "quickAdd.manualCardTitle": "Entrada manual",
  "quickAdd.manualCardBody": "Escribe los detalles o adjunta un PDF",
  "quickAdd.attachment": "Justificante (opcional)",
  "quickAdd.attachCta": "Adjuntar un PDF o imagen",
  "common.remove": "Quitar",
};
const PT = {
  "quickAdd.heroTitle": "Cria a tua despesa",
  "quickAdd.manualCardTitle": "Inserção manual",
  "quickAdd.manualCardBody": "Escreve os detalhes ou anexa um PDF",
  "quickAdd.attachment": "Comprovativo (opcional)",
  "quickAdd.attachCta": "Anexar PDF ou imagem",
  "common.remove": "Remover",
};
const AR = {
  "quickAdd.heroTitle": "أنشئ نفقتك",
  "quickAdd.manualCardTitle": "إدخال يدوي",
  "quickAdd.manualCardBody": "اكتب التفاصيل أو أرفق PDF كإيصال",
  "quickAdd.attachment": "إيصال (اختياري)",
  "quickAdd.attachCta": "إرفاق PDF أو صورة",
  "common.remove": "إزالة",
};
const DE = {
  "quickAdd.heroTitle": "Erstelle deine Ausgabe",
  "quickAdd.manualCardTitle": "Manuelle Eingabe",
  "quickAdd.manualCardBody":
    "Tippe die Details ein oder hänge ein PDF als Beleg an",
  "quickAdd.attachment": "Beleg (optional)",
  "quickAdd.attachCta": "PDF oder Bild anhängen",
  "common.remove": "Entfernen",
};
const IT = {
  "quickAdd.heroTitle": "Crea la tua spesa",
  "quickAdd.manualCardTitle": "Inserimento manuale",
  "quickAdd.manualCardBody": "Digita i dettagli o allega un PDF",
  "quickAdd.attachment": "Ricevuta (opzionale)",
  "quickAdd.attachCta": "Allega un PDF o un'immagine",
  "common.remove": "Rimuovi",
};

const ALL = {
  fr: FR,
  fr_ci: FR,
  fr_cm: FR,
  en: EN,
  es: ES,
  pt: PT,
  ar: AR,
  de: DE,
  it: IT,
  lb: EN,
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

const ANCHOR = '"quickAdd.title":';
let total = 0;
for (const file of readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".ts"))) {
  const code = file.replace(/\.ts$/, "");
  const dict = ALL[code] ?? EN;
  const path = resolve(LOCALES_DIR, file);
  let src = readFileSync(path, "utf8");
  const idx = src.indexOf(ANCHOR);
  if (idx === -1) {
    console.log(`⤴  ${file} : ancre absente → skip`);
    continue;
  }
  if (src.includes('"quickAdd.heroTitle":')) {
    console.log(`✓  ${file} : déjà présent`);
    continue;
  }
  const lineEnd = src.indexOf("\n", idx);
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
