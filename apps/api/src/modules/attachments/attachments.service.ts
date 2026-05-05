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
 * Mime types autorisés. Photos de tickets + PDFs + Office.
 * On est volontairement restrictif pour éviter les fichiers exécutables.
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
]);

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
 */
export async function uploadAttachment(input: {
  expenseId: string;
  actorUserId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
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

  return prisma.expenseAttachment.create({
    data: {
      expenseId: input.expenseId,
      uploadedById: input.actorUserId,
      fileName: input.fileName.slice(0, 255), // tronque pour éviter overflow
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      storageKey,
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedById: true,
      uploadedBy: { select: { id: true, displayName: true } },
      createdAt: true,
    },
  });
}

/**
 * Liste les attachments d'une dépense. Tous les membres du groupe peuvent voir.
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
