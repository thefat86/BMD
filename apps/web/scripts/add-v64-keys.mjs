#!/usr/bin/env node
// V64 — Clés i18n du radial orbital menu (hint + 3 CTA).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(__dirname, "..", "lib/i18n/locales");

const FR = {
  "quickAdd.orbHint": "Touche un satellite pour choisir",
  "quickAdd.scanCta": "Ouvrir la caméra",
  "quickAdd.voiceCta": "Activer le micro",
  "quickAdd.manualCta": "Commencer",
  "common.close": "Fermer",
};
const EN = {
  "quickAdd.orbHint": "Tap a satellite to choose",
  "quickAdd.scanCta": "Open camera",
  "quickAdd.voiceCta": "Start mic",
  "quickAdd.manualCta": "Start",
  "common.close": "Close",
};
const ES = {
  "quickAdd.orbHint": "Toca un satélite para elegir",
  "quickAdd.scanCta": "Abrir cámara",
  "quickAdd.voiceCta": "Activar micrófono",
  "quickAdd.manualCta": "Empezar",
  "common.close": "Cerrar",
};
const PT = {
  "quickAdd.orbHint": "Toca num satélite para escolher",
  "quickAdd.scanCta": "Abrir câmara",
  "quickAdd.voiceCta": "Ativar microfone",
  "quickAdd.manualCta": "Começar",
  "common.close": "Fechar",
};
const AR = {
  "quickAdd.orbHint": "اضغط على قمر صناعي للاختيار",
  "quickAdd.scanCta": "فتح الكاميرا",
  "quickAdd.voiceCta": "تفعيل الميكروفون",
  "quickAdd.manualCta": "ابدأ",
  "common.close": "إغلاق",
};
const DE = {
  "quickAdd.orbHint": "Tippe einen Satelliten zum Auswählen",
  "quickAdd.scanCta": "Kamera öffnen",
  "quickAdd.voiceCta": "Mikrofon starten",
  "quickAdd.manualCta": "Starten",
  "common.close": "Schließen",
};
const IT = {
  "quickAdd.orbHint": "Tocca un satellite per scegliere",
  "quickAdd.scanCta": "Apri fotocamera",
  "quickAdd.voiceCta": "Attiva microfono",
  "quickAdd.manualCta": "Inizia",
  "common.close": "Chiudi",
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

const ANCHOR = '"quickAdd.heroTitle":';
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
  if (src.includes('"quickAdd.orbHint":')) {
    console.log(`✓  ${file} : déjà présent`);
    continue;
  }
  // Skip les clés "common.close" déjà présentes (anti-doublon)
  const filteredDict = { ...dict };
  if (src.includes('"common.close":')) {
    delete filteredDict["common.close"];
  }
  const lineEnd = src.indexOf("\n", idx);
  const insertion =
    "\n" +
    Object.entries(filteredDict)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n");
  src = src.slice(0, lineEnd) + insertion + src.slice(lineEnd);
  writeFileSync(path, src, "utf8");
  total += 1;
  console.log(`✅ ${file} : ${Object.keys(filteredDict).length} clés ajoutées`);
}
console.log(`\n✨ ${total} locales mises à jour.`);
