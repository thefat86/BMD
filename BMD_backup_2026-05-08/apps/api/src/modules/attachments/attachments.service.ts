/**
 * Service de gestion des pièces jointes aux dépenses.
 *
 * Stockage : disque local sous apps/api/uploads/. Chaque fichier est
 * renommé avec un UUID + extension d'origine pour éviter les collisions
 * et les chemins traversal. Le nom original est préservé en DB pour
 * l'affichage.
 *
 * Sécurité :
 *  - Limite de taille : 10 Mo par fichier
 *  - Mime types autorisés : images, PDF, documents standards
 *  - Path traversal : on n'utilise JAMAIS le nom utilisateur pour le chemin
 *  - Permissions : tous les membres du groupe peuvent VOIR/TÉLÉCHARGER ;
 *    seul le payeur de la dépense ou un admin du groupe peut UPLOAD/SUPPRIMER
 */
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

// Répertoire de stockage : <repo>/apps/api/uploads/
// process.cwd() lors du dev = apps/api ; en prod ça dépend du container.
// On utilise import.meta.url pour être robuste, mais en CommonJS-friendly
// (Fastify TS) on tombe sur dirname == src/modules/attachments donc on
// remonte de 4 niveaux pour atteindre apps/api.
const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.BMD_UPLOAD_DIR ?? "uploads",
);

// 10 Mo
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Mime types autorisés. Photos de tickets + PDFs + Office + audio (Sprint AC-2).
 * On est volontairement restrictif pour éviter les fichiers exécutables.
 *
 * Sprint AC-2 — Audio Proof of Expense (cas d'usage Afrique) : on autorise
 * les enregistrements audio comme pièces jointes pour qu'on puisse capter
 * la voix d'un vendeur de marché qui annonce son prix (équivalent du ticket
 * de caisse là où la facturation papier n'existe pas).
 */
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  // Sprint AC-2 · audio proof
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
]);

/** Sprint AC-2 · Tous les mime types audio dans la liste autorisée. */
const AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
]);

export function isAudioMime(mime: string): boolean {
  return AUDIO_MIME_TYPES.has(mime.split(";")[0]!.trim().toLowerCase());
}

async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

function extensionFromMime(mime: string, fallback: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "text/plain": ".txt",
    "text/csv": ".csv",
    // Sprint AC-2 · audio proof
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
  };
  return map[mime] ?? fallback;
}

/**
 * Vérifie qu'un user est membre du groupe d'une dépense, et retourne
 * son rôle. Throw si non-membre.
 */
async function getMembership(expenseId: string, actorUserId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      paidById: true,
      groupId: true,
      group: { select: { members: { select: { userId: true, role: true } } } },
    },
  });
  if (!expense) throw Errors.notFound("Dépense introuvable");
  const member = expense.group.members.find((m) => m.userId === actorUserId);
  if (!member) throw Errors.forbidden("Tu n'es pas membre de ce groupe");
  return { expense, member };
}

/**
 * Upload une pièce jointe. Vérifie la taille, le mime type, les permissions.
 * Retourne le DTO attachment (sans contenu binaire).
 *
 * Permission UPLOAD : payeur OU admin du groupe.
 *
 * Sprint AC-2 — `kind` permet de marquer une pièce comme AUDIO_PROOF (preuve
 * audio d'une dépense de marché). Pour ce kind, on transcrit le fichier en
 * arrière-plan avec Whisper et on stocke `transcript` pour l'UI.
 */
export async function uploadAttachment(input: {
  expenseId: string;
  actorUserId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  /** Sprint AC-2 · "RECEIPT" (défaut) / "PHOTO" / "AUDIO_PROOF" / "DOCUMENT" */
  kind?: "RECEIPT" | "PHOTO" | "AUDIO_PROOF" | "DOCUMENT";
}) {
  if (input.buffer.length === 0) {
    throw Errors.badRequest("Fichier vide");
  }
  if (input.buffer.length > MAX_FILE_SIZE) {
    throw Errors.badRequest(
      `Fichier trop gros (max ${MAX_FILE_SIZE / 1024 / 1024} Mo)`,
    );
  }
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw Errors.badRequest(
      `Type de fichier non autorisé : ${input.mimeType}`,
    );
  }

  // Sprint AC-2 · cohérence kind ↔ mime type. AUDIO_PROOF doit être un audio.
  const isAudio = isAudioMime(input.mimeType);
  let kind = input.kind ?? (isAudio ? "AUDIO_PROOF" : "RECEIPT");
  if (kind === "AUDIO_PROOF" && !isAudio) {
    throw Errors.badRequest(
      "Une preuve audio doit être un fichier audio (WebM, MP3, M4A, WAV ou OGG).",
    );
  }
  if (isAudio && kind !== "AUDIO_PROOF") {
    // Force AUDIO_PROOF même si le client n'a pas précisé — on n'affiche
    // pas un fichier audio dans la galerie de tickets.
    kind = "AUDIO_PROOF";
  }

  // Sprint AC-3 · Plafond de durée pour les preuves audio. On ne peut pas
  // mesurer la durée d'un buffer mp3/m4a/webm sans décoder, mais on peut
  // approximer via la taille (≈ 1 Mo / 60 s en compressé moyen). Si le
  // fichier dépasse clairement le plafond du plan, on refuse côté serveur
  // pour éviter de faire payer Whisper sur 30 min de bavardage non-pertinent.
  if (kind === "AUDIO_PROOF") {
    // Lookup conservateur : on prend les limites du plan de l'uploader
    const { getMeetingUsage } = await import("../../lib/plan-limits.js");
    try {
      const u = await getMeetingUsage(input.actorUserId);
      const max = u.audioProofMaxSeconds;
      if (max > 0) {
        const approxSeconds = Math.round(input.buffer.length / (1024 * 1024) * 60);
        if (approxSeconds > max * 1.5) {
          throw Errors.badRequest(
            `Cet enregistrement (~${approxSeconds}s estimé) dépasse la durée max d'une preuve audio (${max}s). Refais un enregistrement plus court.`,
          );
        }
      }
    } catch (err) {
      // Si getMeetingUsage explose (cas dégradé), on continue — la limite
      // 10 Mo des attachments classiques fait office de garde-fou ultime.
      // eslint-disable-next-line no-console
      console.warn("[audio-proof] could not check duration limit:", (err as Error).message);
    }
  }

  const { expense, member } = await getMembership(
    input.expenseId,
    input.actorUserId,
  );
  const canUpload =
    expense.paidById === input.actorUserId || member.role === "ADMIN";
  if (!canUpload) {
    throw Errors.forbidden(
      "Seul le payeur ou un admin peut ajouter une pièce jointe",
    );
  }

  await ensureUploadDir();
  const ext = extensionFromMime(
    input.mimeType,
    path.extname(input.fileName) || "",
  );
  const storageKey = `${randomUUID()}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, storageKey);

  await writeFile(fullPath, input.buffer);

  // Sprint AC-2 · Transcrit l'audio proof en arrière-plan (sans bloquer la
  // réponse HTTP). Si Whisper n'est pas configuré, on garde juste le
  // fichier sans transcript — c'est dégradé mais utilisable.
  const created = await prisma.expenseAttachment.create({
    data: {
      expenseId: input.expenseId,
      uploadedById: input.actorUserId,
      fileName: input.fileName.slice(0, 255), // tronque pour éviter overflow
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      storageKey,
      // Cast `as any` jusqu'à régen du client Prisma post-migration v33
      ...({ kind } as any),
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedById: true,
      uploadedBy: { select: { id: true, displayName: true } },
      createdAt: true,
      ...({ kind: true } as any),
    },
  });

  // Fire-and-forget : transcription asynchrone des AUDIO_PROOF
  if (kind === "AUDIO_PROOF") {
    void transcribeAudioProof(created.id, input.buffer, input.mimeType).catch(
      (err) => {
        // eslint-disable-next-line no-console
        console.warn(
          "[attachments] audio-proof transcription failed:",
          (err as Error).message,
        );
      },
    );
  }

  return created;
}

/**
 * Sprint AC-2 · Transcrit en arrière-plan une preuve audio attachée à une
 * dépense, et persiste le résultat dans `transcript` + `transcriptLanguage`.
 *
 * Sprint AC-3 · Extrait aussi le montant + la devise du transcript via le
 * LLM. Si le résultat est plausible (montant > 0, devise valide), on update
 * la dépense parente UNIQUEMENT si elle n'a pas encore d'amount défini
 * (amount === 0). Sinon on stocke l'extraction dans le transcript pour
 * que l'UI puisse afficher une suggestion ("J'ai entendu 5000 FCFA, on
 * remplace ?").
 */
async function transcribeAudioProof(
  attachmentId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  // Import dynamique pour éviter de charger Whisper si l'env n'est pas dispo
  // (et casser un démarrage froid pour rien).
  const { isWhisperAvailable, transcribeAudio } = await import(
    "../voice/voice.service.js"
  );
  if (!isWhisperAvailable()) return;
  const result = await transcribeAudio(buffer, mimeType);
  await prisma.expenseAttachment.update({
    where: { id: attachmentId },
    data: ({
      transcript: result.text.slice(0, 5000),
      transcriptLanguage: result.language,
    } as any),
  });

  // Sprint AC-3 · Extraction LLM du montant entendu dans la voix du vendeur.
  // On utilise GPT-4o-mini (très bon marché ~ $0.0001 / call) avec un prompt
  // ultra-ciblé pour qu'il renvoie {amount, currency, summary} en JSON.
  // L'UI consomme `transcript` et applique l'extraction côté client si
  // l'utilisateur clique "Utiliser ce montant".
  try {
    const { loadEnv } = await import("../../lib/env.js");
    const env = loadEnv();
    if (!env.OPENAI_API_KEY) return;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Tu reçois la transcription d'un enregistrement audio fait au marché par un client qui veut justifier sa dépense. Extrait le montant principal annoncé par le vendeur ET la devise. Réponds UNIQUEMENT en JSON :
{
  "amount": number | null,
  "currency": string | null (code ISO 4217 — XAF/XOF pour FCFA, USD pour dollars, etc.),
  "shortDescription": string (3-6 mots, ex: "Tomates fraîches 2kg")
}
Si tu n'es pas sûr d'un champ, mets null. Pas de markdown.`,
          },
          { role: "user", content: result.text.slice(0, 2000) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      }),
    });
    if (!resp.ok) return;
    const json = (await resp.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const parsed = JSON.parse(
      json.choices[0]?.message?.content ?? "{}",
    ) as {
      amount?: number;
      currency?: string;
      shortDescription?: string;
    };
    if (
      typeof parsed.amount !== "number" ||
      !(parsed.amount > 0)
    ) {
      return;
    }
    // On met à jour la dépense parente SI son amount actuel est 0 (= preuve
    // créée avant validation manuelle). Sinon l'utilisateur a déjà saisi,
    // on ne touche pas pour ne pas écraser sa saisie.
    const att = await prisma.expenseAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        expenseId: true,
        expense: {
          select: { amount: true, description: true, currency: true },
        },
      },
    });
    if (!att?.expense) return;
    const currentAmount = parseFloat(att.expense.amount.toString());
    if (currentAmount === 0) {
      // amount à 0 → on remplit. On garde la description si déjà saisie,
      // on remplace par celle de l'IA si elle est vide ou générique.
      const isGenericDesc =
        !att.expense.description ||
        att.expense.description === "Marché" ||
        att.expense.description === "Audio proof";
      const newCurrency =
        parsed.currency && /^[A-Z]{3}$/.test(parsed.currency)
          ? parsed.currency
          : att.expense.currency;
      await prisma.expense.update({
        where: { id: att.expenseId },
        data: {
          amount: parsed.amount as any,
          currency: newCurrency,
          ...(isGenericDesc && parsed.shortDescription
            ? { description: parsed.shortDescription.slice(0, 200) }
            : {}),
        },
      });
    }
    // Stocke l'extraction structurée dans le transcript pour debug/UI.
    // (On préfixe avec un marker "[BMD-EXTRACT]" pour pouvoir le filtrer.)
    await prisma.expenseAttachment.update({
      where: { id: attachmentId },
      data: ({
        transcript:
          result.text.slice(0, 5000) +
          `\n\n[BMD-EXTRACT] amount=${parsed.amount} currency=${parsed.currency ?? "n/a"}`,
      } as any),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[audio-proof] amount extraction failed:",
      (err as Error).message,
    );
  }
}

/**
 * Liste les attachments d'une dépense. Tous les membres du groupe peuvent voir.
 *
 * Sprint AC-2 — on expose aussi `kind` et `transcript` pour que l'UI puisse
 * afficher un lecteur audio + le texte transcrit pour les preuves audio.
 */
export async function listAttachments(input: {
  expenseId: string;
  actorUserId: string;
}) {
  await getMembership(input.expenseId, input.actorUserId);
  return prisma.expenseAttachment.findMany({
    where: { expenseId: input.expenseId },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedById: true,
      uploadedBy: { select: { id: true, displayName: true } },
      createdAt: true,
      // Cast `as any` jusqu'à régen client Prisma post-migration v33
      ...({ kind: true, transcript: true, transcriptLanguage: true } as any),
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Récupère le chemin d'un attachment et vérifie l'autorisation. Tous les
 * membres du groupe peuvent télécharger.
 */
export async function getAttachmentForDownload(input: {
  attachmentId: string;
  actorUserId: string;
}) {
  const att = await prisma.expenseAttachment.findUnique({
    where: { id: input.attachmentId },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      storageKey: true,
      expense: {
        select: {
          group: { select: { members: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!att) throw Errors.notFound("Pièce jointe introuvable");
  const isMember = att.expense.group.members.some(
    (m) => m.userId === input.actorUserId,
  );
  if (!isMember) throw Errors.forbidden("Tu n'es pas membre du groupe");
  return {
    fullPath: path.join(UPLOAD_DIR, att.storageKey),
    fileName: att.fileName,
    mimeType: att.mimeType,
  };
}

/**
 * Supprime une pièce jointe. Permission : uploader OU payeur de la dépense
 * OU admin du groupe.
 */
export async function deleteAttachment(input: {
  attachmentId: string;
  actorUserId: string;
}) {
  const att = await prisma.expenseAttachment.findUnique({
    where: { id: input.attachmentId },
    select: {
      id: true,
      uploadedById: true,
      storageKey: true,
      expense: {
        select: {
          paidById: true,
          group: {
            select: { members: { select: { userId: true, role: true } } },
          },
        },
      },
    },
  });
  if (!att) throw Errors.notFound("Pièce jointe introuvable");
  const member = att.expense.group.members.find(
    (m) => m.userId === input.actorUserId,
  );
  if (!member) throw Errors.forbidden("Tu n'es pas membre du groupe");
  const canDelete =
    att.uploadedById === input.actorUserId ||
    att.expense.paidById === input.actorUserId ||
    member.role === "ADMIN";
  if (!canDelete) {
    throw Errors.forbidden(
      "Seul l'auteur de la pièce, le payeur ou un admin peut supprimer",
    );
  }
  // Best-effort sur le fichier physique : on continue même si unlink échoue
  // (fichier déjà absent en cas de re-run, par ex.)
  try {
    await unlink(path.join(UPLOAD_DIR, att.storageKey));
  } catch {
    /* ignore */
  }
  await prisma.expenseAttachment.delete({ where: { id: att.id } });
  return { deleted: true };
}
