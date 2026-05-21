"use client";

/**
 * V152.F — Section publique "Packs Booster RDD" sur la page tarifs.
 *
 * Calque la section BoosterPurchaseCard (Pack IA Booster) mais pour les
 * signatures électroniques. Affiche les 2 packs (Sérénité / Affaires) avec
 * Stripe Checkout intégré. Auto-cachée si l'endpoint /me/debt-boosters
 * répond 404 (avant migration).
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
// V170.C — Popup BMD (remplace window.alert natif)
import { useDialog } from "./dialog-provider";

interface PackCatalog {
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  advancedIncluded: number;
  notarizedIncluded: number;
  durationDays: number;
}

interface ActivePack {
  id: string;
  packCode: string;
  advancedIncluded: number;
  advancedUsed: number;
  notarizedIncluded: number;
  notarizedUsed: number;
  expiresAt: string;
}

export function DebtBoosterSection(): JSX.Element | null {
  const t = useT();
  const dialog = useDialog();
  const [catalog, setCatalog] = useState<PackCatalog[]>([]);
  const [activePacks, setActivePacks] = useState<ActivePack[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    api
      .getMyDebtBoosters()
      .then((r) => {
        setCatalog(r.catalog);
        setActivePacks(r.activePacks);
      })
      .catch(() => {
        setUnavailable(true);
      });
  }, []);

  if (unavailable) return null;
  if (catalog.length === 0) return null;

  async function handlePurchase(
    packCode: "SIGN_PACK_SERENITY" | "SIGN_PACK_AFFAIRS",
  ) {
    setLoading(packCode);
    setError(null);
    try {
      const intent = await api.createDebtBoosterCheckoutIntent(packCode);
      // Si mock dev → on confirme directement
      if (intent.mock) {
        await api.confirmDebtBoosterPurchase({
          packCode,
          stripePaymentIntentId: intent.clientSecret.split("_secret")[0]!,
        });
        const r = await api.getMyDebtBoosters();
        setActivePacks(r.activePacks);
        await dialog.alert(
          t("debt.booster.devSuccess") ||
            "Pack activé (mode dev sans Stripe). Le paiement réel sera demandé en prod.",
          { title: t("debt.booster.devSuccessTitle") || "Pack activé" },
        );
        return;
      }
      // Prod Stripe → redirige vers une page de checkout dédiée (à brancher
      // sur Stripe Elements ; pour l'instant on stocke le clientSecret en
      // localStorage et on redirige vers /dashboard/plans/checkout-debt-booster).
      sessionStorage.setItem(
        "debtBoosterCheckout",
        JSON.stringify({
          packCode,
          clientSecret: intent.clientSecret,
          amount: intent.amount,
          currency: intent.currency,
        }),
      );
      window.location.href = `/dashboard/plans/checkout-debt-booster?pack=${packCode}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <section
      style={{
        maxWidth: 720,
        margin: "24px auto 0",
        padding: "0 16px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: "#0F6E56",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {t("debt.booster.eyebrow") || "Packs Booster RDD"}
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#2B1F15",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            margin: "0 0 6px",
          }}
        >
          {t("debt.booster.title") ||
            "Achète tes signatures qualifiées d'avance"}
        </h2>
        <p style={{ fontSize: 13, color: "#6B5A47", margin: 0 }}>
          {t("debt.booster.subtitle") ||
            "Économise jusqu'à 30% vs l'achat à l'unité. Valide 90 ou 180 jours."}
        </p>
      </div>

      {activePacks.length > 0 && (
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(31,122,87,0.12), rgba(15,110,86,0.06))",
            border: "1px solid rgba(31,122,87,0.32)",
            borderRadius: 12,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#0F6E56",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {t("debt.booster.activeEyebrow") || "Tes packs actifs"}
          </div>
          {activePacks.map((p) => {
            const advRemaining = p.advancedIncluded - p.advancedUsed;
            const notRemaining = p.notarizedIncluded - p.notarizedUsed;
            const expires = new Date(p.expiresAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            return (
              <div
                key={p.id}
                style={{
                  fontSize: 12,
                  color: "#2B1F15",
                  marginBottom: 4,
                }}
              >
                <strong>
                  {catalog.find((c) => c.code === p.packCode)?.name ?? p.packCode}
                </strong>{" "}
                · <span className="bmd-num">{advRemaining}</span>{" "}
                {t("debt.booster.advancedLeft") || "ADVANCED restantes"}
                {p.notarizedIncluded > 0 && (
                  <>
                    {" "}
                    · <span className="bmd-num">{notRemaining}</span>{" "}
                    {t("debt.booster.notarizedLeft") || "NOTARIZED"}
                  </>
                )}{" "}
                <span style={{ color: "#6B5A47", fontStyle: "italic" }}>
                  · {t("debt.booster.expiresOn") || "expire le"} {expires}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {catalog.map((pack) => {
          const isSerenity = pack.code === "SIGN_PACK_SERENITY";
          const accent = isSerenity ? "#C58A2E" : "#1F7A57";
          const bgAccent = isSerenity
            ? "rgba(197,138,46,0.10)"
            : "rgba(31,122,87,0.10)";
          return (
            <div
              key={pack.code}
              style={{
                background: "#FFFFFF",
                border: `1px solid ${accent}40`,
                borderRadius: 14,
                padding: 18,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {!isSerenity && (
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    borderRadius: 999,
                    background: bgAccent,
                    color: accent,
                    textTransform: "uppercase",
                  }}
                >
                  {t("debt.booster.bestValue") || "Meilleure valeur"}
                </div>
              )}
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: accent,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {t(`debt.booster.${pack.code}.eyebrow`) || "Pack signature"}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#2B1F15",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  marginBottom: 12,
                }}
              >
                {pack.name}
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: accent,
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  lineHeight: 1,
                  marginBottom: 16,
                }}
                className="bmd-num"
              >
                {(pack.priceCents / 100).toFixed(2).replace(".", ",")}{" "}
                <span style={{ fontSize: 18 }}>
                  {pack.currency === "EUR" ? "€" : pack.currency}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#2B1F15",
                  marginBottom: 6,
                  lineHeight: 1.5,
                }}
              >
                <strong className="bmd-num">{pack.advancedIncluded}</strong>{" "}
                {t("debt.booster.advancedSigs") || "signatures ADVANCED"}
              </div>
              {pack.notarizedIncluded > 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#2B1F15",
                    marginBottom: 6,
                    lineHeight: 1.5,
                  }}
                >
                  <strong className="bmd-num">{pack.notarizedIncluded}</strong>{" "}
                  {t("debt.booster.notarizedSigs") || "signature(s) NOTARIZED"}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: "#6B5A47",
                  marginBottom: 14,
                  fontStyle: "italic",
                }}
              >
                {t("debt.booster.validFor") || "Valable"}{" "}
                <span className="bmd-num">{pack.durationDays}</span>{" "}
                {t("debt.booster.days") || "jours"}
              </div>
              <button
                type="button"
                onClick={() =>
                  handlePurchase(
                    pack.code as "SIGN_PACK_SERENITY" | "SIGN_PACK_AFFAIRS",
                  )
                }
                disabled={loading === pack.code}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    loading === pack.code
                      ? "rgba(43,31,21,0.25)"
                      : `linear-gradient(135deg, ${accent}, ${accent}dd)`,
                  color: "#FBF6EC",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading === pack.code ? "not-allowed" : "pointer",
                }}
              >
                {loading === pack.code
                  ? t("debt.booster.processing") || "Traitement…"
                  : t("debt.booster.buyNow") || "Acheter ce pack"}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.3)",
            color: "#9F4628",
            fontSize: 12,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}
    </section>
  );
}
