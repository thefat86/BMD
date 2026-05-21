"use client";

/**
 * V217 — Page tontine desktop refondue.
 * =============================================================================
 * Validée via maquette HTML (cf. conversation V217). Trois onglets en haut :
 *   En cours / Passées / Annulées.
 *
 * En cours :
 *   - Empty state si pas de tontine ACTIVE/DRAFT → CTA création.
 *   - Sinon layout 2-col : roue 280px à gauche + détails du tour à droite.
 *   - Bandeau cocoa noir en bas avec CTA "Déclarer mon paiement".
 *
 * Passées / Annulées : cards horizontales simples (montant total, statut).
 *
 * Toutes les features existantes sont conservées :
 *   - TontineWheel SVG cliquable (sièges → sélection du tour).
 *   - Édition date+lieu inline par le bénéficiaire ou un admin (V136.D / V138).
 *   - Méthodes de paiement (IBAN, mobile money, espèces) (V135-V137).
 *   - Flow déclarer/confirmer paiement (V141) : payeur déclare → notif au
 *     bénéficiaire → confirme la réception.
 *   - Mode AUCTION (Hui bids) si applicable.
 *
 * Le code mobile et la création de tontine restent gérés par le page.tsx
 * existant — ce composant ne touche que la vue desktop.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api, invalidateGenericCache } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { useCurrency } from "../currency-provider";
import { useDialog } from "./dialog-provider";
import { SegmentedControl } from "./segmented-control";
import { TontineWheel, type WheelTurn } from "./tontine-wheel";

type Tab = "active" | "past" | "cancelled";

interface Member {
  id: string;
  displayName: string;
  avatar?: string | null;
  role?: string;
}

interface Contribution {
  id: string;
  contributorUserId: string;
  contributor: { id: string; displayName: string; avatar?: string | null };
  amountDue: string;
  status: "PENDING" | "PAID" | "CONFIRMED";
  paymentMethod?: string | null;
  paidAt?: string | null;
  confirmedAt?: string | null;
}

interface Turn {
  id: string;
  turnNumber: number;
  status: "PENDING" | "IN_PROGRESS" | "DISTRIBUTED" | "CANCELLED";
  beneficiary: Member;
  dueDate: string;
  scheduledDate?: string | null;
  meetingTime?: string | null;
  location?: string | null;
  notes?: string | null;
  totalReceived?: string;
  contributions?: Contribution[];
}

interface CancellationVote {
  userId: string;
  vote: boolean;
  reason: string | null;
  votedAt: string;
}

interface Tontine {
  id: string;
  groupId: string;
  // V231 — Nom libre (peut être null pour les tontines historiques).
  name?: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  contributionAmount: string;
  currency: string;
  frequency: string;
  startDate: string;
  completedAt?: string | null;
  // V219.D — Champs optionnels exposés par le backend si V219.C a livré
  // la migration cancellationReason. Fallback gracieux via optional chaining.
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: { id: string; displayName: string } | null;
  // V219.C — Workflow demande de suppression
  cancellationStatus?: "PROPOSED" | "APPROVED" | "REJECTED" | null;
  cancellationRequestedAt?: string | null;
  cancellationRequestedById?: string | null;
  cancellationVotes?: CancellationVote[];
  centralizedPot?: boolean;
  notes?: string | null;
  turns: Turn[];
}

interface PaymentMethod {
  id: string;
  type: string;
  typeLabel: string;
  typeEmoji?: string;
  label: string;
  value: string;
  last4: string;
}

export function DesktopGroupTontineV217View({
  groupId,
  group,
  me,
  onCreateClick,
}: {
  groupId: string;
  group: { id: string; name: string; defaultCurrency: string; members: any[] };
  me: { id: string };
  onCreateClick: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { formatAmount } = useCurrency();
  const dialog = useDialog();

  const [tab, setTab] = useState<Tab>("active");
  const [active, setActive] = useState<Tontine | null>(null);
  const [past, setPast] = useState<Tontine[]>([]);
  const [cancelled, setCancelled] = useState<Tontine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  // V233.B — Popover hover + pinned (sticky on click).
  // - hoveredTurnId : siège actuellement survolé (avec delay close 200ms).
  // - pinnedTurnId : siège ouvert en mode sticky par clic ; gardé jusqu'au
  //   clic à nouveau dessus (toggle) ou clic à l'extérieur.
  // - displayedTurnId = pinnedTurnId ?? hoveredTurnId pour résoudre l'affichage.
  const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null);
  const [pinnedTurnId, setPinnedTurnId] = useState<string | null>(null);
  // Timer pour le delay de fermeture au mouseleave (200ms anti-flash).
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [beneficiaryMethods, setBeneficiaryMethods] = useState<PaymentMethod[]>(
    [],
  );
  // V219.D — Tontine cliquée dans l'historique → modale détail read-only.
  const [detailTontine, setDetailTontine] = useState<Tontine | null>(null);

  // V219.C — Sheet "Supprimer cette tontine" (admin uniquement).
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // ─────────────── Fetch ───────────────
  async function refresh() {
    setLoading(true);
    try {
      const [activeRes, historyRes] = await Promise.all([
        api.getTontine(groupId),
        api.getTontineHistory(groupId).catch(() => ({ tontines: [] })),
      ]);
      const activeT = (activeRes as any)?.tontine ?? null;
      setActive(activeT);
      // L'historique inclut ACTIVE/DRAFT/COMPLETED/CANCELLED — on filtre les
      // deux catégories qui nous intéressent ici.
      const all = ((historyRes as any).tontines ?? []) as Tontine[];
      setPast(all.filter((tn) => tn.status === "COMPLETED"));
      setCancelled(all.filter((tn) => tn.status === "CANCELLED"));
      // Pré-sélection : le tour en cours (IN_PROGRESS) ou le premier PENDING.
      if (activeT?.turns?.length) {
        const inProgress = activeT.turns.find(
          (tn: Turn) => tn.status === "IN_PROGRESS",
        );
        const firstPending = activeT.turns.find(
          (tn: Turn) => tn.status === "PENDING",
        );
        setSelectedTurnId(inProgress?.id ?? firstPending?.id ?? null);
      }
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // ─────────────── Charge les méthodes de paiement du bénéficiaire sélectionné ───────────────
  const selectedTurn = useMemo(
    () => active?.turns.find((tn) => tn.id === selectedTurnId) ?? null,
    [active, selectedTurnId],
  );

  // V233.B — Tour à afficher dans le popover : priorité au pinned (clic),
  // sinon le hover. Si rien des deux, on retombe sur le selectedTurn (clic
  // historique sur la roue qui sélectionne le tour du panneau droit).
  const popoverTurnId = pinnedTurnId ?? hoveredTurnId ?? selectedTurnId;
  const popoverTurn = useMemo(
    () => active?.turns.find((tn) => tn.id === popoverTurnId) ?? null,
    [active, popoverTurnId],
  );

  // Le popover est affiché uniquement quand l'utilisateur survole/clique
  // explicitement un siège. On ne l'affiche pas en permanence sur le
  // selectedTurn historique (sinon on revient au comportement sticky de V230
  // que Fabrice ne veut plus). Donc : popoverVisible si hoveredTurnId OR pinnedTurnId.
  const popoverVisible = pinnedTurnId !== null || hoveredTurnId !== null;

  // V233.B — Click outside : ferme le pinned popover (sauf clic à l'intérieur
  // du popover lui-même ou sur un siège de la roue).
  useEffect(() => {
    if (!pinnedTurnId) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Si le clic est dans le popover (data-tontine-popover) ou la roue
      // (svg ancêtre de TontineWheel), on ne ferme pas — la roue gère son
      // propre toggle, et l'intérieur du popover doit rester cliquable.
      const inPopover = target.closest("[data-tontine-popover]");
      const inWheel = target.closest("[data-theme=\"v45-light-wheel\"]");
      if (inPopover || inWheel) return;
      setPinnedTurnId(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pinnedTurnId]);

  // Cleanup du timer hoverClose au démontage.
  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    };
  }, []);

  // V233.B — Handlers hover / click sur un siège.
  // Logique de toggle au clic : si pinned sur ce tour → unpin (clic dehors-like) ;
  // sinon → pin.
  function handleSeatHoverEnter(turnId: string) {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setHoveredTurnId(turnId);
  }
  function handleSeatHoverLeave() {
    // Delay 200ms pour permettre à la souris de bouger vers le popover sans
    // qu'il disparaisse (le popover lui-même réinitialisera ce timer).
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => {
      setHoveredTurnId(null);
    }, 200);
  }
  function handleSeatClick(turnId: string) {
    // Met à jour selectedTurnId (panneau droit) sur clic toujours.
    setSelectedTurnId(turnId);
    // Toggle pin : si déjà pinned sur ce tour → unpin ; sinon → pin.
    setPinnedTurnId((cur) => (cur === turnId ? null : turnId));
  }

  useEffect(() => {
    if (!selectedTurn?.beneficiary?.id) {
      setBeneficiaryMethods([]);
      return;
    }
    let cancelled = false;
    // V217 — Nom correct de l'API (cf. api-client.ts:4560) : listVisiblePaymentMethods
    // retourne directement un Array<PaymentMethod>, pas un objet wrappé.
    api
      .listVisiblePaymentMethods(selectedTurn.beneficiary.id)
      .then((r) => {
        if (cancelled) return;
        setBeneficiaryMethods((r ?? []) as PaymentMethod[]);
      })
      .catch(() => {
        if (!cancelled) setBeneficiaryMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTurn?.beneficiary?.id]);

  // ─────────────── Permissions ───────────────
  const myMembership = group.members.find(
    (m: any) => m.user?.id === me.id || m.userId === me.id,
  );
  const isAdmin = myMembership?.role === "ADMIN";
  const isBeneficiary = selectedTurn?.beneficiary.id === me.id;
  const canEditTurn = isAdmin || isBeneficiary;
  const myContribution = selectedTurn?.contributions?.find(
    (c) => c.contributorUserId === me.id,
  );

  // ─────────────── Stats compteur ───────────────
  const turnCounter = useMemo(() => {
    if (!active) return { current: 0, total: 0 };
    const total = active.turns.length;
    const distributed = active.turns.filter(
      (tn) => tn.status === "DISTRIBUTED",
    ).length;
    return { current: distributed + 1, total };
  }, [active]);

  const contributionsStats = useMemo(() => {
    const list = selectedTurn?.contributions ?? [];
    return {
      confirmed: list.filter((c) => c.status === "CONFIRMED").length,
      declared: list.filter((c) => c.status === "PAID").length,
      pending: list.filter((c) => c.status === "PENDING").length,
      total: list.length,
    };
  }, [selectedTurn]);

  // ─────────────── Actions ───────────────
  async function handleDeclarePayment() {
    if (!myContribution || !selectedTurn) return;
    // V217 — Prompt pour la méthode de paiement utilisée. Signature correcte :
    // prompt(message, opts) — pas un seul objet. Le bénéficiaire recevra une
    // notif push+email pour confirmer la réception (V141).
    const method = await dialog.prompt(
      t("tontine.declareHelp") ||
        "Indique comment tu as payé (ex. IBAN, Wave, espèces). Le bénéficiaire recevra une notif pour confirmer.",
      {
        title: t("tontine.declareTitle") || "Déclarer mon paiement",
        placeholder:
          t("tontine.declareMethodPlaceholder") || "Wave / IBAN / Espèces",
        confirmLabel: t("tontine.declareCta") || "Déclarer le paiement",
      },
    );
    if (!method) return;
    try {
      await api.markContributionPaid(myContribution.id, String(method));
      toast.success(
        t("tontine.declareSuccess") ||
          "Paiement déclaré. Le bénéficiaire a été notifié.",
      );
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    }
  }

  async function handleConfirmReception(contribId: string) {
    try {
      await api.confirmContribution(contribId);
      toast.success(
        t("tontine.confirmSuccess") || "Réception confirmée ✓",
      );
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    }
  }

  // V233.C — Le bénéficiaire déclare "j'ai bien reçu mon tour".
  // Marque TOUTES les contributions non encore CONFIRMED du tour courant
  // comme CONFIRMED (paid + confirmed en une étape via declareContributionReceived).
  // Cas d'usage : tontine physique en cash, sans déclaration des contributeurs.
  async function handleMarkTurnAsReceived() {
    if (!selectedTurn) return;
    if (!isBeneficiary) return;
    const pending = (selectedTurn.contributions ?? []).filter(
      (c) => c.status !== "CONFIRMED",
    );
    if (pending.length === 0) {
      toast.info(t("tontine.markAsReceived.allConfirmed") || "Toutes les contributions sont déjà confirmées.");
      return;
    }
    const ok = await dialog.confirm(
      t("tontine.popover.markAsReceivedHint", { count: String(pending.length) } as any) ||
        `Marquer ${pending.length} contribution(s) comme reçue(s) ? Les contributeurs seront notifiés.`,
      {
        title: t("tontine.popover.markAsReceived") || "Déclarer avoir reçu mon tour",
        confirmLabel: t("common.confirm") || "Confirmer",
        cancelLabel: t("common.cancel") || "Annuler",
      },
    );
    if (!ok) return;
    const method =
      (await dialog.prompt(
        t("tontine.markAsReceived.methodHint") ||
          "Indique comment l'argent a été reçu (ex. Espèces, Wave, Virement). Le contributeur le verra.",
        {
          title: t("tontine.markAsReceived.methodTitle") || "Méthode de paiement",
          placeholder: t("tontine.markAsReceived.methodPlaceholder") || "Espèces / Wave / Virement",
          confirmLabel: t("common.confirm") || "Confirmer",
        },
      )) || "Espèces";
    try {
      // Loop sequencé : declareContributionReceived prend status PENDING ou PAID
      // et passe directement à CONFIRMED. On boucle séquentiellement pour
      // garder la trace dans les logs et notifs (1 notif par contributeur).
      for (const c of pending) {
        await api.declareContributionReceived(c.id, String(method));
      }
      // V233.A pattern : invalider le cache avant refresh pour avoir l'état frais.
      invalidateGenericCache(`/groups/${groupId}/tontine`);
      toast.success(
        t("tontine.markAsReceived.success", { count: String(pending.length) } as any) ||
          `${pending.length} contribution(s) marquée(s) comme reçue(s).`,
      );
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    }
  }

  // V219.C — Soumet la demande de suppression (raison + workflow direct/vote).
  async function handleRequestCancellation(reason: string) {
    if (!active) return;
    setCancelLoading(true);
    try {
      const res = await api.requestTontineCancellation(
        groupId,
        active.id,
        reason,
      );
      setCancelSheetOpen(false);
      if (res.deleted) {
        toast.success(
          t("tontine.cancel.banner.approved") || "Tontine supprimée",
        );
      } else {
        toast.success(
          t("tontine.cancel.banner.proposed", { reason }) ||
            `Demande de suppression envoyée — vote en cours.`,
        );
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    } finally {
      setCancelLoading(false);
    }
  }

  // V219.C — Vote d'un membre sur la demande de suppression en cours.
  async function handleVoteCancellation(vote: boolean) {
    if (!active) return;
    try {
      const res = await api.voteTontineCancellation(groupId, active.id, vote);
      if (res.status === "APPROVED") {
        toast.success(
          t("tontine.cancel.banner.approved") || "Tontine supprimée",
        );
      } else if (res.status === "REJECTED") {
        toast.info(
          t("tontine.cancel.rejectCta") + " — demande annulée" ||
            "Demande de suppression refusée",
        );
      } else {
        toast.success(
          t("tontine.cancel.banner.votes", {
            approved: String(res.approvedCount),
            total: String(res.totalRequired),
          }) ||
            `${res.approvedCount} / ${res.totalRequired} membres ont validé`,
        );
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    }
  }

  async function handleEditTurnDetails() {
    if (!selectedTurn) return;
    const newPlace = await dialog.prompt(
      t("tontine.editPlaceHelp") ||
        "Où se déroulera ce tour ? (ex. Café du Coin, Paris 18e)",
      {
        title: t("tontine.editPlaceTitle") || "Modifier le lieu",
        defaultValue: selectedTurn.location || "",
        placeholder: "Café du Coin · Paris 18e",
        confirmLabel: t("common.save") || "Enregistrer",
      },
    );
    if (newPlace === null) return;
    try {
      await api.updateTurnDetails(selectedTurn.id, {
        location: String(newPlace).trim() || null,
      });
      toast.success(t("tontine.placeUpdated") || "Lieu mis à jour");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    }
  }

  async function handleEditTurnDate() {
    if (!selectedTurn) return;
    const newDate = await dialog.prompt(
      t("tontine.editDateHelp") ||
        "Format : AAAA-MM-JJ. Doit rester dans le mois prévu.",
      {
        title: t("tontine.editDateTitle") || "Modifier la date",
        defaultValue: selectedTurn.scheduledDate
          ? selectedTurn.scheduledDate.slice(0, 10)
          : "",
        placeholder: "2026-11-25",
        inputType: "text",
        confirmLabel: t("common.save") || "Enregistrer",
        validate: (v) => {
          if (!v) return null;
          // Validation format YYYY-MM-DD + date valide
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
            return "Format attendu : AAAA-MM-JJ (ex: 2026-11-25)";
          const d = new Date(v);
          if (isNaN(d.getTime())) return "Date invalide";
          return null;
        },
      },
    );
    if (!newDate) return;
    try {
      const iso = new Date(String(newDate)).toISOString();
      await api.scheduleTurn(selectedTurn.id, new Date(iso));
      toast.success(t("tontine.dateUpdated") || "Date mise à jour");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ padding: 32, textAlign: "center", color: "#8B6F47" }}>
          {t("common.loading") || "Chargement…"}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header avec onglets */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 2,
            }}
          >
            {t("tontine.breadcrumb", { groupName: group.name } as any) ||
              `Groupes › ${group.name}`}
          </div>
          <h2 style={titleStyle}>
            {t("tontine.title") || "Tontine"}
          </h2>
        </div>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          segments={[
            {
              value: "active",
              label: t("tontine.tabActive") || "En cours",
            },
            {
              value: "past",
              label: `${t("tontine.tabPast") || "Passées"} (${past.length})`,
            },
            {
              value: "cancelled",
              // V231 — Compteur explicite pour les tontines annulées qui
              // s'accumulent au fil du temps (et non plus écrasées).
              label:
                t("tontine.tab.cancelledCount", {
                  count: String(cancelled.length),
                } as any) ||
                `${t("tontine.tabCancelled") || "Annulées"} (${cancelled.length})`,
            },
          ]}
          size="sm"
        />
      </div>

      {/* === Onglet EN COURS === */}
      {tab === "active" &&
        (!active ? (
          // V219.B — Si l'utilisateur a déjà eu des tontines (passées ou
          // annulées) mais qu'il n'y a aucune ACTIVE/DRAFT, on contextualise
          // l'EmptyState pour qu'il sache qu'il peut consulter l'historique.
          <EmptyState
            t={t}
            onCreate={onCreateClick}
            pastCount={past.length}
            cancelledCount={cancelled.length}
            onSeePast={() => setTab("past")}
            onSeeCancelled={() => setTab("cancelled")}
          />
        ) : (
          <>
            {/* V219.C — Bandeau de vote en haut quand une demande est en cours */}
            {active.cancellationStatus === "PROPOSED" && (
              <CancellationBanner
                tontine={active}
                me={me}
                groupMembers={group.members}
                onVote={handleVoteCancellation}
                t={t}
              />
            )}
            {active.cancellationStatus === "REJECTED" && (
              <RejectedBanner
                tontine={active}
                groupMembers={group.members}
                t={t}
              />
            )}
            <ActiveTontineLayout
              tontine={active}
              selectedTurn={selectedTurn}
              selectedTurnId={selectedTurnId}
              onSelectTurn={handleSeatClick}
              onSeatHoverEnter={handleSeatHoverEnter}
              onSeatHoverLeave={handleSeatHoverLeave}
              popoverTurn={popoverTurn}
              popoverVisible={popoverVisible}
              isPinned={pinnedTurnId !== null && pinnedTurnId === popoverTurn?.id}
              onUnpin={() => setPinnedTurnId(null)}
              turnCounter={turnCounter}
              contributionsStats={contributionsStats}
              beneficiaryMethods={beneficiaryMethods}
              canEditTurn={canEditTurn}
              isBeneficiary={isBeneficiary}
              myContribution={myContribution}
              meId={me.id}
              onEditPlace={handleEditTurnDetails}
              onEditDate={handleEditTurnDate}
              onDeclarePayment={handleDeclarePayment}
              onConfirmReception={handleConfirmReception}
              onMarkTurnAsReceived={handleMarkTurnAsReceived}
              formatAmount={formatAmount}
              t={t}
            />
            {/* V219.C — Bouton "Supprimer cette tontine" (admin uniquement, en bas). */}
            {isAdmin && active.cancellationStatus !== "PROPOSED" && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setCancelSheetOpen(true)}
                  style={{
                    background: "transparent",
                    color: "#9F4628",
                    border: "1px solid rgba(159, 70, 40, 0.35)",
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {t("tontine.cancel.button") || "Supprimer cette tontine"}
                </button>
              </div>
            )}
          </>
        ))}

      {/* === Onglet PASSÉES === */}
      {tab === "past" && (
        <HistoryList
          tontines={past}
          kind="past"
          t={t}
          formatAmount={formatAmount}
          onSelect={setDetailTontine}
        />
      )}

      {/* === Onglet ANNULÉES === */}
      {tab === "cancelled" && (
        <HistoryList
          tontines={cancelled}
          kind="cancelled"
          t={t}
          formatAmount={formatAmount}
          onSelect={setDetailTontine}
        />
      )}

      {/* V219.D — Modale détail read-only ouverte au clic sur une tontine
          de l'historique (Passées ou Annulées). */}
      {detailTontine && (
        <TontineDetailReadOnlyModal
          tontine={detailTontine}
          onClose={() => setDetailTontine(null)}
          formatAmount={formatAmount}
          t={t}
        />
      )}

      {/* V219.C — Sheet "Supprimer cette tontine" : raison + workflow direct/vote */}
      {cancelSheetOpen && active && (
        <TontineCancellationSheet
          tontine={active}
          loading={cancelLoading}
          onClose={() => setCancelSheetOpen(false)}
          onSubmit={handleRequestCancellation}
          t={t}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sous-composants
// ═══════════════════════════════════════════════════════════════════

function EmptyState({
  t,
  onCreate,
  pastCount = 0,
  cancelledCount = 0,
  onSeePast,
  onSeeCancelled,
}: {
  t: (k: string, v?: any) => string;
  onCreate: () => void;
  // V219.B — Si > 0, on affiche un petit rappel "X tontine(s) déjà terminée(s)"
  // avec liens vers les onglets d'historique.
  pastCount?: number;
  cancelledCount?: number;
  onSeePast?: () => void;
  onSeeCancelled?: () => void;
}) {
  const hasHistory = pastCount > 0 || cancelledCount > 0;
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px dashed #D9C8A6",
        borderRadius: 11,
        padding: "36px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 36, color: "#C58A2E", marginBottom: 10 }}>↻</div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 18,
          color: "#2B1F15",
          marginBottom: 5,
          fontWeight: 500,
        }}
      >
        {t("tontine.emptyTitle") || "Pas de tontine en cours"}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#8B6F47",
          maxWidth: 340,
          margin: "0 auto 16px",
        }}
      >
        {t("tontine.emptySubtitle") ||
          "Crée une tontine pour ce groupe : chaque mois, un membre reçoit le pot collectif."}
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{
          padding: "9px 16px",
          background: "#C58A2E",
          color: "#2B1F15",
          border: "none",
          borderRadius: 9,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        + {t("tontine.createCta") || "Créer une tontine"}
      </button>

      {/* V219.B — Rappel discret de l'historique disponible. */}
      {hasHistory && (
        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: "0.5px solid #EAD9B8",
            fontSize: 11,
            color: "#8B6F47",
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {pastCount > 0 && (
            <button
              type="button"
              onClick={onSeePast}
              style={{
                background: "transparent",
                border: "none",
                color: "#8B6F47",
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              {pastCount}{" "}
              {t("tontine.emptyPastHint") ||
                (pastCount > 1 ? "tontines terminées" : "tontine terminée")}
            </button>
          )}
          {cancelledCount > 0 && (
            <button
              type="button"
              onClick={onSeeCancelled}
              style={{
                background: "transparent",
                border: "none",
                color: "#8B6F47",
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              {cancelledCount}{" "}
              {t("tontine.emptyCancelledHint") ||
                (cancelledCount > 1
                  ? "tontines annulées"
                  : "tontine annulée")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveTontineLayout({
  tontine,
  selectedTurn,
  selectedTurnId,
  onSelectTurn,
  onSeatHoverEnter,
  onSeatHoverLeave,
  popoverTurn,
  popoverVisible,
  isPinned,
  onUnpin,
  turnCounter,
  contributionsStats,
  beneficiaryMethods,
  canEditTurn,
  isBeneficiary,
  myContribution,
  meId,
  onEditPlace,
  onEditDate,
  onDeclarePayment,
  onConfirmReception,
  onMarkTurnAsReceived,
  formatAmount,
  t,
}: {
  tontine: Tontine;
  selectedTurn: Turn | null;
  selectedTurnId: string | null;
  onSelectTurn: (id: string) => void;
  // V233.B — Hover handlers + popover state.
  onSeatHoverEnter: (id: string) => void;
  onSeatHoverLeave: () => void;
  popoverTurn: Turn | null;
  popoverVisible: boolean;
  isPinned: boolean;
  onUnpin: () => void;
  turnCounter: { current: number; total: number };
  contributionsStats: {
    confirmed: number;
    declared: number;
    pending: number;
    total: number;
  };
  beneficiaryMethods: PaymentMethod[];
  canEditTurn: boolean;
  isBeneficiary: boolean;
  myContribution: Contribution | undefined;
  meId: string;
  onEditPlace: () => void;
  onEditDate: () => void;
  onDeclarePayment: () => void;
  onConfirmReception: (contribId: string) => void;
  onMarkTurnAsReceived: () => void;
  formatAmount: (a: number | string, c: string) => string;
  t: (k: string, v?: any) => string;
}) {
  // Mapping Turn → WheelTurn pour la roue
  const wheelTurns: WheelTurn[] = tontine.turns.map((tn) => ({
    id: tn.id,
    turnNumber: tn.turnNumber,
    status: tn.status,
    beneficiary: tn.beneficiary,
  }));

  const pot =
    selectedTurn?.totalReceived ??
    String(
      Number(tontine.contributionAmount) *
        Math.max(tontine.turns.length - 1, 1),
    );

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
        {/* ═══ COL GAUCHE : Roue ═══ */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 13,
                color: "#2B1F15",
                fontWeight: 500,
              }}
            >
              {t("tontine.cycleLabel") || "Cycle"}{" "}
              {new Date(tontine.startDate).toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {turnCounter.current}/{turnCounter.total}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
            <div
              data-theme="v45-light-wheel"
              // V233.B — mouseleave de la zone roue : déclenche le timer de
              // fermeture (200ms) qui clear hoveredTurnId si la souris ne
              // revient pas dessus ou dans le popover.
              onMouseLeave={() => onSeatHoverLeave()}
            >
              <TontineWheel
                turns={wheelTurns}
                selectedTurnId={selectedTurnId}
                onSelectTurn={(turnId) => {
                  // V233.B — Clic siège : toggle pin du popover.
                  onSelectTurn(turnId);
                }}
                onHoverTurn={(turnId) => {
                  // V233.B — Hover siège : ouvre le popover (annule un timer
                  // de fermeture pendant). turnId=null = mouseleave.
                  if (turnId) onSeatHoverEnter(turnId);
                }}
                size={260}
                meId={meId}
              />
            </div>
            {/* V233.B — Popover d'action contextuel ; visible UNIQUEMENT
                au hover (pas sticky) ou pinned (clic). */}
            {popoverVisible && popoverTurn && (
              <TurnActionPopover
                turn={popoverTurn}
                myContribution={
                  popoverTurn.contributions?.find(
                    (c) => c.contributorUserId === meId,
                  )
                }
                isBeneficiary={popoverTurn.beneficiary.id === meId}
                meId={meId}
                isPinned={isPinned}
                onClose={onUnpin}
                onDeclarePayment={onDeclarePayment}
                onConfirmReception={onConfirmReception}
                onMarkTurnAsReceived={onMarkTurnAsReceived}
                onPopoverHoverEnter={() => {
                  // Souris entre dans le popover → réinitialise le timer
                  // de fermeture (laisse le popover ouvert tant qu'on le
                  // survole, pour permettre d'utiliser ses boutons).
                  onSeatHoverEnter(popoverTurn.id);
                }}
                onPopoverHoverLeave={() => {
                  onSeatHoverLeave();
                }}
                t={t}
                formatAmount={formatAmount}
                currency={tontine.currency}
              />
            )}
          </div>

          {/* Légende */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 10,
              marginTop: 8,
              fontSize: 9,
              color: "#8B6F47",
            }}
          >
            <LegendDot color="#1F7A57" label={t("tontine.legendDone") || "Terminé"} />
            <LegendDot color="#C58A2E" label={t("tontine.legendActive") || "En cours"} />
            <LegendDot
              color="#FFFFFF"
              border="#D9C8A6"
              label={t("tontine.legendFuture") || "À venir"}
            />
          </div>
        </div>

        {/* ═══ COL DROITE : Détails du tour ═══ */}
        <div
          style={{
            ...cardStyle,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {selectedTurn ? (
            <>
              {/* Hero bénéficiaire */}
              <div
                style={{ display: "flex", alignItems: "center", gap: 11 }}
              >
                <Avatar member={selectedTurn.beneficiary} size={46} />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#8B6F47",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {t("tontine.turnNumLabel") || "Tour"} {selectedTurn.turnNumber}
                    {" · "}
                    {t("tontine.beneficiaryLabel") || "bénéficiaire"}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontSize: 17,
                      color: "#2B1F15",
                    }}
                  >
                    {selectedTurn.beneficiary.id === meId
                      ? t("common.you") || "Toi"
                      : selectedTurn.beneficiary.displayName}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontSize: 20,
                      color: "#2B1F15",
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAmount(pot, tontine.currency)}
                  </div>
                  <div style={{ fontSize: 10, color: "#8B6F47" }}>
                    {t("tontine.toReceive") || "à recevoir"}
                  </div>
                </div>
              </div>

              {/* Tuiles Date / Lieu */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <Tile
                  label={t("tontine.dateLabel") || "Date"}
                  value={formatTurnDate(
                    selectedTurn.scheduledDate || selectedTurn.dueDate,
                    selectedTurn.meetingTime,
                  )}
                  onEdit={canEditTurn ? onEditDate : undefined}
                />
                <Tile
                  label={t("tontine.placeLabel") || "Lieu"}
                  value={
                    selectedTurn.location ||
                    (t("tontine.placeNotSet") || "à définir")
                  }
                  onEdit={canEditTurn ? onEditPlace : undefined}
                />
              </div>
              {canEditTurn && (
                <div style={{ fontSize: 10, color: "#8B6F47" }}>
                  <span>
                    {t("tontine.editHint") ||
                      "Modifiable par le bénéficiaire ou un admin."}
                  </span>
                </div>
              )}

              {/* Méthodes de paiement du bénéficiaire */}
              {selectedTurn.beneficiary.id !== meId && (
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "#8B6F47",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    {t("tontine.howToPayLabel", {
                      name: selectedTurn.beneficiary.displayName,
                    } as any) ||
                      `Comment payer ${selectedTurn.beneficiary.displayName}`}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 5,
                    }}
                  >
                    {beneficiaryMethods.length === 0 ? (
                      <span style={{ fontSize: 11, color: "#8B6F47" }}>
                        {t("tontine.noMethods") ||
                          "Pas encore de méthode renseignée."}
                      </span>
                    ) : (
                      beneficiaryMethods.map((m) => (
                        <span
                          key={m.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 8px",
                            background: "rgba(197,138,46,0.10)",
                            borderRadius: 5,
                            fontSize: 10,
                            color: "#8B6F47",
                          }}
                          title={m.value}
                        >
                          {m.typeLabel} · {m.label || `…${m.last4}`}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Liste des contributeurs */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 5,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      color: "#8B6F47",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {t("tontine.contributionsLabel") || "Cotisations"}{" "}
                    · {contributionsStats.total}{" "}
                    {t("tontine.contributorsLabel") || "contributeurs"}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#8B6F47",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span style={{ color: "#1F7A57" }}>
                      {contributionsStats.confirmed}
                    </span>{" "}
                    {t("tontine.statusConfirmedShort") || "reçues"} ·{" "}
                    <span style={{ color: "#C58A2E" }}>
                      {contributionsStats.declared}
                    </span>{" "}
                    {t("tontine.statusDeclaredShort") || "déclarées"} ·{" "}
                    <span>{contributionsStats.pending}</span>{" "}
                    {t("tontine.statusPendingShort") || "à payer"}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    maxHeight: 165,
                    overflow: "auto",
                  }}
                >
                  {(selectedTurn.contributions ?? []).map((c) => (
                    <ContributionRow
                      key={c.id}
                      contribution={c}
                      isMe={c.contributorUserId === meId}
                      isBeneficiary={isBeneficiary}
                      onConfirm={() => onConfirmReception(c.id)}
                      currency={tontine.currency}
                      formatAmount={formatAmount}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 24, textAlign: "center", color: "#8B6F47" }}>
              {t("tontine.selectTurnHint") ||
                "Clique sur un siège dans la roue pour voir le détail."}
            </div>
          )}
        </div>
      </div>

      {/* Bandeau cocoa noir avec CTA paiement (uniquement si on a une contribution
          due, qu'on n'est pas soi-même le bénéficiaire, et que le tour n'est pas
          déjà distribué/annulé). */}
      {selectedTurn &&
        selectedTurn.status !== "DISTRIBUTED" &&
        selectedTurn.status !== "CANCELLED" &&
        myContribution &&
        myContribution.status === "PENDING" &&
        !isBeneficiary && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
              padding: "10px 14px",
              background: "#2B1F15",
              borderRadius: 9,
              color: "#F4ECD9",
            }}
          >
            <div style={{ flex: 1, fontSize: 12 }}>
              <div style={{ fontWeight: 500, color: "#F4ECD9" }}>
                {t("tontine.awaitingPayment", {
                  name: selectedTurn.beneficiary.displayName,
                } as any) ||
                  `${selectedTurn.beneficiary.displayName} attend ta cotisation`}
              </div>
              <div style={{ fontSize: 10, color: "#A89A82" }}>
                {t("tontine.declareHint") ||
                  "Une fois ton paiement déclaré, le bénéficiaire reçoit une notif pour confirmer."}
              </div>
            </div>
            <button
              type="button"
              onClick={onDeclarePayment}
              style={{
                padding: "7px 13px",
                background: "#C58A2E",
                color: "#2B1F15",
                border: "none",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("tontine.declareCta") || "Déclarer mon paiement"}
            </button>
          </div>
        )}
    </>
  );
}

function ContributionRow({
  contribution,
  isMe,
  isBeneficiary,
  onConfirm,
  currency,
  formatAmount,
  t,
}: {
  contribution: Contribution;
  isMe: boolean;
  isBeneficiary: boolean;
  onConfirm: () => void;
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: (k: string, v?: any) => string;
}) {
  // 3 états visuels : CONFIRMED vert / PAID saffron pulsé / PENDING gris.
  let dotColor = "#D9C8A6";
  let statusLabel = t("tontine.statusToPay") || "À payer";
  let statusColor = "#8B6F47";
  let pulse = false;
  if (contribution.status === "CONFIRMED") {
    dotColor = "#1F7A57";
    statusLabel = t("tontine.statusConfirmed") || "Confirmé ✓";
    statusColor = "#1F7A57";
  } else if (contribution.status === "PAID") {
    dotColor = "#C58A2E";
    statusLabel = t("tontine.statusDeclared") || "⌛ Déclaré";
    statusColor = "#9A6A1E";
    pulse = true;
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 7,
        border: `0.5px solid ${
          isMe || (isBeneficiary && contribution.status === "PAID")
            ? "#C58A2E"
            : "#D9C8A6"
        }`,
        background: isMe
          ? "rgba(197,138,46,0.04)"
          : contribution.status === "PAID" && isBeneficiary
            ? "rgba(197,138,46,0.06)"
            : "#FFFFFF",
      }}
    >
      <Avatar member={contribution.contributor} size={24} />
      <div style={{ flex: 1, fontSize: 12 }}>
        {isMe
          ? t("common.you") || "Toi"
          : contribution.contributor.displayName}{" "}
        <span style={{ color: "#8B6F47", fontSize: 10 }}>
          · {formatAmount(contribution.amountDue, currency)}
        </span>
      </div>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          animation: pulse ? "v217-pulse 1.8s ease-in-out infinite" : "none",
        }}
      />
      <span
        style={{
          fontSize: 10,
          color: statusColor,
          fontWeight: contribution.status === "CONFIRMED" ? 500 : 400,
        }}
      >
        {statusLabel}
      </span>
      {/* Si je suis le bénéficiaire ET la contrib est PAID → bouton confirmer */}
      {isBeneficiary && contribution.status === "PAID" && (
        <button
          type="button"
          onClick={onConfirm}
          style={{
            padding: "3px 8px",
            background: "#1F7A57",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("tontine.confirmReceiveCta") || "Confirmer réception"}
        </button>
      )}
      <style>{`@keyframes v217-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }`}</style>
    </div>
  );
}

function HistoryList({
  tontines,
  kind,
  t,
  formatAmount,
  onSelect,
}: {
  tontines: Tontine[];
  kind: "past" | "cancelled";
  t: (k: string, v?: any) => string;
  formatAmount: (a: number | string, c: string) => string;
  // V219.D — Au clic sur une card, ouvre la modale détail read-only.
  onSelect?: (tn: Tontine) => void;
}) {
  if (tontines.length === 0) {
    return (
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px dashed #D9C8A6",
          borderRadius: 11,
          padding: 32,
          textAlign: "center",
          color: "#8B6F47",
          fontSize: 12,
        }}
      >
        {kind === "past"
          ? t("tontine.noPast") || "Aucune tontine terminée pour ce groupe."
          : t("tontine.noCancelled") || "Aucune tontine annulée pour ce groupe."}
      </div>
    );
  }
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#8B6F47",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {tontines.length}{" "}
        {kind === "past"
          ? t("tontine.pastCountLabel") || "tontines terminées"
          : t("tontine.cancelledCountLabel") || "tontines annulées"}
      </div>
      {tontines.map((tn) => {
        const total =
          Number(tn.contributionAmount) *
          Math.max(tn.turns.length, 1) *
          Math.max(tn.turns.length - 1, 1);
        const isCancelled = kind === "cancelled";
        // V219.D — Card cliquable : ouvre la modale détail read-only.
        const handleClick = () => onSelect?.(tn);
        return (
          <div
            key={tn.id}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={
              t("tontine.detail.openCardLabel") ||
              "Voir le détail de cette tontine"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              background: "#FFFFFF",
              border: `0.5px solid ${isCancelled ? "rgba(159,70,40,0.30)" : "#D9C8A6"}`,
              borderRadius: 9,
              cursor: onSelect ? "pointer" : "default",
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!onSelect) return;
              (e.currentTarget as HTMLDivElement).style.background =
                "#FAF6EE";
              (e.currentTarget as HTMLDivElement).style.borderColor = isCancelled
                ? "rgba(159,70,40,0.55)"
                : "#C58A2E";
            }}
            onMouseLeave={(e) => {
              if (!onSelect) return;
              (e.currentTarget as HTMLDivElement).style.background = "#FFFFFF";
              (e.currentTarget as HTMLDivElement).style.borderColor = isCancelled
                ? "rgba(159,70,40,0.30)"
                : "#D9C8A6";
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: isCancelled ? "#9F4628" : "#1F7A57",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                fontSize: 16,
              }}
            >
              {isCancelled ? "×" : "✓"}
            </div>
            <div style={{ flex: 1 }}>
              {/* V231 — Si la tontine a un nom libre, on l'affiche en titre
                  prioritaire ; sinon fallback « Cycle <mois> ». */}
              <div style={{ fontSize: 13, color: "#2B1F15", fontWeight: 500 }}>
                {tn.name ? (
                  <>
                    {tn.name}
                    {isCancelled && (tn as any).cancelledAt && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#9F4628",
                          fontWeight: 400,
                          marginLeft: 6,
                        }}
                      >
                        · {t("tontine.cancelled.title", {
                          name: "",
                          date: new Date((tn as any).cancelledAt).toLocaleDateString(),
                        } as any) ||
                          `annulée le ${new Date((tn as any).cancelledAt).toLocaleDateString()}`}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {t("tontine.cycleLabel") || "Cycle"}{" "}
                    {new Date(tn.startDate).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                    {tn.completedAt && (
                      <>
                        {" → "}
                        {new Date(tn.completedAt).toLocaleDateString(undefined, {
                          month: "short",
                          year: "numeric",
                        })}
                      </>
                    )}
                  </>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#8B6F47" }}>
                {tn.turns.length}{" "}
                {t("tontine.turnsLabel") || "tours"} ·{" "}
                {formatAmount(tn.contributionAmount, tn.currency)}
                /{t("tontine.turnLabelShort") || "tour"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 14,
                  color: "#2B1F15",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatAmount(total, tn.currency)}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: isCancelled ? "#9F4628" : "#1F7A57",
                }}
              >
                {isCancelled
                  ? t("tontine.statusCancelled") || "Annulée"
                  : t("tontine.statusCompleted") || "Terminée"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// V219.D — Modale détail read-only (Passées + Annulées)
// ═══════════════════════════════════════════════════════════════════
//
// Plein écran, overlay sombre, panel cream centré 80vw max 1000px.
// Aucun bouton d'action — tout est en lecture seule.
//
// Contenu :
//   1. Header : nom (ou "Tontine #N") + badge statut + bouton ✕.
//   2. Bannière annulation (si CANCELLED + cancellationReason présente).
//   3. Stats globales : montant/tour, devise, nb tours, date début/fin.
//   4. Liste verticale des tours :
//      - Tour #N · bénéficiaire (avatar + nom)
//      - Date prévue + réelle si distribué + lieu
//      - Liste contributions : payeur, montant, statut, date, méthode
//      - Total reçu vs attendu
//
// Esc + clic overlay → onClose().
function TontineDetailReadOnlyModal({
  tontine,
  onClose,
  formatAmount,
  t,
}: {
  tontine: Tontine;
  onClose: () => void;
  formatAmount: (a: number | string, c: string) => string;
  t: (k: string, v?: any) => string;
}) {
  // Fermeture Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isCancelled = tontine.status === "CANCELLED";
  const isCompleted = tontine.status === "COMPLETED";

  // Total attendu par tour = cotisation × (nb participants - 1)
  // (le bénéficiaire ne paye pas son propre tour)
  const expectedPerTurn =
    Number(tontine.contributionAmount) * Math.max(tontine.turns.length - 1, 1);

  // Dernier tour distribué pour la date de fin réelle, sinon fallback
  // completedAt / cancelledAt.
  const endDate =
    tontine.completedAt ||
    tontine.cancelledAt ||
    tontine.turns
      .filter((t) => t.scheduledDate || t.dueDate)
      .map((t) => t.scheduledDate || t.dueDate)
      .sort()
      .pop() ||
    null;

  const title =
    tontine.notes?.trim() ||
    `${t("tontine.detail.title") || "Détail de la tontine"} #${tontine.id.slice(0, 6).toUpperCase()}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("tontine.detail.title") || "Détail de la tontine"}
      onClick={(e) => {
        // Clic en dehors du panel → ferme.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(43, 31, 21, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "v219d-fade-in 0.18s ease-out",
      }}
    >
      <div
        style={{
          width: "min(80vw, 1000px)",
          maxHeight: "90vh",
          overflowY: "auto",
          overflowX: "hidden",
          background: "#FAF6EE",
          borderRadius: 14,
          boxShadow:
            "0 24px 60px rgba(43,31,21,0.30), 0 8px 18px rgba(43,31,21,0.15)",
          color: "#2B1F15",
          fontFamily: "Inter, -apple-system, sans-serif",
          animation: "v219d-slide-up 0.22s ease-out",
        }}
      >
        {/* ─── Header ─── */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "#FAF6EE",
            padding: "18px 22px 14px",
            borderBottom: "0.5px solid #EAD9B8",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
              flex: 1,
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 22,
              fontWeight: 500,
              color: "#2B1F15",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </h2>
          <StatusBadge
            kind={isCancelled ? "cancelled" : "completed"}
            label={
              isCancelled
                ? t("tontine.detail.cancelledBadge") || "Annulée"
                : t("tontine.detail.completedBadge") || "Terminée"
            }
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("tontine.detail.close") || "Fermer"}
            style={{
              width: 32,
              height: 32,
              border: "0.5px solid #D9C8A6",
              borderRadius: 8,
              background: "#FFFFFF",
              color: "#2B1F15",
              fontSize: 16,
              lineHeight: 1,
              cursor: "pointer",
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "16px 22px 24px" }}>
          {/* ─── Bannière annulation (V219.C compatible) ─── */}
          {isCancelled && tontine.cancellationReason && (
            <div
              style={{
                background: "rgba(159, 70, 40, 0.10)",
                border: "0.5px solid rgba(159, 70, 40, 0.30)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 16,
                color: "#2B1F15",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#7A2814",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 4,
                  fontWeight: 500,
                }}
              >
                {t("tontine.detail.cancelReasonLabel") || "Raison"}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {tontine.cancellationReason}
              </div>
              {(tontine.cancelledBy || tontine.cancelledAt) && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#7A5417",
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "0.5px dashed rgba(159, 70, 40, 0.25)",
                  }}
                >
                  {tontine.cancelledBy?.displayName && (
                    <>
                      {tontine.cancelledBy.displayName}
                      {tontine.cancelledAt ? " · " : ""}
                    </>
                  )}
                  {tontine.cancelledAt && (
                    <>
                      {t("tontine.detail.cancelledOn") || "Annulée le"}{" "}
                      {formatDate(tontine.cancelledAt)}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Stats globales ─── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            <StatTile
              label={t("tontine.detail.totalAmount") || "Montant total"}
              value={formatAmount(expectedPerTurn, tontine.currency)}
            />
            <StatTile
              label={t("tontine.detail.turnsCount") || "Tours"}
              value={String(tontine.turns.length)}
            />
            <StatTile
              label={t("tontine.detail.startDate") || "Démarrée le"}
              value={formatDate(tontine.startDate)}
            />
            <StatTile
              label={
                isCancelled
                  ? t("tontine.detail.cancelledOn") || "Annulée le"
                  : t("tontine.detail.endDate") || "Achevée le"
              }
              value={endDate ? formatDate(endDate) : "—"}
            />
          </div>

          {/* ─── Liste des tours ─── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {tontine.turns.map((turn) => (
              <TurnReadOnlyCard
                key={turn.id}
                turn={turn}
                currency={tontine.currency}
                expectedPerTurn={expectedPerTurn}
                formatAmount={formatAmount}
                t={t}
              />
            ))}
          </div>
        </div>

        <style>{`
          @keyframes v219d-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes v219d-slide-up {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

function StatusBadge({
  kind,
  label,
}: {
  kind: "completed" | "cancelled";
  label: string;
}) {
  const bg = kind === "completed" ? "rgba(197,138,46,0.12)" : "rgba(159,70,40,0.12)";
  const color = kind === "completed" ? "#7A5417" : "#7A2814";
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 10px",
        borderRadius: 999,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #EAD9B8",
        borderRadius: 9,
        padding: "10px 12px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "#8B6F47",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#2B1F15",
          fontVariantNumeric: "tabular-nums",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TurnReadOnlyCard({
  turn,
  currency,
  expectedPerTurn,
  formatAmount,
  t,
}: {
  turn: Turn;
  currency: string;
  expectedPerTurn: number;
  formatAmount: (a: number | string, c: string) => string;
  t: (k: string, v?: any) => string;
}) {
  const contribs = turn.contributions ?? [];
  // Total effectivement reçu = somme des CONFIRMED + PAID (déclarés mais
  // pas encore confirmés ; on les compte ici car la tontine est terminée).
  const totalReceived = contribs
    .filter((c) => c.status === "CONFIRMED" || c.status === "PAID")
    .reduce((s, c) => s + Number(c.amountDue || 0), 0);

  const scheduled = turn.scheduledDate || turn.dueDate;
  const actual = (turn as any).distributedAt as string | null | undefined;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #EAD9B8",
        borderRadius: 11,
        padding: "12px 14px",
      }}
    >
      {/* Header : tour + bénéficiaire */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 16,
            color: "#7A5417",
            fontWeight: 500,
            minWidth: 60,
          }}
        >
          {t("tontine.turnLabel", { n: String(turn.turnNumber) } as any) ||
            `Tour #${turn.turnNumber}`}
        </div>
        <Avatar member={turn.beneficiary} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {t("tontine.detail.beneficiary") || "Bénéficiaire"}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#2B1F15",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {turn.beneficiary.displayName}
          </div>
        </div>
        <StatusBadge
          kind={turn.status === "DISTRIBUTED" ? "completed" : "cancelled"}
          label={
            turn.status === "DISTRIBUTED"
              ? t("tontine.detail.completedBadge") || "Terminée"
              : turn.status === "CANCELLED"
                ? t("tontine.detail.cancelledBadge") || "Annulée"
                : t("tontine.statusToPay") || "À payer"
          }
        />
      </div>

      {/* Méta : date prévue / réelle / lieu */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <MiniMeta
          label={t("tontine.detail.scheduledDate") || "Date prévue"}
          value={scheduled ? formatDate(scheduled) : "—"}
        />
        <MiniMeta
          label={t("tontine.detail.actualDate") || "Date réelle"}
          value={actual ? formatDate(actual) : "—"}
          highlight={!!actual && actual !== scheduled}
        />
        <MiniMeta
          label={t("tontine.detail.location") || "Lieu"}
          value={turn.location || "—"}
        />
      </div>

      {/* Liste contributions */}
      {contribs.length > 0 && (
        <>
          <div
            style={{
              fontSize: 9,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            {t("tontine.detail.contributionsHeader") || "Paiements reçus"}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 10,
            }}
          >
            {contribs.map((c) => (
              <ContributionReadOnlyRow
                key={c.id}
                contribution={c}
                currency={currency}
                formatAmount={formatAmount}
                t={t}
              />
            ))}
          </div>
        </>
      )}

      {/* Total reçu vs attendu */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 10,
          borderTop: "0.5px dashed #EAD9B8",
          fontSize: 12,
        }}
      >
        <div style={{ color: "#8B6F47" }}>
          {t("tontine.detail.totalExpected") || "Total attendu"} ·{" "}
          <span
            style={{
              color: "#2B1F15",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatAmount(expectedPerTurn, currency)}
          </span>
        </div>
        <div
          style={{
            color: "#1F7A57",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {t("tontine.detail.totalReceived") || "Total reçu"} ·{" "}
          {formatAmount(totalReceived, currency)}
        </div>
      </div>
    </div>
  );
}

function MiniMeta({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: "#FAF6EE",
        borderRadius: 7,
        padding: "6px 9px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 8,
          color: "#8B6F47",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: highlight ? "#7A5417" : "#2B1F15",
          fontWeight: highlight ? 500 : 400,
          marginTop: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ContributionReadOnlyRow({
  contribution,
  currency,
  formatAmount,
  t,
}: {
  contribution: Contribution;
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: (k: string, v?: any) => string;
}) {
  let dotColor = "#D9C8A6";
  let statusLabel = t("tontine.detail.statusPending") || "En attente";
  let statusColor = "#8B6F47";
  if (contribution.status === "CONFIRMED") {
    dotColor = "#1F7A57";
    statusLabel = t("tontine.detail.statusConfirmed") || "Confirmé";
    statusColor = "#1F7A57";
  } else if (contribution.status === "PAID") {
    dotColor = "#C58A2E";
    statusLabel = t("tontine.detail.statusDeclared") || "Déclaré";
    statusColor = "#9A6A1E";
  }
  const dateRef = contribution.confirmedAt || contribution.paidAt;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: "#FAF6EE",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <Avatar member={contribution.contributor as Member} size={22} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {contribution.contributor.displayName}{" "}
          <span style={{ color: "#8B6F47", fontSize: 10 }}>
            · {formatAmount(contribution.amountDue, currency)}
          </span>
        </div>
        {(contribution.paymentMethod || dateRef) && (
          <div style={{ fontSize: 10, color: "#8B6F47", marginTop: 1 }}>
            {contribution.paymentMethod && (
              <>{contribution.paymentMethod}</>
            )}
            {contribution.paymentMethod && dateRef && " · "}
            {dateRef && formatDate(dateRef)}
          </div>
        )}
      </div>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 10,
          color: statusColor,
          fontWeight: contribution.status === "CONFIRMED" ? 500 : 400,
          flexShrink: 0,
        }}
      >
        {statusLabel}
      </span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Petits helpers visuels
// ═══════════════════════════════════════════════════════════════════

function Avatar({ member, size = 32 }: { member: Member; size?: number }) {
  const initials = member.displayName
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  // Hash simple sur l'id pour avoir une couleur stable par membre.
  const colors = ["#7A4E89", "#3B6D8E", "#8B5A2B", "#5A6E4F", "#9F4628", "#C58A2E"];
  const hash = Array.from(member.id).reduce(
    (acc, ch) => acc + ch.charCodeAt(0),
    0,
  );
  const bg = colors[hash % colors.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size < 30 ? 10 : 14,
        color: "#FFFFFF",
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {initials || "?"}
    </div>
  );
}

function Tile({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      style={{
        background: "#F4ECD9",
        borderRadius: 7,
        padding: "8px 10px",
        cursor: onEdit ? "pointer" : "default",
        position: "relative",
      }}
      title={onEdit ? "Cliquer pour modifier" : undefined}
    >
      <div
        style={{
          fontSize: 9,
          color: "#8B6F47",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: "#2B1F15", marginTop: 2 }}>
        {value}
      </div>
      {onEdit && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            fontSize: 10,
            color: "#C58A2E",
          }}
        >
          ✎
        </span>
      )}
    </div>
  );
}

function LegendDot({
  color,
  border,
  label,
}: {
  color: string;
  border?: string;
  label: string;
}) {
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          border: border ? `0.5px solid ${border}` : "none",
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function formatTurnDate(iso: string, time?: string | null) {
  try {
    const d = new Date(iso);
    const dStr = d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    return time ? `${dStr} · ${time}` : dStr;
  } catch {
    return iso;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Styles partagés
// ═══════════════════════════════════════════════════════════════════

const pageStyle: React.CSSProperties = {
  background: "#FAF6EE",
  borderRadius: 12,
  padding: 16,
  color: "#2B1F15",
  fontFamily: "Inter, -apple-system, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "0.5px solid #D9C8A6",
  borderRadius: 11,
  padding: 14,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 500,
  color: "#2B1F15",
  fontFamily: "'Cormorant Garamond', Georgia, serif",
};

// ============================================================
// V219.C — Bandeau de vote suppression tontine
// ============================================================

function CancellationBanner({
  tontine,
  me,
  groupMembers,
  onVote,
  t,
}: {
  tontine: Tontine;
  me: { id: string };
  groupMembers: any[];
  onVote: (vote: boolean) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const votes = tontine.cancellationVotes ?? [];
  const requestedById = tontine.cancellationRequestedById ?? null;
  // Membres dont le vote est attendu (tout sauf l'admin émetteur).
  const expectedVoters = groupMembers
    .map((m: any) => m.user?.id || m.userId)
    .filter((id: string) => id && id !== requestedById);
  const positives = votes.filter((v) => v.vote && expectedVoters.includes(v.userId));
  const total = expectedVoters.length;
  const approved = positives.length;
  const myVote = votes.find((v) => v.userId === me.id);
  const isRequester = me.id === requestedById;
  const canVote = !isRequester && !myVote;

  return (
    <div
      style={{
        background: "rgba(159, 70, 40, 0.08)",
        border: "1px solid rgba(159, 70, 40, 0.25)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 13, color: "#9F4628", fontWeight: 600, marginBottom: 6 }}>
        {(t("tontine.cancel.banner.proposed") || "Demande de suppression : {{reason}}").replace(
          "{{reason}}",
          tontine.cancellationReason || "—",
        )}
      </div>
      <div style={{ fontSize: 13, color: "#6B5942", marginBottom: 12 }}>
        {(t("tontine.cancel.banner.votes") || "{{approved}} / {{total}} membres ont validé")
          .replace("{{approved}}", String(approved))
          .replace("{{total}}", String(total))}
      </div>
      {canVote && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void onVote(true)}
            style={{
              background: "#C58A2E",
              color: "#fff",
              border: "none",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("tontine.cancel.approveCta") || "Valider la suppression"}
          </button>
          <button
            type="button"
            onClick={() => void onVote(false)}
            style={{
              background: "transparent",
              color: "#9F4628",
              border: "1px solid #9F4628",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("tontine.cancel.rejectCta") || "Refuser"}
          </button>
        </div>
      )}
      {!canVote && myVote && (
        <div style={{ fontSize: 12, color: "#6B5942", fontStyle: "italic" }}>
          {t("tontine.cancel.alreadyVoted") || "Tu as déjà voté sur cette demande."}
        </div>
      )}
      {isRequester && (
        <div style={{ fontSize: 12, color: "#6B5942", fontStyle: "italic" }}>
          {t("tontine.cancel.adminOnly") ||
            "Ton vote est implicite — en attente des autres membres."}
        </div>
      )}
    </div>
  );
}

function RejectedBanner({
  tontine,
  groupMembers,
  t,
}: {
  tontine: Tontine;
  groupMembers: any[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  // Trouve le 1er membre qui a voté NON (le dernier en date logiquement)
  const refusal = (tontine.cancellationVotes ?? []).find((v) => v.vote === false);
  const refuser = refusal
    ? groupMembers.find((m: any) => (m.user?.id || m.userId) === refusal.userId)
    : null;
  const refuserName = refuser?.user?.displayName || refuser?.displayName || "un membre";

  return (
    <div
      style={{
        background: "rgba(159, 70, 40, 0.06)",
        border: "1px solid rgba(159, 70, 40, 0.20)",
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        fontSize: 13,
        color: "#9F4628",
      }}
    >
      {(t("tontine.cancel.banner.rejected") || "Demande refusée par {{member}}").replace(
        "{{member}}",
        refuserName,
      )}
    </div>
  );
}

// ============================================================
// V219.C — Sheet "Supprimer cette tontine"
// ============================================================

function TontineCancellationSheet({
  tontine,
  loading,
  onClose,
  onSubmit,
  t,
}: {
  tontine: Tontine;
  loading: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [reason, setReason] = useState("");
  // Calcule le nombre de contributions CONFIRMED pour afficher le mode (direct vs vote).
  const confirmedCount = (tontine.turns ?? []).reduce(
    (acc, turn) =>
      acc + (turn.contributions ?? []).filter((c) => c.status === "CONFIRMED").length,
    0,
  );
  const isDirect = confirmedCount === 0;
  const canSubmit = reason.trim().length >= 10 && !loading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43, 31, 21, 0.5)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FAF6EE",
          borderRadius: 16,
          padding: 24,
          maxWidth: 520,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(43,31,21,0.25)",
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#2B1F15", marginBottom: 8 }}>
          {t("tontine.cancel.sheetTitle") || "Supprimer la tontine ?"}
        </h2>
        <p style={{ fontSize: 13, color: "#6B5942", marginBottom: 16 }}>
          {isDirect
            ? t("tontine.cancel.directNote") ||
              "Aucun paiement n'a été reçu — la suppression est immédiate."
            : (
                t("tontine.cancel.voteNote") ||
                "{{count}} paiements ont été reçus — tous les membres doivent valider la suppression."
              ).replace("{{count}}", String(confirmedCount))}
        </p>

        <label
          htmlFor="cancel-reason"
          style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#2B1F15", marginBottom: 6 }}
        >
          {t("tontine.cancel.reasonLabel") || "Raison (visible par tous les membres)"}
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            t("tontine.cancel.reasonPlaceholder") ||
            "Ex : nous n'arrivons plus à nous mettre d'accord sur les dates…"
          }
          rows={4}
          style={{
            width: "100%",
            border: "1px solid rgba(43,31,21,0.15)",
            borderRadius: 8,
            padding: 10,
            fontSize: 14,
            fontFamily: "inherit",
            background: "#fff",
            color: "#2B1F15",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: 11, color: "#6B5942", marginTop: 4, marginBottom: 16 }}>
          {reason.trim().length} / 10 caractères minimum
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              background: "transparent",
              color: "#6B5942",
              border: "1px solid rgba(43,31,21,0.15)",
              padding: "10px 18px",
              borderRadius: 8,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {t("common.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            onClick={() => void onSubmit(reason.trim())}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "#9F4628" : "rgba(159,70,40,0.4)",
              color: "#fff",
              border: "none",
              padding: "10px 18px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {loading
              ? "..."
              : isDirect
                ? t("tontine.cancel.confirmDirect") || "Confirmer la suppression"
                : t("tontine.cancel.confirmRequest") ||
                  "Lancer le vote auprès des membres"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// V230 — Popover d'action au clic sur un siège de la roue
// ============================================================
//
// Quand l'utilisateur clique sur un siège de la roue, on lui propose
// l'action contextuelle correspondante :
//   - Contributeur (non bénéficiaire, contrib PENDING) → « Déclarer mon
//     paiement » (ouvre PaymentDeclarationForm via parent).
//   - Bénéficiaire, paiements PAID en attente → liste « Confirmer reçu ».
//   - Tour DISTRIBUTED → vue read-only.
//
// Le popover est positionné en floating au-dessus de la roue (pas modal
// plein écran) avec borderRadius 14, padding 18, shadow douce, fond cream.

function TurnActionPopover({
  turn,
  myContribution,
  isBeneficiary,
  meId,
  isPinned,
  onClose,
  onDeclarePayment,
  onConfirmReception,
  onMarkTurnAsReceived,
  onPopoverHoverEnter,
  onPopoverHoverLeave,
  t,
  formatAmount,
  currency,
}: {
  turn: Turn;
  myContribution: Contribution | undefined;
  isBeneficiary: boolean;
  meId: string;
  // V233.B — Pinned (sticky on click) + close handler pour bouton ✕.
  isPinned: boolean;
  onClose: () => void;
  onDeclarePayment: () => void;
  onConfirmReception: (contribId: string) => void;
  // V233.C — Bénéficiaire déclare avoir reçu (force CONFIRMED sur toutes les
  // contributions du tour).
  onMarkTurnAsReceived: () => void;
  // V233.B — Mouse enter/leave sur le popover lui-même (anti-flash close).
  onPopoverHoverEnter: () => void;
  onPopoverHoverLeave: () => void;
  t: (k: string, v?: any) => string;
  formatAmount: (a: number | string, c: string) => string;
  currency: string;
}) {
  // V230 — Le popover s'affiche uniquement quand le user a quelque chose à
  // faire OU si c'est le tour courant (IN_PROGRESS). Pour les tours déjà
  // distribués / pour les tours futurs sans action de l'user, on cache.
  const isDone =
    turn.status === "DISTRIBUTED" || turn.status === "CANCELLED";

  // Contributions payées en attente de confirmation (bénéficiaire only).
  const paidPending = (turn.contributions ?? []).filter(
    (c) => c.status === "PAID",
  );

  // Décision : qu'est-ce qu'on montre ?
  // - Read-only si DISTRIBUTED/CANCELLED
  // - Sinon, si je suis contributeur PENDING → action « Déclarer mon paiement »
  // - Sinon, si je suis bénéficiaire avec PAID en attente → liste à confirmer
  // - Sinon, vue informative
  const showDeclareCta =
    !isDone && !isBeneficiary && myContribution?.status === "PENDING";
  const showConfirmList = !isDone && isBeneficiary && paidPending.length > 0;

  // Date affichée : scheduledDate si présente, sinon dueDate.
  const dateIso = turn.scheduledDate || turn.dueDate;
  const periodLabel = new Date(dateIso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // V233.C — Le bénéficiaire peut déclarer "j'ai reçu pour mon tour" si :
  // - tour PENDING/IN_PROGRESS (pas distribué/annulé)
  // - il reste des contributions non CONFIRMED
  const showMarkAsReceivedCta =
    !isDone &&
    isBeneficiary &&
    (turn.contributions ?? []).some((c) => c.status !== "CONFIRMED");

  return (
    <div
      role="dialog"
      aria-label={t("tontine.popover.title") || "Actions du tour"}
      data-tontine-popover="true"
      onMouseEnter={onPopoverHoverEnter}
      onMouseLeave={onPopoverHoverLeave}
      style={{
        position: "absolute",
        top: -6,
        right: -10,
        transform: "translateX(105%)",
        minWidth: 220,
        maxWidth: 280,
        background: "#FAF6EE",
        border: isPinned ? "0.5px solid #C58A2E" : "0.5px solid #D9C8A6",
        borderRadius: 14,
        padding: 18,
        boxShadow: isPinned
          ? "0 20px 50px -16px rgba(43,31,21,0.30)"
          : "0 16px 40px -16px rgba(43,31,21,0.20)",
        zIndex: 5,
        pointerEvents: "auto",
        // V233.B — Animation fade-in 150ms à l'apparition.
        animation: "v233-popover-fade-in 0.15s ease-out",
      }}
    >
      <style>{`@keyframes v233-popover-fade-in { from { opacity: 0; transform: translateX(105%) translateY(-2px); } to { opacity: 1; transform: translateX(105%) translateY(0); } }`}</style>

      {/* V233.B — Header avec date + bouton ✕ (uniquement si pinned). */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: "#8B6F47",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            flex: 1,
          }}
        >
          {t("tontine.popover.turnDate", { date: periodLabel }) ||
            `Tour · ${periodLabel}`}
        </div>
        {isPinned && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("tontine.popover.closePinned") || "Fermer"}
            title={t("tontine.popover.closePinned") || "Fermer"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#8B6F47",
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              marginTop: -2,
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        )}
      </div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 16,
          color: "#2B1F15",
          marginBottom: 10,
          lineHeight: 1.2,
        }}
      >
        {turn.beneficiary.id === meId
          ? t("tontine.popover.yourTurn") || "C'est ton tour"
          : t("tontine.popover.beneficiaryTurn", {
              name: turn.beneficiary.displayName,
            } as any) || `Tour de ${turn.beneficiary.displayName}`}
      </div>

      {/* CTA principal selon contexte */}
      {showDeclareCta && (
        <>
          <div style={{ fontSize: 11, color: "#8B6F47", marginBottom: 8 }}>
            {t("tontine.popover.declareHint") ||
              "Indique comment tu as réglé ta cotisation. Le bénéficiaire confirmera la réception."}
          </div>
          <button
            type="button"
            onClick={onDeclarePayment}
            style={{
              width: "100%",
              padding: "9px 14px",
              background: "#C58A2E",
              color: "#2B1F15",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("tontine.popover.declareCta") || "Déclarer mon paiement"}
          </button>
        </>
      )}

      {showConfirmList && (
        <>
          <div style={{ fontSize: 11, color: "#8B6F47", marginBottom: 8 }}>
            {t("tontine.popover.confirmHint", {
              count: String(paidPending.length),
            } as any) ||
              `${paidPending.length} paiement(s) déclaré(s) en attente de ta confirmation.`}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {paidPending.map((c) => (
              <div
                key={c.id}
                style={{
                  background: "#FFFFFF",
                  border: "0.5px solid #D9C8A6",
                  borderRadius: 8,
                  padding: "6px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#2B1F15", fontWeight: 500 }}>
                    {c.contributor.displayName}
                  </div>
                  <div style={{ fontSize: 10, color: "#8B6F47" }}>
                    {formatAmount(c.amountDue, currency)}
                    {c.paymentMethod ? ` · ${c.paymentMethod}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onConfirmReception(c.id)}
                  title={
                    t("tontine.popover.confirmReceived") || "Confirmer reçu"
                  }
                  style={{
                    padding: "5px 9px",
                    background: "#1F7A57",
                    color: "#FAF6EE",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* V233.C — Bouton "Déclarer avoir reçu mon tour" (bénéficiaire proactif).
          Affiché en plus du showConfirmList : utile pour les tontines en cash
          où aucun contributeur n'a déclaré, le bénéficiaire confirme reception
          globale en 1 clic. */}
      {showMarkAsReceivedCta && (
        <div style={{ marginTop: showConfirmList ? 12 : 0 }}>
          {!showConfirmList && (
            <div style={{ fontSize: 11, color: "#8B6F47", marginBottom: 8 }}>
              {t("tontine.popover.markAsReceivedHint") ||
                "Marque toutes les contributions comme reçues (tontine physique, cash, etc.)."}
            </div>
          )}
          <button
            type="button"
            onClick={onMarkTurnAsReceived}
            style={{
              width: "100%",
              padding: "9px 14px",
              background: "#1F7A57",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("tontine.popover.markAsReceived") || "Déclarer avoir reçu mon tour"}
          </button>
        </div>
      )}

      {!showDeclareCta && !showConfirmList && !showMarkAsReceivedCta && (
        <div
          style={{
            fontSize: 11,
            color: "#8B6F47",
            lineHeight: 1.4,
          }}
        >
          {isDone
            ? t("tontine.popover.doneReadonly") ||
              "Ce tour est terminé. Détail dans le panneau de droite."
            : myContribution?.status === "CONFIRMED"
              ? t("tontine.popover.yourPaymentConfirmed") ||
                "Ta cotisation pour ce tour a déjà été confirmée. Merci !"
              : myContribution?.status === "PAID"
                ? t("tontine.popover.yourPaymentPending") ||
                  "Ta cotisation est déclarée — en attente de confirmation par le bénéficiaire."
                : t("tontine.popover.nothingToDo") ||
                  "Rien à faire de ton côté pour ce tour."}
        </div>
      )}
    </div>
  );
}
