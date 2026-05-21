"use client";

/**
 * V52.H2 — Page Galerie preuves d'un groupe (V45 écran 19).
 *
 * Affiche TOUS les attachments d'un groupe (factures, audio, PDFs) dans une
 * grille Pinterest 2-col avec 3 variants visuels + stats 3-col en haut + filtre
 * seg-toggle (Toutes / Factures / Audio).
 *
 * Architecture pragmatique : récupère la liste des dépenses du groupe, puis
 * pour chaque dépense fetch ses attachments en parallèle (Promise.all).
 * Agrège l'ensemble en un seul array passé à <MobileAttachmentsGallery>.
 *
 * Note perf : sur des groupes de 100+ dépenses ça fait 100 requêtes en
 * parallèle. Acceptable pour POC V45 — pour la prod, on créera un endpoint
 * `GET /groups/{id}/attachments` côté API qui aggregate côté serveur.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, isUnauthorized, clearToken } from "../../../../../lib/api-client";
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { useT } from "../../../../../lib/i18n/app-strings";
import { MobileAttachmentsGallery } from "../../../../../lib/ui/mobile-attachments-gallery";
import {
  MobileAttachmentViewer,
  type ViewerAttachment,
} from "../../../../../lib/ui/mobile-attachment-viewer";
import { Icon } from "../../../../../lib/ui/icons";
// V211.E — Vue desktop dédiée (galerie 4-col + filtres + lightbox).
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { DesktopGroupAttachmentsView } from "../../../../../lib/ui/desktop-group-attachments-view";

type GalleryAttachment = {
  id: string;
  kind: "RECEIPT" | "AUDIO_PROOF" | "PDF" | "OTHER";
  mimeType: string;
  fileName: string;
  fileSize?: number;
  description?: string | null;
  amount?: string | null;
  currency?: string | null;
  url?: string | null;
  confidence?: number | null;
  createdAt?: string;
};

export default function GroupAttachmentsPage() {
  const params = useParams<{ id: string }>();
  const groupId = params?.id;
  const router = useRouter();
  const t = useT();

  const { isMobile } = useBreakpoint();
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<GalleryAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [groupMeta, setGroupMeta] = useState<{ id: string; name: string } | null>(null);
  // V80.3 — Attachment sélectionné pour le viewer lightbox plein écran
  const [selected, setSelected] = useState<ViewerAttachment | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // V211.E — Charge aussi le meta groupe pour le header desktop.
        const [expenses, g] = await Promise.all([
          api.listExpenses(groupId),
          api.getGroup(groupId).catch(() => null),
        ]);
        if (cancelled) return;
        if (g) setGroupMeta({ id: (g as any).id, name: (g as any).name });
        // 2. Pour chaque dépense, fetch les attachments en parallèle
        const allAttachmentsArrays = await Promise.all(
          expenses.map(async (exp: { id: string }) => {
            try {
              const list = await api.listAttachments(exp.id);
              return list as GalleryAttachment[];
            } catch {
              return [] as GalleryAttachment[];
            }
          }),
        );
        if (cancelled) return;
        // 3. Aggrège et trie par createdAt desc
        const flat = allAttachmentsArrays.flat();
        flat.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        setAttachments(flat);
      } catch (e) {
        if (cancelled) return;
        if (isUnauthorized(e)) {
          clearToken();
          router.push("/login");
          return;
        }
        setError((e as Error).message || "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, router]);

  return (
    <ResponsiveShell
      breadcrumb="Groupe › Galerie"
      desktopTitle="Galerie preuves"
      mobileTitle="Galerie preuves"
      back={{ href: `/dashboard/groups/${groupId}` }}
    >
      {loading ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--cocoa-soft, var(--cream-soft))",
            fontSize: 13,
          }}
        >
          {t("common.loading") || "Chargement…"}
        </div>
      ) : error ? (
        <div
          style={{
            padding: 20,
            margin: "12px 16px",
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 12,
            color: "var(--v45-terracotta, #9F4628)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="alert-triangle" size={16} color="currentColor" strokeWidth={2} />
          {error}
        </div>
      ) : attachments.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--cocoa-soft, var(--cream-soft))",
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Icon
            name="paperclip"
            size={32}
            color="var(--cocoa-mute, var(--muted))"
            strokeWidth={1.4}
          />
          {/* V183 — clé i18n existante (27 locales) au lieu de FR hardcodé. */}
          <div>{t("gallery.empty") || "Aucune preuve enregistrée pour ce groupe."}</div>
          <Link
            href={`/dashboard/groups/${groupId}`}
            style={{
              fontSize: 12,
              color: "var(--v45-saffron, var(--saffron))",
              textDecoration: "none",
            }}
          >
            ← Retour au groupe
          </Link>
        </div>
      ) : !isMobile && groupMeta ? (
        // V211.E — Vue desktop dédiée (galerie 4-col + filtres + lightbox).
        <DesktopGroupAttachmentsView
          group={groupMeta}
          attachments={attachments}
        />
      ) : (
        <MobileAttachmentsGallery
          attachments={attachments}
          onSelect={(att) => {
            // V80.3 — Ouvre le viewer lightbox (fetch blob auth + display).
            // Plus de tentative window.open(att.url) car le backend ne renvoie
            // pas d'URL directe (besoin Bearer token pour télécharger).
            // V82.1 — Log pour confirmer que le tap sur tile gallery propage.
            // V181 — Conditionné au dev (économise CPU + bruit Sentry en prod).
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.log(
                "[gallery] onSelect attachmentId=",
                att.id,
                "mime=",
                att.mimeType,
              );
            }
            setSelected({
              id: att.id,
              fileName: att.fileName,
              mimeType: att.mimeType,
              kind: att.kind,
              amount: att.amount,
              currency: att.currency,
              description: att.description,
            });
          }}
        />
      )}

      {/* V80.3 — Viewer lightbox plein écran (portalisé sur body) */}
      <MobileAttachmentViewer
        attachment={selected}
        onClose={() => setSelected(null)}
      />
    </ResponsiveShell>
  );
}
