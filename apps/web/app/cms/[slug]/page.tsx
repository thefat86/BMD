"use client";

/**
 * Page publique CMS (spec §6.7).
 *
 * Route /cms/:slug — récupère les blocs publiés depuis l'API et les rend.
 * Pas d'auth requise (config skipAuth côté backend).
 *
 * Multi-langue : utilise la locale active du LocaleProvider.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { CmsRenderer } from "@/lib/cms-renderer";
import { useLocale } from "@/lib/locale-provider";

export default function CmsPublicPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { code: locale } = useLocale();

  const [page, setPage] = useState<{
    slug: string;
    title: string;
    blocks: any[];
    publishedAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    api
      .getPublishedCmsPage(slug)
      .then((r) => setPage(r))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <main className="container" style={{ padding: 40, textAlign: "center" }}>
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (notFound || !page) {
    return (
      <main className="container" style={{ padding: 40, textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 32,
            color: "var(--cream)",
            marginTop: 0,
          }}
        >
          🔍 Page introuvable
        </h1>
        <p style={{ color: "var(--cream-soft)", lineHeight: 1.5 }}>
          La page <code>/cms/{slug}</code> n'existe pas ou n'a pas encore été
          publiée. Vérifie l'orthographe ou explore le menu principal.
        </p>
        <Link
          href="/"
          className="btn btn-sm"
          style={{
            display: "inline-block",
            marginTop: 14,
            padding: "8px 16px",
            textDecoration: "none",
          }}
        >
          ← Retour à l'accueil
        </Link>
      </main>
    );
  }

  return (
    <main className="container" style={{ padding: "10px 16px 40px" }}>
      <CmsRenderer blocks={page.blocks} locale={locale} />
      {page.publishedAt && (
        <p
          style={{
            marginTop: 30,
            fontSize: 10,
            color: "var(--muted)",
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          Mis à jour le{" "}
          {new Date(page.publishedAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
    </main>
  );
}
