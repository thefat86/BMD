/**
 * AI service · Parsing en langage naturel d'une dépense (spec §3.8).
 *
 * Reçoit un texte libre comme « ajoute 25 € resto avec Karim et Linda »
 * et retourne un objet structuré { description, amount, currency,
 * participantsHints, category } prêt à pré-remplir le formulaire de
 * dépense côté frontend.
 *
 * Stratégies (par priorité décroissante) :
 *  1. Si OPENAI_API_KEY défini → appel GPT-4o-mini avec function calling
 *  2. Sinon → fallback heuristique regex / mots-clés (works offline,
 *     limité mais utilisable). Suffit pour les 70% de cas simples FR/EN.
 *
 * Le résultat n'est jamais persisté ici — c'est juste un parseur stateless.
 * Le frontend décide quoi en faire (préremplir + laisser l'utilisateur valider).
 */
import { loadEnv } from "../../lib/env.js";
// V83 · Source unique des 6 catégories canoniques BMD + helper de
// normalisation tolérant. Avant V83 cette liste était dupliquée ici
// (CATEGORIES + CATEGORY_KEYWORDS) et risquait de diverger du parser OCR.
import {
  EXPENSE_CATEGORY_KEYWORDS,
  EXPENSE_CATEGORY_VALUES,
  normalizeExpenseCategory,
  type ExpenseCategoryValue,
} from "@bmd/shared-types";

export interface ParsedExpense {
  description: string;
  amount: number | null;
  currency: string | null;
  /**
   * Indices de participants — noms ou prénoms cités dans le texte.
   * Le frontend tente de les matcher avec les membres du groupe.
   */
  participantsHints: string[];
  /** V83 · Catégorie canonique BMD (`ExpenseCategoryValue`) ou null. */
  category: ExpenseCategoryValue | null;
  /** Score de confiance 0-1 — utile pour décider d'afficher un avertissement. */
  confidence: number;
  /** Source du parsing : "llm" ou "heuristic". */
  source: "llm" | "heuristic";

  // ====== Sprint AC · enrichissement avec contexte de groupe ======
  /** UserId résolu du payeur (matché contre les membres du groupe). null = ambigu */
  paidByUserId?: string | null;
  /** UserIds résolus des participants (matchés). Si vide → utiliser tout le groupe. */
  participantIds?: string[];
  /** Mode de partage détecté */
  splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED" | null;
  /** Si UNEQUAL/PERCENTAGE : map userId → part (montant ou %). */
  shares?: Record<string, number>;
  /**
   * Sprint AC-3 · Multi-payeurs détectés en langage naturel.
   * Exemple : "Karim a mis 30, Linda 50, et moi 20" →
   *   payers: [{userId:Karim, amount:30}, {userId:Linda, amount:50}, {userId:Me, amount:20}]
   * Si l'utilisateur a parlé en pourcentage ("Karim 60%, Linda 40%"), on
   * remplit `percent` au lieu de `amount`. Mutuellement exclusif.
   */
  payers?: Array<{ userId: string; amount?: number; percent?: number }>;
}

/**
 * Membre du groupe passé en contexte au LLM. Le LLM reçoit cette liste
 * et tente de matcher chaque hint textuel ("Karim", "Aïcha") avec un id.
 */
export interface GroupMemberContext {
  id: string;
  displayName: string;
  /** True si c'est l'utilisateur courant (le "je" du speaker) */
  isMe?: boolean;
}

// V83 · Les 6 catégories canoniques + leurs keywords viennent désormais
// de @bmd/shared-types (EXPENSE_CATEGORY_VALUES / EXPENSE_CATEGORY_KEYWORDS).
// Le LLM est instruit pour répondre dans cette liste, et le fallback
// heuristique itère dessus aussi pour rester cohérent.

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR",
  "$": "USD",
  "£": "GBP",
  "₣": "XAF",
  "FCFA": "XAF",
  "CFA": "XAF",
  "CHF": "CHF",
  "₦": "NGN",
  "Naira": "NGN",
  "₹": "INR",
  "¥": "CNY",
  "Ksh": "KES",
};

/**
 * Fallback heuristique — extrait montant + devise + participants depuis
 * un texte FR/EN simple. Marche pour ~70% des cas (« ajoute 25€ resto
 * avec Karim et Linda », « 12 USD courses Pierre »).
 */
export function parseExpenseHeuristic(text: string): ParsedExpense {
  const lower = text.toLowerCase();

  // 1. Montant + devise
  let amount: number | null = null;
  let currency: string | null = null;
  // Cherche un nombre suivi (ou précédé) d'un symbole/code monnaie
  const moneyMatch =
    text.match(/(\d+[.,]?\d*)\s*(€|euros?|eur|\$|usd|£|gbp|cfa|fcfa|chf|₦|naira|ngn|ksh|kes|¥|cny)/i) ||
    text.match(/(€|\$|£|cfa|fcfa)\s*(\d+[.,]?\d*)/i);

  if (moneyMatch) {
    const numStr = moneyMatch[1].includes(",") ? moneyMatch[1].replace(",", ".") : moneyMatch[1];
    const num = parseFloat(numStr);
    if (!isNaN(num)) amount = num;
    const symbolRaw = (moneyMatch[2] || moneyMatch[1] || "").toUpperCase();
    // Si le symbol était capturé en groupe 1 (cas "€ 25"), inverser
    const sym = isNaN(parseFloat(moneyMatch[1])) ? moneyMatch[1] : moneyMatch[2];
    currency = CURRENCY_SYMBOLS[sym] ?? CURRENCY_SYMBOLS[sym?.toUpperCase() ?? ""] ?? null;
    if (!currency && symbolRaw) {
      currency =
        Object.entries(CURRENCY_SYMBOLS).find(
          ([k]) => k.toUpperCase() === symbolRaw,
        )?.[1] ?? null;
    }
  } else {
    // Cherche juste un nombre isolé
    const numMatch = text.match(/\b(\d+[.,]?\d*)\b/);
    if (numMatch) {
      const numStr = numMatch[1].includes(",") ? numMatch[1].replace(",", ".") : numMatch[1];
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0) amount = num;
    }
  }

  // 2. Catégorie — V83 : itère sur les 6 valeurs canoniques shared.
  // On ignore "autres" (pas de keywords positifs, c'est le fallback UI).
  let category: ExpenseCategoryValue | null = null;
  for (const cat of EXPENSE_CATEGORY_VALUES) {
    if (cat === "autres") continue;
    const kws = EXPENSE_CATEGORY_KEYWORDS[cat];
    if (kws.some((k) => lower.includes(k))) {
      category = cat;
      break;
    }
  }

  // 3. Participants (après "avec" / "with" en FR/EN)
  const participantsHints: string[] = [];
  const withMatch = text.match(/\bavec\s+(.+?)(?:[.,;!?]|$)/i) ||
    text.match(/\bwith\s+(.+?)(?:[.,;!?]|$)/i);
  if (withMatch) {
    const segment = withMatch[1];
    // Découpe sur "et", "and", virgules
    const parts = segment
      .split(/\s*(?:,|\bet\b|\band\b|&)\s*/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 40);
    participantsHints.push(...parts);
  }

  // 4. Description = texte sans le montant ni "avec X et Y"
  let description = text
    .replace(/\d+[.,]?\d*\s*(?:€|euros?|eur|\$|usd|£|gbp|cfa|fcfa|chf|₦|naira|ngn|ksh|kes|¥|cny)/gi, "")
    .replace(/(?:€|\$|£|cfa|fcfa)\s*\d+[.,]?\d*/gi, "")
    .replace(/\bavec\s+.+?(?:[.,;!?]|$)/gi, "")
    .replace(/\bwith\s+.+?(?:[.,;!?]|$)/gi, "")
    .replace(/^(?:ajoute|add|note|mets?)\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Si après nettoyage on n'a plus rien, on prend la catégorie comme fallback
  if (!description && category) {
    description = category[0].toUpperCase() + category.slice(1);
  }

  // Confiance heuristique : montant + devise + au moins une autre info
  const score =
    (amount !== null ? 0.4 : 0) +
    (currency !== null ? 0.2 : 0) +
    (category !== null ? 0.2 : 0) +
    (participantsHints.length > 0 ? 0.2 : 0);

  return {
    description: description || text.trim().slice(0, 80),
    amount,
    currency,
    participantsHints,
    category,
    confidence: Math.round(score * 100) / 100,
    source: "heuristic",
  };
}

/**
 * Appelle GPT-4o-mini pour parser la dépense — version enrichie avec
 * contexte du groupe.
 *
 * Sprint AC · Si on passe `members` (les membres du groupe), le LLM peut :
 *  - Matcher chaque nom mentionné avec un userId réel
 *  - Identifier "je / moi" comme l'user marqué `isMe`
 *  - Détecter le mode de partage (EQUAL / UNEQUAL / PERCENTAGE)
 *  - Extraire des parts personnalisées si l'user dicte « moi 20€, Karim 10€ »
 */
export async function parseExpenseWithLLM(
  text: string,
  members?: GroupMemberContext[],
  /** Sprint AC-3 · Locale ISO 2 lettres pour adapter le prompt système.
   *  Le LLM répond toujours en JSON (les VALEURS textuelles sortantes sont
   *  laissées dans la langue du locuteur). Ce paramètre influence surtout
   *  les instructions du système. Défaut : auto (FR). */
  locale?: string,
): Promise<ParsedExpense> {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY non configuré");
  }

  // Construit le prompt système — version basique si pas de contexte,
  // version riche si on a les membres du groupe.
  const hasContext = members && members.length > 0;
  const memberList = hasContext
    ? members
        .map(
          (m) =>
            `  - "${m.displayName}" (id: ${m.id}${m.isMe ? ", c'est MOI" : ""})`,
        )
        .join("\n")
    : "";

  const systemPrompt = hasContext
    ? `Tu es un assistant qui extrait une dépense partagée depuis un texte en langage naturel.

🌍 LANGUES : tu comprends couramment toutes les langues principales (français, anglais, espagnol, portugais, arabe, swahili, wolof, lingala, amharique, allemand, italien, luxembourgeois, russe, japonais, coréen, hindi, chinois, pidgin nigérian, haoussa, yoruba, oromo, igbo, fula, zulu, akan, et bien d'autres). Le texte peut mélanger les langues — détecte la langue dominante et travaille avec.

Le texte vient d'un membre d'un groupe BMD. Voici les membres du groupe :
${memberList}

Quand l'utilisateur dit "je", "moi", "j'ai payé", "I", "me", "I paid", "yo pagué", "eu paguei" (selon la langue) → c'est l'user marqué "c'est MOI".
Quand il mentionne un nom (ex: "avec Karim et Aïcha", "with Mike and Sarah") → trouve l'id correspondant dans la liste ci-dessus (matching tolérant : "Karim" matche "Karim Diop" ou "K.").

Réponds UNIQUEMENT en JSON sans markdown, avec EXACTEMENT ces champs :
{
  "description": string (court, ex: "Resto avec amis" — DANS LA LANGUE DU LOCUTEUR),
  "amount": number | null,
  "currency": string | null (code ISO 4217),
  "paidByUserId": string | null (id du payeur principal, ou null si non identifié),
  "participantIds": string[] (ids des membres concernés ; si "tout le groupe"/"everyone"/"todos", liste TOUS les ids),
  "participantsHints": string[] (noms textuels mentionnés, fallback si match échoue),
  "splitMode": "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED" | null,
  "shares": object | null (si UNEQUAL : { userId: montant }, si PERCENTAGE : { userId: pct_0_a_100 }),
  "payers": [{"userId": string, "amount"?: number, "percent"?: number}] | null,
  "category": string | null (resto, courses, transport, logement, loisirs, autres)
}

Règles :
 - Par défaut → splitMode = "EQUAL" et participantIds = tout le monde.
 - "partage à 3" / "split with 3" → EQUAL avec 3 personnes (le payeur inclus).
 - "moi 60%, Karim 40%" → PERCENTAGE avec shares.
 - "j'ai payé pour Karim et moi, on partage 50-50" → EQUAL avec ces 2 ids.
 - Si tu n'es pas sûr du payeur, mets null (le frontend demandera).
 - Pour les noms ambigus, mets dans participantsHints en plus de participantIds.

🆕 MULTI-PAYEURS — Sprint AC-3
Si l'utilisateur dit que PLUSIEURS personnes ont avancé le paiement (ex: "Karim a mis 30, Linda 50, moi 20" ou "Karim paid 30, Linda paid 50, I paid 20" ou "Karim 60% Linda 40%"), remplis le tableau "payers" avec une entrée par personne :
 - Mode montant : payers = [{"userId":"...", "amount":30}, {"userId":"...", "amount":50}, ...]
   La somme des "amount" DOIT == "amount" total de la dépense.
 - Mode pourcentage : payers = [{"userId":"...", "percent":60}, {"userId":"...", "percent":40}]
   La somme des "percent" DOIT == 100.
 - NE MELANGE PAS amount et percent dans la même dépense.
Si un seul payeur, "payers" reste null et "paidByUserId" est rempli normalement.

Locale détectée du locuteur : ${locale ?? "auto"}.`
    : `Tu es un assistant qui extrait une dépense partagée depuis un texte en langage naturel (toutes langues comprises).
Réponds UNIQUEMENT en JSON sans markdown, avec EXACTEMENT ces champs :
{
  "description": string,
  "amount": number | null,
  "currency": string | null (code ISO 4217),
  "participantsHints": string[],
  "category": string | null (resto, courses, transport, logement, loisirs, autres)
}
Si une info est absente, mets null ou [].`;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: hasContext ? 500 : 200, // plus de tokens si on retourne participantIds + shares
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
  }

  const json = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = json.choices[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM JSON parse failed");
  }

  // Sanitize les userIds retournés contre la liste des membres connus
  // (anti-hallucination : le LLM peut inventer un id, on filtre).
  const validIds = new Set((members ?? []).map((m) => m.id));

  const paidByUserId =
    typeof parsed.paidByUserId === "string" && validIds.has(parsed.paidByUserId)
      ? parsed.paidByUserId
      : null;

  const participantIds = Array.isArray(parsed.participantIds)
    ? parsed.participantIds.filter(
        (id: any) => typeof id === "string" && validIds.has(id),
      )
    : [];

  const splitMode =
    typeof parsed.splitMode === "string" &&
    ["EQUAL", "UNEQUAL", "PERCENTAGE", "ITEMIZED"].includes(parsed.splitMode)
      ? parsed.splitMode
      : null;

  // Sanitize shares — clés doivent être dans validIds, valeurs doivent être numériques
  let shares: Record<string, number> | undefined;
  if (
    parsed.shares &&
    typeof parsed.shares === "object" &&
    !Array.isArray(parsed.shares)
  ) {
    shares = {};
    for (const [k, v] of Object.entries(parsed.shares)) {
      if (validIds.has(k) && typeof v === "number" && v >= 0) {
        shares[k] = v;
      }
    }
  }

  // Sprint AC-3 · Sanitize payers — anti-hallucination + cohérence amount/percent
  let payers: Array<{ userId: string; amount?: number; percent?: number }> | undefined;
  if (Array.isArray(parsed.payers) && parsed.payers.length >= 2) {
    const cleanPayers: Array<{ userId: string; amount?: number; percent?: number }> = [];
    const seenIds = new Set<string>();
    let hasAmount = false;
    let hasPercent = false;
    for (const p of parsed.payers) {
      if (!p || typeof p !== "object") continue;
      if (typeof p.userId !== "string" || !validIds.has(p.userId)) continue;
      if (seenIds.has(p.userId)) continue; // pas de doublons
      seenIds.add(p.userId);
      const entry: { userId: string; amount?: number; percent?: number } = {
        userId: p.userId,
      };
      if (typeof p.amount === "number" && p.amount >= 0) {
        entry.amount = p.amount;
        hasAmount = true;
      } else if (typeof p.percent === "number" && p.percent >= 0 && p.percent <= 100) {
        entry.percent = p.percent;
        hasPercent = true;
      } else {
        continue; // pas exploitable
      }
      cleanPayers.push(entry);
    }
    // Pas de mix amount/percent (le frontend refusera de toute façon)
    if (cleanPayers.length >= 2 && !(hasAmount && hasPercent)) {
      payers = cleanPayers;
    }
  }

  return {
    description:
      typeof parsed.description === "string"
        ? parsed.description.slice(0, 200)
        : text.slice(0, 80),
    amount:
      typeof parsed.amount === "number" && parsed.amount > 0
        ? parsed.amount
        : null,
    currency:
      typeof parsed.currency === "string" && /^[A-Z]{3}$/.test(parsed.currency)
        ? parsed.currency
        : null,
    participantsHints: Array.isArray(parsed.participantsHints)
      ? parsed.participantsHints
          .filter((p: any) => typeof p === "string")
          .slice(0, 10)
          .map((p: string) => p.trim().slice(0, 40))
      : [],
    // V83 · Normalise via shared-types — robuste si le LLM renvoie
    // "Resto", "RESTAURANT", "Voyage", etc. au lieu de la valeur canonique.
    category:
      typeof parsed.category === "string"
        ? normalizeExpenseCategory(parsed.category)
        : null,
    confidence: 0.9,
    source: "llm",
    paidByUserId,
    participantIds,
    splitMode,
    shares,
    payers,
  };
}

/**
 * Point d'entrée : tente LLM si possible, fallback heuristique sinon.
 *
 * @param members Sprint AC · contexte du groupe (members + isMe pour matching).
 *                Si fourni, le LLM retourne paidByUserId, participantIds, splitMode.
 * @param locale  Sprint AC-3 · code ISO 2 lettres pour adapter le prompt système.
 */
export async function parseExpenseSmart(
  text: string,
  members?: GroupMemberContext[],
  locale?: string,
): Promise<ParsedExpense> {
  if (text.length > 500) {
    text = text.slice(0, 500);
  }
  try {
    return await parseExpenseWithLLM(text, members, locale);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ai] LLM parse failed, fallback heuristique:", (e as Error).message);
    return parseExpenseHeuristic(text);
  }
}

// ============================================================
// V56 — Génération de relance créancier personnalisée (IA + tone)
// ============================================================

export interface ReminderMessageArgs {
  /** Prénom du débiteur (la personne qui DOIT de l'argent) */
  debtorName: string;
  /** Prénom du créancier (= utilisateur qui demande la relance, "moi") */
  creditorName: string;
  /** Montant dû, format texte ex "42.50" */
  amount: string;
  /** Code ISO de la devise (EUR, XAF…) */
  currency: string;
  /** Nom du / des groupes concernés (pour donner du contexte) */
  groupNames?: string[];
  /** Tone choisi par l'utilisateur — fallback sympa */
  tone: ReminderTone;
  /** Locale ISO 2 lettres : la langue du MESSAGE GÉNÉRÉ */
  locale: string;
}

export type ReminderTone = "sympa" | "ferme" | "humour" | "pro";

const TONE_INSTRUCTIONS: Record<ReminderTone, string> = {
  sympa:
    "Ton amical, chaleureux, décontracté. Utilise des émojis sympas (🙂 🙏 ✨) avec modération. Pas d'agressivité.",
  ferme:
    "Ton direct, factuel, sans détour. Pas d'émojis. Va droit au but : qui doit quoi à qui, et appel clair à régler. Reste courtois.",
  humour:
    "Ton léger, taquin, avec quelques émojis fun. Glisse une petite blague ou expression argot diaspora si possible. JAMAIS méchant ni culpabilisant.",
  pro: "Ton formel, sobre, comme un message professionnel. Aucun émoji. Vouvoiement si la langue le permet. Pas d'enthousiasme excessif.",
};

/**
 * Génère un message de relance personnalisé via OpenAI GPT-4o-mini.
 *
 * Le message est généré dans la langue indiquée par `locale` (peu importe la
 * langue de l'app de l'utilisateur — c'est la LANGUE DU DESTINATAIRE qui compte).
 *
 * Retourne UN SEUL message, prêt à envoyer (WhatsApp / SMS / email).
 * Pas de markdown, pas de JSON — juste du texte brut natural-feeling.
 *
 * Pas de fallback offline : si OpenAI fail, on lève une erreur que le front
 * traduit en toast "Service IA indisponible, réessaie plus tard".
 */
export async function generateReminderMessage(
  args: ReminderMessageArgs,
): Promise<string> {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY non configuré");
  }

  const toneInstruction = TONE_INSTRUCTIONS[args.tone];
  const groupContext =
    args.groupNames && args.groupNames.length > 0
      ? `Contexte : ils partagent le(s) groupe(s) « ${args.groupNames.join(" », « ")} » sur BMD.`
      : "";

  const systemPrompt = `Tu rédiges UN message de relance personnalisé pour rappeler à un ami qu'il doit de l'argent.

🌍 LANGUE DE SORTIE : ${args.locale} (code ISO). Écris LE MESSAGE dans cette langue, naturellement, comme un locuteur natif. Si la locale est "fr" → français standard. Si "fr-cm" → français camerounais (nouchi léger possible). Si "wo" → wolof. Etc.

CONTEXTE :
- Le créancier (celui qui réclame) s'appelle : ${args.creditorName}
- Le débiteur (celui qui doit) s'appelle : ${args.debtorName}
- Montant dû : ${args.amount} ${args.currency}
${groupContext}

TON DEMANDÉ : ${args.tone} → ${toneInstruction}

RÈGLES :
- Le message est écrit À LA PREMIÈRE PERSONNE par le créancier (${args.creditorName}) qui s'adresse au débiteur (${args.debtorName}).
- Commence par interpeller ${args.debtorName} par son prénom (ex: "Salut ${args.debtorName}", "Hey ${args.debtorName}", "Bonjour ${args.debtorName}").
- Mentionne le montant ET la devise explicitement.
- 2 à 4 phrases maximum. Court, lisible.
- Termine par un appel à l'action implicite ou explicite (ex: "tu peux me rembourser ?", "quand ça t'arrange").
- N'invente PAS de détails (date, raison, etc.) qui ne sont pas fournis ci-dessus.

Réponds UNIQUEMENT avec le message, sans guillemets ni markdown autour.`;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Génère le message de relance pour ${args.debtorName} (${args.amount} ${args.currency}), ton ${args.tone}, langue ${args.locale}.`,
      },
    ],
    temperature: 0.7, // un peu de créativité pour éviter les messages identiques
    max_tokens: 200,
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(
      `OpenAI HTTP ${resp.status}: ${await resp.text().catch(() => "")}`,
    );
  }

  const json = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const message = (json.choices[0]?.message?.content ?? "").trim();
  if (!message) {
    throw new Error("LLM returned empty message");
  }
  // Nettoie les éventuels guillemets de wrapping
  return message.replace(/^["'«»]+|["'«»]+$/g, "").trim();
}
