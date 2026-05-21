"use client";

/**
 * Composant pièces jointes pour une dépense.
 *
 * Logique d'affichage :
 *  - Tous les membres VOIENT et TÉLÉCHARGENT (transparence)
 *  - Seuls le payeur ou un admin du groupe peuvent UPLOAD/SUPPRIMER
 *  - Les images sont prévisualisées (blob via auth)
 *  - Les autres types (PDF, Office) ont une icône générique avec lien download
 *
 * Note technique : les <img src="..."> ne peuvent pas envoyer de header
 * Authorization. On charge donc le binaire en blob via fetch puis on crée
 * une URL d'objet locale. Ces URLs sont libérées au unmount pour éviter les
 * fuites mémoire.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedBy: { id: string; displayName: string };
  createdAt: string;
  // Sprint AC-2 — distinguer un ticket d'une preuve audio de marché
  kind?: "RECEIPT" | "PHOTO" | "AUDIO_PROOF" | "DOCUMENT";
  transcript?: string | null;
  transcriptLanguage?: string | null;
}

interface Props {
  expenseId: string;
  /** True si l'utilisateur peut UPLOAD/SUPPRIMER (créateur ou admin du groupe). */
  canManage: boolean;
  /** Callback optionnel après changement (pour rafraîchir le parent). */
  onChange?: () => void;
}

const MAX_SIZE_MB = 10;

function fileIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼";
  if (mime.startsWith("audio/")) return "🎙️";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "📊";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  return "📎";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function ExpenseAttachments({
  expenseId,
  canManage,
  onChange,
}: Props): JSX.Element {
  const toast = useToast();
  const dialog = useDialog();
  const t = useT();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  // Map id → blob URL pour preview images
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const list = await api.listAttachments(expenseId);
      setItems(list);
      // Pré-charge les previews d'images en blob
      const newPreviews: Record<string, string> = {};
      await Promise.all(
        list
          .filter((a) => a.mimeType.startsWith("image/"))
          .map(async (a) => {
            try {
              const blob = await api.fetchAttachmentBlob(a.id);
              newPreviews[a.id] = URL.createObjectURL(blob);
            } catch {
              /* on ignore : on affichera juste l'icône */
            }
          }),
      );
      setPreviews((p) => {
        // Libère les anciennes URLs avant remplacement
        Object.values(p).forEach((url) => URL.revokeObjectURL(url));
        return newPreviews;
      });
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Cleanup au unmount (libération des blob URLs)
  useEffect(() => {
    void load();
    return () => {
      Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  async function handleUpload(
    file: File,
    kind?: "RECEIPT" | "PHOTO" | "AUDIO_PROOF" | "DOCUMENT",
  ) {
    // Pré-validation côté client (UX rapide)
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(t("expense.fileTooLarge", { max: String(MAX_SIZE_MB) }));
      return;
    }
    setUploading(true);
    try {
      await api.uploadAttachment(expenseId, file, { kind });
      toast.success(t("expense.attachmentAdded", { filename: file.name }));
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Sprint AC-2 — Audio Proof of Expense.
  // Cas d'usage : marché en Afrique, pas de ticket. L'utilisateur enregistre
  // la voix du vendeur ("Bonjour, c'est 5000 FCFA pour 3 kg de manioc"). On
  // stocke l'audio comme preuve + Whisper transcrit en texte (recherchable).
  // Sprint AC-3 — hard cap 5 min (audioProofMaxSeconds du plan, défaut 300s)
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const audioTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [audioElapsed, setAudioElapsed] = useState(0);
  const AUDIO_PROOF_MAX_SECONDS = 300; // 5 min — défaut plan

  async function startAudioProof() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(t("expense.audioBrowserUnsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // mime auto-négocié (Safari = audio/mp4, Chrome/Firefox = audio/webm)
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
      ];
      const mime =
        candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        // Coupe les pistes du micro (relâche l'indicateur 🔴 du navigateur)
        stream.getTracks().forEach((t) => t.stop());
        if (audioTickRef.current) {
          clearInterval(audioTickRef.current);
          audioTickRef.current = null;
        }
        setAudioElapsed(0);
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const ext = (recorder.mimeType || "audio/webm")
          .split("/")[1]!
          .split(";")[0]!;
        const filename = `preuve-marche-${Date.now()}.${ext}`;
        const file = new File([blob], filename, { type: blob.type });
        void handleUpload(file, "AUDIO_PROOF");
      };
      recorder.start();
      audioRecorderRef.current = recorder;
      setRecording(true);
      // Sprint AC-3 — Auto-stop à 5 min hard cap, avec compte à rebours visible
      const startedAt = Date.now();
      setAudioElapsed(0);
      audioTickRef.current = setInterval(() => {
        const e = Math.floor((Date.now() - startedAt) / 1000);
        setAudioElapsed(e);
        if (e >= AUDIO_PROOF_MAX_SECONDS) {
          if (audioTickRef.current) {
            clearInterval(audioTickRef.current);
            audioTickRef.current = null;
          }
          stopAudioProof();
        }
      }, 1000);
    } catch (e) {
      toast.error(
        t("expense.microphonePermissionDenied"),
      );
      // eslint-disable-next-line no-console
      console.warn("[audio-proof] getUserMedia failed:", e);
    }
  }

  function stopAudioProof() {
    const r = audioRecorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    audioRecorderRef.current = null;
    setRecording(false);
  }

  async function handleDelete(att: Attachment) {
    if (
      !(await dialog.confirm(`Supprimer « ${att.fileName} » ?`, {
        variant: "danger",
        title: "Supprimer la pièce jointe",
        confirmLabel: "Supprimer",
      }))
    )
      return;
    try {
      await api.deleteAttachment(att.id);
      toast.success(t("expense.attachmentDeleted"));
      // Libère le preview avant rechargement
      if (previews[att.id]) {
        URL.revokeObjectURL(previews[att.id]);
      }
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleView(att: Attachment) {
    // Pour les images : ouvre le preview (déjà chargé)
    // Pour les autres : télécharge via blob (auth header) puis ouvre l'URL
    try {
      const blob = await api.fetchAttachmentBlob(att.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Pas de revoke immédiat : on laisse le browser gérer après ouverture
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>📎 Justificatifs ({items.length})</strong>
        {canManage && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
              style={{ display: "none" }}
              id={`file-input-${expenseId}`}
            />
            <label
              htmlFor={`file-input-${expenseId}`}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                border: "1px dashed var(--saffron, #E8A33D)",
                borderRadius: 6,
                cursor: uploading ? "wait" : "pointer",
                color: "var(--saffron, #E8A33D)",
                opacity: uploading ? 0.5 : 1,
              }}
            >
              {uploading ? "⏳ Upload…" : "＋ Ajouter"}
            </label>
            {/* Sprint AC-2 — Preuve audio (cas marché Afrique). Bouton mobile-first
                avec tap-target ≥ 36px pour le pouce. */}
            <button
              type="button"
              onClick={() => (recording ? stopAudioProof() : startAudioProof())}
              disabled={uploading}
              aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer une preuve audio"}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                border: `1px ${recording ? "solid" : "dashed"} ${recording ? "#dc2626" : "var(--saffron, #E8A33D)"}`,
                borderRadius: 6,
                background: recording ? "rgba(220, 38, 38, 0.12)" : "transparent",
                color: recording ? "#dc2626" : "var(--saffron, #E8A33D)",
                cursor: uploading ? "wait" : "pointer",
                opacity: uploading ? 0.5 : 1,
                minHeight: 32,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title={t("expense.audioProofTooltip")}
            >
              {recording
                ? `⏹ ${Math.floor(audioElapsed / 60)}:${(audioElapsed % 60).toString().padStart(2, "0")} / 5:00`
                : "🎙️ Audio"}
            </button>
          </>
        )}
      </div>

      {loading && (
        <p style={{ fontSize: 12, color: "#6b7280" }}>Chargement…</p>
      )}

      {!loading && items.length === 0 && (
        <p
          style={{
            fontSize: 11,
            color: "#6b7280",
            fontStyle: "italic",
          }}
        >
          Aucun justificatif. {canManage && "Ajoute une photo, un PDF…"}
        </p>
      )}

      {/* Sprint AC-2 — Affiche d'abord les preuves audio en pleine largeur
          (lecteur natif + transcript). Les tickets/photos restent dans la
          grille en dessous. */}
      {!loading &&
        items
          .filter((a) => a.kind === "AUDIO_PROOF" || a.mimeType.startsWith("audio/"))
          .map((a) => (
            <AudioProofRow
              key={a.id}
              attachment={a}
              canManage={canManage}
              onDelete={() => handleDelete(a)}
            />
          ))}

      {!loading && items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            gap: 8,
          }}
        >
          {items
            .filter((a) => !(a.kind === "AUDIO_PROOF" || a.mimeType.startsWith("audio/")))
            .map((a) => (
            <div
              key={a.id}
              style={{
                border: "1px solid var(--line-soft, #e5e7eb)",
                borderRadius: 8,
                overflow: "hidden",
                position: "relative",
                aspectRatio: "1 / 1.2",
                background: "var(--overlay, rgba(255,255,255,0.04))",
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
              }}
              title={`${a.fileName} (${formatSize(a.sizeBytes)}) · par ${a.uploadedBy.displayName}`}
              onClick={() => handleView(a)}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  color: "var(--saffron, #E8A33D)",
                  background: previews[a.id] ? "transparent" : "rgba(0,0,0,0.05)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {previews[a.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[a.id]}
                    alt={a.fileName}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  fileIcon(a.mimeType)
                )}
              </div>
              <div
                style={{
                  padding: "4px 6px",
                  fontSize: 9,
                  background: "rgba(0,0,0,0.4)",
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {a.fileName}
              </div>
              {canManage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(a);
                  }}
                  aria-label="Supprimer"
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    background: "rgba(0,0,0,0.5)",
                    border: "none",
                    color: "#fff",
                    width: 22,
                    height: 22,
                    minHeight: 22,
                    minWidth: 22,
                    borderRadius: 11,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sprint AC-2 — Affiche une preuve audio (lecteur natif + transcription
 * Whisper). Le lecteur charge le blob via fetch authentifié, comme les
 * previews d'image, parce que <audio src="..."> ne peut pas envoyer le
 * header Authorization.
 */
function AudioProofRow({
  attachment,
  canManage,
  onDelete,
}: {
  attachment: Attachment;
  canManage: boolean;
  onDelete: () => void;
}): JSX.Element {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setLoadingAudio(true);
    api
      .fetchAttachmentBlob(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setAudioUrl(url);
      })
      .catch(() => {
        /* erreur silencieuse — on affichera quand même la transcription si dispo */
      })
      .finally(() => {
        if (!cancelled) setLoadingAudio(false);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id]);

  return (
    <div
      style={{
        border: "1px solid var(--line-soft, #e5e7eb)",
        borderLeft: "3px solid var(--saffron, #E8A33D)",
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
        background: "var(--overlay, rgba(255,255,255,0.04))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ fontSize: 16 }}>🎙️</span>
          <strong>Preuve audio</strong>
          <span style={{ color: "#6b7280", fontSize: 11 }}>
            par {attachment.uploadedBy.displayName}
          </span>
        </div>
        {canManage && (
          <button
            onClick={onDelete}
            aria-label="Supprimer la preuve audio"
            style={{
              background: "transparent",
              border: "1px solid #dc2626",
              color: "#dc2626",
              borderRadius: 6,
              fontSize: 11,
              padding: "2px 8px",
              cursor: "pointer",
              minHeight: 24,
            }}
          >
            ×
          </button>
        )}
      </div>
      {loadingAudio && (
        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
          Chargement de l'audio…
        </p>
      )}
      {audioUrl && (
        <audio
          controls
          src={audioUrl}
          style={{ width: "100%", maxWidth: 480, marginBottom: 6 }}
        />
      )}
      {attachment.transcript ? (
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 11,
              color: "var(--saffron, #E8A33D)",
              userSelect: "none",
            }}
          >
            📝 Transcription{" "}
            {attachment.transcriptLanguage
              ? `(${attachment.transcriptLanguage})`
              : ""}
          </summary>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-strong, #1f2937)",
              whiteSpace: "pre-wrap",
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed var(--line-soft, #e5e7eb)",
            }}
          >
            {attachment.transcript}
          </p>
        </details>
      ) : (
        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
          Transcription en cours… (recharge la page dans quelques secondes)
        </p>
      )}
    </div>
  );
}
