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

  // V141 — Champs de déclaration (méthode + date + référence) renseignés
  // par l'invitee avant confirmation. Pas de vault ici car la page est
  // publique (le visiteur n'est pas connecté).
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payMethodOther, setPayMethodOther] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [payReference, setPayReference] = useState<string>("");
  const maxDate = new Date().toISOString().slice(0, 10);
  const minDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

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

  function resolvedMethodLabel(): string {
    if (payMethod === "cash")
      return t("payment.cashLabel") || "Espèces";
    if (payMethod === "other") {
      const free = payMethodOther.trim();
      return free.length > 0
        ? free
        : t("payment.otherLabel") || "Autre";
    }
    return t("payment.otherLabel") || "Autre";
  }

  async function confirm() {
    setConfirming(true);
    setError(null);
    try {
      // V141 — Convertit la date jj/mm/yyyy en ISO UTC midi (évite TZ).
      const paidAtIso = payDate
        ? new Date(`${payDate}T12:00:00.000Z`).toISOString()
        : undefined;
      await api.confirmPayment(tokenStr, {
        paymentMethod: resolvedMethodLabel(),
        paymentReference: payReference.trim() || null,
        paidAt: paidAtIso,
      });
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

            {/* V141 — Champs de déclaration : méthode + date + référence.
                Saisie avant clic « J'ai payé ». Tous optionnels mais aident
                le créancier à reconnaître le paiement. */}
            {info.status === "PROPOSED" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  textAlign: "left",
                  marginBottom: 14,
                  padding: 14,
                  background: "rgba(232,163,61,0.04)",
                  border: "1px solid rgba(232,163,61,0.18)",
                  borderRadius: 12,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 11,
                    color: "#C9A24A",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    fontWeight: 700,
                  }}
                >
                  {t("payment.methodLabel") || "Moyen de paiement"}
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    disabled={confirming}
                    style={{
                      padding: "10px 12px",
                      background: "#1F1429",
                      border: "1px solid rgba(232,163,61,0.25)",
                      borderRadius: 8,
                      color: "#F4E4C1",
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      letterSpacing: "normal",
                      textTransform: "none",
                      fontWeight: 400,
                    }}
                  >
                    <option value="cash">
                      {t("payment.cashLabel") || "Espèces"}
                    </option>
                    <option value="other">
                      {t("payment.otherLabel") || "Autre"}
                    </option>
                  </select>
                </label>

                {payMethod === "other" && (
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 11,
                      color: "#C9A24A",
                      textTransform: "uppercase",
                      letterSpacing: 1.2,
                      fontWeight: 700,
                    }}
                  >
                    {t("pay.methodOtherLabel") || "Précise le moyen"}
                    <input
                      type="text"
                      value={payMethodOther}
                      onChange={(e) => setPayMethodOther(e.target.value)}
                      placeholder="Ex: Wave, PayPal, virement…"
                      maxLength={50}
                      disabled={confirming}
                      style={{
                        padding: "10px 12px",
                        background: "#1F1429",
                        border: "1px solid rgba(232,163,61,0.25)",
                        borderRadius: 8,
                        color: "#F4E4C1",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                        letterSpacing: "normal",
                        textTransform: "none",
                        fontWeight: 400,
                      }}
                    />
                  </label>
                )}

                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 11,
                    color: "#C9A24A",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    fontWeight: 700,
                  }}
                >
                  {t("payment.dateLabel") || "Date du paiement"}
                  <input
                    type="date"
                    value={payDate}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    disabled={confirming}
                    style={{
                      padding: "10px 12px",
                      background: "#1F1429",
                      border: "1px solid rgba(232,163,61,0.25)",
                      borderRadius: 8,
                      color: "#F4E4C1",
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      letterSpacing: "normal",
                      textTransform: "none",
                      fontWeight: 400,
                      colorScheme: "dark",
                    }}
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 11,
                    color: "#C9A24A",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    fontWeight: 700,
                  }}
                >
                  {t("payment.referenceLabel") || "Référence (optionnel)"}
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder={
                      t("payment.referencePlaceholder") ||
                      "N° de virement, mémo…"
                    }
                    maxLength={200}
                    disabled={confirming}
                    style={{
                      padding: "10px 12px",
                      background: "#1F1429",
                      border: "1px solid rgba(232,163,61,0.25)",
                      borderRadius: 8,
                      color: "#F4E4C1",
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      letterSpacing: "normal",
                      textTransform: "none",
                      fontWeight: 400,
                    }}
                  />
                </label>

                <div
                  style={{
                    fontSize: 11,
                    color: "#8A7B6B",
                    lineHeight: 1.4,
                    marginTop: 4,
                  }}
                >
                  {t("payment.notifyHint") ||
                    "Le destinataire recevra une notification push et un email pour confirmer la réception."}
                </div>
              </div>
            )}

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
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  try { navigator.vibrate([10, 30, 10]); } catch { /* ignore */ }
                }
                void confirm();
              }}
              disabled={confirming || info.status !== "PROPOSED"}
              className="bmd-pay-cta"
              data-active={info.status === "PROPOSED" ? "true" : "false"}
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
              className="bmd-pay-discover"
            >
              {t("app.discoverBmd")}
            </Link>
          </>
        )}
      </div>

      <style jsx>{`
        .bmd-pay-cta {
          width: 100%;
          padding: 16px 28px;
          background: rgba(255, 255, 255, 0.05);
          color: #8a7b6b;
          border: none;
          border-radius: 999px;
          font-weight: 700;
          font-size: 16px;
          font-family: inherit;
          cursor: not-allowed;
          min-height: 56px;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform 0.1s, box-shadow 0.2s, opacity 0.2s;
        }
        .bmd-pay-cta[data-active="true"] {
          background: linear-gradient(135deg, #E8A33D 0%, #B5462E 100%);
          color: #16111e;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(232, 163, 61, 0.35);
        }
        .bmd-pay-cta[data-active="true"]:active {
          transform: scale(0.97);
          box-shadow: 0 4px 14px rgba(232, 163, 61, 0.28);
        }
        @media (hover: hover) and (pointer: fine) {
          .bmd-pay-cta[data-active="true"]:hover {
            box-shadow: 0 10px 30px rgba(232, 163, 61, 0.45);
          }
        }

        .bmd-pay-discover {
          display: inline-block;
          margin-top: 18px;
          padding: 13px 24px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(244, 228, 193, 0.12);
          color: #f4e4c1;
          border-radius: 999px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: background 0.2s, border-color 0.2s, transform 0.1s;
        }
        .bmd-pay-discover:active {
          background: rgba(232, 163, 61, 0.08);
          border-color: rgba(232, 163, 61, 0.35);
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}
