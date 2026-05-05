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

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedBy: { id: string; displayName: string };
  createdAt: string;
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

  async function handleUpload(file: File) {
    // Pré-validation côté client (UX rapide)
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Fichier trop gros (max ${MAX_SIZE_MB} Mo)`);
      return;
    }
    setUploading(true);
    try {
      await api.uploadAttachment(expenseId, file);
      toast.success(`« ${file.name} » ajouté`);
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(att: Attachment) {
    if (!window.confirm(`Supprimer « ${att.fileName} » ?`)) return;
    try {
      await api.deleteAttachment(att.id);
      toast.success("Pièce jointe supprimée");
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

      {!loading && items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            gap: 8,
          }}
        >
          {items.map((a) => (
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
