"use client";

/**
 * V222.F + V223.C/D — OptimalSettlementPlan
 * ============================================================================
 * Carte cream à droite de la constellation. Liste numérotée des transferts
 * optimaux (sortie de computeMinSettlements). Pour chaque ligne :
 *   `N. {fromName} → {toName} : {amount} [Marquer payé]`
 *
 * V223.C — Le bouton "Marquer payé" ouvre désormais une vraie modale
 *   `MarkPaidConfirmSheet` avec :
 *     - résumé clair "Tu confirmes que X a reçu Y € de Z"
 *     - date du paiement (date picker)
 *     - méthode de paiement (SegmentedControl)
 *     - note optionnelle
 *     - 2 boutons "Annuler" / "Confirmer"
 *
 * V223.D — Le bouton "Proposer un swap" ouvre `ProposeSwapSheet` :
 *     - description pédagogique
 *     - 2 selects (ma dette à compenser + ce qu'on me doit)
 *     - preview du swap
 *     - création de 2 settlements en cascade
 *     - TODO V223.D : race condition possible si call 2 échoue → idéalement
 *       atomiser côté backend (`api.proposeSwap`).
 *
 * Les champs paymentMethod/paymentReference/paidAt ne sont PAS supportés
 * actuellement par l'endpoint `createSettlement` (V141 → c'est `confirmPayment`
 * via token qui les gère). On stocke localement dans une note logguée jusqu'à
 * ce que l'endpoint accepte ces métadonnées. TODO V223.C backend.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";
import { SegmentedControl } from "./segmented-control";

export interface PlanTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export function OptimalSettlementPlan({
  groupId,
  transfers,
  grossCount,
  currency,
  members,
  meId,
  formatAmount,
  onChange,
  // i18n
  titleLabel,
  subtitleTemplate,
  savingsHintTemplate,
  markPaidLabel,
  proposeSwapLabel,
  proposeSwapToastSoon: _proposeSwapToastSoon,
  emptyLabel,
  // V223.C confirm sheet
  confirmTitleLabel,
  /**
   * V225.B — Callback qui retourne le body interpolé (avec **bold**).
   * Le parent fait `t("group.debts.confirmPaymentBody", { to, from, amount })`
   * directement avec les vraies valeurs. Plus de "template" à interpoler ici.
   */
  formatConfirmBody,
  confirmDateLabel,
  confirmMethodLabel,
  confirmNoteLabel,
  confirmSubmitLabel,
  cancelLabel,
  methodCashLabel,
  methodTransferLabel,
  methodMobileLabel,
  methodOtherLabel,
  // V223.D swap sheet
  swapTitleLabel,
  swapIntroLabel,
  swapStep1Label,
  swapMyDebtLabel,
  swapTheirDebtLabel,
  swapSubmitLabel,
  swapEmptyLabel,
  swapPreviewTemplate,
}: {
  groupId: string;
  transfers: PlanTransfer[];
  grossCount: number;
  currency: string;
  members: Array<{ id: string; displayName: string }>;
  /** V223.D — ID de l'utilisateur courant pour proposer un swap depuis son POV */
  meId?: string;
  formatAmount: (amount: number, currency: string) => string;
  onChange?: () => void;
  titleLabel: string;
  subtitleTemplate: string;
  savingsHintTemplate: string;
  markPaidLabel: string;
  proposeSwapLabel: string;
  proposeSwapToastSoon: string;
  emptyLabel: string;
  // V223.C
  confirmTitleLabel?: string;
  /**
   * V225.B — Callback qui prend les vraies valeurs (noms + montant formaté)
   * et retourne le texte du body déjà interpolé. Le **bold** est conservé
   * pour le post-traitement visuel (split sur `**`).
   * Avant V225.B : on passait un "template" avec `{{to}}` style mustache, mais
   * le système BMD utilise `{x}` single-brace → conflit + accolades visibles.
   */
  formatConfirmBody?: (args: {
    to: string;
    from: string;
    amount: string;
  }) => string;
  confirmDateLabel?: string;
  confirmMethodLabel?: string;
  confirmNoteLabel?: string;
  confirmSubmitLabel?: string;
  cancelLabel?: string;
  methodCashLabel?: string;
  methodTransferLabel?: string;
  methodMobileLabel?: string;
  methodOtherLabel?: string;
  // V223.D
  swapTitleLabel?: string;
  swapIntroLabel?: string;
  swapStep1Label?: string;
  swapMyDebtLabel?: string;
  swapTheirDebtLabel?: string;
  swapSubmitLabel?: string;
  swapEmptyLabel?: string;
  swapPreviewTemplate?: string;
}): JSX.Element {
  const toast = useToast();
  // V223.C — Modale de confirmation paiement
  const [confirmingTransfer, setConfirmingTransfer] =
    useState<PlanTransfer | null>(null);
  const [paying, setPaying] = useState(false);
  // V223.D — Modale swap
  const [swapOpen, setSwapOpen] = useState(false);

  function nameOf(userId: string): string {
    return members.find((m) => m.id === userId)?.displayName ?? "—";
  }

  // V225.B — fillTemplate accepte SINGLE-brace `{x}` (cohérent avec les
  // strings i18n BMD et le t() qui matche `\{(\w+)\}`). On garde un fallback
  // pour double-brace `{{x}}` au cas où des call-sites legacy n'ont pas
  // été migrés (no-op si rien ne matche → pas de régression).
  function fillTemplate(
    template: string,
    values: Record<string, string | number>,
  ): string {
    let s = template;
    for (const [k, v] of Object.entries(values)) {
      // Double-brace d'abord (legacy) — sinon le replace single avalerait
      // un seul `{` autour d'un déjà-remplacé.
      s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
      s = s.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, "g"), String(v));
    }
    return s;
  }

  // V223.C — Soumission depuis la confirm sheet
  async function submitMarkPaid(input: {
    paidAt: string;
    paymentMethod: string;
    note: string;
  }) {
    if (!confirmingTransfer) return;
    const t = confirmingTransfer;
    setPaying(true);
    try {
      // TODO V223.C — Backend `createSettlement` n'accepte pas encore
      // paidAt/paymentMethod/paymentReference. On les loggue mais on
      // crée le settlement minimal pour ne pas bloquer.
      // Idéalement étendre `/groups/:id/settlements` body pour accepter
      // ces champs et persister la métadonnée.
      console.info("[V223.C] markPaid metadata (TODO backend persist)", {
        paidAt: input.paidAt,
        paymentMethod: input.paymentMethod,
        note: input.note,
      });
      await api.createSettlement(groupId, {
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        amount: t.amount.toFixed(2),
        currency,
      });
      toast.success(markPaidLabel);
      setConfirmingTransfer(null);
      onChange?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setPaying(false);
    }
  }

  if (transfers.length === 0) {
    return (
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid #D9C8A6",
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
          color: "#6B5A47",
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 30, marginBottom: 6 }}>✓</div>
        {emptyLabel}
      </div>
    );
  }

  const savedTransfers = Math.max(0, grossCount - transfers.length);

  return (
    <>
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid #D9C8A6",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "#2B1F15",
            }}
          >
            {titleLabel}
          </h3>
          <div
            style={{
              fontSize: 11,
              color: "#8B6F47",
              marginTop: 2,
            }}
          >
            {fillTemplate(subtitleTemplate, {
              n: transfers.length,
              m: grossCount,
            })}
          </div>
        </div>

        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {transfers.map((t, i) => {
            const key = `${t.fromUserId}-${t.toUserId}-${t.amount}`;
            return (
              <li
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 10px",
                  background: "#FAF6EE",
                  border: "0.5px solid #EEE4CC",
                  borderRadius: 9,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#F4ECD9",
                      color: "#2B1F15",
                      fontSize: 11,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      border: "0.5px solid #D9C8A6",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#2B1F15",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <strong style={{ fontWeight: 500 }}>
                      {nameOf(t.fromUserId)}
                    </strong>
                    {" → "}
                    <strong style={{ fontWeight: 500 }}>
                      {nameOf(t.toUserId)}
                    </strong>
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#9F4628",
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAmount(t.amount, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmingTransfer(t)}
                    style={{
                      padding: "4px 8px",
                      background: "#C58A2E",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {markPaidLabel}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {savedTransfers > 0 && (
          <div
            style={{
              fontSize: 11,
              color: "#1F7A57",
              padding: "8px 10px",
              background: "#EBF5F0",
              borderRadius: 7,
            }}
          >
            ✦ {fillTemplate(savingsHintTemplate, { n: savedTransfers })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setSwapOpen(true)}
          style={{
            alignSelf: "flex-start",
            padding: "6px 12px",
            background: "transparent",
            color: "#2B1F15",
            border: "0.5px solid #D9C8A6",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "inherit",
            cursor: "pointer",
            marginTop: 2,
          }}
        >
          {proposeSwapLabel}
        </button>
      </div>

      {/* V223.C — Modale de confirmation paiement
          V225.B — On passe une fonction qui produit le body interpolé à la
          demande, avec les vraies valeurs (noms + montant). Plus d'accolades
          visibles : le parent utilise `t()` BMD avec `{x}` single-brace. */}
      {confirmingTransfer && (
        <MarkPaidConfirmSheet
          transfer={confirmingTransfer}
          currency={currency}
          fromName={nameOf(confirmingTransfer.fromUserId)}
          toName={nameOf(confirmingTransfer.toUserId)}
          formatAmount={formatAmount}
          paying={paying}
          onCancel={() => setConfirmingTransfer(null)}
          onSubmit={submitMarkPaid}
          titleLabel={confirmTitleLabel || "Confirmer le règlement"}
          bodyText={(() => {
            const toName = nameOf(confirmingTransfer.toUserId);
            const fromName = nameOf(confirmingTransfer.fromUserId);
            const amountStr = formatAmount(
              confirmingTransfer.amount,
              currency,
            );
            if (formatConfirmBody) {
              return formatConfirmBody({
                to: toName,
                from: fromName,
                amount: amountStr,
              });
            }
            return `Tu confirmes que **${toName}** a reçu **${amountStr}** de **${fromName}** pour solder leurs dépenses partagées.`;
          })()}
          dateLabel={confirmDateLabel || "Date du paiement"}
          methodLabel={confirmMethodLabel || "Méthode"}
          noteLabel={confirmNoteLabel || "Référence ou commentaire (optionnel)"}
          submitLabel={confirmSubmitLabel || "Confirmer le paiement"}
          cancelLabel={cancelLabel || "Annuler"}
          methodCashLabel={methodCashLabel || "Espèces"}
          methodTransferLabel={methodTransferLabel || "Virement"}
          methodMobileLabel={methodMobileLabel || "Mobile money"}
          methodOtherLabel={methodOtherLabel || "Autre"}
        />
      )}

      {/* V223.D — Modale swap */}
      {swapOpen && (
        <ProposeSwapSheet
          open={swapOpen}
          onClose={() => setSwapOpen(false)}
          groupId={groupId}
          currency={currency}
          meId={meId ?? ""}
          transfers={transfers}
          members={members}
          formatAmount={formatAmount}
          onChange={onChange}
          titleLabel={swapTitleLabel || "Proposer un swap de dette"}
          introLabel={
            swapIntroLabel ||
            "Compense deux dettes en croix d'un seul coup."
          }
          step1Label={swapStep1Label || "Sélectionne 2 dettes à compenser"}
          myDebtLabel={swapMyDebtLabel || "Ma dette envers"}
          theirDebtLabel={swapTheirDebtLabel || "Ce qu'on me doit"}
          submitLabel={swapSubmitLabel || "Confirmer le swap"}
          emptyLabel={swapEmptyLabel || "Aucun swap possible pour le moment."}
          cancelLabel={cancelLabel || "Annuler"}
          previewTemplate={
            swapPreviewTemplate ||
            "Si tu acceptes : tu ne dois plus rien à {{a}}, et {{b}} ne te doit plus que {{remainder}} au lieu de {{originalB}}."
          }
        />
      )}
    </>
  );
}

// ===========================================================================
// V223.C — MarkPaidConfirmSheet : modale enrichie pour confirmer un paiement
// ===========================================================================

function MarkPaidConfirmSheet({
  transfer: _transfer,
  currency: _currency,
  fromName: _fromName,
  toName: _toName,
  formatAmount: _formatAmount,
  paying,
  onCancel,
  onSubmit,
  titleLabel,
  bodyText,
  dateLabel,
  methodLabel,
  noteLabel,
  submitLabel,
  cancelLabel,
  methodCashLabel,
  methodTransferLabel,
  methodMobileLabel,
  methodOtherLabel,
}: {
  transfer: PlanTransfer;
  currency: string;
  fromName: string;
  toName: string;
  formatAmount: (amount: number, currency: string) => string;
  paying: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    paidAt: string;
    paymentMethod: string;
    note: string;
  }) => void | Promise<void>;
  titleLabel: string;
  /** V225.B — Texte déjà interpolé, peut contenir des **bold** à valoriser. */
  bodyText: string;
  dateLabel: string;
  methodLabel: string;
  noteLabel: string;
  submitLabel: string;
  cancelLabel: string;
  methodCashLabel: string;
  methodTransferLabel: string;
  methodMobileLabel: string;
  methodOtherLabel: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [paidAt, setPaidAt] = useState<string>(today);
  const [method, setMethod] = useState<
    "CASH" | "TRANSFER" | "MOBILE" | "OTHER"
  >("CASH");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // V225.B — Le body est déjà interpolé par le parent. On split simplement
  // sur `**` pour appliquer le gras. Plus aucune accolade `{x}` ni `{{x}}`
  // à parser ici → plus de bug "accolades visibles" dans la popup.
  function renderBody(): JSX.Element {
    const parts = bodyText.split(/\*\*/);
    return (
      <>
        {parts.map((part, i) => {
          const isBold = i % 2 === 1;
          return isBold ? (
            <strong key={i} style={{ fontWeight: 700, color: "#2B1F15" }}>
              {part}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          );
        })}
      </>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !paying) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid #D9C8A6",
          borderRadius: 14,
          padding: 20,
          width: "min(460px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(43,31,21,0.20)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "#2B1F15",
          }}
        >
          {titleLabel}
        </h3>

        {/* Bloc résumé */}
        <div
          style={{
            background: "#F4ECD9",
            border: "0.5px solid #D9C8A6",
            borderRadius: 11,
            padding: 12,
            fontSize: 13,
            color: "#2B1F15",
            lineHeight: 1.5,
          }}
        >
          {renderBody()}
        </div>

        {/* Date */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {dateLabel}
          </label>
          <input
            type="date"
            value={paidAt}
            max={today}
            onChange={(e) => setPaidAt(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#FAF6EE",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              color: "#2B1F15",
              fontFamily: "inherit",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Méthode */}
        <div>
          <div
            style={{
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {methodLabel}
          </div>
          <SegmentedControl<"CASH" | "TRANSFER" | "MOBILE" | "OTHER">
            value={method}
            onChange={setMethod}
            size="sm"
            fullWidth
            ariaLabel={methodLabel}
            segments={[
              { value: "CASH", label: methodCashLabel },
              { value: "TRANSFER", label: methodTransferLabel },
              { value: "MOBILE", label: methodMobileLabel },
              { value: "OTHER", label: methodOtherLabel },
            ]}
          />
        </div>

        {/* Note */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {noteLabel}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={noteLabel}
            style={{
              width: "100%",
              padding: 10,
              background: "#FAF6EE",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              color: "#2B1F15",
              fontFamily: "inherit",
              fontSize: 13,
              resize: "vertical",
              minHeight: 60,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* CTAs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={paying}
            style={{
              padding: "10px 14px",
              background: "transparent",
              color: "#2B1F15",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              cursor: paying ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() =>
              void onSubmit({
                paidAt,
                paymentMethod: method,
                note,
              })
            }
            disabled={paying}
            style={{
              padding: "10px 14px",
              background: paying ? "#D9C8A6" : "#C58A2E",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              cursor: paying ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {paying ? "…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// V223.D — ProposeSwapSheet : compensation triangulaire entre 2 dettes
// ===========================================================================

function ProposeSwapSheet({
  open,
  onClose,
  groupId,
  currency,
  meId,
  transfers,
  members,
  formatAmount,
  onChange,
  titleLabel,
  introLabel,
  step1Label,
  myDebtLabel,
  theirDebtLabel,
  submitLabel,
  emptyLabel,
  cancelLabel,
  previewTemplate,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  currency: string;
  meId: string;
  transfers: PlanTransfer[];
  members: Array<{ id: string; displayName: string }>;
  formatAmount: (amount: number, currency: string) => string;
  onChange?: () => void;
  titleLabel: string;
  introLabel: string;
  step1Label: string;
  myDebtLabel: string;
  theirDebtLabel: string;
  submitLabel: string;
  emptyLabel: string;
  cancelLabel: string;
  previewTemplate: string;
}) {
  const toast = useToast();
  const myDebts = useMemo(
    () => transfers.filter((t) => t.fromUserId === meId),
    [transfers, meId],
  );
  const owedToMe = useMemo(
    () => transfers.filter((t) => t.toUserId === meId),
    [transfers, meId],
  );
  const [myDebtIdx, setMyDebtIdx] = useState<number>(0);
  const [theirDebtIdx, setTheirDebtIdx] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  function nameOf(userId: string): string {
    return members.find((m) => m.id === userId)?.displayName ?? "—";
  }

  // V225.B — fillTemplate single-brace `{x}` + fallback double `{{x}}` legacy.
  function fillTemplate(
    tpl: string,
    vars: Record<string, string | number>,
  ): string {
    let s = tpl;
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
      s = s.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, "g"), String(v));
    }
    return s;
  }

  const canSwap = myDebts.length > 0 && owedToMe.length > 0;
  const myDebt = myDebts[myDebtIdx];
  const theirDebt = owedToMe[theirDebtIdx];
  const swapAmount =
    myDebt && theirDebt ? Math.min(myDebt.amount, theirDebt.amount) : 0;

  async function handleSubmit() {
    if (!myDebt || !theirDebt || swapAmount < 0.01) {
      toast.error(new Error(emptyLabel));
      return;
    }
    setSubmitting(true);
    try {
      // TODO V223.D — Race condition possible si call 2 échoue après call 1
      // réussit. Atomiser via backend `api.proposeSwap` (à créer).
      // Pour la beta, la double-création de settlements côté frontend
      // est acceptable.
      // Settlement 1 : moi → la personne à qui je devais
      await api.createSettlement(groupId, {
        fromUserId: meId,
        toUserId: myDebt.toUserId,
        amount: swapAmount.toFixed(2),
        currency,
      });
      // Settlement 2 : la personne qui me devait → moi
      await api.createSettlement(groupId, {
        fromUserId: theirDebt.fromUserId,
        toUserId: meId,
        amount: swapAmount.toFixed(2),
        currency,
      });
      toast.success(submitLabel);
      onChange?.();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid #D9C8A6",
          borderRadius: 14,
          padding: 20,
          width: "min(520px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(43,31,21,0.20)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "#2B1F15",
          }}
        >
          {titleLabel}
        </h3>

        {/* Description pédagogique */}
        <div
          style={{
            background: "#FAF6EE",
            border: "0.5px solid #EEE4CC",
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
            color: "#6B5A47",
            lineHeight: 1.5,
          }}
        >
          {introLabel}
        </div>

        {!canSwap ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "#6B5A47",
              fontSize: 13,
              background: "#F4ECD9",
              borderRadius: 10,
            }}
          >
            {emptyLabel}
          </div>
        ) : (
          <>
            {/* Étape 1 : sélection */}
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              {step1Label}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {/* Ma dette */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#9F4628",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {myDebtLabel}
                </label>
                <select
                  value={myDebtIdx}
                  onChange={(e) => setMyDebtIdx(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#FAF6EE",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 9,
                    color: "#2B1F15",
                    fontFamily: "inherit",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                >
                  {myDebts.map((d, i) => (
                    <option key={`m${i}`} value={i}>
                      {nameOf(d.toUserId)} · {formatAmount(d.amount, currency)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ce qu'on me doit */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#1F7A57",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {theirDebtLabel}
                </label>
                <select
                  value={theirDebtIdx}
                  onChange={(e) => setTheirDebtIdx(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#FAF6EE",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 9,
                    color: "#2B1F15",
                    fontFamily: "inherit",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                >
                  {owedToMe.map((d, i) => (
                    <option key={`t${i}`} value={i}>
                      {nameOf(d.fromUserId)} · {formatAmount(d.amount, currency)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview swap */}
            {myDebt && theirDebt && swapAmount >= 0.01 && (
              <div
                style={{
                  background: "#F4ECD9",
                  border: "0.5px solid #D9C8A6",
                  borderRadius: 11,
                  padding: 12,
                  fontSize: 13,
                  color: "#2B1F15",
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#8B6F47",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  ↗ Preview
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#C58A2E",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontVariantNumeric: "tabular-nums",
                    marginBottom: 6,
                  }}
                >
                  {formatAmount(swapAmount, currency)}
                </div>
                <div style={{ fontSize: 12 }}>
                  {fillTemplate(previewTemplate, {
                    a: nameOf(myDebt.toUserId),
                    b: nameOf(theirDebt.fromUserId),
                    remainder: formatAmount(
                      theirDebt.amount - swapAmount,
                      currency,
                    ),
                    originalB: formatAmount(theirDebt.amount, currency),
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* CTAs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "10px 14px",
              background: "transparent",
              color: "#2B1F15",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              !canSwap ||
              !myDebt ||
              !theirDebt ||
              swapAmount < 0.01
            }
            style={{
              padding: "10px 14px",
              background:
                submitting || !canSwap || swapAmount < 0.01
                  ? "#D9C8A6"
                  : "#C58A2E",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              cursor:
                submitting || !canSwap || swapAmount < 0.01
                  ? "not-allowed"
                  : "pointer",
              fontFamily: "inherit",
              opacity: !canSwap || swapAmount < 0.01 ? 0.6 : 1,
            }}
          >
            {submitting ? "…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
