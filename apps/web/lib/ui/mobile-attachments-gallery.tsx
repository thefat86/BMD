"use client";

import { useMemo, useState } from "react";
import { Icon } from "./icons";
import { useT } from "../i18n/app-strings";

type AttachmentKind = "RECEIPT" | "AUDIO_PROOF" | "PDF" | "OTHER";

interface Attachment {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  description?: string | null;
  amount?: string | null;
  currency?: string | null;
  url?: string | null;
  confidence?: number | null; // OCR
  createdAt?: string;
}

export interface MobileAttachmentsGalleryProps {
  attachments: Attachment[];
  /** Optionnel : handler pour ouvrir le détail. */
  onSelect?: (att: Attachment) => void;
}

type Filter = "all" | "receipt" | "audio" | "pdf";

function classifyKind(att: Attachment): "receipt" | "audio" | "pdf" {
  if (att.kind === "AUDIO_PROOF" || att.mimeType.startsWith("audio/")) return "audio";
  if (att.mimeType === "application/pdf") return "pdf";
  return "receipt";
}

export function MobileAttachmentsGallery({
  attachments,
  onSelect,
}: MobileAttachmentsGalleryProps) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    let r = 0, a = 0, p = 0;
    for (const att of attachments) {
      const k = classifyKind(att);
      if (k === "receipt") r++;
      else if (k === "audio") a++;
      else p++;
    }
    return { receipt: r, audio: a, pdf: p };
  }, [attachments]);

  const filtered = useMemo(
    () =>
      attachments.filter((att) => {
        if (filter === "all") return true;
        return classifyKind(att) === filter;
      }),
    [attachments, filter],
  );

  return (
    <div style={{ padding: "12px 16px 24px" }}>
      {/* Stats 3-col en haut */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { label: t("gallery.statReceipts") || "Factures", value: counts.receipt },
          { label: t("gallery.statAudio") || "Audio", value: counts.audio },
          { label: t("gallery.statPdf") || "PDF", value: counts.pdf },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: "12px 8px",
              background: "var(--paper, rgba(244,228,193,0.04))",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 700,
                color: "var(--cocoa, var(--cream))",
                lineHeight: 1,
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--cocoa-soft, var(--cream-soft))",
                marginTop: 4,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Seg-toggle */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          background: "var(--paper, rgba(244,228,193,0.04))",
          border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        {([
          { code: "all", label: t("gallery.filterAll") || "Toutes" },
          { code: "receipt", label: t("gallery.filterReceipts") || "Factures" },
          { code: "audio", label: t("gallery.filterAudio") || "Audio" },
        ] as Array<{ code: Filter; label: string }>).map((opt) => {
          const active = filter === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => setFilter(opt.code)}
              style={{
                flex: 1,
                padding: "8px 4px",
                background: active
                  ? "var(--v45-saffron, var(--saffron, #C58A2E))"
                  : "transparent",
                color: active
                  ? "var(--paper, #FFFFFF)"
                  : "var(--cocoa-soft, var(--cream-soft))",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
                touchAction: "manipulation",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Grid 2-col Pinterest */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--cocoa-soft, var(--cream-soft))",
            fontSize: 13,
          }}
        >
          {filter === "all"
            ? t("gallery.empty") || "Aucune preuve encore."
            : t("gallery.emptyFilter") || "Aucune preuve de ce type encore."}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          }}
        >
          {filtered.map((att) => {
            const kind = classifyKind(att);
            const isVerified = (att.confidence ?? 0) >= 0.85;
            // 3 variants visuels selon kind
            const variantStyle =
              kind === "audio"
                ? {
                    background:
                      "linear-gradient(135deg, rgba(68,88,181,0.18), rgba(68,88,181,0.06))",
                    borderColor: "rgba(68,88,181,0.30)",
                    iconColor: "var(--v45-indigo, #4458B5)",
                  }
                : kind === "pdf"
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(43,31,21,0.12), rgba(43,31,21,0.04))",
                      borderColor: "rgba(43,31,21,0.20)",
                      iconColor: "var(--cocoa-soft, #6B5A47)",
                    }
                  : {
                      background:
                        "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), rgba(232,200,136,0.10))",
                      borderColor: "var(--v45-saffron-soft, rgba(232,200,136,0.4))",
                      iconColor: "var(--v45-saffron, #C58A2E)",
                    };
            const iconName =
              kind === "audio" ? "mic" : kind === "pdf" ? "file-text" : "receipt";
            return (
              <button
                key={att.id}
                type="button"
                onClick={() => onSelect?.(att)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 12,
                  // V80.2 — Aspect 3:4 Pinterest exact selon spec V45
                  aspectRatio: "3 / 4",
                  background: variantStyle.background,
                  border: `1px solid ${variantStyle.borderColor}`,
                  borderRadius: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  color: "var(--cocoa, var(--cream))",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                  overflow: "hidden",
                  // Légère ombre paper pour le effect "polaroid"
                  boxShadow: "0 2px 6px rgba(43,31,21,0.06)",
                }}
              >
                {/* Preview area : icône centrée OU thumbnail */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 0,
                  }}
                >
                  <Icon
                    name={iconName}
                    size={36}
                    color={variantStyle.iconColor}
                    strokeWidth={1.4}
                  />
                </div>
                {/* Meta : type + montant Cormorant */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--cocoa-soft, var(--cream-soft))",
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    {kind === "audio"
                      ? t("gallery.kindAudio") || "Audio"
                      : kind === "pdf"
                        ? t("gallery.kindPdf") || "PDF"
                        : t("gallery.kindReceipt") || "Facture"}
                  </div>
                  {att.amount && att.currency && (
                    <div
                      style={{
                        fontFamily: "Cormorant Garamond, serif",
                        fontSize: 16,
                        fontWeight: 600,
                        color: "var(--v45-saffron, var(--saffron))",
                        fontVariantNumeric: "tabular-nums",
                        marginTop: 2,
                      }}
                    >
                      {att.amount} {att.currency}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--cocoa-soft, var(--cream-soft))",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {att.description ?? att.fileName}
                  </div>
                </div>
                {/* Verif tag IA top-right pour factures vérifiées */}
                {isVerified && kind === "receipt" && (
                  <span
                    aria-label={t("gallery.aiVerified") || "Vérifié par IA"}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "3px 7px",
                      background: "var(--paper, #FFFFFF)",
                      border: "1px solid var(--v45-emerald, #4F8E6E)",
                      borderRadius: 999,
                      fontSize: 8.5,
                      fontWeight: 700,
                      color: "var(--v45-emerald, #4F8E6E)",
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      boxShadow: "0 1px 3px rgba(43,31,21,0.12)",
                    }}
                  >
                    <Icon name="check" size={10} strokeWidth={2.5} color="currentColor" />
                    IA
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
