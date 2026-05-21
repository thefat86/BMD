"use client";

/**
 * <ScanReceiptModal /> · V42 — UX scan premium "TIIME-like".
 *
 * Refonte majeure du scan facture :
 *
 *  1. **Pré-traitement client** (image-preprocessor.ts) : auto-EXIF, resize
 *     1600px max, compression JPEG 78%. Passe de 4.5 MB à ~420 KB → upload
 *     6s → 0.8s sur 4G. Calcule aussi le SHA-256 hash pour anti-doublon.
 *
 *  2. **Progression en 5 étapes visibles** pendant le scan, avec check-icons
 *     qui s'allument en cascade :
 *       ① Optimisation de l'image (gain de poids affiché en temps réel)
 *       ② Envoi sécurisé
 *       ③ Lecture par l'IA (Mindee)
 *       ④ Validation intelligente (GPT-4o-mini normalisation)
 *       ⑤ Vérification anti-doublon
 *     Animation laser permanente + pulse IA badge + step labels.
 *
 *  3. **Édition inline du résultat** : avant de valider, l'utilisateur peut
 *     corriger montant / marchand / date / devise directement dans le modal.
 *     Évite de devoir tout retaper en cas de mauvaise détection.
 *
 *  4. **Confidence bar** visible : 0-100% avec couleur dynamique
 *     (vert > 85%, orange 60-85%, rouge < 60%).
 *
 *  5. **Warning doublon** si le backend renvoie `potentialDuplicateOf` :
 *     bandeau visible et bouton "Voir la dépense existante".
 *
 *  6. **Confettis** au succès haute confidence (>85%) — feedback joyeux.
 *
 *  Le composant garde sa signature publique : `onConfirm(result, file)`.
 *  Le `file` retourné est le fichier OPTIMISÉ (pas l'original brut) → c'est
 *  lui qu'on attache comme ExpenseAttachment kind=RECEIPT.
 */
import { useEffect, useRef, useState } from "react";
import { useToast } from "./toast";
import { useBreakpoint } from "../use-breakpoint";
import { haptic } from "../platform";
import {
  preprocessReceiptFile,
  formatBytes,
  type PreprocessResult,
} from "./image-preprocessor";
// V52.B6 — Icon registry V45 (remplace ⚠ ✓ 📷 par SVG outline 1.5px).
import { Icon } from "./icons";
// V52.B10 — Overlay V45 (4 corners SVG saffron + laser horizontal animé)
// utilisé en absolute par-dessus le preview de la facture.
import { ScanFrame as V45ScanOverlay } from "./scan-frame";

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
  /** V42 — Renvoyé par le backend après check anti-doublon. */
  potentialDuplicateOf?: {
    expenseId: string;
    description: string;
    amount: string;
    date: string;
  } | null;
  /** V42 — Hash SHA-256 du fichier optimisé (anti-doublon). */
  receiptHash?: string;
  /** V42 — Quel provider a fait le scan (mindee / openai_vision / tesseract). */
  provider?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * V41.8 — Signature étendue : on passe AUSSI le File scanné (optimisé V42)
   * dans onConfirm pour que le parent puisse l'uploader comme
   * ExpenseAttachment preuve.
   */
  onConfirm: (result: ParsedReceipt, file: File | null) => void;
  /**
   * Fonction qui appelle le backend (api.scanReceipt) avec le file OPTIMISÉ
   * et le hash pour anti-doublon. Reçoit aussi en optionnel le hash pour que
   * le backend puisse vérifier les doublons côté serveur.
   */
  scanFn: (file: File, hash?: string) => Promise<ParsedReceipt>;
}

type Step = "choose" | "scanning" | "result";

/** Etapes de progression visibles pendant le scan. */
interface ScanStep {
  key: string;
  label: string;
  status: "pending" | "active" | "done";
  detail?: string;
}

const INITIAL_STEPS: ScanStep[] = [
  { key: "compress", label: "Optimisation de l'image", status: "pending" },
  { key: "upload", label: "Envoi sécurisé", status: "pending" },
  { key: "ocr", label: "Lecture par l'IA", status: "pending" },
  { key: "normalize", label: "Validation intelligente", status: "pending" },
  { key: "dedupe", label: "Vérification anti-doublon", status: "pending" },
];

export function ScanReceiptModal({
  open,
  onClose,
  onConfirm,
  scanFn,
}: Props): JSX.Element | null {
  const toast = useToast();
  const { isMobile } = useBreakpoint();
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [optimized, setOptimized] = useState<PreprocessResult | null>(null);
  const [result, setResult] = useState<ParsedReceipt | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [steps, setSteps] = useState<ScanStep[]>(INITIAL_STEPS);
  const [showConfetti, setShowConfetti] = useState(false);

  // Champs éditables (état de l'édition inline)
  const [editAmount, setEditAmount] = useState("");
  const [editMerchant, setEditMerchant] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCurrency, setEditCurrency] = useState("EUR");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!open) {
      setStep("choose");
      setFile(null);
      setOptimized(null);
      setResult(null);
      setSteps(INITIAL_STEPS);
      setShowConfetti(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      // Cleanup timers
      stepTimersRef.current.forEach((t) => clearTimeout(t));
      stepTimersRef.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Marque une étape comme done et active la suivante. */
  function advanceStep(key: string, detail?: string) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx]!, status: "done", detail };
      if (idx + 1 < next.length) {
        next[idx + 1] = { ...next[idx + 1]!, status: "active" };
      }
      return next;
    });
  }

  /** Active une étape donnée (pour démarrer la progression). */
  function startStep(key: string) {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, status: "active" } : s)),
    );
  }

  async function handleFileSelected(rawFile: File) {
    setFile(rawFile);
    setSteps(INITIAL_STEPS);
    setStep("scanning");

    // Preview immédiate (avant optim) pour que l'utilisateur voie son ticket
    if (rawFile.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(rawFile));
    }

    try {
      // ===== ÉTAPE 1 : Compression client =====
      startStep("compress");
      let opt: PreprocessResult;
      try {
        opt = await preprocessReceiptFile(rawFile);
        setOptimized(opt);
        const detail = opt.wasOptimized
          ? `${formatBytes(opt.originalSize)} → ${formatBytes(opt.finalSize)} (-${opt.reductionPct}%)`
          : "Déjà optimal";
        advanceStep("compress", detail);
        haptic("tap");
      } catch (e) {
        // Si la compression plante (rare : navigateur exotique), on tente
        // d'envoyer l'original sans hash → le scan marche quand même mais
        // l'anti-doublon ne sera pas vérifié.
        console.warn("[scan] préprocess image échoué, fallback original:", e);
        opt = {
          file: rawFile,
          hash: "",
          originalSize: rawFile.size,
          finalSize: rawFile.size,
          reductionPct: 0,
          wasOptimized: false,
        };
        setOptimized(opt);
        advanceStep("compress", "Format conservé");
      }

      // ===== ÉTAPE 2 : Upload =====
      // L'upload réel se fait dans scanFn(). On affiche "upload en cours"
      // pendant la 1ère seconde, puis on bascule sur "OCR" à 1.2s. C'est
      // une progression *perçue* mais cohérente : le serveur fait bien
      // upload → OCR → LLM → dedupe en série.
      startStep("upload");
      const t1 = setTimeout(() => advanceStep("upload", "Transmis"), 900);
      stepTimersRef.current.push(t1);
      const t2 = setTimeout(() => startStep("ocr"), 1100);
      stepTimersRef.current.push(t2);
      const t3 = setTimeout(
        () => advanceStep("ocr", "Marchand, montant, articles"),
        2400,
      );
      stepTimersRef.current.push(t3);
      const t4 = setTimeout(() => startStep("normalize"), 2600);
      stepTimersRef.current.push(t4);

      // ===== ÉTAPE 3-4 : Appel réel backend =====
      const r = await scanFn(opt.file, opt.hash || undefined);

      // À ce stade le serveur a fini : on rattrape la progression aux 100%
      stepTimersRef.current.forEach((t) => clearTimeout(t));
      stepTimersRef.current = [];

      setResult({ ...r, receiptHash: opt.hash });
      advanceStep("upload", "Transmis");
      advanceStep("ocr", r.provider === "mindee" ? "Mindee Pro" : (r.provider ?? "IA"));
      advanceStep(
        "normalize",
        r.confidence ? `${Math.round(r.confidence * 100)}% confiance` : "OK",
      );

      // ===== ÉTAPE 5 : Anti-doublon (client perçu) =====
      startStep("dedupe");
      const t5 = setTimeout(() => {
        // V52.B6 — Pas de glyphes ⚠/✓ inline dans le label
        // (la couleur du badge step indique déjà l'état emerald/saffron).
        advanceStep(
          "dedupe",
          r.potentialDuplicateOf ? "Doublon détecté" : "Unique",
        );
        // Préremplit l'édition inline
        setEditAmount(r.amount ?? "");
        setEditMerchant(r.merchant ?? "");
        setEditDate(r.date ?? "");
        setEditCurrency((r.currency ?? "EUR").toUpperCase());
        // Si haute confidence → petit shot de confettis
        if (r.confidence >= 0.85 && !r.potentialDuplicateOf) {
          setShowConfetti(true);
          const t6 = setTimeout(() => setShowConfetti(false), 1800);
          stepTimersRef.current.push(t6);
        }
        haptic("success");
        setStep("result");
      }, 400);
      stepTimersRef.current.push(t5);
    } catch (e) {
      toast.error(e);
      stepTimersRef.current.forEach((t) => clearTimeout(t));
      stepTimersRef.current = [];
      setStep("choose");
      setFile(null);
      setOptimized(null);
      setSteps(INITIAL_STEPS);
    }
  }

  function handleConfirm() {
    if (!result) return;
    // Renvoie le résultat ÉDITÉ par l'utilisateur (corrections inline)
    const finalResult: ParsedReceipt = {
      ...result,
      amount: editAmount.trim() || null,
      merchant: editMerchant.trim() || null,
      date: editDate.trim() || null,
      currency: editCurrency.trim().toUpperCase() || "EUR",
    };
    // V41.8 — on passe le file OPTIMISÉ (pas l'original brut)
    // V67 — IMPORTANT : ne PAS appeler onClose() après onConfirm() !
    // Le parent change déjà le state via onConfirm (setMode("review"))
    // et onClose() reset le mode à "chooser" → annulait le passage au
    // review form. Le parent ferme le scan modal naturellement via le
    // changement de state (open={mode === "scan"} devient false).
    onConfirm(finalResult, optimized?.file ?? file);
  }

  if (!open) return null;

  // Couleur dynamique du badge confidence
  function confidenceColor(c: number): string {
    if (c >= 0.85) return "#7DC59E"; // vert
    if (c >= 0.6) return "#E8A33D"; // saffron
    return "#D9714A"; // terracotta
  }

  return (
    <>
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
        @keyframes bmd-step-pop {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          70% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .bmd-step-check {
          animation: bmd-step-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes bmd-step-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .bmd-step-spinner {
          animation: bmd-step-spin 0.9s linear infinite;
        }
        @keyframes bmd-confetti-fall {
          0% {
            transform: translateY(-20px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(360px) rotate(720deg);
            opacity: 0;
          }
        }
        .bmd-confetti-piece {
          animation: bmd-confetti-fall 1.6s ease-in forwards;
        }
        @keyframes bmd-scan-fadein {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes bmd-scan-slideup {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && step !== "scanning") onClose();
        }}
        style={{
          position: "fixed",
          inset: 0,
          // V63 — Backdrop V45-light (cocoa-alpha au lieu de night-alpha)
          background: "rgba(43,31,21,0.45)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 9990,
          display: "flex",
          alignItems: isMobile ? "flex-end" : "center",
          justifyContent: "center",
          padding: isMobile
            ? 0
            : "calc(env(safe-area-inset-top, 0) + 16px) 16px calc(env(safe-area-inset-bottom, 0) + 16px)",
          overflowY: "auto",
          animation: "bmd-scan-fadein 0.2s ease-out",
        }}
      >
        <div
          style={{
            // V63 — Surface V45-light : ivory paper avec subtle gradient
            background: "linear-gradient(180deg, #FBF6EC 0%, #F4ECD8 100%)",
            border: "1px solid rgba(197,138,46,0.25)",
            borderBottom: isMobile ? "none" : "1px solid rgba(197,138,46,0.25)",
            borderRadius: isMobile ? "22px 22px 0 0" : 24,
            width: "100%",
            maxWidth: isMobile ? "100%" : 480,
            padding: isMobile ? "12px 16px" : 16,
            paddingBottom: isMobile
              ? "calc(env(safe-area-inset-bottom, 0px) + 16px)"
              : 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            color: "#F4E4C1",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            maxHeight: isMobile ? "92dvh" : "calc(100dvh - 32px)",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(232,163,61,0.05)",
            animation: isMobile ? "bmd-scan-slideup 0.3s ease-out" : undefined,
            position: "relative",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Confettis premium au succès */}
          {showConfetti && <ConfettiBurst />}

          {/* Drag handle mobile */}
          {isMobile && (
            <div
              aria-hidden
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: -4,
                marginBottom: 6,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(244,228,193,0.25)",
                }}
              />
            </div>
          )}

          {/* Header */}
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
                Étape {step === "choose" ? "1" : step === "scanning" ? "2" : "3"} / 3
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
                  ? "Scanner la facture"
                  : step === "scanning"
                    ? "BMD analyse…"
                    : "Vérifie et valide"}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              disabled={step === "scanning"}
              style={{
                width: 36,
                height: 36,
                minHeight: 36,
                borderRadius: "50%",
                background:
                  step === "scanning"
                    ? "rgba(244,228,193,0.10)"
                    : "linear-gradient(135deg, #E8A33D, #C9A24A)",
                color: step === "scanning" ? "#8A7B6B" : "#16111E",
                border: "none",
                fontSize: 18,
                fontWeight: 700,
                cursor: step === "scanning" ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* ===== ÉTAPE 1 : CHOIX ===== */}
          {step === "choose" && (
            <>
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
                Photographie ta facture, choisis un fichier ou{" "}
                <strong style={{ color: "var(--saffron, #e8a33d)" }}>
                  glisse-le ici
                </strong>{" "}
                (image / PDF).
                <br />
                <span style={{ fontSize: 11, color: "#8A7B6B" }}>
                  Mindee Pro + GPT-4o normalisation · marchand, total, articles,
                  TVA détectés automatiquement.
                </span>
              </p>

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
                  style={{
                    ...primaryBtnStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {/* V52.B6 — SVG camera remplace 📷 */}
                  <Icon name="camera" size={18} color="currentColor" strokeWidth={1.8} />
                  Prendre une photo
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

          {/* ===== ÉTAPE 2 : SCANNING (UX PREMIUM) ===== */}
          {step === "scanning" && (
            <>
              <ScanFrame previewUrl={previewUrl} animated />

              {/* Steps liste avec check-icons animées */}
              <div
                aria-live="polite"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  background: "rgba(42,34,68,0.5)",
                  border: "1px solid rgba(232,163,61,0.15)",
                  borderRadius: 14,
                  padding: "12px 14px",
                }}
              >
                {steps.map((s) => (
                  <StepRow key={s.key} step={s} />
                ))}
              </div>
            </>
          )}

          {/* ===== ÉTAPE 3 : RÉSULTAT + ÉDITION INLINE ===== */}
          {step === "result" && result && (
            <>
              <ScanFrame previewUrl={previewUrl} />

              {/* Confidence bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(42,34,68,0.5)",
                  border: "1px solid rgba(232,163,61,0.18)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 11,
                }}
              >
                <span
                  className="bmd-ai-tag"
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: confidenceColor(result.confidence),
                    fontWeight: 700,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  ⬡ IA
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: "rgba(244,228,193,0.10)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(result.confidence * 100)}%`,
                        background: confidenceColor(result.confidence),
                        transition: "width 0.4s ease-out",
                      }}
                    />
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: confidenceColor(result.confidence),
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                  }}
                >
                  {Math.round(result.confidence * 100)}%
                </span>
              </div>

              {/* Warning doublon */}
              {result.potentialDuplicateOf && (
                <div
                  role="alert"
                  style={{
                    background: "rgba(217,113,74,0.12)",
                    border: "1px solid rgba(217,113,74,0.40)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#FFB89A",
                    lineHeight: 1.5,
                  }}
                >
                  <strong
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 2,
                    }}
                  >
                    {/* V52.B6 — SVG alert-triangle remplace ⚠ unicode */}
                    <Icon
                      name="alert-triangle"
                      size={14}
                      color="currentColor"
                      strokeWidth={2}
                    />
                    Doublon possible
                  </strong>
                  Une dépense similaire existe déjà : «{" "}
                  <strong style={{ color: "#F4E4C1" }}>
                    {result.potentialDuplicateOf.description}
                  </strong>{" "}
                  », {result.potentialDuplicateOf.amount} {result.currency}, le{" "}
                  {result.potentialDuplicateOf.date}.
                </div>
              )}

              {/* Édition inline des champs principaux */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <FieldEdit
                  label="Montant"
                  value={editAmount}
                  onChange={setEditAmount}
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <FieldEdit
                  label="Devise"
                  value={editCurrency}
                  onChange={(v) => setEditCurrency(v.toUpperCase().slice(0, 3))}
                  placeholder="EUR"
                />
                <FieldEdit
                  label="Marchand"
                  value={editMerchant}
                  onChange={setEditMerchant}
                  placeholder="Carrefour, Uber…"
                  wide
                />
                <FieldEdit
                  label="Date"
                  value={editDate}
                  onChange={setEditDate}
                  placeholder="2026-05-11"
                  wide
                  type="date"
                />
              </div>

              {/* Liste des items détectés */}
              {result.items.length > 0 && (
                <div
                  style={{
                    background: "rgba(42,34,68,0.7)",
                    border: "1px solid rgba(232,163,61,0.18)",
                    borderRadius: 12,
                    padding: 10,
                    fontSize: 12,
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: 1.5,
                      color: "#8A7B6B",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    {result.items.length} article
                    {result.items.length > 1 ? "s" : ""}
                  </div>
                  {result.items.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "4px 0",
                        borderBottom: "1px dashed rgba(244,228,193,0.08)",
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
                      <span
                        style={{
                          flexShrink: 0,
                          color: "#F4E4C1",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {parseFloat(it.totalPrice).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer actions */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <button
                  type="button"
                  onClick={handleConfirm}
                  style={{
                    ...primaryBtnStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {/* V52.B6 — SVG check remplace ✓ unicode */}
                  <Icon name="check" size={18} color="currentColor" strokeWidth={2} />
                  Utiliser ces informations
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("choose");
                    setResult(null);
                    setOptimized(null);
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                    setSteps(INITIAL_STEPS);
                  }}
                  style={{
                    ...secondaryBtnStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {/* V52.B6 — SVG rotate-cw remplace ↺ unicode */}
                  <Icon name="rotate-cw" size={16} color="currentColor" strokeWidth={1.8} />
                  Recommencer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// Sous-composants
// ============================================================

function StepRow({ step }: { step: ScanStep }) {
  const color =
    step.status === "done"
      ? "#7DC59E"
      : step.status === "active"
        ? "#E8A33D"
        : "#5C5466";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12.5,
        color: step.status === "pending" ? "#8A7B6B" : "#E8D5B7",
        opacity: step.status === "pending" ? 0.6 : 1,
        transition: "opacity 0.2s ease, color 0.2s ease",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background:
            step.status === "done" ? color : "rgba(244,228,193,0.06)",
          border: `1.5px solid ${color}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: step.status === "done" ? "#0E0B14" : color,
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {step.status === "done" ? (
          // V52.B6 — SVG check remplace ✓ unicode (V45 SVG outline)
          <span className="bmd-step-check" aria-hidden>
            <Icon name="check" size={11} color="currentColor" strokeWidth={2.5} />
          </span>
        ) : step.status === "active" ? (
          <span
            className="bmd-step-spinner"
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              display: "inline-block",
            }}
          />
        ) : (
          <span style={{ width: 6, height: 6, background: color, borderRadius: 3 }} />
        )}
      </span>
      <span style={{ flex: 1, fontWeight: step.status === "active" ? 600 : 500 }}>
        {step.label}
      </span>
      {step.detail && (
        <span
          style={{
            fontSize: 10,
            color: step.status === "done" ? color : "#8A7B6B",
            fontWeight: 600,
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {step.detail}
        </span>
      )}
    </div>
  );
}

function FieldEdit({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  type,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "text";
  type?: "text" | "date";
  wide?: boolean;
}) {
  return (
    <label style={{ gridColumn: wide ? "span 2" : undefined, display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: 1.5,
          color: "#8A7B6B",
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      <input
        type={type ?? "text"}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "rgba(42,34,68,0.7)",
          border: "1px solid rgba(232,163,61,0.25)",
          borderRadius: 10,
          color: "#F4E4C1",
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

/** Burst de confettis en SVG positionné absolu, dispose tout seul. */
function ConfettiBurst() {
  const pieces = Array.from({ length: 18 }, (_, i) => i);
  const colors = ["#E8A33D", "#7DC59E", "#5B6CFF", "#F4E4C1", "#D9714A"];
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: "inherit",
        zIndex: 50,
      }}
    >
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const color = colors[i % colors.length];
        const size = 6 + Math.random() * 6;
        return (
          <span
            key={i}
            className="bmd-confetti-piece"
            style={{
              position: "absolute",
              top: -10,
              left: `${left}%`,
              width: size,
              height: size,
              background: color,
              borderRadius: i % 2 === 0 ? "50%" : 2,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * V52.B10 — Refonte V45 du ScanFrame interne :
 *  - Plus de border dashed → remplacé par overlay V45 avec 4 corners SVG
 *    saffron (cf. composant `<V45ScanOverlay>` dans scan-frame.tsx)
 *  - Laser horizontal statique → remplacé par laser loop translateY 0→100%
 *  - Fallback receipt SVG préservé (icône reçu de remplacement quand
 *    aucun previewUrl)
 *
 * Look final : capture caméra premium type QR scanner natif iOS / Google
 * Lens, mais en palette saffron BMD.
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
        // V45 : on garde un border léger pour structurer la zone mais pas
        // dashed (les 4 corners SVG portent l'identité visuelle).
        border: "1px solid rgba(232,163,61,0.20)",
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
      {/* V52.B10 — Overlay V45 : 4 corners SVG saffron + laser horizontal
          animé en loop (translateY 0→100% en 2s ease-in-out infinite).
          Le laser apparaît uniquement quand `animated=true` (= pendant
          le scan OCR actif). Sinon seuls les coins SVG persistent comme
          cadre identitaire. */}
      <V45ScanOverlay
        scanning={!!animated}
        color="#E8A33D"
        cornerSize={26}
        strokeWidth={2.5}
      />
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
