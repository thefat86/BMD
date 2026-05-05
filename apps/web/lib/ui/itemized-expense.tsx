"use client";

/**
 * Composants pour le mode "split par item".
 *
 * <ItemizedEditor> : utilisé dans le formulaire de création/édition pour
 * lister/éditer les items détectés par OCR (ou saisis manuellement).
 *
 * <ItemizedClaimsView> : utilisé sur une dépense existante en mode ITEMIZED
 * pour permettre à chaque membre de "claimer" les items consommés et voir
 * combien il doit payer.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";

export interface DraftItem {
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  category?: string;
}

/**
 * Editeur de la liste d'items (avant création de la dépense ou édition).
 * Permet d'ajouter/supprimer des lignes et de remplir l'éditeur depuis
 * le résultat OCR.
 *
 * Le total des items doit correspondre au montant de la dépense.
 * On affiche un indicateur visuel d'écart si non.
 */
export function ItemizedEditor({
  items,
  onChange,
  totalAmount,
  currency,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  totalAmount: string;
  currency: string;
}): JSX.Element {
  const itemsSum = items.reduce(
    (s, it) => s + parseFloat(it.totalPrice || "0"),
    0,
  );
  const expected = parseFloat(totalAmount || "0");
  const diff = itemsSum - expected;
  const diffOk = Math.abs(diff) < 0.02;

  function update(idx: number, patch: Partial<DraftItem>) {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      // Recalcul auto totalPrice = quantity × unitPrice
      if ("quantity" in patch || "unitPrice" in patch) {
        const q = parseFloat(String(merged.quantity || 1));
        const u = parseFloat(merged.unitPrice || "0");
        merged.totalPrice = (q * u).toFixed(2);
      }
      return merged;
    });
    onChange(next);
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function addBlank() {
    onChange([
      ...items,
      { description: "", quantity: 1, unitPrice: "", totalPrice: "" },
    ]);
  }

  return (
    <div
      style={{
        background: "rgba(232,163,61,0.04)",
        border: "1px solid var(--line-soft, rgba(244,228,193,0.08))",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <strong style={{ fontSize: 13, color: "var(--cream)" }}>
          🧾 Articles consommés
        </strong>
        <span
          style={{
            fontSize: 11,
            color: diffOk ? "var(--emerald, #10b981)" : "var(--rose, #ef4444)",
            fontWeight: 600,
          }}
        >
          {itemsSum.toFixed(2)} / {expected.toFixed(2)} {currency}
          {!diffOk && diff !== 0 && (
            <> · écart {diff > 0 ? "+" : ""}{diff.toFixed(2)}</>
          )}
        </span>
      </div>

      {items.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted, #8A7B6B)",
            fontStyle: "italic",
            margin: "8px 0",
          }}
        >
          Aucune ligne. Ajoute manuellement, ou scanne le ticket pour
          détecter automatiquement.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 50px 80px 30px",
                gap: 6,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={it.description}
                onChange={(e) => update(idx, { description: e.target.value })}
                placeholder="ex: Pizza Margherita"
                style={inputStyle}
                aria-label="Description"
              />
              <input
                type="number"
                step="1"
                min="1"
                value={it.quantity}
                onChange={(e) =>
                  update(idx, { quantity: parseFloat(e.target.value) || 1 })
                }
                style={inputStyle}
                aria-label="Quantité"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={it.totalPrice}
                onChange={(e) => update(idx, { totalPrice: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
                aria-label="Prix"
              />
              <button
                onClick={() => remove(idx)}
                aria-label="Retirer"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--rose, #ef4444)",
                  cursor: "pointer",
                  fontSize: 16,
                  padding: 4,
                  minHeight: 32,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addBlank}
        type="button"
        style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "transparent",
          border: "1px dashed var(--saffron, #E8A33D)",
          color: "var(--saffron, #E8A33D)",
          borderRadius: 8,
          fontSize: 12,
          cursor: "pointer",
          minHeight: 36,
        }}
      >
        ＋ Ajouter une ligne
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  border: "1px solid var(--line-soft, rgba(244,228,193,0.08))",
  borderRadius: 6,
  background: "rgba(0,0,0,0.3)",
  color: "var(--cream, #F4E4C1)",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

/**
 * Vue de claim : sur une dépense existante, chaque membre voit la liste
 * des items et peut cocher/décocher ce qu'il a consommé.
 *
 * Affiche en bas le total à payer par chaque membre selon les claims actuels.
 */
export function ItemizedClaimsView({
  expenseId,
  meId,
  currency,
  refreshKey,
}: {
  expenseId: string;
  meId?: string;
  currency: string;
  /** Permet de forcer un refresh externe (ex: après upload ticket) */
  refreshKey?: any;
}): JSX.Element {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [its, sh] = await Promise.all([
        api.listExpenseItems(expenseId),
        api.getItemizedShares(expenseId),
      ]);
      setItems(its);
      setShares(sh);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, refreshKey]);

  async function toggle(item: any) {
    const myClaim = item.claims.find((c: any) => c.userId === meId);
    try {
      if (myClaim) {
        await api.unclaimItem(item.id);
      } else {
        await api.claimItem(item.id);
      }
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  if (loading) {
    return (
      <p style={{ fontSize: 12, color: "#8A7B6B" }}>Chargement des articles…</p>
    );
  }

  if (items.length === 0) {
    return (
      <p
        style={{
          fontSize: 12,
          color: "#8A7B6B",
          fontStyle: "italic",
          padding: "8px 0",
        }}
      >
        Aucun article enregistré sur cette dépense.
      </p>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 13, color: "var(--cream, #F4E4C1)" }}>
          🧾 Articles · clique pour réclamer ce que tu as consommé
        </strong>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => {
          const myClaim = item.claims.find((c: any) => c.userId === meId);
          const isMine = !!myClaim;
          const claimers = item.claims;
          return (
            <button
              key={item.id}
              onClick={() => toggle(item)}
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: isMine
                  ? "rgba(232,163,61,0.12)"
                  : "rgba(255,255,255,0.04)",
                border: isMine
                  ? "1px solid var(--saffron, #E8A33D)"
                  : "1px solid var(--line-soft, rgba(244,228,193,0.08))",
                borderRadius: 10,
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                color: "inherit",
                fontFamily: "inherit",
                minHeight: 44,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: `1.5px solid ${isMine ? "var(--saffron, #E8A33D)" : "var(--line, rgba(232,163,61,0.18))"}`,
                  background: isMine ? "var(--saffron, #E8A33D)" : "transparent",
                  color: "#16111E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {isMine ? "✓" : ""}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--cream, #F4E4C1)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {parseFloat(item.quantity) > 1 && (
                    <span style={{ color: "var(--gold, #C9A24A)" }}>
                      {parseFloat(item.quantity).toFixed(0)}× {" "}
                    </span>
                  )}
                  {item.description}
                </div>
                {claimers.length > 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted, #8A7B6B)",
                      marginTop: 2,
                    }}
                  >
                    {claimers
                      .map(
                        (c: any) =>
                          `${c.user.displayName}${parseFloat(c.share) < 1 ? ` (${(parseFloat(c.share) * 100).toFixed(0)}%)` : ""}`,
                      )
                      .join(" · ")}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--saffron, #E8A33D)",
                  flexShrink: 0,
                }}
              >
                {parseFloat(item.totalPrice).toFixed(2)} {currency}
              </div>
            </button>
          );
        })}
      </div>

      {/* Récap par membre */}
      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          background: "rgba(63,125,92,0.06)",
          border: "1px solid rgba(63,125,92,0.2)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            color: "var(--gold, #C9A24A)",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          ⚖ Total à régler par membre
        </div>
        {shares
          .filter((s) => parseFloat(s.amountOwed) > 0)
          .map((s) => (
            <div
              key={s.userId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                padding: "4px 0",
                color:
                  s.userId === meId
                    ? "var(--saffron, #E8A33D)"
                    : "var(--cream-soft, #E8D5B7)",
                fontWeight: s.userId === meId ? 700 : 500,
              }}
            >
              <span>
                {s.displayName}
                {s.userId === meId && " (moi)"} · {s.items.length} article
                {s.items.length > 1 ? "s" : ""}
              </span>
              <span>
                {parseFloat(s.amountOwed).toFixed(2)} {currency}
              </span>
            </div>
          ))}
        {shares.every((s) => parseFloat(s.amountOwed) === 0) && (
          <p style={{ fontSize: 12, fontStyle: "italic", color: "#8A7B6B" }}>
            Personne n'a encore réclamé d'article.
          </p>
        )}
      </div>
    </div>
  );
}
