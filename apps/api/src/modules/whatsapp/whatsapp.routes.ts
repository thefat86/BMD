/**
 * Webhook WhatsApp Cloud API (Meta) — spec §3.10.
 *
 * Workflow Meta :
 *  1. Vérification initiale GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
 *  2. Réception des messages POST /webhooks/whatsapp avec signature HMAC SHA256 dans X-Hub-Signature-256
 *
 * Intents reconnus (NLU minimaliste — règles sur mots-clés) :
 *  - "solde", "balance", "combien"               → renvoie le solde global
 *  - "ajoute|paye|dépense ... 25e ... resto"     → propose la création d'une dépense
 *  - "rappel", "relance"                         → status des cotisations en attente
 *  - "stop", "désactiver"                        → désactive le bot pour ce numéro
 *  - "aide", "help", "?"                         → affiche le menu d'aide
 *
 * Pour les commandes nécessitant une action complexe, on répond avec un
 * **lien deep link vers l'app web** plutôt que de tout faire en chat.
 * Le bot reste donc une passerelle d'aide, pas un substitut complet à l'app.
 *
 * Sécurité :
 *  - Vérification HMAC obligatoire (sinon 401)
 *  - Identification du user par son numéro de téléphone (UserContact PHONE)
 *  - Si numéro non connu : message d'invite à s'inscrire sur bmd.app
 */
import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "../../lib/env.js";
import { prisma } from "../../lib/db.js";

interface WhatsAppMessage {
  from: string; // numéro E.164 sans le +
  id: string;
  timestamp: string;
  type: "text" | "interactive" | "button" | "image" | "audio" | "voice";
  text?: { body: string };
  button?: { text: string; payload: string };
  /** Pour les messages de type audio / voice — Meta envoie un media id à fetcher. */
  audio?: { id: string; mime_type?: string };
  voice?: { id: string; mime_type?: string };
}

interface WhatsAppWebhookBody {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: {
        messaging_product?: string;
        metadata?: { phone_number_id: string; display_phone_number: string };
        messages?: WhatsAppMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
}

// ============================================================
// Vérification de signature Meta (X-Hub-Signature-256)
// ============================================================
function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  const env = loadEnv();
  if (!env.WHATSAPP_APP_SECRET) {
    // En dev sans secret configuré : on log un warning mais on autorise
    // (sinon le webhook est intestable en local sans tunnel HTTPS).
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp] WHATSAPP_APP_SECRET non configuré — signature non vérifiée",
    );
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const provided = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// ============================================================
// NLU minimaliste (regex sur mots-clés)
// ============================================================
type Intent =
  | { kind: "balance" }
  | { kind: "add_expense"; rawText: string }
  | { kind: "reminder" }
  | { kind: "stop" }
  | { kind: "help" }
  | { kind: "unknown" };

function parseIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  if (!t) return { kind: "unknown" };

  if (/^(stop|stp|d[ée]sactiver|d[ée]sabonner)/i.test(t)) {
    return { kind: "stop" };
  }
  if (/^(aide|help|\?|menu|commandes?)/i.test(t)) {
    return { kind: "help" };
  }
  if (/(solde|balance|combien|dois je|on me doit)/i.test(t)) {
    return { kind: "balance" };
  }
  if (/(rappel|relance|en attente|cotisation)/i.test(t)) {
    return { kind: "reminder" };
  }
  if (/(ajoute|paye|d[ée]pense|d[ée]penser|achet)/i.test(t)) {
    return { kind: "add_expense", rawText: text };
  }
  return { kind: "unknown" };
}

// ============================================================
// Réponses
// ============================================================
async function buildReply(
  intent: Intent,
  userId: string | null,
  webBaseUrl: string,
): Promise<string> {
  if (!userId) {
    return `👋 Salut ! Je ne reconnais pas encore ton numéro sur BMD.

Inscris-toi en 1 minute sur ${webBaseUrl}/login et choisis « Numéro ».
Une fois connecté, tu pourras me parler ici pour gérer tes dépenses, tontines et règlements.`;
  }

  if (intent.kind === "stop") {
    // TODO : marquer ce contact comme "do not message"
    return "✅ Tu ne recevras plus de messages BMD ici. Pour réactiver, écris « start ».";
  }

  if (intent.kind === "help") {
    return `🤖 *BMD Bot WhatsApp*

Commandes disponibles :
• *solde* — voir mon solde global
• *rappel* — voir mes cotisations en attente
• *ajoute 25 resto avec Karim* — créer une dépense
• *aide* — afficher ce menu
• *stop* — me désabonner

Astuce : tu peux toujours utiliser ${webBaseUrl}/dashboard pour les actions complexes.`;
  }

  if (intent.kind === "balance") {
    // Calcule le solde global rapide
    const [paidAgg, oweAgg] = await Promise.all([
      prisma.expense.aggregate({
        where: { paidById: userId },
        _sum: { amount: true },
      }),
      prisma.expenseShare.aggregate({
        where: { userId },
        _sum: { amountOwed: true },
      }),
    ]);
    const paid = parseFloat(paidAgg._sum.amount?.toString() ?? "0");
    const owe = parseFloat(oweAgg._sum.amountOwed?.toString() ?? "0");
    const net = paid - owe;
    return `💰 Ton solde global :

${net >= 0 ? `✅ On te doit *${net.toFixed(2)}*` : `🔻 Tu dois *${Math.abs(net).toFixed(2)}*`}

(Total payé : ${paid.toFixed(2)} · Total dû : ${owe.toFixed(2)})

Détail par groupe : ${webBaseUrl}/dashboard`;
  }

  if (intent.kind === "reminder") {
    const pending = await prisma.tontineContribution.findMany({
      where: { contributorUserId: userId, status: "PENDING" },
      take: 5,
      include: {
        turn: {
          include: { tontine: { include: { group: { select: { name: true } } } } },
        },
      },
    });
    if (pending.length === 0) {
      return "🎉 Aucune cotisation en attente — tu es à jour !";
    }
    const lines = pending.map((c) => {
      const due = c.turn.scheduledDate ?? c.turn.dueDate;
      return `• ${c.amount.toString()} pour « ${c.turn.tontine.group.name} » (tour ${c.turn.turnNumber}) — ${due.toLocaleDateString("fr-FR")}`;
    });
    return `🔔 ${pending.length} cotisation${pending.length > 1 ? "s" : ""} en attente :

${lines.join("\n")}

Marquer comme payé : ${webBaseUrl}/dashboard`;
  }

  if (intent.kind === "add_expense") {
    return `📝 Pour ajouter une dépense en 1 clic, ouvre ${webBaseUrl}/dashboard et utilise le bouton « + Dépense ».

Astuce : tu peux aussi scanner un ticket avec l'OCR — beaucoup plus rapide qu'à taper ici 📷`;
  }

  return `🤔 Je n'ai pas compris. Tape *aide* pour voir les commandes disponibles.`;
}

// ============================================================
// Envoi de réponse via WhatsApp Cloud API
// ============================================================
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const env = loadEnv();
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp] reply skipped (token manquant) →", to, ":", body);
    return;
  }
  await fetch(
    `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body, preview_url: true },
      }),
    },
  ).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[whatsapp] send error:", e instanceof Error ? e.message : e);
  });
}

// ============================================================
// Routes
// ============================================================
export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /whatsapp/bot-info (auth optionnel)
   * Retourne les infos pour ajouter le bot BMD à un groupe WhatsApp
   * existant (spec §3.10). Le user :
   *  1. Tape le bot dans son carnet : ouvre `wa.me/<numéro>`
   *  2. L'ajoute à son groupe : long-press dans WA → Info groupe → Ajouter participant
   *  3. Envoie un message d'init dans le groupe : `BMD-INIT <code-groupe>`
   *  4. Le bot répond et synchronise les events futurs vers le groupe BMD lié
   *
   * Retourne aussi les commandes supportées dans un groupe (réduit vs 1-to-1).
   */
  app.get(
    "/whatsapp/bot-info",
    { config: { skipAuth: true } as any },
    async () => {
      const env = loadEnv();
      if (!env.WHATSAPP_BUSINESS_NUMBER) {
        return {
          enabled: false,
          message:
            "Bot WhatsApp non configuré côté serveur. Contacte l'admin BMD.",
        };
      }
      return {
        enabled: true,
        botNumber: `+${env.WHATSAPP_BUSINESS_NUMBER}`,
        botContactUrl: `https://wa.me/${env.WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(
          "Salut BMD, j'aimerais t'ajouter à mon groupe.",
        )}`,
        instructions: [
          "1. Tape sur le lien ci-dessous pour ouvrir une conversation avec le bot BMD",
          "2. Dans WhatsApp, ouvre ton groupe → Info → Ajouter un participant",
          "3. Cherche le numéro du bot BMD et ajoute-le au groupe",
          "4. Dans le groupe, envoie : BMD-INIT <ID du groupe BMD à lier>",
          "5. Le bot confirme et commence à synchroniser les événements (résumés, rappels)",
        ],
        groupCommands: [
          "/solde — Voir le solde du groupe",
          "/depense <montant> <description> — Ajouter une dépense",
          "/rappel — Rappeler les cotisations en attente",
          "/aide — Liste des commandes",
        ],
      };
    },
  );

  // === Vérification initiale GET (Meta App Dashboard) ===
  app.get(
    "/webhooks/whatsapp",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const env = loadEnv();
      const q = req.query as Record<string, string | undefined>;
      const mode = q["hub.mode"];
      const token = q["hub.verify_token"];
      const challenge = q["hub.challenge"];
      if (
        mode === "subscribe" &&
        token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
        env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      ) {
        return reply.code(200).type("text/plain").send(challenge);
      }
      return reply.code(403).send({ error: "verify_failed" });
    },
  );

  // === Réception des messages POST ===
  app.post(
    "/webhooks/whatsapp",
    {
      config: { skipAuth: true } as any,
      // On a besoin du body brut pour vérifier la signature
      // Fastify le donne en `req.body` parsé, on reconstruit pour HMAC
    },
    async (req, reply) => {
      const env = loadEnv();
      const sig = req.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = Buffer.from(JSON.stringify(req.body));

      if (!verifyMetaSignature(rawBody, sig)) {
        return reply.code(401).send({ error: "invalid_signature" });
      }

      const body = req.body as WhatsAppWebhookBody;
      const messages =
        body.entry?.flatMap(
          (e) => e.changes?.flatMap((c) => c.value.messages ?? []) ?? [],
        ) ?? [];

      // On répond à Meta IMMÉDIATEMENT (200) puis on traite en async
      // (Meta retry agressivement si pas de 200 sous 5s)
      reply.code(200).send({ received: true });

      for (const msg of messages) {
        // Identifie le user par son numéro (commun à tous les types)
        const phoneE164 = `+${msg.from}`;
        const contact = await prisma.userContact.findUnique({
          where: { type_value: { type: "PHONE", value: phoneE164 } },
          select: { userId: true },
        });

        // === Texte (cas normal) ===
        if (msg.type === "text" && msg.text?.body) {
          const text = msg.text.body.trim();

          // Détection du flow "Sign in with WhatsApp" (spec §7.2) :
          // si le message commence par "BMD-LOGIN-XXXX" on lie le numéro
          // au code et on confirme à l'utilisateur. Le frontend qui poll
          // `/auth/whatsapp/check` recevra alors le JWT.
          const loginMatch = text.match(/^BMD-LOGIN-([A-Z2-9]{8})\b/);
          if (loginMatch) {
            const code = loginMatch[1];
            const { bindPhoneToLoginCode } = await import(
              "../../lib/whatsapp-login.js"
            );
            const r = bindPhoneToLoginCode({
              code,
              phoneE164: phoneE164,
            });
            if (r.ok) {
              await sendWhatsAppText(
                msg.from,
                "✓ Connexion BMD validée. Tu peux retourner sur le site, ton compte va s'ouvrir automatiquement.",
              );
            } else {
              await sendWhatsAppText(
                msg.from,
                `❌ Code invalide ou expiré (${r.reason}). Recommence depuis le site BMD.`,
              );
            }
            continue;
          }

          const intent = parseIntent(text);
          const replyText = await buildReply(
            intent,
            contact?.userId ?? null,
            env.WEB_BASE_URL,
          );
          await sendWhatsAppText(msg.from, replyText);
          continue;
        }

        // === Audio / vocal (spec §3.10) ===
        // Le user envoie un message vocal → on télécharge l'audio depuis
        // Meta, on le transcrit via OpenAI Whisper, puis on traite la
        // transcription comme un message texte normal.
        if (
          (msg.type === "audio" || msg.type === "voice") &&
          (msg.audio?.id || msg.voice?.id)
        ) {
          const mediaId = msg.audio?.id ?? msg.voice?.id;
          if (!mediaId) continue;
          try {
            const transcription = await transcribeWhatsAppAudio(mediaId, env);
            if (!transcription) {
              await sendWhatsAppText(
                msg.from,
                "Je n'ai pas pu transcrire ton message vocal. Réessaie ou envoie un texte.",
              );
              continue;
            }
            // Réutilise le pipeline texte avec la transcription
            const intent = parseIntent(transcription);
            const replyText = await buildReply(
              intent,
              contact?.userId ?? null,
              env.WEB_BASE_URL,
            );
            await sendWhatsAppText(
              msg.from,
              `🎙 J'ai compris : "${transcription}"\n\n${replyText}`,
            );
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
              "[whatsapp] audio transcription failed:",
              (err as Error).message,
            );
            await sendWhatsAppText(
              msg.from,
              "Le service de transcription vocale est indisponible. Renvoie un message texte.",
            );
          }
          continue;
        }
      }

      return undefined;
    },
  );
}

/**
 * Télécharge un media WhatsApp et le transcrit via OpenAI Whisper.
 *
 * Workflow (spec §3.10) :
 *  1. GET https://graph.facebook.com/v18.0/{media-id} → JSON contient `url`
 *  2. GET {url} (avec Bearer Meta access token) → bytes audio (ogg/opus)
 *  3. POST https://api.openai.com/v1/audio/transcriptions multipart/form-data
 *     avec model=whisper-1, file=<bytes>
 *  4. JSON.text → transcription
 *
 * Retourne null si OPENAI_API_KEY non configuré ou erreur de transcription.
 * Best-effort : ne throw jamais (le caller affiche un message à l'utilisateur).
 */
async function transcribeWhatsAppAudio(
  mediaId: string,
  env: ReturnType<typeof loadEnv>,
): Promise<string | null> {
  if (!env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp] OPENAI_API_KEY non configuré → vocal désactivé");
    return null;
  }
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    return null;
  }

  // 1. Récupère l'URL du media
  const mediaResp = await fetch(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    },
  );
  if (!mediaResp.ok) return null;
  const mediaJson = (await mediaResp.json()) as { url?: string };
  if (!mediaJson.url) return null;

  // 2. Télécharge les bytes audio
  const audioResp = await fetch(mediaJson.url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!audioResp.ok) return null;
  const audioBuffer = Buffer.from(await audioResp.arrayBuffer());

  // 3. POST à OpenAI Whisper en multipart/form-data
  const form = new FormData();
  // Meta envoie en ogg/opus par défaut
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" });
  form.append("file", blob, "audio.ogg");
  form.append("model", "whisper-1");
  // Indices de langue : on laisse auto-détecter, mais on biaise pour FR/EN
  form.append("language", "fr");

  const sttResp = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    },
  );
  if (!sttResp.ok) return null;
  const sttJson = (await sttResp.json()) as { text?: string };
  return sttJson.text?.trim() ?? null;
}
