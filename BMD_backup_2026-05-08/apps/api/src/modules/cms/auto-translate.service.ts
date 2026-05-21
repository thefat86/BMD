/**
 * Auto-traduction IA pour les clés de traduction (spec §6.6).
 *
 * Stratégie : pour chaque clé absente dans `toLocale`, on prend la valeur
 * en `fromLocale` (par défaut "fr") et on la passe à GPT-4o-mini avec un
 * prompt système soigné qui :
 *  - traduit dans la langue cible
 *  - préserve les placeholders {name}, {amount}, etc.
 *  - garde la tonalité (sympa / formel / argot diaspora)
 *  - retourne UNIQUEMENT le texte traduit, sans explication
 *
 * Les traductions générées sont stockées avec `context="ia_draft"` pour que
 * un relecteur natif puisse les reviewer avant publication. Le frontend
 * peut filtrer sur ce flag pour afficher un badge ⚠ "Traduction IA non revue".
 *
 * Si OPENAI_API_KEY n'est pas configuré, throw — l'admin sait que la feature
 * exige cette config et ne pas spam le LLM par erreur.
 */
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { loadEnv } from "../../lib/env.js";

const LANGUAGE_NAMES: Record<string, string> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  pt: "portugais",
  ar: "arabe",
  zh: "chinois mandarin",
  sw: "swahili",
  wo: "wolof",
  am: "amharique",
  ln: "lingala",
  pcm: "nigerian pidgin",
};

export async function autoTranslateKeys(input: {
  fromLocale: string;
  toLocale: string;
  /** Si défini, on ne traduit que ces clés. Sinon : toutes celles qui manquent. */
  keys?: string[];
  actorUserId: string;
}): Promise<{
  translated: number;
  skipped: number;
  errors: Array<{ key: string; message: string }>;
}> {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY) {
    throw Errors.badRequest(
      "OPENAI_API_KEY non configuré côté serveur. Auto-traduction indisponible.",
    );
  }
  if (input.fromLocale === input.toLocale) {
    throw Errors.badRequest("La langue source et la langue cible sont identiques.");
  }

  // Déterminer les clés à traduire
  let keysToTranslate: string[];
  if (input.keys && input.keys.length > 0) {
    keysToTranslate = input.keys;
  } else {
    // Toutes les clés présentes en fromLocale ET manquantes en toLocale
    const fromKeys = await prisma.translation.findMany({
      where: { locale: input.fromLocale },
      select: { key: true },
    });
    const toKeys = await prisma.translation.findMany({
      where: { locale: input.toLocale },
      select: { key: true },
    });
    const toKeySet = new Set(toKeys.map((t) => t.key));
    keysToTranslate = fromKeys
      .map((t) => t.key)
      .filter((k) => !toKeySet.has(k));
  }

  if (keysToTranslate.length === 0) {
    return { translated: 0, skipped: 0, errors: [] };
  }
  // Limite hard pour éviter un appel monstre — 200 clés max par run
  if (keysToTranslate.length > 200) {
    keysToTranslate = keysToTranslate.slice(0, 200);
  }

  // Récupère les valeurs source
  const sources = await prisma.translation.findMany({
    where: {
      locale: input.fromLocale,
      key: { in: keysToTranslate },
    },
    select: { key: true, value: true },
  });

  const targetLangName =
    LANGUAGE_NAMES[input.toLocale] ?? input.toLocale;
  const sourceLangName =
    LANGUAGE_NAMES[input.fromLocale] ?? input.fromLocale;

  let translated = 0;
  let skipped = 0;
  const errors: Array<{ key: string; message: string }> = [];

  // Batch par 20 clés par appel pour limiter latence + coût
  const BATCH_SIZE = 20;
  for (let i = 0; i < sources.length; i += BATCH_SIZE) {
    const batch = sources.slice(i, i + BATCH_SIZE);
    try {
      const translations = await translateBatch(
        batch,
        sourceLangName,
        targetLangName,
        env.OPENAI_API_KEY,
      );
      for (const item of batch) {
        const tr = translations[item.key];
        if (!tr) {
          skipped++;
          continue;
        }
        await prisma.translation.upsert({
          where: {
            key_locale: { key: item.key, locale: input.toLocale },
          },
          create: {
            key: item.key,
            locale: input.toLocale,
            value: tr,
            context: "ia_draft",
            updatedById: input.actorUserId,
          },
          update: {
            value: tr,
            context: "ia_draft",
            updatedById: input.actorUserId,
          },
        });
        translated++;
      }
    } catch (e) {
      // On marque toutes les clés du batch en erreur mais on continue
      for (const item of batch) {
        errors.push({
          key: item.key,
          message: (e as Error).message,
        });
      }
    }
  }

  return { translated, skipped, errors };
}

/**
 * Traduit un batch de clés en un seul appel LLM. Retourne un dict { key: traduction }.
 * Format de prompt : on envoie un tableau JSON et on demande un tableau JSON en retour
 * pour minimiser les tokens et faciliter le parsing.
 */
async function translateBatch(
  batch: Array<{ key: string; value: string }>,
  fromLang: string,
  toLang: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const systemPrompt = `Tu es un traducteur professionnel pour BMD, une app de gestion de tontines, voyages et dépenses partagées pour la diaspora afro-asiatique.

Tu traduis du ${fromLang} vers le ${toLang}.

Règles strictes :
- Garde EXACTEMENT les placeholders : {name}, {amount}, {date}, etc. Ne les traduis pas.
- Garde le même registre (sympa, formel, banking-grade selon le contenu).
- Garde les emojis tels quels.
- Pour les termes financiers diaspora : "tontine" reste "tontine" en toutes langues. "Mobile Money" reste tel quel.
- Réponds UNIQUEMENT en JSON sans markdown : {"key1": "traduction1", "key2": "traduction2"}.`;

  const userContent = JSON.stringify(
    Object.fromEntries(batch.map((b) => [b.key, b.value])),
  );

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
      max_tokens: Math.min(4000, batch.length * 200),
    }),
  });
  if (!resp.ok) {
    throw new Error(
      `OpenAI HTTP ${resp.status}: ${await resp.text().catch(() => "")}`,
    );
  }
  const json = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = json.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("Parse JSON failed");
  }
  // Sanitize : ne garde que les valeurs string
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" && v.trim().length > 0) {
      result[k] = v.trim().slice(0, 2000);
    }
  }
  return result;
}
