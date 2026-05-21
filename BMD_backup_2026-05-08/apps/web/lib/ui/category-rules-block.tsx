"use client";

/**
 * <CategoryRulesBlock /> · UI pour configurer les règles de partage
 * automatiques par catégorie (spec §3.7).
 *
 * Exemple : "toutes les dépenses de transport sont partagées entre tous"
 * → quand l'utilisateur crée une nouvelle dépense et choisit la catégorie
 * "transport", le formulaire pré-remplit le mode + les participants
 * définis ici.
 *
 * Permissions : seuls ADMIN et TRESORIER peuvent éditer. Les autres voient
 * en lecture seule.
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";

type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";

interface CategoryRule {
  id: string;
  category: string;
  defaultSplitMode: SplitMode;
  defaultParticipantUserIds: string[];
  defaultPaidByUserId: string | null;
  updatedAt: string;
}

interface Member {
  user: { id: string; displayName: string };
  role: string;
}

const CATEGORIES: Array<{ value: string; emoji: string; label: string }> = [
  { value: "resto", emoji: "🍽️", label: "Resto" },
  { value: "courses", emoji: "🛒", label: "Courses" },
  { value: "transport", emoji: "🚗", label: "Transport" },
  { value: "logement", emoji: "🏠", label: "Logement" },
  { value: "loisirs", emoji: "🎉", label: "Loisirs" },
  { value: "autres", emoji: "📦", label: "Autres" },
];

const SPLIT_LABELS: Record<SplitMode, string> = {
  EQUAL: "🟰 Égal",
  UNEQUAL: "✏️ Parts",
  PERCENTAGE: "% Pourc.",
  ITEMIZED: "🧾 Articles",
};

export function CategoryRulesBlock({
  groupId,
  members,
  canEdit,
}: {
  groupId: string;
  members: Member[];
  /** True si l'utilisateur courant est ADMIN ou TREASURER. */
  canEdit: boolean;
}) {
  const t = useT();
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Catégorie en cours d'édition (null = aucune). */
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<SplitMode>("EQUAL");
  const [editParticipants, setEditParticipants] = useState<string[]>([]);

  async function load() {
    try {
      const r = await api.listCategoryRules(groupId);
      setRules(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [groupId]);

  function startEdit(category: string) {
    const existing = rules?.find((r) => r.category === category);
    setEditingCat(category);
    setEditMode((existing?.defaultSplitMode as SplitMode) ?? "EQUAL");
    setEditParticipants(
      existing?.defaultParticipantUserIds ?? members.map((m) => m.user.id),
    );
  }

  function cancelEdit() {
    setEditingCat(null);
    setEditParticipants([]);
  }

  async function saveRule(category: string) {
    setBusy(category);
    setError(null);
    try {
      await api.upsertCategoryRule(groupId, category, {
        defaultSplitMode: editMode,
        defaultParticipantUserIds: editParticipants,
        defaultPaidByUserId: null,
      });
      await load();
      setEditingCat(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteRule(category: string) {
    setBusy(category);
    setError(null);
    try {
      await api.deleteCategoryRule(groupId, category);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function toggleParticipant(userId: string) {
    setEditParticipants((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  return (
    <div className="card" data-testid="category-rules-block">
      <div className="card-head">
        <h2>🤖 Règles automatiques</h2>
        <span style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}>
          Pré-remplit le formulaire de dépense selon la catégorie
        </span>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          lineHeight: 1.5,
          margin: "0 0 14px",
        }}
      >
        Pour chaque catégorie, fixe le mode de partage et les participants
        par défaut. Exemple : « toutes les courses sont partagées également
        entre tous ». Le créateur d'une dépense peut toujours surcharger.
      </p>

      {error && (
        <div className="error" role="alert" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!rules ? (
        <p style={{ color: "var(--cream-soft)", fontSize: 13 }}>Chargement…</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {CATEGORIES.map((cat) => {
            const rule = rules.find((r) => r.category === cat.value);
            const isEditing = editingCat === cat.value;
            return (
              <li
                key={cat.value}
                style={{
                  background: rule
                    ? "rgba(232,163,61,0.06)"
                    : "rgba(244,228,193,0.03)",
                  border: rule
                    ? "1px solid rgba(232,163,61,0.25)"
                    : "1px solid rgba(244,228,193,0.08)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 18 }} aria-hidden>
                    {cat.emoji}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--cream)",
                      minWidth: 80,
                    }}
                  >
                    {cat.label}
                  </span>
                  {rule && !isEditing ? (
                    <span
                      style={{
                        flex: 1,
                        fontSize: 11,
                        color: "var(--cream-soft)",
                      }}
                    >
                      {SPLIT_LABELS[rule.defaultSplitMode]} ·{" "}
                      {rule.defaultParticipantUserIds.length === 0 ||
                      rule.defaultParticipantUserIds.length ===
                        members.length
                        ? "tous les membres"
                        : `${rule.defaultParticipantUserIds.length} membre${rule.defaultParticipantUserIds.length > 1 ? "s" : ""}`}
                    </span>
                  ) : !isEditing ? (
                    <span
                      style={{
                        flex: 1,
                        fontSize: 11,
                        color: "var(--cream-muted, #888)",
                        fontStyle: "italic",
                      }}
                    >
                      Aucune règle — partage par défaut au moment de la dépense
                    </span>
                  ) : null}

                  {!isEditing && canEdit && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => startEdit(cat.value)}
                      disabled={!!busy}
                      style={{ fontSize: 11, padding: "4px 8px" }}
                    >
                      {rule ? "Modifier" : "+ Définir"}
                    </button>
                  )}
                  {!isEditing && rule && canEdit && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => deleteRule(cat.value)}
                      disabled={busy === cat.value}
                      title={t("categoryRules.deleteTitle")}
                      style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        color: "var(--rose, #d9714a)",
                      }}
                    >
                      🗑
                    </button>
                  )}
                </div>

                {isEditing && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      background: "rgba(244,228,193,0.04)",
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {/* Mode de partage */}
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          color: "var(--cream-soft)",
                          fontWeight: 600,
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        Mode de partage
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 4,
                        }}
                      >
                        {(Object.keys(SPLIT_LABELS) as SplitMode[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setEditMode(m)}
                            style={{
                              padding: "8px 4px",
                              fontSize: 11,
                              fontWeight: 700,
                              border:
                                editMode === m
                                  ? "1px solid var(--saffron)"
                                  : "1px solid rgba(244,228,193,0.10)",
                              background:
                                editMode === m
                                  ? "rgba(232,163,61,0.18)"
                                  : "rgba(244,228,193,0.04)",
                              borderRadius: 6,
                              color: "var(--cream)",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {SPLIT_LABELS[m]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Participants */}
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          color: "var(--cream-soft)",
                          fontWeight: 600,
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        Participants par défaut
                      </label>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {members.map((m) => {
                          const checked = editParticipants.includes(
                            m.user.id,
                          );
                          return (
                            <button
                              key={m.user.id}
                              type="button"
                              onClick={() => toggleParticipant(m.user.id)}
                              style={{
                                padding: "5px 10px",
                                fontSize: 11,
                                border: checked
                                  ? "1px solid var(--saffron)"
                                  : "1px solid rgba(244,228,193,0.15)",
                                background: checked
                                  ? "rgba(232,163,61,0.18)"
                                  : "transparent",
                                color: "var(--cream)",
                                borderRadius: 999,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              {checked ? "✓ " : ""}
                              {m.user.displayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
                    >
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={cancelEdit}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => saveRule(cat.value)}
                        disabled={busy === cat.value}
                      >
                        {busy === cat.value ? "…" : "✓ Enregistrer"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
