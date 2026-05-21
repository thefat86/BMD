"use client";

/**
 * V165.C — Bloc « Dette déjà existante » + « Mode de création »
 * Réutilisable web + mobile dans le wizard RDD.
 *
 * Permet à l'utilisateur de :
 *   1. Choisir le mode : Registre personnel (sans signature) vs RDD officielle (avec workflow)
 *   2. Toggle "Dette déjà existante" → saisir date d'origine + liste paiements reçus
 *
 * État managé par le parent via les props value/onChange (controlled).
 */

import { useT } from "../i18n/app-strings";

export interface DebtRetroactiveState {
  isPersonalLedger: boolean;
  isRetroactive: boolean;
  pastStartDate: string; // ISO date YYYY-MM-DD
  previousPayments: Array<{
    amount: string;
    paidAt: string; // ISO date YYYY-MM-DD
    notes: string;
    method?: "CASH" | "TRANSFER" | "MOBILE_MONEY" | "OTHER";
  }>;
}

export const initialRetroactiveState: DebtRetroactiveState = {
  isPersonalLedger: false,
  isRetroactive: false,
  pastStartDate: "",
  previousPayments: [],
};

interface Props {
  value: DebtRetroactiveState;
  onChange: (next: DebtRetroactiveState) => void;
  /** Montant total du prêt (pour afficher reste à recevoir) */
  loanAmount: number;
  currency: string;
  /** mode rendu : "mobile" = card compacte, "desktop" = card large */
  variant?: "mobile" | "desktop";
}

export function DebtRetroactiveBlock({
  value,
  onChange,
  loanAmount,
  currency,
  variant = "mobile",
}: Props): JSX.Element {
  const t = useT();

  const totalReceived = value.previousPayments.reduce(
    (s, p) => s + (parseFloat(p.amount) || 0),
    0,
  );
  const remaining = Math.max(0, loanAmount - totalReceived);
  const isOverPaid = totalReceived > loanAmount && loanAmount > 0;

  function addPayment() {
    onChange({
      ...value,
      previousPayments: [
        ...value.previousPayments,
        {
          amount: "",
          paidAt: new Date().toISOString().slice(0, 10),
          notes: "",
          method: "CASH",
        },
      ],
    });
  }

  function removePayment(idx: number) {
    onChange({
      ...value,
      previousPayments: value.previousPayments.filter((_, i) => i !== idx),
    });
  }

  function updatePayment(
    idx: number,
    patch: Partial<DebtRetroactiveState["previousPayments"][number]>,
  ) {
    onChange({
      ...value,
      previousPayments: value.previousPayments.map((p, i) =>
        i === idx ? { ...p, ...patch } : p,
      ),
    });
  }

  const compact = variant === "mobile";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* === Mode de création === */}
      <fieldset
        style={{
          border: "1px solid var(--cocoa-line, rgba(43,31,21,0.12))",
          borderRadius: 12,
          padding: compact ? 12 : 16,
          background: "var(--paper, rgba(244,228,193,0.30))",
        }}
      >
        <legend
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--cocoa-soft, #6B5942)",
            padding: "0 6px",
          }}
        >
          {t("debt.mode.title") || "Mode de création"}
        </legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ModeOption
            checked={!value.isPersonalLedger}
            label={t("debt.mode.official") || "RDD officielle"}
            hint={
              t("debt.mode.officialHint") ||
              "Proposition au débiteur, qui doit accepter (et éventuellement signer). Valeur juridique."
            }
            onClick={() => onChange({ ...value, isPersonalLedger: false })}
            accent
          />
          <ModeOption
            checked={value.isPersonalLedger}
            label={t("debt.mode.personalLedger") || "Registre personnel"}
            hint={
              t("debt.mode.personalLedgerHint") ||
              "Simple suivi privé sans validation du débiteur. Idéal pour tracer ses prêts entre amis."
            }
            onClick={() => onChange({ ...value, isPersonalLedger: true })}
          />
        </div>
      </fieldset>

      {/* === Toggle rétroactif === */}
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: compact ? 12 : 14,
          borderRadius: 12,
          background: value.isRetroactive
            ? "var(--v45-saffron-pale, #F6E8C5)"
            : "var(--paper, rgba(244,228,193,0.20))",
          border: `1px solid ${
            value.isRetroactive
              ? "var(--v45-saffron, #C58A2E)"
              : "var(--cocoa-line, rgba(43,31,21,0.12))"
          }`,
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        <input
          type="checkbox"
          checked={value.isRetroactive}
          onChange={(e) =>
            onChange({ ...value, isRetroactive: e.target.checked })
          }
          style={{
            width: 18,
            height: 18,
            marginTop: 2,
            accentColor: "var(--v45-saffron-strong, #854F0B)",
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              marginBottom: 2,
            }}
          >
            {t("debt.retroactive.toggle") || "Dette déjà existante (rétroactive)"}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5942)",
              lineHeight: 1.4,
            }}
          >
            {t("debt.retroactive.title") ||
              "Cette dette a déjà commencé. Tu peux saisir la date d'origine et les remboursements déjà reçus."}
          </span>
        </span>
      </label>

      {/* === Section rétroactive (date + paiements) === */}
      {value.isRetroactive && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Date d'origine */}
          <label style={{ display: "block" }}>
            <span style={fieldLabel}>
              {t("debt.retroactive.pastDate") || "Date d'origine du prêt"}
            </span>
            <input
              type="date"
              value={value.pastStartDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) =>
                onChange({ ...value, pastStartDate: e.target.value })
              }
              style={inputStyle}
            />
          </label>

          {/* Liste des paiements */}
          <div>
            <span style={fieldLabel}>
              {t("debt.retroactive.previousPayments") ||
                "Remboursements déjà reçus"}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {value.previousPayments.length === 0 ? (
                <p
                  style={{
                    margin: "4px 0 8px",
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "var(--cocoa-soft, #6B5942)",
                  }}
                >
                  Aucun versement enregistré pour le moment.
                </p>
              ) : (
                value.previousPayments.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: compact
                        ? "1fr 1fr auto"
                        : "120px 1fr 1fr auto",
                      gap: 6,
                      padding: 10,
                      borderRadius: 10,
                      background: "var(--paper, #FBF6EC)",
                      border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="date"
                      value={p.paidAt}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) =>
                        updatePayment(idx, { paidAt: e.target.value })
                      }
                      style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}
                      title={t("debt.retroactive.paymentDate") || "Date"}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={
                        t("debt.retroactive.paymentAmount") || "Montant"
                      }
                      value={p.amount}
                      onChange={(e) =>
                        updatePayment(idx, { amount: e.target.value })
                      }
                      style={{
                        ...inputStyle,
                        padding: "6px 8px",
                        fontSize: 12,
                        fontFamily: "var(--bmd-num, monospace)",
                      }}
                    />
                    {!compact && (
                      <input
                        type="text"
                        placeholder={
                          t("debt.retroactive.paymentNote") || "Note (opt.)"
                        }
                        value={p.notes}
                        onChange={(e) =>
                          updatePayment(idx, { notes: e.target.value })
                        }
                        style={{
                          ...inputStyle,
                          padding: "6px 8px",
                          fontSize: 12,
                        }}
                        maxLength={120}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removePayment(idx)}
                      aria-label="Supprimer"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--v45-terracotta, #9F4628)",
                        cursor: "pointer",
                        fontSize: 18,
                        padding: 4,
                        minWidth: 28,
                        minHeight: 28,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={addPayment}
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "1px dashed var(--v45-saffron, #C58A2E)",
                  borderRadius: 10,
                  color: "var(--v45-saffron-strong, #854F0B)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  minHeight: 40,
                }}
              >
                {t("debt.retroactive.addPayment") || "+ Ajouter un versement"}
              </button>
            </div>
          </div>

          {/* Résumé total reçu / reste à recevoir */}
          {loanAmount > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                padding: 12,
                background:
                  "linear-gradient(135deg, var(--paper, #FBF6EC), var(--v45-saffron-pale, #F6E8C5))",
                border: `1px solid ${
                  isOverPaid
                    ? "var(--v45-terracotta, #9F4628)"
                    : "var(--v45-saffron-line, rgba(197,138,46,0.30))"
                }`,
                borderRadius: 12,
              }}
            >
              <SummaryTile
                label={
                  t("debt.retroactive.totalReceived") || "Total déjà reçu"
                }
                value={`${totalReceived.toFixed(2)} ${currency}`}
                color="var(--v45-emerald, #1F7A57)"
              />
              <SummaryTile
                label={t("debt.retroactive.remaining") || "Reste à recevoir"}
                value={`${remaining.toFixed(2)} ${currency}`}
                color={
                  isOverPaid
                    ? "var(--v45-terracotta, #9F4628)"
                    : "var(--v45-saffron-strong, #854F0B)"
                }
              />
              {isOverPaid && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    fontSize: 11,
                    color: "var(--v45-terracotta, #9F4628)",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ Le total reçu dépasse le montant du prêt. Ajuste les montants.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModeOption({
  checked,
  label,
  hint,
  onClick,
  accent,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: 10,
        background: checked
          ? accent
            ? "var(--v45-saffron-pale, #F6E8C5)"
            : "var(--paper, #FBF6EC)"
          : "transparent",
        border: `1px solid ${
          checked
            ? accent
              ? "var(--v45-saffron, #C58A2E)"
              : "var(--cocoa, #2B1F15)"
            : "var(--cocoa-line, rgba(43,31,21,0.10))"
        }`,
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        width: "100%",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `2px solid ${
            checked
              ? accent
                ? "var(--v45-saffron-strong, #854F0B)"
                : "var(--cocoa, #2B1F15)"
              : "var(--cocoa-line, rgba(43,31,21,0.30))"
          }`,
          background: checked
            ? accent
              ? "var(--v45-saffron-strong, #854F0B)"
              : "var(--cocoa, #2B1F15)"
            : "transparent",
          flexShrink: 0,
          marginTop: 2,
          boxShadow: checked ? "inset 0 0 0 3px var(--paper, #FBF6EC)" : "none",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            marginBottom: 2,
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5942)",
            lineHeight: 1.4,
          }}
        >
          {hint}
        </span>
      </span>
    </button>
  );
}

function SummaryTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--cocoa-soft, #6B5942)",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "Cormorant Garamond, serif",
          color,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--cocoa-soft, #6B5942)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "inherit",
  background: "var(--paper-stronger, #F4ECD8)",
  color: "var(--cocoa, #2B1F15)",
  boxSizing: "border-box",
};
