/**
 * V30 · Service `CrossGroupSettlement` — règlement multi-groupe en 1 tap.
 *
 * Permet de solder en une seule transaction externe (Mobile Money, virement,
 * espèces) plusieurs dettes éparpillées sur N groupes. Le service crée :
 *   1. Un parent `CrossGroupSettlement` avec le `totalAmount` net échangé
 *   2. N enfants `Settlement` (un par groupe affecté), chacun avec `crossGroupId`
 *
 * Lors du `confirm` final (par le créancier net), tous les enfants passent
 * `CONFIRMED` ensemble dans une `prisma.$transaction(...)` — garantie ACID :
 * soit tout passe, soit rien ne change. Les caches `person-balances` des
 * deux parties sont invalidés à ce moment-là.
 */

import Decimal from "decimal.js";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { cacheDel } from "../../lib/cache.js";
import { events } from "../../lib/event-stream.js";
import { notifyOne } from "../notifications/notifications.service.js";
import { sendEmail } from "../../lib/messaging.js";

export interface ChildSettlementInput {
  groupId: string;
  /** Sens du child : `direction` indique qui paye qui sur ce groupe spécifique.
   *  - "actorPays"     → actor (initiateur) doit payer X sur ce groupe
   *  - "actorReceives" → actor reçoit X de la contrepartie sur ce groupe
   *  Par construction, la somme algébrique des `actorReceives - actorPays`
   *  doit donner le `totalAmount` du parent. */
  direction: "actorPays" | "actorReceives";
  /** Montant absolu dans la devise du groupe. */
  amount: string;
  /** Devise du groupe (info — réutilisée pour le child Settlement.currency). */
  currency: string;
}

export interface CreateCrossGroupSettlementInput {
  /** L'utilisateur qui initie le règlement (actor). */
  actorUserId: string;
  /** La contrepartie avec qui on solde. */
  counterpartyUserId: string;
  /** Sens net : actor paye `totalAmount` à counterparty (ou inverse). */
  netDirection: "actorPays" | "actorReceives";
  /** Montant net en devise utilisateur — ce qui circule en cash. */
  totalAmount: string;
  /** Devise dans laquelle `totalAmount` est négocié (généralement
   *  `User.defaultCurrency` de l'actor). */
  currency: string;
  /** Décomposition par groupe — au moins 1 élément, max raisonnable 50. */
  children: ChildSettlementInput[];
  /** Note optionnelle (référence Mobile Money, etc.). */
  memo?: string;
}

/**
 * Crée un parent + N children dans une transaction Prisma.
 *
 * Validations :
 *  - actor et counterparty distincts
 *  - actor doit être membre de tous les groupes mentionnés
 *  - counterparty doit aussi être membre de chaque groupe
 *  - au moins 1 child, max 50
 *  - amounts positifs, devises ≥ 1 char chacune
 *  - ⚠ pas de validation que la somme des children = totalAmount,
 *    c'est volontaire : la conversion FX peut introduire de petits écarts,
 *    et l'utilisateur peut choisir de ne pas inclure tous les groupes.
 */
export async function createCrossGroupSettlement(
  input: CreateCrossGroupSettlementInput,
): Promise<{ id: string; childrenIds: string[] }> {
  if (input.actorUserId === input.counterpartyUserId) {
    throw Errors.badRequest(
      "Tu ne peux pas créer un règlement avec toi-même 🤝",
    );
  }
  if (input.children.length === 0) {
    throw Errors.badRequest(
      "Il faut au moins un groupe à solder dans ce règlement 📋",
    );
  }
  if (input.children.length > 50) {
    throw Errors.badRequest(
      "Trop de groupes à solder en une fois (max 50) — sépare en plusieurs règlements.",
    );
  }
  const totalAmount = new Decimal(input.totalAmount);
  if (totalAmount.lessThanOrEqualTo(0)) {
    throw Errors.badRequest(
      "Le montant total doit être strictement positif 💸",
    );
  }

  // Valide tous les groupIds en une requête : actor ET counterparty doivent
  // être membres de chaque groupe mentionné.
  const groupIds = Array.from(new Set(input.children.map((c) => c.groupId)));
  const memberships = await prisma.groupMember.findMany({
    where: {
      groupId: { in: groupIds },
      userId: { in: [input.actorUserId, input.counterpartyUserId] },
    },
    select: { groupId: true, userId: true },
  });
  const memberMap = new Map<string, Set<string>>();
  for (const m of memberships) {
    let s = memberMap.get(m.groupId);
    if (!s) {
      s = new Set();
      memberMap.set(m.groupId, s);
    }
    s.add(m.userId);
  }
  for (const gid of groupIds) {
    const s = memberMap.get(gid);
    if (!s || !s.has(input.actorUserId) || !s.has(input.counterpartyUserId)) {
      throw Errors.forbidden(
        "Un des groupes mentionnés n'a pas les deux personnes en tant que membres 👥",
        {
          tip: `Groupe concerné : ${gid}. Vérifie que la contrepartie est bien dans ce groupe.`,
        },
      );
    }
  }

  // Construction des données de child Settlements. Pour chaque child :
  //  - "actorPays" → fromUser=actor, toUser=counterparty
  //  - "actorReceives" → fromUser=counterparty, toUser=actor
  // On crée chaque child directement en `PROPOSED` (le parent passera tous
  // les enfants à CONFIRMED en cascade au confirm final).
  const childrenData = input.children.map((c) => {
    const amt = new Decimal(c.amount);
    if (amt.lessThanOrEqualTo(0)) {
      throw Errors.badRequest(
        `Montant invalide pour le groupe ${c.groupId} : doit être > 0`,
      );
    }
    const fromUserId =
      c.direction === "actorPays" ? input.actorUserId : input.counterpartyUserId;
    const toUserId =
      c.direction === "actorPays" ? input.counterpartyUserId : input.actorUserId;
    return {
      groupId: c.groupId,
      fromUserId,
      toUserId,
      amount: amt,
      currency: c.currency.toUpperCase(),
      status: "PROPOSED" as const,
    };
  });

  // Sens du parent (qui paye le `totalAmount` net)
  const parentFromUserId =
    input.netDirection === "actorPays" ? input.actorUserId : input.counterpartyUserId;
  const parentToUserId =
    input.netDirection === "actorPays" ? input.counterpartyUserId : input.actorUserId;

  // Transaction : parent + tous les enfants ensemble
  const result = await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent = await (tx as any).crossGroupSettlement.create({
      data: {
        fromUserId: parentFromUserId,
        toUserId: parentToUserId,
        totalAmount,
        currency: input.currency.toUpperCase(),
        status: "PROPOSED",
        memo: input.memo ?? null,
      },
    });
    const children: { id: string }[] = [];
    for (const cd of childrenData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = await (tx as any).settlement.create({
        data: { ...cd, crossGroupId: parent.id },
      });
      children.push({ id: child.id });
    }
    return { id: parent.id, childrenIds: children.map((c) => c.id) };
  });

  // X3 — Notifie les 2 parties via SSE pour qu'elles voient apparaître
  // immédiatement le règlement en attente dans leur inbox (sans reload).
  // Note : on émet APRÈS la transaction Prisma (succès garanti).
  events.crossSettlementCreated(
    parentFromUserId,
    parentToUserId,
    result.id,
    totalAmount.toFixed(2),
    input.currency.toUpperCase(),
  );

  // X5 — Notification persistante + email pour la counterparty (= la
  // personne qui n'est PAS l'initiateur). Important : sinon le receveur
  // ne saurait pas qu'un règlement attend son action (cf. cas créancier
  // qui doit confirmer la réception, ou débiteur qui doit virer le cash).
  const counterpartyId =
    parentFromUserId === input.actorUserId
      ? parentToUserId
      : parentFromUserId;
  void notifyCounterparty(counterpartyId, result.id, {
    actorUserId: input.actorUserId,
    counterpartyIsCreditor: parentToUserId === counterpartyId,
    totalAmount: totalAmount.toFixed(2),
    currency: input.currency.toUpperCase(),
    childCount: input.children.length,
  }).catch((err) => {
    // Best-effort : un échec de notif ne doit JAMAIS faire échouer la
    // création du règlement. Log only.
    console.warn("[cross-settle] notification dispatch failed", err);
  });

  return result;
}

/**
 * X5 · Helper interne pour envoyer la notification + email à la counterparty
 * d'un cross-settlement nouvellement créé. Best-effort (pas de throw).
 */
async function notifyCounterparty(
  counterpartyId: string,
  crossId: string,
  ctx: {
    actorUserId: string;
    counterpartyIsCreditor: boolean;
    totalAmount: string;
    currency: string;
    childCount: number;
  },
): Promise<void> {
  // Récupère noms + email de la counterparty
  const [counterparty, actor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: counterpartyId },
      select: {
        displayName: true,
        defaultLocale: true,
        contacts: {
          where: { type: "EMAIL", isVerified: true },
          select: { value: true },
          take: 1,
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: ctx.actorUserId },
      select: { displayName: true },
    }),
  ]);
  if (!counterparty || !actor) return;
  const actorName = actor.displayName;
  const amountFormatted = `${ctx.totalAmount} ${ctx.currency}`;

  // 1. Notification in-app (apparaît dans le NotificationCenter)
  await notifyOne(counterpartyId, {
    // On réutilise SETTLEMENT_PROPOSED — sémantiquement proche, évite une
    // migration. Le payload distingue cross-settlement via le champ kind.
    kind: "SETTLEMENT_PROPOSED",
    title: ctx.counterpartyIsCreditor
      ? `${actorName} te règle ${amountFormatted}`
      : `${actorName} te demande de régler ${amountFormatted}`,
    body: ctx.counterpartyIsCreditor
      ? `Sur ${ctx.childCount} groupes partagés. Confirme la réception quand tu auras reçu les fonds.`
      : `Compensation nette sur ${ctx.childCount} groupes partagés. Vire-lui le cash externe (Mobile Money / virement).`,
    link: `/dashboard?cross=${crossId}`,
    // V98 — Émetteur = celui qui propose le règlement cross-groupe
    senderUserId: ctx.actorUserId,
    payload: {
      crossSettlementId: crossId,
      totalAmount: ctx.totalAmount,
      currency: ctx.currency,
      role: ctx.counterpartyIsCreditor ? "creditor" : "debtor",
    },
  });

  // 2. Email (best-effort — silencieux si pas d'email vérifié)
  const email = counterparty.contacts?.[0]?.value;
  if (email) {
    const subject = ctx.counterpartyIsCreditor
      ? `BMD · ${actorName} te règle ${amountFormatted} 💰`
      : `BMD · ${actorName} te demande ${amountFormatted} 💸`;
    const body = ctx.counterpartyIsCreditor
      ? `Bonjour ${counterparty.displayName},\n\n${actorName} a initié un règlement multi-groupe de ${amountFormatted} qui vous concerne.\n\nDès que tu auras reçu les fonds (Mobile Money, virement, espèces), connecte-toi à BMD et confirme la réception en 1 clic. Tous les ${ctx.childCount} groupes seront automatiquement passés à zéro.\n\nOuvrir BMD : https://www.backmesdo.com/dashboard\n\n— L'équipe BMD`
      : `Bonjour ${counterparty.displayName},\n\n${actorName} a initié un règlement multi-groupe de ${amountFormatted} en sa faveur.\n\nVire-lui ce montant en cash externe (Mobile Money, virement, espèces). Une fois reçu, ${actorName} confirmera dans BMD et les ${ctx.childCount} groupes concernés seront automatiquement soldés.\n\nOuvrir BMD : https://www.backmesdo.com/dashboard\n\n— L'équipe BMD`;
    await sendEmail({
      to: email,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });
  }
}

/**
 * Confirme un cross-group settlement (= le créancier net déclare avoir reçu
 * le `totalAmount`). Tous les enfants passent à `CONFIRMED` en cascade.
 *
 * Au passage on invalide les caches person-balances des 2 parties pour que
 * l'UI rafraîchisse instantanément.
 *
 * Retourne le parent mis à jour (les enfants sont consultables via la relation).
 */
export async function confirmCrossGroupSettlement(
  crossId: string,
  confirmingUserId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cross = await (prisma as any).crossGroupSettlement.findUnique({
    where: { id: crossId },
  });
  if (!cross) {
    throw Errors.notFound("Règlement multi-groupe introuvable 🔍");
  }
  if (cross.toUserId !== confirmingUserId) {
    throw Errors.forbidden(
      "Seule la personne qui devait recevoir l'argent peut confirmer 💰",
    );
  }
  if (cross.status === "CONFIRMED") {
    throw Errors.invalidState({
      what: "Ce règlement multi-groupe",
      currentState: "déjà confirmé ✅",
      tip: "Pas besoin de confirmer deux fois.",
    });
  }
  if (cross.status === "CANCELLED") {
    throw Errors.invalidState({
      what: "Ce règlement multi-groupe",
      currentState: "annulé",
      tip: "Crée un nouveau règlement si besoin.",
    });
  }

  // Cascade atomique : parent + tous les enfants à CONFIRMED
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const px = prisma as any;
  await prisma.$transaction([
    px.crossGroupSettlement.update({
      where: { id: crossId },
      data: {
        status: "CONFIRMED",
        confirmedByPayeeAt: new Date(),
        // Le payer a "implicitement" déjà payé (cash externe) — on stamp
        // confirmedByPayerAt aussi pour cohérence avec le ledger
        confirmedByPayerAt:
          cross.confirmedByPayerAt ?? new Date(),
      },
    }),
    px.settlement.updateMany({
      where: { crossGroupId: crossId },
      data: {
        status: "CONFIRMED",
        confirmedByPayerAt: new Date(),
        confirmedByPayeeAt: new Date(),
      },
    }),
  ]);

  // Invalidation cache pair-à-pair pour les 2 parties
  await Promise.all([
    cacheDel(`person-balances:${cross.fromUserId}`),
    cacheDel(`person-balances:${cross.toUserId}`),
  ]);

  // X3 — SSE notification : les 2 parties voient leur dashboard se rafraîchir
  // automatiquement (vue par personne, inbox, soldes des groupes affectés).
  events.crossSettlementConfirmed(
    cross.fromUserId,
    cross.toUserId,
    crossId,
  );
}

/**
 * Annule un cross-group settlement encore en `PROPOSED` (ou `PAID` dans
 * certains cas). Cascade vers les enfants (status CANCELLED).
 *
 * Cas d'usage : l'utilisateur a créé le règlement par erreur, ou la
 * contrepartie ne veut finalement pas régler comme ça.
 */
export async function cancelCrossGroupSettlement(
  crossId: string,
  actingUserId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cross = await (prisma as any).crossGroupSettlement.findUnique({
    where: { id: crossId },
  });
  if (!cross) {
    throw Errors.notFound("Règlement multi-groupe introuvable 🔍");
  }
  // Soit le payeur soit le receveur peut annuler tant que ce n'est pas confirmé
  if (
    cross.fromUserId !== actingUserId &&
    cross.toUserId !== actingUserId
  ) {
    throw Errors.forbidden(
      "Seules les 2 parties impliquées peuvent annuler ce règlement.",
    );
  }
  if (cross.status === "CONFIRMED") {
    throw Errors.invalidState({
      what: "Ce règlement",
      currentState: "déjà confirmé — l'argent a été reçu",
      tip: "Pour faire marche arrière, crée un règlement inverse manuellement.",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const px = prisma as any;
  await prisma.$transaction([
    px.crossGroupSettlement.update({
      where: { id: crossId },
      data: { status: "CANCELLED" },
    }),
    px.settlement.updateMany({
      where: { crossGroupId: crossId },
      data: { status: "CANCELLED" },
    }),
  ]);

  // X3 — Notifie les 2 parties que le règlement a été annulé pour qu'elles
  // retirent l'item de leur inbox côté UI sans avoir à reload.
  events.crossSettlementCancelled(cross.fromUserId, cross.toUserId, crossId);
}
