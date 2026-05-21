"use client";

/**
 * Hooks pour Server-Sent Events (SSE) — sync temps réel BMD (spec §8.2).
 *
 * Y2 — REFACTOR : avant cette version, chaque appel à `useMyEvents` ou
 * `useGroupEvents` créait sa propre `EventSource`. Sur le dashboard ça
 * faisait facilement 5+ connexions SSE simultanées vers le même endpoint
 * (notification-bell, realtime-notifier, person-balance-list, cross-inbox,
 * dashboard, etc.). Conséquences :
 *  - 5× la bande passante (chaque SSE maintient un keep-alive HTTP)
 *  - Saturation des connexions concurrentes navigateur (limite 6-8)
 *  - Lag perceptible sur les API calls qui doivent attendre une slot libre
 *  - Pression serveur (chaque user = N connexions au lieu de 1)
 *
 * **Nouveau modèle** : un singleton `EventSource` par channel (`me` ou
 * `group/${id}`) maintenu au niveau module. Les hooks s'abonnent comme
 * subscribers à ce singleton. Quand le dernier subscriber unmount, on
 * ferme la connexion.
 *
 * Avantages :
 *  - 1 seul EventSource par channel quel que soit le nombre de hooks
 *  - Reconnect géré 1 fois (pas N fois en parallèle)
 *  - Subscribers s'ajoutent/retirent via simple Set, O(1) par event
 *
 * Usage inchangé pour les composants :
 *
 *   useMyEvents((event) => {
 *     if (event.kind === "expense.created") refetch();
 *   });
 */

import { useEffect, useRef, useState } from "react";
import { getToken } from "./api-client";

export interface RealtimeEvent {
  kind: string;
  groupId?: string;
  userId?: string;
  payload?: any;
  data?: any;
  at?: string;
}

interface UseRealtimeState {
  connected: boolean;
  lastConnectedAt: Date | null;
  lastEventAt: Date | null;
  eventCount: number;
}

type Subscriber = (event: RealtimeEvent) => void;

interface SharedConnection {
  es: EventSource;
  subscribers: Set<Subscriber>;
  /** État partagé pour les setState des hooks. */
  state: UseRealtimeState;
  /** Listeners de changement d'état (pour propager `connected` aux hooks). */
  stateListeners: Set<(state: UseRealtimeState) => void>;
}

/**
 * Y2 — Liste des kinds d'events que le serveur peut émettre. À étendre
 * quand on ajoute un nouveau type côté backend (event-stream.ts).
 *
 * Le SSE serveur émet `event: ${kind}\ndata: ${json}\n\n`, donc chaque kind
 * est un event nommé qu'il faut explicitement écouter via `addEventListener`.
 */
const KNOWN_EVENTS = [
  "expense.created",
  "expense.updated",
  "expense.deleted",
  "settlement.proposed",
  "settlement.created",
  "settlement.paid",
  "settlement.confirmed",
  "member.joined",
  "member.left",
  "member.removed",
  "tontine.bid",
  "tontine.contribution.paid",
  "tontine.distributed",
  "swap.proposed",
  "swap.accepted",
  "swap.rejected",
  "debt-transfer.proposed",
  "debt-transfer.accepted",
  "debt-transfer.rejected",
  "notification.created",
  "notification.new",
  "balance.changed",
  // V30 / X3 — Cross-group settlements
  "cross-settlement.created",
  "cross-settlement.confirmed",
  "cross-settlement.cancelled",
];

/**
 * Map module-level des connexions partagées par channel.
 * Une seule `EventSource` par channel, partagée entre tous les hooks.
 */
const sharedConnections = new Map<string, SharedConnection>();

function buildSseUrl(channel: string, token: string): string | null {
  if (typeof window === "undefined") return null;
  let baseUrl: string;
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  const browserHost = window.location.hostname;
  const envIsLocal =
    envUrl?.includes("localhost") || envUrl?.includes("127.0.0.1");
  const browserIsLocal =
    browserHost === "localhost" || browserHost === "127.0.0.1";
  if (envUrl && !(envIsLocal && !browserIsLocal)) {
    baseUrl = envUrl;
  } else {
    baseUrl = `${window.location.protocol}//${browserHost}:4000`;
  }
  return `${baseUrl}/events/${channel}?token=${encodeURIComponent(token)}`;
}

/**
 * Récupère ou crée la connexion partagée pour un channel.
 * Au 1er subscriber → ouvre la connexion. Dès que le compteur revient à 0
 * (tous les hooks unmount) → ferme et supprime la map.
 */
function getOrCreateConnection(channel: string): SharedConnection | null {
  const existing = sharedConnections.get(channel);
  if (existing) return existing;

  const token = getToken();
  if (!token) return null;
  const url = buildSseUrl(channel, token);
  if (!url) return null;

  const es = new EventSource(url);
  const conn: SharedConnection = {
    es,
    subscribers: new Set(),
    state: {
      connected: false,
      lastConnectedAt: null,
      lastEventAt: null,
      eventCount: 0,
    },
    stateListeners: new Set(),
  };

  function notifyState(updater: (s: UseRealtimeState) => UseRealtimeState) {
    conn.state = updater(conn.state);
    for (const fn of conn.stateListeners) {
      try {
        fn(conn.state);
      } catch {
        /* ignore */
      }
    }
  }

  es.addEventListener("connected", () => {
    notifyState((s) => ({
      ...s,
      connected: true,
      lastConnectedAt: new Date(),
    }));
  });

  es.addEventListener("error", () => {
    // EventSource gère le retry automatiquement. On marque juste l'état.
    notifyState((s) => ({ ...s, connected: false }));
  });

  const handler = (e: MessageEvent) => {
    let data: RealtimeEvent;
    try {
      data = JSON.parse(e.data);
    } catch (err) {
      console.warn("[sse] failed to parse event", err);
      return;
    }
    notifyState((s) => ({
      ...s,
      lastEventAt: new Date(),
      eventCount: s.eventCount + 1,
    }));
    // Dispatch à tous les subscribers (best-effort, pas de throw)
    for (const sub of conn.subscribers) {
      try {
        sub(data);
      } catch (err) {
        console.warn("[sse] subscriber threw", err);
      }
    }
  };

  for (const kind of KNOWN_EVENTS) {
    es.addEventListener(kind, handler as EventListener);
  }
  // Fallback : message brut (events sans `event:` header)
  es.addEventListener("message", handler);

  sharedConnections.set(channel, conn);
  return conn;
}

function useSSE(
  channel: string | null,
  onEvent: (event: RealtimeEvent) => void,
): UseRealtimeState {
  const [state, setState] = useState<UseRealtimeState>({
    connected: false,
    lastConnectedAt: null,
    lastEventAt: null,
    eventCount: 0,
  });

  // Stocke la callback dans une ref pour qu'elle soit toujours à jour
  // sans déclencher de reconnexion à chaque render.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!channel) return;
    const conn = getOrCreateConnection(channel);
    if (!conn) return;

    const subscriber: Subscriber = (event) => onEventRef.current(event);
    conn.subscribers.add(subscriber);
    conn.stateListeners.add(setState);
    setState(conn.state);

    return () => {
      conn.subscribers.delete(subscriber);
      conn.stateListeners.delete(setState);
      // Si plus aucun subscriber, on ferme la connexion partagée et on
      // l'enlève de la map. Le prochain hook qui mount recréera une
      // connexion fraîche.
      if (
        conn.subscribers.size === 0 &&
        conn.stateListeners.size === 0
      ) {
        try {
          conn.es.close();
        } catch {
          /* ignore */
        }
        sharedConnections.delete(channel);
      }
    };
  }, [channel]);

  return state;
}

/**
 * S'abonne aux events d'un groupe spécifique.
 */
export function useGroupEvents(
  groupId: string | null | undefined,
  onEvent: (event: RealtimeEvent) => void,
): UseRealtimeState {
  return useSSE(groupId ? `group/${groupId}` : null, onEvent);
}

/**
 * S'abonne aux events temps réel personnels.
 */
export function useMyEvents(
  onEvent: (event: RealtimeEvent) => void,
): UseRealtimeState {
  return useSSE("me", onEvent);
}

/**
 * Y2 — Helper de debug : retourne le nombre de connexions SSE actives.
 * Utile pour vérifier qu'on a bien 1 connexion par channel et pas N.
 */
export function _getActiveSseConnectionsCount(): number {
  return sharedConnections.size;
}
