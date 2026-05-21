"use client";

/**
 * <RealtimeNotifier> · Bridge SSE → toasts in-app.
 *
 * Quand un event arrive via le bus realtime (SSE personnel `/events/me`),
 * on déclenche un toast contextuel :
 *
 *   - Marie a ajouté une dépense (50 €) dans Voyage Dakar
 *     → toast "💸 Marie a ajouté Pizza Margherita · 50 € · Voyage Dakar"
 *   - Jean a accepté ton swap de dette
 *     → toast "🔄 Jean a accepté ton swap"
 *   - Tu as un nouveau filleul
 *     → toast "🎁 Aïssa s'est inscrit avec ton code"
 *
 * Le composant se branche au RootLayout et tourne en permanence pour les
 * users connectés. Il n'affiche RIEN visuellement (pas de markup) — c'est
 * juste un bridge bus → toast.
 *
 * Anti-spam : on dédupe les events identiques reçus en moins de 2s
 * (typique d'un retry réseau ou d'une re-livraison SSE après reconnect).
 */

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "./toast";
import { useMyEvents, type RealtimeEvent } from "../use-realtime";
import { getToken } from "../api-client";
import { useT } from "../i18n/app-strings";

const DEDUPE_WINDOW_MS = 2_000;

export function RealtimeNotifier(): null {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const toast = useToast();
  const t = useT();
  const recentSig = useRef<Map<string, number>>(new Map());

  // Bridge actif uniquement quand l'utilisateur est connecté
  const isAuth = typeof window !== "undefined" && !!getToken();

  useMyEvents((event) => {
    if (!isAuth) return;

    // Dédup : signature simple = kind + groupId + payloadId
    const sig = makeSignature(event);
    const lastAt = recentSig.current.get(sig);
    if (lastAt && Date.now() - lastAt < DEDUPE_WINDOW_MS) return;
    recentSig.current.set(sig, Date.now());
    // Petit GC pour éviter que la map grossisse à l'infini
    if (recentSig.current.size > 100) {
      const cutoff = Date.now() - DEDUPE_WINDOW_MS * 5;
      for (const [k, v] of recentSig.current.entries()) {
        if (v < cutoff) recentSig.current.delete(k);
      }
    }

    const notif = formatEvent(event, pathname, t);
    if (!notif) return; // Event sans intérêt UX
    if (notif.kind === "success") {
      toast.success(notif.message);
    } else if (notif.kind === "info") {
      toast.info(notif.message);
    } else {
      toast.error({ message: notif.message } as any);
    }
  });

  return null;
}

function makeSignature(event: RealtimeEvent): string {
  const id = event.payload?.id ?? event.payload?.expenseId ?? "";
  return `${event.kind}:${event.groupId ?? ""}:${id}`;
}

interface NotifPayload {
  kind: "success" | "info" | "error";
  message: string;
}

/**
 * Convertit un event SSE en message toast humain. Retourne null si l'event
 * ne mérite pas de notification (ex: balance.changed → silencieux, on
 * fait juste la mise à jour des chiffres en background).
 *
 * Toaste pas si l'utilisateur EST sur la page concernée (il voit déjà la
 * mise à jour en live, pas la peine de lui faire un toast en plus).
 */
function formatEvent(
  event: RealtimeEvent,
  currentPath: string,
  t: ReturnType<typeof useT>,
): NotifPayload | null {
  const p = event.payload ?? {};
  const onGroupPage =
    event.groupId && currentPath.includes(`/dashboard/groups/${event.groupId}`);

  switch (event.kind) {
    case "member.joined":
      if (onGroupPage) return null;
      return {
        kind: "success",
        message: t("realtime.memberJoined", {
          name: p.memberName ?? "Un nouveau membre",
        }),
      };
    case "member.left":
      return {
        kind: "info",
        message: t("realtime.memberLeft", {
          name: p.memberName ?? "Un membre",
        }),
      };
    case "expense.created": {
      if (onGroupPage) return null; // déjà visible
      const who = p.paidBy?.displayName ?? p.actorName ?? "Quelqu'un";
      const desc = p.description ?? "une dépense";
      const amt = p.amount ? ` · ${p.amount} ${p.currency ?? ""}` : "";
      const grp = p.groupName ? ` dans ${p.groupName}` : "";
      // V52.C3 — SVG remplace EMOJI : on retire les emojis des messages toast
      // (V45 zéro emoji). Les toasts texte n'ont pas d'icône SVG pour l'instant.
      return {
        kind: "info",
        message: `${who} a ajouté ${desc}${amt}${grp}`,
      };
    }
    case "expense.updated":
      if (onGroupPage) return null;
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "info",
        message: `${p.actorName ?? "Quelqu'un"} a modifié une dépense`,
      };
    case "expense.deleted":
      if (onGroupPage) return null;
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "info",
        message: `Une dépense a été supprimée${p.groupName ? ` dans ${p.groupName}` : ""}`,
      };
    case "settlement.created":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "info",
        message: `${p.fromName ?? "Quelqu'un"} a marqué un paiement de ${p.amount ?? "?"} ${p.currency ?? ""} envers ${p.toName ?? "toi"}`,
      };
    case "settlement.confirmed":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "success",
        message: `${p.actorName ?? "Quelqu'un"} a confirmé un règlement`,
      };
    case "tontine.contribution.paid":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "info",
        message: `Cotisation reçue : ${p.contributorName ?? "?"} (${p.amount ?? ""} ${p.currency ?? ""})`,
      };
    case "tontine.distributed":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "success",
        message: `Pot tontine distribué à ${p.beneficiaryName ?? "le bénéficiaire"} !`,
      };
    case "swap.proposed":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "info",
        message: `${p.proposerName ?? "Quelqu'un"} te propose un swap de dette`,
      };
    case "swap.accepted":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "success",
        message: `Ton swap de dette a été accepté !`,
      };
    case "debt-transfer.proposed":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "info",
        message: `${p.proposerName ?? "Quelqu'un"} propose un transfert de dette`,
      };
    case "debt-transfer.accepted":
      // V52.C3 — SVG remplace EMOJI
      return {
        kind: "success",
        message: `Transfert de dette accepté`,
      };
    case "notification.created":
      // notif générique du backend (déjà tout faite)
      return p.body
        ? { kind: "info", message: p.body }
        : null;
    case "balance.changed":
      // Silencieux : la mise à jour visuelle des chiffres suffit
      return null;
    default:
      return null;
  }
}
