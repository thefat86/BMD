"use client";

/**
 * V149.E — Page détail d'un contrat de reconnaissance de dette.
 *
 * Pièce maîtresse : la ROUE DE REMBOURSEMENT 240px au centre, avec :
 *  - Montant restant à rembourser au centre
 *  - Pastilles cliquables sur chaque échéance
 *  - Couleurs : vert payée, saffron pulsant en cours, gris à venir, terracotta retard
 *
 * En dessous : récap contrat (parties, taux, dates) + échéancier liste.
 */

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../lib/use-breakpoint";
import { useT } from "../../../../lib/i18n/app-strings";
import { api } from "../../../../lib/api-client";
// V170.C — Popups BMD (remplace window.alert/confirm natifs)
import { useDialog } from "../../../../lib/ui/dialog-provider";

// V153.C — Vue détail web premium lazy-loaded (Recharts inclus)
const DesktopDebtDetailView = dynamic(
  () =>
    import("../../../../lib/ui/desktop-debt-detail-view").then(
      (m) => m.DesktopDebtDetailView,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 480,
          background: "rgba(43,31,21,0.04)",
          borderRadius: 14,
        }}
      />
    ),
  },
);
import {
  DebtWheel,
  schedulesToSegments,
} from "../../../../lib/ui/debt-wheel";

interface DebtDetail {
  id: string;
  publicCode: string;
  status: string;
  amount: string;
  currency: string;
  interestRate: string;
  purpose: string | null;
  startDate: string | null;
  endDate: string;
  frequency: string;
  totalInstallments: number;
  signatureLevel: string;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  parties: Array<{
    id: string;
    displayName: string;
    role: string;
    signatureStatus: string;
  }>;
  schedules: Array<{
    id: string;
    sequenceNumber: number;
    dueDate: string;
    expectedAmount: string;
    capitalAmount: string;
    interestAmount: string;
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
    paidAmount: string | null;
    paidAt: string | null;
  }>;
}

export default function DebtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): JSX.Element {
  const { id } = use(params);
  const router = useRouter();
  const t = useT();
  // V170.C — Popups BMD (remplace les natifs)
  const dialog = useDialog();
  const { isMobile } = useBreakpoint();
  const [debt, setDebt] = useState<DebtDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedScheduleIdx, setSelectedScheduleIdx] = useState<number | null>(
    null,
  );
  // V150.A — Workflow négociation : loading + flash success
  // V242 — Étendu pour DELETE (DRAFT) et PREVIEW_PDF.
  const [actionLoading, setActionLoading] = useState<
    null | "PROPOSE" | "ACCEPT" | "REJECT" | "COUNTER" | "DELETE" | "PREVIEW_PDF"
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCounterSheet, setShowCounterSheet] = useState(false);
  const [counterReason, setCounterReason] = useState("");
  // V242 — Preview PDF modal : object URL du PDF en cours de visualisation.
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  // V150.C — Signature électronique qualifiée Yousign : état + handlers
  const [yousignEnabled, setYousignEnabled] = useState(false);
  const [signRequestLoading, setSignRequestLoading] = useState(false);
  const [signRequestError, setSignRequestError] = useState<string | null>(null);

  // V152.H — Paywall signature quand quota épuisé
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallQuote, setPaywallQuote] = useState<{
    level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
    pricing: { priceCents: number; currency: string } | null;
    suggestedPacks: Array<{
      code: string;
      name: string;
      priceCents: number;
      currency: string;
      advancedIncluded: number;
      notarizedIncluded: number;
      durationDays: number;
    }>;
  } | null>(null);
  const [paywallActionLoading, setPaywallActionLoading] = useState<string | null>(
    null,
  );

  useEffect(() => {
    api
      .getYousignStatus()
      .then((r) => setYousignEnabled(r.enabled))
      .catch(() => setYousignEnabled(false));
  }, []);

  async function handleRequestSignature() {
    if (!debt) return;
    // V152.H — Étape 1 : récupère le quote sans consommer
    setSignRequestLoading(true);
    setSignRequestError(null);
    try {
      const quote = await api.getDebtSignQuote(debt.id);
      if (quote.chargeable) {
        // Quota épuisé → ouvre le paywall
        setPaywallQuote({
          level: quote.level,
          pricing: quote.pricing,
          suggestedPacks: quote.suggestedPacks,
        });
        setPaywallOpen(true);
      } else {
        // Quota OK → confirm et déclenche
        const confirmed = await dialog.confirm(
          t("debts.sign.confirm") ||
            "Déclencher la signature électronique ? Chaque partie recevra un email pour signer.",
          { title: t("debts.sign.confirmTitle") || "Signature électronique" },
        );
        if (!confirmed) return;
        await api.requestDebtSignature(debt.id);
        await refresh();
      }
    } catch (e) {
      setSignRequestError((e as Error).message);
    } finally {
      setSignRequestLoading(false);
    }
  }

  /** Achète une signature à l'unité via Stripe (mode mock auto en dev). */
  async function handleBuySignatureUnit() {
    if (!debt || !paywallQuote) return;
    setPaywallActionLoading("unit");
    try {
      const intent = await api.createSignCheckoutIntent(debt.id);
      // Mode mock dev → confirme direct
      if (intent.mock) {
        const piId = intent.clientSecret.split("_secret")[0]!;
        await api.confirmSignCharge(debt.id, {
          stripePaymentIntentId: piId,
          level: paywallQuote.level,
        });
        // Maintenant on peut re-déclencher la requête signature (quota dispo via SignatureCharge PAID)
        await api.requestDebtSignature(debt.id);
        await refresh();
        setPaywallOpen(false);
        await dialog.alert(
          t("debts.paywall.devSuccess") ||
            "Paiement simulé (mode dev). Stripe sera demandé en prod.",
          { title: t("debts.paywall.devSuccessTitle") || "Mode dev" },
        );
      } else {
        // Prod Stripe → redirige vers la page checkout dédiée
        sessionStorage.setItem(
          "signatureCheckout",
          JSON.stringify({
            debtId: debt.id,
            level: paywallQuote.level,
            clientSecret: intent.clientSecret,
            amount: intent.amount,
            currency: intent.currency,
          }),
        );
        window.location.href = `/dashboard/debts/${debt.id}/checkout-signature`;
      }
    } catch (e) {
      setSignRequestError((e as Error).message);
    } finally {
      setPaywallActionLoading(null);
    }
  }

  /** Achète un Pack Booster RDD (Sérénité ou Affaires). */
  async function handleBuyPack(packCode: "SIGN_PACK_SERENITY" | "SIGN_PACK_AFFAIRS") {
    setPaywallActionLoading(packCode);
    try {
      const intent = await api.createDebtBoosterCheckoutIntent(packCode);
      if (intent.mock) {
        const piId = intent.clientSecret.split("_secret")[0]!;
        await api.confirmDebtBoosterPurchase({
          packCode,
          stripePaymentIntentId: piId,
        });
        // Re-tente la signature (devrait consommer le pack)
        if (debt) await api.requestDebtSignature(debt.id);
        await refresh();
        setPaywallOpen(false);
        await dialog.alert(
          t("debts.paywall.packDevSuccess") ||
            "Pack activé (mode dev). Signature relancée.",
          { title: t("debts.paywall.packDevSuccessTitle") || "Pack activé" },
        );
      } else {
        sessionStorage.setItem(
          "debtBoosterCheckout",
          JSON.stringify({
            packCode,
            clientSecret: intent.clientSecret,
            amount: intent.amount,
            currency: intent.currency,
            returnTo: debt ? `/dashboard/debts/${debt.id}` : "/dashboard/plans",
          }),
        );
        window.location.href = `/dashboard/plans/checkout-debt-booster?pack=${packCode}`;
      }
    } catch (e) {
      setSignRequestError((e as Error).message);
    } finally {
      setPaywallActionLoading(null);
    }
  }

  // V150.D — Médiation / litige : sheet signalement + state résolution
  const [showDisputeSheet, setShowDisputeSheet] = useState(false);
  const [disputeCategory, setDisputeCategory] = useState<
    "NON_PAYMENT" | "WRONG_AMOUNT" | "BAD_FAITH" | "FORCED_AGREEMENT" | "OTHER"
  >("NON_PAYMENT");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  async function handleSubmitDispute() {
    if (!debt) return;
    const reason = disputeReason.trim();
    if (reason.length < 10) {
      setDisputeError(
        t("debts.dispute.errorTooShort") ||
          "Décris la situation en au moins 10 caractères.",
      );
      return;
    }
    setDisputeLoading(true);
    setDisputeError(null);
    try {
      await api.disputeDebt(debt.id, {
        category: disputeCategory,
        reason,
      });
      setShowDisputeSheet(false);
      setDisputeReason("");
      setDisputeCategory("NON_PAYMENT");
      await refresh();
    } catch (e) {
      setDisputeError((e as Error).message);
    } finally {
      setDisputeLoading(false);
    }
  }

  async function handleResolveDispute() {
    if (!debt) return;
    const confirmed = await dialog.confirm(
      t("debts.dispute.resolveConfirm") ||
        "Marquer le litige comme résolu amiablement ? Le contrat reprendra son cours normal.",
      {
        title: t("debts.dispute.resolveTitle") || "Résoudre le litige",
        variant: "default",
      },
    );
    if (!confirmed) return;
    setResolveLoading(true);
    setResolveError(null);
    try {
      await api.resolveDebtDispute(debt.id, {});
      await refresh();
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolveLoading(false);
    }
  }

  // V150.B — Témoins & garants : sheet d'invitation + state
  const [showPartySheet, setShowPartySheet] = useState<
    null | "WITNESS" | "GUARANTOR"
  >(null);
  const [partyContact, setPartyContact] = useState("");
  const [partyDisplayName, setPartyDisplayName] = useState("");
  const [partyCoverage, setPartyCoverage] = useState("100");
  const [partyTriggerDays, setPartyTriggerDays] = useState("30");
  const [partyLoading, setPartyLoading] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);

  // V170.E — Lookup BMD pour témoin/garant (debounced)
  const [partyMatchedUserId, setPartyMatchedUserId] = useState<string | null>(
    null,
  );
  const [partyLookupLoading, setPartyLookupLoading] = useState(false);
  const [partyManualOverride, setPartyManualOverride] = useState(false);

  function openPartySheet(role: "WITNESS" | "GUARANTOR") {
    setPartyContact("");
    setPartyDisplayName("");
    setPartyCoverage("100");
    setPartyTriggerDays("30");
    setPartyError(null);
    setPartyMatchedUserId(null);
    setPartyManualOverride(false);
    setShowPartySheet(role);
  }

  // V170.E — Debounced lookup BMD sur le contact saisi (600ms)
  useEffect(() => {
    if (!showPartySheet) return;
    const contact = partyContact.trim();
    if (contact.length < 3) {
      setPartyMatchedUserId(null);
      return;
    }
    setPartyLookupLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await api.lookupUserByContact(contact);
        if (r.found) {
          setPartyMatchedUserId(r.userId);
          // Auto-fill seulement si l'utilisateur n'a pas tapé manuellement
          if (!partyManualOverride) {
            setPartyDisplayName(r.displayName);
          }
        } else {
          setPartyMatchedUserId(null);
        }
      } catch {
        setPartyMatchedUserId(null);
      } finally {
        setPartyLookupLoading(false);
      }
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyContact, showPartySheet]);

  async function handleAddParty() {
    if (!debt || !showPartySheet) return;
    const name = partyDisplayName.trim();
    const contact = partyContact.trim();
    if (!name) {
      setPartyError(t("debts.parties.errorName") || "Nom obligatoire");
      return;
    }
    if (!contact) {
      setPartyError(
        t("debts.parties.errorContact") ||
          "Téléphone ou email obligatoire",
      );
      return;
    }
    setPartyLoading(true);
    setPartyError(null);
    try {
      const body: Parameters<typeof api.addDebtParty>[1] = {
        role: showPartySheet,
        displayName: name,
        // V170.E — Si lookup BMD a trouvé un user, on l'attache via userId
        ...(partyMatchedUserId
          ? { userId: partyMatchedUserId }
          : { inviteContact: contact }),
      };
      if (showPartySheet === "GUARANTOR") {
        const cov = parseFloat(partyCoverage);
        const dly = parseInt(partyTriggerDays, 10);
        if (!isFinite(cov) || cov <= 0 || cov > 100) {
          setPartyError(
            t("debts.parties.errorCoverage") ||
              "Couverture entre 1 et 100",
          );
          setPartyLoading(false);
          return;
        }
        if (!isFinite(dly) || dly < 0 || dly > 365) {
          setPartyError(
            t("debts.parties.errorTrigger") ||
              "Délai entre 0 et 365 jours",
          );
          setPartyLoading(false);
          return;
        }
        body.guarantorCoverage = cov;
        body.guarantorTriggerDays = dly;
      }
      await api.addDebtParty(debt.id, body);
      setShowPartySheet(null);
      await refresh();
    } catch (e) {
      setPartyError((e as Error).message);
    } finally {
      setPartyLoading(false);
    }
  }

  async function handleRemoveParty(partyId: string, partyName: string) {
    if (!debt) return;
    const confirmed = await dialog.confirm(
      (t("debts.parties.removeConfirm") ||
        "Retirer {name} de ce contrat ?").replace("{name}", partyName),
      {
        title: t("debts.parties.removeTitle") || "Retirer la partie",
        variant: "danger",
      },
    );
    if (!confirmed) return;
    try {
      await api.removeDebtParty(debt.id, partyId);
      await refresh();
    } catch (e) {
      await dialog.alert((e as Error).message, {
        title: t("common.error") || "Erreur",
        variant: "danger",
      });
    }
  }

  useEffect(() => {
    api
      .getDebt(id)
      .then((r) => setDebt(r as DebtDetail))
      .catch((e) => setError((e as Error).message));
  }, [id]);

  // V150.A — Helper : recharge le contrat après une action workflow.
  async function refresh() {
    try {
      const r = await api.getDebt(id);
      setDebt(r as DebtDetail);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // V170.D — Déclaration de paiement (sheet réutilisable)
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"DECLARE" | "RECEIVE">(
    "DECLARE",
  );
  const [paymentSchedule, setPaymentSchedule] = useState<
    DebtDetail["schedules"][number] | null
  >(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "TRANSFER" | "MOBILE_MONEY" | "OTHER"
  >("TRANSFER");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [confirmingScheduleId, setConfirmingScheduleId] = useState<
    string | null
  >(null);

  function openPaymentSheet(
    schedule: DebtDetail["schedules"][number],
    mode: "DECLARE" | "RECEIVE",
  ) {
    setPaymentSchedule(schedule);
    setPaymentMode(mode);
    setPaymentAmount(parseFloat(schedule.expectedAmount).toFixed(2));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("TRANSFER");
    setPaymentNotes("");
    setPaymentError(null);
    setPaymentSheetOpen(true);
  }

  async function handleSubmitPayment() {
    if (!debt || !paymentSchedule) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const amountNum = parseFloat(paymentAmount.replace(",", "."));
      if (!isFinite(amountNum) || amountNum <= 0) {
        throw new Error(
          t("debts.payment.invalidAmount") || "Montant invalide",
        );
      }
      const paidAtIso = new Date(
        `${paymentDate}T12:00:00`,
      ).toISOString();
      if (paymentMode === "RECEIVE") {
        await api.markDebtScheduleAsPaid(debt.id, paymentSchedule.id, {
          amount: amountNum,
          paidAt: paidAtIso,
          method: paymentMethod,
          notes: paymentNotes.trim() || undefined,
        });
      } else {
        await api.declareDebtSchedulePayment(debt.id, paymentSchedule.id, {
          amount: amountNum,
          paidAt: paidAtIso,
          method: paymentMethod,
          notes: paymentNotes.trim() || undefined,
        });
      }
      await refresh();
      setPaymentSheetOpen(false);
      setSelectedScheduleIdx(null);
    } catch (e) {
      setPaymentError((e as Error).message);
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleConfirmDeclaredPayment(
    schedule: DebtDetail["schedules"][number],
  ) {
    if (!debt) return;
    const confirmed = await dialog.confirm(
      t("debts.payment.confirmReceiveMsg") ||
        `Confirmer avoir reçu ce paiement de ${parseFloat(schedule.paidAmount || schedule.expectedAmount).toFixed(2)} ${debt.currency} ?`,
      {
        title: t("debts.payment.confirmReceiveTitle") || "Confirmer réception",
      },
    );
    if (!confirmed) return;
    setConfirmingScheduleId(schedule.id);
    try {
      await api.confirmDebtSchedulePayment(debt.id, schedule.id);
      await refresh();
      setSelectedScheduleIdx(null);
    } catch (e) {
      await dialog.alert((e as Error).message, {
        title: t("common.error") || "Erreur",
      });
    } finally {
      setConfirmingScheduleId(null);
    }
  }

  async function handlePropose() {
    if (!debt) return;
    const confirmed = await dialog.confirm(
      t("debts.actions.proposeConfirm") ||
        "Envoyer ce contrat au débiteur pour signature ? Il aura 7 jours pour répondre.",
      { title: t("debts.actions.proposeTitle") || "Envoyer au débiteur" },
    );
    if (!confirmed) return;
    setActionLoading("PROPOSE");
    setActionError(null);
    try {
      await api.proposeDebt(debt.id);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  // V242 — Suppression définitive d'une RDD en DRAFT.
  // Backend gating : statut DRAFT + créateur uniquement. Le bouton
  // n'apparaît dans l'UI que sous ces conditions, mais on redouble côté
  // backend pour la sécurité.
  async function handleDelete() {
    if (!debt) return;
    const confirmed = await dialog.confirm(
      t("debtV242.delete.confirmBody") ||
        "Supprimer définitivement ce brouillon de reconnaissance de dette ? Cette action est irréversible.",
      {
        title: t("debtV242.delete.confirmTitle") || "Supprimer ce brouillon",
        variant: "danger",
        confirmLabel: t("common.delete") || "Supprimer",
      },
    );
    if (!confirmed) return;
    setActionLoading("DELETE");
    setActionError(null);
    try {
      await api.deleteDebt(debt.id);
      // Pas de refresh : on quitte la page vers la liste des RDD.
      router.replace("/dashboard/debts");
    } catch (e) {
      setActionError((e as Error).message);
      setActionLoading(null);
    }
  }

  // V242 — Récupère le PDF d'aperçu (mode contract) et l'affiche en
  // iframe inline. Le caller révoque l'object URL à la fermeture pour
  // éviter les fuites mémoire.
  async function handlePreviewPdf() {
    if (!debt) return;
    // Cleanup d'un éventuel ancien URL avant d'en demander un nouveau
    if (previewPdfUrl) {
      try {
        URL.revokeObjectURL(previewPdfUrl);
      } catch {
        /* noop */
      }
      setPreviewPdfUrl(null);
    }
    setActionLoading("PREVIEW_PDF");
    setActionError(null);
    try {
      const url = await api.fetchDebtContractPreviewUrl(debt.id);
      setPreviewPdfUrl(url);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  function closePdfPreview() {
    if (previewPdfUrl) {
      try {
        URL.revokeObjectURL(previewPdfUrl);
      } catch {
        /* noop */
      }
    }
    setPreviewPdfUrl(null);
  }

  async function handleAccept() {
    if (!debt) return;
    const confirmed = await dialog.confirm(
      t("debts.actions.acceptConfirm") ||
        "Accepter ce contrat ? Tu reconnais devoir ce montant selon les conditions du contrat.",
      { title: t("debts.actions.acceptTitle") || "Accepter le contrat" },
    );
    if (!confirmed) return;
    setActionLoading("ACCEPT");
    setActionError(null);
    try {
      await api.respondToDebt(debt.id, { action: "ACCEPT" });
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject() {
    if (!debt) return;
    const confirmed = await dialog.confirm(
      t("debts.actions.rejectConfirm") ||
        "Refuser ce contrat ? Il sera définitivement annulé.",
      {
        title: t("debts.actions.rejectTitle") || "Refuser le contrat",
        variant: "danger",
      },
    );
    if (!confirmed) return;
    setActionLoading("REJECT");
    setActionError(null);
    try {
      await api.respondToDebt(debt.id, { action: "REJECT" });
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCounter() {
    if (!debt || !counterReason.trim()) return;
    setActionLoading("COUNTER");
    setActionError(null);
    try {
      await api.respondToDebt(debt.id, {
        action: "COUNTER",
        counterProposal: { reason: counterReason.trim() },
      });
      setShowCounterSheet(false);
      setCounterReason("");
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  if (error) {
    return (
      <ResponsiveShell
        breadcrumb="Erreur"
        desktopTitle="Contrat introuvable"
        mobileTitle="Erreur"
        back={{ href: "/dashboard/debts" }}
      >
        <div style={{ textAlign: "center", padding: 40, color: "#9F4628" }}>
          {error}
        </div>
      </ResponsiveShell>
    );
  }

  if (!debt) {
    return (
      <ResponsiveShell
        breadcrumb={t("debts.breadcrumb") || "Reconnaissances"}
        desktopTitle={t("common.loading") || "Chargement…"}
        mobileTitle={t("common.loading") || "Chargement…"}
        back={{ href: "/dashboard/debts" }}
      >
        <div style={{ textAlign: "center", padding: 40, color: "#6B5A47" }}>
          {t("common.loading") || "Chargement…"}
        </div>
      </ResponsiveShell>
    );
  }

  const segments = schedulesToSegments(debt.schedules);
  const paid = debt.schedules
    .filter((s) => s.status === "PAID" || s.status === "CONFIRMED")
    .reduce((sum, s) => sum + parseFloat(s.paidAmount ?? s.expectedAmount), 0);
  const totalExpected = debt.schedules.reduce(
    (sum, s) => sum + parseFloat(s.expectedAmount),
    0,
  );
  const remaining = Math.max(0, totalExpected - paid);
  const nextSchedule = debt.schedules.find(
    (s) => s.status === "PENDING" || s.status === "LATE",
  );
  const otherParty = debt.parties.find(
    (p) =>
      p.role !== debt.myRole &&
      (p.role === "CREDITOR" || p.role === "DEBTOR"),
  );
  const isCreditor = debt.myRole === "CREDITOR";

  return (
    <ResponsiveShell
      breadcrumb={t("debts.breadcrumb") || "Reconnaissances"}
      desktopTitle={`Contrat · ${otherParty?.displayName ?? ""}`}
      mobileTitle={otherParty?.displayName ?? "Contrat"}
      back={{ href: "/dashboard/debts" }}
    >
      {!isMobile ? (
        <DesktopDebtDetailView
          debt={debt as any}
          primaryActions={
            <>
              {/* V242 — Aperçu PDF avant envoi (DRAFT/PROPOSED/NEGOTIATING). */}
              {(debt.status === "DRAFT" ||
                debt.status === "PROPOSED" ||
                debt.status === "NEGOTIATING") &&
                debt.myRole === "CREDITOR" && (
                  <ActionButton
                    variant="secondary"
                    onClick={handlePreviewPdf}
                    loading={actionLoading === "PREVIEW_PDF"}
                    label={t("debtV242.preview.cta") || "Aperçu PDF"}
                    loadingLabel={t("debtV242.preview.loading") || "Génération…"}
                  />
                )}
              {/* DRAFT créateur — proposer aux parties */}
              {debt.status === "DRAFT" &&
                debt.myRole === "CREDITOR" && (
                  <ActionButton
                    variant="primary"
                    onClick={handlePropose}
                    loading={actionLoading === "PROPOSE"}
                    label={t("debts.detail.proposeCta") || "Proposer aux parties"}
                    loadingLabel={t("debts.detail.proposing") || "Envoi…"}
                  />
                )}
              {/* V242 — DRAFT créateur — Supprimer définitivement */}
              {debt.status === "DRAFT" &&
                debt.myRole === "CREDITOR" && (
                  <ActionButton
                    variant="ghost"
                    onClick={handleDelete}
                    loading={actionLoading === "DELETE"}
                    label={t("debtV242.delete.cta") || "Supprimer le brouillon"}
                    loadingLabel={t("debtV242.delete.loading") || "Suppression…"}
                  />
                )}
              {/* PROPOSED cible — accepter / refuser / contre-proposer */}
              {debt.status === "PROPOSED" &&
                (debt.myRole === "DEBTOR" ||
                  debt.myRole === "WITNESS" ||
                  debt.myRole === "GUARANTOR") && (
                  <>
                    <ActionButton
                      variant="primary"
                      onClick={handleAccept}
                      loading={actionLoading === "ACCEPT"}
                      label={t("debts.detail.acceptCta") || "Accepter"}
                      loadingLabel={t("debts.detail.accepting") || "Acceptation…"}
                    />
                    <ActionButton
                      variant="secondary"
                      onClick={() => setShowCounterSheet(true)}
                      label={
                        t("debts.detail.counterCta") || "Contre-proposer"
                      }
                    />
                    <ActionButton
                      variant="ghost"
                      onClick={handleReject}
                      loading={actionLoading === "REJECT"}
                      label={t("debts.detail.rejectCta") || "Refuser"}
                      loadingLabel={t("debts.detail.rejecting") || "Refus…"}
                    />
                  </>
                )}
              {/* SIGNED/ACTIVE — demander signature qualifiée Yousign */}
              {(debt.status === "DRAFT" ||
                debt.status === "PROPOSED" ||
                debt.status === "SIGNED" ||
                debt.status === "ACTIVE") &&
                yousignEnabled && (
                  <ActionButton
                    variant="primary"
                    onClick={handleRequestSignature}
                    loading={signRequestLoading}
                    label={
                      t("debts.detail.requestSignature") ||
                      "Demander signature"
                    }
                    loadingLabel={t("debts.detail.requestingSig") || "Demande…"}
                  />
                )}
              {/* COMPLETED — télécharger certificat PDF */}
              {debt.status === "COMPLETED" && (
                <a
                  href={`/api/debts/${debt.id}/certificate`}
                  target="_blank"
                  rel="noopener"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 22px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 10,
                    background:
                      "linear-gradient(135deg, #1F7A57, #0F6E56)",
                    color: "#FBF6EC",
                    textDecoration: "none",
                    boxShadow: "0 4px 12px rgba(15,110,86,0.25)",
                  }}
                >
                  {t("debts.detail.downloadCertificate") ||
                    "Télécharger certificat"}
                </a>
              )}
            </>
          }
          secondaryActions={
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {/* Inviter témoin (sauf si terminé/litige) */}
              {debt.status !== "COMPLETED" &&
                debt.status !== "CANCELLED" &&
                debt.status !== "EXPIRED" && (
                  <SecondaryActionRow
                    icon="👁"
                    label={
                      t("debts.detail.inviteWitnessCta") || "Inviter un témoin"
                    }
                    hint={
                      t("debts.detail.inviteWitnessHint") ||
                      "Personne qui certifie avoir assisté à l'accord"
                    }
                    onClick={() => openPartySheet("WITNESS")}
                  />
                )}
              {/* Inviter garant (créditor seulement, sauf terminé) */}
              {debt.status !== "COMPLETED" &&
                debt.status !== "CANCELLED" &&
                debt.status !== "EXPIRED" &&
                debt.myRole === "CREDITOR" && (
                  <SecondaryActionRow
                    icon="🛡"
                    label={
                      t("debts.detail.inviteGuarantorCta") || "Inviter un garant"
                    }
                    hint={
                      t("debts.detail.inviteGuarantorHint") ||
                      "S'engage à payer en cas de défaillance du débiteur"
                    }
                    onClick={() => openPartySheet("GUARANTOR")}
                  />
                )}
              {/* Signaler litige (uniquement si ACTIVE/LATE) */}
              {(debt.status === "ACTIVE" ||
                debt.status === "SIGNED" ||
                debt.status === "LATE") && (
                <SecondaryActionRow
                  icon="⚠"
                  label={
                    t("debts.detail.disputeCta") || "Signaler un litige"
                  }
                  hint={
                    t("debts.detail.disputeHint") ||
                    "Demander une médiation par BMD"
                  }
                  onClick={() => setShowDisputeSheet(true)}
                  accent="#9F4628"
                />
              )}
              {/* Résoudre litige (si DISPUTED + créancier) */}
              {debt.status === "DISPUTED" && debt.myRole === "CREDITOR" && (
                <SecondaryActionRow
                  icon="✓"
                  label={
                    t("debts.detail.resolveDisputeCta") || "Résoudre le litige"
                  }
                  hint={
                    t("debts.detail.resolveDisputeHint") ||
                    "Marquer le différend comme réglé"
                  }
                  onClick={handleResolveDispute}
                  accent="#1F7A57"
                />
              )}
              {/* Télécharger certificat (toujours dispo si COMPLETED dans actions secondaires aussi) */}
              {debt.status === "COMPLETED" && (
                <SecondaryActionRow
                  icon="📄"
                  label={
                    t("debts.detail.downloadCertificate") ||
                    "Télécharger certificat"
                  }
                  hint={
                    t("debts.detail.certificateHint") ||
                    "PDF officiel signé BMD à conserver"
                  }
                  onClick={() => {
                    window.open(
                      `/api/debts/${debt.id}/certificate`,
                      "_blank",
                    );
                  }}
                  accent="#0F6E56"
                />
              )}
            </div>
          }
        />
      ) : (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 4px" }}>
        {/* === Status badge === */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: "inline-block",
              background:
                debt.status === "ACTIVE" || debt.status === "SIGNED"
                  ? "rgba(31,122,87,0.18)"
                  : debt.status === "CANCELLED"
                    ? "rgba(159,70,40,0.18)"
                    : "rgba(197,138,46,0.18)",
              color:
                debt.status === "ACTIVE" || debt.status === "SIGNED"
                  ? "#0F6E56"
                  : debt.status === "CANCELLED"
                    ? "#9F4628"
                    : "#854F0B",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            {t(`debts.status.${debt.status}`) || debt.status}
          </span>
        </div>

        {/* === V150.E — Certificat soldé (visible uniquement si COMPLETED) === */}
        {debt.status === "COMPLETED" && (
          <DebtCertificateCard
            debtId={debt.id}
            publicCode={debt.publicCode}
            t={t}
          />
        )}

        {/* === V150.D — Bandeau litige actif === */}
        {debt.status === "DISPUTED" && (
          <DebtDisputeBanner
            myRole={debt.myRole}
            onResolve={handleResolveDispute}
            loading={resolveLoading}
            error={resolveError}
            t={t}
          />
        )}

        {/* === V150.A — Bannière d'action selon statut + role === */}
        <DebtActionBanner
          status={debt.status}
          myRole={debt.myRole}
          loading={actionLoading}
          error={actionError}
          onPropose={handlePropose}
          onAccept={handleAccept}
          onReject={handleReject}
          onCounter={() => setShowCounterSheet(true)}
          t={t}
        />

        {/* === ROUE DE REMBOURSEMENT === */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "12px 0 8px",
          }}
        >
          <DebtWheel
            segments={segments}
            size={240}
            centerCaption={t("debts.remainingLabel") || "Reste à rembourser"}
            centerLabel={`${remaining.toFixed(0)} ${debt.currency === "EUR" ? "€" : debt.currency}`}
            centerSubLabel={`sur ${totalExpected.toFixed(0)} ${debt.currency === "EUR" ? "€" : debt.currency}`}
            onSegmentTap={(i) => setSelectedScheduleIdx(i)}
          />
        </div>

        {/* === Légende === */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 14,
            fontSize: 10,
            color: "#6B5A47",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, background: "#1F7A57", borderRadius: 2 }}></span>
            {t("debts.legendPaid") || "Payée"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, background: "#C58A2E", borderRadius: 2 }}></span>
            {t("debts.legendCurrent") || "En cours"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                background: "rgba(43,31,21,0.18)",
                borderRadius: 2,
              }}
            ></span>
            {t("debts.legendUpcoming") || "À venir"}
          </span>
        </div>

        {/* === Récap contrat === */}
        <div
          style={{
            background: "#FFFFFF",
            border: "0.5px solid rgba(43,31,21,0.12)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <Row label={t("debts.amountLabel") || "Montant"}>
            <span className="bmd-num" style={{ fontWeight: 600 }}>
              {parseFloat(debt.amount).toFixed(2)} {debt.currency === "EUR" ? "€" : debt.currency}
            </span>
          </Row>
          <Row
            label={
              isCreditor
                ? t("debts.debtorLabel") || "Débiteur"
                : t("debts.creditorLabel") || "Créancier"
            }
          >
            <span>{otherParty?.displayName ?? "—"}</span>
          </Row>
          <Row label={t("debts.interestLabel") || "Taux"}>
            <span className="bmd-num">
              {parseFloat(debt.interestRate).toFixed(1)} %/an
            </span>
          </Row>
          <Row label={t("debts.endDateLabel") || "Échéance"}>
            <span>{new Date(debt.endDate).toLocaleDateString("fr-FR")}</span>
          </Row>
          <Row label={t("debts.frequencyLabel") || "Fréquence"}>
            <span>{debt.frequency}</span>
          </Row>
          {debt.purpose && (
            <Row label={t("debts.purposeLabel") || "Objet"}>
              <span style={{ fontStyle: "italic" }}>{debt.purpose}</span>
            </Row>
          )}
        </div>

        {/* === V150.C — Card "Signature électronique qualifiée" === */}
        {debt.myRole === "CREDITOR" &&
          ["PROPOSED", "ACCEPTED", "NEGOTIATING"].includes(debt.status) && (
            <DebtSignatureCard
              enabled={yousignEnabled}
              loading={signRequestLoading}
              error={signRequestError}
              onRequest={handleRequestSignature}
              t={t}
            />
          )}

        {/* === V150.D — Bouton "Signaler un litige" (discret) === */}
        {(debt.status === "SIGNED" ||
          debt.status === "ACTIVE" ||
          debt.status === "NEGOTIATING") &&
          (debt.myRole === "CREDITOR" || debt.myRole === "DEBTOR") && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setDisputeError(null);
                  setShowDisputeSheet(true);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: "1px solid rgba(159,70,40,0.32)",
                  background: "transparent",
                  color: "#9F4628",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {t("debts.dispute.openButton") || "Signaler un litige"}
              </button>
            </div>
          )}

        {/* === V150.B — Témoins & garants === */}
        <DebtPartiesSection
          parties={debt.parties}
          myRole={debt.myRole}
          status={debt.status}
          onInviteWitness={() => openPartySheet("WITNESS")}
          onInviteGuarantor={() => openPartySheet("GUARANTOR")}
          onRemove={handleRemoveParty}
          t={t}
        />

        {/* === Échéancier === */}
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#6B5A47",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {t("debts.scheduleListTitle") || "Échéancier"}
        </div>
        <div
          style={{
            background: "#FFFFFF",
            border: "0.5px solid rgba(43,31,21,0.12)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {debt.schedules.map((s, i) => {
            // V172.B — Affichage contextuel selon rôle de l'user vs statut.
            const visual = scheduleVisual(s.status, debt.myRole, t, s.paidAt);
            const isCurrent =
              i === segments.findIndex((seg) => seg === "current");
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedScheduleIdx(i)}
                style={{
                  width: "100%",
                  padding: "11px 13px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background:
                    visual.bg ??
                    (isCurrent ? "rgba(197,138,46,0.08)" : "transparent"),
                  border: "none",
                  borderBottom:
                    i < debt.schedules.length - 1
                      ? "0.5px solid rgba(43,31,21,0.08)"
                      : "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ fontSize: 18, color: visual.iconColor }}>
                  {visual.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    {new Date(s.dueDate).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                    })}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: visual.labelColor ?? "#6B5A47",
                      fontWeight: visual.bold ? 600 : 400,
                    }}
                  >
                    {visual.label ??
                      (isCurrent
                        ? t("debts.dueNow") || "À venir"
                        : `${t("debts.installmentN") || "Échéance"} ${s.sequenceNumber}`)}
                  </div>
                </div>
                <span className="bmd-num" style={{ fontSize: 13 }}>
                  {parseFloat(s.expectedAmount).toFixed(0)}{" "}
                  {debt.currency === "EUR" ? "€" : debt.currency}
                </span>
              </button>
            );
          })}
        </div>

        {/* === V170.D — CTA Débiteur : déclarer un paiement effectué === */}
        {debt.myRole === "DEBTOR" &&
          (debt.status === "ACTIVE" ||
            debt.status === "SIGNED" ||
            debt.status === "IN_PROGRESS") &&
          nextSchedule && (
            <button
              type="button"
              onClick={() => openPaymentSheet(nextSchedule, "DECLARE")}
              style={{
                width: "100%",
                background: "#1F7A57",
                color: "#FBF6EC",
                border: "none",
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                marginTop: 14,
              }}
            >
              {t("debts.payment.declareCta") || "J'ai payé cette échéance"} ·{" "}
              {parseFloat(nextSchedule.expectedAmount).toFixed(0)}{" "}
              {debt.currency === "EUR" ? "€" : debt.currency}
            </button>
          )}

        {/* === V170.D — CTA Créancier : marquer un paiement reçu === */}
        {debt.myRole === "CREDITOR" &&
          (debt.status === "ACTIVE" ||
            debt.status === "SIGNED" ||
            debt.status === "IN_PROGRESS") &&
          nextSchedule && (
            <button
              type="button"
              onClick={() => openPaymentSheet(nextSchedule, "RECEIVE")}
              style={{
                width: "100%",
                background: "#C58A2E",
                color: "#FBF6EC",
                border: "none",
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                marginTop: 14,
              }}
            >
              {t("debts.payment.receiveCta") || "J'ai reçu cette échéance"} ·{" "}
              {parseFloat(nextSchedule.expectedAmount).toFixed(0)}{" "}
              {debt.currency === "EUR" ? "€" : debt.currency}
            </button>
          )}

        {/* Sheet détail échéance — réutilise alert simple pour MVP */}
        {selectedScheduleIdx !== null &&
          debt.schedules[selectedScheduleIdx] && (
            <div
              role="dialog"
              aria-modal="true"
              onClick={() => setSelectedScheduleIdx(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(14,11,20,0.55)",
                zIndex: 60,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: 480,
                  background: "#FBF6EC",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: "16px 18px calc(24px + env(safe-area-inset-bottom, 0))",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 999,
                    background: "rgba(43,31,21,0.18)",
                    margin: "0 auto 14px",
                  }}
                />
                <div
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 22,
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  {t("debts.installmentN") || "Échéance"}{" "}
                  {debt.schedules[selectedScheduleIdx]!.sequenceNumber} / {debt.totalInstallments}
                </div>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    color: "#6B5A47",
                    marginTop: 4,
                    marginBottom: 14,
                  }}
                >
                  {new Date(
                    debt.schedules[selectedScheduleIdx]!.dueDate,
                  ).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "0.5px solid rgba(43,31,21,0.12)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <Row label={t("debts.capitalLabel") || "Capital"}>
                    <span className="bmd-num">
                      {parseFloat(
                        debt.schedules[selectedScheduleIdx]!.capitalAmount,
                      ).toFixed(2)}{" "}
                      €
                    </span>
                  </Row>
                  <Row label={t("debts.interestLabel") || "Intérêt"}>
                    <span className="bmd-num">
                      {parseFloat(
                        debt.schedules[selectedScheduleIdx]!.interestAmount,
                      ).toFixed(2)}{" "}
                      €
                    </span>
                  </Row>
                  <Row label={t("debts.totalLabel") || "Total à payer"}>
                    <span
                      className="bmd-num"
                      style={{ fontWeight: 700, color: "#C58A2E" }}
                    >
                      {parseFloat(
                        debt.schedules[selectedScheduleIdx]!.expectedAmount,
                      ).toFixed(2)}{" "}
                      €
                    </span>
                  </Row>
                </div>

                {/* V170.D — Actions contextuelles selon rôle + statut de l'échéance */}
                {(() => {
                  const s = debt.schedules[selectedScheduleIdx]!;
                  const status = s.status;
                  const isCreditor = debt.myRole === "CREDITOR";
                  const isDebtor = debt.myRole === "DEBTOR";
                  const isActiveDebt =
                    debt.status === "ACTIVE" ||
                    debt.status === "SIGNED" ||
                    debt.status === "IN_PROGRESS";

                  if (!isActiveDebt) return null;

                  // Statut PENDING/LATE : créancier "j'ai reçu" OU débiteur "j'ai payé"
                  if (status === "PENDING" || status === "LATE") {
                    return (
                      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                        {isCreditor && (
                          <button
                            type="button"
                            onClick={() => openPaymentSheet(s, "RECEIVE")}
                            style={{
                              width: "100%",
                              background: "#C58A2E",
                              color: "#FBF6EC",
                              border: "none",
                              borderRadius: 10,
                              padding: 11,
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {t("debts.payment.receiveAction") ||
                              "J'ai reçu ce paiement"}
                          </button>
                        )}
                        {isDebtor && (
                          <button
                            type="button"
                            onClick={() => openPaymentSheet(s, "DECLARE")}
                            style={{
                              width: "100%",
                              background: "#1F7A57",
                              color: "#FBF6EC",
                              border: "none",
                              borderRadius: 10,
                              padding: 11,
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {t("debts.payment.declareAction") ||
                              "J'ai payé cette échéance"}
                          </button>
                        )}
                      </div>
                    );
                  }

                  // Statut PAID : le débiteur a déclaré, attente confirmation créancier
                  if (status === "PAID") {
                    if (isCreditor) {
                      return (
                        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                          <div
                            style={{
                              padding: 10,
                              background: "rgba(197,138,46,0.10)",
                              border: "1px solid rgba(197,138,46,0.30)",
                              borderRadius: 10,
                              fontSize: 12,
                              color: "#854F0B",
                              lineHeight: 1.5,
                            }}
                          >
                            {t("debts.payment.awaitingYourConfirm") ||
                              "Le débiteur déclare avoir payé. Confirme avoir reçu pour solder l'échéance."}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleConfirmDeclaredPayment(s)}
                            disabled={confirmingScheduleId === s.id}
                            style={{
                              width: "100%",
                              background:
                                confirmingScheduleId === s.id
                                  ? "rgba(31,122,87,0.45)"
                                  : "#1F7A57",
                              color: "#FBF6EC",
                              border: "none",
                              borderRadius: 10,
                              padding: 11,
                              fontSize: 14,
                              fontWeight: 600,
                              cursor:
                                confirmingScheduleId === s.id
                                  ? "wait"
                                  : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {confirmingScheduleId === s.id
                              ? t("common.loading") || "…"
                              : t("debts.payment.confirmReceiveAction") ||
                                "Confirmer avoir reçu"}
                          </button>
                        </div>
                      );
                    } else if (isDebtor) {
                      return (
                        <div
                          style={{
                            marginTop: 12,
                            padding: 10,
                            background: "rgba(197,138,46,0.10)",
                            border: "1px solid rgba(197,138,46,0.30)",
                            borderRadius: 10,
                            fontSize: 12,
                            color: "#854F0B",
                            lineHeight: 1.5,
                          }}
                        >
                          {t("debts.payment.awaitingCreditorConfirm") ||
                            "Tu as déclaré ce paiement. En attente de confirmation du créancier."}
                        </div>
                      );
                    }
                  }

                  // Statut CONFIRMED : final
                  if (status === "CONFIRMED") {
                    return (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 10,
                          background: "rgba(31,122,87,0.10)",
                          border: "1px solid rgba(31,122,87,0.30)",
                          borderRadius: 10,
                          fontSize: 12,
                          color: "#0F6E56",
                          lineHeight: 1.5,
                          textAlign: "center",
                          fontWeight: 600,
                        }}
                      >
                        ✓ {t("debts.payment.confirmedFinal") ||
                          "Échéance soldée"}
                      </div>
                    );
                  }

                  return null;
                })()}

                <button
                  type="button"
                  onClick={() => setSelectedScheduleIdx(null)}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    color: "#6B5A47",
                    fontSize: 13,
                    padding: 12,
                    cursor: "pointer",
                    marginTop: 8,
                    fontFamily: "inherit",
                  }}
                >
                  {t("common.close") || "Fermer"}
                </button>
              </div>
            </div>
          )}

        {/* V170.D — Sheet de déclaration de paiement (réutilisable) */}
        {paymentSheetOpen && paymentSchedule && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => {
              if (!paymentLoading) setPaymentSheetOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(14,11,20,0.55)",
              zIndex: 70,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 480,
                background: "#FBF6EC",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding:
                  "16px 18px calc(24px + env(safe-area-inset-bottom, 0))",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  background: "rgba(43,31,21,0.18)",
                  margin: "0 auto 14px",
                }}
              />
              <div
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 22,
                  fontWeight: 500,
                  textAlign: "center",
                  marginBottom: 4,
                }}
              >
                {paymentMode === "RECEIVE"
                  ? t("debts.payment.receiveTitle") || "Déclarer un paiement reçu"
                  : t("debts.payment.declareTitle") ||
                    "Déclarer un paiement effectué"}
              </div>
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "#6B5A47",
                  marginBottom: 16,
                }}
              >
                {t("debts.installmentN") || "Échéance"}{" "}
                {paymentSchedule.sequenceNumber} / {debt.totalInstallments}
              </div>

              {/* Montant */}
              <label style={{ display: "block", marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6B5A47",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  {t("debts.payment.amount") || "Montant"} ({debt.currency})
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="bmd-num"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid rgba(43,31,21,0.20)",
                    background: "#FFFFFF",
                    fontSize: 16,
                    fontFamily: "inherit",
                    color: "#2B1F15",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              {/* Date */}
              <label style={{ display: "block", marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6B5A47",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  {t("debts.payment.date") || "Date du paiement"}
                </div>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid rgba(43,31,21,0.20)",
                    background: "#FFFFFF",
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: "#2B1F15",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              {/* Méthode */}
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6B5A47",
                    marginBottom: 6,
                    fontWeight: 500,
                  }}
                >
                  {t("debts.payment.method") || "Moyen de paiement"}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 6,
                  }}
                >
                  {(
                    [
                      ["CASH", t("debts.payment.cash") || "Espèces"],
                      [
                        "TRANSFER",
                        t("debts.payment.transfer") || "Virement",
                      ],
                      [
                        "MOBILE_MONEY",
                        t("debts.payment.mobileMoney") || "Mobile Money",
                      ],
                      ["OTHER", t("debts.payment.other") || "Autre"],
                    ] as const
                  ).map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() =>
                        setPaymentMethod(
                          code as
                            | "CASH"
                            | "TRANSFER"
                            | "MOBILE_MONEY"
                            | "OTHER",
                        )
                      }
                      style={{
                        padding: "10px 8px",
                        borderRadius: 10,
                        border:
                          paymentMethod === code
                            ? "1.5px solid #C58A2E"
                            : "1px solid rgba(43,31,21,0.18)",
                        background:
                          paymentMethod === code
                            ? "rgba(197,138,46,0.10)"
                            : "#FFFFFF",
                        color: "#2B1F15",
                        fontSize: 12.5,
                        fontWeight: paymentMethod === code ? 600 : 400,
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <label style={{ display: "block", marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6B5A47",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  {t("debts.payment.notes") || "Note (optionnel)"}
                </div>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder={
                    t("debts.payment.notesPlaceholder") ||
                    "Référence virement, lieu, etc."
                  }
                  rows={2}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(43,31,21,0.20)",
                    background: "#FFFFFF",
                    fontSize: 13,
                    fontFamily: "inherit",
                    color: "#2B1F15",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              {paymentError && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    background: "rgba(159,70,40,0.10)",
                    border: "1px solid rgba(159,70,40,0.3)",
                    color: "#9F4628",
                    fontSize: 12,
                    borderRadius: 8,
                  }}
                >
                  {paymentError}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmitPayment}
                disabled={paymentLoading}
                style={{
                  width: "100%",
                  background: paymentLoading
                    ? "rgba(31,122,87,0.45)"
                    : paymentMode === "RECEIVE"
                      ? "#C58A2E"
                      : "#1F7A57",
                  color: "#FBF6EC",
                  border: "none",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 14.5,
                  fontWeight: 700,
                  cursor: paymentLoading ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {paymentLoading
                  ? t("common.loading") || "Envoi…"
                  : paymentMode === "RECEIVE"
                    ? t("debts.payment.submitReceive") ||
                      "Confirmer la réception"
                    : t("debts.payment.submitDeclare") ||
                      "Déclarer le paiement"}
              </button>

              <button
                type="button"
                onClick={() => setPaymentSheetOpen(false)}
                disabled={paymentLoading}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "#6B5A47",
                  fontSize: 13,
                  padding: 12,
                  cursor: paymentLoading ? "wait" : "pointer",
                  marginTop: 4,
                  fontFamily: "inherit",
                }}
              >
                {t("common.cancel") || "Annuler"}
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* === V150.A — Sheet contre-proposition === */}
      {showCounterSheet && (
        <div
          onClick={() => {
            if (!actionLoading) setShowCounterSheet(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,31,21,0.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FBF6EC",
              borderRadius: "16px 16px 0 0",
              padding: 20,
              maxWidth: 520,
              width: "100%",
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            <h3
              style={{
                margin: "0 0 6px",
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                color: "#2B1F15",
              }}
            >
              {t("debts.actions.counterTitle") || "Contre-proposition"}
            </h3>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 13,
                color: "#6B5A47",
                lineHeight: 1.5,
              }}
            >
              {t("debts.actions.counterHint") ||
                "Explique au créancier ce que tu souhaites renégocier (montant, taux, échéances). Il recevra ta proposition et pourra accepter, refuser ou ajuster."}
            </p>
            <textarea
              value={counterReason}
              onChange={(e) => setCounterReason(e.target.value)}
              placeholder={
                t("debts.actions.counterPlaceholder") ||
                "Ex : je préférerais 12 échéances au lieu de 6, et un taux à 0 % vu notre relation…"
              }
              rows={5}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(43,31,21,0.20)",
                background: "#FFFFFF",
                fontSize: 14,
                fontFamily: "inherit",
                color: "#2B1F15",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            {actionError && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#9F4628",
                }}
              >
                {actionError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 14,
              }}
            >
              <button
                onClick={() => {
                  setShowCounterSheet(false);
                  setCounterReason("");
                }}
                disabled={!!actionLoading}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(43,31,21,0.20)",
                  background: "transparent",
                  color: "#2B1F15",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: actionLoading ? "not-allowed" : "pointer",
                }}
              >
                {t("common.cancel") || "Annuler"}
              </button>
              <button
                onClick={handleCounter}
                disabled={!counterReason.trim() || !!actionLoading}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    !counterReason.trim() || actionLoading
                      ? "rgba(197,138,46,0.35)"
                      : "linear-gradient(135deg, #C58A2E, #9F4628)",
                  color: "#FBF6EC",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor:
                    !counterReason.trim() || actionLoading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {actionLoading === "COUNTER"
                  ? t("common.sending") || "Envoi…"
                  : t("debts.actions.counterSend") || "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === V150.D — Sheet "Signaler un litige" === */}
      {showDisputeSheet && (
        <DebtDisputeSheet
          category={disputeCategory}
          setCategory={setDisputeCategory}
          reason={disputeReason}
          setReason={setDisputeReason}
          loading={disputeLoading}
          error={disputeError}
          onClose={() => {
            if (!disputeLoading) setShowDisputeSheet(false);
          }}
          onSubmit={handleSubmitDispute}
          t={t}
        />
      )}

      {/* === V150.B — Sheet invitation témoin / garant === */}
      {/* === V152.H — Paywall signature (quota épuisé) === */}
      {paywallOpen && paywallQuote && (
        <SignaturePaywallSheet
          level={paywallQuote.level}
          pricing={paywallQuote.pricing}
          packs={paywallQuote.suggestedPacks}
          loading={paywallActionLoading}
          onClose={() => {
            if (!paywallActionLoading) setPaywallOpen(false);
          }}
          onBuyUnit={handleBuySignatureUnit}
          onBuyPack={handleBuyPack}
          t={t}
        />
      )}

      {showPartySheet && (
        <DebtAddPartySheet
          role={showPartySheet}
          contact={partyContact}
          setContact={setPartyContact}
          displayName={partyDisplayName}
          setDisplayName={(v) => {
            setPartyManualOverride(true);
            setPartyDisplayName(v);
          }}
          coverage={partyCoverage}
          setCoverage={setPartyCoverage}
          triggerDays={partyTriggerDays}
          setTriggerDays={setPartyTriggerDays}
          loading={partyLoading}
          error={partyError}
          onClose={() => {
            if (!partyLoading) setShowPartySheet(null);
          }}
          onSubmit={handleAddParty}
          t={t}
          /* V170.E — Lookup BMD */
          lookupLoading={partyLookupLoading}
          matchedUserId={partyMatchedUserId}
        />
      )}

      {/* V242 — Modal aperçu PDF du contrat. Iframe pleine largeur + bandeau */}
      {previewPdfUrl && (
        <div
          onClick={closePdfPreview}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,31,21,0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FBF6EC",
              borderRadius: 16,
              width: "100%",
              maxWidth: 900,
              height: "92vh",
              maxHeight: 1100,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            {/* Header bandeau */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid #EAD9B8",
                background: "#FFFFFF",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#2B1F15",
                    letterSpacing: 0.2,
                  }}
                >
                  {t("debtV242.preview.modalTitle") ||
                    "Aperçu du contrat"}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "#6B5A47",
                    marginTop: 2,
                  }}
                >
                  {t("debtV242.preview.modalHint") ||
                    "Vérifie que tout est en ordre avant d'envoyer aux parties."}
                </div>
              </div>
              <button
                type="button"
                onClick={closePdfPreview}
                aria-label={t("common.close") || "Fermer"}
                style={{
                  background: "transparent",
                  border: "1px solid #D9C8A6",
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  fontSize: 18,
                  color: "#6B5A47",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>
            {/* Iframe PDF */}
            <iframe
              src={previewPdfUrl}
              title={
                t("debtV242.preview.iframeTitle") ||
                "Aperçu PDF du contrat de RDD"
              }
              style={{
                flex: 1,
                width: "100%",
                border: "none",
                background: "#FBF6EC",
              }}
            />
            {/* Footer actions */}
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                padding: "12px 20px",
                borderTop: "1px solid #EAD9B8",
                background: "#FFFFFF",
              }}
            >
              <button
                type="button"
                onClick={closePdfPreview}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  color: "#6B5A47",
                  border: "1px solid #D9C8A6",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("debtV242.preview.closeBtn") || "Fermer"}
              </button>
              {debt.status === "DRAFT" && debt.myRole === "CREDITOR" && (
                <button
                  type="button"
                  onClick={async () => {
                    closePdfPreview();
                    await handlePropose();
                  }}
                  disabled={actionLoading === "PROPOSE"}
                  style={{
                    padding: "10px 18px",
                    background:
                      "linear-gradient(135deg, #C58A2E, #9F4628)",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor:
                      actionLoading === "PROPOSE" ? "wait" : "pointer",
                    fontFamily: "inherit",
                    boxShadow: "0 4px 12px rgba(197,138,46,0.4)",
                  }}
                >
                  {t("debtV242.preview.proposeBtn") ||
                    "Confirmer & envoyer"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ResponsiveShell>
  );
}

/**
 * V150.A — Bannière d'action contextuelle.
 *
 * Selon le statut du contrat et le rôle de l'utilisateur, on affiche :
 *  - DRAFT + CREDITOR  : « Envoyer au débiteur »
 *  - DRAFT + DEBTOR    : (impossible, mais on prévoit un message d'attente)
 *  - PROPOSED + DEBTOR : Accepter / Refuser / Contre-proposer
 *  - PROPOSED + CREDITOR : « En attente de réponse »
 *  - NEGOTIATING + CREDITOR : « Contre-proposition reçue, à toi de répondre »
 *  - NEGOTIATING + DEBTOR  : « En attente du créancier »
 *  - SIGNED / ACTIVE   : pas de bannière (la roue prend le relais)
 *  - CANCELLED         : « Contrat annulé »
 */
function DebtActionBanner({
  status,
  myRole,
  loading,
  error,
  onPropose,
  onAccept,
  onReject,
  onCounter,
  t,
}: {
  status: string;
  myRole: string;
  loading: null | "PROPOSE" | "ACCEPT" | "REJECT" | "COUNTER";
  error: string | null;
  onPropose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}): JSX.Element | null {
  const isCreditor = myRole === "CREDITOR";
  const isDebtor = myRole === "DEBTOR";

  // SIGNED / ACTIVE / COMPLETED → pas de bannière, place à la roue
  if (status === "SIGNED" || status === "ACTIVE" || status === "COMPLETED") {
    return null;
  }

  // CANCELLED → message neutre
  if (status === "CANCELLED") {
    return (
      <InfoBanner
        tone="muted"
        title={t("debts.actions.cancelledTitle") || "Contrat annulé"}
        hint={
          t("debts.actions.cancelledHint") ||
          "Cette reconnaissance a été refusée ou annulée."
        }
      />
    );
  }

  // DRAFT
  if (status === "DRAFT") {
    if (isCreditor) {
      return (
        <ActionBanner
          tone="saffron"
          title={t("debts.actions.draftCreditorTitle") || "Brouillon prêt"}
          hint={
            t("debts.actions.draftCreditorHint") ||
            "Envoie le contrat au débiteur pour qu'il l'accepte et le signe."
          }
          primaryLabel={
            loading === "PROPOSE"
              ? t("common.sending") || "Envoi…"
              : t("debts.actions.proposeButton") || "Envoyer au débiteur"
          }
          onPrimary={onPropose}
          primaryLoading={loading === "PROPOSE"}
          error={error}
        />
      );
    }
    return (
      <InfoBanner
        tone="muted"
        title={t("debts.actions.draftDebtorTitle") || "Brouillon en cours"}
        hint={
          t("debts.actions.draftDebtorHint") ||
          "Le créancier finalise le contrat. Tu seras notifié dès qu'il sera prêt."
        }
      />
    );
  }

  // PROPOSED + DEBTOR → action principale
  if (status === "PROPOSED" && isDebtor) {
    return (
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(197,138,46,0.02))",
          border: "1px solid rgba(197,138,46,0.30)",
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#2B1F15",
            marginBottom: 4,
          }}
        >
          {t("debts.actions.proposedDebtorTitle") || "Réponds à cette proposition"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#6B5A47",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {t("debts.actions.proposedDebtorHint") ||
            "Le créancier te demande de reconnaître cette dette. Lis bien les conditions ci-dessous avant d'agir."}
        </div>
        {error && (
          <div
            style={{
              padding: "8px 10px",
              marginBottom: 10,
              borderRadius: 8,
              background: "rgba(159,70,40,0.10)",
              color: "#9F4628",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          <button
            onClick={onReject}
            disabled={!!loading}
            style={{
              padding: "10px 8px",
              borderRadius: 10,
              border: "1px solid rgba(159,70,40,0.30)",
              background: "transparent",
              color: "#9F4628",
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "REJECT"
              ? "…"
              : t("debts.actions.rejectButton") || "Refuser"}
          </button>
          <button
            onClick={onCounter}
            disabled={!!loading}
            style={{
              padding: "10px 8px",
              borderRadius: 10,
              border: "1px solid rgba(43,31,21,0.20)",
              background: "transparent",
              color: "#2B1F15",
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {t("debts.actions.counterButton") || "Négocier"}
          </button>
          <button
            onClick={onAccept}
            disabled={!!loading}
            style={{
              padding: "10px 8px",
              borderRadius: 10,
              border: "none",
              background: loading
                ? "rgba(31,122,87,0.35)"
                : "linear-gradient(135deg, #1F7A57, #0F6E56)",
              color: "#FBF6EC",
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "ACCEPT"
              ? "…"
              : t("debts.actions.acceptButton") || "Accepter"}
          </button>
        </div>
      </div>
    );
  }

  // PROPOSED + CREDITOR → attente
  if (status === "PROPOSED" && isCreditor) {
    return (
      <InfoBanner
        tone="saffron"
        title={
          t("debts.actions.proposedCreditorTitle") ||
          "En attente du débiteur"
        }
        hint={
          t("debts.actions.proposedCreditorHint") ||
          "Le débiteur a 7 jours pour répondre. Tu seras notifié de sa décision."
        }
      />
    );
  }

  // NEGOTIATING → message contextuel
  if (status === "NEGOTIATING") {
    return (
      <InfoBanner
        tone="saffron"
        title={t("debts.actions.negotiatingTitle") || "Négociation en cours"}
        hint={
          isCreditor
            ? t("debts.actions.negotiatingCreditorHint") ||
              "Le débiteur a proposé des changements. Consulte les amendements ci-dessous pour répondre."
            : t("debts.actions.negotiatingDebtorHint") ||
              "Le créancier examine ta contre-proposition. Réponse à venir."
        }
      />
    );
  }

  return null;
}

function InfoBanner({
  tone,
  title,
  hint,
}: {
  tone: "muted" | "saffron";
  title: string;
  hint: string;
}): JSX.Element {
  return (
    <div
      style={{
        background:
          tone === "saffron"
            ? "rgba(197,138,46,0.08)"
            : "rgba(43,31,21,0.04)",
        border:
          tone === "saffron"
            ? "1px solid rgba(197,138,46,0.20)"
            : "1px solid rgba(43,31,21,0.10)",
        borderRadius: 12,
        padding: 12,
        marginBottom: 14,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#2B1F15",
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: "#6B5A47", lineHeight: 1.5 }}>
        {hint}
      </div>
    </div>
  );
}

function ActionBanner({
  tone,
  title,
  hint,
  primaryLabel,
  onPrimary,
  primaryLoading,
  error,
}: {
  tone: "saffron";
  title: string;
  hint: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryLoading: boolean;
  error: string | null;
}): JSX.Element {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(197,138,46,0.02))",
        border: "1px solid rgba(197,138,46,0.30)",
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#2B1F15",
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#6B5A47",
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        {hint}
      </div>
      {error && (
        <div
          style={{
            padding: "8px 10px",
            marginBottom: 10,
            borderRadius: 8,
            background: "rgba(159,70,40,0.10)",
            color: "#9F4628",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
      <button
        onClick={onPrimary}
        disabled={primaryLoading}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 10,
          border: "none",
          background: primaryLoading
            ? "rgba(197,138,46,0.35)"
            : "linear-gradient(135deg, #C58A2E, #9F4628)",
          color: "#FBF6EC",
          fontSize: 14,
          fontWeight: 700,
          cursor: primaryLoading ? "not-allowed" : "pointer",
        }}
      >
        {primaryLabel}
      </button>
    </div>
  );
}

/**
 * V172.B — Helper qui retourne l'icône + couleur + libellé d'une échéance
 * SELON LE RÔLE de l'utilisateur connecté.
 *
 *   - PENDING / LATE → "Échéance N" (neutre)
 *   - PAID (déclaré par débiteur, attente créancier) :
 *       Débiteur  → "Déclaré · en attente de validation" (saffron)
 *       Créancier → "Paiement déclaré · à confirmer" (saffron)
 *   - CONFIRMED (final) :
 *       Débiteur  → "Soldé · {date}" (emerald)
 *       Créancier → "Reçu · {date}" (emerald)
 *   - LATE → "En retard" (terracotta)
 *   - MISSED → "Manqué" (terracotta sombre)
 */
function scheduleVisual(
  status: string,
  myRole: string,
  t: (k: string) => string,
  paidAt?: string | null,
): {
  icon: string;
  iconColor: string;
  label?: string;
  labelColor?: string;
  bg?: string;
  bold?: boolean;
} {
  const isCreditor = myRole === "CREDITOR";
  const isDebtor = myRole === "DEBTOR";

  if (status === "CONFIRMED") {
    const dateStr = paidAt
      ? new Date(paidAt).toLocaleDateString("fr-FR")
      : "";
    return {
      icon: "✓",
      iconColor: "#1F7A57",
      label: isCreditor
        ? `${t("debts.received") || "Reçu"}${dateStr ? " · " + dateStr : ""}`
        : isDebtor
          ? `${t("debts.schedule.settled") || "Soldé"}${dateStr ? " · " + dateStr : ""}`
          : `${t("debts.received") || "Reçu"}${dateStr ? " · " + dateStr : ""}`,
      labelColor: "#0F6E56",
      bold: true,
    };
  }

  if (status === "PAID") {
    return {
      icon: "⌛",
      iconColor: "#C58A2E",
      label: isCreditor
        ? t("debts.schedule.toConfirm") ||
          "Paiement déclaré · à confirmer"
        : isDebtor
          ? t("debts.schedule.awaitingValidation") ||
            "Déclaré · en attente de validation"
          : t("debts.schedule.declared") || "Paiement déclaré",
      labelColor: "#854F0B",
      bg: "rgba(197,138,46,0.10)",
      bold: true,
    };
  }

  if (status === "LATE") {
    return {
      icon: "!",
      iconColor: "#9F4628",
      label: t("debts.schedule.late") || "En retard",
      labelColor: "#9F4628",
      bg: "rgba(159,70,40,0.08)",
      bold: true,
    };
  }

  if (status === "MISSED") {
    return {
      icon: "✕",
      iconColor: "#7A2E14",
      label: t("debts.schedule.missed") || "Manqué (>30j)",
      labelColor: "#7A2E14",
      bg: "rgba(122,46,20,0.10)",
      bold: true,
    };
  }

  // PENDING par défaut
  return {
    icon: "·",
    iconColor: "#6B5A47",
  };
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "10px 13px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "0.5px solid rgba(43,31,21,0.08)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "#6B5A47", fontSize: 12 }}>{label}</span>
      {children}
    </div>
  );
}

// ============================================================
// V150.B — Section témoins & garants
// ============================================================
function DebtPartiesSection({
  parties,
  myRole,
  status,
  onInviteWitness,
  onInviteGuarantor,
  onRemove,
  t,
}: {
  parties: Array<{
    id: string;
    displayName: string;
    role: string;
    signatureStatus: string;
  }>;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  status: string;
  onInviteWitness: () => void;
  onInviteGuarantor: () => void;
  onRemove: (partyId: string, partyName: string) => void;
  t: (k: string) => string;
}): JSX.Element {
  const witnesses = parties.filter((p) => p.role === "WITNESS");
  const guarantors = parties.filter((p) => p.role === "GUARANTOR");
  const canInvite =
    (myRole === "CREDITOR" || myRole === "DEBTOR") &&
    ["DRAFT", "PROPOSED", "NEGOTIATING", "ACCEPTED"].includes(status);

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#6B5A47",
            fontWeight: 700,
          }}
        >
          {t("debts.parties.sectionTitle") || "Témoins & garants"}
        </div>
        {canInvite && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={onInviteWitness}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 999,
                border: "1px solid rgba(197,138,46,0.4)",
                background: "rgba(197,138,46,0.08)",
                color: "#854F0B",
                cursor: "pointer",
              }}
            >
              + {t("debts.parties.addWitness") || "Témoin"}
            </button>
            <button
              type="button"
              onClick={onInviteGuarantor}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 999,
                border: "1px solid rgba(31,122,87,0.4)",
                background: "rgba(31,122,87,0.10)",
                color: "#0F6E56",
                cursor: "pointer",
              }}
            >
              + {t("debts.parties.addGuarantor") || "Garant"}
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid rgba(43,31,21,0.12)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {witnesses.length === 0 && guarantors.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              color: "#6B5A47",
              fontSize: 12,
              fontStyle: "italic",
            }}
          >
            {t("debts.parties.empty") ||
              "Aucun témoin ni garant. Ajoute-en pour sécuriser l'accord."}
          </div>
        ) : (
          [...witnesses, ...guarantors].map((p) => (
            <PartyRow
              key={p.id}
              party={p}
              canRemove={canInvite && p.signatureStatus !== "SIGNED"}
              onRemove={() => onRemove(p.id, p.displayName)}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PartyRow({
  party,
  canRemove,
  onRemove,
  t,
}: {
  party: { id: string; displayName: string; role: string; signatureStatus: string };
  canRemove: boolean;
  onRemove: () => void;
  t: (k: string) => string;
}): JSX.Element {
  const isWitness = party.role === "WITNESS";
  const tagBg = isWitness ? "rgba(197,138,46,0.16)" : "rgba(31,122,87,0.16)";
  const tagColor = isWitness ? "#854F0B" : "#0F6E56";
  const signedColor =
    party.signatureStatus === "SIGNED"
      ? "#0F6E56"
      : party.signatureStatus === "DECLINED"
        ? "#9F4628"
        : "#6B5A47";
  return (
    <div
      style={{
        padding: "10px 13px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "0.5px solid rgba(43,31,21,0.08)",
        gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              borderRadius: 999,
              background: tagBg,
              color: tagColor,
              textTransform: "uppercase",
            }}
          >
            {isWitness
              ? t("debts.parties.witness") || "Témoin"
              : t("debts.parties.guarantor") || "Garant"}
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "#2B1F15",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {party.displayName}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: signedColor,
            marginTop: 2,
            paddingLeft: 2,
          }}
        >
          {t(`debts.parties.sig.${party.signatureStatus}`) ||
            party.signatureStatus}
        </div>
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("common.remove") || "Retirer"}
          style={{
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid rgba(159,70,40,0.3)",
            background: "transparent",
            color: "#9F4628",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {t("common.remove") || "Retirer"}
        </button>
      )}
    </div>
  );
}

function DebtAddPartySheet({
  role,
  contact,
  setContact,
  displayName,
  setDisplayName,
  coverage,
  setCoverage,
  triggerDays,
  setTriggerDays,
  loading,
  error,
  onClose,
  onSubmit,
  t,
  lookupLoading,
  matchedUserId,
}: {
  role: "WITNESS" | "GUARANTOR";
  contact: string;
  setContact: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  coverage: string;
  setCoverage: (v: string) => void;
  triggerDays: string;
  setTriggerDays: (v: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  t: (k: string) => string;
  /** V170.E — Lookup BMD */
  lookupLoading?: boolean;
  matchedUserId?: string | null;
}): JSX.Element {
  const isGuarantor = role === "GUARANTOR";
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF6EC",
          borderRadius: "16px 16px 0 0",
          padding: 20,
          maxWidth: 520,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: "rgba(43,31,21,0.2)",
            borderRadius: 2,
            margin: "0 auto 14px",
          }}
        />
        <h3
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#2B1F15",
            margin: "0 0 4px",
          }}
        >
          {isGuarantor
            ? t("debts.parties.addGuarantorTitle") || "Inviter un garant"
            : t("debts.parties.addWitnessTitle") || "Inviter un témoin"}
        </h3>
        <p
          style={{
            fontSize: 12,
            color: "#6B5A47",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          {isGuarantor
            ? t("debts.parties.guarantorHint") ||
              "Le garant pourra être appelé à couvrir une part du montant en cas de défaut."
            : t("debts.parties.witnessHint") ||
              "Le témoin atteste que l'accord a été conclu librement. Aucun engagement financier."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, color: "#6B5A47" }}>
            {t("debts.parties.nameLabel") || "Nom"}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={
                t("debts.parties.namePlaceholder") || "Nom complet"
              }
              style={{
                width: "100%",
                marginTop: 4,
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid rgba(43,31,21,0.18)",
                borderRadius: 10,
                background: "#FFFFFF",
                color: "#2B1F15",
              }}
            />
          </label>

          <label style={{ fontSize: 12, color: "#6B5A47" }}>
            {t("debts.parties.contactLabel") || "Téléphone ou email"}
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={
                t("debts.parties.contactPlaceholder") ||
                "+33 6 12 34 56 78 ou nom@exemple.com"
              }
              style={{
                width: "100%",
                marginTop: 4,
                padding: "10px 12px",
                fontSize: 14,
                border: matchedUserId
                  ? "1.5px solid #1F7A57"
                  : "1px solid rgba(43,31,21,0.18)",
                borderRadius: 10,
                background: "#FFFFFF",
                color: "#2B1F15",
              }}
            />
            {/* V170.E — Badge lookup BMD */}
            {lookupLoading && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "#6B5A47",
                  fontStyle: "italic",
                }}
              >
                {t("debts.parties.lookupChecking") ||
                  "Vérification dans BMD…"}
              </div>
            )}
            {!lookupLoading && matchedUserId && (
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  background: "rgba(31,122,87,0.10)",
                  border: "1px solid rgba(31,122,87,0.30)",
                  borderRadius: 8,
                  fontSize: 11.5,
                  color: "#0F6E56",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 13 }}>✓</span>
                {t("debts.parties.lookupMatched") ||
                  "Membre BMD trouvé — infos auto-complétées"}
              </div>
            )}
          </label>

          {isGuarantor && (
            <>
              <label style={{ fontSize: 12, color: "#6B5A47" }}>
                {t("debts.parties.coverageLabel") ||
                  "Couverture (% du montant)"}
                <input
                  type="number"
                  value={coverage}
                  min={1}
                  max={100}
                  onChange={(e) => setCoverage(e.target.value)}
                  className="bmd-num"
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid rgba(43,31,21,0.18)",
                    borderRadius: 10,
                    background: "#FFFFFF",
                    color: "#2B1F15",
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#6B5A47" }}>
                {t("debts.parties.triggerLabel") ||
                  "Délai d'activation (jours après défaut)"}
                <input
                  type="number"
                  value={triggerDays}
                  min={0}
                  max={365}
                  onChange={(e) => setTriggerDays(e.target.value)}
                  className="bmd-num"
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid rgba(43,31,21,0.18)",
                    borderRadius: 10,
                    background: "#FFFFFF",
                    color: "#2B1F15",
                  }}
                />
              </label>
            </>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "rgba(159,70,40,0.10)",
              border: "1px solid rgba(159,70,40,0.25)",
              color: "#9F4628",
              fontSize: 12,
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid rgba(43,31,21,0.2)",
              background: "transparent",
              color: "#2B1F15",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {t("common.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: loading
                ? "rgba(197,138,46,0.35)"
                : "linear-gradient(135deg, #C58A2E, #9F4628)",
              color: "#FBF6EC",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? t("common.sending") || "Envoi…"
              : t("debts.parties.submit") || "Envoyer l'invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// V150.E — Carte certificat soldé (visible si status === COMPLETED)
// ============================================================
function DebtCertificateCard({
  debtId,
  publicCode,
  t,
}: {
  debtId: string;
  publicCode: string;
  t: (k: string) => string;
}): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      await api.downloadDebtCertificate(debtId, publicCode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        background:
          "linear-gradient(135deg, rgba(31,122,87,0.10), rgba(197,138,46,0.08))",
        border: "1px solid rgba(31,122,87,0.28)",
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      {/* Sceau décoratif "PAYÉ" en filigrane */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -10,
          top: -10,
          fontFamily: "Cormorant Garamond, Georgia, serif",
          fontSize: 72,
          color: "rgba(31,122,87,0.06)",
          fontWeight: 700,
          letterSpacing: 2,
          lineHeight: 1,
          pointerEvents: "none",
          transform: "rotate(8deg)",
        }}
      >
        ✓
      </div>

      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "#0F6E56",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {t("debts.certificate.eyebrow") || "Contrat soldé"}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "#2B1F15",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          letterSpacing: 0.3,
          marginBottom: 6,
          lineHeight: 1.2,
        }}
      >
        {t("debts.certificate.title") ||
          "Tu as honoré ton engagement jusqu'au bout."}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#4A3D2E",
          lineHeight: 1.5,
          marginBottom: 14,
          maxWidth: "85%",
        }}
      >
        {t("debts.certificate.hint") ||
          "Télécharge l'acte de quittance — un certificat PDF officiel attestant que la dette est intégralement remboursée."}
      </div>

      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 999,
          border: "none",
          background: loading
            ? "rgba(31,122,87,0.35)"
            : "linear-gradient(135deg, #1F7A57, #2B1F15)",
          color: "#FBF6EC",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3,
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: loading
            ? "none"
            : "0 4px 12px rgba(31,122,87,0.25)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {loading
          ? t("debts.certificate.downloading") || "Génération…"
          : t("debts.certificate.cta") || "Télécharger l'attestation PDF"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: "rgba(159,70,40,0.12)",
            border: "1px solid rgba(159,70,40,0.3)",
            color: "#9F4628",
            fontSize: 12,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================================
// V150.D — Bandeau litige actif (visible quand status === DISPUTED)
// ============================================================
function DebtDisputeBanner({
  myRole,
  onResolve,
  loading,
  error,
  t,
}: {
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  onResolve: () => void;
  loading: boolean;
  error: string | null;
  t: (k: string) => string;
}): JSX.Element {
  const canResolve = myRole === "CREDITOR" || myRole === "DEBTOR";
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(159,70,40,0.14), rgba(197,138,46,0.10))",
        border: "1px solid rgba(159,70,40,0.4)",
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9F4628"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#9F4628",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            {t("debts.dispute.bannerEyebrow") || "Contrat en litige"}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#2B1F15",
              lineHeight: 1.4,
              marginBottom: 6,
            }}
          >
            {t("debts.dispute.bannerTitle") ||
              "Un point doit être discuté entre vous"}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#4A3D2E",
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          >
            {t("debts.dispute.bannerHint") ||
              "Les échéances sont gelées et aucune relance automatique n'est envoyée tant que le litige n'est pas résolu."}
          </div>
          {canResolve && (
            <button
              type="button"
              onClick={onResolve}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
                border: "none",
                background: loading
                  ? "rgba(31,122,87,0.35)"
                  : "linear-gradient(135deg, #1F7A57, #0F6E56)",
                color: "#FBF6EC",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? t("debts.dispute.resolving") || "Résolution…"
                : t("debts.dispute.resolveButton") || "Marquer comme résolu"}
            </button>
          )}
          {error && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                background: "rgba(159,70,40,0.10)",
                border: "1px solid rgba(159,70,40,0.3)",
                color: "#9F4628",
                fontSize: 12,
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// V150.D — Sheet signalement de litige
// ============================================================
type DisputeCategory =
  | "NON_PAYMENT"
  | "WRONG_AMOUNT"
  | "BAD_FAITH"
  | "FORCED_AGREEMENT"
  | "OTHER";

function DebtDisputeSheet({
  category,
  setCategory,
  reason,
  setReason,
  loading,
  error,
  onClose,
  onSubmit,
  t,
}: {
  category: DisputeCategory;
  setCategory: (v: DisputeCategory) => void;
  reason: string;
  setReason: (v: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  t: (k: string) => string;
}): JSX.Element {
  const categories: Array<{ key: DisputeCategory; label: string; desc: string }> = [
    {
      key: "NON_PAYMENT",
      label: t("debts.dispute.catNonPayment") || "Non-paiement",
      desc:
        t("debts.dispute.catNonPaymentDesc") ||
        "Les échéances ne sont pas honorées comme prévu.",
    },
    {
      key: "WRONG_AMOUNT",
      label: t("debts.dispute.catWrongAmount") || "Désaccord sur le montant",
      desc:
        t("debts.dispute.catWrongAmountDesc") ||
        "Un paiement a été déclaré pour un montant qui ne correspond pas.",
    },
    {
      key: "BAD_FAITH",
      label: t("debts.dispute.catBadFaith") || "Mauvaise foi",
      desc:
        t("debts.dispute.catBadFaithDesc") ||
        "L'autre partie agit de mauvaise foi (déni, blocage, etc.).",
    },
    {
      key: "FORCED_AGREEMENT",
      label: t("debts.dispute.catForced") || "Consentement contraint",
      desc:
        t("debts.dispute.catForcedDesc") ||
        "Le contrat a été signé sous pression ou avec un vice du consentement.",
    },
    {
      key: "OTHER",
      label: t("debts.dispute.catOther") || "Autre motif",
      desc:
        t("debts.dispute.catOtherDesc") ||
        "Précise dans le champ ci-dessous.",
    },
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF6EC",
          borderRadius: "16px 16px 0 0",
          padding: 20,
          maxWidth: 520,
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: "rgba(43,31,21,0.2)",
            borderRadius: 2,
            margin: "0 auto 14px",
          }}
        />
        <h3
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#2B1F15",
            margin: "0 0 4px",
          }}
        >
          {t("debts.dispute.sheetTitle") || "Signaler un litige"}
        </h3>
        <p
          style={{
            fontSize: 12,
            color: "#6B5A47",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          {t("debts.dispute.sheetHint") ||
            "Le contrat sera marqué en litige et l'autre partie sera notifiée. Les échéances et relances sont gelées le temps que vous trouviez un terrain d'entente."}
        </p>

        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#6B5A47",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            {t("debts.dispute.categoryLabel") || "Catégorie"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map((c) => {
              const active = c.key === category;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: active
                      ? "1.5px solid #C58A2E"
                      : "1px solid rgba(43,31,21,0.18)",
                    background: active
                      ? "rgba(197,138,46,0.10)"
                      : "#FFFFFF",
                    color: "#2B1F15",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {c.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6B5A47",
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {c.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <label
          style={{
            fontSize: 12,
            color: "#6B5A47",
            display: "block",
            marginBottom: 14,
          }}
        >
          {t("debts.dispute.reasonLabel") || "Décris la situation"}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              t("debts.dispute.reasonPlaceholder") ||
              "Sois précis et factuel. Plus c'est clair, plus la résolution sera rapide."
            }
            rows={5}
            style={{
              width: "100%",
              marginTop: 4,
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid rgba(43,31,21,0.18)",
              borderRadius: 10,
              background: "#FFFFFF",
              color: "#2B1F15",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <div
            style={{
              fontSize: 10,
              color: "#6B5A47",
              marginTop: 4,
              textAlign: "right",
            }}
          >
            {reason.length} / 2000
          </div>
        </label>

        {error && (
          <div
            style={{
              padding: 10,
              background: "rgba(159,70,40,0.10)",
              border: "1px solid rgba(159,70,40,0.25)",
              color: "#9F4628",
              fontSize: 12,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid rgba(43,31,21,0.2)",
              background: "transparent",
              color: "#2B1F15",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {t("common.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || reason.trim().length < 10}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background:
                loading || reason.trim().length < 10
                  ? "rgba(159,70,40,0.35)"
                  : "linear-gradient(135deg, #9F4628, #6B2E18)",
              color: "#FBF6EC",
              fontSize: 14,
              fontWeight: 700,
              cursor:
                loading || reason.trim().length < 10
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading
              ? t("debts.dispute.submitting") || "Envoi…"
              : t("debts.dispute.submit") || "Signaler le litige"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// V150.C — Card signature électronique qualifiée Yousign
// ============================================================
function DebtSignatureCard({
  enabled,
  loading,
  error,
  onRequest,
  t,
}: {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  onRequest: () => void;
  t: (k: string) => string;
}): JSX.Element {
  return (
    <div
      style={{
        background: enabled
          ? "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(31,122,87,0.06))"
          : "rgba(43,31,21,0.04)",
        border: enabled
          ? "1px solid rgba(197,138,46,0.32)"
          : "1px dashed rgba(43,31,21,0.18)",
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: enabled ? "#854F0B" : "#6B5A47",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {t("debts.sign.eyebrow") || "Signature électronique qualifiée"}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#2B1F15",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          letterSpacing: 0.3,
          marginBottom: 6,
          lineHeight: 1.3,
        }}
      >
        {enabled
          ? t("debts.sign.title") || "Sécurise le contrat avec eIDAS"
          : t("debts.sign.titleDisabled") || "Signature qualifiée (bientôt)"}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#4A3D2E",
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        {enabled
          ? t("debts.sign.hint") ||
            "Chaque partie reçoit un email Yousign avec un lien sécurisé. Une fois tous les signataires validés, le contrat passe automatiquement en statut signé avec un PDF horodaté."
          : t("debts.sign.hintDisabled") ||
            "La signature qualifiée eIDAS via Yousign sera activée prochainement. En attendant, la signature simple (clic + OTP) reste disponible."}
      </div>
      <button
        type="button"
        onClick={onRequest}
        disabled={!enabled || loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          background:
            !enabled || loading
              ? "rgba(43,31,21,0.18)"
              : "linear-gradient(135deg, #C58A2E, #854F0B)",
          color: !enabled ? "#6B5A47" : "#FBF6EC",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3,
          cursor: !enabled || loading ? "not-allowed" : "pointer",
          boxShadow:
            !enabled || loading ? "none" : "0 4px 12px rgba(197,138,46,0.25)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        {loading
          ? t("debts.sign.requesting") || "Préparation…"
          : enabled
            ? t("debts.sign.cta") || "Demander signature qualifiée"
            : t("debts.sign.notAvailable") || "Pas encore disponible"}
      </button>
      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.3)",
            color: "#9F4628",
            fontSize: 12,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================================
// V152.H — Sheet paywall signature (quota épuisé, 3 options)
// ============================================================
function SignaturePaywallSheet({
  level,
  pricing,
  packs,
  loading,
  onClose,
  onBuyUnit,
  onBuyPack,
  t,
}: {
  level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
  pricing: { priceCents: number; currency: string } | null;
  packs: Array<{
    code: string;
    name: string;
    priceCents: number;
    currency: string;
    advancedIncluded: number;
    notarizedIncluded: number;
    durationDays: number;
  }>;
  loading: string | null;
  onClose: () => void;
  onBuyUnit: () => void;
  onBuyPack: (code: "SIGN_PACK_SERENITY" | "SIGN_PACK_AFFAIRS") => void;
  t: (k: string) => string;
}): JSX.Element {
  const levelLabel =
    level === "SIMPLE"
      ? "SIMPLE · SES"
      : level === "ADVANCED"
        ? "ADVANCED · AES"
        : "NOTARIZED · QES";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF6EC",
          borderRadius: "16px 16px 0 0",
          padding: 20,
          maxWidth: 520,
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: "rgba(43,31,21,0.2)",
            borderRadius: 2,
            margin: "0 auto 14px",
          }}
        />

        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#854F0B",
            fontWeight: 700,
            marginBottom: 4,
            textAlign: "center",
          }}
        >
          {t("debts.paywall.eyebrow") || "Quota épuisé"}
        </div>
        <h3
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#2B1F15",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            margin: "0 0 8px",
            textAlign: "center",
          }}
        >
          {t("debts.paywall.title") ||
            "Plus de signatures dans ton quota ce mois"}
        </h3>
        <p
          style={{
            fontSize: 12,
            color: "#6B5A47",
            margin: "0 0 18px",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {(t("debts.paywall.subtitle") ||
            "Pour signer en {level}, choisis l'option qui te convient.").replace(
            "{level}",
            levelLabel,
          )}
        </p>

        {/* Option 1 : payer à l'unité */}
        {pricing && (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid rgba(197,138,46,0.32)",
              borderRadius: 14,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#854F0B",
                  fontWeight: 700,
                }}
              >
                {t("debts.paywall.optionUnit") || "À la carte"}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#854F0B",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                }}
                className="bmd-num"
              >
                {(pricing.priceCents / 100).toFixed(2).replace(".", ",")}{" "}
                {pricing.currency === "EUR" ? "€" : pricing.currency}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#4A3D2E",
                marginBottom: 12,
                lineHeight: 1.4,
              }}
            >
              {t("debts.paywall.unitHint") ||
                "Paie cette signature uniquement, sans engagement."}
            </div>
            <button
              type="button"
              onClick={onBuyUnit}
              disabled={!!loading}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background:
                  loading === "unit"
                    ? "rgba(197,138,46,0.4)"
                    : "linear-gradient(135deg, #C58A2E, #854F0B)",
                color: "#FBF6EC",
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading === "unit"
                ? t("debts.paywall.processing") || "Traitement…"
                : t("debts.paywall.buyUnit") || "Payer cette signature"}
            </button>
          </div>
        )}

        {/* Options Pack Booster (Sérénité + Affaires) */}
        {packs.map((pack) => {
          const isAffairs = pack.code === "SIGN_PACK_AFFAIRS";
          const accent = isAffairs ? "#1F7A57" : "#C58A2E";
          const savings =
            pricing && pack.advancedIncluded > 0
              ? Math.round(
                  (1 -
                    pack.priceCents /
                      (pack.advancedIncluded * pricing.priceCents)) *
                    100,
                )
              : 0;
          return (
            <div
              key={pack.code}
              style={{
                background: "#FFFFFF",
                border: `1px solid ${accent}40`,
                borderRadius: 14,
                padding: 16,
                marginBottom: 12,
                position: "relative",
              }}
            >
              {savings >= 25 && (
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    padding: "2px 8px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    borderRadius: 999,
                    background: `${accent}20`,
                    color: accent,
                    textTransform: "uppercase",
                  }}
                  className="bmd-num"
                >
                  -{savings}%
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  paddingRight: savings >= 25 ? 60 : 0,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: accent,
                    fontWeight: 700,
                  }}
                >
                  {pack.name}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: accent,
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                  }}
                  className="bmd-num"
                >
                  {(pack.priceCents / 100).toFixed(2).replace(".", ",")}{" "}
                  {pack.currency === "EUR" ? "€" : pack.currency}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#2B1F15",
                  marginBottom: 4,
                }}
              >
                <strong className="bmd-num">{pack.advancedIncluded}</strong>{" "}
                ADVANCED
                {pack.notarizedIncluded > 0 && (
                  <>
                    {" + "}
                    <strong className="bmd-num">
                      {pack.notarizedIncluded}
                    </strong>{" "}
                    NOTARIZED
                  </>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#6B5A47",
                  marginBottom: 12,
                  fontStyle: "italic",
                }}
              >
                {t("debts.paywall.validFor") || "Valable"}{" "}
                <span className="bmd-num">{pack.durationDays}</span>{" "}
                {t("debts.paywall.days") || "jours"}
              </div>
              <button
                type="button"
                onClick={() =>
                  onBuyPack(
                    pack.code as "SIGN_PACK_SERENITY" | "SIGN_PACK_AFFAIRS",
                  )
                }
                disabled={!!loading}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    loading === pack.code
                      ? `${accent}55`
                      : `linear-gradient(135deg, ${accent}, ${accent}dd)`,
                  color: "#FBF6EC",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading === pack.code
                  ? t("debts.paywall.processing") || "Traitement…"
                  : t("debts.paywall.buyPack") || "Acheter ce pack"}
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onClose}
          disabled={!!loading}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: 10,
            border: "1px solid rgba(43,31,21,0.2)",
            background: "transparent",
            color: "#6B5A47",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: 4,
          }}
        >
          {t("common.cancel") || "Annuler"}
        </button>
      </div>
    </div>
  );
}

/**
 * V153.I — Bouton d'action premium dans le header desktop RDD.
 * Variants : primary (gradient saffron), secondary (outline saffron),
 * ghost (texte cocoa, fond ivory pâle).
 */
function ActionButton({
  variant,
  onClick,
  loading = false,
  label,
  loadingLabel,
}: {
  variant: "primary" | "secondary" | "ghost";
  onClick: () => void;
  loading?: boolean;
  label: string;
  loadingLabel?: string;
}): JSX.Element {
  const styles = {
    primary: {
      background: loading
        ? "rgba(43,31,21,0.25)"
        : "linear-gradient(135deg, #C58A2E, #854F0B)",
      color: "#FBF6EC",
      border: "none",
      boxShadow: loading ? "none" : "0 4px 12px rgba(133,79,11,0.25)",
    },
    secondary: {
      background: "#FBF6EC",
      color: "#854F0B",
      border: "1.5px solid #854F0B",
      boxShadow: "none",
    },
    ghost: {
      background: "transparent",
      color: "#6B5A47",
      border: "1px solid rgba(43,31,21,0.18)",
      boxShadow: "none",
    },
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "10px 22px",
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 10,
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        ...styles,
      }}
    >
      {loading && loadingLabel ? loadingLabel : label}
    </button>
  );
}

/**
 * V153.I — Ligne d'action secondaire dans la col droite du détail RDD.
 * Style cocoa/ivory, hover saffron. Icône + label + hint discret.
 */
function SecondaryActionRow({
  icon,
  label,
  hint,
  onClick,
  accent = "#854F0B",
}: {
  icon: string;
  label: string;
  hint: string;
  onClick: () => void;
  accent?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        background: "#FBF6EC",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 10,
        cursor: "pointer",
        display: "flex",
        gap: 10,
        alignItems: "center",
        width: "100%",
        fontFamily: "inherit",
        transition: "background 0.12s ease, border-color 0.12s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "#F4ECD8";
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${accent}40`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "#FBF6EC";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "rgba(43,31,21,0.10)";
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          minWidth: 28,
          borderRadius: 14,
          background: `${accent}15`,
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#2B1F15",
            lineHeight: 1.3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "#6B5A47",
            opacity: 0.85,
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      </div>
    </button>
  );
}
