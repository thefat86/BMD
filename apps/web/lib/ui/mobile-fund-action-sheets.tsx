"use client";

/**
 * V201 — BottomSheets d'action sur une caisse projet.
 * =============================================================================
 * Bundle de 3 sheets dans un seul fichier (lazy-loaded ensemble depuis le
 * détail caisse) :
 *
 *   - MobileContributeSheet : déclarer une cotisation (montant + devise +
 *     méthode + preuve URL + note). PENDING tant que le trésorier ne valide pas.
 *
 *   - MobileProposeExpenseSheet : trésorier propose une dépense (motif +
 *     montant + bénéficiaire + preuve). Passe en PENDING_VOTE si seuil
 *     dépassé, sinon APPROVED directement.
 *
 *   - MobileRejectContributionSheet : trésorier refuse une cotisation
 *     avec un motif libre. Action définitive.
 *
 * Bannière « Registre » dans Contribute pour rappeler que BMD n'encaisse pas.
 */

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { FundsLegalNotice } from "./funds-legal-notice";

// ============================================================================
// 1. MobileContributeSheet — déclarer une cotisation
// ============================================================================

type Method = "TRANSFER" | "MOBILE_MONEY" | "CASH" | "CARD" | "OTHER";

export function MobileContributeSheet({
  fundId,
  fundCurrency,
  onClose,
  onContributed,
}: {
  fundId: string;
  fundCurrency: string;
  onClose: () => void;
  onContributed: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(fundCurrency);
  const [method, setMethod] = useState<Method>("TRANSFER");
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid =
    !!amount && parseFloat(amount) > 0 && currency.length === 3;

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await api.contributeToProjectFund(fundId, {
        amount: parseFloat(amount),
        currency,
        method,
        note: note.trim() || undefined,
        proofUrl: proofUrl.trim() || undefined,
      });
      onContributed();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  const METHODS: Array<{ key: Method; label: string }> = [
    {
      key: "TRANSFER",
      label: t("funds.method.transfer") || "Virement",
    },
    {
      key: "MOBILE_MONEY",
      label: t("funds.method.mobile_money") || "Mobile money",
    },
    { key: "CASH", label: t("funds.method.cash") || "Espèces" },
    { key: "CARD", label: t("funds.method.card") || "Carte" },
    { key: "OTHER", label: t("funds.method.other") || "Autre" },
  ];

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t("funds.contribute.title") || "Déclarer une cotisation"}
    >
      <div style={{ padding: "8px 16px 24px", display: "grid", gap: 14 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--saffron, #C58A2E)",
              letterSpacing: 1.4,
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {t("funds.contribute.kicker") || "Cotisation"}
          </div>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              color: "var(--cocoa, #2B1F15)",
            }}
          >
            {t("funds.contribute.title") || "Déclarer une cotisation"}
          </h2>
        </div>

        <FundsLegalNotice variant="compact" />

        <Field label={t("funds.contribute.amountLabel") || "Montant"}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50"
            autoFocus
            style={inputStyle({ size: "large" })}
          />
        </Field>

        <Field label={t("funds.contribute.currencyLabel") || "Devise"}>
          <input
            value={currency}
            onChange={(e) =>
              setCurrency(e.target.value.toUpperCase().slice(0, 3))
            }
            maxLength={3}
            style={inputStyle({ uppercase: true })}
          />
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            {currency !== fundCurrency
              ? t("funds.contribute.fxNote", {
                  fundCurrency,
                }) ||
                `Convertie automatiquement en ${fundCurrency} selon le taux du jour.`
              : t("funds.contribute.sameCurrencyNote") ||
                "Même devise que la caisse."}
          </p>
        </Field>

        <Field
          label={t("funds.contribute.methodLabel") || "Moyen de paiement"}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className="bmd-tap"
                style={pillStyle(method === m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={t("funds.contribute.proofLabel") || "Preuve (optionnel)"}
        >
          {/* V203.C — Upload light : picker fichier → data URI base64.
              Limite ~ 500 Ko (Resize natif côté navigateur si > limite).
              Pour des fichiers plus gros, l'user peut coller une URL externe. */}
          <ProofPicker
            value={proofUrl}
            onChange={setProofUrl}
            t={t}
          />
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            {t("funds.contribute.proofHint") ||
              "Capture du virement, photo du reçu mobile money, etc. Renforce la confiance."}
          </p>
        </Field>

        <Field label={t("funds.contribute.noteLabel") || "Note (optionnel)"}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={
              t("funds.contribute.notePlaceholder") || "Un mot à propos…"
            }
            style={{
              ...inputStyle(),
              resize: "vertical",
              minHeight: 60,
            }}
          />
        </Field>

        <button
          type="button"
          disabled={!valid || submitting}
          onClick={submit}
          className="bmd-tap"
          style={primaryButtonStyle(!valid || submitting)}
        >
          {submitting
            ? t("common.loading") || "Envoi…"
            : `✓ ${t("funds.contribute.submit") || "Déclarer ma cotisation"}`}
        </button>
      </div>
    </BottomSheet>
  );
}

// ============================================================================
// 2. MobileProposeExpenseSheet — trésorier propose une dépense
// ============================================================================

export function MobileProposeExpenseSheet({
  fundId,
  fundCurrency,
  availableBalance,
  onClose,
  onProposed,
}: {
  fundId: string;
  fundCurrency: string;
  availableBalance: number;
  onClose: () => void;
  onProposed: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [motive, setMotive] = useState("");
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amountNum = parseFloat(amount);
  const valid =
    motive.trim().length >= 2 &&
    !!amount &&
    amountNum > 0;
  const exceedsBalance = amountNum > availableBalance;

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await api.proposeProjectFundExpense(fundId, {
        motive: motive.trim(),
        amount: amountNum,
        beneficiary: beneficiary.trim() || undefined,
        proofUrl: proofUrl.trim() || undefined,
      });
      onProposed();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t("funds.proposeExpense.title") || "Proposer une dépense"}
    >
      <div style={{ padding: "8px 16px 24px", display: "grid", gap: 14 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--v45-emerald, #1F7A57)",
              letterSpacing: 1.4,
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {t("funds.proposeExpense.kicker") || "Dépense"}
          </div>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              color: "var(--cocoa, #2B1F15)",
            }}
          >
            {t("funds.proposeExpense.title") || "Proposer une dépense"}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            {t("funds.proposeExpense.balanceAvailable", {
              balance: availableBalance.toFixed(0),
              currency: fundCurrency,
            }) ||
              `Solde disponible : ${availableBalance.toFixed(0)} ${fundCurrency}`}
          </p>
        </div>

        <Field label={t("funds.proposeExpense.motiveLabel") || "Motif"}>
          <input
            value={motive}
            onChange={(e) => setMotive(e.target.value)}
            maxLength={240}
            placeholder={
              t("funds.proposeExpense.motivePlaceholder") ||
              "Ex: Achat fleurs cérémonie"
            }
            autoFocus
            style={inputStyle()}
          />
        </Field>

        <Field
          label={
            t("funds.proposeExpense.amountLabel", {
              currency: fundCurrency,
            }) || `Montant (${fundCurrency})`
          }
        >
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="120"
            style={inputStyle({ size: "large" })}
          />
          {exceedsBalance && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 11,
                color: "var(--v45-terracotta, #9F4628)",
              }}
            >
              {t("funds.proposeExpense.exceedsBalance") ||
                "Le montant dépasse le solde disponible. La dépense ne pourra pas être exécutée tant que la caisse n'aura pas reçu assez de cotisations."}
            </p>
          )}
        </Field>

        <Field
          label={
            t("funds.proposeExpense.beneficiaryLabel") ||
            "Bénéficiaire (optionnel)"
          }
        >
          <input
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            maxLength={240}
            placeholder={
              t("funds.proposeExpense.beneficiaryPlaceholder") ||
              "Nom du destinataire / fournisseur"
            }
            style={inputStyle()}
          />
        </Field>

        <Field
          label={
            t("funds.proposeExpense.proofLabel") ||
            "Lien vers la preuve (optionnel)"
          }
        >
          <input
            type="url"
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="https://…"
            style={inputStyle()}
          />
        </Field>

        <button
          type="button"
          disabled={!valid || submitting}
          onClick={submit}
          className="bmd-tap"
          style={primaryButtonStyle(!valid || submitting)}
        >
          {submitting
            ? t("common.loading") || "Envoi…"
            : `✓ ${t("funds.proposeExpense.submit") || "Proposer la dépense"}`}
        </button>
      </div>
    </BottomSheet>
  );
}

// ============================================================================
// 3. MobileRejectContributionSheet — trésorier refuse avec motif
// ============================================================================

export function MobileRejectContributionSheet({
  fundId,
  contribution,
  onClose,
  onRejected,
}: {
  fundId: string;
  contribution: {
    id: string;
    amount: string;
    currency: string;
    contributor: { displayName: string };
  };
  onClose: () => void;
  onRejected: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.rejectProjectFundContribution(
        fundId,
        contribution.id,
        reason.trim() || undefined,
      );
      onRejected();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t("funds.reject.title") || "Refuser la cotisation"}
    >
      <div style={{ padding: "8px 16px 24px", display: "grid", gap: 14 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--v45-terracotta, #9F4628)",
              letterSpacing: 1.4,
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {t("funds.reject.kicker") || "Refus"}
          </div>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              color: "var(--cocoa, #2B1F15)",
            }}
          >
            {t("funds.reject.title") || "Refuser la cotisation"}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            {contribution.contributor.displayName}
            {" · "}
            {parseFloat(contribution.amount).toFixed(0)} {contribution.currency}
          </p>
        </div>

        <Field
          label={
            t("funds.reject.reasonLabel") || "Motif (recommandé)"
          }
        >
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={
              t("funds.reject.reasonPlaceholder") ||
              "Ex: Preuve illisible, montant incohérent, double déclaration…"
            }
            autoFocus
            style={{ ...inputStyle(), resize: "vertical", minHeight: 80 }}
          />
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            {t("funds.reject.reasonHint") ||
              "Le contributeur verra ce motif. Sois clair et respectueux."}
          </p>
        </Field>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            className="bmd-tap"
            style={{
              flex: 1,
              padding: "13px 14px",
              borderRadius: 999,
              border: "1px solid var(--line, rgba(244,228,193,0.20))",
              background: "var(--paper, #FFFFFF)",
              color: "var(--cocoa, #2B1F15)",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 50,
            }}
          >
            {t("common.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="bmd-tap"
            style={{
              flex: 2,
              padding: "13px 14px",
              borderRadius: 999,
              border: "none",
              background: submitting
                ? "rgba(159,70,40,0.30)"
                : "var(--v45-terracotta, #9F4628)",
              color: "#FBF6EC",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 0.3,
              cursor: submitting ? "not-allowed" : "pointer",
              minHeight: 50,
            }}
          >
            {submitting
              ? t("common.loading") || "Envoi…"
              : `✕ ${t("funds.reject.submit") || "Refuser"}`}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ============================================================================
// Helpers de style partagés
// ============================================================================

/**
 * V203.C — Picker fichier light : transforme une image en data URI base64
 * et l'expose comme `value`. Affiche un preview thumb + bouton retirer.
 * Si user préfère, peut taper une URL externe à la place.
 *
 * Limite douce : 500 Ko (sinon l'API peut peiner — pas de back upload
 * dédié pour le moment, le base64 est stocké directement comme proofUrl
 * dans la DB). Pour Capacitor, le picker file natif est utilisé.
 */
function ProofPicker({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  t: ReturnType<typeof useT>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // V204.C — La preview marche pour data URL ET URL Cloudinary HTTPS
  const isDataUri = value.startsWith("data:");
  const isImageUrl =
    value.startsWith("https://") &&
    /\.(jpe?g|png|webp|gif)(\?|$)/i.test(value);
  const showImagePreview = isDataUri || isImageUrl;
  const hasValue = value.trim().length > 0;
  const inputId = "fund-proof-file-input";

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      // V204.C — Lecture data URL puis upload via endpoint Cloudinary
      // (renvoie URL HTTPS si Cloudinary configuré, sinon data URL inline).
      // L'utilisateur ne sait pas qu'il y a un cloud derrière — c'est
      // transparent et fonctionne dans les 2 modes (dev local et prod).
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Lecture impossible"));
        reader.readAsDataURL(file);
      });
      if (dataUrl.length > 700_000) {
        setError(
          t("funds.contribute.proofTooLarge") ||
            "Image trop lourde. Réduis-la (< 500 Ko) ou colle un lien externe.",
        );
        setBusy(false);
        return;
      }
      try {
        // Upload vers Cloudinary (ou retour data URL si inline)
        const { url } = await api.uploadProjectFundProof(dataUrl);
        onChange(url);
      } catch {
        // Si l'upload échoue, on garde la data URL inline (fallback dégradé
        // gracieux — l'user voit toujours sa preuve s'afficher).
        onChange(dataUrl);
      }
      setBusy(false);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {/* Preview si data URI image OU URL Cloudinary image */}
      {hasValue && showImagePreview && (
        <div
          style={{
            position: "relative",
            width: "100%",
            maxHeight: 180,
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid var(--line, rgba(244,228,193,0.14))",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={t("funds.contribute.proofPreview") || "Aperçu preuve"}
            style={{
              width: "100%",
              maxHeight: 180,
              objectFit: "contain",
              display: "block",
            }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="bmd-tap"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "none",
              background: "rgba(43,31,21,0.65)",
              color: "#FBF6EC",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 800,
              touchAction: "manipulation",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Picker fichier */}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        style={{ display: "none" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <label
          htmlFor={inputId}
          className="bmd-tap"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px dashed rgba(197,138,46,0.40)",
            background: "rgba(197,138,46,0.06)",
            color: "var(--saffron, #C58A2E)",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
            minHeight: 42,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            touchAction: "manipulation",
            textAlign: "center",
          }}
        >
          {busy
            ? t("common.loading") || "Envoi…"
            : showImagePreview
              ? t("funds.contribute.proofReplace") || "Remplacer la photo"
              : `📎 ${t("funds.contribute.proofUploadBtn") || "Joindre une photo"}`}
        </label>
        {/* URL externe en alternative */}
        {!showImagePreview && (
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              t("funds.contribute.proofUrlAlt") || "ou lien https://…"
            }
            style={{
              ...inputStyle(),
              flex: 1,
              fontSize: 12,
              minHeight: 42,
              padding: "10px 12px",
            }}
          />
        )}
      </div>
      {error && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: "var(--v45-terracotta, #9F4628)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: "var(--muted)",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function inputStyle(opts?: {
  size?: "large";
  uppercase?: boolean;
}): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--line, rgba(244,228,193,0.10))",
    background: "var(--paper, #FFFFFF)",
    color: "var(--cocoa, #2B1F15)",
    fontSize: opts?.size === "large" ? 20 : 15,
    fontFamily:
      opts?.size === "large" ? "var(--bmd-num, inherit)" : "inherit",
    fontWeight: opts?.size === "large" ? 700 : 500,
    fontVariantNumeric: "tabular-nums",
    minHeight: 48,
    letterSpacing: opts?.uppercase ? 1.2 : undefined,
    textTransform: opts?.uppercase ? "uppercase" : undefined,
  };
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "10px 10px",
    borderRadius: 10,
    border: active
      ? "1.5px solid var(--saffron, #C58A2E)"
      : "1px solid var(--line, rgba(244,228,193,0.10))",
    background: active
      ? "rgba(197,138,46,0.10)"
      : "var(--paper, #FFFFFF)",
    color: "var(--cocoa, #2B1F15)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    minHeight: 44,
    touchAction: "manipulation",
  };
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 999,
    border: "none",
    background: disabled
      ? "rgba(197,138,46,0.30)"
      : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
    color: "#FBF6EC",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.3,
    cursor: disabled ? "not-allowed" : "pointer",
    minHeight: 52,
    boxShadow: disabled ? "none" : "0 8px 24px -8px rgba(197,138,46,0.50)",
    touchAction: "manipulation",
  };
}
