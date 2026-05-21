"use client";

/**
 * Admin · CMS Traductions (spec §6.6).
 *
 * Liste filtrable + édition inline ligne par ligne. Sauvegarde par PUT
 * sur (key, locale). Les valeurs surchargent les défauts hardcodés
 * dans `marketing-translations.ts` côté front.
 *
 * Note : pour l'instant, l'utilisation effective des overrides côté front
 * nécessite de re-déclencher un fetch / d'invalider le cache. Étape suivante
 * possible : exposer un endpoint public `/translations/:locale` qui sert
 * directement les overrides en JSON pour que le front les fusionne.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, isUnauthorized } from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { useDialog } from "@/lib/ui/dialog-provider";
import { ResponsiveShell } from "@/lib/ui/responsive-shell";
import { useBreakpoint } from "@/lib/use-breakpoint";

interface T {
  key: string;
  locale: string;
  value: string;
  context: string | null;
  updatedAt: string;
}

const LOCALES = [
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "pt", flag: "🇵🇹", name: "Português" },
  { code: "ar", flag: "🇲🇦", name: "العربية" },
  { code: "sw", flag: "🇰🇪", name: "Kiswahili" },
  { code: "zh", flag: "🇨🇳", name: "中文" },
  { code: "wo", flag: "🇸🇳", name: "Wolof" },
  { code: "am", flag: "🇪🇹", name: "አማርኛ" },
  { code: "ln", flag: "🇨🇩", name: "Lingála" },
  { code: "pcm", flag: "🇨🇲", name: "Pidgin" },
];

export default function TranslationsAdminPage() {
  const router = useRouter();
  const dialog = useDialog();
  const { isMobile } = useBreakpoint();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filterLocale, setFilterLocale] = useState("");
  const [search, setSearch] = useState("");

  // États d'édition par ligne
  const [editing, setEditing] = useState<{
    key: string;
    locale: string;
    value: string;
  } | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Création d'une nouvelle traduction
  const [newKey, setNewKey] = useState("");
  const [newLocale, setNewLocale] = useState("fr");
  const [newValue, setNewValue] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.adminListTranslations({
        locale: filterLocale || undefined,
        search: search || undefined,
      });
      setItems(r);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLocale, search]);

  async function save() {
    if (!editing) return;
    setSavingKey(`${editing.key}::${editing.locale}`);
    setError(null);
    try {
      const r = await api.adminUpsertTranslation(editing.key, editing.locale, {
        value: editing.value,
      });
      // Met à jour la liste localement
      setItems((prev) => {
        const idx = prev.findIndex(
          (i) => i.key === r.key && i.locale === r.locale,
        );
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = r;
          return copy;
        }
        return [r, ...prev];
      });
      setEditing(null);
    } catch (e) {
      setError(e);
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteOne(key: string, locale: string) {
    if (
      !(await dialog.confirm(
        `Supprimer la traduction "${key}" (${locale}) ?`,
        {
          variant: "danger",
          title: "Supprimer la traduction",
          confirmLabel: "Supprimer",
        },
      ))
    )
      return;
    try {
      await api.adminDeleteTranslation(key, locale);
      setItems((prev) =>
        prev.filter((i) => !(i.key === key && i.locale === locale)),
      );
    } catch (e) {
      setError(e);
    }
  }

  async function createNew() {
    if (!newKey || !newValue) return;
    setSavingKey("__new__");
    try {
      const r = await api.adminUpsertTranslation(newKey, newLocale, {
        value: newValue,
      });
      setItems((prev) => [r, ...prev]);
      setNewKey("");
      setNewValue("");
    } catch (e) {
      setError(e);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <ResponsiveShell
      breadcrumb="Administration › Traductions"
      desktopTitle="🌍 Traductions"
      subtitle="Active des langues, surcharge des chaînes, vois la couverture par locale."
      mobileTitle="Traductions"
      back={{ href: "/admin" }}
      hideFab
    >
      <div
        style={{
          padding: isMobile ? "8px 16px 24px" : 0,
          maxWidth: isMobile ? "100%" : 1100,
          margin: "0 auto",
        }}
      >
      {/* === Bandeau % complétude + toggles activation === */}
      <CoverageBlock />

      {/* === Création === */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 14 }}>＋ Ajouter / surcharger</h2>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
          <input
            type="text"
            placeholder="Clé (ex: marketing.hero.headline)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--line-soft)",
              background: "var(--overlay-2)",
              color: "var(--cream)",
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
            }}
          />
          <select
            value={newLocale}
            onChange={(e) => setNewLocale(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--line-soft)",
              background: "var(--overlay-2)",
              color: "var(--cream)",
              fontSize: 12,
            }}
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          placeholder="Valeur traduite…"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--line-soft)",
            background: "var(--overlay-2)",
            color: "var(--cream)",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <button
          type="button"
          className="btn btn-sm"
          onClick={createNew}
          disabled={!newKey || !newValue || savingKey === "__new__"}
          style={{ marginTop: 8 }}
        >
          {savingKey === "__new__" ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {/* === Filtres === */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <select
          value={filterLocale}
          onChange={(e) => setFilterLocale(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--line-soft)",
            background: "var(--overlay-2)",
            color: "var(--cream)",
            fontSize: 12,
          }}
        >
          <option value="">Toutes les langues</option>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Rechercher (clé ou texte)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--line-soft)",
            background: "var(--overlay-2)",
            color: "var(--cream)",
            fontSize: 12,
          }}
        />
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {items.length} entrée{items.length > 1 ? "s" : ""}
        </span>
      </div>

      {error ? <ApiErrorAlert error={error} onClose={() => setError(null)} /> : null}

      {/* === Tableau === */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p className="muted" style={{ padding: 20 }}>Chargement…</p>
        ) : items.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>
            Aucune traduction surchargée pour ce filtre. Les défauts du code sont
            utilisés.
          </p>
        ) : (
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  background: "var(--overlay)",
                  textAlign: "left",
                  color: "var(--muted)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                <th style={{ padding: "8px 12px" }}>Clé</th>
                <th style={{ padding: "8px 12px", width: 60 }}>Lang.</th>
                <th style={{ padding: "8px 12px" }}>Valeur</th>
                <th style={{ padding: "8px 12px", width: 100 }}>Modifié</th>
                <th style={{ padding: "8px 12px", width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const id = `${t.key}::${t.locale}`;
                const isEditing =
                  editing?.key === t.key && editing?.locale === t.locale;
                const flag = LOCALES.find((l) => l.code === t.locale)?.flag ?? "🌐";
                return (
                  <tr
                    key={id}
                    style={{
                      borderTop: "1px solid var(--line-soft)",
                      color: "var(--cream)",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11,
                        color: "var(--saffron)",
                      }}
                    >
                      {t.key}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <span title={t.locale}>{flag}</span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {isEditing ? (
                        <textarea
                          value={editing.value}
                          onChange={(e) =>
                            setEditing({ ...editing, value: e.target.value })
                          }
                          rows={2}
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid var(--saffron)",
                            background: "var(--overlay-2)",
                            color: "var(--cream)",
                            fontSize: 12,
                            resize: "vertical",
                          }}
                        />
                      ) : (
                        <span style={{ color: "var(--cream)" }}>{t.value}</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 10,
                        color: "var(--muted)",
                      }}
                    >
                      {new Date(t.updatedAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={save}
                            disabled={savingKey === id}
                            style={{ padding: "4px 8px", fontSize: 11 }}
                          >
                            {savingKey === id ? "…" : "✓"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => setEditing(null)}
                            style={{ padding: "4px 8px", fontSize: 11 }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() =>
                              setEditing({
                                key: t.key,
                                locale: t.locale,
                                value: t.value,
                              })
                            }
                            style={{ padding: "4px 8px", fontSize: 11 }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => deleteOne(t.key, t.locale)}
                            style={{
                              padding: "4px 8px",
                              fontSize: 11,
                              color: "#ef4444",
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </ResponsiveShell>
  );
}

// ============================================================
// CoverageBlock — bandeau de complétude + toggles activation
// ============================================================

interface CoverageRow {
  code: string;
  name: string;
  flag: string;
  isActive: boolean;
  present: number;
  missing: number;
  percent: number;
}

function CoverageBlock() {
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [totalKeys, setTotalKeys] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await api.adminTranslationsCoverage();
    setCoverage(r.locales);
    setTotalKeys(r.totalKeys);
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(code: string, isActive: boolean) {
    setBusy(code);
    try {
      await api.adminUpdateLocale(code, { isActive });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (coverage.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(232,163,61,0.04))",
      }}
    >
      <div className="between" style={{ alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "var(--cream)" }}>
          📊 Complétude par langue
        </h3>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {totalKeys} clé{totalKeys > 1 ? "s" : ""} de référence
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 8,
        }}
      >
        {coverage.map((r) => {
          const color =
            r.percent === 100
              ? "#10b981"
              : r.percent >= 50
                ? "#f59e0b"
                : "#ef4444";
          return (
            <div
              key={r.code}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--line-soft)",
                borderRadius: 10,
                padding: 10,
                opacity: r.isActive ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--cream)",
                    fontWeight: 600,
                  }}
                >
                  {r.flag} {r.name}
                </span>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                    fontSize: 10,
                    color: "var(--cream-soft)",
                  }}
                  title={r.isActive ? "Désactiver cette langue" : "Activer cette langue"}
                >
                  <input
                    type="checkbox"
                    checked={r.isActive}
                    onChange={(e) => toggle(r.code, e.target.checked)}
                    disabled={busy === r.code || r.code === "fr"}
                    style={{ cursor: r.code === "fr" ? "not-allowed" : "pointer" }}
                  />
                  {r.code === "fr" ? "Réf." : "Actif"}
                </label>
              </div>

              {/* Barre de progression */}
              <div
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${r.percent}%`,
                    height: "100%",
                    background: color,
                    transition: "width 0.3s",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 4,
                  fontSize: 10,
                  color: "var(--muted)",
                }}
              >
                <span style={{ color }}>{r.percent}%</span>
                <span>
                  {r.present}/{totalKeys}
                  {r.missing > 0 && ` · -${r.missing}`}
                </span>
              </div>

              {/* Bouton auto-traduction IA (spec §6.6) — disponible quand
                  il manque des clés ET que la locale n'est pas le français
                  (langue source). Coût : ~1ct par 100 clés via GPT-4o-mini. */}
              {r.code !== "fr" && r.missing > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(r.code);
                    try {
                      const result = await api.adminAutoTranslate(
                        "fr",
                        r.code,
                      );
                      alert(
                        `${result.translated} clés traduites · ${result.skipped} ignorées · ${result.errors.length} erreurs\n\nClés taggées "ia_draft" — un relecteur natif doit les valider avant publication.`,
                      );
                      await load();
                    } catch (e) {
                      alert(
                        `Auto-traduction indisponible : ${(e as Error).message}`,
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                  disabled={busy === r.code}
                  style={{
                    marginTop: 6,
                    width: "100%",
                    padding: "5px 8px",
                    background: "rgba(232,163,61,0.10)",
                    border: "1px solid rgba(232,163,61,0.35)",
                    borderRadius: 6,
                    color: "var(--saffron)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: busy === r.code ? "wait" : "pointer",
                    fontFamily: "inherit",
                  }}
                  title={`Pré-traduit les ${r.missing} clés manquantes via GPT-4o-mini`}
                >
                  {busy === r.code
                    ? "🤖 Traduction…"
                    : `🤖 Auto-traduire (${r.missing})`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
