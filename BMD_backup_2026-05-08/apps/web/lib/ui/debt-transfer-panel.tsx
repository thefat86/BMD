"use client";

/**
 * Panel de gestion des transferts de dette bilatéraux dans un groupe.
 *
 * Affiche :
 *  - Bouton "Proposer un transfert" (visible si l'utilisateur a des dettes)
 *  - Liste des transferts en cours (PROPOSED, ACTIVE) avec actions contextuelles
 *
 * Workflow utilisateur :
 *  1. A clique "Proposer" → form (qui reprend ma dette + envers qui + montant)
 *  2. C reçoit notif → voit le transfert ici → Accepter/Refuser
 *  3. B reçoit notif → voit le transfert ici → Accepter/Refuser
 *  4. Quand les 2 ont validé → status ACTIVE + 2 settlements virtuels
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";

interface Member {
  id: string;
  role: string;
  user: { id: string; displayName: string };
}

interface Props {
  groupId: string;
  group: any;
  meId?: string;
  /** Soldes du groupe (pour pré-sélectionner les créanciers possibles) */
  balance?: any;
  /** Callback à appeler après modification (pour rafraîchir le parent) */
  onChanged?: () => void;
}

export function DebtTransferPanel({
  groupId,
  group,
  meId,
  balance,
  onChanged,
}: Props): JSX.Element {
  const toast = useToast();
  const dialog = useDialog();
  const t = useT();
  const { formatAmount } = useCurrency();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [creditorId, setCreditorId] = useState<string>("");
  const [assumeId, setAssumeId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await api.listDebtTransfers(groupId);
      setItems(list);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function submitProposal() {
    if (!creditorId || !assumeId || !amount.trim()) {
      toast.error(t("debtTransferPanel.completeAllFields"));
      return;
    }
    if (creditorId === assumeId || creditorId === meId || assumeId === meId) {
      toast.error(t("debtTransferPanel.differentPeople"));
      return;
    }
    setSubmitting(true);
    try {
      await api.proposeDebtTransfer(groupId, {
        fromUserId: meId!, // c'est moi qui ai la dette
        assumeUserId: assumeId,
        creditorUserId: creditorId,
        amount,
        reason: reason || undefined,
      });
      toast.success(t("debtTransferPanel.proposalSent"));
      setShowForm(false);
      setCreditorId("");
      setAssumeId("");
      setAmount("");
      setReason("");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(transfer: any, action: string) {
    try {
      switch (action) {
        case "accept-assumer":
          await api.acceptDebtTransferAsAssumer(transfer.id);
          toast.success(t("debtTransfer.accepted"));
          break;
        case "reject-assumer":
          await api.rejectDebtTransferAsAssumer(transfer.id);
          toast.success(t("debtTransfer.rejected"));
          break;
        case "accept-creditor":
          await api.acceptDebtTransferAsCreditor(transfer.id);
          toast.success(t("debtTransfer.accepted"));
          break;
        case "reject-creditor":
          await api.rejectDebtTransferAsCreditor(transfer.id);
          toast.success(t("debtTransfer.rejected"));
          break;
        case "cancel":
          if (
            !(await dialog.confirm(t("group.cancelTransferHint"), {
              variant: "warning",
              title: t("group.cancelTransferTitle"),
              confirmLabel: t("common.cancel"),
              cancelLabel: t("common.yes"),
            }))
          )
            return;
          await api.cancelDebtTransfer(transfer.id);
          toast.success(t("debtTransfer.proposalCancelled"));
          break;
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e);
    }
  }

  // Suggestions de créanciers : personnes à qui je dois (balance négative pour moi)
  const myDebts: Array<{ creditorId: string; name: string; amount: string }> =
    [];
  if (balance?.suggestions) {
    for (const s of balance.suggestions) {
      if (s.fromUserId === meId) {
        myDebts.push({
          creditorId: s.toUserId,
          name: s.toName,
          amount: s.amount,
        });
      }
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>{t("debtTransferPanel.title")}</h2>
        <span className="muted" style={{ fontSize: 11 }}>
          {items.length}
        </span>
      </div>

      <p
        className="muted"
        style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}
      >
        {t("debtTransferPanel.description")}
      </p>

      {!showForm && myDebts.length > 0 && (
        <button
          className="btn btn-block"
          onClick={() => setShowForm(true)}
          style={{ marginBottom: 12 }}
        >
          ＋ {t("group.proposeTransfer")}
        </button>
      )}

      {showForm && (
        <div
          style={{
            padding: 12,
            background: "var(--overlay)",
            borderRadius: 12,
            border: "1px solid var(--saffron, #E8A33D)",
            marginBottom: 12,
          }}
        >
          <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
            {t("debtTransferPanel.formTitle")}
          </div>

          {/* Sélection créancier */}
          <div className="field">
            <label>1. {t("group.transferWhoCredited")}</label>
            <select
              value={creditorId}
              onChange={(e) => setCreditorId(e.target.value)}
            >
              <option value="" disabled>
                {t("group.selectCreditor")}
              </option>
              {myDebts.length > 0 ? (
                myDebts.map((d) => (
                  <option key={d.creditorId} value={d.creditorId}>
                    {d.name} (env. {d.amount})
                  </option>
                ))
              ) : (
                group.members
                  .filter((m: Member) => m.user.id !== meId)
                  .map((m: Member) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.displayName}
                    </option>
                  ))
              )}
            </select>
          </div>

          {/* Sélection repreneur */}
          <div className="field">
            <label>2. {t("group.transferWhoAssumes")}</label>
            <select
              value={assumeId}
              onChange={(e) => setAssumeId(e.target.value)}
            >
              <option value="" disabled>
                {t("group.selectAssumer")}
              </option>
              {group.members
                .filter(
                  (m: Member) =>
                    m.user.id !== meId && m.user.id !== creditorId,
                )
                .map((m: Member) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.displayName}
                  </option>
                ))}
            </select>
          </div>

          {/* Montant */}
          <div className="field">
            <label>3. {t("group.amountLabel", { currency: group.defaultCurrency })}</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={
                myDebts.find((d) => d.creditorId === creditorId)?.amount ?? "0"
              }
            />
          </div>

          {/* Raison optionnelle */}
          <div className="field">
            <label>{t("group.transferReason")}</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Je l'ai dépanné de mon côté"
              maxLength={500}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-ghost"
              onClick={() => setShowForm(false)}
              style={{ flex: 1 }}
            >
              {t("common.cancel")}
            </button>
            <button
              className="btn"
              onClick={submitProposal}
              disabled={submitting}
              style={{ flex: 2 }}
            >
              {submitting ? t("debtTransferPanel.submitting") : "✓ " + t("debtTransferPanel.submitBtn")}
            </button>
          </div>
        </div>
      )}

      {loading && <p className="muted" style={{ fontSize: 12 }}>{t("common.loading")}</p>}

      {!loading && items.length === 0 && (
        <p
          className="muted text-center"
          style={{ padding: "12px 0", fontSize: 12 }}
        >
          {t("group.noTransferActive")}
        </p>
      )}

      {!loading &&
        items.map((t: any) => {
          const isFrom = t.fromUserId === meId;
          const isAssumer = t.assumeUserId === meId;
          const isCreditor = t.creditorUserId === meId;
          const isProposer = t.proposedById === meId;
          const isAdmin =
            group.members.find((m: Member) => m.user.id === meId)?.role ===
            "ADMIN";

          return (
            <div
              key={t.id}
              style={{
                padding: 12,
                background:
                  t.status === "ACTIVE"
                    ? "rgba(16,185,129,0.06)"
                    : "rgba(232,163,61,0.04)",
                border: `1px solid ${
                  t.status === "ACTIVE"
                    ? "var(--emerald, #10b981)"
                    : "var(--saffron, #E8A33D)"
                }`,
                borderRadius: 10,
                marginBottom: 8,
              }}
            >
              {/* Statut */}
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.4,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color:
                    t.status === "ACTIVE"
                      ? "var(--emerald, #10b981)"
                      : "var(--saffron, #E8A33D)",
                  marginBottom: 6,
                }}
              >
                {t.status === "PROPOSED" && t("debtTransferPanel.statusWaiting")}
                {t.status === "ACTIVE" && t("debtTransferPanel.statusActive")}
                {t.status === "REJECTED" && t("debtTransferPanel.statusRejected")}
                {t.status === "CANCELLED" && t("debtTransferPanel.statusCancelled")}
              </div>

              {/* Le flux : A → C → B */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <span>
                  <strong>{t.fromUser.displayName}</strong>
                  <small style={{ color: "var(--cream-soft)" }}>
                    {" "}
                    {`(${t("debtTransferPanel.debtor").replace(/[()]/g, "")})`}
                  </small>
                </span>
                <span style={{ color: "var(--saffron, #E8A33D)" }}>→</span>
                <span>
                  <strong>{t.assumeUser.displayName}</strong>
                  <small style={{ color: "var(--cream-soft)" }}>
                    {" "}
                    {`(${t("debtTransferPanel.assumes").replace(/[()]/g, "")})`}
                  </small>
                </span>
                <span style={{ color: "var(--saffron, #E8A33D)" }}>→</span>
                <span>
                  <strong>{t.creditor.displayName}</strong>
                  <small style={{ color: "var(--cream-soft)" }}>
                    {" "}
                    {`(${t("debtTransferPanel.creditor").replace(/[()]/g, "")})`}
                  </small>
                </span>
              </div>

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--saffron, #E8A33D)",
                  marginBottom: 4,
                }}
              >
                {parseFloat(t.amount).toFixed(2)} {t.currency}
              </div>
              {t.reason && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cream-soft, #c9bfae)",
                    fontStyle: "italic",
                    marginBottom: 8,
                  }}
                >
                  « {t.reason} »
                </div>
              )}

              {/* Indicateurs de validation */}
              {t.status === "PROPOSED" && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 11,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      color: t.acceptedByAssumer
                        ? "var(--emerald, #10b981)"
                        : "var(--cream-soft, #c9bfae)",
                    }}
                  >
                    {t.acceptedByAssumer ? "✓" : "⏳"} {t.assumeUser.displayName}
                  </span>
                  <span
                    style={{
                      color: t.acceptedByCreditor
                        ? "var(--emerald, #10b981)"
                        : "var(--cream-soft, #c9bfae)",
                    }}
                  >
                    {t.acceptedByCreditor ? "✓" : "⏳"} {t.creditor.displayName}
                  </span>
                </div>
              )}

              {/* Actions selon mon rôle */}
              {t.status === "PROPOSED" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {isAssumer && !t.acceptedByAssumer && (
                    <>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => handleAction(t, "reject-assumer")}
                      >
                        {t("debtTransferPanel.rejectBtn")}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleAction(t, "accept-assumer")}
                      >
                        {t("debtTransferPanel.acceptBtn")}
                      </button>
                    </>
                  )}
                  {isCreditor && !t.acceptedByCreditor && (
                    <>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => handleAction(t, "reject-creditor")}
                      >
                        {t("debtTransferPanel.rejectBtn")}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleAction(t, "accept-creditor")}
                      >
                        {t("debtTransferPanel.acceptCreditorBtn")}
                      </button>
                    </>
                  )}
                  {(isProposer || isAdmin) && (
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => handleAction(t, "cancel")}
                      style={{ color: "var(--rose, #ef4444)" }}
                    >
                      {t("debtTransferPanel.cancelBtn")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
