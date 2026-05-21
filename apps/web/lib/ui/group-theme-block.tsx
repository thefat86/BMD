"use client";

/**
 * <GroupThemeBlock /> · V110 — Charte graphique du groupe (spec §6.8).
 * Refonte V45-light propre : header titre+subtitle, modèles en cards,
 * color pickers ivory, preview live dans encart paper.
 *
 * Permet à un admin de paroisse / association / club de fixer ses propres
 * couleurs (primaire + accent) qui s'appliquent en CSS au scope du groupe
 * sans affecter le reste de l'app.
 *
 * Permissions : seuls les admins du groupe voient ce bloc — le parent
 * (settings page) le conditionne déjà.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";

const BMD_DEFAULT_PRIMARY = "#C58A2E";
const BMD_DEFAULT_ACCENT = "#9F4628";

const PRESETS: Array<{
  name: string;
  emoji: string;
  primary: string;
  accent: string;
}> = [
  { name: "BMD (défaut)", emoji: "🌅", primary: BMD_DEFAULT_PRIMARY, accent: BMD_DEFAULT_ACCENT },
  { name: "Liturgique", emoji: "⛪", primary: "#6B46C1", accent: "#D4AF37" },
  { name: "Foot Club", emoji: "⚽", primary: "#16A34A", accent: "#0E7C34" },
  { name: "Diaspora", emoji: "🌍", primary: "#0EA5E9", accent: "#F59E0B" },
  { name: "Mariage", emoji: "💍", primary: "#EC4899", accent: "#9D174D" },
  { name: "Étudiant", emoji: "🎓", primary: "#3B82F6", accent: "#1E40AF" },
];

export function GroupThemeBlock({ groupId }: { groupId: string }) {
  const t = useT();
  const [primary, setPrimary] = useState(BMD_DEFAULT_PRIMARY);
  const [accent, setAccent] = useState(BMD_DEFAULT_ACCENT);
  const [hasCustom, setHasCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.getGroupTheme(groupId);
      if (r.theme) {
        setPrimary(r.theme.primaryColor);
        setAccent(r.theme.accentColor);
        setHasCustom(true);
      } else {
        setPrimary(BMD_DEFAULT_PRIMARY);
        setAccent(BMD_DEFAULT_ACCENT);
        setHasCustom(false);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [groupId]);

  async function save() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.setGroupTheme(groupId, {
        primaryColor: primary,
        accentColor: accent,
      });
      setHasCustom(true);
      setSuccess("Charte enregistrée ✓");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.resetGroupTheme(groupId);
      setPrimary(BMD_DEFAULT_PRIMARY);
      setAccent(BMD_DEFAULT_ACCENT);
      setHasCustom(false);
      setSuccess("Charte BMD restaurée ✓");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(p: { primary: string; accent: string }) {
    setPrimary(p.primary);
    setAccent(p.accent);
  }

  return (
    <section
      data-testid="group-theme-block"
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
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
              <Icon name="palette" size={15} strokeWidth={1.7} />
            </span>
            Charte du groupe
          </h2>
          {hasCustom && (
            <span
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 999,
                background: "rgba(197,138,46,0.16)",
                color: "var(--v45-saffron, #C58A2E)",
                fontWeight: 800,
                letterSpacing: 0.8,
              }}
            >
              ● PERSONNALISÉE
            </span>
          )}
        </div>
        <p
          style={{
            margin: "6px 0 0 38px",
            fontSize: 12,
            color: "var(--cocoa-soft, #6B5A47)",
            lineHeight: 1.5,
          }}
        >
          Personnalise les couleurs pour que les membres reconnaissent ta
          communauté. Ne change que pour ce groupe — le reste de BMD garde
          son apparence par défaut.
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
      {success && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            background: "rgba(47,139,92,0.08)",
            border: "1px solid rgba(47,139,92,0.30)",
            borderRadius: 10,
            color: "#2F8B5C",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      {/* Modèles prédéfinis */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Modèles</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 8,
          }}
        >
          {PRESETS.map((p) => {
            const isCurrent = primary === p.primary && accent === p.accent;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                style={{
                  padding: "10px 12px",
                  fontSize: 12,
                  border: isCurrent
                    ? "1px solid var(--v45-saffron, #C58A2E)"
                    : "1px solid rgba(43,31,21,0.10)",
                  background: isCurrent
                    ? "var(--v45-saffron-pale, #F6E8C5)"
                    : "var(--ivory, #FBF6EC)",
                  borderRadius: 10,
                  color: "var(--cocoa, #2B1F15)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  fontWeight: 600,
                  minHeight: 40,
                  touchAction: "manipulation",
                  position: "relative",
                }}
              >
                <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
                  {p.emoji}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name}
                </span>
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: p.primary,
                      border: "1px solid rgba(43,31,21,0.20)",
                    }}
                  />
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: p.accent,
                      border: "1px solid rgba(43,31,21,0.20)",
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Color pickers manuels en grid 2-col */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <ColorField
          label="Couleur primaire"
          value={primary}
          onChange={setPrimary}
          hint="CTA, icônes, accents"
        />
        <ColorField
          label="Couleur secondaire"
          value={accent}
          onChange={setAccent}
          hint="Hover, badges"
        />
      </div>

      {/* Preview live */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>{t("theme.previewLabel") || "Aperçu"}</SectionLabel>
        <div
          aria-label={t("theme.previewLabel")}
          style={{
            padding: 16,
            background: "var(--ivory, #FBF6EC)",
            border: "1px solid rgba(43,31,21,0.08)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              disabled
              style={{
                padding: "10px 18px",
                background: `linear-gradient(135deg, ${primary}, ${accent})`,
                color: "#FFFFFF",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: "default",
                fontFamily: "inherit",
                boxShadow: `0 4px 12px ${primary}40`,
              }}
            >
              ＋ Nouvelle dépense
            </button>
            <span
              style={{
                padding: "5px 12px",
                background: `${primary}1F`,
                color: primary,
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 700,
                border: `1px solid ${primary}60`,
              }}
            >
              ★ Membre actif
            </span>
            <span
              className="bmd-num"
              style={{
                color: accent,
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "Cormorant Garamond, serif",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              Solde : 42,50 €
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
      >
        {hasCustom && (
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "1px solid rgba(43,31,21,0.14)",
              borderRadius: 10,
              color: "var(--cocoa-soft, #6B5A47)",
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            Restaurer BMD
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            padding: "10px 18px",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
            border: "none",
            borderRadius: 10,
            color: "#FFFFFF",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
            minHeight: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 12px rgba(197,138,46,0.30)",
          }}
        >
          {busy ? (
            "…"
          ) : (
            <>
              <Icon name="check" size={14} strokeWidth={2.2} />
              Enregistrer
            </>
          )}
        </button>
      </div>
    </section>
  );
}

// ============ HELPERS ============

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: "var(--cocoa-soft, #6B5A47)",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: 1.3,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          color: "var(--cocoa-soft, #6B5A47)",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 1.3,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "8px 10px",
          background: "var(--ivory, #FBF6EC)",
          border: "1px solid rgba(43,31,21,0.12)",
          borderRadius: 10,
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 30,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
              onChange(v);
            }
          }}
          maxLength={7}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: "var(--cocoa, #2B1F15)",
            fontSize: 13,
            fontFamily: "ui-monospace, monospace",
            outline: "none",
            fontWeight: 600,
          }}
        />
      </div>
      {hint && (
        <span
          style={{
            fontSize: 10.5,
            color: "var(--cocoa-mute, #A99580)",
            marginTop: 2,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
