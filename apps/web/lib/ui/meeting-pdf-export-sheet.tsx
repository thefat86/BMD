"use client";

/**
 * V162 — Sheet/Modal de sélection des sections à exporter en PDF.
 *
 * 4 checkboxes (Décisions / Résumé / Compte rendu / Transcription) +
 * bouton "Télécharger". Désactivées si la section est vide côté serveur.
 *
 * Réutilisé identique sur mobile (BottomSheet glisse depuis le bas)
 * et desktop (modal centré). Le styling adapte les tailles via isMobile.
 */

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { useBreakpoint } from "../use-breakpoint";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { api } from "../api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  meetingTitle: string;
  /** Indique si chaque section est disponible côté serveur (pour activer/griser la checkbox). */
  available: {
    summary: boolean;
    decisions: boolean;
    nextSteps: boolean;
    minutes: boolean;
    transcript: boolean;
  };
}

export function MeetingPdfExportSheet({
  open,
  onClose,
  meetingId,
  meetingTitle,
  available,
}: Props): JSX.Element {
  const t = useT();
  const toast = useToast();
  const { isMobile } = useBreakpoint();

  // V218.H — Sélection par défaut : Parties 1-4 cochées, Partie 5 (transcript) off
  // (le verbatim brut reste opt-in car volumineux).
  const [sections, setSections] = useState({
    summary: available.summary,
    decisions: available.decisions,
    nextSteps: available.nextSteps,
    minutes: available.minutes,
    transcript: false,
  });
  const [downloading, setDownloading] = useState(false);

  const anyChecked =
    sections.summary ||
    sections.decisions ||
    sections.nextSteps ||
    sections.minutes ||
    sections.transcript;

  function toggle(key: keyof typeof sections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleDownload() {
    if (!anyChecked) return;
    setDownloading(true);
    try {
      const blob = await api.exportMeetingPdf(meetingId, sections);
      // Trigger browser download via a temporary <a> tag
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Slug fichier (cohérent avec backend)
      const slug =
        meetingTitle
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50) || "reunion";
      a.download = `bmd-compte-rendu-${slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("meetings.pdf.downloaded"));
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("meetings.pdf.title")}>
      <div style={{ padding: isMobile ? "4px 0 16px" : "8px 0 12px" }}>
        <h2
          style={{
            margin: "0 0 6px",
            fontSize: isMobile ? 20 : 22,
            fontFamily: "Cormorant Garamond, serif",
            fontWeight: 600,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.2,
          }}
        >
          {t("meetings.pdf.title")}
        </h2>
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 13,
            color: "var(--cocoa-soft, #6B5942)",
            lineHeight: 1.45,
          }}
        >
          {t("meetings.pdf.subtitle")}
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* V218.H — Ordre des 5 parties du compte rendu structuré */}
          <SectionCheckbox
            label={t("meetings.partSummary")}
            hint={t("meetings.pdf.sectionSummaryHint")}
            checked={sections.summary}
            disabled={!available.summary}
            onChange={() => toggle("summary")}
            isMobile={isMobile}
          />
          <SectionCheckbox
            label={t("meetings.partDecisions")}
            hint={t("meetings.pdf.sectionDecisionsHint")}
            checked={sections.decisions}
            disabled={!available.decisions}
            onChange={() => toggle("decisions")}
            isMobile={isMobile}
          />
          <SectionCheckbox
            label={t("meetings.partNextSteps")}
            hint={t("meetings.pdf.sectionNextStepsHint")}
            checked={sections.nextSteps}
            disabled={!available.nextSteps}
            onChange={() => toggle("nextSteps")}
            isMobile={isMobile}
          />
          <SectionCheckbox
            label={t("meetings.partDetailed")}
            hint={t("meetings.pdf.sectionMinutesHint")}
            checked={sections.minutes}
            disabled={!available.minutes}
            onChange={() => toggle("minutes")}
            isMobile={isMobile}
          />
          <SectionCheckbox
            label={t("meetings.partTranscript")}
            hint={t("meetings.pdf.sectionTranscriptHint")}
            checked={sections.transcript}
            disabled={!available.transcript}
            onChange={() => toggle("transcript")}
            isMobile={isMobile}
          />
        </ul>

        <div style={{ display: "flex", gap: 10, marginTop: 20, flexDirection: isMobile ? "column-reverse" : "row" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: isMobile ? "0 0 auto" : 1,
              padding: "12px 16px",
              background: "transparent",
              border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))",
              borderRadius: 12,
              color: "var(--cocoa, #2B1F15)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 48,
              fontFamily: "inherit",
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!anyChecked || downloading}
            style={{
              flex: isMobile ? "0 0 auto" : 2,
              padding: "12px 16px",
              background: anyChecked
                ? "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))"
                : "var(--paper, #F4ECD8)",
              color: anyChecked ? "#FBF6EC" : "var(--cocoa-soft, #6B5942)",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              cursor: downloading ? "wait" : anyChecked ? "pointer" : "not-allowed",
              minHeight: 48,
              boxShadow: anyChecked
                ? "0 6px 16px -8px rgba(133,79,11,0.45)"
                : "none",
              fontFamily: "inherit",
            }}
          >
            {downloading ? "…" : t("meetings.pdf.downloadCta")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function SectionCheckbox({
  label,
  hint,
  checked,
  disabled,
  onChange,
  isMobile,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  isMobile: boolean;
}) {
  return (
    <li>
      <label
        style={{
          display: "flex",
          gap: 12,
          padding: isMobile ? "12px 14px" : "10px 14px",
          background: checked
            ? "var(--v45-saffron-pale, #F6E8C5)"
            : "var(--paper, rgba(244,228,193,0.18))",
          border: `1px solid ${
            checked
              ? "var(--v45-saffron, #C58A2E)"
              : "var(--cocoa-line, rgba(43,31,21,0.10))"
          }`,
          borderRadius: 12,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          alignItems: "flex-start",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          style={{
            width: 18,
            height: 18,
            marginTop: 2,
            accentColor: "var(--v45-saffron-strong, #854F0B)",
            cursor: disabled ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--cocoa, #2B1F15)",
              marginBottom: 2,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5942)",
              lineHeight: 1.4,
            }}
          >
            {hint}
          </div>
        </div>
      </label>
    </li>
  );
}
