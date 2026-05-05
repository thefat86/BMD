/**
 * Event Stream (Server-Sent Events) — temps réel sans WebSocket.
 *
 * Spec §8.2 : "Synchronisation temps réel via WebSocket". Au lieu de
 * WebSocket (bidirectionnel, plus lourd), on utilise SSE qui :
 *  - Est natif HTTP, marche derrière les proxys, gère le keep-alive
 *  - Suffit pour les notifs serveur → client (le client agit via REST)
 *  - Reconnect auto côté navigateur
 *
 * Architecture : un EventBus en mémoire qui broadcast les events à tous
 * les subscribers. Chaque subscriber écoute par groupId pour ne recevoir
 * que les events qui le concernent.
 *
 * Limites :
 *  - Multi-instance : ne marche pas en cluster sans Redis pubsub
 *  - Pour le MVP mono-instance, c'est suffisant
 */

type EventKind =
  | "expense.created"
  | "expense.updated"
  | "expense.deleted"
  | "settlement.proposed"
  | "settlement.paid"
  | "settlement.confirmed"
  | "member.joined"
  | "member.left"
  | "tontine.bid"
  | "tontine.distributed"
  | "notification.new";

interface BmdEvent {
  kind: EventKind;
  /** ID du groupe concerné (utilisé pour le routing) */
  groupId?: string;
  /** ID du user concerné (pour les notifs perso) */
  userId?: string;
  /** Payload libre */
  data?: Record<string, unknown>;
  /** Timestamp ISO */
  at: string;
}

type Subscriber = (event: BmdEvent) => void;

class EventBus {
  private subscribers = new Map<string, Set<Subscriber>>();

  /**
   * S'abonne à un canal (groupId ou userId).
   * Retourne une fonction unsubscribe.
   */
  subscribe(channel: string, fn: Subscriber): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(fn);
    return () => {
      const set = this.subscribers.get(channel);
      if (set) {
        set.delete(fn);
        if (set.size === 0) this.subscribers.delete(channel);
      }
    };
  }

  /**
   * Diffuse un event vers tous les subscribers concernés.
   * Routing :
   *  - Si groupId présent → tous les subscribers du canal `group:${groupId}`
   *  - Si userId présent → subscribers du canal `user:${userId}`
   */
  publish(event: Omit<BmdEvent, "at"> & { at?: string }): void {
    const fullEvent: BmdEvent = {
      ...event,
      at: event.at ?? new Date().toISOString(),
    };
    if (event.groupId) {
      const set = this.subscribers.get(`group:${event.groupId}`);
      if (set) {
        for (const fn of set) {
          try {
            fn(fullEvent);
          } catch (err) {
            console.warn("[event-stream] subscriber failed", err);
          }
        }
      }
    }
    if (event.userId) {
      const set = this.subscribers.get(`user:${event.userId}`);
      if (set) {
        for (const fn of set) {
          try {
            fn(fullEvent);
          } catch (err) {
            console.warn("[event-stream] subscriber failed", err);
          }
        }
      }
    }
  }

  /** Pour debug : nombre de subscribers actifs. */
  count(): number {
    let total = 0;
    for (const set of this.subscribers.values()) total += set.size;
    return total;
  }
}

export const eventBus = new EventBus();

/**
 * Helpers pour publier les events typés depuis les services métier.
 */
export const events = {
  expenseCreated: (groupId: string, expenseId: string) =>
    eventBus.publish({
      kind: "expense.created",
      groupId,
      data: { expenseId },
    }),
  expenseUpdated: (groupId: string, expenseId: string) =>
    eventBus.publish({
      kind: "expense.updated",
      groupId,
      data: { expenseId },
    }),
  expenseDeleted: (groupId: string, expenseId: string) =>
    eventBus.publish({
      kind: "expense.deleted",
      groupId,
      data: { expenseId },
    }),
  memberJoined: (groupId: string, userId: string) =>
    eventBus.publish({
      kind: "member.joined",
      groupId,
      data: { userId },
    }),
  notificationNew: (userId: string, kind: string) =>
    eventBus.publish({
      kind: "notification.new",
      userId,
      data: { notifKind: kind },
    }),
  settlementProposed: (groupId: string, settlementId: string) =>
    eventBus.publish({
      kind: "settlement.proposed",
      groupId,
      data: { settlementId },
    }),
  settlementPaid: (groupId: string, settlementId: string) =>
    eventBus.publish({
      kind: "settlement.paid",
      groupId,
      data: { settlementId },
    }),
  settlementConfirmed: (groupId: string, settlementId: string) =>
    eventBus.publish({
      kind: "settlement.confirmed",
      groupId,
      data: { settlementId },
    }),
  tontineBid: (groupId: string, turnId: string) =>
    eventBus.publish({
      kind: "tontine.bid",
      groupId,
      data: { turnId },
    }),
};
