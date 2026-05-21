"use client";

/**
 * <FxTicker> · Bandeau défilant style Bloomberg/Yahoo Finance.
 *
 * Affiche les taux de change live BMD utilise pour les conversions inter-
 * devises (tontines, dépenses partagées entre membres dans pays différents).
 *
 * Comportement :
 *  - Charge /fx-rates au mount (pivot EUR — taux pour 25 devises BMD)
 *  - Affiche un bandeau qui défile horizontalement en boucle infinie (CSS
 *    keyframes, pas de JS d'animation)
 *  - Couples affichés : EUR/USD, EUR/GBP, EUR/CHF, EUR/XAF (CFA), EUR/NGN,
 *    EUR/KES, EUR/CNY, EUR/INR, etc. — déterministes pour rester lisible
 *  - Indicateur ↗ (vert) ou ↘ (rouge) selon variation vs taux d'hier
 *    (calcul approximatif côté client : on garde une copie en localStorage)
 *  - Cliquable : ouvre /pricing avec ?country=XX pour voir les tarifs locaux
 *
 * Performance : aucune dépendance, animation CSS-pure, fetch unique.
 * Refresh auto toutes les 5 minutes (cohérent avec cache backend 60s+).
 *
 * Note : les taux montrés sont ceux utilisés par BMD pour les conversions
 * dans l'app (pas un flux Reuters payant) — c'est cohérent avec ce que les
 * utilisateurs voient quand ils créent une dépense en CFA dans une tontine
 * EUR par exemple.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { Icon } from "./icons";
import { useT } from "../i18n/app-strings";

interface Rates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

// Couples qu'on affiche dans le bandeau (gauche → droite, en boucle)
// Chaque entrée : [code, symbole, drapeau, label]
const TICKER_PAIRS: Array<{
  code: string;
  symbol: string;
  flag: string;
  label: string;
}> = [
  { code: "USD", symbol: "$", flag: "🇺🇸", label: "Dollar US" },
  { code: "GBP", symbol: "£", flag: "🇬🇧", label: "Livre" },
  { code: "CHF", symbol: "CHF", flag: "🇨🇭", label: "Franc suisse" },
  { code: "XAF", symbol: "FCFA", flag: "🌍", label: "FCFA Centrale" },
  { code: "XOF", symbol: "FCFA", flag: "🌍", label: "FCFA Ouest" },
  { code: "MAD", symbol: "DH", flag: "🇲🇦", label: "Dirham" },
  { code: "DZD", symbol: "DA", flag: "🇩🇿", label: "Dinar alg." },
  { code: "TND", symbol: "DT", flag: "🇹🇳", label: "Dinar tun." },
  { code: "NGN", symbol: "₦", flag: "🇳🇬", label: "Naira" },
  { code: "KES", symbol: "Ksh", flag: "🇰🇪", label: "Shilling KE" },
  { code: "GHS", symbol: "GH₵", flag: "🇬🇭", label: "Cedi" },
  { code: "ZAR", symbol: "R", flag: "🇿🇦", label: "Rand" },
  { code: "UGX", symbol: "USh", flag: "🇺🇬", label: "Shilling UG" },
  { code: "TZS", symbol: "TSh", flag: "🇹🇿", label: "Shilling TZ" },
  { code: "CDF", symbol: "FC", flag: "🇨🇩", label: "Franc Congo" },
  { code: "CNY", symbol: "¥", flag: "🇨🇳", label: "Yuan" },
  { code: "INR", symbol: "₹", flag: "🇮🇳", label: "Roupie" },
];

const PREV_RATES_KEY = "bmd:fx-prev";

function formatRate(rate: number): string {
  // Pour les devises avec des valeurs élevées (ex: EUR/UGX = 4000),
  // on n'affiche pas de décimale. Pour les autres (EUR/USD = 1.08), 4 chiffres.
  if (rate >= 100) return rate.toFixed(0);
  if (rate >= 10) return rate.toFixed(2);
  return rate.toFixed(4);
}

export function FxTicker(): JSX.Element | null {
  const t = useT();
  const [rates, setRates] = useState<Rates | null>(null);
  const [prevRates, setPrevRates] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const r = await api.getFxRates();
        if (cancelled) return;
        // Compare aux taux de la session précédente pour calculer la variation
        try {
          const stored = window.localStorage.getItem(PREV_RATES_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as Record<string, number>;
            setPrevRates(parsed);
          }
        } catch {
          /* ignore */
        }
        setRates(r);
        // Mémorise les taux actuels pour la prochaine session (variation J-1)
        try {
          window.localStorage.setItem(PREV_RATES_KEY, JSON.stringify(r.rates));
        } catch {
          /* ignore quota */
        }
      } catch {
        /* échec silencieux : si /fx-rates KO, on cache le bandeau */
      }
    }

    void load();
    intervalId = setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  if (!rates || Object.keys(rates.rates).length === 0) return null;

  // On duplique la liste pour boucler proprement (CSS keyframes translate -50%)
  const items = TICKER_PAIRS.filter((p) => rates.rates[p.code] != null);
  const doubled = [...items, ...items];

  return (
    <div
      role="complementary"
      aria-label={t("fx.ratesUsedByBmd")}
      style={{
        background:
          "linear-gradient(180deg, rgba(22,17,30,0.92), rgba(14,11,20,0.98))",
        borderTop: "1px solid rgba(232,163,61,0.25)",
        overflow: "hidden",
        // FIXÉ en bas du viewport : la barre ne bouge JAMAIS quand on
        // scrolle, elle reste collée tout en bas comme un bandeau Bloomberg
        // ou Yahoo Finance. Le contenu défile horizontalement en boucle
        // grâce à l'animation CSS keyframes plus bas.
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 49,
        whiteSpace: "nowrap",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 -6px 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* Label "TAUX BMD" à gauche, fixe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          padding: "0 14px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background:
            "linear-gradient(90deg, rgba(14,11,20,1) 80%, rgba(14,11,20,0))",
          zIndex: 2,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: "var(--saffron, #e8a33d)",
          fontWeight: 700,
        }}
      >
        {/* V52.C3 — SVG repeat remplace EMOJI */}
        <Icon name="repeat" size={12} color="currentColor" strokeWidth={1.6} />
        Taux BMD · 1 €
      </div>

      <div
        className="bmd-fx-track"
        style={{
          display: "inline-flex",
          padding: "10px 0 10px 130px",
          animation: "bmd-fx-scroll 80s linear infinite",
          willChange: "transform",
        }}
      >
        {doubled.map((pair, i) => {
          const rate = rates.rates[pair.code]!;
          const prev = prevRates[pair.code];
          const delta = prev ? ((rate - prev) / prev) * 100 : 0;
          const trend =
            !prev || Math.abs(delta) < 0.05
              ? "flat"
              : delta > 0
                ? "up"
                : "down";
          return (
            <Link
              key={`${pair.code}-${i}`}
              href={`/dashboard/plans?country=${getCountryForCurrency(pair.code)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 18px",
                fontSize: 12,
                color: "var(--cream-soft, #d4c4a8)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span aria-hidden style={{ fontSize: 14 }}>
                {pair.flag}
              </span>
              <span style={{ color: "var(--muted, #8a7b6b)" }}>
                {pair.code}
              </span>
              <span style={{ fontWeight: 700, color: "var(--cream)" }}>
                {formatRate(rate)}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color:
                    trend === "up"
                      ? "#7DC59E"
                      : trend === "down"
                        ? "#D9714A"
                        : "var(--muted)",
                  fontWeight: 700,
                }}
              >
                {trend === "up" ? "↗" : trend === "down" ? "↘" : "·"}
                {prev ? ` ${Math.abs(delta).toFixed(2)}%` : ""}
              </span>
            </Link>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes bmd-fx-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .bmd-fx-track:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

/**
 * Mapping minimal devise → pays principal pour rediriger vers /dashboard/plans
 * avec le bon ?country=. Pour les devises multi-pays (CFA, USD), on prend le
 * pays le plus représenté.
 */
function getCountryForCurrency(currency: string): string {
  const map: Record<string, string> = {
    USD: "US",
    GBP: "GB",
    CHF: "CH",
    EUR: "FR",
    CAD: "CA",
    XAF: "CM",
    XOF: "SN",
    MAD: "MA",
    DZD: "DZ",
    TND: "TN",
    NGN: "NG",
    KES: "KE",
    GHS: "GH",
    ZAR: "ZA",
    UGX: "UG",
    TZS: "TZ",
    CDF: "CD",
    CNY: "CN",
    INR: "IN",
  };
  return map[currency] ?? "FR";
}
