#!/usr/bin/env node
/**
 * V210.E — Dédoublonnage des clés ajoutées en double par v210-hub-i18n.mjs.
 *
 * Le premier script utilisait re.test() avec un regex global, ce qui peut
 * donner des faux négatifs à cause du lastIndex. Résultat : certaines clés
 * `group.type.*` qui existaient déjà ont été insérées en double.
 *
 * Ce script parcourt fr/en/fr_ci/fr_cm.ts, détecte les clés en doublon
 * (au sens `"key": "..."`) et ne garde que la DERNIÈRE occurrence (= la
 * version V210 fraîchement traduite).
 *
 * Usage : node scripts/v210-hub-i18n-dedupe.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "lib", "i18n", "locales");

function dedupe(file) {
  const path = join(LOCALES_DIR, `${file}.ts`);
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");

  // Compte des occurrences de chaque clé
  const counts = {};
  const keyRe = /^\s+"([^"]+)":\s*/;
  for (const line of lines) {
    const m = line.match(keyRe);
    if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
  }

  const dup = Object.keys(counts).filter((k) => counts[k] > 1);
  if (dup.length === 0) {
    console.log(`  · ${file}.ts (rien à dédoublonner)`);
    return 0;
  }

  // On supprime toutes les occurrences SAUF la dernière de chaque clé en
  // doublon. On itère depuis la fin, on conserve la première rencontre
  // (qui sera la dernière en ordre fichier).
  const seen = new Set();
  const keptReversed = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const m = line.match(keyRe);
    if (m && dup.includes(m[1])) {
      if (seen.has(m[1])) continue; // skip duplicate
      seen.add(m[1]);
    }
    keptReversed.push(line);
  }
  const newContent = keptReversed.reverse().join("\n");
  writeFileSync(path, newContent, "utf8");
  console.log(`  ✓ ${file}.ts (${dup.length} clés dédoublonnées)`);
  return dup.length;
}

console.log("🧹 V210.E — Dédoublonnage clés i18n hub (toutes locales)\n");
let total = 0;
// V210 — on étend le dédoublonnage à toutes les locales pour réparer
// aussi les doublons préexistants de V204.B (TS1117 strict mode).
const ALL = [
  "fr", "fr_ci", "fr_cm", "en", "ak", "am", "ar", "de", "es", "ff",
  "ha", "hi", "ig", "it", "ja", "ko", "lb", "ln", "om", "pcm",
  "pt", "ru", "sw", "wo", "yo", "zh", "zu",
];
for (const f of ALL) {
  total += dedupe(f);
}
console.log(`\n✅ ${total} doublons supprimés au total.`);
