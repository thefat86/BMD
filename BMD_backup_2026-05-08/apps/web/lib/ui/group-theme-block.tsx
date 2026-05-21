"use client";

/**
 * <GroupThemeBlock /> · UI pour personnaliser la charte graphique d'un
 * groupe (spec §6.8).
 *
 * Permet à un admin de paroisse / association / club de fixer ses propres
 * couleurs (primaire + accent) qui s'appliqueront en CSS au scope du
 * groupe — sans affecter le reste de l'app pour l'utilisateur.
 *
 * Usage type :
 *  - Paroisse Saint-Martin → violet liturgique #6b46c1 + or #d4af37
 *  - Club de foot → couleurs club (vert #228b22 + blanc)
 *
 * Le composant rend un color picker simple pour chaque couleur + une
 * preview live d'un bouton CTA + d'un badge pour visualiser le rendu.
 *
 * Permissions : seuls les admins du groupe voient ce bloc — on suppose
 * que le parent (settings page) le conditionne déjà.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";

const BMD_DEFAULT_PRIMARY = "#e8a33d";
const BMD_DEFAULT_ACCENT = "#b54732";

const PRESETS: Array<{
  name: string;
  emoji: string;
  primary: string;
  accent: string;
}> = [
  { name: "BMD (défaut)", emoji: "🌅", primary: BMD_DEFAULT_PRIMARY, accent: BMD_DEFAULT_ACCENT },
  { name: "Liturgique", emoji: "⛪", primary: "#6b46c1", accent: "#d4af37" },
  { name: "Foot Club", emoji: "⚽", primary: "#16a34a", accent: "#0e7c34" },
  { name: "Diaspora", emoji: "🌍", primary: "#0ea5e9", accent: "#f59e0b" },
  { name: "Mariage", emoji: "💍", primary: "#ec4899", accent: "#9d174d" },
  { name: "Étudiant", emoji: "🎓", primary: "#3b82f6", accent: "#1e40af" },
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
    <div className="card" data-testid="group-theme-block">
      <div className="card-head">
        <h2>🎨 Charte du groupe</h2>
        {hasCustom && (
          <span style={{ fontSize: 11, color: "var(--saffron, #e8a33d)" }}>
            ● personnalisée
          </span>
        )}
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          lineHeight: 1.5,
          margin: "0 0 14px",
        }}
      >
        Personnalise les couleurs pour que les membres reconnaissent ta
        communauté. Ne change que pour ce groupe — le reste de BMD garde
        son apparence par défaut.
      </p>

      {error && (
        <div className="error" role="alert" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="success" style={{ marginBottom: 10 }}>
          {success}
        </div>
      )}

      {/* Presets */}
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1,
            display: "block",
            marginBottom: 6,
          }}
        >
          Modèles
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: 6,
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
                  padding: "8px 10px",
                  fontSize: 11,
                  border: isCurrent
                    ? "1px solid var(--saffron)"
                    : "1px solid rgba(244,228,193,0.10)",
                  background: "rgba(244,228,193,0.04)",
                  borderRadius: 8,
                  color: "var(--cream)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  textAlign: "left",
                }}
              >
                <span aria-hidden>{p.emoji}</span>
                <span style={{ flex: 1 }}>{p.name}</span>
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: p.primary,
                    border: "1px solid rgba(0,0,0,0.2)",
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: p.accent,
                    border: "1px solid rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Color pickers manuels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 14,
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
      <div
        aria-label={t("theme.previewLabel")}
        style={{
          padding: 14,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            color: "var(--cream-soft)",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Aperçu
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            disabled
            style={{
              padding: "10px 18px",
              background: `linear-gradient(135deg, ${primary}, ${accent})`,
              color: "#16111E",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: "default",
              fontFamily: "inherit",
            }}
          >
            ＋ Nouvelle dépense
          </button>
          <span
            style={{
              padding: "5px 10px",
              background: `${primary}30`,
              color: primary,
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${primary}60`,
            }}
          >
            ★ Membre actif
          </span>
          <span style={{ color: accent, fontSize: 13, fontWeight: 600 }}>
            Solde : 42,50 €
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {hasCustom && (
          <button
            type="button"
            className="btn-ghost"
            onClick={reset}
            disabled={busy}
          >
            Restaurer BMD
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={save}
          disabled={busy}
        >
          {busy ? "…" : "✓ Enregistrer"}
        </button>
      </div>
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
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--cream-soft)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "6px 8px",
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.18)",
          borderRadius: 8,
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 28,
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
            // Validation hex partielle (l'utilisateur peut taper)
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
              onChange(v);
            }
          }}
          maxLength={7}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: "var(--cream)",
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            outline: "none",
          }}
        />
      </div>
      {hint && (
        <span style={{ fontSize: 10, color: "var(--cream-muted, #888)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}
