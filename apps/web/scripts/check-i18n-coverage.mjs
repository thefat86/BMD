#!/usr/bin/env node
/**
 * Sprint AC-5.6 · Test CI de couverture i18n.
 *
 * V53.A1 — Mis à jour pour le code-splitting i18n : on lit maintenant les
 * fichiers `lib/i18n/locales/*.ts` (un par locale) au lieu d'un fichier
 * monolithique `app-strings.ts`. La logique de comparaison reste la même :
 * la locale FR sert de référence, on vérifie que toutes les autres ont
 * AU MINIMUM toutes les clés FR.
 *
 * Sort en code 1 si manquant ⇒ fail le CI.
 *
 * Usage :
 *   node scripts/check-i18n-coverage.mjs
 *   node scripts/check-i18n-coverage.mjs --strict   (zéro tolérance)
 *   node scripts/check-i18n-coverage.mjs --report   (affiche détail manquants)
 *
 * Sans flag : tolère que les locales fallback (autres que fr/en/es) aient
 * jusqu'à 5% de clés manquantes (rapport informatif).
 */

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCALES_DIR = path.resolve(__dirname, "..", "lib/i18n/locales");

const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const REPORT = args.includes("--report");

// ============================================================
// Parse les fichiers locales/{code}.ts
// ============================================================
function readLocaleFile(filePath) {
  const src = readFileSync(filePath, "utf8");
  // Récupère toutes les clés "key.name": "value"
  const keys = new Set();
  const KEY_RE = /"([a-zA-Z][\w.-]*)":\s*"/g;
  let km;
  while ((km = KEY_RE.exec(src)) !== null) {
    keys.add(km[1]);
  }
  return keys;
}

function fileNameToLocaleCode(name) {
  // fr_cm.ts → fr-cm ; en.ts → en
  return name.replace(/\.ts$/, "").replace("_", "-");
}

const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".ts"));
const locales = files.map((f) => ({
  code: fileNameToLocaleCode(f),
  keys: readLocaleFile(path.join(LOCALES_DIR, f)),
}));

// ============================================================
// Compare FR vs autres
// ============================================================
const fr = locales.find((l) => l.code === "fr");
if (!fr) {
  console.error("❌ Bloc FR introuvable dans lib/i18n/locales/fr.ts.");
  process.exit(2);
}
const frKeys = fr.keys;
console.log(`📦 ${frKeys.size} clés dans le bloc FR (référence).`);

const NATIVE_LOCALES = new Set(["fr", "en", "es"]);
const TOLERANCE_PCT = 5;

let totalIssues = 0;
let strictFailures = 0;

// Tri pour avoir un ordre stable
const sorted = [...locales].sort((a, b) => a.code.localeCompare(b.code));

for (const loc of sorted) {
  if (loc.code === "fr") continue;
  // Sprint AC-5 · skip les variantes (fr-cm, fr-ci) — elles héritent de FR
  // par fallback dans useT(). On ne déclare que les clés culturellement
  // spécifiques (greeting, etc.).
  if (loc.code.includes("-")) continue;
  const missing = [];
  for (const key of frKeys) {
    if (!loc.keys.has(key)) missing.push(key);
  }
  const missingPct = (missing.length / frKeys.size) * 100;
  const isNative = NATIVE_LOCALES.has(loc.code);
  // Strict si --strict OU si c'est une locale native (fr/en/es)
  const mustBeFull = STRICT || isNative;
  const status =
    missing.length === 0
      ? "✅"
      : mustBeFull || missingPct > TOLERANCE_PCT
        ? "❌"
        : "⚠️ ";
  console.log(
    `${status} ${loc.code.padEnd(7)} ${loc.keys.size}/${frKeys.size} (${missing.length} manquant${missing.length !== 1 ? "s" : ""}, ${missingPct.toFixed(1)}%)`,
  );
  if (REPORT && missing.length > 0 && missing.length <= 20) {
    for (const k of missing) console.log(`     · ${k}`);
  } else if (REPORT && missing.length > 20) {
    for (const k of missing.slice(0, 20)) console.log(`     · ${k}`);
    console.log(`     · … et ${missing.length - 20} de plus`);
  }
  totalIssues += missing.length;
  if (mustBeFull && missing.length > 0) strictFailures++;
}

console.log(`\n📊 Total : ${totalIssues} clés manquantes sur l'ensemble des locales.`);
if (strictFailures > 0) {
  console.error(
    `\n❌ ${strictFailures} locale(s) sous le seuil — CI doit fail.`,
  );
  if (!REPORT) {
    console.error(
      `   Relance avec --report pour voir le détail des clés manquantes.`,
    );
  }
  process.exit(1);
}
console.log("\n✅ Toutes les locales sous le seuil (ou tolérées).");
process.exit(0);
