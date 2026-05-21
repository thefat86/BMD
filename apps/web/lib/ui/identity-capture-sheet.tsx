"use client";

/**
 * V234 — Composant modal "Scanner ma pièce d'identité".
 *
 * Pipeline UX :
 *   1. Choix du type (CI / passeport / titre de séjour / permis)
 *   2. Upload du fichier (drag & drop, click, image ou PDF)
 *   3. Spinner pendant l'analyse IA (OpenAI Vision)
 *   4. Formulaire éditable avec les champs extraits
 *   5. Bouton "Confirmer ces informations" → status VERIFIED
 *
 * Une fois VERIFIED, l'identité sert à pré-remplir les noms officiels
 * dans la création RDD (créancier/débiteur/garant si user BMD).
 *
 * Modal desktop centrée, max-width 520px. Mobile : full-screen (la
 * largeur 520px tient sur smartphone moderne — sinon le scroll prend
 * le relais). Pas de version dédiée mobile pour l'instant.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { SegmentedControl } from "./segmented-control";

type IdentityType = "ID_CARD" | "PASSPORT" | "RESIDENCE" | "DRIVER" | "OTHER";
type IdentityStatus = "PENDING" | "VERIFIED" | "REJECTED";

interface IdentityFields {
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  documentNumber: string;
  expiryDate: string;
  issuingCountry: string;
}

const EMPTY_FIELDS: IdentityFields = {
  firstName: "",
  lastName: "",
  birthDate: "",
  birthPlace: "",
  documentNumber: "",
  expiryDate: "",
  issuingCountry: "",
};

type Step = "type" | "upload" | "scanning" | "review" | "done";

export function IdentityCaptureSheet({
  onClose,
  onVerified,
}: {
  onClose: () => void;
  /** Callback appelé après VERIFIED — utile pour rafraîchir le parent */
  onVerified?: (identity: any) => void;
}): JSX.Element {
  const t = useT();
  const [step, setStep] = useState<Step>("type");
  const [docType, setDocType] = useState<IdentityType>("ID_CARD");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fields, setFields] = useState<IdentityFields>(EMPTY_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup preview blob URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError(
        t("identity.sheet.errorTooLarge") ||
          "Fichier trop lourd (max 10 MB)",
      );
      return;
    }
    setFile(f);
    if (f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  }

  async function startScan() {
    if (!file) return;
    setStep("scanning");
    setError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const res = await api.scanIdentity({
        type: docType,
        fileBase64: base64,
        mimeType: file.type as any,
      });
      setFields({
        firstName: res.suggestions.firstName ?? "",
        lastName: res.suggestions.lastName ?? "",
        birthDate: res.suggestions.birthDate ?? "",
        birthPlace: res.suggestions.birthPlace ?? "",
        documentNumber: res.suggestions.documentNumber ?? "",
        expiryDate: res.suggestions.expiryDate ?? "",
        issuingCountry: res.suggestions.issuingCountry ?? "",
      });
      setStep("review");
    } catch (e: any) {
      setError(
        e?.message ||
          t("identity.sheet.errorScan") ||
          "Échec de l'analyse — réessaie.",
      );
      setStep("upload");
    }
  }

  async function confirmVerify() {
    if (!fields.firstName.trim() || !fields.lastName.trim()) {
      setError(
        t("identity.sheet.errorRequiredFields") ||
          "Prénom et nom sont obligatoires.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.verifyIdentity({
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        birthDate: fields.birthDate || null,
        birthPlace: fields.birthPlace.trim() || null,
        documentNumber: fields.documentNumber.trim() || null,
        expiryDate: fields.expiryDate || null,
        issuingCountry: fields.issuingCountry.toUpperCase().slice(0, 2) || null,
      });
      setStep("done");
      onVerified?.(res.identity);
      setTimeout(() => onClose(), 700);
    } catch (e: any) {
      setError(
        e?.message ||
          t("identity.sheet.errorVerify") ||
          "Validation refusée — vérifie les champs.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const typeSegments: Array<{ value: IdentityType; label: string }> = [
    {
      value: "ID_CARD",
      label: t("identity.type.ID_CARD") || "Carte d'identité",
    },
    {
      value: "PASSPORT",
      label: t("identity.type.PASSPORT") || "Passeport",
    },
    {
      value: "RESIDENCE",
      label: t("identity.type.RESIDENCE") || "Titre de séjour",
    },
    {
      value: "DRIVER",
      label: t("identity.type.DRIVER") || "Permis de conduire",
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.55)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflow: "auto",
          background: "#FAF6EE",
          border: "0.5px solid #D9C8A6",
          borderRadius: 16,
          boxShadow: "0 12px 60px rgba(43,31,21,0.30)",
          padding: 22,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 500,
              color: "#2B1F15",
              letterSpacing: 0.2,
            }}
          >
            {t("identity.sheet.title") || "Pièce d'identité officielle"}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12,
              color: "#8B6F47",
              lineHeight: 1.5,
            }}
          >
            {t("identity.sheet.subtitle") ||
              "Nécessaire pour générer des documents juridiques (RDD, contrats…)"}
          </p>
        </div>

        {/* Step indicator */}
        <StepDots step={step} />

        {/* Step content */}
        {step === "type" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Label>{t("identity.sheet.typeLabel") || "Type de document"}</Label>
            <SegmentedControl<IdentityType>
              value={docType}
              onChange={setDocType}
              segments={typeSegments}
              size="sm"
            />
            <button
              type="button"
              onClick={() => setStep("upload")}
              style={primaryBtnStyle}
            >
              {t("common.continue") || "Continuer"}
            </button>
          </div>
        )}

        {step === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Label>
              {t("identity.sheet.uploadLabel") ||
                "Téléverse ta pièce d'identité"}
            </Label>
            <p style={{ fontSize: 11, color: "#8B6F47", margin: 0 }}>
              {t("identity.sheet.uploadHint") ||
                "Image ou PDF. Reconnu en quelques secondes."}
            </p>

            {/* Drop zone */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{
                padding: "30px 16px",
                background: "#FFFFFF",
                border: "1px dashed #C58A2E",
                borderRadius: 12,
                color: "#2B1F15",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {file ? (
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: 10, color: "#8B6F47" }}>
                    {Math.round(file.size / 1024)} KB · {file.type}
                  </div>
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Aperçu"
                      style={{
                        marginTop: 10,
                        maxWidth: "100%",
                        maxHeight: 160,
                        borderRadius: 8,
                      }}
                    />
                  )}
                </div>
              ) : (
                <span>
                  {t("identity.sheet.dropHere") || "Glisse-dépose ou clique"}
                </span>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {error && <ErrorRow text={error} />}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setStep("type")}
                style={secondaryBtnStyle}
              >
                {t("common.back") || "Retour"}
              </button>
              <button
                type="button"
                onClick={startScan}
                disabled={!file}
                style={{
                  ...primaryBtnStyle,
                  opacity: file ? 1 : 0.5,
                  cursor: file ? "pointer" : "not-allowed",
                }}
              >
                {t("identity.sheet.scanCta") || "Analyser"}
              </button>
            </div>
          </div>
        )}

        {step === "scanning" && (
          <div style={{ textAlign: "center", padding: "32px 8px" }}>
            <div className="bmd-spinner" style={spinnerStyle} />
            <p
              style={{
                marginTop: 18,
                fontSize: 14,
                color: "#2B1F15",
                fontWeight: 500,
              }}
            >
              {t("identity.sheet.scanning") || "Analyse IA en cours…"}
            </p>
            <p style={{ marginTop: 6, fontSize: 11, color: "#8B6F47" }}>
              {t("identity.sheet.scanningHint") ||
                "OpenAI Vision extrait les informations officielles."}
            </p>
          </div>
        )}

        {step === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Label>
              {t("identity.sheet.extractedFields") ||
                "Informations extraites"}
            </Label>
            <p style={{ fontSize: 11, color: "#8B6F47", margin: 0 }}>
              {t("identity.sheet.editHint") ||
                "Tu peux corriger les valeurs avant de confirmer."}
            </p>

            <FieldRow
              label={t("identity.sheet.fieldFirstName") || "Prénom"}
              value={fields.firstName}
              onChange={(v) => setFields((f) => ({ ...f, firstName: v }))}
              required
            />
            <FieldRow
              label={t("identity.sheet.fieldLastName") || "Nom"}
              value={fields.lastName}
              onChange={(v) => setFields((f) => ({ ...f, lastName: v }))}
              required
            />
            <FieldRow
              label={
                t("identity.sheet.fieldBirthDate") || "Date de naissance"
              }
              value={fields.birthDate}
              onChange={(v) => setFields((f) => ({ ...f, birthDate: v }))}
              type="date"
            />
            <FieldRow
              label={
                t("identity.sheet.fieldBirthPlace") || "Lieu de naissance"
              }
              value={fields.birthPlace}
              onChange={(v) => setFields((f) => ({ ...f, birthPlace: v }))}
            />
            <FieldRow
              label={t("identity.sheet.fieldDocNumber") || "N° du document"}
              value={fields.documentNumber}
              onChange={(v) => setFields((f) => ({ ...f, documentNumber: v }))}
            />
            <FieldRow
              label={
                t("identity.sheet.fieldExpiryDate") || "Date d'expiration"
              }
              value={fields.expiryDate}
              onChange={(v) => setFields((f) => ({ ...f, expiryDate: v }))}
              type="date"
            />
            <FieldRow
              label={
                t("identity.sheet.fieldIssuingCountry") || "Pays émetteur"
              }
              value={fields.issuingCountry}
              onChange={(v) =>
                setFields((f) => ({
                  ...f,
                  issuingCountry: v.toUpperCase().slice(0, 2),
                }))
              }
              placeholder="FR"
            />

            {error && <ErrorRow text={error} />}

            <button
              type="button"
              onClick={confirmVerify}
              disabled={submitting}
              style={{ ...primaryBtnStyle, marginTop: 6 }}
            >
              {submitting
                ? t("common.loading") || "Chargement…"
                : t("identity.sheet.confirmCta") ||
                  "Confirmer ces informations"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "32px 8px" }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "#1F7A57",
                color: "#FFFFFF",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              ✓
            </div>
            <p style={{ marginTop: 14, fontSize: 14, color: "#2B1F15" }}>
              {t("identity.sheet.doneTitle") || "Identité enregistrée"}
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes bmd-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// ─── Internals ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["type", "upload", "scanning", "review", "done"];
  const idx = order.indexOf(step);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 6,
        marginBottom: 18,
      }}
    >
      {order.map((s, i) => (
        <div
          key={s}
          style={{
            width: i === idx ? 26 : 6,
            height: 6,
            borderRadius: 3,
            background: i <= idx ? "#C58A2E" : "#D9C8A6",
            transition: "all 0.25s ease",
          }}
        />
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: "#5A4632",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        display: "block",
      }}
    >
      {children}
    </label>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#8B6F47", marginBottom: 4 }}>
        {label}
        {required ? " *" : ""}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function ErrorRow({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        background: "#FCE8E0",
        color: "#9F4628",
        border: "0.5px solid #9F4628",
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#FFFFFF",
  border: "0.5px solid #D9C8A6",
  borderRadius: 9,
  fontSize: 14,
  color: "#2B1F15",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "#2B1F15",
  color: "#FAF6EE",
  border: "none",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryBtnStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "12px 16px",
  background: "transparent",
  color: "#2B1F15",
  border: "0.5px solid #D9C8A6",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const spinnerStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  border: "3px solid #D9C8A6",
  borderTopColor: "#C58A2E",
  borderRadius: "50%",
  margin: "0 auto",
  animation: "bmd-spin 0.8s linear infinite",
};

// ─── Helpers ─────────────────────────────────────────────────────────────

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        // Strip data URL prefix → return raw base64
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      } else {
        reject(new Error("FileReader unexpected result"));
      }
    };
    reader.onerror = () =>
      reject(reader.error || new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}
