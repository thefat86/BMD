"use client";

/**
 * <CategoryRulesBlock /> · V110 — UI pour les règles de partage automatiques
 * par catégorie (spec §3.7). Refonte V45-light : organisation claire en 3
 * zones (header titre+subtitle, intro descriptive, liste de catégories en
 * cards V45 individuelles), encart d'édition distinct en dessous quand
 * actif, palette ivory/paper/cocoa.
 *
 * Pattern : "toutes les dépenses de transport sont partagées entre tous"
 * → quand l'user crée une nouvelle dépense et choisit "transport", le
 * formulaire pré-remplit le mode + les participants définis ici.
 *
 * Permissions : seuls ADMIN et TRESORIER peuvent éditer.
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { Icon, type IconName } from "./icons";

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

// Couleur d'accent par catégorie pour la lisibilité visuelle.
const CATEGORIES: Array<{
  value: string;
  iconName: IconName;
  label: string;
  color: string;
}> = [
  { value: "resto", iconName: "utensils", label: "Resto", color: "#C58A2E" },
  { value: "courses", iconName: "shopping-cart", label: "Courses", color: "#2F8B5C" },
  { value: "transport", iconName: "car", label: "Transport", color: "#5B6CFF" },
  { value: "logement", iconName: "home", label: "Logement", color: "#9F4628" },
  { value: "loisirs", iconName: "party-popper", label: "Loisirs", color: "#B58FE0" },
  { value: "autres", iconName: "folder", label: "Autres", color: "#6B5A47" },
];

const SPLIT_LABELS: Record<
  SplitMode,
  { iconName: IconName | null; label: string }
> = {
  EQUAL: { iconName: null, label: "Égal" },
  UNEQUAL: { iconName: "pencil", label: "Parts" },
  PERCENTAGE: { iconName: null, label: "%" },
  ITEMIZED: { iconName: "receipt", label: "Articles" },
};

export function CategoryRulesBlock({
  groupId,
  members,
  canEdit,
}: {
  groupId: string;
  members: Member[];
  canEdit: boolean;
}) {
  const t = useT();
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
    <section
      data-testid="category-rules-block"
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
      }}
    >
      {/* Header : titre + subtitle empilés */}
      <header style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 20,
            fontWeight: 600,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.2,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "rgba(197,138,46,0.14)",
              color: "var(--v45-saffron, #C58A2E)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="sparkles" size={15} strokeWidth={1.7} />
          </span>
          Règles automatiques par catégorie
        </h2>
        <p
          style={{
            margin: "6px 0 0 38px",
            fontSize: 12,
            color: "var(--cocoa-soft, #6B5A47)",
            lineHeight: 1.5,
          }}
        >
          Pré-remplit le formulaire de dépense (mode + participants) selon la
          catégorie choisie. L'auteur d'une dépense peut toujours surcharger.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            background: "rgba(159,70,40,0.08)",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 10,
            color: "var(--v45-terracotta, #9F4628)",
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      {!rules ? (
        <p
          style={{
            margin: 0,
            padding: "20px 0",
            color: "var(--cocoa-soft, #6B5A47)",
            fontSize: 13,
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          Chargement…
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
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
                    ? "var(--paper, #FFFFFF)"
                    : "var(--ivory, #FBF6EC)",
                  border: rule
                    ? `1px solid ${cat.color}40`
                    : "1px solid rgba(43,31,21,0.08)",
                  borderRadius: 14,
                  padding: 12,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Bandeau coloré gauche si règle active */}
                {rule && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: cat.color,
                    }}
                  />
                )}

                {/* Ligne principale : icône + label + status + actions */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    paddingLeft: rule ? 6 : 0,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: `${cat.color}1F`,
                      border: `1px solid ${cat.color}55`,
                      color: cat.color,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={cat.iconName} size={17} strokeWidth={1.7} />
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--cocoa, #2B1F15)",
                        lineHeight: 1.2,
                      }}
                    >
                      {cat.label}
                    </div>
                    {rule && !isEditing ? (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--cocoa-soft, #6B5A47)",
                          marginTop: 3,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: `${cat.color}14`,
                            color: cat.color,
                            fontWeight: 700,
                          }}
                        >
                          {SPLIT_LABELS[rule.defaultSplitMode].iconName && (
                            <Icon
                              name={SPLIT_LABELS[rule.defaultSplitMode].iconName!}
                              size={11}
                              strokeWidth={1.7}
                            />
                          )}
                          {SPLIT_LABELS[rule.defaultSplitMode].label}
                        </span>
                        <span aria-hidden style={{ color: "var(--cocoa-mute, #A99580)" }}>
                          ·
                        </span>
                        <span>
                          {rule.defaultParticipantUserIds.length === 0 ||
                          rule.defaultParticipantUserIds.length === members.length
                            ? "tous les membres"
                            : `${rule.defaultParticipantUserIds.length} membre${rule.defaultParticipantUserIds.length > 1 ? "s" : ""}`}
                        </span>
                      </div>
                    ) : !isEditing ? (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--cocoa-mute, #A99580)",
                          fontStyle: "italic",
                          marginTop: 3,
                        }}
                      >
                        Aucune règle — choix à la création
                      </div>
                    ) : null}
                  </div>

                  {/* Actions à droite */}
                  {!isEditing && canEdit && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => startEdit(cat.value)}
                        disabled={!!busy}
                        style={{
                          padding: "6px 12px",
                          background: rule
                            ? `${cat.color}14`
                            : "var(--ivory-2, #F4ECD8)",
                          border: rule
                            ? `1px solid ${cat.color}40`
                            : "1px solid rgba(43,31,21,0.10)",
                          borderRadius: 8,
                          color: rule ? cat.color : "var(--cocoa, #2B1F15)",
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: busy ? "wait" : "pointer",
                          fontFamily: "inherit",
                          minHeight: 32,
                          touchAction: "manipulation",
                        }}
                      >
                        {rule ? "Modifier" : "+ Définir"}
                      </button>
                      {rule && (
                        <button
                          type="button"
                          onClick={() => deleteRule(cat.value)}
                          disabled={busy === cat.value}
                          title={t("categoryRules.deleteTitle") || "Supprimer"}
                          aria-label={t("categoryRules.deleteTitle") || "Supprimer cette règle"}
                          style={{
                            padding: "6px 8px",
                            background: "transparent",
                            border: "1px solid rgba(159,70,40,0.25)",
                            borderRadius: 8,
                            color: "var(--v45-terracotta, #9F4628)",
                            cursor: busy === cat.value ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 32,
                            minWidth: 32,
                            touchAction: "manipulation",
                          }}
                        >
                          <Icon name="trash-2" size={14} strokeWidth={1.7} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Encart édition (s'ouvre en dessous quand cette catégorie
                    est sélectionnée) */}
                {isEditing && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      background: "var(--v45-saffron-pale, #F6E8C5)",
                      border: `1px solid ${cat.color}40`,
                      borderRadius: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    {/* Mode de partage */}
                    <div>
                      <label
                        style={{
                          fontSize: 10,
                          color: "var(--cocoa-soft, #6B5A47)",
                          fontWeight: 800,
                          display: "block",
                          marginBottom: 8,
                          textTransform: "uppercase",
                          letterSpacing: 1.3,
                        }}
                      >
                        Mode de partage
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 6,
                        }}
                      >
                        {(Object.keys(SPLIT_LABELS) as SplitMode[]).map((m) => {
                          const splitDef = SPLIT_LABELS[m];
                          const active = editMode === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setEditMode(m)}
                              style={{
                                padding: "9px 6px",
                                fontSize: 11.5,
                                fontWeight: 700,
                                border: active
                                  ? `1px solid ${cat.color}`
                                  : "1px solid rgba(43,31,21,0.10)",
                                background: active
                                  ? `${cat.color}1F`
                                  : "var(--paper, #FFFFFF)",
                                borderRadius: 9,
                                color: active
                                  ? cat.color
                                  : "var(--cocoa, #2B1F15)",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 4,
                                minHeight: 38,
                                touchAction: "manipulation",
                              }}
                            >
                              {splitDef.iconName && (
                                <Icon
                                  name={splitDef.iconName}
                                  size={12}
                                  strokeWidth={1.7}
                                />
                              )}
                              <span>{splitDef.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Participants */}
                    <div>
                      <label
                        style={{
                          fontSize: 10,
                          color: "var(--cocoa-soft, #6B5A47)",
                          fontWeight: 800,
                          display: "block",
                          marginBottom: 8,
                          textTransform: "uppercase",
                          letterSpacing: 1.3,
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
                          const checked = editParticipants.includes(m.user.id);
                          return (
                            <button
                              key={m.user.id}
                              type="button"
                              onClick={() => toggleParticipant(m.user.id)}
                              style={{
                                padding: "7px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                border: checked
                                  ? `1px solid ${cat.color}`
                                  : "1px solid rgba(43,31,21,0.14)",
                                background: checked
                                  ? `${cat.color}1F`
                                  : "var(--paper, #FFFFFF)",
                                color: checked
                                  ? cat.color
                                  : "var(--cocoa, #2B1F15)",
                                borderRadius: 999,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                minHeight: 32,
                                touchAction: "manipulation",
                              }}
                            >
                              {checked && (
                                <Icon name="check" size={11} strokeWidth={2.2} />
                              )}
                              <span>{m.user.displayName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                        marginTop: 2,
                      }}
                    >
                      <button
                        type="button"
                        onClick={cancelEdit}
                        style={{
                          padding: "9px 14px",
                          background: "transparent",
                          border: "1px solid rgba(43,31,21,0.14)",
                          borderRadius: 10,
                          color: "var(--cocoa-soft, #6B5A47)",
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          minHeight: 38,
                        }}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => saveRule(cat.value)}
                        disabled={busy === cat.value}
                        style={{
                          padding: "9px 16px",
                          background:
                            "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                          border: "none",
                          borderRadius: 10,
                          color: "#FFFFFF",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: busy === cat.value ? "wait" : "pointer",
                          fontFamily: "inherit",
                          minHeight: 38,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          boxShadow: "0 4px 12px rgba(197,138,46,0.30)",
                        }}
                      >
                        {busy === cat.value ? (
                          "…"
                        ) : (
                          <>
                            <Icon name="check" size={13} strokeWidth={2.2} />
                            Enregistrer
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
