"use client";

/**
 * Admin · Liste des pages CMS (spec §6.7).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { useDialog } from "@/lib/ui/dialog-provider";
import { ResponsiveShell } from "@/lib/ui/responsive-shell";
import { useBreakpoint } from "@/lib/use-breakpoint";

interface Page {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CmsListPage() {
  const router = useRouter();
  const { confirm: dlgConfirm } = useDialog();
  const { isMobile } = useBreakpoint();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.adminListCmsPages();
      setPages(r);
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
  }, []);

  async function create() {
    setError(null);
    try {
      const created = await api.adminCreateCmsPage({
        slug: newSlug.trim().toLowerCase(),
        title: newTitle.trim(),
      });
      router.push(`/admin/cms/${created.id}`);
    } catch (e) {
      setError(e);
    }
  }

  async function toggle(p: Page) {
    try {
      await api.adminToggleCmsPage(p.id, !p.isActive);
      setPages((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)),
      );
    } catch (e) {
      setError(e);
    }
  }

  async function deleteOne(p: Page) {
    const ok = await dlgConfirm(
      `La page "${p.title}" ainsi que toutes ses versions publiées seront définitivement supprimées.`,
      {
        title: "Supprimer cette page ?",
        variant: "danger",
        confirmLabel: "Supprimer",
      },
    );
    if (!ok) return;
    try {
      await api.adminDeleteCmsPage(p.id);
      setPages((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e);
    }
  }

  return (
    <ResponsiveShell
      breadcrumb="Administration › Pages CMS"
      desktopTitle="📝 Pages CMS"
      subtitle="Édition des pages publiques sans déploiement (about, aide, mentions légales…)"
      mobileTitle="Pages CMS"
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
      <p
        style={{
          fontSize: 13,
          color: "var(--cream-soft)",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        Crée et édite des pages publiques (à propos, aide, mentions légales…)
        sans déployer de code. Drag & drop, multi-langue, publication versionnée.
      </p>

      {error ? <ApiErrorAlert error={error} onClose={() => setError(null)} /> : null}

      {/* Formulaire de création */}
      {!creating ? (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCreating(true)}
          style={{ marginBottom: 16 }}
        >
          ＋ Nouvelle page
        </button>
      ) : (
        <div
          className="card"
          style={{
            marginBottom: 16,
            background: "rgba(232,163,61,0.06)",
            border: "1px solid rgba(232,163,61,0.3)",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: 14 }}>➕ Nouvelle page</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              type="text"
              placeholder="slug (ex: about, terms, help)"
              value={newSlug}
              onChange={(e) =>
                setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              maxLength={50}
              style={{
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "ui-monospace, monospace",
                background: "var(--overlay-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                color: "var(--cream)",
              }}
            />
            <input
              type="text"
              placeholder="Titre interne (ex: À propos · v2)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={120}
              style={{
                padding: "8px 10px",
                fontSize: 13,
                background: "var(--overlay-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                color: "var(--cream)",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={create}
                disabled={!newSlug || !newTitle}
              >
                Créer
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setCreating(false);
                  setNewSlug("");
                  setNewTitle("");
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && pages.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : pages.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <p className="muted">Aucune page pour l'instant — crée la première !</p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {pages.map((p) => (
            <li
              key={p.id}
              className="card"
              style={{
                marginBottom: 8,
                opacity: p.isActive ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--cream)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {p.title}
                    {p.hasUnpublishedChanges && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          background: "rgba(232,163,61,0.2)",
                          color: "var(--saffron)",
                          borderRadius: 4,
                        }}
                      >
                        Modifs non publiées
                      </span>
                    )}
                    {!p.isActive && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          background: "rgba(239,68,68,0.15)",
                          color: "#ef4444",
                          borderRadius: 4,
                        }}
                      >
                        Désactivée
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      fontFamily: "ui-monospace, monospace",
                      marginTop: 2,
                    }}
                  >
                    /cms/{p.slug}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Link
                    href={`/admin/cms/${p.id}`}
                    className="btn btn-sm"
                    style={{
                      padding: "5px 12px",
                      fontSize: 11,
                      textDecoration: "none",
                    }}
                  >
                    ✏️ Éditer
                  </Link>
                  {p.publishedAt && (
                    <a
                      href={`/cms/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost btn-sm"
                      style={{
                        padding: "5px 12px",
                        fontSize: 11,
                        textDecoration: "none",
                      }}
                    >
                      👁️ Voir
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => toggle(p)}
                    style={{ padding: "5px 12px", fontSize: 11 }}
                  >
                    {p.isActive ? "🔇 Désactiver" : "🔊 Activer"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => deleteOne(p)}
                    style={{
                      padding: "5px 12px",
                      fontSize: 11,
                      color: "#ef4444",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      </div>
    </ResponsiveShell>
  );
}
