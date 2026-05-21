"use client";

/**
 * V80.3 — Lightbox viewer pour ouvrir un attachment de la galerie preuves.
 *
 * Le backend ne renvoie PAS une URL directe pour les attachments (sécurité :
 * il faut un Bearer token pour télécharger). Donc on fetch le blob via
 * `api.fetchAttachmentBlob(id)` puis on crée une object URL locale via
 * `URL.createObjectURL()` qui se passe d'auth.
 *
 * Le viewer affiche correctement chaque type :
 *   - image/* → <img> plein écran, pinch-to-zoom natif
 *   - audio/* → <audio controls> + transcript si dispo
 *   - application/pdf → <iframe> plein écran
 *   - autres → CTA "Télécharger"
 *
 * Style V45-light : overlay cocoa 88% + card paper + close button rond.
 * Portalisé sur document.body pour échapper aux contextes overflow/transform.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api-client";
import { Icon } from "./icons";
import { useT } from "../i18n/app-strings";

export interface ViewerAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  kind?: "RECEIPT" | "PHOTO" | "AUDIO_PROOF" | "DOCUMENT" | "PDF" | "OTHER";
  amount?: string | null;
  currency?: string | null;
  description?: string | null;
  transcript?: string | null;
}

export interface MobileAttachmentViewerProps {
  attachment: ViewerAttachment | null;
  onClose: () => void;
}

type ViewerState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; blobUrl: string }
  | { phase: "error"; message: string };

function classify(mime: string): "image" | "audio" | "pdf" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

export function MobileAttachmentViewer({
  attachment,
  onClose,
}: MobileAttachmentViewerProps) {
  const t = useT();
  const [state, setState] = useState<ViewerState>({ phase: "idle" });
  const [portalReady, setPortalReady] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  // Mount portal flag
  useEffect(() => {
    setPortalReady(true);
  }, []);

  // V84.1 — Fix crash "Maximum update depth exceeded" sur Capacitor mobile.
  //
  // Cause racine : `useT()` retourne une nouvelle fonction à CHAQUE render
  // (cf. apps/web/lib/i18n/app-strings.ts ligne 141, pas de useCallback).
  // Et `attachment` est un nouvel objet à chaque setSelected du parent.
  // Avoir `[attachment, t]` en deps faisait :
  //   1. setState({ phase: "loading" }) → re-render
  //   2. `t` change (nouvelle ref) → useEffect re-run
  //   3. setState({ phase: "loading" }) → re-render → ∞
  // → React explose au 50e cycle.
  //
  // Fix : on dépend uniquement de `attachment?.id` (vraie identité métier),
  // et on capture les messages fallback en dehors de la closure des deps
  // (ils sont évalués au moment du catch, pas à la création de l'effet).
  const loadErrorFallback = t("viewer.loadError") || "Chargement impossible";

  // Fetch blob quand un attachment est sélectionné
  useEffect(() => {
    if (!attachment) {
      setState({ phase: "idle" });
      return;
    }
    let cancelled = false;
    setState({ phase: "loading" });
    // V80.5 — Diagnostic complet : on log en console + on remonte le code
    // HTTP réel pour aider à comprendre pourquoi un attachment ne s'ouvre pas
    // (401 = token expiré, 403 = pas membre du groupe, 404 = fichier disparu,
    // 500 = erreur serveur, 0 = network/CORS Capacitor).
    // V181 — Logs conditionnés au dev (économise CPU + IO + bruit Sentry en prod).
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[viewer] fetching attachment", attachment.id, attachment.mimeType);
    }
    api
      .fetchAttachmentBlob(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log("[viewer] blob ready", blob.type, blob.size, "bytes");
        }
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setState({ phase: "ready", blobUrl: url });
      })
      .catch((e: any) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[viewer] fetch failed", e);
        const status = e?.statusCode ?? e?.status ?? null;
        const code = e?.code ?? null;
        const detail = status
          ? `HTTP ${status}${code ? ` · ${code}` : ""}`
          : (e?.message || loadErrorFallback);
        setState({
          phase: "error",
          message: detail,
        });
      });
    return () => {
      cancelled = true;
      // Revoke l'object URL pour ne pas leak la mémoire
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
    // V84.1 — Dependencies réduites à `attachment?.id` : identité métier
    // stable (ne change que sur une vraie nouvelle sélection). loadErrorFallback
    // est volontairement omis (string stable au sein d'une locale, et même s'il
    // changeait, on ne veut pas re-fetch pour ça).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.id]);

  // Escape pour fermer (desktop)
  useEffect(() => {
    if (!attachment) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // V84.1 — `attachment?.id` au lieu de l'objet entier : stabilité d'identité
    // pour ne pas re-attacher le listener à chaque render. onClose vient du
    // parent — si non memoizé là-bas il provoquera juste un remount du listener
    // (non-bloquant, contrairement au crash setState ci-dessus).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.id, onClose]);

  if (!attachment || !portalReady || typeof document === "undefined") {
    return null;
  }

  const variant = classify(attachment.mimeType);

  function handleDownload() {
    if (state.phase !== "ready") return;
    const a = document.createElement("a");
    a.href = state.blobUrl;
    a.download = attachment!.fileName || "attachment";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.fileName}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        // V82.1 — Bump du z-index à 9999 pour passer AU-DESSUS du
        // bottom-nav fixe (z=120), du header fixed (z=150) et de tout
        // overlay BottomSheet (z=200). Sans ça, le viewer pouvait être
        // masqué par un header transparent au-dessus → impression "ne
        // s'ouvre pas" alors qu'il était simplement caché derrière.
        zIndex: 9999,
        background: "rgba(43,31,21,0.88)",
        display: "flex",
        flexDirection: "column",
        animation: "bmd-viewer-fade 200ms ease-out",
      }}
    >
      {/* HEADER : nom fichier + close */}
      <header
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding:
            "calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px",
          color: "var(--paper, #FFFFFF)",
          background:
            "linear-gradient(180deg, rgba(43,31,21,0.6) 0%, transparent 100%)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close") || "Fermer"}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.30)",
            color: "var(--paper, #FFFFFF)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={18} strokeWidth={2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {attachment.description || attachment.fileName}
          </div>
          {attachment.amount && attachment.currency && (
            <div
              style={{
                fontSize: 11.5,
                opacity: 0.85,
                marginTop: 2,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {attachment.amount} {attachment.currency}
            </div>
          )}
        </div>
        {state.phase === "ready" && (
          <button
            type="button"
            onClick={handleDownload}
            aria-label={t("viewer.download") || "Télécharger"}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.30)",
              color: "var(--paper, #FFFFFF)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              flexShrink: 0,
            }}
          >
            <Icon name="file-text" size={18} strokeWidth={1.9} />
          </button>
        )}
      </header>

      {/* CONTENU CENTRÉ */}
      <main
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 16px 24px",
          overflow: "auto",
          minHeight: 0,
        }}
      >
        {state.phase === "loading" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              color: "var(--paper, #FFFFFF)",
              opacity: 0.85,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: "3px solid rgba(255,255,255,0.20)",
                borderTopColor: "var(--v45-saffron, #C58A2E)",
                animation: "bmd-viewer-spin 0.9s linear infinite",
              }}
            />
            <div style={{ fontSize: 13 }}>
              {t("viewer.loading") || "Chargement…"}
            </div>
          </div>
        )}

        {state.phase === "error" && (
          <div
            style={{
              padding: 24,
              maxWidth: 320,
              textAlign: "center",
              background: "var(--paper, #FFFFFF)",
              color: "var(--cocoa, #2B1F15)",
              borderRadius: 14,
              boxShadow: "0 10px 32px rgba(0,0,0,0.32)",
            }}
          >
            <div
              style={{
                color: "var(--v45-terracotta, #9F4628)",
                display: "flex",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <Icon name="alert-triangle" size={28} strokeWidth={1.8} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
              {t("viewer.errorTitle") || "Impossible d'ouvrir"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--cocoa-soft, #6B5B47)" }}>
              {state.message}
            </div>
          </div>
        )}

        {state.phase === "ready" && variant === "image" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={state.blobUrl}
            alt={attachment.description || attachment.fileName}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          />
        )}

        {state.phase === "ready" && variant === "audio" && (
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              padding: 20,
              background: "var(--paper, #FFFFFF)",
              borderRadius: 16,
              boxShadow: "0 12px 36px rgba(0,0,0,0.32)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "var(--v45-indigo, #4458B5)",
              }}
            >
              <Icon name="mic" size={22} strokeWidth={1.8} />
              <span
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--cocoa, #2B1F15)",
                }}
              >
                {t("viewer.audioProof") || "Preuve audio"}
              </span>
            </div>
            <audio
              src={state.blobUrl}
              controls
              autoPlay={false}
              preload="metadata"
              style={{ width: "100%" }}
            />
            {attachment.transcript && (
              <div
                style={{
                  padding: 12,
                  background: "var(--ivory, #FBF6EC)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "var(--cocoa, #2B1F15)",
                  lineHeight: 1.5,
                  maxHeight: 200,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "var(--cocoa-mute, #A99580)",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  {t("viewer.transcript") || "Transcription"}
                </div>
                {attachment.transcript}
              </div>
            )}
          </div>
        )}

        {state.phase === "ready" && variant === "pdf" && (
          <iframe
            title={attachment.fileName}
            src={state.blobUrl}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 480,
              border: "none",
              borderRadius: 8,
              background: "var(--paper, #FFFFFF)",
            }}
          />
        )}

        {state.phase === "ready" && variant === "other" && (
          <div
            style={{
              padding: 24,
              maxWidth: 320,
              textAlign: "center",
              background: "var(--paper, #FFFFFF)",
              color: "var(--cocoa, #2B1F15)",
              borderRadius: 14,
              boxShadow: "0 10px 32px rgba(0,0,0,0.32)",
            }}
          >
            <div
              style={{
                color: "var(--v45-saffron, #C58A2E)",
                display: "flex",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <Icon name="file-text" size={32} strokeWidth={1.6} />
            </div>
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontWeight: 700,
                fontSize: 16,
                marginBottom: 6,
              }}
            >
              {attachment.fileName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--cocoa-soft, #6B5B47)",
                marginBottom: 14,
              }}
            >
              {t("viewer.previewUnavailable") ||
                "Ce format ne peut pas être prévisualisé."}
            </div>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                color: "var(--paper, #FFFFFF)",
                border: "none",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("viewer.download") || "Télécharger"}
            </button>
          </div>
        )}
      </main>

      <style jsx>{`
        @keyframes bmd-viewer-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes bmd-viewer-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
