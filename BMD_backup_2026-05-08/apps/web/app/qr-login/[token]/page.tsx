"use client";

/**
 * Page d'approbation QR-login (spec §8.5).
 *
 * Quand un utilisateur scanne le QR affiché sur le desktop, il arrive ici.
 * Si déjà connecté sur ce device : bouton "Approuver" qui valide la demande.
 * Sinon : redirection /login avec retour ici après authentification.
 *
 * Le desktop poll en parallèle et reçoit le JWT dès l'approbation.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "../../../lib/api-client";
import { useT } from "../../../lib/i18n/app-strings";

export default function QrLoginApprovePage() {
  const t = useT();
  const router = useRouter();
  const { token } = useParams();
  const tokenStr = token as string;
  const [status, setStatus] = useState<
    "loading" | "ready" | "approving" | "ok" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      // Pas connecté : on stocke le token et on redirige
      // sur /login. Au retour, on revient ici.
      try {
        localStorage.setItem("bmd_qr_pending", tokenStr);
      } catch {
        /* ignore */
      }
      router.replace(`/login?next=/qr-login/${tokenStr}`);
      return;
    }
    setStatus("ready");
  }, [tokenStr, router]);

  async function approve() {
    setStatus("approving");
    setError(null);
    try {
      await api.qrLoginApprove(tokenStr);
      try {
        localStorage.removeItem("bmd_qr_pending");
      } catch {
        /* ignore */
      }
      setStatus("ok");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(135deg, #0E0B14 0%, #1F1429 100%)",
        color: "#F4E4C1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#16111E",
          border: "1px solid rgba(232,163,61,0.18)",
          borderRadius: 24,
          padding: 32,
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {status === "ok" ? "✓" : "🔓"}
        </div>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 26,
            fontWeight: 700,
            margin: 0,
          }}
        >
          {status === "ok"
            ? t("auth.qrApproveSuccess2")
            : t("auth.qrApproveTitle")}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#E8D5B7",
            marginTop: 12,
            lineHeight: 1.6,
          }}
        >
          {status === "loading" && t("auth.qrApproveVerifying")}
          {status === "ready" && t("auth.qrApprovePrompt")}
          {status === "approving" && t("auth.qrApproveProgress")}
          {status === "ok" && t("auth.qrApproveSuccess")}
          {status === "error" && (
            <span style={{ color: "#D9714A" }}>{error ?? t("auth.qrError2")}</span>
          )}
        </p>
        {status === "ready" && (
          <button
            onClick={approve}
            style={{
              marginTop: 20,
              width: "100%",
              padding: 16,
              background: "linear-gradient(135deg, #E8A33D, #B5462E)",
              color: "#16111E",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              minHeight: 52,
            }}
          >
            {t("auth.qrApproveButton")}
          </button>
        )}
        {(status === "ok" || status === "error") && (
          <Link
            href="/dashboard"
            style={{
              display: "block",
              marginTop: 16,
              padding: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(244,228,193,0.08)",
              borderRadius: 10,
              color: "#F4E4C1",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {t("auth.qrBackDashboard")}
          </Link>
        )}
      </div>
    </div>
  );
}
