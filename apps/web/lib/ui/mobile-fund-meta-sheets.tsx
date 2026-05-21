"use client";

/**
 * V203 — BottomSheets meta pour une caisse projet (édition + partage).
 * =============================================================================
 * Deux sheets lazy-loadés depuis le détail caisse :
 *
 *   - MobileEditFundSheet (V203.A) : modifier nom / description / objectif /
 *     deadline / trésorier (créateur ou trésorier uniquement). Appelle
 *     api.updateProjectFund() puis ferme + recharge.
 *
 *   - MobileShareFundSheet (V203.B) : QR code du lien public + bouton copier
 *     + bouton télécharger PDF récap. Tous les membres peuvent partager.
 *
 * Bannière légale Registre rappelée dans Share (vis-à-vis des contributeurs
 * externes qui scanneront le QR).
 */

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { BrandedQR } from "./branded-qr";
import { FundsLegalNotice } from "./funds-legal-notice";
import { Icon } from "./icons";

// ============================================================================
// 1. MobileEditFundSheet — éditer les metadata d'une caisse
// ============================================================================

interface EditProps {
  fundId: string;
  current: {
    name: string;
    description: string | null;
    targetAmount: string | null;
    currency: string;
    deadline: string | null;
    treasurerUserId: string | null;
  };
  members?: Array<{
    user: { id: string; displayName: string };
  }>;
  onClose: () => void;
  onUpdated: () => void;
}

export function MobileEditFundSheet({
  fundId,
  current,
  members = [],
  onClose,
  onUpdated,
}: EditProps) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(current.name);
  const [description, setDescription] = useState(current.description ?? "");
  const [targetAmount, setTargetAmount] = useState(
    current.targetAmount ?? "",
  );
  const [deadline, setDeadline] = useState(
    current.deadline ? current.deadline.slice(0, 10) : "",
  );
  const [treasurerUserId, setTreasurerUserId] = useState(
    current.treasurerUserId ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length >= 2;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await api.updateProjectFund(fundId, {
        name: name.trim(),
        description: description.trim() || null,
        targetAmount: targetAmount ? parseFloat(targetAmount) : null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        treasurerUserId: treasurerUserId || null,
      });
      toast.success(t("funds.edit.updatedToast") || "Caisse mise à jour");
      onUpdated();
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
      title={t("funds.edit.title") || "Modifier la caisse"}
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
            {t("funds.edit.kicker") || "Édition"}
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
            {t("funds.edit.title") || "Modifier la caisse"}
          </h2>
        </div>

        <Field label={t("funds.create.nameLabel") || "Nom de la caisse"}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            style={inputStyle()}
          />
        </Field>

        <Field
          label={t("funds.create.descriptionLabel") || "Description (optionnel)"}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            style={{ ...inputStyle(), resize: "vertical", minHeight: 70 }}
          />
        </Field>

        <Field label={t("funds.create.targetLabel") || "Objectif (optionnel)"}>
          <input
            inputMode="decimal"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="2500"
            style={inputStyle({ size: "large" })}
          />
          <p style={hintStyle}>{current.currency}</p>
        </Field>

        <Field
          label={t("funds.create.deadlineLabel") || "Date d'échéance (optionnel)"}
        >
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={inputStyle()}
          />
        </Field>

        <Field label={t("funds.create.treasurerLabel") || "Trésorier"}>
          <select
            value={treasurerUserId}
            onChange={(e) => setTreasurerUserId(e.target.value)}
            style={inputStyle()}
          >
            <option value="">
              {t("funds.create.treasurerSelf") || "Moi (par défaut)"}
            </option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.displayName}
              </option>
            ))}
          </select>
          <p style={hintStyle}>
            {t("funds.create.treasurerHint") ||
              "Le trésorier détient l'argent. BMD n'encaisse jamais."}
          </p>
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            className="bmd-tap"
            style={secondaryButtonStyle()}
          >
            {t("common.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={submit}
            className="bmd-tap"
            style={primaryButtonStyle(!canSubmit || submitting)}
          >
            {submitting
              ? t("common.loading") || "Envoi…"
              : `✓ ${t("funds.edit.submit") || "Enregistrer"}`}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ============================================================================
// 2. MobileShareFundSheet — QR code + copier lien + télécharger PDF
// ============================================================================

interface ShareProps {
  fundId: string;
  publicCode: string;
  fundName: string;
  onClose: () => void;
}

export function MobileShareFundSheet({
  fundId,
  publicCode,
  fundName,
  onClose,
}: ShareProps) {
  const t = useT();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/funds/public/${publicCode}`
      : `/funds/public/${publicCode}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success(t("funds.share.copiedToast") || "Lien copié");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("funds.share.copyError") || "Copie impossible — sélectionne le lien manuellement");
    }
  }

  async function shareNative() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${fundName} — BMD`,
          text: t("funds.share.nativeText", { name: fundName }) ||
            `Rejoins la caisse « ${fundName} » sur BMD.`,
          url: publicUrl,
        });
      } catch {
        /* user cancelled, ignore */
      }
    } else {
      void copyLink();
    }
  }

  function downloadPdf() {
    const url = api.projectFundPdfReceiptUrl(fundId);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t("funds.share.title") || "Partager la caisse"}
    >
      <div
        style={{
          padding: "8px 16px 24px",
          display: "grid",
          gap: 16,
          textAlign: "center",
        }}
      >
        <div style={{ textAlign: "left" }}>
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
            {t("funds.share.kicker") || "Partage"}
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
            {fundName}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "var(--muted, #7a7164)",
            }}
          >
            {t("funds.share.subtitle") ||
              "Scanne ou partage le lien pour inviter à cotiser."}
          </p>
        </div>

        {/* QR code */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <BrandedQR value={publicUrl} size={220} alt={`QR ${fundName}`} />
        </div>

        {/* Lien copiable */}
        <div
          style={{
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--line, rgba(244,228,193,0.14))",
            borderRadius: 12,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            textAlign: "left",
          }}
        >
          <code
            style={{
              flex: 1,
              fontSize: 11,
              color: "var(--cocoa, #2B1F15)",
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="bmd-tap"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--saffron, #C58A2E)",
              background: copied
                ? "var(--saffron, #C58A2E)"
                : "transparent",
              color: copied ? "#FBF6EC" : "var(--saffron, #C58A2E)",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 32,
            }}
          >
            {copied
              ? `✓ ${t("funds.share.copied") || "Copié"}`
              : t("funds.share.copyLink") || "Copier"}
          </button>
        </div>

        {/* Actions principales */}
        <div style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            onClick={shareNative}
            className="bmd-tap"
            style={primaryButtonStyle(false)}
          >
            <Icon name="share-2" size={16} strokeWidth={1.8} />{" "}
            {t("funds.share.native") || "Partager via…"}
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            className="bmd-tap"
            style={{
              ...secondaryButtonStyle(),
              borderColor: "rgba(31,122,87,0.40)",
              color: "var(--v45-emerald, #1F7A57)",
              background: "rgba(31,122,87,0.06)",
            }}
          >
            <Icon name="file-text" size={16} strokeWidth={1.8} />{" "}
            {t("funds.share.downloadPdf") || "Télécharger récap PDF"}
          </button>
        </div>

        <FundsLegalNotice variant="compact" />
      </div>
    </BottomSheet>
  );
}

// ============================================================================
// Helpers de style partagés
// ============================================================================

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
          color: "var(--muted, #7a7164)",
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

const hintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 11,
  color: "var(--muted, #7a7164)",
};

function inputStyle(opts?: { size?: "large" }): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--line, rgba(244,228,193,0.14))",
    background: "var(--paper, #FFFFFF)",
    color: "var(--cocoa, #2B1F15)",
    fontSize: opts?.size === "large" ? 18 : 15,
    fontFamily: opts?.size === "large" ? "var(--bmd-num, inherit)" : "inherit",
    fontWeight: opts?.size === "large" ? 700 : 500,
    fontVariantNumeric: "tabular-nums",
    minHeight: 48,
  };
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
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
    minHeight: 50,
    boxShadow: disabled ? "none" : "0 8px 24px -8px rgba(197,138,46,0.50)",
    touchAction: "manipulation",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 999,
    border: "1px solid var(--line, rgba(244,228,193,0.20))",
    background: "var(--paper, #FFFFFF)",
    color: "var(--cocoa, #2B1F15)",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    minHeight: 50,
    touchAction: "manipulation",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}
