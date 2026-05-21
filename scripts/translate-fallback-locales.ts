/**
 * Sprint AC-4.4 — Re-traduction native des 22 locales fallback EN.
 *
 * Le script :
 *   1. Lit le catalog app-strings.ts
 *   2. Identifie les clés AC-2/AC-3 (tags `// ====== Sprint AC-`)
 *   3. Pour chaque locale (≠ fr/en/es), envoie ces clés à GPT-4o-mini avec
 *      un prompt qui décrit la cible (langue, registre BMD diaspora)
 *   4. Réécrit le bloc dans le catalog
 *
 * Usage :
 *   OPENAI_API_KEY=sk-... npx ts-node translate-fallback-locales.ts
 *
 * Coût : ~ 0,002 € par locale (≈ 90 clés × 22 locales = 0,04 €)
 *
 * Anti-régression : on ne touche PAS les clés natives (fr/en/es).
 *                   On ne touche PAS les locales déjà traduites par un humain
 *                   (heuristique : si la valeur EN est différente de la
 *                   traduction actuelle, c'est qu'un humain l'a déjà retouchée).
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Sprint AC-4 — Node ESM ne définit pas __dirname / __filename, on les
// reconstruit depuis import.meta.url. Compatible Node 18+.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Le script vit dans bmd-app/scripts/, le catalog dans
// bmd-app/apps/web/lib/i18n/app-strings.ts → on remonte d'un niveau.
const CATALOG = path.resolve(
  __dirname,
  "..",
  "apps/web/lib/i18n/app-strings.ts",
);

// Locales à traduire (toutes sauf les 3 piliers natifs)
const TARGET_LOCALES: Array<{ code: string; name: string }> = [
  { code: "pt", name: "portugais (PT/BR)" },
  { code: "ar", name: "arabe (Standard/MSA, RTL)" },
  { code: "sw", name: "swahili (Afrique de l'Est)" },
  { code: "wo", name: "wolof (Sénégal)" },
  { code: "ln", name: "lingala (Congo)" },
  { code: "am", name: "amharique (Éthiopie, Geez)" },
  { code: "de", name: "allemand" },
  { code: "it", name: "italien" },
  { code: "lb", name: "luxembourgeois" },
  { code: "ru", name: "russe (cyrillique)" },
  { code: "ja", name: "japonais" },
  { code: "ko", name: "coréen" },
  { code: "hi", name: "hindi (devanagari)" },
  { code: "zh", name: "chinois simplifié" },
  { code: "pcm", name: "pidgin nigerian (Naija)" },
  { code: "ha", name: "haoussa" },
  { code: "yo", name: "yoruba" },
  { code: "om", name: "oromo (afaan oromo)" },
  { code: "ig", name: "igbo" },
  { code: "ff", name: "fula (peul)" },
  { code: "zu", name: "zoulou" },
  { code: "ak", name: "akan (twi)" },
];

// Clés à retraduire (les AC-2 + AC-3 actuellement en fallback EN)
// On les liste explicitement pour ne pas accidentellement écraser des
// traductions humaines existantes sur d'autres clés.
const KEYS_TO_TRANSLATE = [
  // AC-2 multi-payeurs
  "expense.multipayers.title", "expense.multipayers.hint",
  "expense.multipayers.modeAmount", "expense.multipayers.modePercent",
  "expense.multipayers.you", "expense.multipayers.amountFor",
  "expense.multipayers.remove", "expense.multipayers.addPayer",
  "expense.multipayers.totalSummaryAmount", "expense.multipayers.totalSummaryPercent",
  "expense.multipayers.balanced", "expense.multipayers.tooMuch",
  "expense.multipayers.missing",
  // AC-2 meetings
  "meetings.title", "meetings.subtitle", "meetings.empty",
  "meetings.newButton", "meetings.uploadButton", "meetings.titleLabel",
  "meetings.titlePlaceholder", "meetings.dateLabel", "meetings.recordButton",
  "meetings.stopButton", "meetings.recordingNow", "meetings.processingPending",
  "meetings.processingTranscribing", "meetings.processingExtracting",
  "meetings.processingReview", "meetings.processingApplied",
  "meetings.processingFailed", "meetings.processingCancelled",
  "meetings.summaryLabel", "meetings.transcriptLabel",
  "meetings.decisionsLabel", "meetings.decisionsCount",
  "meetings.applyButton", "meetings.applyConfirm", "meetings.appliedToast",
  "meetings.cancelButton", "meetings.retryButton", "meetings.purgeAudioButton",
  "meetings.usageRemaining", "meetings.usageUnlimited",
  "meetings.addonNotice", "meetings.addonAccept", "meetings.quotaBlocked",
  "meetings.kind.expense", "meetings.kind.settlement",
  "meetings.kind.contribution", "meetings.kind.note",
  "meetings.removeDecision", "meetings.editDecision",
  // AC-2 audio proof
  "expense.audioProof.title", "expense.audioProof.button",
  "expense.audioProof.stopButton", "expense.audioProof.recording",
  "expense.audioProof.transcriptLabel", "expense.audioProof.transcribingNow",
  "expense.audioProof.permissionDenied",
  // AC-3 timer
  "meetings.preStartConfirm", "meetings.warnNearEnd",
  "meetings.autoStopReached", "meetings.tooLongDetected",
  // AC-3 edit decisions
  "meetings.editDescription", "meetings.editAmount", "meetings.editCurrency",
  "meetings.editPaidBy", "meetings.editParticipants",
  "meetings.editSplitMode", "meetings.editFromUser", "meetings.editToUser",
  "meetings.editContributor", "meetings.editPaymentMethod", "meetings.editNote",
  "meetings.editSave", "meetings.editCancel", "meetings.tontineSkipped",
  // AC-3 search
  "search.placeholder", "search.empty", "search.title", "search.results",
  "search.matchInTranscript", "search.matchInMeeting",
  "search.openExpense", "search.openMeeting",
  // AC-3 audio amount
  "expense.audioProof.suggestAmount", "expense.audioProof.useAmount",
  "expense.audioProof.dismissSuggestion",
  // AC-3 notif
  "meetings.notif.readyTitle", "meetings.notif.readyBody",
  // ===== Sprint AC-5 — espace client 100% i18n =====
  // Common
  "common.networkError", "common.verifyingLink", "common.homeLink",
  "common.connectingInProgress", "common.privacyPolicy",
  "common.ok", "common.submit", "common.saving", "common.sending",
  "common.confirming", "common.genericError", "common.deleteConfirm",
  // App
  "app.tagline", "app.discoverBmd",
  // Join
  "join.linkInvalidOrExpired", "join.linkInvalid", "join.successMessage",
  "join.generateNewLinkInstruction", "join.youAreInvited",
  "join.toJoinGroup", "join.joinGroupButton", "join.signInToJoinButton",
  // Auth
  "auth.googleStartError", "auth.appleStartError", "auth.userCancelled",
  "auth.noPasskey", "auth.passkeyError", "auth.invalidContact",
  "auth.registerError", "auth.orByCode", "auth.activateNowLabel",
  "auth.phone", "auth.email", "auth.qrError",
  // Profile
  "profile.cantSendCode", "profile.invalidCode",
  "profile.deleteContactConfirm", "profile.planBadge",
  "profile.displayName", "profile.displayNameExample",
  "profile.currencyHint", "profile.appLanguage",
  "profile.availableLanguages", "profile.staleVerification",
  "profile.notVerified", "profile.codesentInline", "profile.newContact",
  "profile.emailAddress", "profile.emailPlaceholder",
  "profile.phonePlaceholder", "profile.sendCodeButton",
  "profile.codeNote", "profile.sixDigitCode", "profile.security",
  "profile.signOutButton", "profile.deleteAccountNote",
  "profile.failureAlert", "profile.unknownDevice", "profile.deviceInfo",
  // Pay
  "pay.linkExpired", "pay.linkAlreadyUsed", "pay.confirmationTitle",
  "pay.linkUnavailable", "pay.regenerateLink", "pay.youOwe",
  "pay.instructions", "pay.step1", "pay.step2", "pay.step3",
  "pay.currentStatus", "pay.iPaid", "pay.alreadyConfirmed",
  "pay.thankYou", "pay.successMessage",
  // Form
  "form.minParticipant", "form.choosePayer", "form.noItemsNote",
  "form.itemMismatch", "form.selectParticipantsFirst",
  // Expense
  "expense.nothingToExport", "expense.exportedSuccess", "expense.deleted",
  "expense.addedOptimistic", "expense.updated", "expense.itemsSaveError",
  "expense.saved",
  // Group
  "group.contactPickerUnsupported", "group.noValidContact",
  "group.pickerError", "group.newPreset", "group.presetNamePrompt",
  "group.presetExample", "group.deletePresetConfirm",
  // Settings
  "settings.removeMemberConfirm", "settings.memberRemoved",
  "settings.typeNameToConfirm", "settings.breadcrumb",
  "settings.roleSubtitle", "settings.yourRole",
  "settings.inviteLinkNote", "settings.linksCreated",
  "settings.activeLinks", "settings.entriesLabel",
  "settings.usesLabel", "settings.usesLabelAlt",
  "settings.exhausted", "settings.expired", "settings.revoked",
  "settings.expiresLabel", "settings.expiredLabel",
  "settings.typeNameConfirmLabel", "settings.qrScannerTitle",
];

interface OpenAIChoice {
  message: { content: string };
}
interface OpenAIResp {
  choices: OpenAIChoice[];
}

/**
 * Sprint AC-4 — Les scripts non-latins (am, ar, hi, ja, ko, zh, ru) consomment
 * environ 2-3× plus de tokens par caractère qu'un texte latin. On bump donc
 * max_tokens à 8000 pour ces langues. Pour les langues latines (fr, en, es,
 * pt, de, it, etc.), 4000 reste largement suffisant et plus rapide.
 */
const NON_LATIN_LOCALES = new Set(["am", "ar", "hi", "ja", "ko", "zh", "ru"]);

async function translateBatch(
  source: Record<string, string>,
  toLangName: string,
  apiKey: string,
  localeCode: string,
): Promise<Record<string, string>> {
  const systemPrompt = `You are a professional translator for BMD, a fintech app for the African and Asian diaspora that handles tontines, group expenses, and meeting transcripts.

Translate from English to ${toLangName}.

STRICT rules:
- Preserve placeholders {sum}, {total}, {currency}, {count}, {minutes}, etc. EXACTLY as they appear.
- Preserve emojis as-is.
- "tontine", "Mobile Money", "BMD" stay as-is in all languages.
- Tone: warm, casual, banking-grade trust. Like talking to a friend who happens to be precise about money.
- Output ONLY a JSON object: {"key1": "translation1", ...}. No markdown, no explanations.`;

  const userContent = JSON.stringify(source);
  const maxTokens = NON_LATIN_LOCALES.has(localeCode) ? 8000 : 4000;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI HTTP ${resp.status}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as OpenAIResp;
  return JSON.parse(json.choices[0]?.message?.content ?? "{}") as Record<string, string>;
}

/**
 * Sprint AC-4 — Si translateBatch échoue (typiquement JSON tronqué pour
 * les scripts non-latins), on coupe le batch en deux moitiés et on retente.
 * Utile pour l'amharique, l'hindi, etc. Récursion bornée à 3 niveaux
 * (= max 8 sous-batchs).
 */
async function translateWithFallback(
  source: Record<string, string>,
  toLangName: string,
  apiKey: string,
  localeCode: string,
  depth = 0,
): Promise<Record<string, string>> {
  try {
    return await translateBatch(source, toLangName, apiKey, localeCode);
  } catch (err) {
    if (depth >= 3 || Object.keys(source).length <= 1) throw err;
    // Coupe en 2 sous-batchs et re-tente chacun
    const entries = Object.entries(source);
    const mid = Math.floor(entries.length / 2);
    const a = Object.fromEntries(entries.slice(0, mid));
    const b = Object.fromEntries(entries.slice(mid));
    console.log(
      `    ↪ retry split (${entries.length} → ${mid}+${entries.length - mid})`,
    );
    const [ra, rb] = await Promise.all([
      translateWithFallback(a, toLangName, apiKey, localeCode, depth + 1),
      translateWithFallback(b, toLangName, apiKey, localeCode, depth + 1),
    ]);
    return { ...ra, ...rb };
  }
}

function jsonStr(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * Sprint AC-5 · Extrait toutes les clés présentes dans un bloc locale
 * en parsant le texte (regex tolérant). On retourne aussi les valeurs
 * pour les clés présentes en FR (qui servent de référence des libellés
 * disponibles à traduire).
 */
function extractKeysFromBlock(blockText: string): Record<string, string> {
  const out: Record<string, string> = {};
  // "key.name": "value" — handle escaped quotes
  const RE = /"([a-zA-Z][\w.-]*)":\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(blockText)) !== null) {
    const key = m[1];
    const val = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    out[key] = val;
  }
  return out;
}

/**
 * Sprint AC-5 · Trouve le bloc d'une locale dans le catalog (start/end indices).
 * Ferme au prochain `\n  },` (= deux espaces, accolade fermante, virgule).
 */
function findLocaleBlock(
  src: string,
  loc: string,
): { start: number; end: number; insertAt: number } | null {
  const headerRe = new RegExp(`\\n  "?${loc}"?: \\{`);
  const headerMatch = headerRe.exec(src);
  if (!headerMatch) return null;
  const start = headerMatch.index + headerMatch[0].length;
  // Cherche la prochaine fermeture "  },"
  const closeRe = /\n  \},/g;
  closeRe.lastIndex = start;
  const closeMatch = closeRe.exec(src);
  if (!closeMatch) return null;
  return {
    start: headerMatch.index,
    end: closeMatch.index + closeMatch[0].length,
    insertAt: closeMatch.index, // juste avant le `\n  },`
  };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY missing");
    process.exit(1);
  }
  const src = await fs.readFile(CATALOG, "utf8");

  // Sprint AC-4 — Filtre par locale via --only=am ou --only=am,ar,hi
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlyCodes = onlyArg
    ? new Set(onlyArg.replace("--only=", "").split(",").map((s) => s.trim()))
    : null;
  // Sprint AC-5 — Mode --dry-run pour voir ce qu'il y aurait à traduire
  const DRY_RUN = process.argv.includes("--dry-run");
  const locales = onlyCodes
    ? TARGET_LOCALES.filter((l) => onlyCodes.has(l.code))
    : TARGET_LOCALES;
  if (onlyCodes) {
    console.log(`🎯 Mode --only : ${locales.length} locale(s) ciblée(s)`);
  }
  if (DRY_RUN) {
    console.log(`🔍 Mode --dry-run : pas d'appel OpenAI, juste un rapport`);
  }

  // ============================================================
  // Sprint AC-5 — AUTO-DÉTECTION : on récupère TOUTES les clés FR puis,
  // pour chaque locale, on calcule le diff (manquantes = à traduire).
  // ============================================================
  const frBlock = findLocaleBlock(src, "fr");
  if (!frBlock) throw new Error("FR block not found");
  const frKeys = extractKeysFromBlock(src.slice(frBlock.start, frBlock.end));
  console.log(`📦 ${Object.keys(frKeys).length} clés FR (référence).`);

  // Pareil pour EN (source de traduction)
  const enBlock = findLocaleBlock(src, "en");
  if (!enBlock) throw new Error("EN block not found");
  const enKeys = extractKeysFromBlock(src.slice(enBlock.start, enBlock.end));

  let updated = src;
  let totalAdded = 0;
  let totalReplaced = 0;

  for (const loc of locales) {
    const block = findLocaleBlock(updated, loc.code);
    if (!block) {
      console.warn(`  ⚠️  bloc ${loc.code} introuvable, skip`);
      continue;
    }
    const localeKeys = extractKeysFromBlock(
      updated.slice(block.start, block.end),
    );

    // Manquantes = présentes en FR mais pas dans cette locale
    const missing: Record<string, string> = {};
    for (const k of Object.keys(frKeys)) {
      if (!(k in localeKeys)) {
        // On envoie la valeur EN en source (qualité native disponible)
        missing[k] = enKeys[k] ?? frKeys[k];
      }
    }

    if (Object.keys(missing).length === 0) {
      console.log(`✅ ${loc.code.padEnd(7)} déjà à 100%, skip`);
      continue;
    }

    console.log(
      `🌐 ${loc.code.padEnd(7)} (${loc.name}) — ${Object.keys(missing).length} clé(s) à traduire…`,
    );

    if (DRY_RUN) {
      const sample = Object.keys(missing).slice(0, 5).join(", ");
      console.log(`     ex: ${sample}${Object.keys(missing).length > 5 ? "…" : ""}`);
      continue;
    }

    let translated: Record<string, string>;
    try {
      translated = await translateWithFallback(
        missing,
        loc.name,
        apiKey,
        loc.code,
      );
    } catch (err) {
      console.warn(`  ⚠️  skip ${loc.code} :`, (err as Error).message);
      continue;
    }

    // Insère les nouvelles clés à la fin du bloc (juste avant `\n  },`)
    const block2 = findLocaleBlock(updated, loc.code);
    if (!block2) continue;
    const newLines: string[] = [];
    let added = 0;
    for (const [key, val] of Object.entries(translated)) {
      if (typeof val !== "string") continue;
      newLines.push(`    "${key}": ${jsonStr(val)},`);
      added++;
    }
    if (newLines.length > 0) {
      const insertion =
        "\n    // ====== Sprint AC-5 (auto-traduction GPT) ======\n" +
        newLines.join("\n");
      updated =
        updated.slice(0, block2.insertAt) +
        insertion +
        updated.slice(block2.insertAt);
      totalAdded += added;
      console.log(`     ✓ ${added} clé(s) ajoutée(s) à ${loc.code}`);
    }

    // Petit sleep anti-rate-limit (3 RPS sur GPT-4o-mini)
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!DRY_RUN) {
    await fs.writeFile(CATALOG, updated);
    console.log(
      `\n✅ Catalog mis à jour : +${totalAdded} clés ajoutées, ${totalReplaced} remplacées.`,
    );
  } else {
    console.log(`\n🔍 Dry-run terminé. Re-lance sans --dry-run pour appliquer.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
