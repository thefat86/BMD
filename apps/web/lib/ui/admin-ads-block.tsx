"use client";

/**
 * Bloc admin · Module Publicités (spec §6.4).
 *
 * Permet à l'admin de :
 *  - Activer/désactiver globalement les pubs (master switch)
 *  - Choisir les régies (AdMob, Meta Audience, partenaires diaspora)
 *  - Définir les catégories autorisées et bloquées
 *  - Plafonner le nombre de pubs/utilisateur/jour
 *  - Choisir les formats (banner / interstitial / video / native)
 *
 * Note importante : c'est l'UI de **configuration**. L'intégration réelle
 * avec AdMob / Meta nécessite un compte chez chaque régie. L'app peut
 * lire cette config et afficher des pubs réelles uniquement quand les
 * SDK sont activés en prod.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";

const NETWORKS = [
  { code: "admob", name: "Google AdMob", desc: "Régie principale mobile" },
  { code: "meta_audience", name: "Meta Audience Network", desc: "Pubs Facebook/Instagram-quality" },
  { code: "diaspora_partners", name: "Partenaires diaspora", desc: "Annonceurs locaux (telcos, voyage, mode)" },
];

const COMMON_CATEGORIES = [
  "voyage",
  "mode",
  "telcos",
  "banques",
  "alimentation",
  "education",
  "immobilier",
  "automobile",
];

const ALWAYS_BLOCKED = [
  { code: "crypto", name: "Crypto-monnaies" },
  { code: "gambling", name: "Jeux d'argent" },
  { code: "predatory_credit", name: "Crédit prédateur" },
  { code: "alcohol", name: "Alcool" },
];

const FORMATS = [
  { code: "banner", name: "Bannière" },
  { code: "interstitial", name: "Interstitiel" },
  { code: "video", name: "Vidéo récompensée" },
  { code: "native", name: "Native (intégrée)" },
];

export function AdminAdsBlock(): JSX.Element {
  const toast = useToast();
  const [config, setConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customCat, setCustomCat] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await api.adminGetAdsConfig();
      setConfig(r);
    } catch (e) {
      console.warn("Failed to load ads config", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(patch: any) {
    setSaving(true);
    try {
      const r = await api.adminUpdateAdsConfig(patch);
      setConfig(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div />;
  if (!config) return <div />;

  function toggleNetwork(code: string) {
    const next: string[] = config.enabledNetworks.includes(code)
      ? config.enabledNetworks.filter((c: string) => c !== code)
      : [...config.enabledNetworks, code];
    void save({ enabledNetworks: next });
  }

  function toggleFormat(code: string) {
    const next: string[] = config.enabledFormats.includes(code)
      ? config.enabledFormats.filter((c: string) => c !== code)
      : [...config.enabledFormats, code];
    void save({ enabledFormats: next });
  }

  function toggleCategory(code: string) {
    const next: string[] = config.allowedCategories.includes(code)
      ? config.allowedCategories.filter((c: string) => c !== code)
      : [...config.allowedCategories, code];
    void save({ allowedCategories: next });
  }

  function addCustomCategory() {
    const c = customCat.trim().toLowerCase();
    if (!c) return;
    if (config.allowedCategories.includes(c)) return;
    void save({ allowedCategories: [...config.allowedCategories, c] });
    setCustomCat("");
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>📢 Publicités</h2>
        <span
          style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 99,
            background: config.enabled
              ? "rgba(63,125,92,0.15)"
              : "rgba(138,123,107,0.15)",
            color: config.enabled ? "#7DC59E" : "var(--muted)",
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {config.enabled ? "✓ DIFFUSION" : "○ COUPÉ"}
        </span>
      </div>
      <p
        className="muted"
        style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}
      >
        Affichées <strong>uniquement</strong> aux utilisateurs sur plan
        Découverte (FREE). Premium et Communauté n'en voient jamais.
        Modifications appliquées en temps réel (spec §6.4).
      </p>

      {/* Master switch */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 12,
          background: "rgba(0,0,0,0.25)",
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13, color: "var(--cream)" }}>
            Diffusion globale
          </strong>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Master switch — coupe tout en cas d'urgence (régie en panne, plainte, etc.)
          </div>
        </div>
        <button
          onClick={() => save({ enabled: !config.enabled })}
          disabled={saving}
          style={{
            padding: "8px 16px",
            background: config.enabled
              ? "var(--emerald, #3F7D5C)"
              : "var(--rose, #ef4444)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            minHeight: 36,
          }}
        >
          {config.enabled ? "✓ ON" : "✗ OFF"}
        </button>
      </div>

      {/* Régies */}
      <Section title="Régies activées">
        {NETWORKS.map((n) => {
          const on = config.enabledNetworks.includes(n.code);
          return (
            <Toggle
              key={n.code}
              label={n.name}
              hint={n.desc}
              on={on}
              onClick={() => toggleNetwork(n.code)}
            />
          );
        })}
      </Section>

      {/* Formats */}
      <Section title="Formats activés">
        {FORMATS.map((f) => {
          const on = config.enabledFormats.includes(f.code);
          return (
            <Toggle
              key={f.code}
              label={f.name}
              on={on}
              onClick={() => toggleFormat(f.code)}
            />
          );
        })}
      </Section>

      {/* Catégories autorisées */}
      <Section title="Catégories autorisées">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {COMMON_CATEGORIES.map((c) => {
            const on = config.allowedCategories.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 99,
                  background: on
                    ? "rgba(63,125,92,0.15)"
                    : "rgba(255,255,255,0.04)",
                  border: on
                    ? "1px solid var(--emerald)"
                    : "1px solid var(--line-soft)",
                  color: on ? "#7DC59E" : "var(--cream-soft)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {on ? "✓ " : ""}
                {c}
              </button>
            );
          })}
        </div>
        {/* Ajout custom */}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={customCat}
            onChange={(e) => setCustomCat(e.target.value)}
            placeholder="Ajouter une catégorie…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomCategory();
              }
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 12,
              background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--line-soft)",
              borderRadius: 6,
              color: "var(--cream)",
            }}
          />
          <button
            onClick={addCustomCategory}
            className="btn btn-sm"
            style={{ padding: "6px 12px" }}
          >
            ＋
          </button>
        </div>
        {/* Liste catégories ajoutées hors common */}
        {config.allowedCategories.filter(
          (c: string) => !COMMON_CATEGORIES.includes(c),
        ).length > 0 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              marginTop: 8,
            }}
          >
            Personnalisées :{" "}
            {config.allowedCategories
              .filter((c: string) => !COMMON_CATEGORIES.includes(c))
              .map((c: string) => (
                <span
                  key={c}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: "rgba(232,163,61,0.08)",
                    border: "1px solid var(--line)",
                    borderRadius: 99,
                    padding: "3px 10px",
                    margin: "2px 4px 2px 0",
                    color: "var(--saffron)",
                    fontWeight: 600,
                  }}
                >
                  {c}
                  <button
                    onClick={() => toggleCategory(c)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      padding: 0,
                      marginLeft: 4,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
          </div>
        )}
      </Section>

      {/* Catégories bloquées (toujours) */}
      <Section title="Catégories TOUJOURS bloquées (irrévocable)">
        {ALWAYS_BLOCKED.map((b) => (
          <div
            key={b.code}
            style={{
              display: "inline-block",
              padding: "6px 12px",
              borderRadius: 99,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid var(--rose, #ef4444)",
              color: "var(--rose, #ef4444)",
              fontSize: 11,
              fontWeight: 600,
              margin: "2px 4px 2px 0",
            }}
          >
            ✗ {b.name}
          </div>
        ))}
      </Section>

      {/* Paramètres numériques */}
      <Section title="Limites par utilisateur">
        <NumberField
          label="Pubs max / utilisateur / jour"
          value={config.maxPerUserPerDay}
          onChange={(v) => save({ maxPerUserPerDay: v })}
          min={0}
          max={50}
          hint="0 = pas de pubs (équivalent au master OFF)"
        />
        <NumberField
          label="Interstitiel toutes les N sessions"
          value={config.interstitialEverySessions}
          onChange={(v) => save({ interstitialEverySessions: v })}
          min={1}
          max={100}
          hint="Plus le chiffre est élevé, moins l'utilisateur est dérangé"
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
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
        {title}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onClick,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--cream)", fontWeight: 600 }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</div>
        )}
      </div>
      <button
        onClick={onClick}
        style={{
          padding: "4px 10px",
          background: on
            ? "var(--emerald, #3F7D5C)"
            : "rgba(255,255,255,0.06)",
          color: on ? "#fff" : "var(--cream-soft)",
          border: "none",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          minWidth: 52,
        }}
      >
        {on ? "✓ ON" : "OFF"}
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--cream)",
          marginBottom: 4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={{
          width: 100,
          padding: "6px 10px",
          background: "rgba(0,0,0,0.3)",
          border: "1px solid var(--line-soft)",
          borderRadius: 6,
          color: "var(--cream)",
          fontSize: 13,
        }}
      />
      {hint && (
        <div
          style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
