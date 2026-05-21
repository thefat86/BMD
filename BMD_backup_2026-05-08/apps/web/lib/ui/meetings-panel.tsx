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

interface MeetingDetail extends Meeting {
  transcript: string | null;
  language: string | null;
  extractedJson: { summary: string; decisions: any[] } | null;
  errorMessage: string | null;
  audioMimeType: string;
  audioSizeBytes: number;
  audioPurged: boolean;
  group: { id: string; name: string };
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

  function statusLabel(s: Meeting["status"]): string {
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

  function statusColor(s: Meeting["status"]): string {
    switch (s) {
      case "REVIEW":
        return "var(--saffron, #E8A33D)";
      case "APPLIED":
        return "#059669";
      case "FAILED":
        return "#dc2626";
      case "CANCELLED":
        return "#6b7280";
      default:
        return "#0ea5e9";
    }
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
            <h3 style={{ margin: 0, fontSize: 16 }}>🎙️ {t("meetings.title")}</h3>
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
  const [decisions, setDecisions] = useState<any[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (detail?.extractedJson?.decisions) {
      setDecisions(detail.extractedJson.decisions);
    }
  }, [detail]);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg, #fff)",
          color: "var(--text-strong, #1f2937)",
          borderRadius: "16px 16px 0 0",
          width: "100%",
          maxWidth: 640,
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 16,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            position: "sticky",
            top: -16,
            background: "var(--bg, #fff)",
            paddingTop: 16,
            zIndex: 1,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {detail?.title ?? t("meetings.title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "none",
              fontSize: 28,
              cursor: "pointer",
              color: "var(--text-strong, #1f2937)",
              minHeight: 44,
              minWidth: 44,
            }}
          >
            ×
          </button>
        </header>

        {!detail ? (
          <p>…</p>
        ) : (
          <>
            {detail.summary && (
              <section style={{ marginBottom: 14 }}>
                <h4
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    margin: "0 0 4px",
                    textTransform: "uppercase",
                  }}
                >
                  {t("meetings.summaryLabel")}
                </h4>
                <p style={{ margin: 0, fontSize: 14 }}>{detail.summary}</p>
              </section>
            )}

            {detail.status === "FAILED" && detail.errorMessage && (
              <section
                style={{
                  background: "rgba(220,38,38,0.1)",
                  color: "#dc2626",
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 12,
                  marginBottom: 14,
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
                    marginTop: 8,
                    background: "transparent",
                    border: "1px solid #dc2626",
                    color: "#dc2626",
                    padding: "6px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  {t("meetings.retryButton")}
                </button>
              </section>
            )}

            {detail.transcript && (
              <details style={{ marginBottom: 14 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--saffron, #E8A33D)",
                  }}
                >
                  📝 {t("meetings.transcriptLabel")}
                </summary>
                <p
                  style={{
                    margin: "8px 0 0",
                    padding: 8,
                    background: "rgba(0,0,0,0.04)",
                    borderRadius: 6,
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {detail.transcript}
                </p>
              </details>
            )}

            {detail.status === "REVIEW" && (
              <section>
                <h4
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    margin: "0 0 8px",
                    textTransform: "uppercase",
                  }}
                >
                  {t("meetings.decisionsLabel")} —{" "}
                  {t("meetings.decisionsCount", { count: String(decisions.length) })}
                </h4>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {decisions.map((d, idx) => (
                    <DecisionEditor
                      key={idx}
                      decision={d}
                      idx={idx}
                      members={detail.group ? (detail as any).group.members ?? [] : []}
                      currency={detail.group ? "EUR" : "EUR"}
                      isAdmin={isAdmin}
                      onUpdate={(next) => {
                        const copy = [...decisions];
                        copy[idx] = next;
                        setDecisions(copy);
                      }}
                      onRemove={() => removeDecision(idx)}
                    />
                  ))}
                </ul>
                {isAdmin && (
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
                        background: "var(--saffron, #E8A33D)",
                        color: "#000",
                        border: "none",
                        borderRadius: 10,
                        cursor: applying ? "wait" : "pointer",
                        fontWeight: 600,
                        minHeight: 44,
                        opacity: decisions.length === 0 ? 0.5 : 1,
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
                        border: "1px solid #dc2626",
                        color: "#dc2626",
                        borderRadius: 10,
                        cursor: "pointer",
                        minHeight: 44,
                      }}
                    >
                      {t("meetings.cancelButton")}
                    </button>
                  </div>
                )}
              </section>
            )}

            {detail.status === "APPLIED" && (
              <p style={{ color: "#059669", fontSize: 13 }}>
                ✓ {t("meetings.processingApplied")} —{" "}
                {detail.appliedAt
                  ? new Date(detail.appliedAt).toLocaleString()
                  : ""}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
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
