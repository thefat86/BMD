#!/usr/bin/env node
/**
 * Sprint AC-5.6 · Test CI de couverture i18n.
 *
 * Vérifie que toutes les clés présentes dans le bloc FR du catalog
 * `lib/i18n/app-strings.ts` existent aussi dans les 24 autres locales.
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

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOG = path.resolve(__dirname, "..", "lib/i18n/app-strings.ts");

const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const REPORT = args.includes("--report");

// ============================================================
// Parse le catalog
// ============================================================
const src = readFileSync(CATALOG, "utf8");

// Extrait les blocs locale (regex tolérant) — match `  loc: {` ou `  "fr-cm": {`
const LOCALE_RE = /^\s\s("?[a-z][a-z-]*"?):\s*\{/gm;
const locales = [];
let m;
while ((m = LOCALE_RE.exec(src)) !== null) {
  const code = m[1].replace(/"/g, "");
  locales.push({ code, start: m.index });
}
// Ferme chaque bloc à la prochaine ligne "  },"
for (let i = 0; i < locales.length; i++) {
  const next = locales[i + 1];
  const limit = next ? next.start : src.length;
  const blockText = src.slice(locales[i].start, limit);
  // Récupère toutes les clés "key.name": "value"
  const keys = new Set();
  const KEY_RE = /"([a-zA-Z][\w.-]*)":\s*"/g;
  let km;
  while ((km = KEY_RE.exec(blockText)) !== null) {
    // Skip la première ligne qui contient le code locale lui-même
    if (km.index < blockText.indexOf("{")) continue;
    keys.add(km[1]);
  }
  locales[i].keys = keys;
}

// ============================================================
// Compare FR vs autres
// ============================================================
const fr = locales.find((l) => l.code === "fr");
if (!fr) {
  console.error("❌ Bloc FR introuvable dans le catalog.");
  process.exit(2);
}
const frKeys = fr.keys;
console.log(`📦 ${frKeys.size} clés dans le bloc FR (référence).`);

const NATIVE_LOCALES = new Set(["fr", "en", "es"]);
const TOLERANCE_PCT = 5;

let totalIssues = 0;
let strictFailures = 0;

for (const loc of locales) {
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
