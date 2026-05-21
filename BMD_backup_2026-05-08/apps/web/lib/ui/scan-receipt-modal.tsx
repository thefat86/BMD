"use client";

/**
 * Modal de scan de ticket — UX "vraie app IA".
 *
 * Inspiré directement de la maquette BMD_maquettes.html, écran "03 · Scan IA
 * d'un ticket" :
 *  - Header : "Étape 1/3 · Scanner le ticket" + bouton ✕
 *  - Frame de scan : bordure pointillée saffron + pattern hachuré + ligne de
 *    scan animée (laser horizontal qui descend/monte) + SVG ticket décoratif
 *  - Bulle IA : "⬡ IA · Reconnaissance" + résumé en langage naturel
 *  - Liste des lignes détectées avec montants alignés à droite
 *  - CTA primary "✓ Confirmer & Utiliser"
 *
 * Flow :
 *  1. Ouvert par le bouton "📷 Scanner ticket"
 *  2. Étape 1 : choix de la source (caméra / fichier / PDF) ou upload direct
 *  3. Étape 2 : preview avec frame animé pendant l'analyse
 *  4. Étape 3 : résultat IA (bulle + lignes) avec bouton de confirmation
 *  5. Au confirmer : on appelle le callback parent avec le ParsedReceipt
 *
 * Props :
 *  - open : booléen contrôlé par le parent
 *  - onClose : ferme le modal sans appliquer
 *  - onConfirm : appelé avec le résultat OCR si l'utilisateur confirme
 *  - onScan : reçoit le File et retourne le ParsedReceipt (le parent contient
 *    déjà la fonction api.scanReceipt — on l'injecte ici pour découpler)
 */
import { useEffect, useRef, useState } from "react";
import { useToast } from "./toast";

export interface ParsedReceipt {
  merchant: string | null;
  amount: string | null;
  currency: string;
  date: string | null;
  category: string | null;
  confidence: number;
  rawText: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: ParsedReceipt) => void;
  scanFn: (file: File) => Promise<ParsedReceipt>;
}

type Step = "choose" | "scanning" | "result";

export function ScanReceiptModal({
  open,
  onClose,
  onConfirm,
  scanFn,
}: Props): JSX.Element | null {
  const toast = useToast();
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParsedReceipt | null>(null);
  // Preview de l'image (URL.createObjectURL, libérée à la fermeture)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Drag & drop highlight state (spec §8.3 : zone surlignée pendant un drag)
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      // Reset à la fermeture
      setStep("choose");
      setFile(null);
      setResult(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleFileSelected(f: File) {
    setFile(f);
    // Preview uniquement pour les images (pas les PDF)
    if (f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    }
    setStep("scanning");
    try {
      const r = await scanFn(f);
      setResult(r);
      setStep("result");
    } catch (e) {
      toast.error(e);
      setStep("choose");
      setFile(null);
    }
  }

  function handleConfirm() {
    if (result) onConfirm(result);
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* Animation de la ligne de scan : descend en boucle */}
      <style jsx>{`
        @keyframes bmd-scan-loop {
          0% {
            top: 8%;
            opacity: 0.2;
          }
          50% {
            opacity: 1;
          }
          100% {
            top: 88%;
            opacity: 0.2;
          }
        }
        .bmd-scan-line {
          animation: bmd-scan-loop 1.6s ease-in-out infinite;
        }
        @keyframes bmd-pulse-tag {
          0%,
          100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }
        .bmd-ai-tag {
          animation: bmd-pulse-tag 1.5s ease-in-out infinite;
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-modal-title"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(14,11,20,0.85)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 9990,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "calc(env(safe-area-inset-top, 0) + 16px) 16px calc(env(safe-area-inset-bottom, 0) + 16px)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(180deg, #16111E 0%, #1F1429 100%)",
            border: "1px solid rgba(232,163,61,0.18)",
            borderRadius: 24,
            width: "100%",
            maxWidth: 480,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            color: "#F4E4C1",
            fontFamily:
              "'Inter', system-ui, -apple-system, sans-serif",
            maxHeight: "calc(100dvh - 32px)",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(232,163,61,0.05)",
          }}
        >
          {/* Header avec étape + close */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "#8A7B6B",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Étape{" "}
                {step === "choose" ? "1" : step === "scanning" ? "2" : "3"} / 3
              </div>
              <h2
                id="scan-modal-title"
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#F4E4C1",
                  margin: 0,
                  marginTop: 2,
                }}
              >
                {step === "choose"
                  ? "Scanner le ticket"
                  : step === "scanning"
                    ? "Analyse en cours…"
                    : "Reconnaissance terminée"}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{
                width: 36,
                height: 36,
                minHeight: 36,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #E8A33D, #C9A24A)",
                color: "#16111E",
                border: "none",
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* === ÉTAPE 1 : CHOIX DE LA SOURCE === */}
          {step === "choose" && (
            <>
              {/* Zone drag-drop avec frame décoratif (spec §8.3 : drag & drop
                  d'une photo/PDF sur la version web). Sur mobile, le drag
                  n'a pas de sens — c'est juste un fond, l'utilisateur
                  utilise les boutons en dessous. */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) {
                    // Accepte image/* ou application/pdf
                    if (
                      f.type.startsWith("image/") ||
                      f.type === "application/pdf" ||
                      f.name.toLowerCase().endsWith(".pdf")
                    ) {
                      void handleFileSelected(f);
                    }
                  }
                }}
                style={{
                  position: "relative",
                  outline: dragOver
                    ? "2px dashed var(--saffron, #e8a33d)"
                    : "none",
                  outlineOffset: 2,
                  borderRadius: 16,
                  transition: "outline-color 0.2s",
                }}
              >
                <ScanFrame />
                {dragOver && (
                  <div
                    aria-live="polite"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(232,163,61,0.15)",
                      backdropFilter: "blur(2px)",
                      borderRadius: 16,
                      color: "var(--saffron, #e8a33d)",
                      fontWeight: 700,
                      fontSize: 14,
                      pointerEvents: "none",
                    }}
                  >
                    📎 Lâche ton fichier ici
                  </div>
                )}
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: "#E8D5B7",
                  textAlign: "center",
                  lineHeight: 1.6,
                  margin: "8px 0",
                }}
              >
                Photographie ton ticket, choisis un fichier ou{" "}
                <strong style={{ color: "var(--saffron, #e8a33d)" }}>
                  glisse-le ici
                </strong>{" "}
                (image / PDF).
                <br />
                <span style={{ fontSize: 11, color: "#8A7B6B" }}>
                  L'IA détecte le marchand, le total et chaque article.
                </span>
              </p>

              {/* Inputs cachés : un avec capture caméra, un fichier classique */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileSelected(f);
                }}
                style={{ display: "none" }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileSelected(f);
                }}
                style={{ display: "none" }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  style={primaryBtnStyle}
                >
                  📷 Prendre une photo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={secondaryBtnStyle}
                >
                  🖼 Choisir une image ou un PDF
                </button>
              </div>
            </>
          )}

          {/* === ÉTAPE 2 : SCANNING === */}
          {step === "scanning" && (
            <>
              <ScanFrame previewUrl={previewUrl} animated />
              <div
                style={{
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.1), rgba(181,70,46,0.08))",
                  border: "1px solid rgba(232,163,61,0.18)",
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "#F4E4C1",
                }}
              >
                <span
                  className="bmd-ai-tag"
                  style={{
                    display: "inline-block",
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: "#E8A33D",
                    fontWeight: 700,
                    marginBottom: 6,
                    textTransform: "uppercase",
                  }}
                >
                  ⬡ IA · Analyse en cours
                </span>
                <div style={{ color: "#E8D5B7" }}>
                  Reconnaissance des caractères, détection du marchand,
                  extraction des articles et du total…
                </div>
              </div>
            </>
          )}

          {/* === ÉTAPE 3 : RÉSULTAT === */}
          {step === "result" && result && (
            <>
              <ScanFrame previewUrl={previewUrl} />

              {/* Bulle IA avec résumé en langage naturel */}
              <div
                style={{
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.08))",
                  border: "1px solid rgba(232,163,61,0.25)",
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: "#E8A33D",
                    fontWeight: 700,
                    marginBottom: 6,
                    textTransform: "uppercase",
                  }}
                >
                  ⬡ IA · Reconnaissance ·{" "}
                  {Math.round(result.confidence * 100)} % confiance
                </span>
                <div style={{ color: "#E8D5B7" }}>
                  {result.merchant ? (
                    <>
                      «{" "}
                      {result.category ? `${result.category} ` : ""}
                      <strong style={{ color: "#F4E4C1" }}>
                        {result.merchant}
                      </strong>{" "}
                      détecté ·
                    </>
                  ) : (
                    "« Ticket analysé · "
                  )}
                  {result.items.length > 0 && (
                    <>
                      <strong style={{ color: "#F4E4C1" }}>
                        {result.items.length} article
                        {result.items.length > 1 ? "s" : ""}
                      </strong>{" "}
                      ·{" "}
                    </>
                  )}
                  {result.amount && (
                    <>
                      Total{" "}
                      <strong style={{ color: "#F4E4C1" }}>
                        {result.amount} {result.currency}
                      </strong>
                    </>
                  )}
                  {" »"}
                </div>
              </div>

              {/* Liste des lignes détectées (style maquette : pointillés entre lignes) */}
              {(result.items.length > 0 || result.amount) && (
                <div
                  style={{
                    background: "rgba(42,34,68,0.7)",
                    border: "1px solid rgba(232,163,61,0.18)",
                    borderRadius: 14,
                    padding: 12,
                    fontSize: 12,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {result.items.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "5px 0",
                        borderBottom:
                          "1px dashed rgba(244,228,193,0.08)",
                        color: "#E8D5B7",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {it.quantity > 1 && (
                          <span style={{ color: "#C9A24A" }}>
                            {it.quantity}× {" "}
                          </span>
                        )}
                        {it.description}
                      </span>
                      <span style={{ flexShrink: 0, color: "#F4E4C1" }}>
                        {parseFloat(it.totalPrice).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {result.amount && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0 2px",
                        color: "#E8A33D",
                        fontWeight: 700,
                        borderTop:
                          result.items.length > 0
                            ? "1px solid rgba(232,163,61,0.25)"
                            : "none",
                        marginTop:
                          result.items.length > 0 ? 4 : 0,
                      }}
                    >
                      <span>TOTAL</span>
                      <span>
                        {parseFloat(result.amount).toFixed(2)}{" "}
                        {result.currency}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {result.items.length === 0 && (
                <p
                  style={{
                    fontSize: 11,
                    color: "#8A7B6B",
                    fontStyle: "italic",
                    textAlign: "center",
                  }}
                >
                  Aucun article détecté individuellement. Tu pourras saisir
                  le détail à la main si besoin.
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={handleConfirm}
                  style={primaryBtnStyle}
                >
                  ✓ Utiliser ces informations
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("choose");
                    setResult(null);
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }}
                  style={secondaryBtnStyle}
                >
                  ↺ Recommencer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Frame de scan : bordure pointillée saffron + hachures bogolan,
 * avec ligne de scan animée si `animated`. Si `previewUrl` est fourni,
 * affiche l'image scannée en fond. Sinon, SVG ticket décoratif (style maquette).
 */
function ScanFrame({
  previewUrl,
  animated,
}: {
  previewUrl?: string | null;
  animated?: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        height: 180,
        border: "2px dashed rgba(232,163,61,0.5)",
        borderRadius: 18,
        background: previewUrl
          ? `url("${previewUrl}") center/cover no-repeat`
          : "repeating-linear-gradient(45deg, rgba(232,163,61,0.04) 0 6px, transparent 6px 12px)",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Voile sombre au-dessus de la preview pour garder la ligne lisible */}
      {previewUrl && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(14,11,20,0.55)",
          }}
        />
      )}

      {/* SVG ticket décoratif quand pas de preview */}
      {!previewUrl && (
        <svg
          width="80"
          height="100"
          viewBox="0 0 80 100"
          opacity="0.7"
          aria-hidden="true"
        >
          <rect
            x="10"
            y="10"
            width="60"
            height="80"
            rx="3"
            fill="#F4E4C1"
            opacity="0.1"
            stroke="#E8A33D"
          />
          <line x1="18" y1="22" x2="62" y2="22" stroke="#E8A33D" strokeWidth="0.6" />
          <line x1="18" y1="30" x2="55" y2="30" stroke="#E8A33D" strokeWidth="0.6" />
          <line x1="18" y1="38" x2="62" y2="38" stroke="#E8A33D" strokeWidth="0.6" />
          <line x1="18" y1="46" x2="48" y2="46" stroke="#E8A33D" strokeWidth="0.6" />
          <line x1="18" y1="54" x2="62" y2="54" stroke="#E8A33D" strokeWidth="0.6" />
          <line x1="18" y1="70" x2="62" y2="70" stroke="#E8A33D" strokeWidth="1.2" />
        </svg>
      )}

      {/* Ligne de scan animée (laser saffron) */}
      {animated && (
        <div
          className="bmd-scan-line"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            height: 2,
            background:
              "linear-gradient(90deg, transparent, #E8A33D, transparent)",
            boxShadow: "0 0 12px #E8A33D",
            top: "40%",
            zIndex: 2,
          }}
        />
      )}
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #E8A33D, #B5462E)",
  color: "#16111E",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  letterSpacing: 0.3,
  minHeight: 50,
  boxShadow: "0 8px 20px rgba(232,163,61,0.3)",
  fontFamily: "inherit",
};

const secondaryBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "#F4E4C1",
  border: "1px solid rgba(244,228,193,0.08)",
  borderRadius: 14,
  padding: "12px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  minHeight: 46,
  fontFamily: "inherit",
};
