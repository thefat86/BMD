"use client";

/**
 * V151 — Section publique "Signature électronique" sur la page tarifs.
 *
 * Affiche les 3 niveaux (SIMPLE / ADVANCED / NOTARIZED) activés pour le pays
 * de l'utilisateur, avec leurs prix de vente. Les niveaux désactivés en admin
 * sont automatiquement masqués.
 *
 * Auto-détecte le pays via detectCountry() (héritage des règles BMD).
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { detectCountry } from "../region-detect";
import { useT } from "../i18n/app-strings";

type Level = "SIMPLE" | "ADVANCED" | "NOTARIZED";

interface PublicPricing {
  level: Level;
  priceCents: number;
  currency: string;
  displayCurrency: string;
  displayPriceCents: number;
  displayZeroDecimal?: boolean;
  yousignLevel: string;
}

// Symboles courants pour les devises affichées par BMD.
const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
  XOF: "FCFA",
  XAF: "FCFA",
  NGN: "₦",
  GHS: "₵",
  KES: "KSh",
  ZAR: "R",
  MAD: "DH",
  DZD: "DZD",
  TND: "TND",
  EGP: "£E",
  RWF: "RWF",
  UGX: "USh",
  TZS: "TSh",
  CDF: "FC",
  AED: "AED",
  SAR: "SAR",
  CNY: "¥",
  JPY: "¥",
  KRW: "₩",
  INR: "₹",
};

function formatPrice(p: PublicPricing): string {
  const cents = p.displayPriceCents;
  const cur = p.displayCurrency;
  const zeroDecimal = p.displayZeroDecimal ?? false;
  const symbol = CURRENCY_SYMBOL[cur] ?? cur;
  if (zeroDecimal) {
    // XOF, XAF, JPY, etc. — pas de décimales, séparateur de milliers
    const intPart = cents.toString();
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    // Devises où le symbole est après (FCFA, KSh, etc.)
    const after = ["FCFA", "KSh", "USh", "TSh", "FC", "RWF"].includes(symbol);
    return after ? `${grouped} ${symbol}` : `${symbol} ${grouped}`;
  }
  const value = (cents / 100).toFixed(2).replace(".", ",");
  // Devises où le symbole est après (€ français, etc.)
  const after = ["€", "DH", "DZD", "TND", "£E", "AED", "SAR"].includes(symbol);
  return after ? `${value} ${symbol}` : `${symbol} ${value}`;
}

export function SignaturePricingSection(): JSX.Element | null {
  const t = useT();
  const [pricings, setPricings] = useState<PublicPricing[]>([]);
  const [countryCode, setCountryCode] = useState<string>("FR");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cc = detectCountry() || "FR";
    setCountryCode(cc);
    api
      .getSignaturePricing(cc)
      .then((r) => {
        setPricings(r.pricings as PublicPricing[]);
        setLoaded(true);
      })
      .catch(() => {
        setPricings([]);
        setLoaded(true);
      });
  }, []);

  // Si aucun niveau activé pour ce pays (admin a tout désactivé), on cache la section
  if (loaded && pricings.length === 0) return null;

  return (
    <section
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "0 16px 24px",
      }}
    >
      <div
        style={{
          textAlign: "center",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: "#854F0B",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {t("signature.pricing.eyebrow") || "Signature électronique"}
        </div>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#2B1F15",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            letterSpacing: 0.3,
            margin: "0 0 6px",
          }}
        >
          {t("signature.pricing.title") ||
            "Sécurise chaque accord avec la valeur juridique adaptée"}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#6B5A47",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {t("signature.pricing.subtitle") ||
            "Trois niveaux conformes eIDAS — choisis selon le montant et l'enjeu de ta reconnaissance de dette."}
        </p>
        {countryCode !== "FR" && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#6B5A47",
              fontStyle: "italic",
            }}
          >
            {t("signature.pricing.countryNote") || "Prix valables pour"} ·{" "}
            {countryCode}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(pricings.length, 3)}, 1fr)`,
          gap: 12,
        }}
      >
        {pricings.map((p) => (
          <PricingCard key={p.level} pricing={p} t={t} />
        ))}
      </div>
    </section>
  );
}

function PricingCard({
  pricing,
  t,
}: {
  pricing: PublicPricing;
  t: (k: string) => string;
}): JSX.Element {
  const meta = META[pricing.level];
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `1px solid ${meta.borderColor}`,
        borderRadius: 14,
        padding: 16,
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: meta.bg,
          opacity: 0.4,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-block",
            padding: "3px 10px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            borderRadius: 999,
            background: meta.badgeBg,
            color: meta.badgeColor,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {meta.label}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#2B1F15",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            lineHeight: 1.3,
            marginBottom: 8,
            minHeight: 36,
          }}
        >
          {t(`signature.pricing.${pricing.level}.title`) || meta.defaultTitle}
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: meta.priceColor,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            lineHeight: 1.05,
            marginBottom: 4,
            wordBreak: "keep-all",
          }}
          className="bmd-num"
        >
          {formatPrice(pricing)}
        </div>
        {/* Affichage transparence : si on a converti depuis une autre devise,
            on montre le prix EUR original en mini sous le prix local. */}
        {pricing.displayCurrency !== pricing.currency && (
          <div
            style={{
              fontSize: 10,
              color: "#6B5A47",
              fontStyle: "italic",
              marginBottom: 4,
            }}
            className="bmd-num"
          >
            ≈ {(pricing.priceCents / 100).toFixed(2).replace(".", ",")}{" "}
            {pricing.currency === "EUR" ? "€" : pricing.currency}
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: "#6B5A47",
            letterSpacing: 0.5,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {t("signature.pricing.perSignature") || "Par signature"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#4A3D2E",
            lineHeight: 1.5,
            textAlign: "left",
          }}
        >
          {t(`signature.pricing.${pricing.level}.hint`) || meta.defaultHint}
        </div>
      </div>
    </div>
  );
}

const META: Record<
  Level,
  {
    label: string;
    bg: string;
    borderColor: string;
    badgeBg: string;
    badgeColor: string;
    priceColor: string;
    defaultTitle: string;
    defaultHint: string;
  }
> = {
  SIMPLE: {
    label: "Simple · SES",
    bg: "linear-gradient(135deg, rgba(43,31,21,0.04), rgba(107,90,71,0.06))",
    borderColor: "rgba(43,31,21,0.18)",
    badgeBg: "rgba(43,31,21,0.10)",
    badgeColor: "#2B1F15",
    priceColor: "#2B1F15",
    defaultTitle: "Pour les accords du quotidien",
    defaultHint:
      "Clic + email + OTP. Recevable en justice. Idéal pour les prêts entre proches < 1500 €.",
  },
  ADVANCED: {
    label: "Avancé · AES",
    bg: "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(232,163,61,0.06))",
    borderColor: "rgba(197,138,46,0.35)",
    badgeBg: "rgba(197,138,46,0.18)",
    badgeColor: "#854F0B",
    priceColor: "#854F0B",
    defaultTitle: "Équivalent signature manuscrite",
    defaultHint:
      "OTP SMS + audit trail horodaté. Présomption forte d'équivalence à la signature manuscrite (art. 1367 Code civil).",
  },
  NOTARIZED: {
    label: "Notarié · QES",
    bg: "linear-gradient(135deg, rgba(31,122,87,0.10), rgba(15,110,86,0.06))",
    borderColor: "rgba(31,122,87,0.35)",
    badgeBg: "rgba(31,122,87,0.18)",
    badgeColor: "#0F6E56",
    priceColor: "#0F6E56",
    defaultTitle: "Force exécutoire UE",
    defaultHint:
      "Vérification identité notariée (visio opérateur). Saisie directe possible sans tribunal. Réservé aux gros contrats.",
  },
};
