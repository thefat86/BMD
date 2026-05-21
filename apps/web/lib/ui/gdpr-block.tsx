"use client";

/**
 * Bloc RGPD : portabilité (export JSON) + droit à l'oubli (suppression OTP).
 *
 * Spec §9.1 + obligations légales RGPD (art. 17 et 20).
 * À insérer dans la page profil.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken } from "../api-client";
import { ApiErrorAlert } from "./api-error-alert";
import { useT } from "../i18n/app-strings";

export function GdprBlock() {
  const router = useRouter();
  const t = useT();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState<unknown>(null);

  // États de la suppression (multi-étapes pour éviter les clics fatals)
  const [deleteStep, setDeleteStep] = useState<
    "idle" | "confirm" | "otp_sent" | "deleted"
  >("idle");
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<unknown>(null);

  async function exportData() {
    setExportBusy(true);
    setExportErr(null);
    try {
      const data = await api.gdprExportMe();
      // Téléchargement direct via blob
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bmd-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e);
    } finally {
      setExportBusy(false);
    }
  }

  async function requestDeleteOtp() {
    setDeleteBusy(true);
    setDeleteErr(null);
    try {
      await api.gdprDeleteMeRequest();
      setDeleteStep("otp_sent");
    } catch (e) {
      setDeleteErr(e);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteCode || deleteCode.length < 4) {
      setDeleteErr(new Error("Saisis le code reçu par SMS/email."));
      return;
    }
    setDeleteBusy(true);
    setDeleteErr(null);
    try {
      await api.gdprDeleteMeConfirm(deleteCode);
      setDeleteStep("deleted");
      // Petite pause pour que l'utilisateur lise le message
      setTimeout(() => {
        clearToken();
        router.replace("/");
      }, 2500);
    } catch (e) {
      setDeleteErr(e);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>🛡️ {t("gdpr.title")}</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        {t("gdpr.exportDescription")}
      </p>

      {/* === Export portabilité === */}
      <div
        style={{
          marginTop: 14,
          padding: 12,
          background: "rgba(16,185,129,0.06)",
          border: "1px solid rgba(16,185,129,0.2)",
          borderRadius: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14 }}>📥 {t("gdpr.exportTitle")}</h3>
        <p style={{ margin: "4px 0 8px", fontSize: 12, color: "#574a6e" }}>
          {t("gdpr.exportDescription")}
        </p>
        <button
          type="button"
          className="btn btn-sm"
          onClick={exportData}
          disabled={exportBusy}
          style={{ padding: "6px 14px" }}
        >
          {exportBusy ? t("gdpr.exportPending") : `💾 ${t("gdpr.exportDownload")}`}
        </button>
        {exportErr ? (
          <div style={{ marginTop: 8 }}>
            <ApiErrorAlert error={exportErr} />
          </div>
        ) : null}
      </div>

      {/* === Droit à l'oubli === */}
      <div
        style={{
          marginTop: 14,
          padding: 12,
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: "#991b1b" }}>
          🗑️ {t("gdpr.deleteTitle")}
        </h3>
        <p style={{ margin: "4px 0 8px", fontSize: 12, color: "#574a6e" }}>
          Action <strong>définitive</strong> : ton compte, tes contacts et tes
          notifications seront supprimés. Les groupes dont tu es seul admin
          seront dissous.
        </p>

        {deleteStep === "deleted" && (
          <div
            style={{
              padding: 10,
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: 8,
              fontSize: 13,
              color: "#065f46",
            }}
          >
            ✅ Ton compte a été supprimé. Au revoir 👋
          </div>
        )}

        {deleteStep === "idle" && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setDeleteStep("confirm")}
            style={{ padding: "6px 14px", color: "#991b1b" }}
          >
            {t("gdpr.deleteBtn")}…
          </button>
        )}

        {deleteStep === "confirm" && (
          <div>
            <p style={{ fontSize: 12, color: "#991b1b", marginBottom: 8 }}>
              Confirmes-tu vouloir supprimer ton compte ? On va t'envoyer un code
              de vérification sur ton contact principal.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setDeleteStep("idle")}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={requestDeleteOtp}
                disabled={deleteBusy}
                style={{ background: "#991b1b", color: "white" }}
              >
                {deleteBusy ? "Envoi…" : "Envoyer le code"}
              </button>
            </div>
          </div>
        )}

        {deleteStep === "otp_sent" && (
          <div>
            <p style={{ fontSize: 12, marginBottom: 8 }}>
              On t'a envoyé un code. Saisis-le ici pour confirmer la suppression :
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                type="text"
                inputMode="numeric"
                value={deleteCode}
                onChange={(e) =>
                  setDeleteCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                maxLength={6}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: 16,
                  letterSpacing: 4,
                  textAlign: "center",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  fontFamily: "ui-monospace, monospace",
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={confirmDelete}
                disabled={deleteBusy || deleteCode.length < 6}
                style={{ background: "#991b1b", color: "white" }}
              >
                {deleteBusy ? "Suppression…" : "Confirmer"}
              </button>
            </div>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setDeleteStep("idle");
                setDeleteCode("");
                setDeleteErr(null);
              }}
              style={{ marginTop: 8, padding: "4px 8px", fontSize: 11 }}
            >
              Annuler
            </button>
          </div>
        )}

        {deleteErr ? (
          <div style={{ marginTop: 8 }}>
            <ApiErrorAlert error={deleteErr} onClose={() => setDeleteErr(null)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
