"use client";

/**
 * Meetings Panel (Sprint AC-2)
 * --------------------------------------------------------------
 * Panneau "Réunions" qui s'insère dans la vue détail d'un groupe :
 *
 *   1. Liste des réunions enregistrées (avec status pipeline)
 *   2. Bouton "Enregistrer une réunion" (MediaRecorder navigateur)
 *   3. Modale de revue : transcription + décisions extraites par le LLM
 *   4. Validation/édition de chaque décision avant application
 *
 * Le panneau gère son propre quota :
 *   - Affiche "il te reste X / N réunions ce mois-ci"
 *   - Si quota épuisé → propose l'addon (1,99 € COMMUNITY / 2,99 € PREMIUM)
 *   - Si plan FREE → CTA "Passe Premium pour activer cette fonctionnalité"
 *
 * Mobile-first :
 *   - Le bouton record prend toute la largeur sur petit écran
 *   - La modale de revue est en bottom-sheet sur mobile (réutilise BottomSheet
 *     si dispo, sinon plein écran)
 */
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useCurrency } from "../currency-provider";
import { BottomSheet } from "./bottom-sheet";
import { Icon } from "./icons";
import { MeetingPdfExportSheet } from "./meeting-pdf-export-sheet";
import { useBreakpoint } from "../use-breakpoint";

interface Meeting {
  id: string;
  title: string;
  occurredAt: string;
  status:
    | "PENDING"
    | "TRANSCRIBING"
    | "EXTRACTING"
    | "REVIEW"
    | "APPLIED"
    | "CANCELLED"
    | "FAILED";
  summary: string | null;
  durationSeconds: number | null;
  addonCents: number;
  createdAt: string;
  appliedAt: string | null;
  createdBy: { id: string; displayName: string };
}

// V218.H — Next step extrait par l'IA depuis le verbatim (Partie 3 du compte rendu)
interface MeetingNextStep {
  text: string;
  ownerUserId?: string | null;
  ownerName?: string | null;
  dueHint?: string | null;
}

interface MeetingDetail extends Meeting {
  transcript: string | null;
  language: string | null;
  extractedJson: {
    summary: string;
    decisions: any[];
    minutes?: string;
    detailedReport?: string;
    nextSteps?: MeetingNextStep[];
  } | null;
  // V162 — Compte rendu narratif détaillé + traçabilité édition manuelle
  minutes: string | null;
  // V218.H — Sections refondues (Partie 3 + Partie 4 du compte rendu structuré)
  detailedReport: string | null;
  nextSteps: MeetingNextStep[];
  manuallyEditedAt: string | null;
  errorMessage: string | null;
  audioMimeType: string;
  audioSizeBytes: number;
  audioPurged: boolean;
  group: {
    id: string;
    name: string;
    members?: Array<{
      userId: string;
      role: string;
      user: { id: string; displayName: string };
    }>;
  };
}

interface MeetingUsage {
  used: number;
  max: number;
  planCode: string;
  addonCents: number;
  willChargeAddon: boolean;
  resetsAt: string;
  // Sprint AC-3 — durées paramétrables
  maxDurationSeconds: number;
  warnAtSeconds: number;
  audioProofMaxSeconds: number;
}

/** Sprint AC-3 — Formate des secondes en mm:ss pour le timer d'enregistrement */
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * V162 — Helpers status hoistés au niveau module (avant on les avait dans
 * MeetingsPanel, ce qui empêchait MeetingReviewModal de les appeler →
 * "statusColor is not defined" crash bloquant).
 */
function statusLabelFn(s: Meeting["status"], t: (k: string) => string): string {
  switch (s) {
    case "PENDING":
      return t("meetings.processingPending");
    case "TRANSCRIBING":
      return t("meetings.processingTranscribing");
    case "EXTRACTING":
      return t("meetings.processingExtracting");
    case "REVIEW":
      return t("meetings.processingReview");
    case "APPLIED":
      return t("meetings.processingApplied");
    case "FAILED":
      return t("meetings.processingFailed");
    case "CANCELLED":
      return t("meetings.processingCancelled");
  }
}

function statusColorFn(s: Meeting["status"]): string {
  switch (s) {
    case "REVIEW":
      return "var(--v45-saffron-strong, #854F0B)";
    case "APPLIED":
      return "var(--v45-emerald, #1F7A57)";
    case "FAILED":
      return "var(--v45-terracotta, #9F4628)";
    case "CANCELLED":
      return "var(--cocoa-soft, #6B5942)";
    default:
      return "var(--v45-saffron, #C58A2E)";
  }
}

export function MeetingsPanel({
  groupId,
  isAdmin,
}: {
  groupId: string;
  isAdmin: boolean;
}): JSX.Element {
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();
  const { formatAmount } = useCurrency();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [usage, setUsage] = useState<MeetingUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<MeetingDetail | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Sprint AC-3 — timer pendant l'enregistrement (UX : compte à rebours,
  // avertissement à warnAtSeconds, hard stop à maxDurationSeconds)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);

  async function refresh() {
    setLoading(true);
    try {
      const [list, u] = await Promise.all([
        api.listMeetings(groupId),
        api.getMeetingUsage(groupId).catch(() => null),
      ]);
      setMeetings(list);
      setUsage(u);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Polling léger pour suivre la progression des réunions en cours.
    // On arrête dès qu'aucune n'est en pipeline.
    const interval = setInterval(() => {
      const inflight = meetings.some((m) =>
        ["PENDING", "TRANSCRIBING", "EXTRACTING"].includes(m.status),
      );
      if (inflight) void refresh();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(t("expense.audioProof.permissionDenied"));
      return;
    }
    // Sprint AC-3 — Avertissement préventif à l'organisateur AVANT de
    // commencer : on rappelle la durée max et le seuil d'avertissement.
    // S'il accepte, on démarre. Sinon on annule.
    if (usage?.maxDurationSeconds) {
      const minutes = Math.floor(usage.maxDurationSeconds / 60);
      const warnMin = Math.floor((usage.warnAtSeconds ?? usage.maxDurationSeconds - 600) / 60);
      const ok = await dialog.confirm(
        t("meetings.preStartConfirm", {
          maxMin: String(minutes),
          warnMin: String(warnMin),
        }),
        {
          title: t("meetings.recordButton"),
          confirmLabel: t("meetings.recordButton"),
        },
      );
      if (!ok) return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
      ];
      const mime =
        candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      r.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: r.mimeType || "audio/webm",
        });
        // Reset timer
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setElapsedSeconds(0);
        await uploadBlob(blob);
      };
      r.start();
      recorderRef.current = r;
      setRecording(true);
      // Démarre le timer + watchdog
      recordingStartRef.current = Date.now();
      setElapsedSeconds(0);
      const maxSec = usage?.maxDurationSeconds ?? 3600;
      const warnSec = usage?.warnAtSeconds ?? Math.max(maxSec - 600, 60);
      let warned = false;
      tickRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setElapsedSeconds(elapsed);
        // Avertissement unique au seuil
        if (!warned && elapsed >= warnSec) {
          warned = true;
          const remainingMin = Math.max(1, Math.ceil((maxSec - elapsed) / 60));
          toast.success(
            t("meetings.warnNearEnd", { remainingMin: String(remainingMin) }),
          );
        }
        // Hard stop à maxDurationSeconds : on coupe automatiquement
        if (elapsed >= maxSec) {
          if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
          }
          stopRecording();
          toast.success(
            t("meetings.autoStopReached", {
              maxMin: String(Math.floor(maxSec / 60)),
            }),
          );
        }
      }, 1000);
    } catch {
      toast.error(t("expense.audioProof.permissionDenied"));
    }
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    recorderRef.current = null;
    setRecording(false);
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function uploadBlob(blob: Blob) {
    const title = await dialog.prompt(t("meetings.titlePlaceholder"), {
      title: t("meetings.titleLabel"),
      defaultValue: `${t("meetings.title")} ${new Date().toLocaleDateString()}`,
    });
    if (!title) return;
    setUploading(true);
    try {
      // Si quota épuisé et addon possible, on demande la confirmation explicite
      let acceptAddon = false;
      if (usage?.willChargeAddon && usage.addonCents > 0) {
        const confirmed = await dialog.confirm(
          t("meetings.addonAccept", { price: formatAmount(usage.addonCents / 100, "EUR") }),
          {
            title: t("meetings.addonNotice", {
              price: formatAmount(usage.addonCents / 100, "EUR"),
            }),
            confirmLabel: t("meetings.addonAccept", {
              price: formatAmount(usage.addonCents / 100, "EUR"),
            }),
            variant: "danger",
          },
        );
        if (!confirmed) {
          setUploading(false);
          return;
        }
        acceptAddon = true;
      }
      await api.uploadMeeting(groupId, blob, { title, acceptAddon });
      toast.success(t("meetings.processingPending"));
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
    }
  }

  async function openMeeting(id: string) {
    setOpenId(id);
    setOpenDetail(null);
    try {
      const detail = await api.getMeeting(id);
      setOpenDetail(detail);
    } catch (e) {
      toast.error(e);
      setOpenId(null);
    }
  }

  // V162 — statusLabel/statusColor sont hoistés au niveau module (voir bas
  // du fichier) pour que MeetingReviewModal puisse y accéder aussi.
  function statusLabel(s: Meeting["status"]): string {
    return statusLabelFn(s, t);
  }

  function statusColor(s: Meeting["status"]): string {
    return statusColorFn(s);
  }

  return (
    <div
      style={{
        background: "var(--card-bg, transparent)",
        border: "1px solid var(--line-soft, #e5e7eb)",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <header style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
            {/* V52.C3 — SVG mic remplace EMOJI */}
            <h3 style={{ margin: 0, fontSize: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="mic" size={18} color="currentColor" strokeWidth={1.6} />
              {t("meetings.title")}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
              {t("meetings.subtitle")}
            </p>
          </div>
          {usage && (
            <div
              style={{
                fontSize: 11,
                color: "#6b7280",
                background: "var(--overlay, rgba(255,255,255,0.04))",
                padding: "4px 8px",
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
            >
              {usage.max === -1
                ? t("meetings.usageUnlimited")
                : t("meetings.usageRemaining", {
                    used: String(usage.used),
                    max: String(usage.max),
                  })}
            </div>
          )}
        </div>
      </header>

      {/* Boutons d'action — full-width sur mobile pour un tap-target XL */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => (recording ? stopRecording() : startRecording())}
          disabled={uploading || (usage?.max === 0)}
          style={{
            flex: "1 1 200px",
            padding: "12px 16px",
            border: `1px solid ${recording ? "#dc2626" : "var(--saffron, #E8A33D)"}`,
            background: recording
              ? "rgba(220,38,38,0.15)"
              : "var(--saffron, #E8A33D)",
            color: recording ? "#dc2626" : "#000",
            borderRadius: 10,
            cursor: uploading ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: 14,
            minHeight: 44,
            opacity: usage?.max === 0 ? 0.5 : 1,
          }}
        >
          {recording
            ? `${t("meetings.stopButton")} · ${fmtDuration(elapsedSeconds)}${
                usage?.maxDurationSeconds
                  ? ` / ${fmtDuration(usage.maxDurationSeconds)}`
                  : ""
              }`
            : uploading
              ? `${t("meetings.processingPending")}…`
              : t("meetings.recordButton")}
        </button>
        {/* Sprint AC-3 — barre de progression visuelle pendant l'enregistrement.
            Vert puis ambre (≥ warn) puis rouge (≥ 95%) pour une lecture immédiate. */}
        {recording && usage?.maxDurationSeconds ? (
          <div
            style={{
              width: "100%",
              height: 4,
              background: "var(--line-soft, #e5e7eb)",
              borderRadius: 2,
              overflow: "hidden",
              flexBasis: "100%",
            }}
            aria-label="Progression de l'enregistrement"
          >
            <div
              style={{
                width: `${Math.min(100, (elapsedSeconds / usage.maxDurationSeconds) * 100)}%`,
                height: "100%",
                background:
                  elapsedSeconds >= usage.maxDurationSeconds * 0.95
                    ? "#dc2626"
                    : elapsedSeconds >= (usage.warnAtSeconds ?? usage.maxDurationSeconds - 600)
                      ? "#f59e0b"
                      : "#10b981",
                transition: "width 1s linear, background 0.3s",
              }}
            />
          </div>
        ) : null}
      </div>

      {usage?.max === 0 && (
        <div
          style={{
            padding: 10,
            border: "1px dashed var(--saffron, #E8A33D)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--saffron, #E8A33D)",
            marginBottom: 10,
          }}
        >
          🔒 {t("meetings.quotaBlocked")}
        </div>
      )}

      {usage?.willChargeAddon && usage.addonCents > 0 && (
        <div
          style={{
            padding: 10,
            background: "rgba(234, 179, 8, 0.12)",
            border: "1px solid #ca8a04",
            color: "#a16207",
            borderRadius: 8,
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          💳{" "}
          {t("meetings.addonNotice", {
            price: formatAmount(usage.addonCents / 100, "EUR"),
          })}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 12, color: "#6b7280" }}>…</p>
      ) : meetings.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: "#6b7280",
            fontStyle: "italic",
            margin: 0,
          }}
        >
          {t("meetings.empty")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {meetings.map((m) => (
            <li
              key={m.id}
              style={{
                padding: "10px 0",
                borderTop: "1px solid var(--line-soft, #e5e7eb)",
                cursor: "pointer",
                minHeight: 44,
              }}
              onClick={() => openMeeting(m.id)}
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong
                    style={{
                      fontSize: 14,
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.title}
                  </strong>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    {new Date(m.occurredAt).toLocaleDateString()} ·{" "}
                    {m.createdBy.displayName}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: `${statusColor(m.status)}22`,
                    color: statusColor(m.status),
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                  }}
                >
                  {statusLabel(m.status)}
                </span>
              </div>
              {m.summary && (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 12,
                    color: "var(--text-soft, #4b5563)",
                  }}
                >
                  {m.summary}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <MeetingReviewModal
          meetingId={openId}
          detail={openDetail}
          isAdmin={isAdmin}
          onClose={() => {
            setOpenId(null);
            setOpenDetail(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Modale de revue — édition + validation des décisions
// ============================================================

function MeetingReviewModal({
  meetingId,
  detail,
  isAdmin,
  onClose,
}: {
  meetingId: string;
  detail: MeetingDetail | null;
  isAdmin: boolean;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();
  const { isMobile } = useBreakpoint();
  const [decisions, setDecisions] = useState<any[]>([]);
  const [applying, setApplying] = useState(false);

  // V162 + V218.H — État local pour l'édition manuelle des 5 sections
  const [summaryDraft, setSummaryDraft] = useState<string>("");
  const [minutesDraft, setMinutesDraft] = useState<string>("");
  // V218.H — Next steps éditables (Partie 3)
  const [nextStepsDraft, setNextStepsDraft] = useState<MeetingNextStep[]>([]);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [editingNextSteps, setEditingNextSteps] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [savingNextSteps, setSavingNextSteps] = useState(false);
  // V218.H — Sections dépliables : Parties 1-3 ouvertes par défaut, 4-5 fermées
  const [openSummary, setOpenSummary] = useState(true);
  const [openDecisions, setOpenDecisions] = useState(true);
  const [openNextSteps, setOpenNextSteps] = useState(true);
  const [openMinutes, setOpenMinutes] = useState(false);
  const [openTranscript, setOpenTranscript] = useState(false);
  // V162 — Sheet d'export PDF
  const [pdfOpen, setPdfOpen] = useState(false);

  useEffect(() => {
    if (detail?.extractedJson?.decisions) {
      setDecisions(detail.extractedJson.decisions);
    }
    setSummaryDraft(detail?.summary ?? "");
    // V218.H — On préfère `detailedReport` (canal moderne), fallback `minutes`
    setMinutesDraft(detail?.detailedReport ?? detail?.minutes ?? "");
    setNextStepsDraft(
      Array.isArray(detail?.nextSteps) ? detail!.nextSteps : [],
    );
    setEditingSummary(false);
    setEditingMinutes(false);
    setEditingNextSteps(false);
  }, [detail]);

  // V162 — Édition est figée après APPLIED (audit immuable)
  const canEdit = isAdmin && detail?.status !== "APPLIED" && detail?.status !== "CANCELLED";

  async function saveSummary() {
    if (!detail) return;
    setSavingSummary(true);
    try {
      await api.editMeeting(meetingId, { summary: summaryDraft });
      toast.success(t("meetings.editSaved"));
      setEditingSummary(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingSummary(false);
    }
  }

  async function saveMinutes() {
    if (!detail) return;
    setSavingMinutes(true);
    try {
      // V218.H — On envoie detailedReport (champ moderne) ; le backend
      // synchronise aussi `minutes` (alias rétrocompat) automatiquement.
      await api.editMeeting(meetingId, {
        minutes: minutesDraft,
        detailedReport: minutesDraft,
      });
      toast.success(t("meetings.editSaved"));
      setEditingMinutes(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingMinutes(false);
    }
  }

  /**
   * V218.H — Persiste la liste éditée des next steps (Partie 3 du compte rendu).
   * Filtre les items vides côté client avant envoi pour éviter les rejets Zod.
   */
  async function saveNextSteps() {
    if (!detail) return;
    setSavingNextSteps(true);
    try {
      const cleaned = nextStepsDraft
        .map((ns) => ({
          text: (ns.text ?? "").trim(),
          ownerUserId: ns.ownerUserId ?? null,
          ownerName: ns.ownerName ?? null,
          dueHint: ns.dueHint ?? null,
        }))
        .filter((ns) => ns.text.length > 0);
      await api.editMeeting(meetingId, { nextSteps: cleaned });
      toast.success(t("meetings.editSaved"));
      setEditingNextSteps(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingNextSteps(false);
    }
  }

  /**
   * V162 — Persiste les décisions modifiées (édition inline). On le fait
   * APRÈS chaque tap "✓" du DecisionEditor pour ne pas perdre le travail.
   */
  async function persistDecisions(next: any[]) {
    setDecisions(next);
    try {
      await api.editMeeting(meetingId, { decisions: next });
    } catch (e) {
      // Silence — on a déjà mis à jour l'UI local. Toast minimal.
      toast.error(e);
    }
  }

  async function handleApply() {
    if (!detail) return;
    const confirmed = await dialog.confirm(
      t("meetings.applyConfirm", { count: String(decisions.length) }),
      {
        title: t("meetings.applyButton"),
        confirmLabel: t("meetings.applyButton"),
      },
    );
    if (!confirmed) return;
    setApplying(true);
    try {
      const result = await api.applyMeeting(meetingId, decisions);
      toast.success(
        t("meetings.appliedToast", {
          expenses: String(result.expensesCreated),
          settlements: String(result.settlementsCreated),
        }),
      );
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    const confirmed = await dialog.confirm(t("meetings.cancelButton"), {
      variant: "danger",
      confirmLabel: t("meetings.cancelButton"),
    });
    if (!confirmed) return;
    try {
      await api.cancelMeeting(meetingId);
      toast.success("✓");
      onClose();
    } catch (e) {
      toast.error(e);
    }
  }

  function removeDecision(idx: number) {
    setDecisions(decisions.filter((_, i) => i !== idx));
  }

  function decisionLabel(d: any): string {
    switch (d.kind) {
      case "EXPENSE":
        return t("meetings.kind.expense");
      case "SETTLEMENT":
        return t("meetings.kind.settlement");
      case "TONTINE_CONTRIBUTION":
        return t("meetings.kind.contribution");
      case "NOTE":
        return t("meetings.kind.note");
      default:
        return d.kind;
    }
  }

  // V162 — Vide si on n'a pas de detail encore
  if (!detail) {
    return (
      <BottomSheet open onClose={onClose} title={t("meetings.title")}>
        <p style={{ padding: 20, color: "var(--cocoa-soft, #6B5942)" }}>…</p>
      </BottomSheet>
    );
  }

  const members = detail.group?.members ?? [];
  const hasSummary = !!detail.summary || !!summaryDraft;
  const hasDetailedReport =
    !!(detail.detailedReport || detail.minutes) || !!minutesDraft;
  const hasNextSteps = nextStepsDraft.length > 0;
  const hasTranscript = !!detail.transcript;
  const hasDecisions = decisions.length > 0;

  return (
    <BottomSheet open onClose={onClose} title={detail.title}>
      {/* V162 — Header titre + actions (Exporter PDF + ✕) */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 16,
          marginTop: -4,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: isMobile ? 22 : 26,
              fontWeight: 600,
              color: "var(--cocoa, #2B1F15)",
              margin: 0,
              lineHeight: 1.15,
              overflowWrap: "anywhere",
            }}
          >
            {detail.title}
          </h2>
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5942)",
              marginTop: 4,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span>{new Date(detail.occurredAt).toLocaleDateString()}</span>
            <span aria-hidden>·</span>
            <span>{detail.createdBy.displayName}</span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--paper, rgba(244,228,193,0.40))",
                color: statusColorFn(detail.status),
                border: `1px solid ${statusColorFn(detail.status)}`,
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {statusLabelFn(detail.status, t)}
            </span>
            {detail.manuallyEditedAt && (
              <span
                style={{
                  color: "var(--v45-saffron-strong, #854F0B)",
                  fontStyle: "italic",
                  fontSize: 11,
                }}
              >
                ✎ {t("meetings.editedOn", {
                  date: new Date(detail.manuallyEditedAt).toLocaleDateString(),
                })}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPdfOpen(true)}
          aria-label={t("meetings.pdf.title")}
          style={{
            padding: "8px 14px",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
            color: "#FBF6EC",
            border: "none",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            minHeight: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "inherit",
            boxShadow: "0 4px 12px -4px rgba(133,79,11,0.40)",
            flexShrink: 0,
          }}
        >
          <span aria-hidden>⬇</span>
          {isMobile ? "PDF" : t("meetings.pdf.exportCta")}
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close") || "Fermer"}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            color: "var(--cocoa-soft, #6B5942)",
            minHeight: 40,
            minWidth: 40,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </header>

      {/* V162 — Bandeau FAILED si applicable */}
      {detail.status === "FAILED" && detail.errorMessage && (
        <section
          style={{
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.30)",
            color: "var(--v45-terracotta, #9F4628)",
            padding: 12,
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          ⚠️ {detail.errorMessage}
          <button
            type="button"
            onClick={async () => {
              try {
                await api.retryMeeting(meetingId);
                toast.success(t("meetings.retryButton"));
                onClose();
              } catch (e) {
                toast.error(e);
              }
            }}
            style={{
              display: "block",
              marginTop: 10,
              background: "transparent",
              border: "1px solid var(--v45-terracotta, #9F4628)",
              color: "var(--v45-terracotta, #9F4628)",
              padding: "6px 14px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              minHeight: 36,
            }}
          >
            {t("meetings.retryButton")}
          </button>
        </section>
      )}

      {/* ============================================================
          V218.H — PARTIE 1 : RÉSUMÉ DE LA DISCUSSION (visible, éditable)
          ============================================================ */}
      {(hasSummary || canEdit) && (
        <SectionCard
          title={t("meetings.partSummary")}
          collapsible
          open={openSummary}
          onToggle={() => setOpenSummary((v) => !v)}
          actions={
            canEdit && !editingSummary && openSummary ? (
              <EditIconButton
                onClick={() => setEditingSummary(true)}
                label={t("meetings.edit")}
              />
            ) : null
          }
        >
          {editingSummary ? (
            <>
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("meetings.summaryPlaceholder")}
                style={editTextareaStyle}
              />
              <div style={editActionsRow}>
                <button
                  type="button"
                  onClick={() => {
                    setSummaryDraft(detail.summary ?? "");
                    setEditingSummary(false);
                  }}
                  style={btnGhostStyle}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={saveSummary}
                  disabled={savingSummary}
                  style={btnPrimaryStyle}
                >
                  {savingSummary ? "…" : t("common.save")}
                </button>
              </div>
            </>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--cocoa, #2B1F15)",
                whiteSpace: "pre-wrap",
                fontStyle: hasSummary ? "normal" : "italic",
              }}
            >
              {detail.summary || t("meetings.noSummary")}
            </p>
          )}
        </SectionCard>
      )}

      {/* ============================================================
          V218.H — PARTIE 2 : DÉCISIONS PRISES (cœur du compte rendu)
          ============================================================ */}
      <SectionCard
        title={t("meetings.partDecisions")}
        badge={t("meetings.decisionsCount", { count: String(decisions.length) })}
        accent
        collapsible
        open={openDecisions}
        onToggle={() => setOpenDecisions((v) => !v)}
      >
        {!hasDecisions ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--cocoa-soft, #6B5942)",
              fontStyle: "italic",
              margin: 0,
            }}
          >
            {t("meetings.noDecisions")}
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {decisions.map((d, idx) => (
              <DecisionEditor
                key={idx}
                decision={d}
                idx={idx}
                members={members}
                currency={detail.group ? "EUR" : "EUR"}
                isAdmin={canEdit}
                onUpdate={(next) => {
                  const copy = [...decisions];
                  copy[idx] = next;
                  void persistDecisions(copy);
                }}
                onRemove={() => {
                  void persistDecisions(decisions.filter((_, i) => i !== idx));
                }}
              />
            ))}
          </ul>
        )}

        {detail.status === "REVIEW" && canEdit && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 14,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || decisions.length === 0}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: decisions.length === 0
                  ? "var(--paper, #F4ECD8)"
                  : "linear-gradient(135deg, var(--v45-emerald, #1F7A57), var(--v45-emerald-soft, #4F8E6E))",
                color: decisions.length === 0 ? "var(--cocoa-soft, #6B5942)" : "#FBF6EC",
                border: "none",
                borderRadius: 12,
                cursor: applying ? "wait" : decisions.length === 0 ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 14,
                minHeight: 48,
                fontFamily: "inherit",
              }}
            >
              {applying ? "…" : t("meetings.applyButton")}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: "12px 16px",
                background: "transparent",
                border: "1px solid var(--v45-terracotta, #9F4628)",
                color: "var(--v45-terracotta, #9F4628)",
                borderRadius: 12,
                cursor: "pointer",
                minHeight: 48,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              {t("meetings.cancelButton")}
            </button>
          </div>
        )}

        {detail.status === "APPLIED" && (
          <p
            style={{
              color: "var(--v45-emerald, #1F7A57)",
              fontSize: 13,
              fontWeight: 600,
              marginTop: 10,
            }}
          >
            ✓ {t("meetings.processingApplied")}
            {detail.appliedAt
              ? ` — ${new Date(detail.appliedAt).toLocaleString()}`
              : ""}
          </p>
        )}
      </SectionCard>

      {/* ============================================================
          V218.H — PARTIE 3 : NEXT STEPS / ACTIONS À PRENDRE (éditable)
          ============================================================ */}
      {(hasNextSteps || canEdit) && (
        <SectionCard
          title={t("meetings.partNextSteps")}
          collapsible
          open={openNextSteps}
          onToggle={() => setOpenNextSteps((v) => !v)}
          actions={
            canEdit && !editingNextSteps && openNextSteps ? (
              <EditIconButton
                onClick={() => setEditingNextSteps(true)}
                label={t("meetings.edit")}
              />
            ) : null
          }
        >
          {editingNextSteps ? (
            <NextStepsEditor
              value={nextStepsDraft}
              members={members}
              onChange={setNextStepsDraft}
              onCancel={() => {
                setNextStepsDraft(detail.nextSteps ?? []);
                setEditingNextSteps(false);
              }}
              onSave={saveNextSteps}
              saving={savingNextSteps}
            />
          ) : nextStepsDraft.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--cocoa-soft, #6B5942)",
                fontStyle: "italic",
                margin: 0,
              }}
            >
              {t("meetings.noNextSteps")}
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {nextStepsDraft.map((step, idx) => {
                const ownerName =
                  (step.ownerUserId &&
                    members.find((m) => (m.user?.id ?? m.userId) === step.ownerUserId)
                      ?.user?.displayName) ||
                  step.ownerName ||
                  null;
                return (
                  <li
                    key={idx}
                    style={{
                      padding: "10px 12px",
                      marginBottom: 8,
                      border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))",
                      borderRadius: 10,
                      background: "var(--paper, rgba(244,228,193,0.40))",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: "1.5px solid var(--v45-saffron, #C58A2E)",
                        background: "#FBF6EC",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          lineHeight: 1.45,
                          color: "var(--cocoa, #2B1F15)",
                        }}
                      >
                        {step.text}
                      </p>
                      {(ownerName || step.dueHint) && (
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 11,
                            fontStyle: "italic",
                            color: "var(--v45-saffron-strong, #854F0B)",
                          }}
                        >
                          {ownerName
                            ? `${t("meetings.nextStepOwner")} ${ownerName}`
                            : ""}
                          {ownerName && step.dueHint ? " · " : ""}
                          {step.dueHint
                            ? `${t("meetings.nextStepDue")} ${step.dueHint}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {/* ============================================================
          V218.H — PARTIE 4 : COMPTE RENDU DÉTAILLÉ (pliable, fermé par défaut)
          ============================================================ */}
      {(hasDetailedReport || canEdit) && (
        <SectionCard
          title={t("meetings.partDetailed")}
          collapsible
          open={openMinutes}
          onToggle={() => setOpenMinutes((v) => !v)}
          actions={
            canEdit && !editingMinutes && openMinutes ? (
              <EditIconButton
                onClick={() => setEditingMinutes(true)}
                label={t("meetings.edit")}
              />
            ) : null
          }
        >
          {editingMinutes ? (
            <>
              <textarea
                value={minutesDraft}
                onChange={(e) => setMinutesDraft(e.target.value)}
                rows={isMobile ? 10 : 14}
                maxLength={20000}
                placeholder={t("meetings.minutesPlaceholder")}
                style={{
                  ...editTextareaStyle,
                  fontFamily: "inherit",
                  minHeight: 200,
                }}
              />
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 11,
                  color: "var(--cocoa-soft, #6B5942)",
                  fontStyle: "italic",
                }}
              >
                {t("meetings.minutesMdHint")}
              </p>
              <div style={editActionsRow}>
                <button
                  type="button"
                  onClick={() => {
                    setMinutesDraft(detail.detailedReport ?? detail.minutes ?? "");
                    setEditingMinutes(false);
                  }}
                  style={btnGhostStyle}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={saveMinutes}
                  disabled={savingMinutes}
                  style={btnPrimaryStyle}
                >
                  {savingMinutes ? "…" : t("common.save")}
                </button>
              </div>
            </>
          ) : (
            <MinutesRender
              markdown={detail.detailedReport ?? detail.minutes ?? ""}
            />
          )}
        </SectionCard>
      )}

      {/* ============================================================
          V218.H — PARTIE 5 : TRANSCRIPTION COMPLÈTE (verbatim Whisper)
          ============================================================ */}
      {hasTranscript && (
        <SectionCard
          title={t("meetings.partTranscript")}
          collapsible
          open={openTranscript}
          onToggle={() => setOpenTranscript((v) => !v)}
          hint={t("meetings.transcriptHint")}
        >
          <p
            style={{
              margin: 0,
              padding: 12,
              background: "var(--paper, rgba(244,228,193,0.40))",
              border: "1px solid var(--cocoa-line, rgba(43,31,21,0.08))",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--cocoa-soft, #4b5563)",
              whiteSpace: "pre-wrap",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {detail.transcript}
          </p>
        </SectionCard>
      )}

      {/* V162 + V218.H — Modal export PDF (5 sections) */}
      <MeetingPdfExportSheet
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        meetingId={meetingId}
        meetingTitle={detail.title}
        available={{
          summary: hasSummary,
          decisions: hasDecisions,
          nextSteps: hasNextSteps,
          minutes: hasDetailedReport,
          transcript: hasTranscript,
        }}
      />
    </BottomSheet>
  );
}

/* ===========================================================
   V162 — Helpers UI partagés pour MeetingReviewModal
   =========================================================== */

const editTextareaStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))",
  background: "var(--paper, #FBF6EC)",
  color: "var(--cocoa, #2B1F15)",
  fontSize: 14,
  lineHeight: 1.5,
  resize: "vertical",
  fontFamily: "inherit",
  minHeight: 64,
};

const editActionsRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  justifyContent: "flex-end",
};

const btnGhostStyle: CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))",
  color: "var(--cocoa, #2B1F15)",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 40,
  fontFamily: "inherit",
};

const btnPrimaryStyle: CSSProperties = {
  padding: "8px 16px",
  background:
    "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
  color: "#FBF6EC",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 40,
  fontFamily: "inherit",
};

function EditIconButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        padding: "4px 10px",
        background: "var(--paper, rgba(244,228,193,0.40))",
        border: "1px solid var(--cocoa-line, rgba(43,31,21,0.12))",
        color: "var(--v45-saffron-strong, #854F0B)",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        minHeight: 28,
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      ✎ {label}
    </button>
  );
}

/**
 * V162 — Card de section réutilisable (Décisions, Résumé, CR, Transcription).
 * Cohérent V45-light : ivoire/saffron, padding généreux, titre eyebrow,
 * actions à droite, optionnellement collapsible.
 */
function SectionCard({
  title,
  badge,
  actions,
  collapsible,
  open,
  onToggle,
  hint,
  accent,
  children,
}: {
  title: string;
  badge?: string;
  actions?: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  hint?: string;
  accent?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const isOpen = collapsible ? open !== false : true;
  return (
    <section
      style={{
        marginBottom: 14,
        padding: 16,
        background: accent
          ? "linear-gradient(135deg, var(--paper, #FBF6EC), var(--v45-saffron-pale, #F6E8C5) 200%)"
          : "var(--paper, rgba(244,228,193,0.30))",
        border: `1px solid ${
          accent
            ? "var(--v45-saffron-line, rgba(197,138,46,0.30))"
            : "var(--cocoa-line, rgba(43,31,21,0.10))"
        }`,
        borderRadius: 14,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: isOpen ? 10 : 0,
          cursor: collapsible ? "pointer" : "default",
        }}
        onClick={collapsible ? onToggle : undefined}
      >
        {collapsible && (
          <span
            aria-hidden
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5942)",
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              display: "inline-block",
              width: 12,
            }}
          >
            ▸
          </span>
        )}
        <h3
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            fontWeight: 700,
            color: accent
              ? "var(--v45-saffron-strong, #854F0B)"
              : "var(--cocoa-soft, #6B5942)",
            flex: 1,
          }}
        >
          {title}
          {badge && (
            <span
              style={{
                marginLeft: 8,
                padding: "2px 8px",
                background: "var(--v45-saffron, #C58A2E)",
                color: "#FBF6EC",
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: 0.2,
              }}
            >
              {badge}
            </span>
          )}
        </h3>
        {actions}
      </header>
      {isOpen && (
        <>
          {hint && (
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 11,
                fontStyle: "italic",
                color: "var(--cocoa-soft, #6B5942)",
              }}
            >
              {hint}
            </p>
          )}
          {children}
        </>
      )}
    </section>
  );
}

/**
 * V162 — Rendu Markdown léger pour le compte rendu.
 * Supporte : `## titres`, `### sous-titres`, `- bullets`, paragraphes,
 * `**bold**` / `*italic*` inline. Pas de HTML — on rend du JSX direct.
 */
function MinutesRender({ markdown }: { markdown: string }): JSX.Element {
  if (!markdown || markdown.trim() === "") {
    return (
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--cocoa-soft, #6B5942)",
          fontStyle: "italic",
        }}
      >
        Aucun compte rendu détaillé disponible. Clique sur ✎ pour en rédiger un.
      </p>
    );
  }

  const lines = markdown.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let paragraphBuffer: string[] = [];
  let bulletBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    nodes.push(
      <p key={`p-${nodes.length}`} style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.55, color: "var(--cocoa, #2B1F15)" }}>
        {renderInline(paragraphBuffer.join(" "))}
      </p>,
    );
    paragraphBuffer = [];
  };
  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    nodes.push(
      <ul key={`u-${nodes.length}`} style={{ margin: "0 0 10px", paddingLeft: 20 }}>
        {bulletBuffer.map((b, i) => (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.55, color: "var(--cocoa, #2B1F15)", marginBottom: 3 }}>
            {renderInline(b)}
          </li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushBullets();
      flushParagraph();
      continue;
    }
    if (line.startsWith("## ")) {
      flushBullets();
      flushParagraph();
      nodes.push(
        <h4
          key={`h2-${nodes.length}`}
          style={{
            margin: "12px 0 6px",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--v45-saffron-strong, #854F0B)",
          }}
        >
          {renderInline(line.slice(3).trim())}
        </h4>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      flushBullets();
      flushParagraph();
      nodes.push(
        <h5
          key={`h3-${nodes.length}`}
          style={{ margin: "8px 0 4px", fontSize: 13, fontWeight: 700, color: "var(--cocoa, #2B1F15)" }}
        >
          {renderInline(line.slice(4).trim())}
        </h5>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      bulletBuffer.push(line.slice(2).trim());
      continue;
    }
    flushBullets();
    paragraphBuffer.push(line);
  }
  flushBullets();
  flushParagraph();

  return <div>{nodes}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Très simple : supporte **bold** et *italic*. On split sur les markers.
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(^|[^*])\*([^*]+?)\*/);
    if (!boldMatch && !italicMatch) {
      if (remaining) parts.push(remaining);
      break;
    }
    const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : -1;
    const italicIdx = italicMatch ? remaining.indexOf("*" + italicMatch[2] + "*") : -1;
    if (boldIdx !== -1 && (italicIdx === -1 || boldIdx < italicIdx)) {
      if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx));
      parts.push(<strong key={`b-${key++}`}>{boldMatch![1]}</strong>);
      remaining = remaining.slice(boldIdx + boldMatch![0].length);
    } else if (italicIdx !== -1) {
      const before = remaining.slice(0, italicIdx);
      if (before) parts.push(before);
      parts.push(<em key={`i-${key++}`}>{italicMatch![2]}</em>);
      remaining = remaining.slice(italicIdx + 2 + italicMatch![2]!.length);
    } else {
      parts.push(remaining);
      break;
    }
  }
  return parts;
}

// ============================================================
// Sprint AC-3 — Éditeur de décision en place dans la modale
// ============================================================

/**
 * Affiche une décision extraite par le LLM avec un mode "lecture rapide" et
 * un mode édition complet (toggle). En édition, l'admin peut modifier
 * description, montant, devise, payeur, participants, mode de partage.
 *
 * Mobile-first : tap-targets ≥ 36px, layout flex-column qui s'empile sur
 * petits écrans.
 */
function DecisionEditor({
  decision,
  idx,
  members,
  currency,
  isAdmin,
  onUpdate,
  onRemove,
}: {
  decision: any;
  idx: number;
  members: Array<{
    userId: string;
    user?: { id: string; displayName: string };
  }>;
  currency: string;
  isAdmin: boolean;
  onUpdate: (next: any) => void;
  onRemove: () => void;
}): JSX.Element {
  const t = useT();
  const [editing, setEditing] = useState(false);

  // Membres normalisés en {id, displayName}
  const memberOptions = members.map((m) => ({
    id: m.user?.id ?? m.userId,
    displayName: m.user?.displayName ?? m.userId,
  }));

  function setField(field: string, value: any) {
    onUpdate({ ...decision, [field]: value });
  }

  function toggleParticipant(userId: string) {
    const ids = Array.isArray(decision.participantIds)
      ? decision.participantIds
      : [];
    const next = ids.includes(userId)
      ? ids.filter((x: string) => x !== userId)
      : [...ids, userId];
    onUpdate({ ...decision, participantIds: next });
  }

  function decisionLabel(d: any): string {
    switch (d.kind) {
      case "EXPENSE":
        return t("meetings.kind.expense");
      case "SETTLEMENT":
        return t("meetings.kind.settlement");
      case "TONTINE_CONTRIBUTION":
        return t("meetings.kind.contribution");
      case "NOTE":
        return t("meetings.kind.note");
      default:
        return d.kind;
    }
  }

  return (
    <li
      style={{
        padding: 10,
        marginBottom: 8,
        border: "1px solid var(--line-soft, #e5e7eb)",
        borderRadius: 8,
        background: "var(--overlay, rgba(255,255,255,0.04))",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 12 }}>{decisionLabel(decision)}</strong>
        {isAdmin && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              aria-label={t("meetings.editDecision")}
              style={{
                background: "transparent",
                border: "1px solid var(--line-soft)",
                color: "var(--saffron, #E8A33D)",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
                cursor: "pointer",
                minHeight: 28,
              }}
            >
              {editing ? "✓" : "✎"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={t("meetings.removeDecision")}
              style={{
                background: "transparent",
                border: "1px solid var(--line-soft)",
                color: "#dc2626",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
                cursor: "pointer",
                minHeight: 28,
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {!editing && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--text-soft, #4b5563)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {decision.kind === "EXPENSE" &&
            `${decision.description} — ${decision.amount} ${decision.currency ?? ""}`}
          {decision.kind === "SETTLEMENT" &&
            `${decision.amount} ${decision.currency ?? ""}`}
          {decision.kind === "TONTINE_CONTRIBUTION" &&
            `${decision.amount} ${decision.paymentMethod ?? ""}`}
          {decision.kind === "NOTE" && decision.text}
        </p>
      )}

      {editing && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 12,
          }}
        >
          {decision.kind === "EXPENSE" && (
            <>
              <label>
                <span style={editLabel}>{t("meetings.editDescription")}</span>
                <input
                  type="text"
                  value={decision.description ?? ""}
                  onChange={(e) => setField("description", e.target.value)}
                  style={editInput}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 2 }}>
                  <span style={editLabel}>{t("meetings.editAmount")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={decision.amount ?? ""}
                    onChange={(e) =>
                      setField("amount", parseFloat(e.target.value) || 0)
                    }
                    style={editInput}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={editLabel}>{t("meetings.editCurrency")}</span>
                  <input
                    type="text"
                    value={decision.currency ?? currency}
                    onChange={(e) =>
                      setField("currency", e.target.value.toUpperCase())
                    }
                    maxLength={3}
                    style={editInput}
                  />
                </label>
              </div>
              <label>
                <span style={editLabel}>{t("meetings.editPaidBy")}</span>
                <select
                  value={decision.paidByUserId ?? ""}
                  onChange={(e) =>
                    setField("paidByUserId", e.target.value || null)
                  }
                  style={editInput}
                >
                  <option value="">—</option>
                  {memberOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span style={editLabel}>{t("meetings.editParticipants")}</span>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  {memberOptions.map((m) => {
                    const checked = (decision.participantIds ?? []).includes(
                      m.id,
                    );
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleParticipant(m.id)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 11,
                          borderRadius: 12,
                          border: `1px solid ${checked ? "var(--saffron, #E8A33D)" : "var(--line-soft)"}`,
                          background: checked
                            ? "var(--saffron, #E8A33D)"
                            : "transparent",
                          color: checked ? "#000" : "var(--text-strong)",
                          cursor: "pointer",
                          minHeight: 28,
                        }}
                      >
                        {m.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label>
                <span style={editLabel}>{t("meetings.editSplitMode")}</span>
                <select
                  value={decision.splitMode ?? "EQUAL"}
                  onChange={(e) => setField("splitMode", e.target.value)}
                  style={editInput}
                >
                  <option value="EQUAL">{t("expense.shareEqual")}</option>
                  <option value="UNEQUAL">{t("expense.shareCustom")}</option>
                  <option value="PERCENTAGE">
                    {t("expense.sharePercent")}
                  </option>
                </select>
              </label>
            </>
          )}

          {decision.kind === "SETTLEMENT" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1 }}>
                  <span style={editLabel}>{t("meetings.editFromUser")}</span>
                  <select
                    value={decision.fromUserId ?? ""}
                    onChange={(e) => setField("fromUserId", e.target.value)}
                    style={editInput}
                  >
                    <option value="">—</option>
                    {memberOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: 1 }}>
                  <span style={editLabel}>{t("meetings.editToUser")}</span>
                  <select
                    value={decision.toUserId ?? ""}
                    onChange={(e) => setField("toUserId", e.target.value)}
                    style={editInput}
                  >
                    <option value="">—</option>
                    {memberOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 2 }}>
                  <span style={editLabel}>{t("meetings.editAmount")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={decision.amount ?? ""}
                    onChange={(e) =>
                      setField("amount", parseFloat(e.target.value) || 0)
                    }
                    style={editInput}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={editLabel}>{t("meetings.editCurrency")}</span>
                  <input
                    type="text"
                    value={decision.currency ?? currency}
                    onChange={(e) =>
                      setField("currency", e.target.value.toUpperCase())
                    }
                    maxLength={3}
                    style={editInput}
                  />
                </label>
              </div>
            </>
          )}

          {decision.kind === "TONTINE_CONTRIBUTION" && (
            <>
              <label>
                <span style={editLabel}>{t("meetings.editContributor")}</span>
                <select
                  value={decision.contributorUserId ?? ""}
                  onChange={(e) =>
                    setField("contributorUserId", e.target.value)
                  }
                  style={editInput}
                >
                  <option value="">—</option>
                  {memberOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span style={editLabel}>{t("meetings.editAmount")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={decision.amount ?? ""}
                  onChange={(e) =>
                    setField("amount", parseFloat(e.target.value) || 0)
                  }
                  style={editInput}
                />
              </label>
              <label>
                <span style={editLabel}>
                  {t("meetings.editPaymentMethod")}
                </span>
                <input
                  type="text"
                  value={decision.paymentMethod ?? ""}
                  onChange={(e) => setField("paymentMethod", e.target.value)}
                  style={editInput}
                />
              </label>
            </>
          )}

          {decision.kind === "NOTE" && (
            <label>
              <span style={editLabel}>{t("meetings.editNote")}</span>
              <textarea
                value={decision.text ?? ""}
                onChange={(e) => setField("text", e.target.value)}
                rows={3}
                style={{ ...editInput, fontFamily: "inherit" }}
              />
            </label>
          )}
        </div>
      )}
    </li>
  );
}

const editLabel: CSSProperties = {
  display: "block",
  fontSize: 10,
  color: "#6b7280",
  textTransform: "uppercase",
  marginBottom: 2,
};
const editInput: CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--line-soft, #e5e7eb)",
  fontSize: 13,
  minHeight: 36,
};

// ============================================================
// V218.H — Éditeur Next steps (Partie 3 du compte rendu structuré)
// ============================================================

/**
 * Petit éditeur en place pour les actions à prendre. L'organisateur peut
 * ajouter / supprimer / réordonner / assigner un responsable (parmi les
 * membres du groupe) et préciser une échéance libre.
 *
 * Volontairement simple : pas de drag & drop ni de date picker — on reste
 * dans l'esprit "compte rendu écrit à la main".
 */
function NextStepsEditor({
  value,
  members,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  value: MeetingNextStep[];
  members: Array<{
    userId: string;
    user?: { id: string; displayName: string };
  }>;
  onChange: (next: MeetingNextStep[]) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}): JSX.Element {
  const t = useT();
  const memberOptions = members.map((m) => ({
    id: m.user?.id ?? m.userId,
    displayName: m.user?.displayName ?? m.userId,
  }));

  function updateAt(idx: number, patch: Partial<MeetingNextStep>) {
    const next = [...value];
    next[idx] = { ...next[idx]!, ...patch };
    onChange(next);
  }
  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function addEmpty() {
    if (value.length >= 12) return;
    onChange([
      ...value,
      { text: "", ownerUserId: null, ownerName: null, dueHint: null },
    ]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {value.length === 0 && (
        <p
          style={{
            fontSize: 12,
            fontStyle: "italic",
            color: "var(--cocoa-soft, #6B5942)",
            margin: 0,
          }}
        >
          {t("meetings.noNextSteps")}
        </p>
      )}
      {value.map((step, idx) => (
        <div
          key={idx}
          style={{
            padding: 10,
            border: "1px solid var(--cocoa-line, rgba(43,31,21,0.12))",
            borderRadius: 10,
            background: "var(--paper, rgba(244,228,193,0.30))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <textarea
              value={step.text}
              onChange={(e) => updateAt(idx, { text: e.target.value })}
              rows={2}
              maxLength={400}
              placeholder={t("meetings.nextStepPlaceholder")}
              style={{
                flex: 1,
                ...editTextareaStyle,
                minHeight: 44,
                fontSize: 13,
              }}
            />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              aria-label={t("meetings.removeDecision")}
              style={{
                background: "transparent",
                border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))",
                color: "var(--v45-terracotta, #9F4628)",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 14,
                cursor: "pointer",
                minHeight: 36,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 140px", minWidth: 0 }}>
              <span style={editLabel}>{t("meetings.nextStepOwnerLabel")}</span>
              <select
                value={step.ownerUserId ?? ""}
                onChange={(e) =>
                  updateAt(idx, {
                    ownerUserId: e.target.value || null,
                    ownerName: null,
                  })
                }
                style={editInput}
              >
                <option value="">—</option>
                {memberOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: "1 1 140px", minWidth: 0 }}>
              <span style={editLabel}>{t("meetings.nextStepDueLabel")}</span>
              <input
                type="text"
                value={step.dueHint ?? ""}
                onChange={(e) =>
                  updateAt(idx, { dueHint: e.target.value || null })
                }
                placeholder={t("meetings.nextStepDuePlaceholder")}
                maxLength={160}
                style={editInput}
              />
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addEmpty}
        disabled={value.length >= 12}
        style={{
          padding: "8px 14px",
          background: "transparent",
          border: "1px dashed var(--v45-saffron, #C58A2E)",
          color: "var(--v45-saffron-strong, #854F0B)",
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 13,
          cursor: value.length >= 12 ? "not-allowed" : "pointer",
          minHeight: 40,
          opacity: value.length >= 12 ? 0.5 : 1,
          fontFamily: "inherit",
        }}
      >
        + {t("meetings.nextStepAdd")}
      </button>

      <div style={editActionsRow}>
        <button type="button" onClick={onCancel} style={btnGhostStyle}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={btnPrimaryStyle}
        >
          {saving ? "…" : t("common.save")}
        </button>
      </div>
    </div>
  );
}
