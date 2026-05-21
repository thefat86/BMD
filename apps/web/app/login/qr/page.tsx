"use client";

/**
 * Page de connexion par scan QR (spec §8.5).
 *
 * Affiche un QR code que l'utilisateur scanne avec son app mobile déjà
 * connectée. Polling toutes les 2 secondes vers /auth/qr-login/status.
 * Quand status=APPROVED, on récupère le JWT et on connecte l'utilisateur.
 *
 * TTL 90 secondes — au-delà on réinitialise automatiquement.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, setToken } from "../../../lib/api-client";
import { useT } from "../../../lib/i18n/app-strings";
// V117 — Wrapper QR avec encart BMD au centre (identité visuelle).
import { BrandedQR } from "../../../lib/ui/branded-qr";

export default function QrLoginPage() {
  const t = useT();
  const router = useRouter();
  const [token, setQrToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<
    "loading" | "waiting" | "approved" | "expired" | "error"
  >("loading");
  const [errorDetail, setErrorDetail] = useState<{
    message: string;
    tip?: string;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  async function generate() {
    setStatus("loading");
    setErrorDetail(null);
    try {
      const r = await api.qrLoginStart();
      setQrToken(r.token);
      const exp = new Date(r.expiresAt);
      setExpiresAt(exp);
      setStatus("waiting");
    } catch (e) {
      console.warn("QR start failed", e);
      const apiErr = e instanceof ApiError ? e : null;
      setErrorDetail({
        message:
          apiErr?.message ??
          (e as Error)?.message ??
          t("auth.qrError"),
        tip: (apiErr?.details?.tip as string | undefined) ?? undefined,
      });
      setStatus("error");
    }
  }

  useEffect(() => {
    void generate();
    return () => {
      if (pollRef.current != null) clearInterval(pollRef.current);
      if (tickRef.current != null) clearInterval(tickRef.current);
    };
  }, []);

  // Tick countdown 1s
  useEffect(() => {
    if (!expiresAt) return;
    function update() {
      if (!expiresAt) return;
      const left = Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(left);
      if (left <= 0) {
        setStatus("expired");
        if (pollRef.current != null) clearInterval(pollRef.current);
        if (tickRef.current != null) clearInterval(tickRef.current);
      }
    }
    update();
    tickRef.current = window.setInterval(update, 1000);
    return () => {
      if (tickRef.current != null) clearInterval(tickRef.current);
    };
  }, [expiresAt]);

  // Poll status toutes les 2s
  useEffect(() => {
    if (!token || status !== "waiting") return;
    async function check() {
      if (!token) return;
      try {
        const r = await api.qrLoginStatus(token);
        if (r.status === "APPROVED" && "token" in r) {
          setToken(r.token);
          setStatus("approved");
          if (pollRef.current != null) clearInterval(pollRef.current);
          setTimeout(() => router.push("/dashboard"), 1500);
        } else if (r.status === "EXPIRED") {
          setStatus("expired");
          if (pollRef.current != null) clearInterval(pollRef.current);
        }
      } catch {
        /* on retry au prochain tick */
      }
    }
    pollRef.current = window.setInterval(check, 2000);
    return () => {
      if (pollRef.current != null) clearInterval(pollRef.current);
    };
  }, [token, status, router]);

  const qrUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/qr-login/${token}`
    : "";

  return (
    <div className="container" style={{ maxWidth: 460 }}>
      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <Link
          href="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--cream-soft)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          {t("auth.qrBackLink")}
        </Link>
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>{t("auth.qrTitle")}</h2>
        <p
          className="muted"
          style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}
        >
          {t("auth.qrDescription")}
        </p>

        {status === "loading" && <p>{t("auth.qrGenerating")}</p>}

        {status === "waiting" && token && (
          <>
            {/* QR Code BMD-styled : couleurs saffron/terracotta + logo central
                superposé en absolu. On utilise QR-Server avec colors=hex sans
                # (URL-encoded) et un niveau de correction H pour pouvoir
                masquer 30% au centre sans casser le scan. */}
            <div
              style={{
                position: "relative",
                background:
                  "linear-gradient(135deg, #2A2244 0%, #3A2A52 100%)",
                padding: 20,
                borderRadius: 22,
                margin: "0 auto 16px",
                width: 280,
                boxShadow:
                  "0 12px 40px rgba(232,163,61,0.20), 0 4px 12px rgba(0,0,0,0.4)",
                border: "1px solid rgba(232,163,61,0.25)",
              }}
            >
              {/* Halo radial décoratif derrière le QR */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: -20,
                  right: -20,
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(232,163,61,0.30), transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "relative",
                  background: "#F4E4C1",
                  padding: 12,
                  borderRadius: 14,
                }}
              >
                {/* V117 — Identité visuelle unifiée : BrandedQR remplace
                    l'ancien overlay custom (badge saffron + B·M·D pointé)
                    pour que TOUS les QR de l'app aient strictement la
                    même signature centrale. Couleurs conservées (indigo
                    sur cream) pour rester en phase avec le hero login. */}
                <BrandedQR
                  value={qrUrl}
                  size={216}
                  alt={t("auth.qrAlt")}
                  qrColor="2A2244"
                  qrBg="F4E4C1"
                />
              </div>
            </div>
            <div
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "var(--gold, #C9A24A)",
                letterSpacing: 1.5,
                fontWeight: 700,
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              {t("auth.qrExpires", { secondsLeft: secondsLeft.toString() })}
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--muted)",
                textAlign: "center",
                lineHeight: 1.5,
                marginBottom: 0,
              }}
            >
              <strong>{t("auth.qrNotMobile")}</strong> {t("auth.qrMobileHint")}
            </p>
          </>
        )}

        {status === "approved" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
            <h3
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                color: "var(--saffron, #E8A33D)",
              }}
            >
              {t("auth.qrConnected")}
            </h3>
            <p style={{ color: "var(--cream-soft)" }}>
              {t("auth.qrRedirecting")}
            </p>
          </div>
        )}

        {status === "expired" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⏱</div>
            <p style={{ color: "var(--cream-soft)", marginBottom: 14 }}>
              {t("auth.qrExpired")}
            </p>
            <button onClick={generate} className="btn btn-block">
              {t("auth.qrNewButton")}
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="error" style={{ lineHeight: 1.5 }}>
            <strong>{errorDetail?.message ?? t("auth.qrError")}</strong>
            {errorDetail?.tip && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--cream-soft, #d4c4a8)",
                  marginTop: 8,
                  fontStyle: "italic",
                }}
              >
                💡 {errorDetail.tip}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={generate}
                className="btn btn-sm"
                style={{ padding: "8px 16px", fontSize: 13 }}
              >
                {t("auth.qrRetry")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
