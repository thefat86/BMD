"use client";

/**
 * V211.D — Vue Réunions dédiée desktop.
 * =============================================================================
 * Split 40/60 : liste à gauche avec gros bouton REC en haut + historique,
 * détail à droite (lecteur + résumé IA + actions à suivre + export PDF).
 * Réutilise les endpoints listMeetings + uploadMeeting du module existant.
 *
 * V221 — Refonte complète du panneau « détail » à droite :
 *   - Titre éditable inline (save au blur).
 *   - Vrai lecteur audio (fetch + blob URL pour gérer l'auth Bearer).
 *   - 5 sections éditables (Résumé / Décisions / Actions / CR détaillé / Transcript).
 *   - Export PDF via MeetingPdfExportSheet existant.
 *   - Bouton sticky « Enregistrer » apparaît si modifications non persistées.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { DesktopGroupSectionShell } from "./group-desktop-shell";
import { MeetingPdfExportSheet } from "./meeting-pdf-export-sheet";
import {
  startVoiceRecording,
  type VoiceRecorderHandle,
} from "../voice-recorder";

// V221 — Type du détail complet retourné par api.getMeeting (5 sections + audio).
type MeetingDetail = Awaited<ReturnType<typeof api.getMeeting>>;
type MeetingNextStep = {
  text: string;
  ownerUserId?: string | null;
  ownerName?: string | null;
  dueHint?: string | null;
};

type Meeting = Awaited<ReturnType<typeof api.listMeetings>>[number];

export function DesktopGroupMeetingsView({
  group,
  autoSelectMeetingId,
}: {
  group: { id: string; name: string };
  // V219.A — Permet d'auto-sélectionner une réunion depuis ?meetingId=…
  // (utilisé par la notification "Réviser & appliquer" pour scroller direct
  // sur la bonne réunion plutôt que d'ouvrir une 404).
  autoSelectMeetingId?: string | null;
}) {
  const t = useT();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // V215.A1 — Vrai enregistreur audio (MediaRecorder via voice-recorder.ts)
  // au lieu du filepicker qui ne faisait que choisir un fichier existant.
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const recorderHandleRef = useRef<VoiceRecorderHandle | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // V215.E2 — Suivi progress IA : status retourné par GET /meetings/:id +
  // polling toutes les 3s tant que la réunion n'est pas en REVIEW/APPLIED/FAILED.
  type ProcessingStep =
    | { stage: "idle" }
    | { stage: "uploading" }
    | { stage: "transcribing"; meetingId: string }
    | { stage: "extracting"; meetingId: string }
    | { stage: "done"; meetingId: string }
    | { stage: "failed"; meetingId: string; message: string };
  const [processing, setProcessing] = useState<ProcessingStep>({
    stage: "idle",
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup intervalles si la modal se ferme par démontage
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listMeetings(group.id);
        if (cancelled) return;
        setMeetings(list);
        if (list.length > 0) {
          // V219.A — Priorise l'ID demandé via query string (?meetingId=…)
          // s'il existe vraiment dans la liste, sinon prend la plus récente.
          const target =
            autoSelectMeetingId &&
            list.some((m) => m.id === autoSelectMeetingId)
              ? autoSelectMeetingId
              : list[0].id;
          setSelectedId(target);
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id, autoSelectMeetingId]);

  const selected = useMemo(
    () => meetings.find((m) => m.id === selectedId) || null,
    [meetings, selectedId],
  );

  const formatDuration = (sec: number | null) => {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    return `${m} min`;
  };

  // V215.E2 — Polling status meeting toutes les 3s pour afficher la progression
  // backend (TRANSCRIBING → EXTRACTING → REVIEW/APPLIED). Stop quand status
  // terminal ou après timeout 5 min.
  function startStatusPolling(meetingId: string, startedAt: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const m = await api.getMeeting(meetingId);
          // Met à jour la card côté liste (status + summary qui peut arriver)
          setMeetings((prev) =>
            prev.map((x) =>
              x.id === meetingId
                ? { ...x, status: m.status as any, summary: m.summary }
                : x,
            ),
          );
          if (m.status === "TRANSCRIBING") {
            setProcessing({ stage: "transcribing", meetingId });
          } else if (m.status === "EXTRACTING") {
            setProcessing({ stage: "extracting", meetingId });
          } else if (m.status === "REVIEW" || m.status === "APPLIED") {
            setProcessing({ stage: "done", meetingId });
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            // Re-fetch la liste pour avoir le résumé final + sélectionne
            const list = await api.listMeetings(group.id);
            setMeetings(list);
            setSelectedId(meetingId);
          } else if (m.status === "FAILED" || m.status === "CANCELLED") {
            setProcessing({
              stage: "failed",
              meetingId,
              message:
                m.errorMessage ||
                t("group.meetings.processingFailed") ||
                "Le traitement IA a échoué.",
            });
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch (e) {
          // Erreur réseau ponctuelle — on continue le polling
          console.warn("[meetings] poll failed", e);
        }
        // Timeout 5 minutes
        if (Date.now() - startedAt > 5 * 60_000 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setProcessing({
            stage: "failed",
            meetingId,
            message:
              t("group.meetings.processingTimeout") ||
              "Le traitement IA prend trop longtemps. Réessaie plus tard.",
          });
        }
      })();
    }, 3000);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setProcessing({ stage: "uploading" });
    try {
      // V215.E2 — `uploadMeeting` exige options.title. Avant V215 on l'appelait
      // sans, donc l'upload jetait silencieusement. Maintenant on construit
      // un title automatique daté.
      const now = new Date();
      const title =
        (t("group.meetings.titlePrefix") || "Réunion du") +
        " " +
        now.toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      const res = await api.uploadMeeting(group.id, file, {
        title,
        occurredAt: now.toISOString(),
        filename: file.name,
      });
      const list = await api.listMeetings(group.id);
      setMeetings(list);
      setSelectedId(res.id);
      // Démarre le polling pour afficher la progression IA en temps réel
      setProcessing({ stage: "transcribing", meetingId: res.id });
      startStatusPolling(res.id, Date.now());
    } catch (e) {
      console.warn("upload meeting failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      setProcessing({
        stage: "failed",
        meetingId: "",
        message: msg || t("group.meetings.uploadFailed") || "Envoi échoué.",
      });
    } finally {
      setUploading(false);
    }
  }

  // V215.A1 — Démarre un VRAI enregistrement audio (micro navigateur).
  async function startRecorder() {
    setRecorderError(null);
    setRecorderOpen(true);
    setElapsedSec(0);
    try {
      const handle = await startVoiceRecording();
      recorderHandleRef.current = handle;
      setRecording(true);
      tickRef.current = setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
    } catch (e) {
      console.warn("start recording failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("MIC_PERMISSION_DENIED") || msg.includes("NotAllowed")) {
        setRecorderError(
          t("group.meetings.micDenied") ||
            "Permission micro refusée. Active-la dans les réglages du navigateur.",
        );
      } else if (msg.includes("VOICE_RECORDING_UNSUPPORTED")) {
        setRecorderError(
          t("group.meetings.micUnsupported") ||
            "Ce navigateur ne supporte pas l'enregistrement direct. Importe un fichier audio.",
        );
      } else {
        setRecorderError(
          t("group.meetings.micError") || "Impossible de démarrer le micro.",
        );
      }
      setRecording(false);
    }
  }

  // Stop + upload du blob enregistré
  async function stopRecorderAndUpload() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const handle = recorderHandleRef.current;
    recorderHandleRef.current = null;
    setRecording(false);
    if (!handle) {
      setRecorderOpen(false);
      return;
    }
    // V215.E2 — Passe immédiatement en mode "uploading" pour donner du
    // feedback visuel pendant que MediaRecorder finalise le blob (peut prendre
    // 200-500ms sur Chrome). Sinon on a l'impression que le bouton ne fait rien.
    setProcessing({ stage: "uploading" });
    try {
      const blob = await handle.stop();
      if (!blob || blob.size === 0) {
        setRecorderError(
          t("group.meetings.recordEmpty") ||
            "Enregistrement vide — réessaie.",
        );
        setProcessing({ stage: "idle" });
        return;
      }
      // Extension cohérente avec le mime pour Whisper backend
      const mime = blob.type || "audio/webm";
      const ext = mime.includes("wav")
        ? "wav"
        : mime.includes("mp4") || mime.includes("m4a")
          ? "m4a"
          : mime.includes("ogg")
            ? "ogg"
            : "webm";
      const filename = `meeting-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
      const file = new File([blob], filename, { type: mime });
      // Ferme la modal recorder, le mode processing prend le relais
      setRecorderOpen(false);
      await handleUpload(file);
    } catch (e) {
      console.warn("stop recording failed", e);
      setRecorderError(
        t("group.meetings.recordError") ||
          "Impossible de finaliser l'enregistrement.",
      );
      setProcessing({ stage: "idle" });
    }
  }

  // Annule sans envoyer
  async function cancelRecorder() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const handle = recorderHandleRef.current;
    recorderHandleRef.current = null;
    if (handle) {
      try {
        await handle.stop();
      } catch {
        /* noop */
      }
    }
    setRecording(false);
    setRecorderOpen(false);
    setRecorderError(null);
    setElapsedSec(0);
  }

  const fmtClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <DesktopGroupSectionShell
      groupId={group.id}
      groupName={group.name}
      sectionLabel={t("group.hub.meetings") || "Réunions"}
      subtitle={`${meetings.length} ${meetings.length > 1 ? "enregistrées" : "enregistrée"}`}
      noPadding
      primaryAction={
        <button
          type="button"
          onClick={() => {
            void startRecorder();
          }}
          disabled={uploading || recorderOpen}
          style={{
            padding: "8px 14px",
            background: "#C58A2E",
            color: "#2B1F15",
            border: "none",
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 500,
            cursor: uploading ? "wait" : "pointer",
            opacity: uploading ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          ⊕ {t("group.meetings.newMeeting") || "Nouvelle réunion"}
        </button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          // Reset value pour qu'on puisse re-sélectionner le même fichier
          if (e.target) e.target.value = "";
        }}
      />

      {/* V215.A1 + E2 — Modal enregistrement audio + suivi progress IA.
          Affichée dès qu'on clique sur « Démarrer une réunion ».
          La même modal reste ouverte pendant le processing IA (upload →
          transcription → extraction) pour afficher les étapes visuellement.
          Filepicker reste accessible via le petit lien en bas. */}
      {(recorderOpen || processing.stage !== "idle") && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("group.meetings.recording") || "Enregistrement"}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43, 31, 21, 0.55)",
            backdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#FAF6EE",
              borderRadius: 20,
              padding: "28px 32px",
              maxWidth: 460,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              border: "0.5px solid #D9C8A6",
              textAlign: "center",
            }}
          >
            {processing.stage === "idle" || processing.stage === "uploading" ? (
              <>
                {/* État ENREGISTREMENT ou UPLOAD intermédiaire */}
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    background:
                      processing.stage === "uploading"
                        ? "#C58A2E"
                        : recording
                          ? "#9F4628"
                          : "#D9C8A6",
                    margin: "0 auto 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    animation:
                      recording && processing.stage !== "uploading"
                        ? "bmdRecPulse 1.4s ease-in-out infinite"
                        : processing.stage === "uploading"
                          ? "bmdRecPulse 0.9s ease-in-out infinite"
                          : undefined,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "#FAF6EE",
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: 32,
                    fontFamily:
                      "var(--bmd-font-num, 'JetBrains Mono', 'SF Mono', monospace)",
                    color: "#2B1F15",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  {fmtClock(elapsedSec)}
                </div>
                <div style={{ fontSize: 12, color: "#8B6F47", marginBottom: 20 }}>
                  {processing.stage === "uploading"
                    ? t("group.meetings.uploading") ||
                      "Envoi de l'enregistrement…"
                    : recording
                      ? t("group.meetings.recording") || "Enregistrement en cours…"
                      : recorderError
                        ? t("common.error") || "Erreur"
                        : t("group.meetings.starting") || "Démarrage du micro…"}
                </div>

                {recorderError && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9F4628",
                      background: "rgba(159, 70, 40, 0.08)",
                      border: "0.5px solid rgba(159, 70, 40, 0.3)",
                      borderRadius: 9,
                      padding: 10,
                      marginBottom: 16,
                      lineHeight: 1.45,
                    }}
                  >
                    {recorderError}
                  </div>
                )}

                {processing.stage !== "uploading" && (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      justifyContent: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    {recording ? (
                      <button
                        type="button"
                        onClick={() => void stopRecorderAndUpload()}
                        style={{
                          padding: "11px 20px",
                          background: "#C58A2E",
                          color: "#2B1F15",
                          border: "none",
                          borderRadius: 11,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        ⏹{" "}
                        {t("group.meetings.stopAndSave") ||
                          "Arrêter et envoyer"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void cancelRecorder()}
                      style={{
                        padding: "11px 20px",
                        background: "transparent",
                        color: "#2B1F15",
                        border: "0.5px solid #D9C8A6",
                        borderRadius: 11,
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {t("common.cancel") || "Annuler"}
                    </button>
                  </div>
                )}

                {processing.stage === "idle" && (
                  <div style={{ marginTop: 18, fontSize: 11, color: "#8B6F47" }}>
                    {t("group.meetings.orPickFile") || "ou"}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        void cancelRecorder();
                        setTimeout(() => fileRef.current?.click(), 50);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "#C58A2E",
                        textDecoration: "underline",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "inherit",
                      }}
                    >
                      {t("group.meetings.importFile") ||
                        "importer un fichier audio"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <ProcessingPanel
                stage={processing.stage}
                errorMessage={
                  processing.stage === "failed" ? processing.message : undefined
                }
                onClose={() => {
                  if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                  }
                  setProcessing({ stage: "idle" });
                  setElapsedSec(0);
                  setRecorderError(null);
                }}
                onSeeMeeting={() => {
                  if (
                    processing.stage === "done" ||
                    processing.stage === "transcribing" ||
                    processing.stage === "extracting"
                  ) {
                    setSelectedId(processing.meetingId);
                  }
                  if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                  }
                  setProcessing({ stage: "idle" });
                  setElapsedSec(0);
                  setRecorderError(null);
                }}
                t={t}
              />
            )}
          </div>
          <style>{`
            @keyframes bmdRecPulse {
              0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(159,70,40,0.55); }
              50% { transform: scale(1.05); box-shadow: 0 0 0 18px rgba(159,70,40,0); }
            }
          `}</style>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 1fr)",
          minHeight: 480,
        }}
      >
        {/* === COL GAUCHE : liste + REC ============================ */}
        <section style={{ padding: "14px 18px", borderRight: "0.5px solid #D9C8A6" }}>
          {/* CTA REC — V215.A1 : démarre un enregistrement audio direct */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!recorderOpen && !uploading) void startRecorder();
            }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !recorderOpen && !uploading) {
                e.preventDefault();
                void startRecorder();
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 14,
              background: "#F4ECD9",
              border: "0.5px solid #D9C8A6",
              borderRadius: 12,
              marginBottom: 16,
              cursor: recorderOpen || uploading ? "default" : "pointer",
              opacity: recorderOpen || uploading ? 0.55 : 1,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "#9F4628",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#FAF6EE",
                }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#2B1F15" }}>
                {uploading
                  ? t("common.loading") + "…"
                  : t("group.meetings.startNew") || "Démarrer une réunion"}
              </div>
              <div style={{ fontSize: 11, color: "#8B6F47", marginTop: 1 }}>
                {t("group.meetings.aiSummary") || "Transcrite + résumée par BMD"}
              </div>
            </div>
          </div>

          {/* Historique */}
          <div
            style={{
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            {t("group.meetings.history") || "historique"}
          </div>
          {meetings.length === 0 ? (
            <div style={{ fontSize: 12, color: "#8B6F47", padding: "20px 8px", textAlign: "center" }}>
              {t("group.meetings.empty") || "Pas encore de réunion"}
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {meetings.map((m) => {
                const isSelected = selectedId === m.id;
                return (
                  <li
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    style={{
                      padding: "9px 11px",
                      background: isSelected ? "#F4E4C1" : "transparent",
                      borderLeft: isSelected ? "3px solid #C58A2E" : "3px solid transparent",
                      borderRadius: 7,
                      marginBottom: 2,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: isSelected ? 500 : 400, color: "#2B1F15" }}>
                      {m.title || t("group.meetings.untitled") || "Réunion sans titre"}
                    </div>
                    <div style={{ fontSize: 10, color: "#8B6F47", marginTop: 1 }}>
                      {formatDuration(m.durationSeconds)} ·{" "}
                      {new Date(m.occurredAt || m.createdAt).toLocaleDateString()}
                      {m.status === "TRANSCRIBING" && " · " + (t("group.meetings.transcribing") || "transcription…")}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* === COL DROITE : détail (V221 refonte complète) ============ */}
        <aside style={{ padding: "18px 22px", overflowY: "auto", maxHeight: "calc(100vh - 140px)" }}>
          {selected ? (
            <MeetingDetailPane
              key={selected.id}
              meetingLight={selected}
              onTitleChanged={(newTitle) => {
                // Met à jour la card côté liste en optimistic
                setMeetings((prev) =>
                  prev.map((m) =>
                    m.id === selected.id ? { ...m, title: newTitle } : m,
                  ),
                );
              }}
              formatDuration={formatDuration}
            />
          ) : (
            <div style={{ color: "#8B6F47", fontSize: 13, padding: 30, textAlign: "center" }}>
              {meetings.length === 0
                ? t("group.meetings.emptyHint") || "Démarre ta première réunion via le bouton à gauche"
                : t("group.meetings.selectOne") || "Sélectionne une réunion à gauche"}
            </div>
          )}
        </aside>
      </div>
    </DesktopGroupSectionShell>
  );
}

// ───────────────────────────────────────────────────────────────────────
// V215.E2 — Panneau de progression IA (3 étapes visuelles + résultat)
// ───────────────────────────────────────────────────────────────────────

function ProcessingPanel({
  stage,
  errorMessage,
  onClose,
  onSeeMeeting,
  t,
}: {
  stage: "transcribing" | "extracting" | "done" | "failed";
  errorMessage?: string;
  onClose: () => void;
  onSeeMeeting: () => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  // 3 étapes principales : upload (déjà passé), transcription, extraction
  const steps: Array<{
    key: "transcribing" | "extracting" | "done";
    label: string;
    desc: string;
  }> = [
    {
      key: "transcribing",
      label:
        t("group.meetings.step1") || "Transcription audio",
      desc:
        t("group.meetings.step1desc") ||
        "Whisper convertit ta voix en texte exact",
    },
    {
      key: "extracting",
      label: t("group.meetings.step2") || "Analyse IA",
      desc:
        t("group.meetings.step2desc") ||
        "Extraction des décisions + rédaction du compte rendu",
    },
    {
      key: "done",
      label: t("group.meetings.step3") || "Compte rendu prêt",
      desc:
        t("group.meetings.step3desc") ||
        "Résumé + transcript disponibles à droite",
    },
  ];

  const stageIdx = stage === "failed" ? -1 : steps.findIndex((s) => s.key === stage);

  return (
    <>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: stage === "failed" ? "#9F4628" : "#C58A2E",
          margin: "0 auto 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#FAF6EE",
          fontSize: 30,
          fontWeight: 600,
        }}
      >
        {stage === "failed" ? "!" : stage === "done" ? "✓" : "↑"}
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: "#2B1F15", marginBottom: 6 }}>
        {stage === "failed"
          ? t("group.meetings.processingFailedTitle") ||
            "Le traitement a échoué"
          : stage === "done"
            ? t("group.meetings.processingDoneTitle") ||
              "Compte rendu prêt !"
            : t("group.meetings.processingTitle") ||
              "Traitement de la réunion…"}
      </div>
      <div style={{ fontSize: 11, color: "#8B6F47", marginBottom: 18 }}>
        {stage === "failed"
          ? errorMessage
          : stage === "done"
            ? t("group.meetings.processingDoneSub") ||
              "Tu peux consulter le résumé + transcript ci-contre."
            : t("group.meetings.processingSub") ||
              "Tu peux fermer cette fenêtre, on continue en tâche de fond."}
      </div>

      {/* Stepper visuel */}
      {stage !== "failed" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            textAlign: "left",
            marginBottom: 18,
          }}
        >
          {steps.map((s, idx) => {
            const isDone = idx < stageIdx || stage === "done";
            const isActive = idx === stageIdx && stage !== "done";
            return (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 10px",
                  background: isActive
                    ? "rgba(197,138,46,0.10)"
                    : isDone
                      ? "rgba(31,122,87,0.06)"
                      : "transparent",
                  borderRadius: 9,
                  border: `0.5px solid ${
                    isActive
                      ? "rgba(197,138,46,0.35)"
                      : isDone
                        ? "rgba(31,122,87,0.25)"
                        : "rgba(139,111,71,0.18)"
                  }`,
                  transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: isDone
                      ? "#1F7A57"
                      : isActive
                        ? "#C58A2E"
                        : "#D9C8A6",
                    color: "#FAF6EE",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {isDone ? "✓" : isActive ? (
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        border: "1.5px solid #FAF6EE",
                        borderTopColor: "transparent",
                        animation: "bmdSpin 0.8s linear infinite",
                      }}
                    />
                  ) : (
                    idx + 1
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      color: "#2B1F15",
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#8B6F47",
                      marginTop: 1,
                      lineHeight: 1.4,
                    }}
                  >
                    {s.desc}
                  </div>
                </div>
              </div>
            );
          })}
          <style>{`@keyframes bmdSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Actions footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {stage === "done" ? (
          <button
            type="button"
            onClick={onSeeMeeting}
            style={{
              padding: "11px 22px",
              background: "#C58A2E",
              color: "#2B1F15",
              border: "none",
              borderRadius: 11,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("group.meetings.seeSummary") || "Voir le compte rendu"}
          </button>
        ) : stage === "failed" ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "11px 22px",
              background: "#C58A2E",
              color: "#2B1F15",
              border: "none",
              borderRadius: 11,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("common.ok") || "OK"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSeeMeeting}
            style={{
              padding: "11px 22px",
              background: "transparent",
              color: "#2B1F15",
              border: "0.5px solid #D9C8A6",
              borderRadius: 11,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("group.meetings.continueInBackground") ||
              "Fermer (continue en arrière-plan)"}
          </button>
        )}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// V221 — Panneau de détail réunion (refonte complète) :
//   - Titre + métadonnées éditables
//   - Lecteur audio fonctionnel
//   - 5 sections (résumé / décisions / next steps / CR détaillé / transcript)
//   - Export PDF + bouton Enregistrer sticky
// ───────────────────────────────────────────────────────────────────────

function MeetingDetailPane({
  meetingLight,
  onTitleChanged,
  formatDuration,
}: {
  meetingLight: Meeting;
  onTitleChanged: (newTitle: string) => void;
  formatDuration: (sec: number | null) => string;
}) {
  const t = useT();
  const toast = useToast();

  // Détail complet (avec transcript / detailedReport / nextSteps / decisions).
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  // États éditables (initialisés depuis le détail au fetch).
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [detailedReportDraft, setDetailedReportDraft] = useState("");
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [nextStepsDraft, setNextStepsDraft] = useState<MeetingNextStep[]>([]);
  // V221 — Les "décisions IA" structurées (EXPENSE/SETTLEMENT/…) ne sont pas
  // éditables ici (faire ça nécessite la modal Apply avec validation Zod
  // stricte côté serveur). Cette colonne expose une liste de notes humaines
  // séparée pour saisir libres décisions. À terme on pourra les pousser
  // dans extractedJson.decisions de type NOTE. Pour la v221 on stocke
  // localement comme texte libre dans `summary` complément si besoin.
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sections collapsibles (CR + Transcript fermées par défaut)
  const [openDetailed, setOpenDetailed] = useState(false);
  const [openTranscript, setOpenTranscript] = useState(false);
  // Export PDF modal
  const [pdfOpen, setPdfOpen] = useState(false);

  // Audio : on fetch via API pour passer le Bearer, puis on fournit un blob URL
  // à <audio>. Toujours revoke le URL au démontage / changement de meeting.
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "ready" | "missing">(
    "idle",
  );
  const audioUrlRef = useRef<string | null>(null);

  // Fetch détail complet quand selected change
  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    void (async () => {
      try {
        const d = await api.getMeeting(meetingLight.id);
        if (cancelled) return;
        setDetail(d);
        setTitleDraft(d.title ?? "");
        setSummaryDraft(d.summary ?? "");
        setDetailedReportDraft(d.detailedReport ?? d.minutes ?? "");
        setTranscriptDraft(d.transcript ?? "");
        setNextStepsDraft(
          Array.isArray(d.nextSteps)
            ? d.nextSteps.map((ns) => ({
                text: ns.text ?? "",
                ownerUserId: ns.ownerUserId ?? null,
                ownerName: ns.ownerName ?? null,
                dueHint: ns.dueHint ?? null,
              }))
            : [],
        );
        setDirty(false);
      } catch (e) {
        if (cancelled) return;
        setDetailError(
          e instanceof Error
            ? e.message
            : t("meetings.processingFailed") || "Impossible de charger le détail.",
        );
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingLight.id]);

  // Fetch audio blob URL séparément (toggle lazy : on ne charge que si l'utilisateur
  // veut écouter). On stocke dans audioUrlRef pour revoke proprement.
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  // À chaque nouveau meeting, on reset l'audio (revoke ancien blob).
  useEffect(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setAudioState("idle");
  }, [meetingLight.id]);

  async function loadAudio() {
    if (audioState === "loading" || audioState === "ready") return;
    setAudioState("loading");
    try {
      const url = await api.getMeetingAudioBlobUrl(meetingLight.id);
      if (url) {
        audioUrlRef.current = url;
        setAudioUrl(url);
        setAudioState("ready");
      } else {
        setAudioState("missing");
      }
    } catch {
      setAudioState("missing");
    }
  }

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  async function handleTitleBlur() {
    const next = titleDraft.trim();
    if (!detail) return;
    if (!next || next === detail.title) {
      setTitleDraft(detail.title ?? "");
      return;
    }
    // Save immédiat au blur du titre (UX : feedback rapide)
    try {
      const updated = await api.updateMeeting(meetingLight.id, { title: next });
      setDetail(updated);
      onTitleChanged(next);
      toast.success(t("meetings.saved") || "Enregistré");
    } catch (e) {
      console.warn("update meeting title failed", e);
      toast.error(e);
      setTitleDraft(detail.title ?? "");
    }
  }

  async function handleSaveAll() {
    if (!detail || saving) return;
    setSaving(true);
    try {
      const updated = await api.updateMeeting(meetingLight.id, {
        // Le titre est déjà sauvegardé au blur ; on l'inclut quand même pour
        // les cas où l'utilisateur tape sans blurrer puis clique "Enregistrer".
        title: titleDraft.trim() || undefined,
        summary: summaryDraft,
        detailedReport: detailedReportDraft,
        transcript: transcriptDraft,
        nextSteps: nextStepsDraft
          .filter((ns) => ns.text.trim().length > 0)
          .map((ns) => ({
            text: ns.text.trim(),
            ownerUserId: ns.ownerUserId ?? null,
            ownerName: ns.ownerName ?? null,
            dueHint: ns.dueHint ?? null,
          })),
      });
      setDetail(updated);
      // Sync les drafts depuis la réponse (le serveur trim/sanitize)
      setTitleDraft(updated.title ?? "");
      setSummaryDraft(updated.summary ?? "");
      setDetailedReportDraft(updated.detailedReport ?? updated.minutes ?? "");
      setTranscriptDraft(updated.transcript ?? "");
      setNextStepsDraft(
        Array.isArray(updated.nextSteps)
          ? updated.nextSteps.map((ns: any) => ({
              text: ns.text ?? "",
              ownerUserId: ns.ownerUserId ?? null,
              ownerName: ns.ownerName ?? null,
              dueHint: ns.dueHint ?? null,
            }))
          : [],
      );
      setDirty(false);
      toast.success(t("meetings.saved") || "Enregistré");
    } catch (e) {
      console.warn("save meeting failed", e);
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  // Helpers next steps inline
  function nsUpdate(idx: number, patch: Partial<MeetingNextStep>) {
    setNextStepsDraft((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
    markDirty();
  }
  function nsRemove(idx: number) {
    setNextStepsDraft((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  }
  function nsAdd() {
    if (nextStepsDraft.length >= 12) return;
    setNextStepsDraft((prev) => [
      ...prev,
      { text: "", ownerUserId: null, ownerName: null, dueHint: null },
    ]);
    markDirty();
  }

  // Helpers décisions structurées : on les affiche en lecture-seule
  // (édition profonde via Apply modal). On compte juste pour info.
  const decisionsCount = Array.isArray(detail?.extractedJson?.decisions)
    ? detail!.extractedJson!.decisions!.length
    : 0;

  const occurredLabel = useMemo(() => {
    if (!detail) return "";
    const d = new Date(detail.occurredAt || detail.createdAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }, [detail]);

  if (loadingDetail) {
    return (
      <div style={{ color: "#8B6F47", fontSize: 13, padding: 30, textAlign: "center" }}>
        {t("common.loading") || "Chargement…"}
      </div>
    );
  }
  if (detailError || !detail) {
    return (
      <div style={{ color: "#9F4628", fontSize: 13, padding: 30, textAlign: "center" }}>
        {detailError || t("common.genericError") || "Une erreur est survenue"}
      </div>
    );
  }

  const readOnly =
    detail.status === "APPLIED" || detail.status === "CANCELLED";

  return (
    <div style={{ paddingBottom: dirty ? 72 : 8 }}>
      {/* HEADER éditable */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => {
            setTitleDraft(e.target.value);
            markDirty();
          }}
          onBlur={() => void handleTitleBlur()}
          disabled={readOnly}
          maxLength={200}
          aria-label={t("meetings.titleLabel") || "Titre de la réunion"}
          placeholder={t("meetings.titlePlaceholder") || "Titre de la réunion"}
          style={{
            width: "100%",
            fontSize: 19,
            fontWeight: 600,
            color: "#2B1F15",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: 8,
            padding: "6px 8px",
            margin: "-6px -8px 0",
            fontFamily: "inherit",
            outline: "none",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.background = "#FFFFFF";
            e.currentTarget.style.borderColor = "#D9C8A6";
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }}
        />
        <div style={{ fontSize: 11, color: "#8B6F47", marginTop: 4 }}>
          {occurredLabel} · {formatDuration(detail.durationSeconds)}
          {detail.createdBy?.displayName ? ` · ${detail.createdBy.displayName}` : ""}
          {detail.manuallyEditedAt && (
            <span style={{ marginLeft: 8, fontStyle: "italic" }}>
              · ✎ {new Date(detail.manuallyEditedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* LECTEUR AUDIO */}
      {!detail.audioPurged ? (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            background: "#FFFFFF",
            border: "0.5px solid #D9C8A6",
            borderRadius: 11,
          }}
        >
          {audioState === "ready" && audioUrl ? (
            <audio
              controls
              preload="metadata"
              src={audioUrl}
              style={{ width: "100%", display: "block" }}
            />
          ) : audioState === "loading" ? (
            <div style={{ fontSize: 12, color: "#8B6F47", padding: 6 }}>
              {t("meetings.audioLoading") || "Préparation du lecteur audio…"}
            </div>
          ) : audioState === "missing" ? (
            <div style={{ fontSize: 12, color: "#9F4628", padding: 6 }}>
              {t("meetings.audioMissing") || "Audio non disponible"}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void loadAudio()}
              style={{
                padding: "8px 14px",
                background: "#C58A2E",
                color: "#2B1F15",
                border: "none",
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ▶ {t("group.meetings.play") || "Lecture"}
            </button>
          )}
        </div>
      ) : null}

      {/* === Partie 1 — Résumé (default open) === */}
      <V221SectionCard
        title={t("meetings.partSummary") || "Partie 1 — Résumé"}
        defaultOpen
      >
        <textarea
          value={summaryDraft}
          onChange={(e) => {
            setSummaryDraft(e.target.value);
            markDirty();
          }}
          disabled={readOnly}
          rows={3}
          maxLength={500}
          placeholder={t("meetings.summaryPlaceholder") || "Résumé en 1-2 phrases…"}
          style={v221TextareaStyle}
        />
      </V221SectionCard>

      {/* === Partie 2 — Décisions (lecture-seule structurées) === */}
      <V221SectionCard
        title={t("meetings.partDecisions") || "Partie 2 — Décisions"}
        badge={decisionsCount > 0 ? `${decisionsCount}` : undefined}
        defaultOpen
      >
        {decisionsCount === 0 ? (
          <div style={{ fontSize: 12, fontStyle: "italic", color: "#8B6F47" }}>
            {t("meetings.noNextSteps") || "Aucune décision détectée par l'IA."}
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {detail.extractedJson?.decisions?.map((d: any, i: number) => (
              <li
                key={i}
                style={{
                  padding: "8px 10px",
                  background: "#FAF6EE",
                  border: "0.5px solid #D9C8A6",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#2B1F15",
                  lineHeight: 1.45,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#854F0B",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginRight: 6,
                    fontWeight: 700,
                  }}
                >
                  {d.kind === "EXPENSE"
                    ? (t("meetings.kind.expense") || "Dépense")
                    : d.kind === "SETTLEMENT"
                      ? (t("meetings.kind.settlement") || "Règlement")
                      : d.kind === "TONTINE_CONTRIBUTION"
                        ? (t("meetings.kind.contribution") || "Cotisation")
                        : (t("meetings.kind.note") || "Note")}
                </span>
                {d.description ||
                  d.text ||
                  (d.amount ? `${d.amount} ${d.currency ?? ""}` : "—")}
              </li>
            ))}
          </ul>
        )}
      </V221SectionCard>

      {/* === Partie 3 — Next Steps === */}
      <V221SectionCard
        title={t("meetings.partNextSteps") || "Partie 3 — Actions à prendre"}
        defaultOpen
      >
        {nextStepsDraft.length === 0 && (
          <div
            style={{
              fontSize: 12,
              fontStyle: "italic",
              color: "#8B6F47",
              marginBottom: 8,
            }}
          >
            {t("meetings.noNextSteps") ||
              "Aucune action à entreprendre. Tu peux en ajouter à la main."}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nextStepsDraft.map((ns, idx) => (
            <div
              key={idx}
              style={{
                padding: 10,
                background: "#FAF6EE",
                border: "0.5px solid #D9C8A6",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={ns.text}
                  onChange={(e) => nsUpdate(idx, { text: e.target.value })}
                  disabled={readOnly}
                  rows={2}
                  maxLength={400}
                  placeholder={t("meetings.nextStepPlaceholder") || "Décris l'action…"}
                  style={{ ...v221TextareaStyle, minHeight: 44, fontSize: 12 }}
                />
                <button
                  type="button"
                  onClick={() => nsRemove(idx)}
                  disabled={readOnly}
                  aria-label={t("meetings.removeDecision") || "Retirer"}
                  style={{
                    background: "transparent",
                    border: "0.5px solid #D9C8A6",
                    color: "#9F4628",
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontSize: 14,
                    cursor: "pointer",
                    flexShrink: 0,
                    fontFamily: "inherit",
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 140px", minWidth: 0 }}>
                  <span style={v221LabelStyle}>
                    {t("meetings.nextStepOwnerLabel") || "Responsable"}
                  </span>
                  <select
                    value={ns.ownerUserId ?? ""}
                    onChange={(e) =>
                      nsUpdate(idx, {
                        ownerUserId: e.target.value || null,
                        ownerName: null,
                      })
                    }
                    disabled={readOnly}
                    style={v221InputStyle}
                  >
                    <option value="">—</option>
                    {detail.group.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user?.displayName ?? m.userId}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: "1 1 140px", minWidth: 0 }}>
                  <span style={v221LabelStyle}>
                    {t("meetings.nextStepDueLabel") || "Échéance"}
                  </span>
                  <input
                    type="text"
                    value={ns.dueHint ?? ""}
                    onChange={(e) =>
                      nsUpdate(idx, { dueHint: e.target.value || null })
                    }
                    disabled={readOnly}
                    maxLength={160}
                    placeholder={
                      t("meetings.nextStepDuePlaceholder") || "Ex. avant fin du mois"
                    }
                    style={v221InputStyle}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        {!readOnly && nextStepsDraft.length < 12 && (
          <button
            type="button"
            onClick={nsAdd}
            style={{
              marginTop: 8,
              padding: "7px 14px",
              background: "transparent",
              border: "1px dashed #C58A2E",
              color: "#854F0B",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + {t("meetings.nextStepAdd") || "Ajouter une action"}
          </button>
        )}
      </V221SectionCard>

      {/* === Partie 4 — Compte rendu détaillé (collapsible) === */}
      <V221SectionCard
        title={t("meetings.partDetailed") || "Partie 4 — Compte rendu détaillé"}
        collapsible
        open={openDetailed}
        onToggle={() => setOpenDetailed((v) => !v)}
      >
        <textarea
          value={detailedReportDraft}
          onChange={(e) => {
            setDetailedReportDraft(e.target.value);
            markDirty();
          }}
          disabled={readOnly}
          rows={10}
          maxLength={20000}
          placeholder={
            t("meetings.detailedReportPlaceholder") ||
            "Compte rendu détaillé des discussions…"
          }
          style={{ ...v221TextareaStyle, minHeight: 200, fontSize: 13, lineHeight: 1.55 }}
        />
      </V221SectionCard>

      {/* === Partie 5 — Transcription (collapsible) === */}
      <V221SectionCard
        title={t("meetings.partTranscript") || "Partie 5 — Transcription complète"}
        collapsible
        open={openTranscript}
        onToggle={() => setOpenTranscript((v) => !v)}
      >
        <div
          style={{
            fontSize: 11,
            color: "#9F4628",
            background: "rgba(159,70,40,0.07)",
            border: "0.5px solid rgba(159,70,40,0.25)",
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 8,
          }}
        >
          ⚠ {t("meetings.transcriptWarning") ||
            "Transcription verbatim — modifie avec prudence."}
        </div>
        <textarea
          value={transcriptDraft}
          onChange={(e) => {
            setTranscriptDraft(e.target.value);
            markDirty();
          }}
          disabled={readOnly}
          rows={12}
          maxLength={200000}
          placeholder={t("meetings.transcriptPlaceholder") || "Transcription Whisper…"}
          style={{
            ...v221TextareaStyle,
            minHeight: 220,
            fontSize: 12,
            fontFamily: "var(--bmd-font-mono, 'JetBrains Mono', 'SF Mono', monospace)",
            lineHeight: 1.5,
          }}
        />
      </V221SectionCard>

      {/* Bouton Export PDF (toujours visible) */}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setPdfOpen(true)}
          style={{
            padding: "9px 14px",
            background: "transparent",
            color: "#2B1F15",
            border: "0.5px solid #D9C8A6",
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          📄 {t("meetings.exportPdf") || "Exporter en PDF"}
        </button>
      </div>

      {/* Barre sticky "Enregistrer" si dirty */}
      {dirty && !readOnly && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            left: 0,
            right: 0,
            marginTop: 12,
            padding: "10px 12px",
            background: "rgba(250,246,238,0.96)",
            backdropFilter: "blur(8px)",
            borderTop: "0.5px solid #D9C8A6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 12, color: "#854F0B", fontWeight: 600 }}>
            {t("meetings.unsavedChanges") || "Modifications non enregistrées"}
          </div>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={saving}
            style={{
              padding: "10px 18px",
              background:
                "linear-gradient(135deg, #C58A2E, #854F0B)",
              color: "#FBF6EC",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit",
              boxShadow: "0 4px 12px -4px rgba(133,79,11,0.45)",
            }}
          >
            {saving ? "…" : t("meetings.saveChanges") || "Enregistrer les modifications"}
          </button>
        </div>
      )}

      {/* Modal export PDF (existant V162) */}
      <MeetingPdfExportSheet
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        meetingId={meetingLight.id}
        meetingTitle={detail.title ?? meetingLight.title ?? "reunion"}
        available={{
          summary: Boolean((summaryDraft || detail.summary || "").trim()),
          decisions: decisionsCount > 0,
          nextSteps: nextStepsDraft.some((ns) => ns.text.trim().length > 0),
          minutes: Boolean((detailedReportDraft || detail.detailedReport || detail.minutes || "").trim()),
          transcript: Boolean((transcriptDraft || detail.transcript || "").trim()),
        }}
      />
    </div>
  );
}

// ─── V221 — Styles utilitaires panneau détail ────────────────────────────
const v221TextareaStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "0.5px solid #D9C8A6",
  background: "#FFFFFF",
  color: "#2B1F15",
  fontSize: 13,
  lineHeight: 1.55,
  resize: "vertical" as const,
  fontFamily: "inherit",
  minHeight: 60,
  outline: "none",
  boxSizing: "border-box" as const,
};

const v221InputStyle = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "0.5px solid #D9C8A6",
  background: "#FFFFFF",
  color: "#2B1F15",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box" as const,
};

const v221LabelStyle = {
  display: "block",
  fontSize: 10,
  color: "#8B6F47",
  textTransform: "uppercase" as const,
  letterSpacing: "0.07em",
  marginBottom: 3,
  fontWeight: 600,
};

// SectionCard V45-light : ivoire, bordure subtile, titre eyebrow.
function V221SectionCard({
  title,
  badge,
  defaultOpen,
  collapsible,
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const isOpen = collapsible ? Boolean(open) : defaultOpen !== false;
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #D9C8A6",
        borderRadius: 11,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <div
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onClick={collapsible ? onToggle : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle?.();
                }
              }
            : undefined
        }
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: isOpen ? 10 : 0,
          cursor: collapsible ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#8B6F47",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {collapsible && (
            <span
              aria-hidden
              style={{
                display: "inline-block",
                transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
                fontSize: 10,
                color: "#854F0B",
              }}
            >
              ▶
            </span>
          )}
          {title}
          {badge ? (
            <span
              style={{
                marginLeft: 4,
                padding: "1px 6px",
                background: "#F4E4C1",
                color: "#854F0B",
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: "normal",
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  );
}
