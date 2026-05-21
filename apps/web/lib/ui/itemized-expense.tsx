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
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";
// V112 — Avatar plan-aware : photo (si plan payant) ou initiales colorées.
import { AvatarColored } from "./avatar-colored";

export interface DraftItem {
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  category?: string;
  /**
   * Liste des userIds qui consomment cet article (assignation au moment
   * de la création). Si plusieurs membres → l'article sera divisé entre eux.
   * Si vide → tout le monde participe (équivalent au mode "claim ouvert").
   */
  assignedUserIds?: string[];
}

interface MemberLite {
  id: string;
  displayName: string;
  /** V112 — Photo membre (URL absolue ou data URL). Nullée par le
   *  backend si le membre n'est pas sur un plan permettant la photo. */
  avatar?: string | null;
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
  members,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  totalAmount: string;
  currency: string;
  /** Membres du groupe (pour assigner chaque article directement) */
  members?: MemberLite[];
}): JSX.Element {
  const t = useT();
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

  // V52.G5 — Polish V45 écran 15 : isBalanced = écart ≤ 0.01
  const isBalanced = Math.abs(diff) <= 0.01;
  const itemsSumStr = `${itemsSum.toFixed(2)} ${currency}`;
  const expectedStr = `${expected.toFixed(2)} ${currency}`;

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
      </div>

      {/* V52.G5 — Polish V45 écran 15 : bandeau plein largeur emerald-soft / terracotta-soft */}
      <div
        style={{
          padding: "10px 14px",
          background: isBalanced
            ? "rgba(79,142,110,0.10)"
            : "rgba(159,70,40,0.08)",
          border: `1px solid ${isBalanced ? "rgba(79,142,110,0.30)" : "rgba(159,70,40,0.30)"}`,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--cocoa, var(--cream))",
          marginBottom: 10,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {isBalanced ? "✓ Articles équilibrés" : "Total articles vs attendu"}
        </span>
        <span
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontWeight: 700,
            color: isBalanced
              ? "var(--v45-emerald, #4F8E6E)"
              : "var(--v45-terracotta, #9F4628)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {itemsSumStr} / {expectedStr}
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
        // V43 — Refonte mobile-native : cards empilables full-width. Plus
        // de scroll latéral / "ça crache" : chaque article est une carte
        // avec une rangée pour la description (full-width) puis une rangée
        // compacte qty × prix × supprimer en dessous. Les membres assignés
        // (s'il y a) apparaissent en grille d'avatars en bas.
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it, idx) => (
            <ItemCard
              key={idx}
              item={it}
              index={idx}
              currency={currency}
              members={members}
              onUpdate={(patch) => update(idx, patch)}
              onRemove={() => remove(idx)}
              t={t}
            />
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
  padding: "10px 12px",
  // V43 — 16px obligatoire mobile pour éviter le zoom Safari (cf. globals.css)
  // mais on garde 14px desktop via le @media du global CSS.
  fontSize: 14,
  border: "1px solid var(--line-soft, rgba(244,228,193,0.08))",
  borderRadius: 8,
  background: "rgba(0,0,0,0.3)",
  color: "var(--cream, #F4E4C1)",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

/**
 * V43 — Une "card" article mobile-native (remplace l'ancien layout en grille
 * tableau qui débordait sur petits écrans). Layout :
 *   ┌────────────────────────────────────────────┐
 *   │ [Description full-width]                ✕  │
 *   │ [Qté]  [Prix unit]  [Total auto]            │
 *   │ Pour : [👤] [👤] [👤] [👤+] (assignation)   │
 *   └────────────────────────────────────────────┘
 *
 * - La description prend toute la largeur (pas de grille étroite).
 * - Quantité / Prix / Total sur une rangée avec flex 1fr — chacun lisible.
 * - L'assignation membres est en grille d'avatars compacts qui wrap si
 *   beaucoup de membres (jusqu'à 20+ sans problème).
 */
function ItemCard({
  item,
  index,
  currency,
  members,
  onUpdate,
  onRemove,
  t,
}: {
  item: DraftItem;
  index: number;
  currency: string;
  members?: MemberLite[];
  onUpdate: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.10))",
        border: "1px solid rgba(232,163,61,0.18)",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Numéro discret de l'article + bouton supprimer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--saffron, #E8A33D)",
        }}
      >
        <span>Article {index + 1}</span>
        {/* V52.G5 — Polish V45 écran 15 : bouton remove circulaire 26×26 */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("common.remove") || "Supprimer l'article"}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "var(--ivory-2, rgba(244,228,193,0.04))",
            border: "1px solid var(--v45-line-strong, rgba(43,31,21,0.16))",
            color: "var(--v45-rose, #C2563D)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={14} color="currentColor" strokeWidth={2} />
        </button>
      </div>

      {/* Description full-width */}
      <input
        type="text"
        value={item.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        placeholder={
          t("expense.itemDescriptionPlaceholder") || "ex: Pizza Margherita"
        }
        aria-label={t("expense.description") || "Description"}
        style={inputStyle}
      />

      {/* Rangée Quantité × Prix unitaire × Total auto */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr) minmax(0,1.4fr)",
          gap: 8,
          alignItems: "end",
        }}
      >
        <FieldGroup label={t("expense.quantity") || "Qté"}>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={item.quantity}
            onChange={(e) =>
              onUpdate({ quantity: parseFloat(e.target.value) || 1 })
            }
            style={{ ...inputStyle, textAlign: "center" }}
            aria-label={t("expense.quantity") || "Quantité"}
          />
        </FieldGroup>
        <FieldGroup label={t("expense.unitPrice") || "Prix unit."}>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={item.unitPrice}
            onChange={(e) => onUpdate({ unitPrice: e.target.value })}
            placeholder="0.00"
            style={{ ...inputStyle, textAlign: "right" }}
            aria-label={t("expense.unitPrice") || "Prix unitaire"}
          />
        </FieldGroup>
        <FieldGroup label={`${t("expense.lineTotal") || "Total"} (${currency})`}>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={item.totalPrice}
            onChange={(e) => onUpdate({ totalPrice: e.target.value })}
            placeholder="0.00"
            style={{
              ...inputStyle,
              textAlign: "right",
              background: "rgba(232,163,61,0.08)",
              borderColor: "rgba(232,163,61,0.30)",
              color: "#F4E4C1",
              fontWeight: 700,
            }}
            aria-label={t("expense.lineTotal") || "Total ligne"}
          />
        </FieldGroup>
      </div>

      {/* Assignation membres en grille d'avatars compacts (wrap-friendly) */}
      {members && members.length > 0 && (
        <ItemMembersAssign
          members={members}
          selected={item.assignedUserIds ?? []}
          onChange={(ids) => onUpdate({ assignedUserIds: ids })}
        />
      )}
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--cream-soft, #d4c4a8)",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

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

/**
 * Petit sélecteur multi-membres affiché sous chaque article.
 * Affiche les membres comme des "chips" toggleables.
 * - Aucun sélectionné = tout le monde paie l'article (équivalent claim ouvert)
 * - 1+ sélectionnés = ces membres se partagent l'article au prorata
 */
function ItemMembersAssign({
  members,
  selected,
  onChange,
}: {
  members: MemberLite[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useT();
  function toggle(userId: string) {
    if (selected.includes(userId)) {
      onChange(selected.filter((id) => id !== userId));
    } else {
      onChange([...selected, userId]);
    }
  }

  // V43 — Refonte mobile-native : grille d'avatars compacts (wrap-friendly).
  // "Tout le groupe" est un chip "ALL" toggle qui désélectionne tous les
  // membres (mode défaut = consommé par tout le monde). Sinon, chaque
  // membre est un petit avatar circulaire avec initiale + tick si sélectionné.
  return (
    <div
      style={{
        paddingTop: 8,
        borderTop: "1px dashed rgba(244,228,193,0.10)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--cream-soft, #d4c4a8)",
        }}
      >
        <span>
          {t("expense.itemFor") || "Pour qui ?"}
        </span>
        <span style={{ color: "var(--saffron, #E8A33D)", fontSize: 10 }}>
          {selected.length === 0
            ? t("expense.allShareItemNote") || "Tout le groupe"
            : `${selected.length}/${members.length}`}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(46px, 1fr))",
          gap: 6,
        }}
      >
        {/* Chip "tout le groupe" : reset selection à [] (mode équipartage) */}
        <button
          type="button"
          onClick={() => onChange([])}
          aria-label={t("expense.allShareItemNote") || "Tout le groupe"}
          title={t("expense.allShareItemNote") || "Tout le groupe"}
          style={{
            ...avatarChipStyle(selected.length === 0),
            background:
              selected.length === 0
                ? "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))"
                : "rgba(244,228,193,0.04)",
            color: selected.length === 0 ? "#16111e" : "var(--cream-soft, #d4c4a8)",
          }}
        >
          {/* V52.C3 — SVG users remplace EMOJI */}
          <Icon name="users" size={16} color="currentColor" strokeWidth={1.6} />
        </button>
        {members.map((m) => {
          const active = selected.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              title={m.displayName}
              aria-label={m.displayName}
              aria-pressed={active}
              style={avatarChipStyle(active)}
            >
              {/* V112 — Photo si plan payant ; sinon initiales colorées.
                  Ring saffron pour l'état actif (déjà géré par avatarChipStyle). */}
              <AvatarColored
                userId={m.id}
                initials={m.displayName}
                photoUrl={m.avatar ?? null}
                size={36}
              />
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#16111e",
                    color: "var(--emerald, #7DC59E)",
                    fontSize: 9,
                    fontWeight: 900,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1.5px solid var(--saffron, #E8A33D)",
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function avatarChipStyle(active: boolean): React.CSSProperties {
  return {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    minHeight: 44,
    borderRadius: "50%",
    background: active
      ? "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))"
      : "rgba(232,163,61,0.10)",
    color: active ? "#16111e" : "var(--cream-soft, #d4c4a8)",
    border: active
      ? "1.5px solid var(--saffron, #E8A33D)"
      : "1.5px solid rgba(232,163,61,0.25)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    boxSizing: "border-box",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  };
}

// V43 — L'ancien ItemMembersAssign (chips text "✓ Prénom") a été remplacé
// par la grille d'avatars compacts ci-dessus, qui passe mieux sur petit
// écran et reste lisible pour 20+ membres.
