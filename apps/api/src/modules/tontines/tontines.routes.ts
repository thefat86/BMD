import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  TontineFrequency,
  BeneficiaryOrderMode,
} from "@prisma/client";
import {
  acknowledgeTurn,
  activateTontine,
  cancelTontine,
  closeBidding,
  confirmContribution,
  declareContributionReceived,
  updateTurnDetails,
  proposeTurnUpdate,
  respondToTurnProposal,
  createTontine,
  distributeTurn,
  getTontineByGroup,
  getTontineHistory,
  getTontineStats,
  listBids,
  listTurnAcks,
  markContributionPaid,
  placeBid,
  scheduleTurn,
  withdrawBid,
  // V219.C — Workflow de suppression de tontine
  requestTontineCancellation,
  voteTontineCancellation,
  getTontineCancellationStatus,
} from "./tontines.service.js";
import {
  getMyContributionAmount,
  getTurnContributionsCrossCurrency,
} from "./tontines-fx.service.js";
import {
  filterPhotoByPlan,
  getPhotoVisibilityMap,
} from "../../lib/plan-limits.js";
// V128 — Cache de l'endpoint GET /groups/:id (TTL 30s) à invalider après
// création/activation/annulation de tontine pour que la tile « Tontine »
// reflète immédiatement le nouvel état (le frontend lit `group.tontine`
// pour décider entre navigation et création).
import { cacheInvalidatePrefix } from "../../lib/cache.js";

/**
 * V77.1 — Helper batch pour filtrer un avatar selon la visibility map du plan.
 * Le user lui-même voit toujours sa propre photo.
 */
function maskAvatar(
  person: { id: string; displayName: string; avatar: string | null } | null | undefined,
  callerUserId: string,
  visibilityMap: Map<string, boolean>,
):
  | { id: string; displayName: string; avatar: string | null }
  | null
  | undefined {
  if (!person) return person;
  if (person.id === callerUserId) return person;
  return {
    ...person,
    avatar: filterPhotoByPlan(person.id, person.avatar, visibilityMap),
  };
}

const createSchema = z.object({
  contributionAmount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Montant doit être un nombre positif"),
  currency: z.string().length(3).optional(),
  frequency: z.nativeEnum(TontineFrequency),
  startDate: z.string().datetime(),
  orderMode: z.nativeEnum(BeneficiaryOrderMode).optional(),
  centralizedPot: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  // V231 — Nom libre de la tontine (« Tontine Été 2026 », « Tontine famille »…)
  name: z.string().max(120).optional(),
  // V229 — Sous-ensemble de membres participants (≥ 2). Si omis, tous les
  // membres du groupe participent (comportement historique).
  participantUserIds: z.array(z.string().uuid()).min(2).optional(),
});

const activateSchema = z.object({
  beneficiaryOrder: z.array(z.string().uuid()).optional(),
  // V229 — Sous-ensemble de membres participants à inscrire dans la
  // tontine. Doit être un sous-ensemble strict des membres du groupe et
  // contenir au moins 2 userIds. Si omis ou vide → tous les membres
  // (comportement historique avant V229).
  participantUserIds: z.array(z.string().uuid()).min(2).optional(),
  // V116 — Liste optionnelle des userIds qui ont DÉJÀ reçu le pot avant la
  // création de la tontine dans BMD (cas typique : on enregistre une
  // tontine de quartier qui tourne depuis 6 mois). Doit être un préfixe de
  // `beneficiaryOrder` : les N premiers turns sont créés directement en
  // status COMPLETED avec contributions CONFIRMED, et le turn (N+1)
  // devient IN_PROGRESS.
  alreadyServedUserIds: z.array(z.string().uuid()).optional(),
});

const markPaidSchema = z.object({
  paymentMethod: z.string().max(50).optional(),
  paymentReference: z.string().max(200).optional(),
  // V141 — Date effective du paiement (max = aujourd'hui, min = il y a 1 an).
  // Validation côté service (markContributionPaid).
  paidAt: z.string().datetime({ offset: true }).optional(),
});

export async function tontinesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /groups/:groupId/tontine
   * Récupère la tontine du groupe (avec turns et contributions).
   */
  app.get("/groups/:groupId/tontine", async (req) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    // V142.F — Le Prisma client n'est pas régénéré dans le sandbox CI, donc
    // les nouveaux champs (TontineTurnProposal, paymentConfirmationRequired)
    // ne sont pas typés. Cast `any` pour conserver l'inférence des relations.
    const tontine = (await getTontineByGroup(groupId, req.user.sub)) as any;
    if (!tontine) return { tontine: null };

    // V77.1 — Batch-filter beneficiary + contributor avatars selon le plan
    // de chacun. Le caller voit sa propre photo, les autres uniquement si
    // leur plan a profilePhotoVisible: true.
    const userIds: string[] = [];
    for (const t of tontine.turns) {
      if (t.beneficiary?.id) userIds.push(t.beneficiary.id);
      for (const c of t.contributions) {
        if (c.contributor?.id) userIds.push(c.contributor.id);
      }
    }
    const visibilityMap = await getPhotoVisibilityMap(userIds);

    // V219.C — Charge l'état de demande de suppression + votes pour permettre
    // au front de rendre le bandeau de vote. cast `any` car le client Prisma
    // n'est pas régénéré dans le sandbox.
    const cancellation = await getTontineCancellationStatus(tontine.id).catch(
      () => null,
    );

    return {
      tontine: {
        id: tontine.id,
        groupId: tontine.groupId,
        // V231 — Nom libre choisi par l'admin à la création.
        name: tontine.name ?? null,
        contributionAmount: tontine.contributionAmount.toString(),
        currency: tontine.currency,
        frequency: tontine.frequency,
        startDate: tontine.startDate.toISOString(),
        status: tontine.status,
        orderMode: tontine.orderMode,
        centralizedPot: tontine.centralizedPot,
        notes: tontine.notes,
        createdAt: tontine.createdAt.toISOString(),
        // V219.C — État de la demande de suppression (PROPOSED/APPROVED/REJECTED/null)
        cancellationStatus: cancellation?.status ?? null,
        cancellationReason: cancellation?.reason ?? null,
        cancellationRequestedAt: cancellation?.requestedAt ?? null,
        cancellationRequestedById: cancellation?.requestedById ?? null,
        cancellationVotes: cancellation?.votes ?? [],
        turns: tontine.turns.map((t: any) => {
          // V138 — Proposition PENDING (au max 1, take:1 côté service)
          const pendingProposal =
            (t as any).proposals && (t as any).proposals.length > 0
              ? (t as any).proposals[0]
              : null;
          return {
            id: t.id,
            turnNumber: t.turnNumber,
            status: t.status,
            dueDate: t.dueDate.toISOString(),
            // V116 — scheduledDate (fenêtre ±15j choisie par le bénéficiaire)
            scheduledDate: (t as any).scheduledDate?.toISOString() ?? null,
            distributedAt: t.distributedAt?.toISOString() ?? null,
            // V136.D — Lieu + heure + notes libres, renseignés par le
            // bénéficiaire ou un admin. Affichés dans le sheet détail tour
            // pour que tout le groupe sache où ET quand.
            location: (t as any).location ?? null,
            meetingTime: (t as any).meetingTime ?? null,
            notes: (t as any).notes ?? null,
            beneficiary: maskAvatar(t.beneficiary, req.user.sub, visibilityMap),
            contributions: t.contributions.map((c: any) => ({
              id: c.id,
              amount: c.amount.toString(),
              status: c.status,
              paidAt: c.paidAt?.toISOString() ?? null,
              confirmedAt: c.confirmedAt?.toISOString() ?? null,
              paymentMethod: c.paymentMethod,
              contributor: maskAvatar(c.contributor, req.user.sub, visibilityMap),
            })),
            // V138 — Proposition admin en attente (bénéficiaire la voit
            // dans une bannière « Accepter / Refuser », admin proposer la
            // voit pour info, les autres membres aussi pour transparence).
            pendingProposal: pendingProposal
              ? {
                  id: pendingProposal.id,
                  proposedByUserId: pendingProposal.proposedByUserId,
                  proposedBy: {
                    id: pendingProposal.proposedBy.id,
                    displayName: pendingProposal.proposedBy.displayName,
                  },
                  proposedScheduledDate:
                    pendingProposal.proposedScheduledDate?.toISOString() ?? null,
                  proposedLocation: pendingProposal.proposedLocation ?? null,
                  proposedMeetingTime:
                    pendingProposal.proposedMeetingTime ?? null,
                  proposedNotes: pendingProposal.proposedNotes ?? null,
                  message: pendingProposal.message ?? null,
                  createdAt: pendingProposal.createdAt.toISOString(),
                }
              : null,
          };
        }),
        stats: await getTontineStats(tontine.id),
      },
    };
  });

  /**
   * GET /groups/:groupId/tontine/history
   * Historique des tontines (toutes périodes) pour le suivi long terme.
   * Inclut les tours distribués avec leurs montants effectivement reçus.
   */
  app.get("/groups/:groupId/tontine/history", async (req) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const history = await getTontineHistory({
      groupId,
      actorUserId: (req.user as any).sub,
    });
    // V77.1 — Filtre beneficiary.avatar selon le plan dans l'historique
    const userIds: string[] = [];
    for (const tont of history.tontines ?? []) {
      for (const turn of (tont as any).turns ?? []) {
        if (turn.beneficiary?.id) userIds.push(turn.beneficiary.id);
      }
    }
    const visibilityMap = await getPhotoVisibilityMap(userIds);
    return {
      tontines: (history.tontines ?? []).map((tont: any) => ({
        ...tont,
        turns: (tont.turns ?? []).map((turn: any) => ({
          ...turn,
          beneficiary: maskAvatar(turn.beneficiary, req.user.sub, visibilityMap),
        })),
      })),
    };
  });

  /**
   * POST /groups/:groupId/tontine
   * Crée une tontine en mode DRAFT pour le groupe.
   */
  app.post("/groups/:groupId/tontine", async (req, reply) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const body = createSchema.parse(req.body);

    const tontine = await createTontine({
      groupId,
      actorUserId: req.user.sub,
      contributionAmount: body.contributionAmount,
      currency: body.currency,
      frequency: body.frequency,
      startDate: new Date(body.startDate),
      orderMode: body.orderMode,
      centralizedPot: body.centralizedPot,
      notes: body.notes,
      // V231 — Nom libre
      name: body.name,
      // V229 — Participants sélectionnés (sous-ensemble du groupe)
      participantUserIds: body.participantUserIds,
    });

    // V128 — Invalide le cache 30s de GET /groups/:id (tous les viewers).
    // Sans ça, le frontend continuait à voir `group.tontine = null` pendant
    // 30s après création → la tile « Tontine » rouvrait le sheet de
    // création au tap suivant au lieu de naviguer vers la page roue.
    void cacheInvalidatePrefix(`group-detail:${groupId}:`);

    return reply.code(201).send({
      id: tontine.id,
      status: tontine.status,
    });
  });

  /**
   * POST /tontines/:tontineId/activate
   * Active la tontine et génère tous les turns + contributions.
   * Body : { beneficiaryOrder?: string[] }
   */
  app.post("/tontines/:tontineId/activate", async (req) => {
    const { tontineId } = z
      .object({ tontineId: z.string().uuid() })
      .parse(req.params);
    const body = activateSchema.parse(req.body ?? {});

    const updated = await activateTontine({
      tontineId,
      actorUserId: req.user.sub,
      beneficiaryOrder: body.beneficiaryOrder,
      // V229 — Liste explicite des participants (sous-ensemble du groupe).
      participantUserIds: body.participantUserIds,
      alreadyServedUserIds: body.alreadyServedUserIds,
    });

    // V128 — Invalide le cache groupe pour que la tile reflète le passage
    // DRAFT → ACTIVE sans attendre le TTL de 30s.
    if ((updated as any).groupId) {
      void cacheInvalidatePrefix(
        `group-detail:${(updated as any).groupId}:`,
      );
    }

    return { id: updated.id, status: updated.status };
  });

  /**
   * POST /tontine-contributions/:contributionId/mark-paid
   * Le contributeur marque sa cotisation comme payée.
   */
  app.post(
    "/tontine-contributions/:contributionId/mark-paid",
    async (req) => {
      const { contributionId } = z
        .object({ contributionId: z.string().uuid() })
        .parse(req.params);
      const body = markPaidSchema.parse(req.body ?? {});

      const updated = await markContributionPaid({
        contributionId,
        actorUserId: req.user.sub,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
      });

      return {
        id: updated.id,
        status: updated.status,
        paidAt: updated.paidAt?.toISOString() ?? null,
      };
    },
  );

  /**
   * POST /tontine-contributions/:contributionId/confirm
   * Le bénéficiaire (ou admin) confirme la réception du paiement.
   */
  app.post(
    "/tontine-contributions/:contributionId/confirm",
    async (req) => {
      const { contributionId } = z
        .object({ contributionId: z.string().uuid() })
        .parse(req.params);

      const updated = await confirmContribution({
        contributionId,
        actorUserId: req.user.sub,
      });

      return {
        id: updated.id,
        status: updated.status,
        confirmedAt: updated.confirmedAt?.toISOString() ?? null,
      };
    },
  );

  /**
   * V136.C — POST /tontine-contributions/:contributionId/declare-received
   * Le bénéficiaire (ou admin) déclare avoir reçu un paiement de façon
   * proactive, sans attendre que le payeur clique "J'ai payé". Force la
   * transition PENDING → CONFIRMED en une étape avec method + paidAt.
   */
  app.post(
    "/tontine-contributions/:contributionId/declare-received",
    async (req) => {
      const { contributionId } = z
        .object({ contributionId: z.string().uuid() })
        .parse(req.params);

      const body = z
        .object({
          paymentMethod: z.string().min(1).max(80),
          paidAt: z
            .string()
            .datetime()
            .optional(),
        })
        .parse(req.body ?? {});

      const updated = await declareContributionReceived({
        contributionId,
        actorUserId: req.user.sub,
        paymentMethod: body.paymentMethod,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
      });

      return {
        id: updated.id,
        status: updated.status,
        paidAt: updated.paidAt?.toISOString() ?? null,
        confirmedAt: updated.confirmedAt?.toISOString() ?? null,
        paymentMethod: updated.paymentMethod,
      };
    },
  );

  /**
   * POST /tontine-turns/:turnId/distribute
   * Clôture le tour et passe au suivant.
   */
  app.post("/tontine-turns/:turnId/distribute", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);

    const updated = await distributeTurn({
      turnId,
      actorUserId: req.user.sub,
    });

    return { id: updated.id, status: updated.status };
  });

  /**
   * POST /tontine-turns/:turnId/schedule
   * Le bénéficiaire (ou admin) fixe la date exacte du tour dans le mois.
   * Body: { scheduledDate: ISO datetime }
   */
  app.post("/tontine-turns/:turnId/schedule", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    const { scheduledDate } = z
      .object({ scheduledDate: z.string().datetime() })
      .parse(req.body);
    return scheduleTurn({
      turnId,
      actorUserId: req.user.sub,
      scheduledDate: new Date(scheduledDate),
    });
  });

  /**
   * V136.D — PATCH /tontine-turns/:turnId/details
   * Le bénéficiaire (ou admin) édite location + notes du tour.
   * Body: { location?: string | null, notes?: string | null }
   * Une valeur null efface explicitement le champ, undefined ne le touche pas.
   */
  app.patch("/tontine-turns/:turnId/details", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        location: z.string().max(500).nullable().optional(),
        // V136.D — Heure de la réunion (format libre court)
        meetingTime: z.string().max(60).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
        // V138 — Date du tour. Bénéficiaire uniquement, doit rester dans
        // le mois calendaire du dueDate (vérifié côté service).
        scheduledDate: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .optional(),
      })
      .parse(req.body ?? {});
    return updateTurnDetails({
      turnId,
      actorUserId: req.user.sub,
      location: body.location,
      meetingTime: body.meetingTime,
      notes: body.notes,
      scheduledDate:
        body.scheduledDate === undefined
          ? undefined
          : body.scheduledDate === null
            ? null
            : new Date(body.scheduledDate),
    });
  });

  /**
   * V138 — POST /tontine-turns/:turnId/proposals
   * Un admin du groupe (qui n'est PAS le bénéficiaire du tour) propose
   * un changement de date/lieu/heure/notes. Le bénéficiaire devra accepter
   * ou refuser via POST /tontine-turn-proposals/:id/respond. Tant qu'elle
   * n'est pas acceptée, la proposition n'écrase RIEN et les autres membres
   * ne voient rien.
   *
   * Body : { proposedScheduledDate?, proposedLocation?, proposedMeetingTime?,
   *          proposedNotes?, message? }
   */
  app.post("/tontine-turns/:turnId/proposals", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        proposedScheduledDate: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .optional(),
        proposedLocation: z.string().max(500).nullable().optional(),
        proposedMeetingTime: z.string().max(60).nullable().optional(),
        proposedNotes: z.string().max(1000).nullable().optional(),
        message: z.string().max(500).nullable().optional(),
      })
      .parse(req.body ?? {});
    return proposeTurnUpdate({
      turnId,
      actorUserId: req.user.sub,
      proposedScheduledDate:
        body.proposedScheduledDate === undefined
          ? undefined
          : body.proposedScheduledDate === null
            ? null
            : new Date(body.proposedScheduledDate),
      proposedLocation: body.proposedLocation,
      proposedMeetingTime: body.proposedMeetingTime,
      proposedNotes: body.proposedNotes,
      message: body.message ?? null,
    });
  });

  /**
   * V138 — POST /tontine-turn-proposals/:proposalId/respond
   * Le bénéficiaire du tour concerné accepte (ACCEPT) ou refuse (REJECT)
   * la proposition. Accept → applique les valeurs + broadcast push+email
   * à tous. Reject → notifie l'admin émetteur uniquement.
   *
   * Body : { decision: "ACCEPT" | "REJECT", rejectionReason?: string }
   */
  app.post("/tontine-turn-proposals/:proposalId/respond", async (req) => {
    const { proposalId } = z
      .object({ proposalId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        decision: z.enum(["ACCEPT", "REJECT"]),
        rejectionReason: z.string().max(500).nullable().optional(),
      })
      .parse(req.body ?? {});
    return respondToTurnProposal({
      proposalId,
      actorUserId: req.user.sub,
      decision: body.decision,
      rejectionReason: body.rejectionReason ?? null,
    });
  });

  /**
   * POST /tontine-turns/:turnId/acknowledge
   * Accusé de réception de la date par un membre.
   */
  app.post("/tontine-turns/:turnId/acknowledge", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return acknowledgeTurn({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * GET /tontine-turns/:turnId/acks
   * Liste des accusés de réception du tour (qui a confirmé, qui pas).
   */
  app.get("/tontine-turns/:turnId/acks", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return listTurnAcks({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * POST /tontines/:tontineId/cancel
   * Annule la tontine entière (admin uniquement).
   */
  app.post("/tontines/:tontineId/cancel", async (req) => {
    const { tontineId } = z
      .object({ tontineId: z.string().uuid() })
      .parse(req.params);

    const updated = await cancelTontine({
      tontineId,
      actorUserId: req.user.sub,
    });

    // V128 — Invalide le cache groupe pour que la tile bascule
    // immédiatement en statut « Annulée » (ou redevienne un slot vide
    // si l'UI considère CANCELLED comme effacé).
    if ((updated as any).groupId) {
      void cacheInvalidatePrefix(
        `group-detail:${(updated as any).groupId}:`,
      );
    }

    return { id: updated.id, status: updated.status };
  });

  /* ===== Hui / Enchères (spec §3.4) ===== */

  /**
   * GET /tontine-turns/:turnId/bids
   * Liste les enchères d'un tour (visible par tous les membres).
   */
  app.get("/tontine-turns/:turnId/bids", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    const bids = await listBids({
      turnId,
      actorUserId: req.user.sub,
    });
    // V77.1 — Filtre bidder.avatar selon le plan de l'enchérisseur
    const userIds = (bids as Array<{ bidder?: { id: string } }>)
      .map((b) => b.bidder?.id)
      .filter((id): id is string => typeof id === "string");
    const visibilityMap = await getPhotoVisibilityMap(userIds);
    return (bids as Array<{ bidder?: { id: string; displayName: string; avatar: string | null } | null }>).map((b) => ({
      ...b,
      bidder: maskAvatar(b.bidder, req.user.sub, visibilityMap),
    }));
  });

  /**
   * POST /tontine-turns/:turnId/bids
   * Pose ou met à jour son enchère.
   * Body: { amount: string }
   */
  app.post("/tontine-turns/:turnId/bids", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({ amount: z.string().regex(/^\d+(\.\d{1,4})?$/) })
      .parse(req.body);
    return placeBid({
      turnId,
      actorUserId: req.user.sub,
      amount: body.amount,
    });
  });

  /**
   * DELETE /tontine-turns/:turnId/bids
   * Retire son enchère.
   */
  app.delete("/tontine-turns/:turnId/bids", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return withdrawBid({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  /**
   * POST /tontine-turns/:turnId/bids/close
   * Clôture les enchères, déclare le gagnant. Admin uniquement.
   */
  app.post("/tontine-turns/:turnId/bids/close", async (req) => {
    const { turnId } = z
      .object({ turnId: z.string().uuid() })
      .parse(req.params);
    return closeBidding({
      turnId,
      actorUserId: req.user.sub,
    });
  });

  // ============================================================
  // Tontines transfrontalières (spec §3.4 §4.4)
  // ============================================================

  /**
   * GET /tontine-turns/:turnId/contributions/cross-currency
   * Vue multi-devises de toutes les cotisations d'un tour.
   * Calcule l'équivalent dans la devise préférée de chaque contributeur,
   * au taux du jour (cache FX 60s).
   */
  app.get(
    "/tontine-turns/:turnId/contributions/cross-currency",
    async (req) => {
      const { turnId } = z
        .object({ turnId: z.string().uuid() })
        .parse(req.params);
      return getTurnContributionsCrossCurrency({ turnId });
    },
  );

  /**
   * GET /tontine-contributions/:contributionId/local-amount
   * Pour MA cotisation : combien je dois envoyer dans MA devise locale.
   * Utile pour Mobile Money et providers locaux.
   */
  app.get(
    "/tontine-contributions/:contributionId/local-amount",
    async (req) => {
      const { contributionId } = z
        .object({ contributionId: z.string().uuid() })
        .parse(req.params);
      return getMyContributionAmount({
        contributionId,
        userId: req.user.sub,
      });
    },
  );

  // ============================================================
  // V219.C — Workflow de suppression d'une tontine
  // ============================================================

  /**
   * POST /groups/:groupId/tontines/:tontineId/cancel
   * L'admin ouvre une demande de suppression (raison obligatoire).
   * - Si 0 contribution CONFIRMED → suppression directe.
   * - Sinon → vote requis (unanimité des autres membres).
   */
  app.post(
    "/groups/:groupId/tontines/:tontineId/cancel",
    async (req, reply) => {
      const { groupId, tontineId } = z
        .object({
          groupId: z.string().uuid(),
          tontineId: z.string().uuid(),
        })
        .parse(req.params);
      const body = z
        .object({ reason: z.string().min(10).max(2000) })
        .parse(req.body);

      const result = await requestTontineCancellation({
        tontineId,
        actorUserId: req.user.sub,
        reason: body.reason,
      });

      // Invalidation supplémentaire ceinture-bretelles (le service le fait
      // déjà mais on garantit que les viewers du group hub voient l'état à
      // jour).
      void cacheInvalidatePrefix(`group-detail:${groupId}:`);

      return reply.code(200).send(result);
    },
  );

  /**
   * POST /groups/:groupId/tontines/:tontineId/cancel/vote
   * Un membre vote sur la demande de suppression.
   * Body : { vote: boolean, reason?: string }
   *   vote=true  → approuve (unanimité fait basculer en APPROVED).
   *   vote=false → refuse (un seul refus suffit pour REJECTED).
   */
  app.post(
    "/groups/:groupId/tontines/:tontineId/cancel/vote",
    async (req, reply) => {
      const { groupId, tontineId } = z
        .object({
          groupId: z.string().uuid(),
          tontineId: z.string().uuid(),
        })
        .parse(req.params);
      const body = z
        .object({
          vote: z.boolean(),
          reason: z.string().max(2000).optional(),
        })
        .parse(req.body);

      const result = await voteTontineCancellation({
        tontineId,
        actorUserId: req.user.sub,
        vote: body.vote,
        reason: body.reason,
      });

      void cacheInvalidatePrefix(`group-detail:${groupId}:`);

      return reply.code(200).send(result);
    },
  );
}
