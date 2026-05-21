"use client";

/**
 * V211.E — Vue Documents (galerie pièces jointes) desktop.
 * =============================================================================
 * Galerie pleine largeur grid 4-col + filtres en haut (Tout / Reçus / Audio).
 * Réutilise MobileAttachmentViewer pour la lightbox au clic.
 */

import { useMemo, useState } from "react";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import {
  MobileAttachmentViewer,
  type ViewerAttachment,
} from "./mobile-attachment-viewer";
import { DesktopGroupSectionShell } from "./group-desktop-shell";

type GalleryAttachment = {
  id: string;
  kind: "RECEIPT" | "AUDIO_PROOF" | "PDF" | "OTHER";
  mimeType: string;
  fileName: string;
  description?: string | null;
  amount?: string | null;
  currency?: string | null;
  createdAt?: string;
};

const FILTERS = [
  { key: "all", label: "Tout" },
  { key: "RECEIPT", label: "📷 Reçus" },
  { key: "AUDIO_PROOF", label: "🎙 Audio" },
  { key: "PDF", label: "📄 PDF" },
];

export function DesktopGroupAttachmentsView({
  group,
  attachments,
}: {
  group: { id: string; name: string };
  attachments: GalleryAttachment[];
}) {
  const t = useT();
  const { formatAmount } = useCurrency();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<ViewerAttachment | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return attachments;
    return attachments.filter((a) => a.kind === filter);
  }, [attachments, filter]);

  const countOf = (k: string) =>
    k === "all" ? attachments.length : attachments.filter((a) => a.kind === k).length;

  const iconFor = (a: GalleryAttachment) => {
    if (a.kind === "AUDIO_PROOF") return "🎙";
    if (a.kind === "PDF") return "📄";
    const desc = (a.description || "").toLowerCase();
    if (desc.includes("hotel") || desc.includes("hôtel")) return "🏨";
    if (desc.includes("essence") || desc.includes("gas")) return "🚗";
    if (desc.includes("train") || desc.includes("bus")) return "🚂";
    if (desc.includes("resto") || desc.includes("pizza") || desc.includes("luigi")) return "🍽";
    return "🧾";
  };

  return (
    <DesktopGroupSectionShell
      groupId={group.id}
      groupName={group.name}
      sectionLabel={t("group.hub.documents") || "Documents"}
      subtitle={`${filtered.length} ${filtered.length > 1 ? "fichiers" : "fichier"}`}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const count = countOf(f.key);
          if (count === 0 && f.key !== "all") return null;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: isActive ? 500 : 400,
                background: isActive ? "#C58A2E" : "#FAF6EE",
                color: isActive ? "#FAF6EE" : "#8B6F47",
                border: isActive ? "none" : "0.5px solid #D9C8A6",
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: "#8B6F47",
            background: "#FAF6EE",
            border: "0.5px dashed #D9C8A6",
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 38, opacity: 0.4 }}>📎</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#2B1F15", marginTop: 8 }}>
            {t("gallery.empty") || "Aucune preuve enregistrée"}
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Les reçus + audios apparaîtront ici dès que tu enregistres des dépenses.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                setSelected({
                  id: a.id,
                  fileName: a.fileName,
                  mimeType: a.mimeType,
                  kind: a.kind,
                  amount: a.amount,
                  currency: a.currency,
                  description: a.description,
                })
              }
              style={{
                aspectRatio: "1 / 1",
                background: "#FFFFFF",
                border: "0.5px solid #D9C8A6",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                transition: "transform 0.08s ease, border-color 0.1s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#C58A2E")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#D9C8A6")}
            >
              <div style={{ fontSize: 30, color: "#8B6F47", textAlign: "center", paddingTop: 6 }}>
                {iconFor(a)}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#2B1F15",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {a.description || a.fileName}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#8B6F47",
                    marginTop: 2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {a.amount && a.currency
                    ? formatAmount(Number(a.amount), a.currency)
                    : a.kind === "AUDIO_PROOF"
                      ? "audio"
                      : a.kind === "PDF"
                        ? "pdf"
                        : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <MobileAttachmentViewer
        attachment={selected}
        onClose={() => setSelected(null)}
      />
    </DesktopGroupSectionShell>
  );
}
