"use client";

/**
 * <MobileTontineView> · V40 — refonte tontine mobile, banking-africain premium.
 *
 * Innovation visuelle :
 *  1. HERO "CARTE DU TOUR" — une grosse carte type Apple Card avec le
 *     bénéficiaire du tour actuel (avatar + nom) + montant cumulé + nombre
 *     de jours restants. Halo signature saffron, lignes guillochées style
 *     carte bancaire.
 *  2. ANNEAU DE ROTATION — SVG circulaire qui montre tous les bénéficiaires
 *     en cercle, avec le tour actuel mis en relief (gradient saffron) et une
 *     flèche pointant le bénéficiaire. Les tours passés sont remplis, les
 *     futurs en outline. Tap sur un membre = voir son détail.
 *  3. CONTRIBUTIONS DU TOUR — liste compacte de qui doit / qui a payé / qui
 *     est confirmé. Toi en premier si tu dois encore payer.
 *  4. TIMELINE HORIZONTALE — scroll de cartes des tours, snap à chaque carte.
 *
 * Toutes les actions critiques (marquer payé, confirmer, distribuer, planifier
 * la date) passent par BottomSheet pour rester natif mobile.
 */

import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { useGroupEvents } from "../use-realtime";
import { BottomSheet } from "./bottom-sheet";
import { haptic } from "../platform";
// V53.C3 — Lazy : sheet de 1317 lignes chargé uniquement au 1er open.
import dynamic from "next/dynamic";
const MobileAddTontineSheet = dynamic(
  () =>
    import("./mobile-add-tontine-sheet").then((m) => ({
      default: m.MobileAddTontineSheet,
    })),
  { ssr: false },
);
// V136.A — Sheet d'édition rapide de ses propres moyens de paiement
// depuis la vue tontine (sans aller dans profil).
const MobileMyPaymentMethodsSheet = dynamic(
  () =>
    import("./mobile-my-payment-methods-sheet").then((m) => ({
      default: m.MobileMyPaymentMethodsSheet,
    })),
  { ssr: false },
);
// V52.C2 — SVG remplace EMOJI : icon registry V52.A2
import { Icon } from "./icons";
// V141 — Formulaire unifié de déclaration de paiement (méthode + date + ref)
import { PaymentDeclarationForm } from "./payment-declaration-form";

interface Contribution {
  id: string;
  contributorUserId: string;
  contributorName: string;
  amount: string;
  currency: string;
  status: string; // PENDING / PAID / CONFIRMED
  paidAt: string | null;
  confirmedAt: string | null;
}
interface Turn {
  id: string;
  turnNumber: number;
  beneficiaryUserId: string;
  beneficiaryName: string;
  /** V140 — Photo de profil du bénéficiaire si son plan le permet (filtrée
   *  côté backend via getPhotoVisibilityMap). Affichée dans la roue + autres
   *  endroits. Null si plan FREE/PERSONAL ou pas de photo uploadée. */
  beneficiaryAvatar: string | null;
  dueDate: string;
  scheduledDate: string | null;
  distributedAt: string | null;
  status: string; // PENDING / IN_PROGRESS / COMPLETED
  contributions: Contribution[];
  // V136.D — Lieu + heure + notes libres (renseignés par bénéficiaire/admin).
  // Tout le groupe voit ces infos pour s'organiser, seuls bénéficiaire/admin
  // peuvent éditer.
  location?: string | null;
  meetingTime?: string | null;
  notes?: string | null;
  // V138 — Proposition PENDING de modif émise par l'admin (max 1).
  // Le bénéficiaire la voit comme bannière Accepter / Refuser. Les autres
  // membres la voient aussi à titre informatif. Quand admin == bénéficiaire,
  // pas de proposition (modif directe).
  pendingProposal?: {
    id: string;
    proposedByUserId: string;
    proposedBy: { id: string; displayName: string };
    proposedScheduledDate: string | null;
    proposedLocation: string | null;
    proposedMeetingTime: string | null;
    proposedNotes: string | null;
    message: string | null;
    createdAt: string;
  } | null;
}
interface TontineData {
  id: string;
  status: string; // DRAFT / ACTIVE / COMPLETED / CANCELLED
  contributionAmount: string;
  currency: string;
  frequency: string;
  startDate: string;
  centralizedPot: boolean;
  notes: string | null;
  orderMode: string;
  turns: Turn[];
}
interface Member {
  id: string;
  role: string;
  user: { id: string; displayName: string; avatar?: string | null };
}
interface Group {
  id: string;
  name: string;
  type?: string;
  defaultCurrency: string;
  members: Member[];
}

export function MobileTontineView({ groupId }: { groupId: string }) {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();
  const { formatAmount } = useCurrency();

  const [group, setGroup] = useState<Group | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [tontine, setTontine] = useState<TontineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BottomSheets
  const [openSheet, setOpenSheet] = useState<
    | "none"
    | "create"
    | "schedule"
    | "mark-paid"
    | "confirm"
    | "distribute"
    | "turn-details"
    | "auction"
    // V136.A — Sheet d'édition de ses propres moyens de paiement (raccourci
    // depuis la vue tontine, plus efficace que d'aller dans le profil).
    | "my-methods"
    // V136.C — Le bénéficiaire déclare proactivement avoir reçu un paiement.
    // Force la transition PENDING → CONFIRMED en une étape (vs flux normal
    // PENDING → PAID → CONFIRMED qui exige que le payeur clique aussi).
    | "declare-received"
  >("none");
  const [activeTurn, setActiveTurn] = useState<Turn | null>(null);
  const [activeContribution, setActiveContribution] =
    useState<Contribution | null>(null);
  // V41.2 — Bids Hui mode
  const [bids, setBids] = useState<
    Array<{
      id: string;
      bidderId: string;
      amount: string;
      won: boolean;
      createdAt: string;
      bidder: { id: string; displayName: string };
    }>
  >([]);
  const [bidDraft, setBidDraft] = useState("");
  const [biddingBusy, setBiddingBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [meRes, g, tRes] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.getTontine(groupId).catch(() => ({ tontine: null })),
      ]);
      setMe(meRes.user);
      setGroup(g);
      // V129 — Hydratation : le backend renvoie `turn.beneficiary: { id,
      // displayName, avatar }` (objet, possiblement null) et `contribution.
      // contributor: { id, displayName, avatar }` (objet). Le frontend
      // attend des champs flatten (`beneficiaryUserId`, `beneficiaryName`,
      // `contributorUserId`, `contributorName`) — c'était le cas dans une
      // ancienne version de l'API, mais le backend a migré. On flatten ici
      // pour rétablir le contrat. CRASH constaté V129 : `turn.beneficiary
      // Name.charAt(0)` quand turn.beneficiaryName est undefined.
      setTontine(hydrateTontine(tRes.tontine));
      setError(null);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [groupId, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGroupEvents(groupId, (event) => {
    if (
      event.kind === "tontine.changed" ||
      event.kind === "tontine.activated" ||
      event.kind === "contribution.changed" ||
      event.kind === "turn.distributed"
    ) {
      void refresh();
    }
  });

  // Tour actuel = premier non-distribué (le suivant à remplir)
  const currentTurn = useMemo<Turn | null>(() => {
    if (!tontine?.turns) return null;
    const active = tontine.turns.find(
      (turn) => turn.status !== "COMPLETED" && !turn.distributedAt,
    );
    return active ?? tontine.turns[tontine.turns.length - 1] ?? null;
  }, [tontine]);

  const currency = group?.defaultCurrency ?? tontine?.currency ?? "EUR";
  const myMember = useMemo(
    () => group?.members.find((m) => m.user.id === me?.id) ?? null,
    [group, me],
  );
  const isAdmin = myMember?.role === "ADMIN";

  // ============ HANDLERS ============

  async function handleMarkPaid(opts?: {
    method?: string;
    reference?: string | null;
    paidAt?: string;
  }) {
    if (!activeContribution) return;
    try {
      // V141 — Le sélecteur unifié envoie maintenant méthode + référence + date.
      const finalMethod =
        opts?.method && opts.method.trim() ? opts.method : "Autre";
      await api.markContributionPaid(
        activeContribution.id,
        finalMethod,
        opts?.reference ?? undefined,
        opts?.paidAt,
      );
      haptic("success");
      toast.success(t("tontine.markedPaid") || "Marquée comme payée");
      setOpenSheet("none");
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
      throw e;
    }
  }

  async function handleConfirm() {
    if (!activeContribution) return;
    try {
      await api.confirmContribution(activeContribution.id);
      haptic("success");
      toast.success(t("tontine.confirmed") || "Réception confirmée");
      setOpenSheet("none");
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  /**
   * V136.C — Le bénéficiaire déclare proactivement avoir reçu un paiement.
   * Saute l'étape "le payeur clique J'ai payé" : passage direct PENDING →
   * CONFIRMED avec la méthode utilisée.
   */
  async function handleDeclareReceived(method: string) {
    if (!activeContribution) return;
    try {
      const finalMethod = method && method.trim() ? method : "Autre";
      await api.declareContributionReceived(
        activeContribution.id,
        finalMethod,
      );
      haptic("success");
      toast.success(
        t("tontine.declaredReceived") || "Paiement enregistré comme reçu",
      );
      setOpenSheet("none");
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  async function handleDistribute() {
    if (!activeTurn) return;
    try {
      await api.distributeTurn(activeTurn.id);
      haptic("success");
      toast.success(t("tontine.distributed") || "Tour distribué");
      setOpenSheet("none");
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  // V41.2 — AUCTION (Hui) handlers
  async function openAuction(turn: Turn) {
    setActiveTurn(turn);
    setOpenSheet("auction");
    try {
      const r = await api.listTurnBids(turn.id);
      setBids(r);
    } catch (e) {
      toast.error(e);
    }
  }

  async function handlePlaceBid() {
    if (!activeTurn) return;
    const amt = parseFloat(bidDraft.replace(",", ".")) || 0;
    if (amt <= 0) {
      toast.info(t("tontine.bidInvalid") || "Saisis un montant positif");
      return;
    }
    setBiddingBusy(true);
    try {
      await api.placeBid(activeTurn.id, amt.toFixed(2));
      haptic("success");
      toast.success(t("tontine.bidPlaced") || "Enchère enregistrée");
      const r = await api.listTurnBids(activeTurn.id);
      setBids(r);
      setBidDraft("");
    } catch (e) {
      haptic("error");
      toast.error(e);
    } finally {
      setBiddingBusy(false);
    }
  }

  async function handleWithdrawBid() {
    if (!activeTurn) return;
    setBiddingBusy(true);
    try {
      await api.withdrawBid(activeTurn.id);
      haptic("tap");
      toast.info(t("tontine.bidWithdrawn") || "Enchère retirée");
      const r = await api.listTurnBids(activeTurn.id);
      setBids(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setBiddingBusy(false);
    }
  }

  async function handleCloseBidding() {
    if (!activeTurn) return;
    const ok = await dialog.confirm(
      t("tontine.closeBidConfirmBody") ||
        "Clôturer les enchères ? Le gagnant sera désigné définitivement.",
      {
        title: t("tontine.closeBidConfirmTitle") || "Clôturer les enchères ?",
        variant: "warning",
        confirmLabel: t("tontine.closeBidCta") || "Clôturer",
        cancelLabel: t("common.cancel") || "Annuler",
      },
    );
    if (!ok) return;
    setBiddingBusy(true);
    try {
      const r = await api.closeBidding(activeTurn.id);
      haptic("success");
      toast.success(
        t("tontine.bidClosed", { name: r.winnerUserId }) ||
          "Enchères clôturées, gagnant désigné",
      );
      setOpenSheet("none");
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    } finally {
      setBiddingBusy(false);
    }
  }

  async function handleCancel() {
    if (!tontine) return;
    const ok = await dialog.confirm(
      t("tontine.cancelConfirmBody") ||
        "Cela annule définitivement la tontine en cours. Tous les tours non distribués seront perdus.",
      {
        title: t("tontine.cancelConfirmTitle") || "Annuler la tontine ?",
        variant: "danger",
        confirmLabel: t("tontine.cancelConfirm") || "Annuler la tontine",
        cancelLabel: t("common.back") || "Retour",
      },
    );
    if (!ok) return;
    try {
      await api.cancelTontine(tontine.id);
      haptic("success");
      toast.info(t("tontine.cancelled") || "Tontine annulée");
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  // ============ RENDER ============

  if (loading) {
    return <TontineSkeleton />;
  }
  if (error) {
    return (
      <div style={{ padding: "20px 16px", color: "var(--cream-soft)" }}>
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(217,113,74,0.10)",
            border: "1px solid rgba(217,113,74,0.30)",
            color: "#FFB89A",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  // ===== Pas de tontine encore créée =====
  if (!tontine) {
    return (
      <div
        style={{
          padding: "0 16px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <EmptyTontineState
          onCreate={() => setOpenSheet("create")}
          isAdmin={isAdmin}
          t={t}
        />
        {group && (
          <MobileAddTontineSheet
            open={openSheet === "create"}
            onClose={() => setOpenSheet("none")}
            groupId={groupId}
            members={group.members}
            defaultCurrency={currency}
            onCreated={() => {
              setOpenSheet("none");
              void refresh();
            }}
          />
        )}
      </div>
    );
  }

  // ===== Tontine existante : vue complète =====
  const turnCount = tontine.turns.length;
  const completedCount = tontine.turns.filter(
    (turn) => turn.distributedAt,
  ).length;
  const progress = turnCount > 0 ? completedCount / turnCount : 0;

  return (
    <div
      style={{
        padding: "0 16px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* V134 — Panneau d'activation pour les tontines en DRAFT.
          Avant ce fix, une tontine créée mais non activée affichait juste
          ses 4 méta-blocs (cotisation, fréquence, date, statut "DRAFT")
          sans aucun moyen UI pour démarrer la roue. Maintenant, si admin
          + DRAFT, on affiche un panneau "Lancer la tontine" qui active
          en 1 tap : génère les N turns + cotisations PENDING, fait
          basculer en ACTIVE, ce qui révèle le hero + l'anneau de rotation
          + le classement plus bas dans la page. */}
      {tontine.status === "DRAFT" && isAdmin && (
        <DraftActivationPanel
          tontine={tontine}
          memberCount={group?.members.length ?? 0}
          onActivate={async () => {
            try {
              // V134 — Récupère l'ordre manuel pré-saisi lors de la création
              // (cf. localStorage `bmd_tontine_pending_order:<id>` posé par
              // mobile-add-tontine-sheet pour les pré-V134). En fallback :
              // on prend les membres du groupe dans leur ordre actuel.
              let manualOrder: string[] | undefined;
              if (tontine.orderMode === "MANUAL") {
                try {
                  const raw = window.localStorage.getItem(
                    `bmd_tontine_pending_order:${tontine.id}`,
                  );
                  if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
                      manualOrder = parsed;
                    }
                  }
                } catch {
                  /* localStorage indispo (mode privé Safari) — fallback */
                }
                if (!manualOrder && group) {
                  manualOrder = group.members.map((m) => m.user.id);
                }
              }
              await api.activateTontine(tontine.id, manualOrder);
              // Cleanup localStorage post-activation
              try {
                window.localStorage.removeItem(
                  `bmd_tontine_pending_order:${tontine.id}`,
                );
              } catch {
                /* ignore */
              }
              haptic("success");
              toast.info(
                t("tontine.activated") || "Tontine lancée — la roue tourne 🌀",
              );
              void refresh();
            } catch (e) {
              haptic("error");
              toast.info(
                t("tontine.activateFailed") ||
                  `Activation impossible : ${(e as Error).message}`,
              );
            }
          }}
          t={t}
        />
      )}

      {/* HERO : carte du tour actuel — visible uniquement quand ACTIVE/COMPLETED */}
      {currentTurn && (
        <CurrentTurnCard
          turn={currentTurn}
          tontine={tontine}
          currency={currency}
          formatAmount={formatAmount}
          onTapDetails={() => {
            setActiveTurn(currentTurn);
            setOpenSheet("turn-details");
          }}
          t={t}
        />
      )}

      {/* Anneau de rotation des bénéficiaires (vide si DRAFT — pas affiché) */}
      {tontine.status !== "DRAFT" && (
        <RotationRing
          turns={tontine.turns}
          meId={me?.id}
          onTapTurn={(turn) => {
            setActiveTurn(turn);
            setOpenSheet("turn-details");
          }}
          progress={progress}
          t={t}
        />
      )}

      {/* Contributions du tour actuel */}
      {currentTurn && (
        <CurrentTurnContributions
          turn={currentTurn}
          meId={me?.id}
          formatAmount={formatAmount}
          onMarkPaid={(c) => {
            setActiveContribution(c);
            setOpenSheet("mark-paid");
          }}
          onConfirm={(c) => {
            setActiveContribution(c);
            setOpenSheet("confirm");
          }}
          // V136.C — Bénéficiaire déclare avoir reçu un paiement encore PENDING.
          onDeclareReceived={(c) => {
            setActiveContribution(c);
            setOpenSheet("declare-received");
          }}
          isAdmin={isAdmin}
          t={t}
        />
      )}

      {/* V41.2 — Bouton AUCTION si la tontine est en mode enchères Hui */}
      {currentTurn && tontine.orderMode === "AUCTION" && (
        <button
          type="button"
          onClick={() => openAuction(currentTurn)}
          style={{
            padding: "14px 18px",
            background:
              "linear-gradient(135deg, rgba(91,108,255,0.15), rgba(91,108,255,0.05))",
            color: "var(--cream)",
            border: "1px solid rgba(91,108,255,0.40)",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            touchAction: "manipulation",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI */}
          <Icon name="trophy" size={16} strokeWidth={1.6} />
          {t("tontine.viewBids") || "Voir les enchères Hui"}
        </button>
      )}

      {/* Bouton distribuer si tour prêt (toutes contributions CONFIRMED) */}
      {currentTurn && isAdmin && isReadyToDistribute(currentTurn) && (
        <button
          type="button"
          onClick={() => {
            setActiveTurn(currentTurn);
            setOpenSheet("distribute");
          }}
          style={{
            padding: "14px 18px",
            background:
              "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "#16111E",
            border: "none",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            touchAction: "manipulation",
            boxShadow: "0 10px 30px rgba(232,163,61,0.30)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI */}
          <Icon name="sparkles" size={16} strokeWidth={1.6} />
          {t("tontine.distributeNow") || "Distribuer maintenant"}
        </button>
      )}

      {/* Footer info */}
      <TontineMeta
        tontine={tontine}
        memberCount={group?.members.length ?? 0}
        completedCount={completedCount}
        currency={currency}
        formatAmount={formatAmount}
        t={t}
      />

      {/* Bouton annuler si admin et tontine active */}
      {isAdmin && tontine.status === "ACTIVE" && (
        <button
          type="button"
          onClick={handleCancel}
          style={{
            padding: "10px 16px",
            background: "transparent",
            color: "#FFB89A",
            border: "1px solid rgba(217,113,74,0.30)",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            opacity: 0.7,
            alignSelf: "center",
            marginTop: 8,
          }}
        >
          {t("tontine.cancelTontine") || "Annuler la tontine"}
        </button>
      )}

      {/* === BOTTOM SHEETS === */}
      <BottomSheet
        open={openSheet === "mark-paid"}
        onClose={() => setOpenSheet("none")}
        title={t("tontine.markPaidTitle") || "Marquer comme payée"}
      >
        {activeContribution && (
          <PaymentDeclarationForm
            amountLabel={formatAmount(
              activeContribution.amount,
              activeContribution.currency,
            )}
            contextLabel={
              activeTurn?.beneficiaryName
                ? t("payment.payingContext", {
                    name: activeTurn.beneficiaryName,
                  }) || `Tu paies à ${activeTurn.beneficiaryName}`
                : t("payment.declareContribution") ||
                  "Tu déclares ta cotisation"
            }
            submitLabel={t("payment.declareCta") || "Confirmer le paiement"}
            onSubmit={async (payload) => {
              await handleMarkPaid({
                method: payload.paymentMethod,
                reference: payload.paymentReference,
                paidAt: payload.paidAt,
              });
            }}
            onCancel={() => setOpenSheet("none")}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={openSheet === "confirm"}
        onClose={() => setOpenSheet("none")}
        title={t("tontine.confirmTitle") || "Confirmer la réception"}
      >
        <ContributionActionContent
          contribution={activeContribution}
          formatAmount={formatAmount}
          actionLabel={t("tontine.confirmCta") || "Confirmer"}
          onAction={handleConfirm}
          onCancel={() => setOpenSheet("none")}
          hint={
            t("tontine.confirmHint") ||
            "Tu confirmes avoir effectivement reçu cette contribution."
          }
          t={t}
        />
      </BottomSheet>

      <BottomSheet
        open={openSheet === "distribute"}
        onClose={() => setOpenSheet("none")}
        title={t("tontine.distributeTitle") || "Distribuer le tour"}
      >
        <DistributeContent
          turn={activeTurn}
          tontine={tontine}
          formatAmount={formatAmount}
          onAction={handleDistribute}
          onCancel={() => setOpenSheet("none")}
          t={t}
        />
      </BottomSheet>

      {/* V41.2 — BottomSheet AUCTION (Hui bids) */}
      <BottomSheet
        open={openSheet === "auction"}
        onClose={() => setOpenSheet("none")}
        title={t("tontine.auctionTitle") || "Enchères Hui"}
      >
        <AuctionContent
          bids={bids}
          meId={me?.id}
          isAdmin={isAdmin}
          tontineCurrency={tontine.currency}
          bidDraft={bidDraft}
          setBidDraft={setBidDraft}
          busy={biddingBusy}
          onPlace={handlePlaceBid}
          onWithdraw={handleWithdrawBid}
          onClose={handleCloseBidding}
          formatAmount={formatAmount}
          t={t}
        />
      </BottomSheet>

      <BottomSheet
        open={openSheet === "turn-details"}
        onClose={() => setOpenSheet("none")}
        title={
          (t("tontine.turnNumber", {
            n: String(activeTurn?.turnNumber ?? 0),
          }) || `Tour ${activeTurn?.turnNumber}`) +
          " — " +
          (activeTurn?.beneficiaryName ?? "")
        }
      >
        <TurnDetailsContent
          turn={activeTurn}
          meId={me?.id}
          formatAmount={formatAmount}
          onMarkPaid={(c) => {
            setActiveContribution(c);
            setOpenSheet("mark-paid");
          }}
          onConfirm={(c) => {
            setActiveContribution(c);
            setOpenSheet("confirm");
          }}
          onEditMyMethods={() => {
            // V136.A — Ferme le détail-tour temporairement pour ouvrir
            // l'éditeur de méthodes par-dessus. À la fermeture du sheet
            // méthodes, on ne remet pas le détail-tour automatiquement —
            // le user peut re-tap la bulle.
            setOpenSheet("my-methods");
          }}
          onDeclareReceived={(c) => {
            setActiveContribution(c);
            setOpenSheet("declare-received");
          }}
          // V138 — Persistance directe (bénéficiaire) ou proposition (admin
          // non-bénéficiaire). Le composant TurnLocationBlock route vers le
          // bon handler selon le rôle. Best-effort + refresh ensuite.
          onSaveTurnDetails={async ({
            location,
            meetingTime,
            notes,
            scheduledDate,
          }) => {
            if (!activeTurn) return;
            try {
              await api.updateTurnDetails(activeTurn.id, {
                location,
                meetingTime,
                notes,
                scheduledDate,
              });
              haptic("success");
              toast.success(
                t("tontine.locationSaved") || "Mise à jour envoyée",
              );
              void refresh();
            } catch (e) {
              haptic("error");
              toast.error(e);
              throw e;
            }
          }}
          // V138 — Admin (non bénéficiaire) propose un changement → POST
          // /tontine-turns/:id/proposals → bénéficiaire devra accepter.
          onProposeTurnUpdate={async (input) => {
            if (!activeTurn) return;
            try {
              await api.proposeTurnUpdate(activeTurn.id, input);
              haptic("success");
              toast.success(
                t("tontine.proposalSent") ||
                  "Proposition envoyée au bénéficiaire",
              );
              void refresh();
            } catch (e) {
              haptic("error");
              toast.error(e);
              throw e;
            }
          }}
          // V138 — Bénéficiaire accept/reject une proposition admin.
          onRespondTurnProposal={async (proposalId, decision, reason) => {
            try {
              await api.respondToTurnProposal(proposalId, {
                decision,
                rejectionReason: reason ?? null,
              });
              haptic("success");
              toast.success(
                decision === "ACCEPT"
                  ? t("tontine.proposalAccepted") || "Proposition acceptée"
                  : t("tontine.proposalRejected") || "Proposition refusée",
              );
              void refresh();
            } catch (e) {
              haptic("error");
              toast.error(e);
              throw e;
            }
          }}
          isAdmin={isAdmin}
          t={t}
        />
      </BottomSheet>

      {/* V136.C — BottomSheet pour la déclaration proactive de réception.
          Réutilise ContributionActionContent avec showMethodSelector. */}
      <BottomSheet
        open={openSheet === "declare-received"}
        onClose={() => setOpenSheet("none")}
        title={
          t("tontine.declareReceivedTitle") ||
          "Marquer comme reçu"
        }
      >
        <ContributionActionContent
          contribution={activeContribution}
          formatAmount={formatAmount}
          actionLabel={t("tontine.declareReceivedCta") || "✓ J'ai bien reçu"}
          onAction={() => handleDeclareReceived("Autre")}
          onActionWithMethod={(method) => handleDeclareReceived(method)}
          showMethodSelector
          onCancel={() => setOpenSheet("none")}
          hint={
            t("tontine.declareReceivedHint") ||
            "Tu confirmes avoir bien reçu cette cotisation. Précise le moyen utilisé par la personne (utile pour la traçabilité)."
          }
          t={t}
        />
      </BottomSheet>

      {/* V136.A — Sheet d'édition des MES moyens de paiement, ouvert au tap
          sur "✎ Modifier" depuis le PaymentMethodsBlock quand le bénéficiaire
          du tour visualisé est moi. Wrapper léger autour du PaymentMethodsBlock
          existant (CRUD complet déjà géré). */}
      <MobileMyPaymentMethodsSheet
        open={openSheet === "my-methods"}
        onClose={() => setOpenSheet("none")}
      />
    </div>
  );
}

// ============ HERO CARD : carte du tour actuel ============

function CurrentTurnCard({
  turn,
  tontine,
  currency,
  formatAmount,
  onTapDetails,
  t,
}: {
  turn: Turn;
  tontine: TontineData;
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  onTapDetails: () => void;
  t: ReturnType<typeof useT>;
}) {
  const totalContributions = turn.contributions.length;
  const paidCount = turn.contributions.filter(
    (c) => c.status === "PAID" || c.status === "CONFIRMED",
  ).length;
  const confirmedCount = turn.contributions.filter(
    (c) => c.status === "CONFIRMED",
  ).length;
  // Total potentiel = montant × nombre de contributeurs
  const totalPot = parseFloat(tontine.contributionAmount) * totalContributions;
  // Jours restants avant la date prévue
  const targetDate = turn.scheduledDate
    ? new Date(turn.scheduledDate)
    : new Date(turn.dueDate);
  const daysLeft = Math.max(
    0,
    Math.ceil((targetDate.getTime() - Date.now()) / (24 * 3600 * 1000)),
  );

  // V52.F3 — Hero V45 centré avec avatar XL pulsing
  const formattedDate = targetDate.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <button
      type="button"
      onClick={onTapDetails}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* V52.F3 — Hero V45 centré avec avatar XL pulsing */}
      <div
        style={{
          position: "relative",
          padding: 24,
          borderRadius: 22,
          background: "var(--paper, rgba(244,228,193,0.04))",
          border: "1px solid var(--v45-line, rgba(244,228,193,0.06))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          textAlign: "center",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        {/* Eyebrow : Tour N · Bénéficiaire */}
        <span
          style={{
            fontSize: 11,
            color: "var(--cocoa-mute, var(--cream-soft))",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {`${t("tontine.currentTurn") || "Tour"} ${turn.turnNumber} · ${t("tontine.beneficiary") || "Bénéficiaire"}`}
        </span>

        {/* Avatar XL 96px — double anneau ivoire/saffron + pulse */}
        <div
          className="bmd-hero-pulse"
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            padding: 3,
            background:
              "linear-gradient(135deg, var(--saffron), var(--saffron-soft, rgba(232,163,61,0.55)))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 10px 28px rgba(232,163,61,0.30)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              padding: 2,
              background: "var(--paper, rgba(244,228,193,0.04))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, var(--saffron), var(--terracotta))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--paper, #16111E)",
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 36,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {(turn.beneficiaryName ?? "?").charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Nom bénéficiaire */}
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--cream)",
            lineHeight: 1.15,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            padding: "0 8px",
          }}
        >
          {turn.beneficiaryName}
        </div>

        {/* Date pot */}
        <div
          style={{
            fontSize: 12,
            color: "var(--cocoa-soft, var(--cream-soft))",
            lineHeight: 1.2,
          }}
        >
          {t("tontine.receivesPotOn", { date: formattedDate }) ||
            `Reçoit le pot le ${formattedDate}`}
        </div>

        {/* Montant pot — Cormorant 42px */}
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 42,
            fontWeight: 700,
            color: "var(--cream)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            marginTop: 4,
            overflowWrap: "anywhere",
            maxWidth: "100%",
          }}
        >
          {formatAmount(totalPot, currency)}
        </div>

        {/* Countdown jours + progress paiements */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 14,
              background: "rgba(244,228,193,0.06)",
              border: "1px solid rgba(244,228,193,0.10)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              minWidth: 64,
            }}
          >
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 18,
                fontWeight: 700,
                color: daysLeft <= 3 ? "#FFB89A" : "var(--saffron)",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {daysLeft}
            </span>
            <span
              style={{
                fontSize: 9,
                color: "var(--cocoa-mute, var(--cream-soft))",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {t("tontine.daysLeft") || "Jours"}
            </span>
          </div>

          <div
            style={{
              padding: "8px 14px",
              borderRadius: 14,
              background: "rgba(244,228,193,0.06)",
              border: "1px solid rgba(244,228,193,0.10)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              minWidth: 110,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--cream)",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {paidCount}/{totalContributions}
              </span>
              {confirmedCount === totalContributions && (
                <span
                  style={{
                    fontWeight: 800,
                    color: "#7DC59E",
                    background: "rgba(125,197,158,0.12)",
                    border: "1px solid rgba(125,197,158,0.30)",
                    padding: "1px 4px",
                    borderRadius: 6,
                    display: "inline-flex",
                  }}
                >
                  {/* V52.C2 — SVG remplace EMOJI */}
                  <Icon name="check" size={10} strokeWidth={2.2} />
                </span>
              )}
            </div>
            <div
              style={{
                width: 90,
                height: 4,
                borderRadius: 999,
                background: "rgba(244,228,193,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(paidCount / totalContributions) * 100}%`,
                  height: "100%",
                  borderRadius: 999,
                  background:
                    "linear-gradient(90deg, var(--saffron), var(--terracotta))",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 9,
                color: "var(--cocoa-mute, var(--cream-soft))",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {t("tontine.paid") || "Payés"}
            </span>
          </div>
        </div>

        {/* V52.F3 — pulse keyframes (respect prefers-reduced-motion) */}
        <style jsx>{`
          .bmd-hero-pulse {
            animation: bmd-hero-pulse 2s ease-in-out infinite;
          }
          @keyframes bmd-hero-pulse {
            0%,
            100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.03);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .bmd-hero-pulse {
              animation: none;
            }
          }
        `}</style>
      </div>
    </button>
  );
}

// ============ ANNEAU DE ROTATION ============

/**
 * V175.E — Sous-composant memoisé d'un siège du wheel.
 * Re-render uniquement si une prop change (turn, isActive, isCompleted, isMe).
 * Avant : tous les sièges re-renderent à chaque update parent.
 */
interface TontineSeatProps {
  turn: Turn;
  x: number;
  y: number;
  avatarSize: number;
  isActive: boolean;
  isCompleted: boolean;
  isMe: boolean;
  onTap: (turn: Turn) => void;
}
const TontineSeat = memo(function TontineSeat({
  turn,
  x,
  y,
  avatarSize,
  isActive,
  isCompleted,
  isMe,
  onTap,
}: TontineSeatProps) {
  const hasPhoto =
    typeof turn.beneficiaryAvatar === "string" &&
    turn.beneficiaryAvatar.length > 0;
  return (
    <button
      type="button"
      onClick={() => onTap(turn)}
      aria-label={`${turn.beneficiaryName} — tour ${turn.turnNumber}`}
      className={isActive ? "bmd-tontine-pulse" : undefined}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: avatarSize,
        height: avatarSize,
        borderRadius: "50%",
        background: isCompleted
          ? "linear-gradient(135deg, rgba(125,197,158,0.35), rgba(63,125,92,0.20))"
          : isActive
            ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
            : "rgba(244,228,193,0.06)",
        border: isActive
          ? "2px solid var(--saffron)"
          : isCompleted
            ? "1px solid rgba(125,197,158,0.40)"
            : "1px solid rgba(244,228,193,0.15)",
        color: isActive
          ? "#16111E"
          : isCompleted
            ? "#7DC59E"
            : "var(--cream-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Cormorant Garamond, serif",
        fontSize: 14,
        fontWeight: 800,
        cursor: "pointer",
        padding: 0,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        overflow: "hidden",
        boxShadow: isActive
          ? "0 0 0 4px var(--v45-saffron-pale, rgba(246,232,197,0.7)), 0 0 24px rgba(197,138,46,0.40)"
          : "none",
      }}
    >
      {hasPhoto ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backgroundImage: `url(${turn.beneficiaryAvatar})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: isCompleted ? 0.85 : 1,
          }}
        />
      ) : (
        (turn.beneficiaryName ?? "?").charAt(0).toUpperCase()
      )}
      {isMe && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: "var(--saffron)",
            border: "2px solid #2A2244",
          }}
        />
      )}
    </button>
  );
});

function RotationRing({
  turns,
  meId,
  onTapTurn,
  progress,
  t,
}: {
  turns: Turn[];
  meId?: string;
  onTapTurn: (turn: Turn) => void;
  progress: number;
  t: ReturnType<typeof useT>;
}) {
  const size = 220;
  const center = size / 2;
  // Rayon où placer les avatars (légèrement à l'intérieur du cercle visible)
  const ringRadius = 88;
  const avatarSize = 38;
  const total = turns.length;
  if (total === 0) return null;

  // Premier tour actif (non distribué)
  const activeIdx = turns.findIndex(
    (turn) => turn.status !== "COMPLETED" && !turn.distributedAt,
  );

  // V175.E — Positions + flags memoisés. Ne recalcule que si turns / activeIdx / meId change.
  const seatPositions = useMemo(() => {
    return turns.map((turn, idx) => {
      const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
      const x = center + ringRadius * Math.cos(angle) - avatarSize / 2;
      const y = center + ringRadius * Math.sin(angle) - avatarSize / 2;
      return {
        turn,
        x,
        y,
        isCompleted: !!turn.distributedAt,
        isActive: idx === activeIdx,
        isMe: turn.beneficiaryUserId === meId,
      };
    });
  }, [turns, total, center, ringRadius, avatarSize, activeIdx, meId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--saffron)",
          textTransform: "uppercase",
          letterSpacing: 1.6,
          fontWeight: 700,
          alignSelf: "center",
        }}
      >
        {t("tontine.rotationRing") || "Anneau de rotation"}
      </div>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: "visible" }}
          aria-label={t("tontine.rotationRingAria") || "Anneau de rotation des bénéficiaires"}
        >
          <defs>
            <linearGradient id="bmd-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--saffron, #e8a33d)" />
              <stop offset="100%" stopColor="var(--terracotta, #b54732)" />
            </linearGradient>
          </defs>

          {/* Cercle de fond */}
          <circle
            cx={center}
            cy={center}
            r={ringRadius}
            fill="none"
            stroke="rgba(244,228,193,0.10)"
            strokeWidth="2"
          />
          {/* Arc de progression */}
          <circle
            cx={center}
            cy={center}
            r={ringRadius}
            fill="none"
            stroke="url(#bmd-ring-grad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * ringRadius * progress} ${2 * Math.PI * ringRadius}`}
            transform={`rotate(-90 ${center} ${center})`}
          />

          {/* Centre : nombre de tours */}
          <text
            x={center}
            y={center - 6}
            textAnchor="middle"
            fill="var(--cream-soft)"
            fontSize="9"
            fontWeight="700"
            letterSpacing="1.4"
            style={{ textTransform: "uppercase" }}
          >
            {t("tontine.turnsLabel") || "Tours"}
          </text>
          <text
            x={center}
            y={center + 16}
            textAnchor="middle"
            fill="var(--cream)"
            fontSize="22"
            fontWeight="700"
            fontFamily="Cormorant Garamond, serif"
          >
            {Math.round(progress * total)}/{total}
          </text>
        </svg>

        {/* V175.E — Sièges : positions memoisées + sous-composant memo */}
        {seatPositions.map((p) => (
          <TontineSeat
            key={p.turn.id}
            turn={p.turn}
            x={p.x}
            y={p.y}
            avatarSize={avatarSize}
            isActive={p.isActive}
            isCompleted={p.isCompleted}
            isMe={p.isMe}
            onTap={onTapTurn}
          />
        ))}
        {/* V52.E2 — Cercles V45 + pulse animation (keyframes globales) */}
        <style jsx global>{`
          @keyframes bmd-tontine-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          .bmd-tontine-pulse {
            animation: bmd-tontine-pulse 2s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .bmd-tontine-pulse { animation: none; }
          }
        `}</style>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textAlign: "center",
          maxWidth: 240,
          lineHeight: 1.5,
        }}
      >
        {t("tontine.ringHint") ||
          "Tape un membre pour voir son tour. La progression suit l'horloge."}
      </div>
    </div>
  );
}

// ============ CONTRIBUTIONS DU TOUR ACTUEL ============

function CurrentTurnContributions({
  turn,
  meId,
  formatAmount,
  onMarkPaid,
  onConfirm,
  onDeclareReceived,
  isAdmin,
  t,
}: {
  turn: Turn;
  meId?: string;
  formatAmount: (a: number | string, c: string) => string;
  onMarkPaid: (c: Contribution) => void;
  onConfirm: (c: Contribution) => void;
  // V136.C — Bénéficiaire déclare avoir reçu un paiement encore PENDING.
  onDeclareReceived?: (c: Contribution) => void;
  isAdmin: boolean;
  t: ReturnType<typeof useT>;
}) {
  // Tri : moi en premier si je dois encore payer
  const sorted = useMemo(() => {
    const arr = [...turn.contributions];
    arr.sort((a, b) => {
      const aIsMePending =
        a.contributorUserId === meId && a.status === "PENDING";
      const bIsMePending =
        b.contributorUserId === meId && b.status === "PENDING";
      if (aIsMePending && !bIsMePending) return -1;
      if (!aIsMePending && bIsMePending) return 1;
      // Sinon : PENDING avant PAID avant CONFIRMED
      const order = { PENDING: 0, PAID: 1, CONFIRMED: 2 };
      return (
        (order[a.status as keyof typeof order] ?? 3) -
        (order[b.status as keyof typeof order] ?? 3)
      );
    });
    return arr;
  }, [turn.contributions, meId]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1.4,
          fontWeight: 700,
          margin: "0 0 0 4px",
        }}
      >
        {t("tontine.contributions") || "Contributions"}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((c) => (
          <ContributionRow
            key={c.id}
            contribution={c}
            isMe={c.contributorUserId === meId}
            isMeBeneficiary={turn.beneficiaryUserId === meId}
            formatAmount={formatAmount}
            onMarkPaid={() => onMarkPaid(c)}
            onConfirm={() => onConfirm(c)}
            onDeclareReceived={() => onDeclareReceived?.(c)}
            isAdmin={isAdmin}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function ContributionRow({
  contribution,
  isMe,
  isMeBeneficiary,
  formatAmount,
  onMarkPaid,
  onConfirm,
  onDeclareReceived,
  isAdmin,
  t,
}: {
  contribution: Contribution;
  isMe: boolean;
  isMeBeneficiary: boolean;
  formatAmount: (a: number | string, c: string) => string;
  onMarkPaid: () => void;
  onConfirm: () => void;
  // V136.C — Callback "J'ai reçu" pour le bénéficiaire qui veut clôturer
  // un paiement encore PENDING sans attendre que le payeur déclare.
  onDeclareReceived?: () => void;
  isAdmin: boolean;
  t: ReturnType<typeof useT>;
}) {
  const isPaid = contribution.status === "PAID";
  const isConfirmed = contribution.status === "CONFIRMED";
  const isPending = contribution.status === "PENDING";

  const statusColor = isConfirmed
    ? "#7DC59E"
    : isPaid
      ? "var(--saffron)"
      : "var(--cream-soft)";
  const statusBg = isConfirmed
    ? "rgba(125,197,158,0.12)"
    : isPaid
      ? "rgba(232,163,61,0.12)"
      : "rgba(244,228,193,0.06)";
  const statusBorder = isConfirmed
    ? "rgba(125,197,158,0.30)"
    : isPaid
      ? "rgba(232,163,61,0.30)"
      : "rgba(244,228,193,0.10)";
  const statusLabel = isConfirmed
    ? t("tontine.statusConfirmed") || "Confirmée"
    : isPaid
      ? t("tontine.statusPaid") || "Payée"
      : t("tontine.statusPending") || "À régler";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: isMe && isPending
          ? "rgba(232,163,61,0.06)"
          : "rgba(244,228,193,0.03)",
        border:
          isMe && isPending
            ? "1px solid rgba(232,163,61,0.30)"
            : "1px solid rgba(244,228,193,0.08)",
        borderRadius: 12,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: "rgba(232,163,61,0.15)",
          color: "var(--saffron)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {contribution.contributorName.charAt(0).toUpperCase()}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--cream)",
            fontWeight: 600,
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {isMe
              ? t("common.you") || "Toi"
              : contribution.contributorName}
          </span>
          {isMe && isPending && (
            <span
              style={{
                fontSize: 9,
                color: "var(--saffron)",
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                background: "rgba(232,163,61,0.18)",
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              {t("tontine.youAction") || "À toi"}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              padding: "1px 6px",
              borderRadius: 4,
              background: statusBg,
              border: `1px solid ${statusBorder}`,
              color: statusColor,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {statusLabel}
          </span>
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
            }}
          >
            {formatAmount(contribution.amount, contribution.currency)}
          </span>
        </div>
      </div>
      {/* Actions */}
      {isMe && isPending && (
        <button
          type="button"
          onClick={onMarkPaid}
          style={miniBtnPrimary()}
        >
          {t("tontine.iPaid") || "J'ai payé"}
        </button>
      )}
      {/* V136.C — Bouton "J'ai reçu" proactif : visible quand le bénéficiaire
          du tour est moi-même ET que la contribution est encore PENDING
          (payeur n'a pas encore déclaré). Permet de clore en une étape
          quand le paiement a eu lieu en cash ou hors-app. */}
      {isMeBeneficiary && isPending && onDeclareReceived && !isMe && (
        <button
          type="button"
          onClick={onDeclareReceived}
          style={miniBtnSuccess()}
        >
          {t("tontine.iReceivedProactive") || "✓ Reçu"}
        </button>
      )}
      {isPaid && (isMeBeneficiary || isAdmin) && (
        <button
          type="button"
          onClick={onConfirm}
          style={miniBtnSuccess()}
        >
          {t("tontine.iReceived") || "Reçu"}
        </button>
      )}
    </div>
  );
}

function miniBtnPrimary(): React.CSSProperties {
  return {
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    background:
      "linear-gradient(135deg, var(--saffron), var(--terracotta))",
    color: "#16111E",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    touchAction: "manipulation",
    flexShrink: 0,
  };
}
function miniBtnSuccess(): React.CSSProperties {
  return {
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    background: "rgba(125,197,158,0.20)",
    color: "#7DC59E",
    border: "1px solid rgba(125,197,158,0.40)",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    touchAction: "manipulation",
    flexShrink: 0,
  };
}

// ============ META BLOCK ============

function TontineMeta({
  tontine,
  memberCount,
  completedCount,
  currency,
  formatAmount,
  t,
}: {
  tontine: TontineData;
  memberCount: number;
  completedCount: number;
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
      }}
    >
      <MetaTile
        label={t("tontine.contribution") || "Contribution"}
        value={formatAmount(tontine.contributionAmount, currency)}
      />
      <MetaTile
        label={t("tontine.frequency") || "Fréquence"}
        value={
          tontine.frequency === "WEEKLY"
            ? t("tontine.freqWeekly") || "Hebdo"
            : tontine.frequency === "BIWEEKLY"
              ? t("tontine.freqBiweekly") || "2 sem"
              : t("tontine.freqMonthly") || "Mensuel"
        }
      />
      <MetaTile
        label={t("tontine.startedOn") || "Démarrée"}
        value={new Date(tontine.startDate).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
        })}
      />
      {/* V52.C2 — SVG remplace EMOJI : on retire le préfixe pictogramme (V45 préfère texte clair) */}
      <MetaTile
        label={t("tontine.statusLabel") || "Statut"}
        value={
          tontine.status === "ACTIVE"
            ? (t("tontine.active") || "Active")
            : tontine.status === "COMPLETED"
              ? (t("tontine.completed") || "Terminée")
              : tontine.status
        }
      />
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--cream)",
          marginTop: 3,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============ EMPTY STATE ============

function EmptyTontineState({
  onCreate,
  isAdmin,
  t,
}: {
  onCreate: () => void;
  isAdmin: boolean;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      style={{
        padding: "40px 18px",
        textAlign: "center",
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.06), rgba(181,70,46,0.02))",
        border: "1px dashed rgba(232,163,61,0.30)",
        borderRadius: 18,
        marginTop: 8,
      }}
    >
      {/* V52.C2 — SVG remplace EMOJI */}
      <div style={{ marginBottom: 14, color: "var(--saffron)", display: "flex", justifyContent: "center" }}>
        <Icon name="coins" size={56} strokeWidth={1.4} />
      </div>
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 24,
          fontWeight: 700,
          color: "var(--cream)",
          margin: "0 0 8px",
          lineHeight: 1.2,
        }}
      >
        {t("tontine.emptyTitle") || "Pas encore de tontine"}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--cream-soft)",
          margin: "0 auto 18px",
          maxWidth: 280,
          lineHeight: 1.5,
        }}
      >
        {t("tontine.emptyHint") ||
          "Une tontine permet à chaque membre du groupe de recevoir à tour de rôle la cagnotte. Démarre quand tu es prêt."}
      </p>
      {isAdmin ? (
        <button
          type="button"
          onClick={onCreate}
          style={{
            padding: "12px 22px",
            background:
              "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "#16111E",
            border: "none",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: "0 10px 30px rgba(232,163,61,0.30)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI */}
          <Icon name="sparkles" size={16} strokeWidth={1.6} />
          {t("tontine.startCta") || "Démarrer une tontine"}
        </button>
      ) : (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          {t("tontine.notAdminHint") ||
            "Seul un admin du groupe peut démarrer une tontine."}
        </p>
      )}
    </div>
  );
}

// ============ SKELETON ============

function TontineSkeleton() {
  return (
    <div
      style={{
        padding: "0 16px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          height: 200,
          borderRadius: 22,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-tontine-skel 1.2s infinite ease-in-out",
        }}
      />
      <div
        style={{
          height: 240,
          borderRadius: 14,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-tontine-skel 1.2s infinite ease-in-out 0.1s",
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 50,
            borderRadius: 12,
            background: "rgba(244,228,193,0.04)",
            animation: `bmd-tontine-skel 1.2s infinite ease-in-out ${0.2 + i * 0.06}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes bmd-tontine-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ============ BOTTOM SHEET CONTENTS ============

function ContributionActionContent({
  contribution,
  formatAmount,
  actionLabel,
  onAction,
  onActionWithMethod,
  onCancel,
  hint,
  showMethodSelector,
  t,
}: {
  contribution: Contribution | null;
  formatAmount: (a: number | string, c: string) => string;
  actionLabel: string;
  onAction: () => void;
  // V136.B — Variante du callback qui passe la méthode choisie. Utilisé
  // pour markPaid : l'utilisateur sélectionne par quel moyen il a réglé.
  onActionWithMethod?: (method: string) => void;
  onCancel: () => void;
  hint: string;
  // V136.B — Quand true, affiche le sélecteur de méthode (markPaid uniquement).
  showMethodSelector?: boolean;
  t: ReturnType<typeof useT>;
}) {
  // V136.B — Chargement des méthodes du payeur (l'utilisateur connecté)
  // depuis /me/payment-methods. Toujours augmenté de "Cash" + "Autre" en
  // fallback pour couvrir les paiements physiques ou non-listés.
  const [myMethods, setMyMethods] = useState<
    Array<{ id: string; typeLabel: string; label: string; last4: string }>
  >([]);
  const [methodLoading, setMethodLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>("");

  useEffect(() => {
    if (!showMethodSelector) return;
    setMethodLoading(true);
    api
      .listMyPaymentMethods()
      .then((rows) => {
        setMyMethods(
          rows.map((r) => ({
            id: r.id,
            typeLabel: r.typeLabel,
            label: r.label,
            last4: r.last4,
          })),
        );
        // Pré-sélectionne la 1ère méthode si disponible — sinon "Cash" par défaut
        setSelectedMethod(rows[0]?.label || "Cash / Espèces");
      })
      .catch(() => {
        // Pas de vault configuré ou erreur : on garde juste Cash + Autre
        setSelectedMethod("Cash / Espèces");
      })
      .finally(() => setMethodLoading(false));
  }, [showMethodSelector]);

  if (!contribution) return null;

  // V136.B — Liste finale = méthodes user + fallbacks "Cash" + "Autre"
  const methodOptions: Array<{ key: string; label: string; sub?: string }> = [
    ...myMethods.map((m) => ({
      key: m.label,
      label: m.label,
      sub: `${m.typeLabel} · •••• ${m.last4}`,
    })),
    { key: "Cash / Espèces", label: "Cash / Espèces", sub: "Paiement physique" },
    { key: "Autre", label: "Autre", sub: "Précisé verbalement" },
  ];

  function handlePrimaryAction() {
    if (showMethodSelector && onActionWithMethod) {
      onActionWithMethod(selectedMethod || "Autre");
    } else {
      onAction();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: "18px 16px",
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.04))",
          border: "1px solid rgba(232,163,61,0.30)",
          borderRadius: 14,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            marginBottom: 4,
          }}
        >
          {contribution.contributorName}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 32,
            fontWeight: 700,
            color: "var(--cream)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatAmount(contribution.amount, contribution.currency)}
        </div>
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {hint}
      </p>

      {/* V136.B — Sélecteur de méthode (markPaid uniquement) */}
      {showMethodSelector && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--cocoa-soft, #6B5B47)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {t("tontine.payMethodChoose") || "Quel moyen as-tu utilisé ?"}
          </div>
          {methodLoading && (
            <div style={{ fontSize: 12, color: "var(--cocoa-mute, #A99580)" }}>
              {t("tontine.methodsLoading") || "Chargement…"}
            </div>
          )}
          {!methodLoading &&
            methodOptions.map((opt) => {
              const isSelected = selectedMethod === opt.key;
              return (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => setSelectedMethod(opt.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: isSelected
                      ? "rgba(197,138,46,0.12)"
                      : "var(--ivory, #FBF6EC)",
                    border: `1.5px solid ${isSelected ? "var(--v45-saffron, #C58A2E)" : "transparent"}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? "var(--v45-saffron, #C58A2E)" : "var(--cocoa-mute, #A99580)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: "var(--v45-saffron, #C58A2E)",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--cocoa, #2B1F15)",
                        lineHeight: 1.3,
                      }}
                    >
                      {opt.label}
                    </div>
                    {opt.sub && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--cocoa-soft, #6B5B47)",
                          marginTop: 2,
                        }}
                      >
                        {opt.sub}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
        </div>
      )}

      <button
        type="button"
        onClick={handlePrimaryAction}
        disabled={showMethodSelector && !selectedMethod}
        style={{
          padding: "14px 20px",
          background:
            "linear-gradient(135deg, var(--saffron), var(--terracotta))",
          color: "#16111E",
          border: "none",
          borderRadius: 14,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          opacity: showMethodSelector && !selectedMethod ? 0.5 : 1,
        }}
      >
        {actionLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: "12px 20px",
          background: "transparent",
          color: "var(--cream-soft)",
          border: "1px solid rgba(244,228,193,0.18)",
          borderRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {t("common.cancel") || "Annuler"}
      </button>
    </div>
  );
}

function DistributeContent({
  turn,
  tontine,
  formatAmount,
  onAction,
  onCancel,
  t,
}: {
  turn: Turn | null;
  tontine: TontineData;
  formatAmount: (a: number | string, c: string) => string;
  onAction: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useT>;
}) {
  if (!turn) return null;
  const totalPot =
    parseFloat(tontine.contributionAmount) * turn.contributions.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: "18px 16px",
          background:
            "linear-gradient(135deg, rgba(125,197,158,0.10), rgba(63,125,92,0.04))",
          border: "1px solid rgba(125,197,158,0.30)",
          borderRadius: 14,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            marginBottom: 6,
          }}
        >
          {t("tontine.distributeTo", { name: turn.beneficiaryName }) ||
            `Distribuer à ${turn.beneficiaryName}`}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 36,
            fontWeight: 700,
            color: "var(--cream)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatAmount(totalPot, tontine.currency)}
        </div>
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {t("tontine.distributeHint") ||
          "Toutes les contributions sont confirmées. Le tour sera clôturé et le bénéficiaire suivant prendra la suite."}
      </p>
      <button
        type="button"
        onClick={onAction}
        style={{
          padding: "14px 20px",
          background:
            "linear-gradient(135deg, var(--saffron), var(--terracotta))",
          color: "#16111E",
          border: "none",
          borderRadius: 14,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {/* V52.C2 — SVG remplace EMOJI */}
        <Icon name="sparkles" size={16} strokeWidth={1.6} />
        {t("tontine.distributeNow") || "Distribuer maintenant"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: "12px 20px",
          background: "transparent",
          color: "var(--cream-soft)",
          border: "1px solid rgba(244,228,193,0.18)",
          borderRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {t("common.cancel") || "Annuler"}
      </button>
    </div>
  );
}

function TurnDetailsContent({
  turn,
  meId,
  formatAmount,
  onMarkPaid,
  onConfirm,
  onEditMyMethods,
  onDeclareReceived,
  onSaveTurnDetails,
  onProposeTurnUpdate,
  onRespondTurnProposal,
  isAdmin,
  t,
}: {
  turn: Turn | null;
  meId?: string;
  formatAmount: (a: number | string, c: string) => string;
  onMarkPaid: (c: Contribution) => void;
  onConfirm: (c: Contribution) => void;
  // V136.A — Callback pour ouvrir le sheet d'édition de ses propres méthodes
  // (visible uniquement quand le bénéficiaire est l'utilisateur connecté).
  onEditMyMethods: () => void;
  // V136.C — Callback pour déclarer "j'ai reçu" sur une contribution PENDING.
  onDeclareReceived?: (c: Contribution) => void;
  // V138 — Sauvegarde directe (bénéficiaire) : date du tour + lieu + heure + notes.
  onSaveTurnDetails?: (input: {
    location: string | null;
    meetingTime: string | null;
    notes: string | null;
    scheduledDate: string | null;
  }) => Promise<void>;
  // V138 — Admin (non bénéficiaire) propose un changement → backend crée une
  // TontineTurnProposal PENDING que le bénéficiaire devra valider.
  onProposeTurnUpdate?: (input: {
    proposedScheduledDate: string | null;
    proposedLocation: string | null;
    proposedMeetingTime: string | null;
    proposedNotes: string | null;
    message: string | null;
  }) => Promise<void>;
  // V138 — Le bénéficiaire accept/reject une proposition admin pending.
  onRespondTurnProposal?: (
    proposalId: string,
    decision: "ACCEPT" | "REJECT",
    rejectionReason?: string | null,
  ) => Promise<void>;
  isAdmin: boolean;
  t: ReturnType<typeof useT>;
}) {
  // V135 — Charge les moyens de paiement du bénéficiaire pour les afficher
  // dans le panneau (IBAN, Wave, PayPal, Wero…). Les co-membres du groupe
  // ont accès en clair grâce à l'endpoint GET /users/:id/payment-methods/visible.
  const [paymentMethods, setPaymentMethods] = useState<
    Array<{
      id: string;
      type: string;
      typeLabel: string;
      typeEmoji: string;
      label: string;
      value: string;
      last4: string;
      defaultCurrency: string | null;
    }>
  >([]);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmError, setPmError] = useState<string | null>(null);

  useEffect(() => {
    if (!turn?.beneficiaryUserId) return;
    setPmLoading(true);
    setPmError(null);
    let cancelled = false;
    api
      .listVisiblePaymentMethods(turn.beneficiaryUserId)
      .then((rows) => {
        if (!cancelled) setPaymentMethods(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          // Pas de pop-up — c'est ok que le membre n'ait rien renseigné
          setPmError((err as Error).message);
          setPaymentMethods([]);
        }
      })
      .finally(() => {
        if (!cancelled) setPmLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [turn?.beneficiaryUserId]);

  if (!turn) return null;

  // V135 — Détermine le statut du tour pour adapter le layout :
  //  - DISTRIBUTED : bénéficiaire a reçu (passé). On insiste sur le montant reçu + méthodes utilisées.
  //  - IN_PROGRESS : tour courant. On affiche les contributions à payer/confirmer + méthodes du bénéficiaire pour ceux qui doivent encore payer.
  //  - PENDING : tour futur. On affiche la date prévue + méthodes de paiement du bénéficiaire (pour qu'on prépare).
  const phase: "DISTRIBUTED" | "IN_PROGRESS" | "PENDING" = turn.distributedAt
    ? "DISTRIBUTED"
    : turn.contributions.some((c) => c.status !== "PENDING")
      ? "IN_PROGRESS"
      : "PENDING";

  const totalAmount = turn.contributions.reduce(
    (sum, c) => sum + parseFloat(c.amount || "0"),
    0,
  );
  const tontineCurrency = turn.contributions[0]?.currency ?? "EUR";
  const distributedDate = turn.distributedAt
    ? new Date(turn.distributedAt)
    : null;
  const scheduledDate = turn.scheduledDate
    ? new Date(turn.scheduledDate)
    : new Date(turn.dueDate);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ====== HEADER : statut + date selon phase ====== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 12,
          background:
            phase === "DISTRIBUTED"
              ? "rgba(125,197,158,0.10)"
              : phase === "IN_PROGRESS"
                ? "rgba(197,138,46,0.10)"
                : "rgba(43,31,21,0.05)",
          border: `1px solid ${
            phase === "DISTRIBUTED"
              ? "rgba(125,197,158,0.30)"
              : phase === "IN_PROGRESS"
                ? "rgba(197,138,46,0.30)"
                : "rgba(43,31,21,0.10)"
          }`,
        }}
      >
        <Icon
          name={phase === "DISTRIBUTED" ? "check" : "file-text"}
          size={14}
          strokeWidth={2}
          color={
            phase === "DISTRIBUTED"
              ? "#3F9D6F"
              : phase === "IN_PROGRESS"
                ? "#C58A2E"
                : "#6B5B47"
          }
        />
        <div style={{ flex: 1, lineHeight: 1.4 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
            }}
          >
            {phase === "DISTRIBUTED"
              ? t("tontine.phaseDistributed") || "Tour distribué"
              : phase === "IN_PROGRESS"
                ? t("tontine.phaseInProgress") || "Tour en cours"
                : t("tontine.phaseUpcoming") || "Tour à venir"}
          </div>
          <div
            style={{ fontSize: 11, color: "var(--cocoa-soft, #6B5B47)" }}
          >
            {phase === "DISTRIBUTED" && distributedDate
              ? t("tontine.distributedOn", {
                  date: distributedDate.toLocaleDateString("fr-FR"),
                }) || `Distribué le ${distributedDate.toLocaleDateString("fr-FR")}`
              : t("tontine.scheduledFor", {
                  date: scheduledDate.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }),
                }) ||
                `Prévu le ${scheduledDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`}
          </div>
        </div>
        {totalAmount > 0 && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              fontFamily: "var(--font-num, ui-monospace, monospace)",
            }}
          >
            {formatAmount(totalAmount.toFixed(2), tontineCurrency)}
          </div>
        )}
      </div>

      {/* V136.D — Bloc Lieu + heure + notes libres. Visible pour tous
          les membres du groupe (info utile pour s'organiser). Éditable
          uniquement par le bénéficiaire du tour ou un admin. */}
      <TurnLocationBlock
        location={turn.location ?? null}
        meetingTime={turn.meetingTime ?? null}
        notes={turn.notes ?? null}
        scheduledDate={turn.scheduledDate ?? null}
        dueDate={turn.dueDate}
        isBeneficiary={turn.beneficiaryUserId === meId}
        isAdminOnly={isAdmin && turn.beneficiaryUserId !== meId}
        pendingProposal={turn.pendingProposal ?? null}
        canEdit={(turn.beneficiaryUserId === meId || isAdmin) && phase !== "DISTRIBUTED"}
        onSave={onSaveTurnDetails}
        onPropose={onProposeTurnUpdate}
        onRespondProposal={onRespondTurnProposal}
        t={t}
      />

      {/* ====== BLOC "Comment payer ce membre" — toujours visible ====== */}
      {/* Affiché pour les 3 phases : utile pour reconnaître les paiements
           passés, savoir qui payer maintenant, ou anticiper le tour futur.
           V136.A : si le bénéficiaire est moi-même, le bloc affiche un
           bouton "Modifier mes coordonnées" pour ouvrir le sheet d'édition. */}
      <PaymentMethodsBlock
        beneficiaryName={turn.beneficiaryName}
        phase={phase}
        loading={pmLoading}
        methods={paymentMethods}
        error={pmError}
        isMeBeneficiary={turn.beneficiaryUserId === meId}
        onEditMyMethods={onEditMyMethods}
        t={t}
      />

      {/* ====== Contributions individuelles ====== */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--cocoa-soft, #6B5B47)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            paddingLeft: 4,
          }}
        >
          {phase === "DISTRIBUTED"
            ? t("tontine.contributorsPaid") || "Qui a participé"
            : t("tontine.contributorsList") || "Cotisations du tour"}
        </div>
        {turn.contributions.map((c) => (
          <ContributionRow
            key={c.id}
            contribution={c}
            isMe={c.contributorUserId === meId}
            isMeBeneficiary={turn.beneficiaryUserId === meId}
            formatAmount={formatAmount}
            onMarkPaid={() => onMarkPaid(c)}
            onConfirm={() => onConfirm(c)}
            isAdmin={isAdmin}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * V135 — Bloc "Comment payer ce membre" affichant les moyens de paiement
 * renseignés par le bénéficiaire du tour. Les valeurs en clair sont récupérées
 * via /users/:id/payment-methods/visible (les co-membres ont le consentement
 * implicite d'accès).
 *
 * Pour les 3 phases du tour, le contexte change :
 *   - DISTRIBUTED : "Voilà comment {nom} a reçu son pot"
 *   - IN_PROGRESS : "Envoie ta cotisation à {nom} sur :"
 *   - PENDING : "Quand viendra son tour, voici comment lui envoyer :"
 *
 * Bouton "Copier" sur chaque valeur pour faciliter le transfert vers
 * l'app bancaire / mobile money de l'utilisateur.
 */
function PaymentMethodsBlock(props: {
  beneficiaryName: string;
  phase: "DISTRIBUTED" | "IN_PROGRESS" | "PENDING";
  loading: boolean;
  methods: Array<{
    id: string;
    type: string;
    typeLabel: string;
    typeEmoji: string;
    label: string;
    value: string;
    last4: string;
    defaultCurrency: string | null;
  }>;
  error: string | null;
  // V136.A — Quand le bénéficiaire est l'utilisateur connecté, on affiche
  // un bouton "Modifier mes coordonnées" qui ouvre le sheet d'édition.
  isMeBeneficiary?: boolean;
  onEditMyMethods?: () => void;
  t: ReturnType<typeof useT>;
}) {
  const {
    beneficiaryName,
    phase,
    loading,
    methods,
    error,
    isMeBeneficiary,
    onEditMyMethods,
    t,
  } = props;
  const toast = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // V136.A — Quand c'est mon propre tour, le header devient "Tes coordonnées
  // de paiement" pour clarifier que c'est éditable.
  const headerLabel = isMeBeneficiary
    ? t("tontine.payMethodsMine") || "Tes coordonnées de paiement"
    : phase === "DISTRIBUTED"
      ? t("tontine.payMethodsDistributed", { name: beneficiaryName }) ||
        `Comment ${beneficiaryName} a reçu son pot`
      : phase === "IN_PROGRESS"
        ? t("tontine.payMethodsActive", { name: beneficiaryName }) ||
          `Envoie ta cotisation à ${beneficiaryName}`
        : t("tontine.payMethodsUpcoming", { name: beneficiaryName }) ||
          `Voici comment payer ${beneficiaryName} quand viendra son tour`;

  async function copyValue(value: string, methodId: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(methodId);
      haptic("success");
      toast.info(t("tontine.copied") || "Copié dans le presse-papier");
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      haptic("error");
      toast.info(t("tontine.copyFailed") || "Copie impossible");
    }
  }

  return (
    <div
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--cocoa-soft, #6B5B47)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
          }}
        >
          {headerLabel}
        </div>
        {/* V136.A — Bouton "Modifier" si c'est mon propre tour. Ouvre le
            sheet d'édition de mes méthodes (CRUD via /me/payment-methods). */}
        {isMeBeneficiary && onEditMyMethods && (
          <button
            type="button"
            onClick={onEditMyMethods}
            style={{
              padding: "6px 10px",
              background:
                "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #B54732))",
              color: "var(--paper, #FFFFFF)",
              border: "none",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 30,
              whiteSpace: "nowrap",
              touchAction: "manipulation",
              boxShadow: "0 2px 8px rgba(197,138,46,0.20)",
            }}
          >
            {t("tontine.editMyMethods") || "✎ Modifier"}
          </button>
        )}
      </div>

      {loading && (
        <div
          style={{
            fontSize: 12,
            color: "var(--cocoa-mute, #A99580)",
            padding: "6px 0",
          }}
        >
          {t("tontine.loadingMethods") || "Chargement des moyens de paiement…"}
        </div>
      )}

      {!loading && methods.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--cocoa-mute, #A99580)",
            padding: "6px 0",
            lineHeight: 1.5,
          }}
        >
          {error
            ? t("tontine.methodsLoadError") ||
              "Impossible de charger les moyens de paiement de ce membre."
            : isMeBeneficiary
              ? t("tontine.methodsEmptyMine") ||
                "Tu n'as pas encore renseigné de moyen de paiement. Tape « Modifier » ci-dessus pour ajouter ton premier RIB, PayPal, Wero, etc."
              : t("tontine.methodsEmpty", { name: beneficiaryName }) ||
                `${beneficiaryName} n'a pas encore renseigné de moyen de paiement. Demande-lui de remplir son profil → Moyens de paiement.`}
        </div>
      )}

      {!loading &&
        methods.length > 0 &&
        methods.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "var(--ivory, #FBF6EC)",
              borderRadius: 10,
              border: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
            }}
          >
            <div style={{ fontSize: 18 }} aria-hidden>
              {m.typeEmoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--cocoa, #2B1F15)",
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--cocoa-soft, #6B5B47)",
                    marginLeft: 6,
                  }}
                >
                  · {m.typeLabel}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-num, ui-monospace, monospace)",
                  color: "var(--cocoa-soft, #6B5B47)",
                  lineHeight: 1.4,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  userSelect: "all",
                  WebkitUserSelect: "all",
                }}
              >
                {m.value}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyValue(m.value, m.id)}
              style={{
                padding: "8px 12px",
                background:
                  copiedId === m.id
                    ? "rgba(125,197,158,0.20)"
                    : "var(--paper, #FFFFFF)",
                color:
                  copiedId === m.id
                    ? "#3F9D6F"
                    : "var(--cocoa, #2B1F15)",
                border: `1px solid ${copiedId === m.id ? "rgba(125,197,158,0.40)" : "var(--v45-line, rgba(43,31,21,0.12))"}`,
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                minHeight: 36,
                whiteSpace: "nowrap",
                touchAction: "manipulation",
              }}
            >
              {copiedId === m.id
                ? t("tontine.copiedShort") || "✓ Copié"
                : t("tontine.copy") || "Copier"}
            </button>
          </div>
        ))}
    </div>
  );
}

// ============ V41.2 · AUCTION CONTENT (Hui bids) ============

function AuctionContent({
  bids,
  meId,
  isAdmin,
  tontineCurrency,
  bidDraft,
  setBidDraft,
  busy,
  onPlace,
  onWithdraw,
  onClose,
  formatAmount,
  t,
}: {
  bids: Array<{
    id: string;
    bidderId: string;
    amount: string;
    won: boolean;
    bidder: { id: string; displayName: string };
  }>;
  meId?: string;
  isAdmin: boolean;
  tontineCurrency: string;
  bidDraft: string;
  setBidDraft: (v: string) => void;
  busy: boolean;
  onPlace: () => void;
  onWithdraw: () => void;
  onClose: () => void;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  const sorted = [...bids].sort(
    (a, b) => parseFloat(b.amount) - parseFloat(a.amount),
  );
  const myBid = bids.find((b) => b.bidderId === meId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {t("tontine.auctionHintLong") ||
          "Le système Hui : chaque tour, les membres enchérissent un montant qu'ils acceptent de sacrifier pour obtenir le pot maintenant. La plus haute enchère gagne."}
      </p>

      {/* Form mise enchère */}
      <div
        style={{
          padding: "14px 14px",
          background:
            "linear-gradient(135deg, rgba(91,108,255,0.10), rgba(91,108,255,0.02))",
          border: "1px solid rgba(91,108,255,0.30)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#9eabff",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {myBid
            ? t("tontine.yourBid") || "Ton enchère actuelle"
            : t("tontine.placeBid") || "Place ton enchère"}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            value={bidDraft}
            onChange={(e) => setBidDraft(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder={myBid ? myBid.amount : "0"}
            style={{
              flex: 1,
              padding: "12px 14px",
              background: "rgba(22,17,30,0.4)",
              border: "1px solid rgba(91,108,255,0.40)",
              borderRadius: 10,
              color: "var(--cream)",
              fontSize: 16,
              fontFamily: "inherit",
              outline: "none",
              minWidth: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          <span
            style={{
              fontSize: 13,
              color: "var(--cream-soft)",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {tontineCurrency}
          </span>
          <button
            type="button"
            onClick={onPlace}
            disabled={busy || !bidDraft.trim()}
            style={{
              padding: "12px 16px",
              background:
                "linear-gradient(135deg, var(--saffron), var(--terracotta))",
              color: "#16111E",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {t("tontine.bidCta") || "Enchérir"}
          </button>
        </div>
        {myBid && (
          <button
            type="button"
            onClick={onWithdraw}
            disabled={busy}
            style={{
              marginTop: 8,
              padding: "6px 12px",
              background: "transparent",
              color: "#FFB89A",
              border: "1px solid rgba(217,113,74,0.30)",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("tontine.withdrawBid") || "Retirer mon enchère"}
          </button>
        )}
      </div>

      {/* Liste des enchères, triée décroissante */}
      {sorted.length > 0 ? (
        <section>
          <h3
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1.4,
              fontWeight: 700,
              margin: "0 0 8px 4px",
            }}
          >
            {t("tontine.bidsList", { count: String(sorted.length) }) ||
              `${sorted.length} enchère${sorted.length > 1 ? "s" : ""}`}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sorted.map((b, i) => {
              const isMine = b.bidderId === meId;
              const isHighest = i === 0;
              return (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: isHighest
                      ? "rgba(232,163,61,0.08)"
                      : "rgba(244,228,193,0.03)",
                    border: isHighest
                      ? "1px solid rgba(232,163,61,0.30)"
                      : "1px solid rgba(244,228,193,0.08)",
                    borderRadius: 11,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      background: isHighest
                        ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
                        : "rgba(244,228,193,0.06)",
                      color: isHighest ? "#16111E" : "var(--cream-soft)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      fontWeight: isMine ? 700 : 500,
                      color: "var(--cream)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {b.bidder.displayName}
                    {isMine && (
                      <span
                        style={{
                          fontSize: 9,
                          marginLeft: 6,
                          color: "var(--saffron)",
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                        }}
                      >
                        {t("common.you") || "Toi"}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: "Cormorant Garamond, serif",
                      fontSize: 14,
                      fontWeight: 700,
                      color: isHighest ? "var(--saffron)" : "var(--cream)",
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                    }}
                  >
                    {formatAmount(b.amount, tontineCurrency)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            textAlign: "center",
            margin: 0,
          }}
        >
          {t("tontine.noBidsYet") ||
            "Aucune enchère pour le moment. Sois le premier !"}
        </p>
      )}

      {/* Admin : clôture des enchères */}
      {isAdmin && sorted.length > 0 && (
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            padding: "12px 18px",
            background:
              "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "#16111E",
            border: "none",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
            opacity: busy ? 0.7 : 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI */}
          <Icon name="sparkles" size={14} strokeWidth={1.6} />
          {t("tontine.closeBidCta") || "Clôturer les enchères"}
        </button>
      )}
    </div>
  );
}

// ============ HELPERS ============

/**
 * V129 — Hydrate le payload tontine brut retourné par GET /groups/:id/tontine
 * vers le format flatten attendu par la vue. Le backend renvoie :
 *   turn.beneficiary: { id, displayName, avatar } | null
 *   contribution.contributor: { id, displayName, avatar } | null
 * La vue attend :
 *   turn.beneficiaryUserId: string
 *   turn.beneficiaryName: string
 *   contribution.contributorUserId: string
 *   contribution.contributorName: string
 *   contribution.currency: string (pris depuis la tontine racine)
 * Fallback "?" si bénéficiaire/contributeur non assigné (DRAFT, plan
 * gating photo, ou ancien turn orphelin). Évite tout crash `charAt of
 * undefined` sur les chemins d'avatar / initiales.
 */
function hydrateTontine(raw: any): TontineData | null {
  if (!raw) return null;
  const currency: string = raw.currency ?? "EUR";
  const turns: Turn[] = Array.isArray(raw.turns)
    ? raw.turns.map((t: any): Turn => {
        const benef = t.beneficiary ?? null;
        const contribs: Contribution[] = Array.isArray(t.contributions)
          ? t.contributions.map((c: any): Contribution => {
              const contributor = c.contributor ?? null;
              return {
                id: String(c.id ?? ""),
                contributorUserId: String(contributor?.id ?? ""),
                contributorName: String(contributor?.displayName ?? "?"),
                amount: String(c.amount ?? "0"),
                currency,
                status: String(c.status ?? "PENDING"),
                paidAt: c.paidAt ?? null,
                confirmedAt: c.confirmedAt ?? null,
              };
            })
          : [];
        return {
          id: String(t.id ?? ""),
          turnNumber: Number(t.turnNumber ?? 0),
          beneficiaryUserId: String(benef?.id ?? ""),
          beneficiaryName: String(benef?.displayName ?? "?"),
          // V140 — Photo plan-aware. Backend filtre via maskAvatar :
          // null si profilePhotoVisible=false, sinon URL de la photo.
          beneficiaryAvatar: benef?.avatar ?? null,
          dueDate: String(t.dueDate ?? ""),
          scheduledDate: t.scheduledDate ?? null,
          distributedAt: t.distributedAt ?? null,
          status: String(t.status ?? "PENDING"),
          contributions: contribs,
          // V136.D — Lieu + heure + notes libres (renseignés par bénéficiaire/admin)
          location: t.location ?? null,
          meetingTime: t.meetingTime ?? null,
          notes: t.notes ?? null,
          // V138 — Proposition admin en attente d'acceptation par le bénéf.
          pendingProposal: t.pendingProposal ?? null,
        };
      })
    : [];
  return {
    id: String(raw.id ?? ""),
    status: String(raw.status ?? "DRAFT"),
    contributionAmount: String(raw.contributionAmount ?? "0"),
    currency,
    frequency: String(raw.frequency ?? "MONTHLY"),
    startDate: String(raw.startDate ?? ""),
    centralizedPot: Boolean(raw.centralizedPot ?? true),
    notes: raw.notes ?? null,
    orderMode: String(raw.orderMode ?? "MANUAL"),
    turns,
  };
}

function isReadyToDistribute(turn: Turn): boolean {
  if (turn.distributedAt) return false;
  if (turn.contributions.length === 0) return false;
  return turn.contributions.every((c) => c.status === "CONFIRMED");
}

/**
 * V136.D — Bloc Lieu de la réunion + notes libres pour un tour de tontine.
 *
 * Affichage :
 *   - Si location ou notes renseignés : on les affiche (lecture seule pour
 *     les non-éditeurs, édition possible pour le bénéficiaire/admin).
 *   - Si rien renseigné ET on peut éditer : on affiche un bouton « + Lieu »
 *     pour ajouter.
 *   - Si rien renseigné ET on ne peut pas éditer : on ne rend rien (zéro
 *     bruit pour les non-bénéficiaires).
 *
 * Édition : tap « Modifier » → ouverture inline d'un mini-formulaire (pas
 * de sheet séparé pour rester rapide). Validation → callback onSave + ferme.
 */
function TurnLocationBlock(props: {
  location: string | null;
  meetingTime: string | null;
  notes: string | null;
  canEdit: boolean;
  /** V138 — Date du tour effective (peut être null si pas encore fixée). */
  scheduledDate?: string | null;
  /** V138 — Date initiale calculée (sert à borner la fenêtre du mois). */
  dueDate?: string | null;
  /** V138 — L'acteur est-il le bénéficiaire de ce tour ? Si oui, modif directe. */
  isBeneficiary?: boolean;
  /** V138 — L'acteur est-il admin du groupe (et non bénéficiaire) ? Si oui, doit
   *  passer par une proposition à valider par le bénéficiaire. */
  isAdminOnly?: boolean;
  /** V138 — Proposition admin PENDING (visible bannière pour le bénéficiaire). */
  pendingProposal?: Turn["pendingProposal"];
  onSave?: (input: {
    location: string | null;
    meetingTime: string | null;
    notes: string | null;
    scheduledDate: string | null;
  }) => Promise<void>;
  /** V138 — Admin non-bénéficiaire propose un changement (back POST proposal). */
  onPropose?: (input: {
    proposedScheduledDate: string | null;
    proposedLocation: string | null;
    proposedMeetingTime: string | null;
    proposedNotes: string | null;
    message: string | null;
  }) => Promise<void>;
  /** V138 — Le bénéficiaire répond à une proposition admin. */
  onRespondProposal?: (
    proposalId: string,
    decision: "ACCEPT" | "REJECT",
    rejectionReason?: string | null,
  ) => Promise<void>;
  t: ReturnType<typeof useT>;
}) {
  const {
    location,
    meetingTime,
    notes,
    canEdit,
    scheduledDate,
    dueDate,
    isBeneficiary,
    isAdminOnly,
    pendingProposal,
    onSave,
    onPropose,
    onRespondProposal,
    t,
  } = props;
  const [editing, setEditing] = useState(false);
  const [draftLocation, setDraftLocation] = useState(location ?? "");
  const [draftTime, setDraftTime] = useState(meetingTime ?? "");
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  // V138 — Date du tour. Format YYYY-MM-DD pour input[type=date].
  const [draftDate, setDraftDate] = useState<string>(() => {
    const d = scheduledDate || dueDate || "";
    if (!d) return "";
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  });
  // V138 — Message libre joint à une proposition admin (« reporté car… »).
  const [draftMessage, setDraftMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // V136.D — Reset quand les props changent (changement de tour visualisé).
  useEffect(() => {
    setDraftLocation(location ?? "");
    setDraftTime(meetingTime ?? "");
    setDraftNotes(notes ?? "");
    const d = scheduledDate || dueDate || "";
    if (d) {
      try {
        setDraftDate(new Date(d).toISOString().slice(0, 10));
      } catch {
        setDraftDate("");
      }
    } else {
      setDraftDate("");
    }
    setDraftMessage("");
    setEditing(false);
  }, [location, meetingTime, notes, scheduledDate, dueDate]);

  // V138 — Calcule la fenêtre du mois autorisée pour le bénéficiaire :
  // [premier jour du mois du dueDate, dernier jour du même mois].
  const { minDate, maxDate, monthLabel } = (() => {
    if (!dueDate) return { minDate: "", maxDate: "", monthLabel: "" };
    try {
      const d = new Date(dueDate);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const first = new Date(Date.UTC(year, month, 1));
      const last = new Date(Date.UTC(year, month + 1, 0));
      return {
        minDate: first.toISOString().slice(0, 10),
        maxDate: last.toISOString().slice(0, 10),
        monthLabel: d.toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
      };
    } catch {
      return { minDate: "", maxDate: "", monthLabel: "" };
    }
  })();

  const hasContent = !!(location || meetingTime || notes || scheduledDate);
  const hasProposal = !!pendingProposal;

  // Si pas de contenu ET on ne peut pas éditer ET pas de proposition →
  // ne rien afficher (zéro bruit pour les non-bénéficiaires).
  if (!hasContent && !canEdit && !hasProposal) return null;

  // V138 — Helper : libellé du bouton selon le rôle.
  const isProposalMode = !!isAdminOnly && !isBeneficiary;
  const saveLabel = isProposalMode
    ? t("tontine.proposeChange") || "Proposer le changement"
    : t("tontine.locationSave") || "Enregistrer";
  const editButtonLabel = isProposalMode
    ? t("tontine.proposeChange") || "Proposer un changement"
    : t("tontine.locationEdit") || "Modifier";

  // V138 — Bannière proposition admin en attente. Visible UNIQUEMENT pour
  // le bénéficiaire avec boutons Accepter/Refuser. Les autres membres voient
  // une version "Info" sans boutons (transparence sans pouvoir d'action).
  const renderProposalBanner = () => {
    if (!pendingProposal) return null;
    const p = pendingProposal;
    const bits: string[] = [];
    if (p.proposedScheduledDate) {
      try {
        bits.push(
          new Date(p.proposedScheduledDate).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }),
        );
      } catch {
        /* ignore */
      }
    }
    if (p.proposedMeetingTime) bits.push(p.proposedMeetingTime);
    if (p.proposedLocation) bits.push(p.proposedLocation);
    const summary = bits.join(" · ");
    const isMine = !!isBeneficiary;
    const proposerName = p.proposedBy.displayName;

    return (
      <div
        style={{
          background: isMine ? "#FFF4E2" : "#FBF6EC",
          border: `1px solid ${isMine ? "#C58A2E" : "rgba(43,31,21,0.10)"}`,
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#C58A2E",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {isMine
            ? t("tontine.proposalForMeTitle") ||
              `✋ ${proposerName} propose un changement`
            : t("tontine.proposalInfoTitle") ||
              `🔄 ${proposerName} a proposé un changement`}
        </div>
        {summary && (
          <div
            style={{
              fontSize: 13,
              color: "var(--cocoa, #2B1F15)",
              lineHeight: 1.4,
            }}
          >
            {summary}
          </div>
        )}
        {p.message && (
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5B47)",
              fontStyle: "italic",
              borderLeft: "3px solid #C58A2E",
              paddingLeft: 8,
            }}
          >
            « {p.message} »
          </div>
        )}
        {isMine && onRespondProposal && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={respondingId === p.id}
              onClick={async () => {
                setRespondingId(p.id);
                try {
                  await onRespondProposal(p.id, "ACCEPT");
                } finally {
                  setRespondingId(null);
                }
              }}
              style={{
                flex: 1,
                padding: "10px 14px",
                background:
                  respondingId === p.id
                    ? "rgba(197,138,46,0.5)"
                    : "linear-gradient(135deg, #C58A2E, #B54732)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: respondingId === p.id ? "wait" : "pointer",
                minHeight: 40,
              }}
            >
              {respondingId === p.id
                ? t("tontine.responding") || "Envoi…"
                : t("tontine.acceptProposal") || "Accepter"}
            </button>
            <button
              type="button"
              disabled={respondingId === p.id}
              onClick={async () => {
                const reason =
                  typeof window !== "undefined"
                    ? window.prompt(
                        t("tontine.rejectReasonPrompt") ||
                          "Raison du refus (optionnel) :",
                      )
                    : null;
                setRespondingId(p.id);
                try {
                  await onRespondProposal(p.id, "REJECT", reason ?? null);
                } finally {
                  setRespondingId(null);
                }
              }}
              style={{
                padding: "10px 14px",
                background: "transparent",
                color: "var(--cocoa, #2B1F15)",
                border: "1px solid rgba(43,31,21,0.18)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: respondingId === p.id ? "wait" : "pointer",
                minHeight: 40,
              }}
            >
              {t("tontine.rejectProposal") || "Refuser"}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Mode édition — formulaire inline
  if (editing) {
    return (
      <div
        style={{
          background: "var(--paper, #FFFFFF)",
          border: "1px solid var(--v45-saffron, #C58A2E)",
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--v45-saffron, #C58A2E)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {isProposalMode
            ? t("tontine.proposeChangeTitle") ||
              "Proposer un changement au bénéficiaire"
            : t("tontine.locationEditTitle") || "Lieu & notes de la réunion"}
        </div>
        {/* V138 — Date du tour. Bénéficiaire : contraint au mois du dueDate.
            Admin (mode propose) : libre. */}
        {minDate && maxDate && (
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 11,
              color: "var(--cocoa-soft, #6B5B47)",
            }}
          >
            <span>
              {t("tontine.dateLabel") || "Date de la réunion"}
              {!isProposalMode && monthLabel
                ? ` · ${t("tontine.sameMonthHint", { month: monthLabel }) || `dans ${monthLabel}`}`
                : ""}
            </span>
            <input
              type="date"
              value={draftDate}
              min={isProposalMode ? undefined : minDate}
              max={isProposalMode ? undefined : maxDate}
              onChange={(e) => setDraftDate(e.target.value)}
              style={{
                padding: "10px 12px",
                background: "var(--ivory, #FBF6EC)",
                border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
                borderRadius: 10,
                fontSize: 13,
                color: "var(--cocoa, #2B1F15)",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </label>
        )}
        <input
          type="text"
          value={draftLocation}
          onChange={(e) => setDraftLocation(e.target.value)}
          placeholder={
            t("tontine.locationPlaceholder") ||
            "Ex: Café Joseph · 12 rue X, ou https://zoom.us/…"
          }
          maxLength={500}
          style={{
            padding: "10px 12px",
            background: "var(--ivory, #FBF6EC)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--cocoa, #2B1F15)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        {/* V136.D — Champ heure de la réunion : libre court (peut être
            « 17:30 », « 18h00 », « après 19h », « toute la journée »). */}
        <input
          type="text"
          value={draftTime}
          onChange={(e) => setDraftTime(e.target.value)}
          placeholder={
            t("tontine.meetingTimePlaceholder") ||
            "Heure (ex: 17:30, 18h après le boulot…)"
          }
          maxLength={60}
          style={{
            padding: "10px 12px",
            background: "var(--ivory, #FBF6EC)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--cocoa, #2B1F15)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <textarea
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          placeholder={
            t("tontine.notesPlaceholder") ||
            "Notes libres (consignes, contexte, à amener…)"
          }
          maxLength={1000}
          rows={3}
          style={{
            padding: "10px 12px",
            background: "var(--ivory, #FBF6EC)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--cocoa, #2B1F15)",
            fontFamily: "inherit",
            resize: "vertical",
            minHeight: 60,
            outline: "none",
          }}
        />
        {/* V138 — En mode propose, un message libre joint à la proposition. */}
        {isProposalMode && (
          <textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            placeholder={
              t("tontine.proposeMessagePlaceholder") ||
              "Message au bénéficiaire (optionnel, ex: « reporté car férié »)"
            }
            maxLength={500}
            rows={2}
            style={{
              padding: "10px 12px",
              background: "var(--ivory, #FBF6EC)",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--cocoa, #2B1F15)",
              fontFamily: "inherit",
              resize: "vertical",
              minHeight: 50,
              outline: "none",
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                // V138 — Convertit YYYY-MM-DD → ISO datetime UTC noon
                // (midi UTC pour éviter les bascules de fuseau qui font
                // sauter d'un jour sur l'autre selon le TZ du serveur).
                const scheduledIso = draftDate
                  ? new Date(`${draftDate}T12:00:00.000Z`).toISOString()
                  : null;
                if (isProposalMode) {
                  if (!onPropose) return;
                  await onPropose({
                    proposedScheduledDate: scheduledIso,
                    proposedLocation: draftLocation.trim() || null,
                    proposedMeetingTime: draftTime.trim() || null,
                    proposedNotes: draftNotes.trim() || null,
                    message: draftMessage.trim() || null,
                  });
                } else {
                  if (!onSave) return;
                  await onSave({
                    location: draftLocation.trim() || null,
                    meetingTime: draftTime.trim() || null,
                    notes: draftNotes.trim() || null,
                    scheduledDate: scheduledIso,
                  });
                }
                setEditing(false);
              } finally {
                setSaving(false);
              }
            }}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: saving
                ? "rgba(197,138,46,0.50)"
                : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #B54732))",
              color: "var(--paper, #FFFFFF)",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            {saving
              ? t("tontine.locationSaving") || "Enregistrement…"
              : saveLabel}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setDraftLocation(location ?? "");
              setDraftTime(meetingTime ?? "");
              setDraftNotes(notes ?? "");
              setDraftMessage("");
              const d = scheduledDate || dueDate || "";
              if (d) {
                try {
                  setDraftDate(new Date(d).toISOString().slice(0, 10));
                } catch {
                  setDraftDate("");
                }
              } else {
                setDraftDate("");
              }
              setEditing(false);
            }}
            style={{
              padding: "10px 14px",
              background: "transparent",
              color: "var(--cocoa-soft, #6B5B47)",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.12))",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            {t("tontine.locationCancel") || "Annuler"}
          </button>
        </div>
      </div>
    );
  }

  // Mode affichage — lecture (avec bannière proposition V138 en haut)
  return (
    <>
    {renderProposalBanner()}
    <div
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--cocoa-soft, #6B5B47)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {hasContent
            ? t("tontine.locationTitle") || "📍 Lieu & infos de la réunion"
            : t("tontine.locationEmpty") || "📍 Pas encore de lieu"}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              padding: "6px 10px",
              background: hasContent
                ? "var(--ivory, #FBF6EC)"
                : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #B54732))",
              color: hasContent
                ? "var(--cocoa, #2B1F15)"
                : "var(--paper, #FFFFFF)",
              border: hasContent
                ? "1px solid var(--v45-line, rgba(43,31,21,0.12))"
                : "none",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 30,
              whiteSpace: "nowrap",
              touchAction: "manipulation",
            }}
          >
            {hasContent
              ? t("tontine.locationEdit") || "✎ Modifier"
              : t("tontine.locationAdd") || "+ Ajouter"}
          </button>
        )}
      </div>

      {location && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 13,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        >
          <span
            style={{ flexShrink: 0, opacity: 0.7 }}
            aria-hidden
          >
            📍
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/^https?:\/\//i.test(location) ? (
              <a
                href={location}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--v45-saffron, #C58A2E)",
                  textDecoration: "underline",
                }}
              >
                {location}
              </a>
            ) : (
              location
            )}
          </div>
        </div>
      )}

      {/* V136.D — Heure de la réunion (affichage si renseignée). */}
      {meetingTime && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.4,
          }}
        >
          <span
            style={{ flexShrink: 0, opacity: 0.7 }}
            aria-hidden
          >
            🕒
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>{meetingTime}</div>
        </div>
      )}

      {notes && (
        <div
          style={{
            fontSize: 12,
            color: "var(--cocoa-soft, #6B5B47)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            paddingTop: (location || meetingTime) ? 4 : 0,
            borderTop: (location || meetingTime)
              ? "1px solid var(--v45-line, rgba(43,31,21,0.06))"
              : undefined,
            marginTop: (location || meetingTime) ? 4 : 0,
          }}
        >
          {notes}
        </div>
      )}
    </div>
    </>
  );
}

/**
 * V134 — Panneau d'activation pour les tontines en DRAFT.
 *
 * Avant V134, une tontine créée mais non activée affichait juste ses 4 méta-blocs
 * sans aucun moyen UI de démarrer la roue. Maintenant, ce panneau prend le dessus
 * de la vue mobile-tontine-view et propose un gros bouton "Lancer la tontine" qui
 * appelle activateTontine() côté backend → génère les N turns + cotisations
 * PENDING + bascule en ACTIVE. Au retour du refresh, le hero + l'anneau de
 * rotation prennent enfin vie.
 *
 * Visuellement aligné V45-light pour cohérence avec le reste de l'app.
 */
function DraftActivationPanel(props: {
  tontine: { id: string; contributionAmount: string; currency: string; frequency: string; startDate: string; orderMode: string };
  memberCount: number;
  onActivate: () => Promise<void>;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const { tontine, memberCount, onActivate, t } = props;
  const [busy, setBusy] = useState(false);

  const startDate = new Date(tontine.startDate);
  const isToday = startDate.toDateString() === new Date().toDateString();
  const isPast = startDate.getTime() < Date.now() - 24 * 3600 * 1000;

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(181,71,50,0.06))",
        border: "1px solid rgba(197,138,46,0.30)",
        borderRadius: 18,
        padding: "20px 18px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Petit halo en arrière-plan */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: -40,
          background:
            "radial-gradient(circle at 50% 0%, rgba(197,138,46,0.15), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--v45-saffron, #C58A2E)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 6,
          position: "relative",
        }}
      >
        {t("tontine.draftBadge") || "Brouillon"}
      </div>
      <div
        style={{
          fontFamily:
            "var(--font-cormorant, 'Cormorant Garamond'), Georgia, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--cocoa, #2B1F15)",
          margin: "0 auto 8px",
          maxWidth: 320,
          lineHeight: 1.2,
          position: "relative",
        }}
      >
        {t("tontine.draftTitle") ||
          "Tontine prête à démarrer"}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--cocoa-soft, #6B5B47)",
          marginBottom: 16,
          maxWidth: 340,
          marginInline: "auto",
          lineHeight: 1.5,
          position: "relative",
        }}
      >
        {t("tontine.draftHint", {
          n: String(memberCount),
        }) ||
          `${memberCount} membres · ${tontine.contributionAmount} ${tontine.currency} / ${tontine.frequency === "WEEKLY" ? "semaine" : tontine.frequency === "BIWEEKLY" ? "quinzaine" : "mois"}. ${isPast ? "Date de démarrage passée — la roue se calera sur le tour courant." : isToday ? "Date de démarrage aujourd'hui." : "Date de démarrage future."}`}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await onActivate();
          } finally {
            setBusy(false);
          }
        }}
        style={{
          padding: "14px 28px",
          background: busy
            ? "rgba(197,138,46,0.50)"
            : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #B54732))",
          color: "var(--paper, #FFFFFF)",
          border: "none",
          borderRadius: 14,
          fontSize: 15,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          fontFamily: "inherit",
          minHeight: 52,
          minWidth: 220,
          boxShadow: busy
            ? "none"
            : "0 8px 24px rgba(197,138,46,0.30)",
          opacity: busy ? 0.7 : 1,
          touchAction: "manipulation",
          position: "relative",
          transition: "all 0.2s ease",
        }}
      >
        {busy
          ? t("tontine.activating") || "Activation…"
          : t("tontine.activateCta") || "🌀 Lancer la tontine"}
      </button>

      <div
        style={{
          fontSize: 11,
          color: "var(--cocoa-mute, #A99580)",
          marginTop: 14,
          position: "relative",
        }}
      >
        {t("tontine.activateNote") ||
          "Une fois lancée, l'ordre est gravé. Annulation possible à tout moment côté admin."}
      </div>
    </div>
  );
}
