"use client";

/**
 * V211.F — Vue Activité dédiée desktop.
 * V220.A — Page Activité enrichie + filtres date discrets.
 * =============================================================================
 * Feed chronologique 2-col : timeline à gauche (groupée par jour), panneau
 * filtres + classement « qui contribue le plus » à droite.
 *
 * V220.A — Fix bug critique : avant, le type local `ActivityItem` attendait
 * `{ message, actorId, actorName, meta }` mais le backend renvoie
 * `{ actor: { id, displayName } | null, payload }`. Du coup `item.message`
 * était undefined → seul la date s'affichait. Refonte complète :
 *
 *  - Vraie shape backend (actor + payload).
 *  - Helper `describe(item, t)` qui mappe chaque kind vers une phrase
 *    lisible avec placeholders (Marc a ajouté la dépense Restaurant…).
 *  - Filtres catégorie corrigés (matchers sur les vrais kinds enum).
 *  - Filtres période (Année / Mois / Trimestre / Personnalisé) discrets.
 *  - Iconographie enrichie par kind.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { DesktopGroupSectionShell } from "./group-desktop-shell";
import { SegmentedControl } from "./segmented-control";

// =============================================================================
// V220.A — Vraie shape du backend (cf. groups.routes.ts:769-784)
// =============================================================================
type ActivityItem = {
  id: string;
  kind: string;
  actor: { id: string; displayName: string } | null;
  payload: Record<string, any> | null;
  createdAt: string;
};

// V220.A — Filtres par catégorie (mappent les vrais kinds de l'enum).
const FILTERS: Array<{
  key: string;
  labelKey: string;
  matchers: string[];
  // Optionnel : matcher additionnel sur le payload (pour distinguer
  // EXPENSE_UPDATED « modif de dépense » d'un EXPENSE_UPDATED « settlement »).
  payloadMatch?: (p: Record<string, any> | null) => boolean;
  excludePayload?: (p: Record<string, any> | null) => boolean;
}> = [
  { key: "all", labelKey: "group.activity.tabAll", matchers: [] },
  {
    key: "EXPENSE",
    labelKey: "group.activity.tabExpenses",
    matchers: ["EXPENSE_ADDED", "EXPENSE_UPDATED", "EXPENSE_DELETED"],
    // Exclure les UPDATED qui sont en fait des règlements.
    excludePayload: (p) => p?.settlement === true,
  },
  {
    key: "SETTLEMENT",
    labelKey: "group.activity.tabSettlements",
    matchers: ["EXPENSE_UPDATED"],
    payloadMatch: (p) => p?.settlement === true,
  },
  {
    key: "TONTINE",
    labelKey: "group.activity.tabTontine",
    matchers: ["TONTINE_CREATED", "TONTINE_TURN_DISTRIBUTED"],
  },
  {
    key: "MEMBER",
    labelKey: "group.activity.tabMembers",
    matchers: [
      "MEMBER_INVITED",
      "MEMBER_JOINED",
      "MEMBER_LEFT",
      "MEMBER_REMOVED",
      "ROLE_CHANGED",
      "INVITE_LINK_CREATED",
      "GROUP_CREATED",
      "GROUP_RENAMED",
    ],
  },
  {
    key: "MEETING",
    labelKey: "group.activity.tabMeetings",
    matchers: ["MEETING_CREATED", "MEETING_FINALIZED"],
  },
];

function matchFilter(item: ActivityItem, key: string): boolean {
  const f = FILTERS.find((x) => x.key === key);
  if (!f || f.key === "all") return true;
  if (!f.matchers.includes(item.kind)) return false;
  if (f.payloadMatch && !f.payloadMatch(item.payload)) return false;
  if (f.excludePayload && f.excludePayload(item.payload)) return false;
  return true;
}

// =============================================================================
// V232 — Mapping kind → phrase complète et autonome
// =============================================================================
//
// Chaque entrée doit, autant que possible, répondre à : QUI, A FAIT QUOI,
// AVEC QUEL OBJET, POUR QUEL MONTANT, AVEC QUI, QUAND. Si une info manque
// dans le payload (legacy V220.A), on tombe en gracieux sur le titre court.
//
// Convention :
//  - On essaie d'abord la clé i18n versionnée `…v232` (phrase enrichie).
//  - Si elle n'existe pas (ou si le payload est trop maigre), on utilise
//    la clé V220.A historique (qui reste branchée pour rétro-compat).
//  - Si t() ne traduit rien, on retombe sur le fallback FR inline.
//
// Toutes les vars i18n sont en single-curly-brace `{var}` (cf. V225.B).
function describe(
  item: ActivityItem,
  t: ReturnType<typeof useT>,
  formatAmount: (a: number | string, c: string) => string,
  meId: string | null,
): { title: string; subtitle?: string } {
  const actor =
    item.actor?.id && meId && item.actor.id === meId
      ? t("group.activity.actorYou") || "Toi"
      : item.actor?.displayName || t("group.activity.system") || "Système";

  const p = item.payload ?? {};

  const tk = (
    key: string,
    vars?: Record<string, string>,
    fallback?: string,
  ) => t(key as any, vars) || fallback || key;

  // --------------------------------------------------------------------------
  // V232 — Helpers communs
  // --------------------------------------------------------------------------
  const fmtAmount = (amount: any, currency: any): string =>
    amount && currency ? formatAmount(String(amount), String(currency)) : "—";

  // Étiquette FR pour une fréquence de tontine.
  const freqLabel = (raw: any): string => {
    const v = String(raw ?? "").toLowerCase();
    if (v === "weekly")
      return t("group.activity.freq.weekly") || "par semaine";
    if (v === "biweekly")
      return t("group.activity.freq.biweekly") || "tous les 15 jours";
    if (v === "monthly") return t("group.activity.freq.monthly") || "par mois";
    if (v === "quarterly")
      return t("group.activity.freq.quarterly") || "par trimestre";
    if (v === "yearly") return t("group.activity.freq.yearly") || "par an";
    return v || "—";
  };

  // Étiquette FR pour un champ modifié (utilisé dans EXPENSE_UPDATED).
  const fieldLabel = (key: string): string => {
    switch (key) {
      case "description":
        return t("group.activity.field.description") || "intitulé";
      case "amount":
        return t("group.activity.field.amount") || "montant";
      case "currency":
        return t("group.activity.field.currency") || "devise";
      case "category":
        return t("group.activity.field.category") || "catégorie";
      case "paidBy":
        return t("group.activity.field.paidBy") || "payeur";
      case "splitMode":
        return t("group.activity.field.splitMode") || "mode de partage";
      case "participants":
        return t("group.activity.field.participants") || "participants";
      case "payers":
        return t("group.activity.field.payers") || "co-payeurs";
      case "occurredAt":
        return t("group.activity.field.occurredAt") || "date";
      case "location":
        return t("group.activity.field.location") || "lieu";
      default:
        return key;
    }
  };

  // Date FR courte « 12 mars » à partir d'un ISO date string.
  const shortDateFr = (iso: any): string => {
    try {
      const d = new Date(String(iso));
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  // Énumère une liste de noms en « A, B, C et D » (max 6, sinon « …et N de plus »).
  const namesList = (names: string[]): string => {
    const clean = names.filter(Boolean);
    if (clean.length === 0) return "";
    if (clean.length === 1) return clean[0];
    if (clean.length <= 6) {
      const head = clean.slice(0, -1).join(", ");
      const tail = clean[clean.length - 1];
      return `${head} et ${tail}`;
    }
    const visible = clean.slice(0, 5).join(", ");
    const remaining = clean.length - 5;
    return `${visible} et ${remaining} autres`;
  };

  // Étiquette FR pour un rôle.
  const roleLabel = (raw: any): string => {
    const v = String(raw ?? "").toUpperCase();
    if (v === "ADMIN") return t("group.activity.role.admin") || "Admin";
    if (v === "TREASURER")
      return t("group.activity.role.treasurer") || "Trésorier";
    if (v === "MEMBER") return t("group.activity.role.member") || "Membre";
    return v;
  };

  // --------------------------------------------------------------------------
  // Switch principal
  // --------------------------------------------------------------------------
  switch (item.kind) {
    case "GROUP_CREATED":
      return {
        title: tk(
          "group.activity.kind.GROUP_CREATED",
          { actor },
          `${actor} a créé le groupe.`,
        ),
      };

    case "GROUP_RENAMED": {
      const newName = String(p.newName ?? "—");
      const oldName = String(p.oldName ?? "");
      // V232 — si oldName présent, on dit « (anciennement … ) »
      if (oldName) {
        return {
          title: tk(
            "group.activity.kind.GROUP_RENAMED.v232",
            { actor, oldName, newName },
            `${actor} a renommé le groupe « ${oldName} » en « ${newName} ».`,
          ),
        };
      }
      return {
        title: tk(
          "group.activity.kind.GROUP_RENAMED",
          { actor, newName },
          `${actor} a renommé le groupe en « ${newName} ».`,
        ),
      };
    }

    case "MEMBER_INVITED": {
      // V232 — Cas spécial : on log aussi le "decline" via MEMBER_INVITED +
      // payload.action === "declined". Garder ce cas lisible.
      if (p.action === "declined") {
        const reason = String(p.reason ?? "");
        return {
          title: tk(
            "group.activity.kind.MEMBER_INVITATION_DECLINED.v232",
            { actor },
            `Une invitation envoyée par ${actor} a été refusée.`,
          ),
          subtitle: reason || undefined,
        };
      }
      const name = String(p.name ?? "");
      const contact = String(p.contactValue ?? p.contact ?? "");
      const channelRaw = String(p.channel ?? p.contactType ?? "").toLowerCase();
      const channelLabel =
        channelRaw === "phone" || channelRaw === "sms"
          ? t("group.activity.channel.sms") || "par SMS"
          : channelRaw === "email"
            ? t("group.activity.channel.email") || "par email"
            : "";

      // Construire la cible : « Toto Jean (toto@…) » ou « toto@… » ou « un contact »
      const target = name && contact
        ? `${name} (${contact})`
        : name || contact || (t("group.activity.unnamedContact") || "un contact");

      return {
        title: tk(
          "group.activity.kind.MEMBER_INVITED.v232",
          { actor, contact: target },
          `${actor} a invité ${target} à rejoindre le groupe.`,
        ),
        subtitle: channelLabel
          ? tk(
              "group.activity.kind.MEMBER_INVITED.channel",
              { channel: channelLabel },
              `Invitation envoyée ${channelLabel}.`,
            )
          : undefined,
      };
    }

    case "MEMBER_JOINED": {
      const via = String(p.via ?? "").toLowerCase();
      const viaTestMode = p.viaTestMode === true;
      let viaLabel = "";
      if (viaTestMode) {
        viaLabel = t("group.activity.via.testMode") || " (validé en mode test)";
      } else if (via === "invite_link") {
        viaLabel =
          t("group.activity.via.inviteLink") || " via un lien d'invitation";
      } else if (p.invitationId) {
        viaLabel =
          t("group.activity.via.invitation") || " suite à une invitation";
      }
      return {
        title: tk(
          "group.activity.kind.MEMBER_JOINED.v232",
          { actor, viaLabel },
          `${actor} a rejoint le groupe${viaLabel}.`,
        ),
      };
    }

    case "MEMBER_LEFT":
      return {
        title: tk(
          "group.activity.kind.MEMBER_LEFT",
          { actor },
          `${actor} a quitté le groupe.`,
        ),
      };

    case "MEMBER_REMOVED":
      return {
        title: tk(
          "group.activity.kind.MEMBER_REMOVED",
          { actor, memberName: String(p.memberName ?? "—") },
          `${actor} a retiré ${p.memberName ?? "—"} du groupe.`,
        ),
      };

    case "ROLE_CHANGED": {
      const memberName = String(p.memberName ?? "—");
      const newRole = roleLabel(p.newRole);
      const oldRole = p.oldRole ? roleLabel(p.oldRole) : "";
      if (oldRole) {
        return {
          title: tk(
            "group.activity.kind.ROLE_CHANGED.v232",
            { actor, memberName, oldRole, newRole },
            `${actor} a changé le rôle de ${memberName} de ${oldRole} en ${newRole}.`,
          ),
        };
      }
      return {
        title: tk(
          "group.activity.kind.ROLE_CHANGED",
          { actor, memberName, newRole },
          `${actor} a promu ${memberName} au rôle de ${newRole}.`,
        ),
      };
    }

    case "INVITE_LINK_CREATED": {
      const channel = String(p.channel ?? "").toLowerCase();
      if (channel === "broadcast") {
        return {
          title: tk(
            "group.activity.kind.INVITE_LINK_CREATED.broadcast.v232",
            { actor },
            `${actor} a généré un lien d'invitation à partager (WhatsApp / SMS / email).`,
          ),
        };
      }
      return {
        title: tk(
          "group.activity.kind.INVITE_LINK_CREATED.v232",
          { actor },
          `${actor} a créé un lien d'invitation public au groupe.`,
        ),
      };
    }

    case "EXPENSE_ADDED": {
      const description = String(p.description ?? "—");
      const amountFmt = fmtAmount(p.amount, p.currency);
      const count = Number(p.participantCount ?? 0);
      // V232 — Liste des participants si dispo dans le payload enrichi
      const names = Array.isArray(p.participantNames)
        ? (p.participantNames as any[])
            .map((n) => (typeof n === "string" ? n : ""))
            .filter(Boolean)
        : [];
      const participantsLine = names.length > 0 ? namesList(names) : "";

      const title = tk(
        "group.activity.kind.EXPENSE_ADDED.title.v232",
        { actor, description, amount: amountFmt },
        `${actor} a ajouté la dépense « ${description} » de ${amountFmt}.`,
      );

      // Sous-titre dépend de ce qu'on a comme info
      let subtitle: string;
      if (participantsLine && count > 0) {
        subtitle = tk(
          "group.activity.kind.EXPENSE_ADDED.subtitle.v232",
          {
            count: String(count),
            participants: participantsLine,
          },
          `Partagée entre ${count} personnes : ${participantsLine}.`,
        );
      } else if (count > 0) {
        subtitle = tk(
          "group.activity.kind.EXPENSE_ADDED.subtitle",
          { amount: amountFmt, count: String(count) },
          `Partagée entre ${count} personne(s).`,
        );
      } else {
        subtitle = tk(
          "group.activity.kind.EXPENSE_ADDED.subtitle",
          { amount: amountFmt, count: "0" },
          `Montant : ${amountFmt}.`,
        );
      }

      // V232 — Si lieu présent, on l'ajoute en fin de sous-titre
      if (p.location && typeof p.location === "string") {
        const locLabel = tk(
          "group.activity.kind.EXPENSE_ADDED.location",
          { location: String(p.location) },
          ` Lieu : ${p.location}.`,
        );
        subtitle = `${subtitle}${locLabel}`;
      }

      return { title, subtitle };
    }

    case "EXPENSE_UPDATED": {
      // V220.A — Cas spécial : settlement (créé / confirmé)
      if (p.settlement === true) {
        const amountFmt = fmtAmount(p.amount, p.currency);
        const fromName = String(p.fromName ?? "");
        const toName = String(p.toName ?? "");

        if (p.phase === "CONFIRMED") {
          // V232 — Phrase complète si on a from + to
          if (fromName && toName) {
            return {
              title: tk(
                "group.activity.kind.SETTLEMENT.CONFIRMED.v232",
                { actor, from: fromName, to: toName, amount: amountFmt },
                `${actor} a confirmé avoir reçu ${amountFmt} de ${fromName}. Solde réglé entre eux.`,
              ),
            };
          }
          return {
            title: tk(
              "group.activity.kind.SETTLEMENT_CONFIRMED",
              { actor, amount: amountFmt },
              `${actor} a confirmé un règlement de ${amountFmt}.`,
            ),
          };
        }

        // PROPOSED
        if (fromName && toName) {
          return {
            title: tk(
              "group.activity.kind.SETTLEMENT.PROPOSED.v232",
              { actor, from: fromName, to: toName, amount: amountFmt },
              `${actor} a déclaré avoir réglé ${amountFmt} à ${toName}. En attente de confirmation.`,
            ),
          };
        }
        return {
          title: tk(
            "group.activity.kind.SETTLEMENT_PROPOSED",
            { actor, amount: amountFmt },
            `${actor} a déclaré un règlement de ${amountFmt}.`,
          ),
        };
      }

      const description = String(p.description ?? "—");

      // V232 — Si `changes` détaillé est dispo, on construit une vraie phrase
      // « champ X passé de A à B; champ Y passé de C à D ».
      const changes = (p.changes ?? null) as Record<
        string,
        { before: any; after: any }
      > | null;
      const changedFields = Array.isArray(p.changedFields)
        ? (p.changedFields as string[])
        : [];

      const title = tk(
        "group.activity.kind.EXPENSE_UPDATED.title.v232",
        { actor, description },
        `${actor} a modifié la dépense « ${description} ».`,
      );

      if (changes && Object.keys(changes).length > 0) {
        const fmtVal = (field: string, v: any): string => {
          if (v === null || v === undefined) return "—";
          if (field === "amount") {
            return formatAmount(
              String(v),
              String((p.currency as any) ?? "EUR"),
            );
          }
          if (field === "occurredAt") {
            const d = shortDateFr(v);
            return d || String(v);
          }
          return String(v);
        };
        const parts: string[] = [];
        for (const field of Object.keys(changes)) {
          const { before, after } = changes[field];
          // Si avant/après identiques (peut arriver en cascade), on saute
          if (String(before) === String(after)) continue;
          const label = fieldLabel(field);
          parts.push(
            tk(
              "group.activity.kind.EXPENSE_UPDATED.change.v232",
              {
                field: label,
                before: fmtVal(field, before),
                after: fmtVal(field, after),
              },
              `${label} : ${fmtVal(field, before)} → ${fmtVal(field, after)}`,
            ),
          );
        }
        if (parts.length > 0) {
          return { title, subtitle: parts.join(" · ") };
        }
      }

      // Fallback : juste la liste des champs (V220.A)
      if (changedFields.length > 0) {
        const fields = changedFields.map(fieldLabel).join(", ");
        return {
          title,
          subtitle: tk(
            "group.activity.kind.EXPENSE_UPDATED.subtitle.v232",
            { changedFields: fields },
            `Champ(s) modifié(s) : ${fields}.`,
          ),
        };
      }

      return { title };
    }

    case "EXPENSE_DELETED": {
      const description = String(p.description ?? "—");
      const amountFmt = fmtAmount(p.amount, p.currency);
      // V232 — Si createdAt dispo, on contextualise « créée le … »
      const created = shortDateFr(p.createdAt) || shortDateFr(p.occurredAt);
      const title = tk(
        "group.activity.kind.EXPENSE_DELETED.title.v232",
        { actor, description, amount: amountFmt },
        `${actor} a supprimé la dépense « ${description} » de ${amountFmt}.`,
      );
      return {
        title,
        subtitle: created
          ? tk(
              "group.activity.kind.EXPENSE_DELETED.context.v232",
              { date: created },
              `Créée le ${created}.`,
            )
          : undefined,
      };
    }

    case "TONTINE_CREATED": {
      const tontineName = String(p.tontineName ?? "");
      const amountFmt = fmtAmount(p.contributionAmount, p.currency);
      const freq = freqLabel(p.frequency);
      const count = Number(p.memberCount ?? 0);
      const startDate = shortDateFr(p.startDate);

      // Construire le titre — avec ou sans nom de tontine
      const title = tontineName
        ? tk(
            "group.activity.kind.TONTINE_CREATED.title.v232",
            { actor, name: tontineName, amount: amountFmt, frequencyLabel: freq },
            `${actor} a créé la tontine « ${tontineName} » : ${amountFmt} ${freq}.`,
          )
        : tk(
            "group.activity.kind.TONTINE_CREATED.title.untitled.v232",
            { actor, amount: amountFmt, frequencyLabel: freq },
            `${actor} a créé une tontine : ${amountFmt} ${freq}.`,
          );

      // Subtitle : participants + date de départ si dispo
      let subtitle = "";
      if (count > 0 && startDate) {
        subtitle = tk(
          "group.activity.kind.TONTINE_CREATED.subtitle.v232",
          { memberCount: String(count), startDate },
          `${count} participants. Premier tour à partir du ${startDate}.`,
        );
      } else if (count > 0) {
        subtitle = tk(
          "group.activity.kind.TONTINE_CREATED.subtitle",
          { amount: amountFmt, frequency: freq, memberCount: String(count) },
          `${count} participants.`,
        );
      } else if (startDate) {
        subtitle = tk(
          "group.activity.kind.TONTINE_CREATED.startOnly.v232",
          { startDate },
          `À partir du ${startDate}.`,
        );
      }

      return { title, subtitle: subtitle || undefined };
    }

    case "TONTINE_TURN_DISTRIBUTED": {
      const tontineName = String(p.tontineName ?? "");
      const beneficiary = String(p.beneficiaryName ?? actor);
      const amountFmt = fmtAmount(p.amount, p.currency);
      const turnNumber = Number(p.turnNumber ?? 0);
      const totalTurns = Number(p.totalTurns ?? 0);
      const confirmedCount = Number(p.confirmedCount ?? 0);
      const totalContributions = Number(p.totalContributions ?? 0);

      const title = tontineName
        ? tk(
            "group.activity.kind.TONTINE_TURN_DISTRIBUTED.title.v232",
            { beneficiary, tontineName, amount: amountFmt },
            `${beneficiary} a reçu son tour de tontine « ${tontineName} » : ${amountFmt}.`,
          )
        : tk(
            "group.activity.kind.TONTINE_TURN_DISTRIBUTED.title.untitled.v232",
            { beneficiary, amount: amountFmt },
            `${beneficiary} a reçu son tour de tontine : ${amountFmt}.`,
          );

      // Sous-titre : « Tour N/M — K/L confirmations »
      let subtitle = "";
      if (turnNumber > 0 && totalTurns > 0) {
        if (totalContributions > 0) {
          subtitle = tk(
            "group.activity.kind.TONTINE_TURN_DISTRIBUTED.subtitle.v232",
            {
              turnNumber: String(turnNumber),
              totalTurns: String(totalTurns),
              confirmedCount: String(confirmedCount),
              totalContributions: String(totalContributions),
            },
            `Tour ${turnNumber} sur ${totalTurns} — ${confirmedCount}/${totalContributions} contributions confirmées.`,
          );
        } else {
          subtitle = tk(
            "group.activity.kind.TONTINE_TURN_DISTRIBUTED.subtitleNoCount.v232",
            {
              turnNumber: String(turnNumber),
              totalTurns: String(totalTurns),
            },
            `Tour ${turnNumber} sur ${totalTurns} distribué.`,
          );
        }
      }

      return { title, subtitle: subtitle || undefined };
    }

    case "MEETING_CREATED":
      return {
        title: tk(
          "group.activity.kind.MEETING_CREATED.v232",
          { actor },
          `${actor} a démarré une réunion du groupe.`,
        ),
      };

    case "MEETING_FINALIZED":
      return {
        title: tk(
          "group.activity.kind.MEETING_FINALIZED.v232",
          { actor },
          `${actor} a finalisé le compte rendu de réunion.`,
        ),
      };

    default:
      return {
        title: `${actor} — ${item.kind}`,
      };
  }
}

// =============================================================================
// V220.A — Icônes par kind enrichies
// =============================================================================
function iconFor(
  item: ActivityItem,
): { bg: string; fg: string; symbol: string } {
  const k = item.kind;
  const isSettlement = item.payload?.settlement === true;

  if (k.startsWith("TONTINE_")) {
    return { bg: "#E5E0F0", fg: "#3A2E5C", symbol: "◯" };
  }
  if (k === "EXPENSE_ADDED") {
    return { bg: "#F4E4C1", fg: "#6B4A1A", symbol: "+" };
  }
  if (k === "EXPENSE_DELETED") {
    return { bg: "#FBE5DC", fg: "#9F4628", symbol: "✕" };
  }
  if (k === "EXPENSE_UPDATED") {
    if (isSettlement) {
      return { bg: "#D9EAE0", fg: "#0F5D43", symbol: "✓" };
    }
    return { bg: "#F4ECD9", fg: "#6B4A1A", symbol: "✎" };
  }
  if (k.startsWith("MEETING_")) {
    return { bg: "#E5E0F0", fg: "#3A2E5C", symbol: "🎙" };
  }
  if (
    k.startsWith("MEMBER_") ||
    k === "INVITE_LINK_CREATED" ||
    k === "ROLE_CHANGED"
  ) {
    return { bg: "#F4ECD9", fg: "#6B4A1A", symbol: "👤" };
  }
  if (k === "GROUP_CREATED" || k === "GROUP_RENAMED") {
    return { bg: "#EFE9DA", fg: "#2B1F15", symbol: "★" };
  }
  return { bg: "#EBD7CC", fg: "#7A2C12", symbol: "•" };
}

// =============================================================================
// Group par jour (label aujourd'hui / hier / date)
// =============================================================================
function bucketByDay(items: ActivityItem[]): Array<{ label: string; items: ActivityItem[] }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const buckets = new Map<string, ActivityItem[]>();

  for (const item of items) {
    const d = new Date(item.createdAt);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    let label: string;
    if (dayStart === today) label = "aujourd'hui";
    else if (dayStart === yesterday) label = "hier";
    else label = d.toLocaleDateString();
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(item);
  }
  return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
}

// =============================================================================
// V220.A — Compute range from periodMode + selections
// =============================================================================
type PeriodMode = "year" | "month" | "quarter" | "custom";

function computeRange(input: {
  mode: PeriodMode;
  year: number | null; // null = toutes années
  month: number; // 0..11
  quarter: number; // 1..4
  customStart: string;
  customEnd: string;
}): { start: Date | null; end: Date | null } {
  if (input.mode === "year") {
    if (input.year === null) return { start: null, end: null };
    return {
      start: new Date(input.year, 0, 1, 0, 0, 0, 0),
      end: new Date(input.year, 11, 31, 23, 59, 59, 999),
    };
  }
  if (input.mode === "month") {
    const y = input.year ?? new Date().getFullYear();
    const lastDay = new Date(y, input.month + 1, 0).getDate();
    return {
      start: new Date(y, input.month, 1, 0, 0, 0, 0),
      end: new Date(y, input.month, lastDay, 23, 59, 59, 999),
    };
  }
  if (input.mode === "quarter") {
    const y = input.year ?? new Date().getFullYear();
    const q0Month = (input.quarter - 1) * 3;
    return {
      start: new Date(y, q0Month, 1, 0, 0, 0, 0),
      end: new Date(y, q0Month + 3, 0, 23, 59, 59, 999),
    };
  }
  // custom
  const start = input.customStart ? new Date(input.customStart + "T00:00:00") : null;
  const end = input.customEnd ? new Date(input.customEnd + "T23:59:59") : null;
  return { start, end };
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================
export function DesktopGroupActivityView({
  group,
}: {
  group: { id: string; name: string };
}) {
  const t = useT();
  const { formatAmount } = useCurrency();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [meId, setMeId] = useState<string | null>(null);

  // V220.A — État des filtres de période
  const [periodMode, setPeriodMode] = useState<PeriodMode>("year");
  const currentYear = new Date().getFullYear();
  const [selYear, setSelYear] = useState<number | null>(currentYear);
  const [selMonth, setSelMonth] = useState<number>(new Date().getMonth());
  const [selQuarter, setSelQuarter] = useState<number>(
    Math.floor(new Date().getMonth() / 3) + 1,
  );
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listActivity(group.id);
        if (!cancelled) setItems(list);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  // Récupère meId depuis localStorage (best effort — utilisé pour libeller « Toi »)
  useEffect(() => {
    try {
      const id =
        typeof window !== "undefined" ? localStorage.getItem("user.id") : null;
      setMeId(id);
    } catch {
      // ignore
    }
  }, []);

  // V220.A — Années où il y a eu de l'activité (pour les selects)
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const i of items) years.add(new Date(i.createdAt).getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [items]);

  const range = useMemo(
    () =>
      computeRange({
        mode: periodMode,
        year: selYear,
        month: selMonth,
        quarter: selQuarter,
        customStart,
        customEnd,
      }),
    [periodMode, selYear, selMonth, selQuarter, customStart, customEnd],
  );

  // Filtre temps + catégorie
  const filtered = useMemo(() => {
    return items.filter((i) => {
      const d = new Date(i.createdAt);
      if (range.start && d < range.start) return false;
      if (range.end && d > range.end) return false;
      return matchFilter(i, filter);
    });
  }, [items, filter, range]);

  const buckets = useMemo(() => bucketByDay(filtered), [filtered]);

  // Classement contributeurs (par nombre d'événements émis, sur l'ensemble)
  const ranking = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const i of items) {
      if (!i.actor?.id) continue;
      const cur = counts.get(i.actor.id) || {
        name: i.actor.displayName || "—",
        n: 0,
      };
      counts.set(i.actor.id, { name: cur.name, n: cur.n + 1 });
    }
    return Array.from(counts.values()).sort((a, b) => b.n - a.n).slice(0, 5);
  }, [items]);

  // Compteurs pour filtres catégorie (sur la période sélectionnée)
  const periodFiltered = useMemo(() => {
    return items.filter((i) => {
      const d = new Date(i.createdAt);
      if (range.start && d < range.start) return false;
      if (range.end && d > range.end) return false;
      return true;
    });
  }, [items, range]);

  // Libellés FR fallback pour les noms de mois / trimestres
  const monthNames = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat(undefined, { month: "long" });
      return Array.from({ length: 12 }, (_, m) =>
        fmt.format(new Date(2000, m, 1)),
      );
    } catch {
      return [
        "Janvier",
        "Février",
        "Mars",
        "Avril",
        "Mai",
        "Juin",
        "Juillet",
        "Août",
        "Septembre",
        "Octobre",
        "Novembre",
        "Décembre",
      ];
    }
  }, []);

  const resetPeriod = () => {
    setPeriodMode("year");
    setSelYear(null); // « Toutes années »
  };

  return (
    <DesktopGroupSectionShell
      groupId={group.id}
      groupName={group.name}
      sectionLabel={t("group.hub.activity") || "Activité"}
      subtitle={`${filtered.length} ${filtered.length > 1 ? "événements" : "événement"}`}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 16 }}>
        {/* === COL GAUCHE : feed ====================================== */}
        <section>
          {buckets.length === 0 ? (
            <div
              style={{
                padding: 50,
                textAlign: "center",
                color: "#8B6F47",
                background: "#FAF6EE",
                border: "0.5px dashed #D9C8A6",
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 32, opacity: 0.4 }}>⏱</div>
              <div style={{ fontSize: 13, marginTop: 6, color: "#2B1F15", fontWeight: 500 }}>
                {t("group.activity.empty") || "Pas encore d'activité"}
              </div>
            </div>
          ) : (
            buckets.map((bucket) => (
              <div key={bucket.label}>
                <div
                  style={{
                    fontSize: 10,
                    color: "#8B6F47",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 6,
                    marginTop: 10,
                  }}
                >
                  {bucket.label}
                </div>
                {bucket.items.map((item) => {
                  const ic = iconFor(item);
                  const { title, subtitle } = describe(
                    item,
                    t,
                    formatAmount,
                    meId,
                  );
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        gap: 11,
                        padding: "8px 0",
                        borderBottom: "0.5px solid #EEE4CC",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: ic.bg,
                          color: ic.fg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {ic.symbol}
                      </div>
                      <div style={{ flex: 1, fontSize: 12, color: "#2B1F15", lineHeight: 1.55 }}>
                        <div>{title}</div>
                        {subtitle && (
                          <div style={{ fontSize: 11, color: "#5A4632", marginTop: 1 }}>
                            {subtitle}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "#8B6F47", marginTop: 1 }}>
                          {/* V232 — Date plus parlante : jour court + heure */}
                          {(() => {
                            try {
                              const d = new Date(item.createdAt);
                              return d.toLocaleString(undefined, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                            } catch {
                              return new Date(item.createdAt).toLocaleString();
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </section>

        {/* === COL DROITE : filtres + période + ranking ================ */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* --- Bloc filtres catégorie (existant) ----------------------- */}
          <div
            style={{
              background: "#FFFFFF",
              border: "0.5px solid #D9C8A6",
              borderRadius: 11,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {t("group.activity.filters") || "filtres"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {FILTERS.map((f) => {
                const isActive = filter === f.key;
                const count =
                  f.key === "all"
                    ? periodFiltered.length
                    : periodFiltered.filter((i) => matchFilter(i, f.key)).length;
                const label = t(f.labelKey as any) || f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: "5px 10px",
                      background: isActive ? "#C58A2E" : "#FAF6EE",
                      color: isActive ? "#FAF6EE" : "#8B6F47",
                      border: isActive ? "none" : "0.5px solid #D9C8A6",
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: isActive ? 500 : 400,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- V220.A : Bloc PÉRIODE (discret) ------------------------ */}
          <div
            style={{
              background: "#FFFFFF",
              border: "0.5px solid #D9C8A6",
              borderRadius: 11,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              {t("group.activity.period") || "Période"}
            </div>
            <SegmentedControl
              size="sm"
              segments={[
                { value: "year", label: t("group.activity.periodYear") || "Année" },
                { value: "month", label: t("group.activity.periodMonth") || "Mois" },
                { value: "quarter", label: t("group.activity.periodQuarter") || "Trimestre" },
                { value: "custom", label: t("group.activity.periodCustom") || "Personnalisé" },
              ]}
              value={periodMode}
              onChange={(v) => setPeriodMode(v as PeriodMode)}
              ariaLabel={t("group.activity.period") || "Période"}
            />

            {/* Inputs contextuels selon le mode */}
            <div style={{ marginTop: 8 }}>
              {periodMode === "year" && (
                <select
                  value={selYear === null ? "" : String(selYear)}
                  onChange={(e) =>
                    setSelYear(e.target.value === "" ? null : Number(e.target.value))
                  }
                  style={{
                    width: "100%",
                    fontSize: 11,
                    padding: "5px 8px",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 7,
                    background: "#FAF6EE",
                    color: "#2B1F15",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="">
                    {t("group.activity.allYears") || "Toutes les années"}
                  </option>
                  {availableYears.length === 0 ? (
                    <option value={String(currentYear)}>{currentYear}</option>
                  ) : (
                    availableYears.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))
                  )}
                </select>
              )}

              {periodMode === "month" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <select
                    value={String(selYear ?? currentYear)}
                    onChange={(e) => setSelYear(Number(e.target.value))}
                    style={{
                      fontSize: 11,
                      padding: "5px 8px",
                      border: "0.5px solid #D9C8A6",
                      borderRadius: 7,
                      background: "#FAF6EE",
                      color: "#2B1F15",
                      fontFamily: "inherit",
                    }}
                  >
                    {(availableYears.length ? availableYears : [currentYear]).map(
                      (y) => (
                        <option key={y} value={String(y)}>
                          {y}
                        </option>
                      ),
                    )}
                  </select>
                  <select
                    value={String(selMonth)}
                    onChange={(e) => setSelMonth(Number(e.target.value))}
                    style={{
                      fontSize: 11,
                      padding: "5px 8px",
                      border: "0.5px solid #D9C8A6",
                      borderRadius: 7,
                      background: "#FAF6EE",
                      color: "#2B1F15",
                      fontFamily: "inherit",
                    }}
                  >
                    {monthNames.map((label, i) => (
                      <option key={i} value={String(i)}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {periodMode === "quarter" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <select
                    value={String(selYear ?? currentYear)}
                    onChange={(e) => setSelYear(Number(e.target.value))}
                    style={{
                      fontSize: 11,
                      padding: "5px 8px",
                      border: "0.5px solid #D9C8A6",
                      borderRadius: 7,
                      background: "#FAF6EE",
                      color: "#2B1F15",
                      fontFamily: "inherit",
                    }}
                  >
                    {(availableYears.length ? availableYears : [currentYear]).map(
                      (y) => (
                        <option key={y} value={String(y)}>
                          {y}
                        </option>
                      ),
                    )}
                  </select>
                  <select
                    value={String(selQuarter)}
                    onChange={(e) => setSelQuarter(Number(e.target.value))}
                    style={{
                      fontSize: 11,
                      padding: "5px 8px",
                      border: "0.5px solid #D9C8A6",
                      borderRadius: 7,
                      background: "#FAF6EE",
                      color: "#2B1F15",
                      fontFamily: "inherit",
                    }}
                  >
                    <option value="1">T1</option>
                    <option value="2">T2</option>
                    <option value="3">T3</option>
                    <option value="4">T4</option>
                  </select>
                </div>
              )}

              {periodMode === "custom" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <label
                    style={{
                      fontSize: 10,
                      color: "#8B6F47",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {t("group.activity.periodFrom") || "Du"}
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      style={{
                        fontSize: 11,
                        padding: "4px 6px",
                        border: "0.5px solid #D9C8A6",
                        borderRadius: 6,
                        background: "#FAF6EE",
                        color: "#2B1F15",
                        fontFamily: "inherit",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      fontSize: 10,
                      color: "#8B6F47",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {t("group.activity.periodTo") || "Au"}
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      style={{
                        fontSize: 11,
                        padding: "4px 6px",
                        border: "0.5px solid #D9C8A6",
                        borderRadius: 6,
                        background: "#FAF6EE",
                        color: "#2B1F15",
                        fontFamily: "inherit",
                      }}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                onClick={resetPeriod}
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: "#8B6F47",
                  textDecoration: "underline",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                {t("group.activity.clearPeriod") || "Tout afficher"}
              </button>
            </div>
          </div>

          {/* --- Bloc ranking (existant) -------------------------------- */}
          {ranking.length > 0 && (
            <div
              style={{
                background: "#F4ECD9",
                borderRadius: 11,
                padding: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#8B6F47",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                {t("group.activity.ranking") || "qui contribue le plus"}
              </div>
              {ranking.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "3px 0",
                    fontSize: 11,
                  }}
                >
                  <span>
                    <b style={{ fontWeight: 500 }}>{i + 1}.</b> {r.name}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: "#8B6F47",
                    }}
                  >
                    {r.n} {r.n > 1 ? "événements" : "événement"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </DesktopGroupSectionShell>
  );
}
