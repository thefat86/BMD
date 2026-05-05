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
import { api, setToken } from "../../../lib/api-client";

export default function QrLoginPage() {
  const router = useRouter();
  const [token, setQrToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<
    "loading" | "waiting" | "approved" | "expired" | "error"
  >("loading");
  const [secondsLeft, setSecondsLeft] = useState(90);
  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  async function generate() {
    setStatus("loading");
    try {
      const r = await api.qrLoginStart();
      setQrToken(r.token);
      const exp = new Date(r.expiresAt);
      setExpiresAt(exp);
      setStatus("waiting");
    } catch (e) {
      console.warn("QR start failed", e);
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
          ← Retour au login
        </Link>
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>⊞ Connexion par scan QR</h2>
        <p
          className="muted"
          style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}
        >
          Scanne ce code avec ton téléphone (déjà connecté à l'app BMD) pour
          te connecter automatiquement sur cet ordinateur — zéro saisie.
        </p>

        {status === "loading" && <p>Génération du code…</p>}

        {status === "waiting" && token && (
          <>
            <div
              style={{
                background: "#fff",
                padding: 16,
                borderRadius: 16,
                margin: "0 auto 16px",
                width: 256,
                boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}`}
                alt="QR code de connexion"
                width={224}
                height={224}
                style={{ display: "block" }}
              />
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
              Expire dans {secondsLeft}s
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
              <strong>Pas connecté sur ton mobile ?</strong> Connecte-toi
              d'abord avec ton numéro/email, puis reviens ici scanner le QR.
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
              Connecté !
            </h3>
            <p style={{ color: "var(--cream-soft)" }}>
              Redirection vers le dashboard…
            </p>
          </div>
        )}

        {status === "expired" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⏱</div>
            <p style={{ color: "var(--cream-soft)", marginBottom: 14 }}>
              Le code a expiré. Génère un nouveau.
            </p>
            <button onClick={generate} className="btn btn-block">
              ↻ Nouveau code QR
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="error">
            Erreur lors de la génération.{" "}
            <button
              onClick={generate}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--saffron)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Réessayer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
