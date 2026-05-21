"use client";

/**
 * Admin · Éditeur de page CMS (spec §6.7).
 *
 * Layout split-screen :
 *  - Gauche : liste de blocs draggable (HTML5 Drag & Drop API native)
 *  - Droite : preview live qui re-render à chaque modif
 *  - Top bar : titre éditable, sélecteur de langue, sauvegarder draft, publier
 *
 * Drag & drop : utilise `draggable="true"` + handlers `onDragStart`/`onDragOver`/`onDrop`.
 * Aucune dépendance npm (pas de react-dnd ni dnd-kit).
 *
 * Auto-save : après 1500ms d'inactivité, le draft est sauvegardé silencieusement.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { useDialog } from "@/lib/ui/dialog-provider";
import { CmsRenderer } from "@/lib/cms-renderer";
import { ResponsiveShell } from "@/lib/ui/responsive-shell";
import { useBreakpoint } from "@/lib/use-breakpoint";

// Génère un id stable pour les nouveaux blocs (UUID v4 simple côté client)
function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const LOCALES = [
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
  { code: "ar", flag: "🇲🇦", label: "العربية" },
  { code: "sw", flag: "🇰🇪", label: "Kiswahili" },
];

const BLOCK_TYPES = [
  { type: "heading", icon: "📰", label: "Titre" },
  { type: "paragraph", icon: "📝", label: "Paragraphe" },
  { type: "image", icon: "🖼️", label: "Image" },
  { type: "button", icon: "🔘", label: "Bouton" },
  { type: "divider", icon: "➖", label: "Séparateur" },
  { type: "quote", icon: "💬", label: "Citation" },
];

function newBlockOfType(type: string): any {
  const id = uuid();
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: { fr: "Mon titre" } };
    case "paragraph":
      return { id, type, text: { fr: "Saisis ton texte ici…" } };
    case "image":
      return {
        id,
        type,
        src: "/bmd-logo.svg",
        alt: { fr: "Description de l'image" },
        maxWidthPct: 100,
      };
    case "button":
      return {
        id,
        type,
        label: { fr: "Cliquer ici" },
        href: "#",
        variant: "primary",
      };
    case "divider":
      return { id, type, style: "solid" };
    case "quote":
      return { id, type, text: { fr: "Une belle citation…" }, author: "" };
    default:
      return { id, type };
  }
}

export default function CmsEditorPage() {
  const router = useRouter();
  const params = useParams();
  const pageId = params.id as string;
  const { alert: dlgAlert, confirm: dlgConfirm, prompt: dlgPrompt } = useDialog();
  const { isMobile } = useBreakpoint();

  const [page, setPage] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [locale, setLocale] = useState("fr");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const draggingId = useRef<string | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.adminGetCmsPage(pageId);
      setPage(r);
      setBlocks(Array.isArray(r.draftBlocks) ? r.draftBlocks : []);
      setTitle(r.title);
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
  }, [pageId]);

  // Auto-save toutes les 1.5s après modif
  useEffect(() => {
    if (!page) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDraft();
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, title]);

  async function saveDraft(opts?: { silent?: boolean }) {
    if (!page) return;
    try {
      const r = await api.adminSaveCmsDraft(pageId, { blocks, title });
      setSavedAt(r.updatedAt);
      // Si la sauvegarde réussit, on efface une éventuelle erreur passée
      // (auto-recovery — l'utilisateur a corrigé le bloc fautif).
      setError(null);
    } catch (e) {
      // L'erreur est REMONTÉE même en mode silent (on a besoin que
      // l'utilisateur la voie quand l'auto-save échoue, sinon il pense
      // que tout est OK alors que ses modifs sont perdues).
      // eslint-disable-next-line no-console
      console.warn("[cms] saveDraft failed", e);
      setError(e);
    }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const note = await dlgPrompt(
        "Note de publication (optionnel) — décris brièvement ce que tu as changé.",
        {
          title: "Publier la page",
          placeholder: "Ex: Mise à jour des mentions légales",
          confirmLabel: "Publier",
        },
      );
      // null = annulé
      if (note === null) {
        setPublishing(false);
        return;
      }
      await saveDraft({ silent: true });
      const r = await api.adminPublishCmsPage(pageId, note || undefined);
      setPage((p: any) => ({
        ...p,
        publishedAt: r.publishedAt,
        publishedBlocks: blocks,
        hasUnpublishedChanges: false,
      }));
      await dlgAlert(`Page publiée en version v${r.versionNumber}.`, {
        title: "Publication réussie 🎉",
        variant: "success",
      });
    } catch (e) {
      setError(e);
    } finally {
      setPublishing(false);
    }
  }

  async function loadVersions() {
    try {
      const r = await api.adminListCmsVersions(pageId);
      setVersions(r);
      setShowVersions(true);
    } catch (e) {
      setError(e);
    }
  }

  async function revert(versionId: string, n: number) {
    const ok = await dlgConfirm(
      `Cette action restaurera le contenu de la version v${n} et créera une nouvelle version au-dessus.`,
      {
        title: `Restaurer la version v${n} ?`,
        variant: "warning",
        confirmLabel: "Restaurer",
      },
    );
    if (!ok) return;
    try {
      await api.adminRevertCmsPage(pageId, versionId);
      await load();
      setShowVersions(false);
    } catch (e) {
      setError(e);
    }
  }

  // === Drag & Drop ===
  function onDragStart(id: string, e: React.DragEvent) {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    const srcId = draggingId.current;
    draggingId.current = null;
    if (!srcId || srcId === targetId) return;
    setBlocks((prev) => {
      const fromIdx = prev.findIndex((b) => b.id === srcId);
      const toIdx = prev.findIndex((b) => b.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved!);
      return next;
    });
  }

  /**
   * Réordonnance via boutons ⬆⬇ (mobile-friendly fallback du drag&drop
   * HTML5 qui ne marche pas en touch). Appelé depuis chaque bloc.
   */
  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  // === Mutations sur blocs ===
  function addBlock(type: string) {
    setBlocks((prev) => [...prev, newBlockOfType(type)]);
  }

  function deleteBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function updateBlock(id: string, patch: any) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  function updateText(id: string, field: string, value: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, [field]: { ...(b[field] ?? { fr: "" }), [locale]: value } }
          : b,
      ),
    );
  }

  if (loading) {
    return (
      <ResponsiveShell
        breadcrumb="Administration › CMS"
        desktopTitle="Éditeur CMS"
        mobileTitle="Éditeur"
        back={{ href: "/admin/cms" }}
        hideFab
      >
        <p className="muted" style={{ padding: 30 }}>
          Chargement de l'éditeur…
        </p>
      </ResponsiveShell>
    );
  }

  // Action primaire : Sauvegarde indicator + Versions + Publier
  const editorActions = (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {savedAt && (
        <span
          style={{
            fontSize: 10,
            color: "var(--muted)",
            fontStyle: "italic",
            display: isMobile ? "none" : "inline",
          }}
        >
          💾 {new Date(savedAt).toLocaleTimeString("fr-FR")}
        </span>
      )}
      <button
        type="button"
        onClick={loadVersions}
        className="btn-ghost btn-sm"
        style={{ padding: "5px 12px", fontSize: 11 }}
      >
        🕐 Versions
      </button>
      <button
        type="button"
        onClick={publish}
        disabled={publishing}
        className="btn btn-sm"
        style={{
          padding: "5px 14px",
          fontSize: 11,
          background: "linear-gradient(135deg, #10b981, #047857)",
          color: "white",
        }}
      >
        {publishing ? "…" : "🚀 Publier"}
      </button>
    </div>
  );

  return (
    <ResponsiveShell
      breadcrumb={`Administration › CMS › ${page?.slug ?? ""}`}
      desktopTitle={`📝 ${title || "Éditeur CMS"}`}
      subtitle={`/cms/${page?.slug ?? ""} · ${page?.publishedAt ? "Publiée" : "Non publiée"}`}
      primaryAction={editorActions}
      mobileTitle="Éditeur"
      mobileHeaderRight={editorActions}
      back={{ href: "/admin/cms" }}
      hideFab
    >
      <div
        style={{
          padding: isMobile ? "8px 16px 24px" : 0,
          maxWidth: isMobile ? "100%" : 1400,
          margin: "0 auto",
        }}
      >
      {/* Titre éditable */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre interne de la page"
        maxLength={120}
        aria-label="Titre interne"
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: 18,
          fontFamily: "Cormorant Garamond, serif",
          fontWeight: 700,
          background: "transparent",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          color: "var(--cream)",
          marginBottom: 12,
        }}
      />

      {/* Sélecteur de langue */}
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            alignSelf: "center",
            marginRight: 4,
          }}
        >
          Langue d'édition :
        </span>
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code)}
            aria-pressed={locale === l.code}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--line-soft)",
              background:
                locale === l.code ? "var(--saffron)" : "var(--overlay-2)",
              color: locale === l.code ? "#16111e" : "var(--cream-soft)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {l.flag} {l.code.toUpperCase()}
          </button>
        ))}
      </div>

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <ApiErrorAlert error={error} onClose={() => setError(null)} />
        </div>
      ) : null}

      {/* Versions panel */}
      {showVersions && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
        >
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>🕐 Historique des versions</h3>
            <button
              type="button"
              onClick={() => setShowVersions(false)}
              className="btn-ghost btn-sm"
              style={{ padding: "2px 8px", fontSize: 10 }}
            >
              ✕
            </button>
          </div>
          {versions.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              Aucune version publiée pour l'instant.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {versions.map((v) => (
                <li
                  key={v.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderTop: "1px solid var(--line-soft)",
                    fontSize: 12,
                  }}
                >
                  <div>
                    <strong style={{ color: "var(--cream)" }}>
                      v{v.versionNumber}
                    </strong>
                    {v.note && (
                      <span style={{ marginLeft: 8, color: "var(--cream-soft)" }}>
                        {v.note}
                      </span>
                    )}
                    <span
                      style={{
                        marginLeft: 8,
                        color: "var(--muted)",
                        fontSize: 10,
                      }}
                    >
                      {new Date(v.publishedAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => revert(v.id, v.versionNumber)}
                    className="btn-ghost btn-sm"
                    style={{ padding: "3px 10px", fontSize: 10 }}
                  >
                    ⏪ Restaurer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Split layout : éditeur | preview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
          minHeight: "60vh",
        }}
      >
        {/* === Panneau d'édition === */}
        <div
          className="card"
          style={{
            padding: 14,
            background: "var(--overlay-2)",
            maxHeight: "75vh",
            overflowY: "auto",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              color: "var(--cream-soft)",
              textTransform: "uppercase",
              letterSpacing: 1.4,
            }}
          >
            ✏️ Édition
          </h3>

          {/* Add block buttons */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            {BLOCK_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => addBlock(t.type)}
                className="btn-ghost btn-sm"
                title={`Ajouter un ${t.label}`}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Liste des blocs */}
          {blocks.length === 0 ? (
            <p
              className="muted"
              style={{
                textAlign: "center",
                padding: 20,
                fontStyle: "italic",
                fontSize: 12,
              }}
            >
              Aucun bloc — commence par ajouter un titre ou un paragraphe ✨
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {blocks.map((b) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  locale={locale}
                  index={blocks.indexOf(b)}
                  total={blocks.length}
                  onUpdate={(patch) => updateBlock(b.id, patch)}
                  onUpdateText={(field, val) => updateText(b.id, field, val)}
                  onDelete={() => deleteBlock(b.id)}
                  onMoveUp={() => moveBlock(b.id, -1)}
                  onMoveDown={() => moveBlock(b.id, 1)}
                  onDragStart={(e) => onDragStart(b.id, e)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(b.id, e)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* === Preview live === */}
        <div
          className="card"
          style={{
            padding: 0,
            background: "var(--night)",
            maxHeight: "75vh",
            overflowY: "auto",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              background: "var(--overlay)",
              padding: "8px 14px",
              borderBottom: "1px solid var(--line-soft)",
              fontSize: 11,
              color: "var(--cream-soft)",
              textTransform: "uppercase",
              letterSpacing: 1.4,
              zIndex: 1,
            }}
          >
            👁️ Preview · {locale.toUpperCase()}
          </div>
          <div style={{ padding: "0 16px" }}>
            <CmsRenderer blocks={blocks} locale={locale} preview />
          </div>
        </div>
      </div>
      </div>
    </ResponsiveShell>
  );
}

// ============================================================
// Sous-composant éditeur de bloc
// ============================================================

interface BlockEditorProps {
  block: any;
  locale: string;
  index: number;
  total: number;
  onUpdate: (patch: any) => void;
  onUpdateText: (field: string, value: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

function BlockEditor({
  block,
  locale,
  index,
  total,
  onUpdate,
  onUpdateText,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
}: BlockEditorProps) {
  const ICON: Record<string, string> = {
    heading: "📰",
    paragraph: "📝",
    image: "🖼️",
    button: "🔘",
    divider: "➖",
    quote: "💬",
  };

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        background: "var(--overlay)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        padding: 10,
        cursor: "grab",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--saffron)",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          ⋮⋮ {ICON[block.type] ?? "📦"} {block.type} · {index + 1}/{total}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {/* Boutons ⬆⬇ — fallback tactile au drag&drop HTML5 sur mobile */}
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Monter ce bloc"
            className="btn-ghost btn-sm"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              minHeight: 32,
              minWidth: 32,
              opacity: index === 0 ? 0.3 : 1,
              cursor: index === 0 ? "not-allowed" : "pointer",
            }}
            title="Monter"
          >
            ⬆
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Descendre ce bloc"
            className="btn-ghost btn-sm"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              minHeight: 32,
              minWidth: 32,
              opacity: index === total - 1 ? 0.3 : 1,
              cursor: index === total - 1 ? "not-allowed" : "pointer",
            }}
            title="Descendre"
          >
            ⬇
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Supprimer ce bloc"
            className="btn-ghost btn-sm"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              minHeight: 32,
              minWidth: 32,
              color: "#ef4444",
            }}
            title="Supprimer"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Champs spécifiques par type */}
      {block.type === "heading" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onUpdate({ level: lvl })}
                aria-pressed={block.level === lvl}
                style={{
                  flex: 1,
                  padding: "4px",
                  fontSize: 11,
                  border: "1px solid var(--line-soft)",
                  background:
                    block.level === lvl
                      ? "var(--saffron)"
                      : "var(--overlay-2)",
                  color:
                    block.level === lvl ? "#16111e" : "var(--cream-soft)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                H{lvl}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={block.text?.[locale] ?? ""}
            onChange={(e) => onUpdateText("text", e.target.value)}
            placeholder={
              block.text?.fr && locale !== "fr"
                ? `(FR: ${block.text.fr.slice(0, 40)}…)`
                : "Texte du titre…"
            }
            style={inputStyle}
          />
        </>
      )}

      {block.type === "paragraph" && (
        <textarea
          value={block.text?.[locale] ?? ""}
          onChange={(e) => onUpdateText("text", e.target.value)}
          placeholder={
            block.text?.fr && locale !== "fr"
              ? `(FR: ${block.text.fr.slice(0, 40)}…)`
              : "Saisis ton paragraphe…"
          }
          rows={3}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      )}

      {block.type === "image" && (
        <>
          <input
            type="text"
            value={block.src ?? ""}
            onChange={(e) => onUpdate({ src: e.target.value })}
            placeholder="URL de l'image (https:// ou /img/…)"
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <input
            type="text"
            value={block.alt?.[locale] ?? ""}
            onChange={(e) => onUpdateText("alt", e.target.value)}
            placeholder="Alt (description pour l'accessibilité)"
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <input
            type="text"
            value={block.caption?.[locale] ?? ""}
            onChange={(e) => onUpdateText("caption", e.target.value)}
            placeholder="Légende (optionnel)"
            style={inputStyle}
          />
        </>
      )}

      {block.type === "button" && (
        <>
          <input
            type="text"
            value={block.label?.[locale] ?? ""}
            onChange={(e) => onUpdateText("label", e.target.value)}
            placeholder="Texte du bouton"
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <input
            type="text"
            value={block.href ?? ""}
            onChange={(e) => onUpdate({ href: e.target.value })}
            placeholder="URL (ex: /contact, https://…)"
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <select
            value={block.variant ?? "primary"}
            onChange={(e) => onUpdate({ variant: e.target.value })}
            style={inputStyle}
          >
            <option value="primary">Style principal (saffron)</option>
            <option value="ghost">Style fantôme (bordure)</option>
            <option value="subtle">Style discret</option>
          </select>
        </>
      )}

      {block.type === "divider" && (
        <select
          value={block.style ?? "solid"}
          onChange={(e) => onUpdate({ style: e.target.value })}
          style={inputStyle}
        >
          <option value="solid">Trait continu</option>
          <option value="dotted">Trait pointillé</option>
          <option value="stars">★ ★ ★</option>
        </select>
      )}

      {block.type === "quote" && (
        <>
          <textarea
            value={block.text?.[locale] ?? ""}
            onChange={(e) => onUpdateText("text", e.target.value)}
            placeholder="Citation"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 6 }}
          />
          <input
            type="text"
            value={block.author ?? ""}
            onChange={(e) => onUpdate({ author: e.target.value })}
            placeholder="Auteur (optionnel)"
            style={inputStyle}
          />
        </>
      )}
    </li>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 12,
  background: "var(--overlay-2)",
  border: "1px solid var(--line-soft)",
  borderRadius: 6,
  color: "var(--cream)",
  fontFamily: "inherit",
};
