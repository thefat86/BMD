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
  | "notification.new"
  // X3 — Cross-group settlements (V30 phase 2)
  | "cross-settlement.created"
  | "cross-settlement.confirmed"
  | "cross-settlement.cancelled"
  // Sprint AC-2 — réunions enregistrées
  | "meeting.updated";

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
  /** Subscribers globaux qui reçoivent TOUS les events (réservé aux admins). */
  private globalSubs = new Set<Subscriber>();

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
   * S'abonne à TOUS les events (admin metrics live stream).
   * Retourne une fonction unsubscribe.
   *
   * Sécurité : à utiliser uniquement après vérification super-admin
   * dans l'appelant. Le bus en lui-même ne fait pas l'auth.
   */
  subscribeAll(fn: Subscriber): () => void {
    this.globalSubs.add(fn);
    return () => {
      this.globalSubs.delete(fn);
    };
  }

  /**
   * Diffuse un event vers tous les subscribers concernés.
   * Routing :
   *  - Si groupId présent → tous les subscribers du canal `group:${groupId}`
   *  - Si userId présent → subscribers du canal `user:${userId}`
   *  - Tous les globalSubs reçoivent l'event quoi qu'il arrive
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
    // Dispatch aux webhooks partenaires (spec §6.10) — fire-and-forget,
    // import dynamique pour éviter une dépendance circulaire au démarrage.
    void (async () => {
      try {
        const { dispatchWebhookEvent } = await import(
          "../modules/partners/partners.service.js"
        );
        await dispatchWebhookEvent({
          kind: fullEvent.kind,
          data: {
            ...(fullEvent.data ?? {}),
            groupId: fullEvent.groupId,
            userId: fullEvent.userId,
            at: fullEvent.at,
          },
        });
      } catch {
        /* silencieux : le bus ne doit jamais bloquer l'app */
      }
    })();

    // Broadcast à tous les abonnés globaux (admin dashboard)
    for (const fn of this.globalSubs) {
      try {
        fn(fullEvent);
      } catch (err) {
        console.warn("[event-stream] global subscriber failed", err);
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
  // X3 — Cross-group settlement events. Routés via `userId` des deux parties
  // (pas de `groupId` car par définition multi-groupe). Les 2 utilisateurs
  // concernés reçoivent l'event pour rafraîchir leur dashboard / inbox.
  crossSettlementCreated: (
    fromUserId: string,
    toUserId: string,
    crossId: string,
    totalAmount: string,
    currency: string,
  ) => {
    // Le débiteur reçoit l'info
    eventBus.publish({
      kind: "cross-settlement.created",
      userId: fromUserId,
      data: { crossId, totalAmount, currency, role: "from" },
    });
    // Le créancier aussi (s'il diffère)
    if (toUserId !== fromUserId) {
      eventBus.publish({
        kind: "cross-settlement.created",
        userId: toUserId,
        data: { crossId, totalAmount, currency, role: "to" },
      });
    }
  },
  crossSettlementConfirmed: (
    fromUserId: string,
    toUserId: string,
    crossId: string,
  ) => {
    eventBus.publish({
      kind: "cross-settlement.confirmed",
      userId: fromUserId,
      data: { crossId, role: "from" },
    });
    if (toUserId !== fromUserId) {
      eventBus.publish({
        kind: "cross-settlement.confirmed",
        userId: toUserId,
        data: { crossId, role: "to" },
      });
    }
  },
  crossSettlementCancelled: (
    fromUserId: string,
    toUserId: string,
    crossId: string,
  ) => {
    eventBus.publish({
      kind: "cross-settlement.cancelled",
      userId: fromUserId,
      data: { crossId, role: "from" },
    });
    if (toUserId !== fromUserId) {
      eventBus.publish({
        kind: "cross-settlement.cancelled",
        userId: toUserId,
        data: { crossId, role: "to" },
      });
    }
  },
  /**
   * Sprint AC-2 · Notifie les membres d'un groupe qu'une réunion change de
   * statut (TRANSCRIBING → EXTRACTING → REVIEW → APPLIED). L'UI peut polluer
   * en SSE pour rafraîchir la modale ou la liste sans recharger.
   */
  meetingUpdated: (groupId: string, meetingId: string) =>
    eventBus.publish({
      kind: "meeting.updated",
      groupId,
      data: { meetingId },
    }),
};
