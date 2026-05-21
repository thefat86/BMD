/**
 * Service moyens de paiement (spec §9.1).
 *
 * Gère le cycle de vie complet d'un PaymentMethod chiffré :
 *  - addPaymentMethod : valide, normalise, chiffre, stocke avec last4
 *  - listMyPaymentMethods : liste sans valeurs (jamais de déchiffrement en bulk)
 *  - revealPaymentMethod : déchiffre une seule méthode à la demande explicite
 *  - touchPaymentMethod : met à jour `lastUsedAt` après utilisation
 *  - deletePaymentMethod : soft delete (deletedAt)
 *
 * Sécurité :
 *  - Valeur en clair en mémoire UNIQUEMENT le temps du chiffrement
 *  - Logs jamais avec la valeur (uniquement type + last4)
 *  - Reveal nécessite l'authentification (auth hook côté routes)
 */

import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import {
  decryptValue,
  encryptValue,
  isVaultConfigured,
} from "../../lib/crypto-vault.js";
import {
  autoDetectType,
  extractLast4,
  getTypeLabel,
  normalizeValue,
  validateValueForType,
  type PaymentMethodType,
} from "./payment-methods.helpers.js";

interface PublicMethod {
  id: string;
  type: string;
  typeLabel: string;
  typeEmoji: string;
  label: string;
  last4: string;
  defaultCurrency: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

function assertVaultEnabled(): void {
  if (!isVaultConfigured()) {
    throw Errors.badRequest(
      "Les moyens de paiement sauvegardés ne sont pas activés sur ce serveur 🔐",
      {
        tip: "L'admin doit configurer PAYMENT_VAULT_KEY (clé AES-256) côté serveur.",
      },
    );
  }
}

/**
 * Ajoute un nouveau moyen de paiement chiffré pour un user.
 * Le `value` est immédiatement chiffré et purgé de la mémoire (best-effort GC).
 */
export async function addPaymentMethod(input: {
  userId: string;
  type?: PaymentMethodType;
  value: string;
  label: string;
  defaultCurrency?: string;
}): Promise<PublicMethod> {
  assertVaultEnabled();

  // Détection auto si le type n'est pas fourni
  const type: PaymentMethodType = input.type ?? autoDetectType(input.value);
  const normalized = normalizeValue(type, input.value);

  const validationError = validateValueForType(type, normalized);
  if (validationError) {
    throw Errors.invalidFormula({
      what: "ce moyen de paiement",
      why: validationError,
      fix: "Corrige la valeur et réessaie. Ne mets pas d'espaces ni de tirets.",
    });
  }
  if (!input.label || input.label.trim().length < 2) {
    throw Errors.badRequest(
      "Donne un petit nom à ce moyen de paiement 🏷️",
      {
        tip: 'Ex: "Mon Wave Sénégal", "PayPal pro", "Compte joint"…',
      },
    );
  }

  const enc = encryptValue(normalized);
  const last4 = extractLast4(type, normalized);
  const labelInfo = getTypeLabel(type);

  const created = await prisma.paymentMethod.create({
    data: {
      userId: input.userId,
      type,
      label: input.label.trim().slice(0, 80),
      encryptedValue: enc.encryptedValue,
      iv: enc.iv,
      authTag: enc.authTag,
      last4,
      defaultCurrency: input.defaultCurrency
        ? input.defaultCurrency.toUpperCase()
        : null,
    },
  });

  return {
    id: created.id,
    type: created.type,
    typeLabel: labelInfo.name,
    typeEmoji: labelInfo.emoji,
    label: created.label,
    last4: created.last4,
    defaultCurrency: created.defaultCurrency,
    lastUsedAt: created.lastUsedAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Liste les moyens de paiement actifs d'un user.
 * Tri : derniers utilisés en premier, sinon plus récents.
 * NE retourne JAMAIS la valeur chiffrée ni le iv/authTag — uniquement
 * les métadonnées (type, label, last4).
 */
export async function listMyPaymentMethods(
  userId: string,
): Promise<PublicMethod[]> {
  const rows = await prisma.paymentMethod.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return rows.map((m) => {
    const labelInfo = getTypeLabel(m.type);
    return {
      id: m.id,
      type: m.type,
      typeLabel: labelInfo.name,
      typeEmoji: labelInfo.emoji,
      label: m.label,
      last4: m.last4,
      defaultCurrency: m.defaultCurrency,
      lastUsedAt: m.lastUsedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  });
}

/**
 * Déchiffre une méthode spécifique à la demande de l'utilisateur.
 * UNIQUEMENT appelable par le owner du moyen.
 *
 * Ce déchiffrement est tracé dans ActivityLog (futur) pour audit RGPD.
 * Le caller DOIT effacer la valeur de la mémoire dès qu'il en a fini.
 */
export async function revealPaymentMethod(input: {
  userId: string;
  methodId: string;
}): Promise<{
  id: string;
  type: string;
  label: string;
  /** ⚠️ Valeur en clair — à manipuler avec soin */
  value: string;
}> {
  assertVaultEnabled();
  const m = await prisma.paymentMethod.findUnique({
    where: { id: input.methodId },
  });
  if (!m || m.deletedAt) {
    throw Errors.notFound("Ce moyen de paiement est introuvable 🔍");
  }
  if (m.userId !== input.userId) {
    throw Errors.forbidden(
      "Ce moyen de paiement ne t'appartient pas 🔐",
      {
        tip: "Seul le propriétaire peut voir la valeur en clair.",
      },
    );
  }
  const value = decryptValue({
    encryptedValue: m.encryptedValue,
    iv: m.iv,
    authTag: m.authTag,
  });
  return {
    id: m.id,
    type: m.type,
    label: m.label,
    value,
  };
}

/**
 * Marque une méthode comme "utilisée" (met à jour lastUsedAt).
 * À appeler quand l'utilisateur clique sur "Payer avec X".
 */
export async function touchPaymentMethod(input: {
  userId: string;
  methodId: string;
}): Promise<void> {
  await prisma.paymentMethod
    .updateMany({
      where: { id: input.methodId, userId: input.userId, deletedAt: null },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      /* méthode supprimée entre-temps — on ignore */
    });
}

/**
 * Soft delete : marque deletedAt mais ne supprime pas physiquement.
 * Permet l'audit RGPD pendant 90 jours, après quoi un cron purge.
 */
export async function deletePaymentMethod(input: {
  userId: string;
  methodId: string;
}): Promise<void> {
  const r = await prisma.paymentMethod.updateMany({
    where: { id: input.methodId, userId: input.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (r.count === 0) {
    throw Errors.notFound("Ce moyen de paiement est déjà supprimé ou introuvable 🔍");
  }
}

/**
 * Renomme un moyen de paiement (label uniquement — la valeur ne change pas).
 */
export async function renamePaymentMethod(input: {
  userId: string;
  methodId: string;
  label: string;
}): Promise<void> {
  if (!input.label || input.label.trim().length < 2) {
    throw Errors.badRequest(
      "Le nom est trop court (au moins 2 caractères) 🏷️",
    );
  }
  const r = await prisma.paymentMethod.updateMany({
    where: { id: input.methodId, userId: input.userId, deletedAt: null },
    data: { label: input.label.trim().slice(0, 80) },
  });
  if (r.count === 0) {
    throw Errors.notFound("Moyen de paiement introuvable.");
  }
}
