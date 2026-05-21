#!/usr/bin/env node
/**
 * Sprint AC-5.5 · Audit anti-strings FR hardcodées dans l'espace client.
 *
 * Scanne tous les `.tsx` sous `app/` et `lib/ui/` SAUF :
 *   - app/admin/** (console admin — peut rester en FR)
 *   - lib/ui/admin-*.tsx (composants admin)
 *   - lib/i18n/app-strings.ts (le catalog lui-même !)
 *   - commentaires (// et /* * /)
 *   - chaînes dans console.* (logs dev)
 *
 * Détecte les literals contenant des accents FR évidents (à é è ê ï ô û ç œ)
 * dans des contextes UI : JSX text nodes, placeholder, aria-label, title,
 * toast.*, dialog.*, setError, throw new Error.
 *
 * Usage :
 *   node scripts/check-no-fr-strings.mjs            (rapport, exit 0)
 *   node scripts/check-no-fr-strings.mjs --strict   (fail si > 0 occurrence)
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const STRICT = process.argv.includes("--strict");

const SCAN_DIRS = ["app", "lib/ui"];
const SKIP_PATTERNS = [
  /\/admin\//,
  /\/admin-[^/]+\.tsx$/,
  /\/i18n\/app-strings\.ts$/,
  /\/cms\//, // CMS marketing — déjà multilingue via DB
];

// Patterns suspects : literals FR dans des contextes UI clairs.
// On garde une heuristique simple — pas un parser AST complet.
const FR_CHARS_RE = /[àáâäãéèêëíìîïóòôöõúùûüçñœÀÁÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑŒ]/;
// Patterns à flagger
const SUSPECT_PATTERNS = [
  // toast.success("Texte avec accent")
  /\b(toast\.(success|error|warning|info)|dialog\.(confirm|prompt|alert)|setError|throw new Errors\.[a-zA-Z]+)\(\s*[`"']([^`"']*[àéèêëíìîïóòôöõúùûüçñœ][^`"']*)/g,
  // placeholder="..." aria-label="..." title="..."
  /\b(placeholder|aria-label|title|label)=["`']([^"`']*[àéèêëíìîïóòôöõúùûüçñœ][^"`']*)/g,
  // JSX text nodes : >Texte avec accent< (au moins 4 caractères)
  />[ \n\t]*([A-Z][A-Za-zàéèêëíìîïóòôöõúùûüçñœ\s,'.!?:;()-]{3,}[àéèêëíìîïóòôöõúùûüçñœ][A-Za-zàéèêëíìîïóòôöõúùûüçñœ\s,'.!?:;()-]*)[ \n\t]*</g,
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      yield* walk(p);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      yield p;
    }
  }
}

function isInComment(line) {
  return /^\s*(\/\/|\/\*|\*)/.test(line);
}

function isInConsole(line) {
  return /\bconsole\.(log|warn|error|info|debug)\(/.test(line);
}

function isInTransSafe(line) {
  // Si la ligne contient déjà t("..."), on assume que la string FR adjacente
  // est dans un t() — on ne flag pas
  return /\bt\(\s*["'][\w.]+["']/.test(line);
}

let totalIssues = 0;
const filesWithIssues = new Map();

for (const dirName of SCAN_DIRS) {
  const dirPath = path.join(ROOT, dirName);
  for (const file of walk(dirPath)) {
    const rel = path.relative(ROOT, file);
    if (SKIP_PATTERNS.some((re) => re.test(rel))) continue;
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    const fileIssues = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isInComment(line)) continue;
      if (isInConsole(line)) continue;
      if (!FR_CHARS_RE.test(line)) continue;
      // Skip si la ligne est déjà une chaîne dans un t() call
      if (isInTransSafe(line)) continue;

      // Skip si la ligne est dans le bloc i18n catalog (objet 'fr:', 'en:', etc.)
      if (/^\s*"[a-z][\w.-]*":\s*/.test(line)) continue;

      // Cherche tous les patterns suspects
      for (const re of SUSPECT_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          const text = (m[3] || m[2] || m[1] || "").trim();
          if (text.length < 3) continue;
          if (text.startsWith("$") || text.startsWith("{")) continue; // template literal var
          fileIssues.push({ line: i + 1, text: text.slice(0, 80) });
        }
      }
    }

    if (fileIssues.length > 0) {
      filesWithIssues.set(rel, fileIssues);
      totalIssues += fileIssues.length;
    }
  }
}

console.log(`📊 Audit anti-strings FR hardcodées (espace client)\n`);
if (filesWithIssues.size === 0) {
  console.log("✅ Aucun string FR hardcodée détecté. 🎉");
  process.exit(0);
}

const sorted = [...filesWithIssues.entries()].sort(
  (a, b) => b[1].length - a[1].length,
);
for (const [file, issues] of sorted.slice(0, 20)) {
  console.log(`📄 ${file} (${issues.length})`);
  for (const { line, text } of issues.slice(0, 5)) {
    console.log(`   L${line} : ${text}`);
  }
  if (issues.length > 5) console.log(`   … et ${issues.length - 5} de plus`);
}
if (sorted.length > 20) {
  console.log(`\n… et ${sorted.length - 20} fichiers de plus.`);
}
console.log(
  `\n📊 Total : ${totalIssues} occurrence(s) dans ${filesWithIssues.size} fichier(s).`,
);
console.log(
  `\nℹ️  Les commentaires et console.* sont ignorés. Faux positifs possibles dans les attribut JSX complexes.`,
);

if (STRICT && totalIssues > 0) {
  console.error(`\n❌ Mode --strict : fail le CI.`);
  process.exit(1);
}
process.exit(0);
