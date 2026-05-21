"use client";

/**
 * V201 — MobileCreateFundSheet · BottomSheet 3 étapes pour créer une caisse.
 * V218.G — Refonte : layout condensé (chaque étape tient sur 1 page sans
 * scroll) + toggle FREE / FIXED en étape 1 (« montant libre » vs « montant
 * fixe par versement »).
 * =============================================================================
 * Étape 1 : Type (template) + mode contribution (libre/fixe + montant si fixe)
 *           + nom + description
 * Étape 2 : Devise + objectif (optionnel) + deadline (optionnelle) + fréquence
 * Étape 3 : Trésorier + seuil de vote (optionnel) + bannière légale
 *
 * Le créateur devient trésorier par défaut si aucun n'est désigné. Le
 * trésorier est seul responsable de la garde des fonds (cf. legal notice).
 *
 * Validation minimale côté client (le backend re-valide tout) :
 *   - nom ≥ 2 chars
 *   - targetAmount > 0 si renseigné, deadline valide si renseignée
 *   - si contributionMode = FIXED : contributionAmount > 0 obligatoire
 */

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { FundsLegalNotice } from "./funds-legal-notice";
import { Icon } from "./icons";

type Template = "EVENT" | "PROJECT" | "SOLIDARITY" | "ASSOCIATION" | "GIFT";

interface Props {
  groupId: string;
  members?: Array<{
    user: { id: string; displayName: string; avatar: string | null };
  }>;
  defaultCurrency?: string;
  onClose: () => void;
  onCreated: (fundId: string) => void;
}

const TEMPLATES: Array<{ key: Template; iconName: string }> = [
  { key: "EVENT", iconName: "party-popper" },
  { key: "PROJECT", iconName: "sparkles" },
  { key: "SOLIDARITY", iconName: "shield" },
  { key: "ASSOCIATION", iconName: "users" },
  { key: "GIFT", iconName: "gift" },
];

export function MobileCreateFundSheet({
  groupId,
  members = [],
  defaultCurrency = "EUR",
  onClose,
  onCreated,
}: Props) {
  const t = useT();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [template, setTemplate] = useState<Template>("EVENT");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // V218.G — Mode de contribution + montant fixe (étape 1)
  const [contributionMode, setContributionMode] = useState<"FREE" | "FIXED">(
    "FREE",
  );
  const [contributionAmount, setContributionAmount] = useState("");

  // Step 2
  const [currency, setCurrency] = useState(defaultCurrency);
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  // V215.C1 — Fréquence de versement (par défaut ONE_SHOT pour ne pas
  // surprendre les anciens utilisateurs habitués au paiement unique).
  const [frequency, setFrequency] = useState<
    "ONE_SHOT" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM"
  >("ONE_SHOT");
  const [customCount, setCustomCount] = useState("");

  // Step 3
  const [treasurerUserId, setTreasurerUserId] = useState<string>("");
  const [voteThreshold, setVoteThreshold] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // V218.G — Si FIXED, exiger un montant > 0 pour passer step 1
  const fixedAmountValid =
    contributionMode !== "FIXED" || parseFloat(contributionAmount) > 0;
  const canNextStep1 = name.trim().length >= 2 && fixedAmountValid;
  const canNextStep2 = !targetAmount || parseFloat(targetAmount) > 0;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await api.createProjectFund(groupId, {
        name: name.trim(),
        description: description.trim() || undefined,
        template,
        currency,
        targetAmount: targetAmount ? parseFloat(targetAmount) : undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        treasurerUserId: treasurerUserId || undefined,
        voteThreshold: voteThreshold ? parseFloat(voteThreshold) : undefined,
        // V215.C1 — Fréquence + nombre custom (pour CUSTOM seulement)
        frequency,
        numberOfInstallments:
          frequency === "CUSTOM" && customCount
            ? Math.max(1, parseInt(customCount, 10))
            : undefined,
        // V218.G — Mode de contribution + montant si FIXED
        contributionMode,
        contributionAmount:
          contributionMode === "FIXED" && contributionAmount
            ? parseFloat(contributionAmount)
            : undefined,
      });
      onCreated(r.id);
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
      title={t("funds.createSheetTitle") || "Nouvelle caisse projet"}
    >
      {/* V218.G — Layout condensé : tient sur 1 page sans scroll.
          Paddings 8px (vs 16-24), gap 10px (vs 16), labels 10-11px. */}
      <div style={{ padding: "4px 12px 16px", display: "grid", gap: 10 }}>
        {/* Header avec stepper + close */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                color: "var(--saffron, #C58A2E)",
                letterSpacing: 1.2,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {t("funds.step", { n: String(step), total: "3" }) ||
                `Étape ${step}/3`}
            </div>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 18,
                fontWeight: 700,
                margin: "0",
                color: "var(--cocoa, #2B1F15)",
                lineHeight: 1.15,
              }}
            >
              {step === 1 &&
                (t("funds.create.step1Title") || "De quoi s'agit-il ?")}
              {step === 2 &&
                (t("funds.create.step2Title") || "Objectif et échéance")}
              {step === 3 &&
                (t("funds.create.step3Title") || "Trésorier et règles")}
            </h2>
          </div>
        </div>

        {/* === STEP 1 — Mode + Type + nom (condensé V218.G) === */}
        {step === 1 && (
          <>
            {/* V218.G — Toggle « Montant libre » vs « Montant fixe » */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 5,
                }}
              >
                {t("funds.contributionModeLabel") || "Mode de contribution"}
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                {(
                  [
                    {
                      key: "FREE" as const,
                      label:
                        t("funds.contributionModeFree") || "Montant libre",
                      help:
                        t("funds.contributionModeHelpFree") ||
                        "Chacun cotise ce qu'il veut.",
                    },
                    {
                      key: "FIXED" as const,
                      label:
                        t("funds.contributionModeFixed") || "Montant fixe",
                      help:
                        t("funds.contributionModeHelpFixed") ||
                        "Même somme à chaque versement.",
                    },
                  ]
                ).map((opt) => {
                  const active = contributionMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setContributionMode(opt.key)}
                      className="bmd-tap"
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: active
                          ? "1.5px solid var(--saffron, #C58A2E)"
                          : "1px solid var(--line, rgba(244,228,193,0.10))",
                        background: active
                          ? "rgba(197,138,46,0.10)"
                          : "var(--paper, #FFFFFF)",
                        color: "var(--cocoa, #2B1F15)",
                        fontFamily: "inherit",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        textAlign: "left",
                        touchAction: "manipulation",
                        minHeight: 44,
                        lineHeight: 1.2,
                      }}
                    >
                      <div>{opt.label}</div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--muted)",
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        {opt.help}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Champ « Montant par versement » conditionnel */}
              {contributionMode === "FIXED" && (
                <input
                  inputMode="decimal"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  placeholder={
                    t("funds.contributionAmountPlaceholder") ||
                    "Ex : 50 par versement"
                  }
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--line, rgba(244,228,193,0.10))",
                    background: "var(--paper, #FFFFFF)",
                    color: "var(--cocoa, #2B1F15)",
                    fontSize: 14,
                    fontFamily: "var(--bmd-num, inherit)",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    minHeight: 40,
                  }}
                />
              )}
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 5,
                }}
              >
                {t("funds.create.templateLabel") || "Type de caisse"}
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6,
                }}
              >
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setTemplate(tpl.key)}
                    className="bmd-tap"
                    style={{
                      padding: "6px 4px",
                      borderRadius: 10,
                      border:
                        template === tpl.key
                          ? "1.5px solid var(--saffron, #C58A2E)"
                          : "1px solid var(--line, rgba(244,228,193,0.10))",
                      background:
                        template === tpl.key
                          ? "rgba(197,138,46,0.10)"
                          : "var(--paper, #FFFFFF)",
                      color: "var(--cocoa, #2B1F15)",
                      fontFamily: "inherit",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      minHeight: 50,
                      touchAction: "manipulation",
                    }}
                  >
                    <Icon
                      name={tpl.iconName}
                      size={16}
                      color="var(--saffron, #C58A2E)"
                      strokeWidth={1.6}
                    />
                    <span style={{ textAlign: "center", lineHeight: 1.1 }}>
                      {t(`funds.template.${tpl.key.toLowerCase()}`) || tpl.key}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {t("funds.create.nameLabel") || "Nom de la caisse"}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                placeholder={
                  t("funds.create.namePlaceholder") ||
                  "Ex: Funérailles Tata Marie"
                }
                autoFocus
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line, rgba(244,228,193,0.10))",
                  background: "var(--paper, #FFFFFF)",
                  color: "var(--cocoa, #2B1F15)",
                  fontSize: 14,
                  fontFamily: "inherit",
                  minHeight: 40,
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {t("funds.create.descriptionLabel") || "Description (optionnel)"}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder={
                  t("funds.create.descriptionPlaceholder") ||
                  "À quoi servira l'argent collecté ?"
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line, rgba(244,228,193,0.10))",
                  background: "var(--paper, #FFFFFF)",
                  color: "var(--cocoa, #2B1F15)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "none",
                  minHeight: 50,
                }}
              />
            </div>
          </>
        )}

        {/* === STEP 2 — Devise + objectif + deadline (condensé V218.G) === */}
        {step === 2 && (
          <>
            {/* Devise + Objectif sur la même ligne (économie verticale) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr",
                gap: 8,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: "var(--muted)",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  {t("funds.create.currencyLabel") || "Devise"}
                </label>
                <input
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value.toUpperCase().slice(0, 3))
                  }
                  maxLength={3}
                  placeholder="EUR"
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--line, rgba(244,228,193,0.10))",
                    background: "var(--paper, #FFFFFF)",
                    color: "var(--cocoa, #2B1F15)",
                    fontSize: 13,
                    fontFamily: "var(--bmd-num, inherit)",
                    letterSpacing: 1,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    minHeight: 40,
                    textAlign: "center",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: "var(--muted)",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  {t("funds.create.targetLabel") || "Objectif (optionnel)"}
                </label>
                <input
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="2500"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--line, rgba(244,228,193,0.10))",
                    background: "var(--paper, #FFFFFF)",
                    color: "var(--cocoa, #2B1F15)",
                    fontSize: 15,
                    fontFamily: "var(--bmd-num, inherit)",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    minHeight: 40,
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {t("funds.create.deadlineLabel") ||
                  "Date d'échéance (optionnel)"}
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line, rgba(244,228,193,0.10))",
                  background: "var(--paper, #FFFFFF)",
                  color: "var(--cocoa, #2B1F15)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  minHeight: 40,
                }}
              />
            </div>

            {/* V215.C1 — Fréquence des versements + aperçu de l'échéancier */}
            <FrequencyPicker
              value={frequency}
              onChange={setFrequency}
              customCount={customCount}
              onCustomCountChange={setCustomCount}
              targetAmount={parseFloat(targetAmount) || 0}
              deadline={deadline}
              currency={currency}
              t={t}
            />
          </>
        )}

        {/* === STEP 3 — Trésorier + vote + bannière légale (condensé V218.G) === */}
        {step === 3 && (
          <>
            <FundsLegalNotice variant="compact" />

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {t("funds.create.treasurerLabel") ||
                  "Trésorier (responsable des fonds)"}
              </label>
              <select
                value={treasurerUserId}
                onChange={(e) => setTreasurerUserId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line, rgba(244,228,193,0.10))",
                  background: "var(--paper, #FFFFFF)",
                  color: "var(--cocoa, #2B1F15)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  minHeight: 40,
                }}
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
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {t("funds.create.voteThresholdLabel") ||
                  "Seuil de vote (optionnel)"}
              </label>
              <input
                inputMode="decimal"
                value={voteThreshold}
                onChange={(e) => setVoteThreshold(e.target.value)}
                placeholder={t("funds.create.voteThresholdPlaceholder") || "500"}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line, rgba(244,228,193,0.10))",
                  background: "var(--paper, #FFFFFF)",
                  color: "var(--cocoa, #2B1F15)",
                  fontSize: 13,
                  fontFamily: "var(--bmd-num, inherit)",
                  fontWeight: 700,
                  minHeight: 40,
                }}
              />
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 10,
                  color: "var(--muted)",
                  lineHeight: 1.3,
                }}
              >
                {t("funds.create.voteThresholdHintShort") ||
                  "Au-delà de ce montant, une dépense doit être votée."}
              </p>
            </div>
          </>
        )}

        {/* === Footer actions === */}
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              className="bmd-tap"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid var(--line, rgba(244,228,193,0.20))",
                background: "var(--paper, #FFFFFF)",
                color: "var(--cocoa, #2B1F15)",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 42,
                touchAction: "manipulation",
              }}
            >
              ‹ {t("common.back") || "Retour"}
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              disabled={
                (step === 1 && !canNextStep1) || (step === 2 && !canNextStep2)
              }
              onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
              className="bmd-tap"
              style={{
                flex: 2,
                padding: "10px 12px",
                borderRadius: 999,
                border: "none",
                background:
                  (step === 1 && !canNextStep1) ||
                  (step === 2 && !canNextStep2)
                    ? "rgba(197,138,46,0.30)"
                    : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                color: "#FBF6EC",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0.3,
                cursor:
                  (step === 1 && !canNextStep1) ||
                  (step === 2 && !canNextStep2)
                    ? "not-allowed"
                    : "pointer",
                minHeight: 42,
                touchAction: "manipulation",
              }}
            >
              {t("common.next") || "Continuer"} ›
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="bmd-tap"
              style={{
                flex: 2,
                padding: "10px 12px",
                borderRadius: 999,
                border: "none",
                background:
                  "linear-gradient(135deg, var(--v45-emerald, #1F7A57), var(--v45-saffron, #C58A2E))",
                color: "#FBF6EC",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0.3,
                cursor: submitting ? "not-allowed" : "pointer",
                minHeight: 42,
                touchAction: "manipulation",
              }}
            >
              {submitting
                ? t("common.loading") || "Création…"
                : `✓ ${t("funds.create.submit") || "Créer la caisse"}`}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

// ───────────────────────────────────────────────────────────────────
// V215.C1 — FrequencyPicker (5 options + aperçu live de l'échéancier)
// ───────────────────────────────────────────────────────────────────

type FundFreq = "ONE_SHOT" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM";

const FREQ_OPTIONS: Array<{ key: FundFreq; label: string; sub: string }> = [
  { key: "ONE_SHOT", label: "Une fois", sub: "Paiement unique" },
  { key: "WEEKLY", label: "Chaque semaine", sub: "Hebdomadaire" },
  { key: "BIWEEKLY", label: "Toutes les 2 sem.", sub: "Bi-mensuel" },
  { key: "MONTHLY", label: "Chaque mois", sub: "Mensuel" },
  { key: "CUSTOM", label: "Sur-mesure", sub: "Échéancier libre" },
];

function FrequencyPicker({
  value,
  onChange,
  customCount,
  onCustomCountChange,
  targetAmount,
  deadline,
  currency,
  t,
}: {
  value: FundFreq;
  onChange: (v: FundFreq) => void;
  customCount: string;
  onCustomCountChange: (v: string) => void;
  targetAmount: number;
  deadline: string;
  currency: string;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  // Calcul aperçu (logique alignée avec le backend computeInstallmentSchedule)
  const preview = (() => {
    if (value === "ONE_SHOT") return null;
    if (value === "CUSTOM") {
      const c = parseInt(customCount, 10);
      if (!c || c < 1) return null;
      const per = targetAmount > 0 ? Math.round((targetAmount / c) * 100) / 100 : null;
      return { count: c, per };
    }
    if (!deadline) return null;
    const now = new Date();
    const dl = new Date(deadline);
    if (Number.isNaN(dl.getTime())) return null;
    const days = Math.max(1, Math.ceil((dl.getTime() - now.getTime()) / 86_400_000));
    const step = value === "WEEKLY" ? 7 : value === "BIWEEKLY" ? 14 : 30;
    const count = Math.max(1, Math.ceil(days / step));
    const per =
      targetAmount > 0 ? Math.round((targetAmount / count) * 100) / 100 : null;
    return { count, per };
  })();

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 10,
          color: "var(--muted)",
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {t("funds.create.frequencyLabel") || "Rythme des versements"}
      </label>
      {/* V218.G — Grille 5 col compactes (vs 5 lignes) pour économie verticale */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 4,
        }}
      >
        {FREQ_OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              type="button"
              key={opt.key}
              onClick={() => onChange(opt.key)}
              className="bmd-tap"
              style={{
                padding: "6px 4px",
                borderRadius: 8,
                border: `1px solid ${active ? "var(--v45-saffron, #C58A2E)" : "var(--line, rgba(244,228,193,0.10))"}`,
                background: active
                  ? "rgba(197,138,46,0.12)"
                  : "var(--paper, #FFFFFF)",
                color: "var(--cocoa, #2B1F15)",
                fontFamily: "inherit",
                fontSize: 10,
                fontWeight: active ? 700 : 600,
                textAlign: "center",
                cursor: "pointer",
                minHeight: 38,
                touchAction: "manipulation",
                lineHeight: 1.1,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Input nombre pour CUSTOM */}
      {value === "CUSTOM" && (
        <div style={{ marginTop: 10 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--muted)",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {t("funds.create.customInstallments") ||
              "Combien de versements ?"}
          </label>
          <input
            type="number"
            min={1}
            max={120}
            value={customCount}
            onChange={(e) => onCustomCountChange(e.target.value)}
            placeholder="12"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--line, rgba(244,228,193,0.10))",
              background: "var(--paper, #FFFFFF)",
              color: "var(--cocoa, #2B1F15)",
              fontSize: 14,
              fontFamily: "inherit",
              minHeight: 42,
            }}
          />
        </div>
      )}

      {/* Aperçu live "12 versements de 50 € jusqu'au …" */}
      {preview && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "rgba(197,138,46,0.08)",
            border: "1px solid rgba(197,138,46,0.25)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.5,
          }}
        >
          <strong>{preview.count}</strong>{" "}
          {preview.count === 1 ? "versement" : "versements"}
          {preview.per !== null && (
            <>
              {" "}
              de{" "}
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                {preview.per.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                })}{" "}
                {currency}
              </strong>
            </>
          )}
          {value !== "CUSTOM" && deadline && (
            <>
              {" "}
              jusqu'au{" "}
              <strong>
                {new Date(deadline).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
            </>
          )}
        </div>
      )}

      {!preview && value !== "ONE_SHOT" && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          {value === "CUSTOM"
            ? t("funds.create.customHint") || "Renseigne le nombre de versements."
            : t("funds.create.frequencyHint") ||
              "Renseigne une date d'échéance pour voir le calcul."}
        </div>
      )}
    </div>
  );
}
