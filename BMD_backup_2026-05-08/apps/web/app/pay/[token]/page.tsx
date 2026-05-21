"use client";

/**
 * Page publique de confirmation de paiement (mode invité — spec §7.6).
 *
 * Workflow :
 *  1. Le créancier (ou un admin) génère un lien /pay/[token] depuis l'app
 *  2. Il partage le lien (WhatsApp, SMS) au payeur
 *  3. Le payeur clique → arrive sur cette page sans avoir à se connecter
 *  4. Voit : nom du groupe, qui doit à qui, montant
 *  5. Clique "J'ai payé" → le règlement passe en PAID
 *  6. Le créancier voit dans son app et peut confirmer (CONFIRMED)
 *
 * Note : c'est la version "déclarative". Pas de paiement réel ici
 * (Mobile Money / Lydia / etc. nécessitent intégration externe).
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api-client";
import { useT } from "../../../lib/i18n/app-strings";

export default function PayPage() {
  const t = useT();
  const { token } = useParams();
  const tokenStr = token as string;
  const [info, setInfo] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .getPayInfo(tokenStr)
      .then((r) => {
        setInfo(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(
          e?.code === "expired"
            ? t("pay.linkExpired")
            : e?.code === "already_used"
              ? t("pay.linkAlreadyUsed")
              : (e as Error).message,
        );
        setLoading(false);
      });
  }, [tokenStr]);

  async function confirm() {
    setConfirming(true);
    setError(null);
    try {
      await api.confirmPayment(tokenStr);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirming(false);
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
          padding: 28,
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bmd-logo.svg"
          alt="BMD"
          width={56}
          height={56}
          style={{ margin: "0 auto 12px", display: "block" }}
        />
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          BMD<span style={{ color: "#E8A33D" }}>·</span>
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 3,
            color: "#C9A24A",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 20,
          }}
        >
          {t("pay.confirmationTitle")}
        </div>

        {loading && <p style={{ color: "#E8D5B7" }}>{t("common.verifyingLink")}</p>}

        {!loading && error && (
          <>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🚫</div>
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                color: "#D9714A",
                marginBottom: 8,
              }}
            >
              {t("pay.linkUnavailable")}
            </h2>
            <p style={{ color: "#E8D5B7", fontSize: 14, lineHeight: 1.6 }}>
              {error}
            </p>
            <p
              style={{
                fontSize: 12,
                color: "#8A7B6B",
                marginTop: 14,
                lineHeight: 1.6,
              }}
            >
              {t("pay.regenerateLink")}
            </p>
          </>
        )}

        {!loading && info && !done && (
          <>
            <div
              style={{
                fontSize: 13,
                color: "#E8D5B7",
                marginBottom: 16,
              }}
            >
              Groupe <strong style={{ color: "#F4E4C1" }}>{info.groupName}</strong>
            </div>

            <div
              style={{
                background:
                  "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.08))",
                border: "1px solid #E8A33D",
                borderRadius: 14,
                padding: 18,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: "#C9A24A",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                {t("pay.youOwe")}
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 36,
                  fontWeight: 700,
                  color: "#E8A33D",
                  lineHeight: 1.1,
                }}
              >
                {parseFloat(info.amount).toFixed(2)}{" "}
                <span style={{ fontSize: 18 }}>{info.currency}</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#E8D5B7",
                  marginTop: 8,
                }}
              >
                de la part de <strong>{info.from}</strong>
                <br />à <strong>{info.to}</strong>
              </div>
            </div>

            <p
              style={{
                fontSize: 12,
                color: "#8A7B6B",
                lineHeight: 1.6,
                marginBottom: 16,
                textAlign: "left",
              }}
            >
              <strong>{t("pay.instructions")}</strong>
              <br />
              {t("pay.step1")}
              <br />
              {t("pay.step2")}
              <br />
              {t("pay.step3", { to: info.to })}
            </p>

            {info.status !== "PROPOSED" && (
              <div
                style={{
                  background: "rgba(63,125,92,0.1)",
                  border: "1px solid #3F7D5C",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  color: "#7DC59E",
                  marginBottom: 14,
                }}
              >
                <span
                  dangerouslySetInnerHTML={{
                    __html: t("pay.currentStatus", { status: info.status }),
                  }}
                />
              </div>
            )}

            <button
              onClick={confirm}
              disabled={confirming || info.status !== "PROPOSED"}
              style={{
                width: "100%",
                padding: 16,
                background:
                  info.status === "PROPOSED"
                    ? "linear-gradient(135deg, #E8A33D, #B5462E)"
                    : "rgba(255,255,255,0.05)",
                color:
                  info.status === "PROPOSED" ? "#16111E" : "#8A7B6B",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                cursor:
                  confirming || info.status !== "PROPOSED"
                    ? "not-allowed"
                    : "pointer",
                minHeight: 52,
              }}
            >
              {confirming
                ? t("common.confirming")
                : info.status === "PROPOSED"
                  ? t("pay.iPaid")
                  : t("pay.alreadyConfirmed")}
            </button>
          </>
        )}

        {done && (
          <>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 24,
                color: "#7DC59E",
                marginBottom: 8,
              }}
            >
              {t("pay.thankYou")}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "#E8D5B7",
                lineHeight: 1.6,
              }}
              dangerouslySetInnerHTML={{
                __html: t("pay.successMessage", { to: info?.to ?? "" }),
              }}
            />
            <Link
              href="/"
              style={{
                display: "inline-block",
                marginTop: 18,
                padding: "12px 24px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(244,228,193,0.08)",
                color: "#F4E4C1",
                borderRadius: 10,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {t("app.discoverBmd")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
