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
import { SegmentedControl } from "./segmented-control";

export type PayerMode = "amount" | "percent";

export interface PayerInput {
  userId: string;
  amount?: string; // string décimal pour la précision
  percent?: number;
}

export interface MultiPayersEditorProps {
  /** Liste des membres du groupe (id + nom affiché). */
  members: Array<{ id: string; displayName: string }>;
  /**
   * UserId de l'utilisateur connecté — pré-coché par défaut.
   * V239.C — Tolère undefined/"" pour éviter le crash quand le caller
   * oublie de la passer (fallback : 1er membre de la liste).
   */
  meId?: string;
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
  meId: meIdProp,
  totalAmount,
  currency,
  value,
  onChange,
  compact = false,
}: MultiPayersEditorProps): JSX.Element {
  const t = useT();
  // V239.C — meId tolérant : si non fourni ou inconnu, fallback sur le 1er
  // membre. Évite tout crash + permet l'auto-init du payeur de référence
  // quand le caller (drawer édition) n'a pas le contexte de session.
  const meId =
    meIdProp && members.some((m) => m.id === meIdProp)
      ? meIdProp
      : (members[0]?.id ?? "");
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

  /**
   * V43 — Quick actions : "diviser également" pour n personnes ajoutées.
   * Évite à l'utilisateur de taper 3.33333 si 3 payeurs / 100€.
   */
  function splitEquallyBetweenAll(): void {
    if (value.length === 0) return;
    const n = value.length;
    if (mode === "amount") {
      const each = total > 0 ? Math.floor((total / n) * 100) / 100 : 0;
      // Ajuste la dernière part pour matcher exactement le total
      const newPayers = value.map((p, i) => {
        if (i === n - 1) {
          const sumOthers = each * (n - 1);
          const last = Math.round((total - sumOthers) * 100) / 100;
          return { userId: p.userId, amount: last.toFixed(2) };
        }
        return { userId: p.userId, amount: each.toFixed(2) };
      });
      onChange(newPayers);
    } else {
      const each = Math.floor((100 / n) * 10) / 10;
      const newPayers = value.map((p, i) => {
        if (i === n - 1) {
          const sumOthers = each * (n - 1);
          const last = Math.round((100 - sumOthers) * 10) / 10;
          return { userId: p.userId, percent: last };
        }
        return { userId: p.userId, percent: each };
      });
      onChange(newPayers);
    }
  }

  /**
   * V43 — Ajout en masse : tous les membres du groupe deviennent payeurs
   * (mode collectif "tout le monde a mis une partie"). On split à parts
   * égales par défaut, l'utilisateur peut ensuite ajuster.
   */
  function addAllMembers(): void {
    const newPayers = members.map((m) => ({
      userId: m.id,
      ...(mode === "amount" ? { amount: "0" } : { percent: 0 }),
    }));
    onChange(newPayers);
    // Et on split immédiatement à parts égales
    setTimeout(() => {
      const n = newPayers.length;
      if (n === 0) return;
      if (mode === "amount") {
        const each = total > 0 ? Math.floor((total / n) * 100) / 100 : 0;
        const final = newPayers.map((p, i) => {
          if (i === n - 1) {
            const sumOthers = each * (n - 1);
            const last = Math.round((total - sumOthers) * 100) / 100;
            return { userId: p.userId, amount: last.toFixed(2) };
          }
          return { userId: p.userId, amount: each.toFixed(2) };
        });
        onChange(final);
      } else {
        const each = Math.floor((100 / n) * 10) / 10;
        const final = newPayers.map((p, i) => {
          if (i === n - 1) {
            const sumOthers = each * (n - 1);
            const last = Math.round((100 - sumOthers) * 10) / 10;
            return { userId: p.userId, percent: last };
          }
          return { userId: p.userId, percent: each };
        });
        onChange(final);
      }
    }, 0);
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
          {/* V61 — Toggle mode amount/percent en SegmentedControl V45
              (pill saffron solide qui glisse, invariant XOR garanti). */}
          <div style={{ marginBottom: padding }}>
            <SegmentedControl<PayerMode>
              value={mode}
              onChange={toggleMode}
              ariaLabel="Mode de saisie multi-payeurs"
              size="sm"
              segments={[
                {
                  value: "amount",
                  label: `${t("expense.multipayers.modeAmount")} (${currency})`,
                },
                {
                  value: "percent",
                  label: t("expense.multipayers.modePercent"),
                },
              ]}
            />
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
              // V52.E3 — Slider visuel V45 complémentaire : calcul du pct pour le gradient + max selon le mode
              const modeIsPercent = mode === "percent";
              const sliderMax = modeIsPercent ? 100 : Math.max(total, 0.01);
              const sliderStep = modeIsPercent ? 1 : 0.01;
              const sliderValueNum = modeIsPercent
                ? p.percent ?? 0
                : toNumber(p.amount);
              const sliderPct = sliderMax > 0
                ? Math.min(100, Math.max(0, (sliderValueNum / sliderMax) * 100))
                : 0;
              return (
                <div
                  key={p.userId}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
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
                  {/* V52.E3 — Slider visuel V45 complémentaire */}
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={sliderStep}
                    value={sliderValueNum}
                    onChange={(e) => updatePayer(p.userId, e.target.value)}
                    aria-label={`${t("expense.multipayers.amountFor")} ${member.displayName} (slider)`}
                    style={{
                      width: "100%",
                      height: 6,
                      appearance: "none",
                      WebkitAppearance: "none",
                      background: `linear-gradient(to right, var(--v45-saffron, #C58A2E) 0%, var(--v45-terracotta, #9F4628) ${sliderPct}%, var(--v45-line, rgba(43,31,21,0.08)) ${sliderPct}%, var(--v45-line, rgba(43,31,21,0.08)) 100%)`,
                      borderRadius: 999,
                      outline: "none",
                      cursor: "grab",
                      margin: 0,
                      padding: 0,
                    }}
                    className="bmd-mp-slider"
                  />
                </div>
              );
            })}
          </div>

          {/* V43 — Quick actions de répartition (le game-changer pour 10-20+
              personnes). 2 boutons :
                · "Diviser également" : si on a 3 payeurs et 100€ → 33.33/33.33/33.34
                · "Toute l'équipe" : ajoute TOUS les membres comme payeurs
                  et split immédiatement à parts égales. */}
          {value.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: padding,
                flexWrap: "wrap",
              }}
            >
              {value.length >= 2 && (
                <button
                  type="button"
                  onClick={splitEquallyBetweenAll}
                  style={quickActionBtnStyle}
                >
                  ⚖ {t("expense.multipayers.splitEqually") || "Diviser également"}
                </button>
              )}
              {members.length > value.length && (
                <button
                  type="button"
                  onClick={addAllMembers}
                  style={quickActionBtnStyle}
                >
                  👥 {t("expense.multipayers.allMembers") || "Toute l'équipe"}
                </button>
              )}
            </div>
          )}

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
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px dashed var(--saffron, #E8A33D)",
                  fontSize: 14,
                  background: "rgba(232,163,61,0.06)",
                  color: "var(--cream)",
                  minHeight: 40,
                  fontFamily: "inherit",
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
      {/* V52.E3 — Slider visuel V45 complémentaire (styles globaux pour thumb cross-browser) */}
      <style jsx global>{`
        .bmd-mp-slider::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--paper, #ffffff);
          border: 2.5px solid var(--v45-saffron, #c58a2e);
          box-shadow: 0 2px 6px rgba(43, 31, 21, 0.15);
          cursor: grab;
          transition: transform 120ms ease;
        }
        .bmd-mp-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--paper, #ffffff);
          border: 2.5px solid var(--v45-saffron, #c58a2e);
          box-shadow: 0 2px 6px rgba(43, 31, 21, 0.15);
          cursor: grab;
          transition: transform 120ms ease;
        }
        .bmd-mp-slider:active::-webkit-slider-thumb {
          cursor: grabbing;
          transform: scale(1.08);
        }
        .bmd-mp-slider:active::-moz-range-thumb {
          cursor: grabbing;
          transform: scale(1.08);
        }
        .bmd-mp-slider:focus-visible {
          outline: 2px solid var(--v45-saffron, #c58a2e);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}

const quickActionBtnStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 120,
  padding: "10px 12px",
  background:
    "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(91,108,255,0.06))",
  border: "1px solid rgba(232,163,61,0.30)",
  color: "var(--cream)",
  borderRadius: 10,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  minHeight: 40,
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};
