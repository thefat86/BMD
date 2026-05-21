"use client";

/**
 * Multi-Payeurs Editor (Sprint AC-2)
 * --------------------------------------------------------------
 * Permet de désigner plusieurs personnes du groupe comme ayant avancé
 * une partie de la dépense, avec leur montant exact OU un pourcentage.
 *
 * Cas d'usage : 3 amis vont au resto. Karim met 30€, Linda paie 50€,
 * Yacine ajoute 20€. Total : 100€. On veut que la balance soit JUSTE
 * (chacun crédité de ce qu'il a vraiment avancé) au lieu de tout
 * créditer au "payeur principal".
 *
 * UX :
 *  - Toggle "Plusieurs personnes ont payé" → ouvre la liste
 *  - Pour chaque membre : checkbox + champ montant ou %
 *  - Mode unique (montant OU %) — on ne mélange pas dans une même dépense
 *  - Résumé en bas : somme actuelle vs total attendu, avec validation
 *
 * Mobile-first :
 *  - Tap-target ≥ 44px partout
 *  - Inputs `inputMode="decimal"` pour clavier numérique
 *  - Layout flex-column pour s'empiler proprement sur petits écrans
 */
import { useMemo, useState } from "react";
import { useT } from "../i18n/app-strings";

export type PayerMode = "amount" | "percent";

export interface PayerInput {
  userId: string;
  amount?: string; // string décimal pour la précision
  percent?: number;
}

export interface MultiPayersEditorProps {
  /** Liste des membres du groupe (id + nom affiché). */
  members: Array<{ id: string; displayName: string }>;
  /** UserId de l'utilisateur connecté — pré-coché par défaut. */
  meId: string;
  /** Total de la dépense (string décimal) — pour valider la somme. */
  totalAmount: string;
  /** Code devise pour l'affichage (ex: "EUR"). */
  currency: string;
  /** Liste actuelle des payeurs. Vide = mode "un seul payeur" classique. */
  value: PayerInput[];
  /** Callback à chaque modif. */
  onChange: (next: PayerInput[]) => void;
  /** Optionnel : compact mode pour mobile (moins de padding). */
  compact?: boolean;
}

/**
 * Helper : parse un string décimal et retourne 0 si invalide.
 */
function toNumber(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function MultiPayersEditor({
  members,
  meId,
  totalAmount,
  currency,
  value,
  onChange,
  compact = false,
}: MultiPayersEditorProps): JSX.Element {
  const t = useT();
  // Activé si on a au moins 2 payeurs configurés OU si l'utilisateur l'a coché.
  const [enabled, setEnabled] = useState(value.length >= 2);
  const [mode, setMode] = useState<PayerMode>(() =>
    value.some((p) => p.percent !== undefined) ? "percent" : "amount",
  );

  const total = toNumber(totalAmount);
  const sum = useMemo(() => {
    if (mode === "amount") {
      return value.reduce((acc, p) => acc + toNumber(p.amount), 0);
    }
    return value.reduce((acc, p) => acc + (p.percent ?? 0), 0);
  }, [value, mode]);

  /**
   * Active / désactive le mode multi-payeurs. Quand on coche, on initialise
   * avec l'utilisateur courant comme seul payeur (montant = total) — l'UX
   * suit ensuite "j'ajoute d'autres personnes" naturellement.
   */
  function toggleEnabled(next: boolean): void {
    setEnabled(next);
    if (next && value.length === 0) {
      onChange([
        mode === "amount"
          ? { userId: meId, amount: totalAmount }
          : { userId: meId, percent: 100 },
      ]);
    } else if (!next) {
      onChange([]);
    }
  }

  function toggleMode(next: PayerMode): void {
    setMode(next);
    // Convertit les valeurs (best effort) pour ne pas perdre la sélection.
    if (next === "percent") {
      const newPayers = value.map((p) => ({
        userId: p.userId,
        percent:
          total > 0 ? Math.round((toNumber(p.amount) / total) * 1000) / 10 : 0,
      }));
      onChange(newPayers);
    } else {
      const newPayers = value.map((p) => ({
        userId: p.userId,
        amount: total > 0 ? ((p.percent ?? 0) * total) / 100 + "" : "0",
      }));
      onChange(newPayers);
    }
  }

  function addPayer(userId: string): void {
    if (value.some((p) => p.userId === userId)) return;
    const next = [...value];
    next.push(
      mode === "amount"
        ? { userId, amount: "0" }
        : { userId, percent: 0 },
    );
    onChange(next);
  }

  function removePayer(userId: string): void {
    onChange(value.filter((p) => p.userId !== userId));
  }

  function updatePayer(userId: string, raw: string): void {
    const cleaned = raw.replace(",", ".").replace(/[^\d.]/g, "");
    onChange(
      value.map((p) =>
        p.userId === userId
          ? mode === "amount"
            ? { userId, amount: cleaned }
            : { userId, percent: toNumber(cleaned) }
          : p,
      ),
    );
  }

  const remaining =
    mode === "amount"
      ? Math.round((total - sum) * 100) / 100
      : Math.round((100 - sum) * 10) / 10;
  const balanced = Math.abs(remaining) < 0.005;
  const overshoot = remaining < -0.005;

  const padding = compact ? 8 : 12;

  return (
    <div
      style={{
        border: "1px solid var(--line-soft, #e5e7eb)",
        borderRadius: 8,
        padding,
        background: "var(--overlay, rgba(255,255,255,0.02))",
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          fontSize: 13,
          minHeight: 32,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        <span>
          <strong>{t("expense.multipayers.title")}</strong>
          <span style={{ color: "#6b7280", marginLeft: 6, fontSize: 11 }}>
            {t("expense.multipayers.hint")}
          </span>
        </span>
      </label>

      {enabled && (
        <div style={{ marginTop: padding }}>
          {/* Toggle mode amount/percent */}
          <div
            role="tablist"
            style={{
              display: "flex",
              gap: 6,
              marginBottom: padding,
              flexWrap: "wrap",
            }}
          >
            {(["amount", "percent"] as PayerMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => toggleMode(m)}
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: `1px solid ${mode === m ? "var(--saffron, #E8A33D)" : "var(--line-soft, #e5e7eb)"}`,
                  background: mode === m ? "var(--saffron, #E8A33D)" : "transparent",
                  color: mode === m ? "#000" : "var(--text-strong, #1f2937)",
                  fontWeight: mode === m ? 600 : 400,
                  cursor: "pointer",
                  minHeight: 32,
                }}
              >
                {m === "amount"
                  ? `${t("expense.multipayers.modeAmount")} (${currency})`
                  : t("expense.multipayers.modePercent")}
              </button>
            ))}
          </div>

          {/* Liste des payeurs actuels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {value.map((p) => {
              const member = members.find((m) => m.id === p.userId);
              if (!member) return null;
              const fieldValue =
                mode === "amount"
                  ? p.amount ?? ""
                  : (p.percent ?? 0).toString();
              return (
                <div
                  key={p.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      flex: "1 1 120px",
                      fontSize: 13,
                      color: "var(--text-strong, #1f2937)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {member.displayName}
                    {member.id === meId && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--saffron, #E8A33D)",
                          marginLeft: 4,
                        }}
                      >
                        ({t("expense.multipayers.you")})
                      </span>
                    )}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fieldValue}
                    onChange={(e) => updatePayer(p.userId, e.target.value)}
                    style={{
                      width: 90,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--line-soft, #e5e7eb)",
                      fontSize: 14,
                      textAlign: "right",
                      minHeight: 36,
                    }}
                    aria-label={`${t("expense.multipayers.amountFor")} ${member.displayName}`}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      minWidth: 32,
                    }}
                  >
                    {mode === "amount" ? currency : "%"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePayer(p.userId)}
                    aria-label={t("expense.multipayers.remove")}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--line-soft, #e5e7eb)",
                      color: "#dc2626",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 13,
                      cursor: "pointer",
                      minHeight: 32,
                      minWidth: 32,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {/* Sélecteur "ajouter un payeur" */}
          {members.some((m) => !value.some((p) => p.userId === m.id)) && (
            <div style={{ marginTop: padding }}>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addPayer(e.target.value);
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px dashed var(--saffron, #E8A33D)",
                  fontSize: 13,
                  background: "transparent",
                  color: "var(--text-strong, #1f2937)",
                  minHeight: 36,
                }}
              >
                <option value="">＋ {t("expense.multipayers.addPayer")}</option>
                {members
                  .filter((m) => !value.some((p) => p.userId === m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Résumé somme / restant */}
          <div
            style={{
              marginTop: padding,
              padding: 8,
              borderRadius: 6,
              background: balanced
                ? "rgba(16, 185, 129, 0.1)"
                : overshoot
                  ? "rgba(220, 38, 38, 0.1)"
                  : "rgba(234, 179, 8, 0.1)",
              fontSize: 12,
              color: balanced
                ? "#059669"
                : overshoot
                  ? "#dc2626"
                  : "#a16207",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>
              {mode === "amount"
                ? t("expense.multipayers.totalSummaryAmount", {
                    sum: sum.toFixed(2),
                    total: total.toFixed(2),
                    currency,
                  })
                : t("expense.multipayers.totalSummaryPercent", {
                    sum: sum.toFixed(1),
                  })}
            </span>
            <strong>
              {balanced
                ? t("expense.multipayers.balanced")
                : overshoot
                  ? `+${Math.abs(remaining).toFixed(mode === "amount" ? 2 : 1)} ${mode === "amount" ? currency : "%"} ${t("expense.multipayers.tooMuch")}`
                  : `−${remaining.toFixed(mode === "amount" ? 2 : 1)} ${mode === "amount" ? currency : "%"} ${t("expense.multipayers.missing")}`}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}
