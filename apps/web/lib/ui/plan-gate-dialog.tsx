"use client";

/**
 * <PlanGateDialog> · Modal d'upgrade plan (spec §6.3 — gating).
 *
 * Affiché quand une action utilisateur est bloquée par les limites de son
 * forfait actuel (ex: créer un 11e groupe en plan FREE limité à 10).
 *
 * Le composant :
 *  - Charge la liste des plans actifs via api.listPlans()
 *  - Met en évidence le plan actuel de l'utilisateur (via api.me().planCode)
 *  - Met en évidence le plan minimum recommandé pour débloquer l'action
 *    (via le `requiredPlan` extrait de l'ApiError.details)
 *  - Affiche pour chaque plan : nom, prix mensuel, features clé, CTA upgrade
 *
 * Design pensé app-native (carte par plan empilée verticalement sur mobile,
 * grille 2-3 colonnes sur desktop), look fintech (Wise/Revolut tier picker).
 */

import { useEffect, useState } from "react";
import { api, ApiError } from "../api-client";
import { useT, type AppStringKey } from "../i18n/app-strings";
import { BottomSheet } from "./bottom-sheet";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  priceCentsYearly: number | null;
  /** Devise du prix (EUR par défaut, mais peut être XAF/NGN/INR selon région PPA) */
  currency?: string;
  /** Vrai si le prix vient d'un tier régional (vs fallback EUR de base) */
  isRegionalPrice?: boolean;
  description: string | null;
  limits: Record<string, any>;
  displayOrder: number;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Erreur originale (pour afficher le message de blocage en haut) */
  error?: ApiError | null;
  /** Code du plan actuel de l'utilisateur (FREE, PRO, FAMILY…) */
  currentPlanCode?: string;
  /** Code du plan minimum recommandé (depuis error.details.requiredPlan) */
  requiredPlanCode?: string;
}

/**
 * Convertit les limites brutes en bullet points lisibles.
 */
function limitsToBullets(
  limits: Record<string, any>,
  t: (key: AppStringKey, vars?: Record<string, string>) => string,
): string[] {
  const out: string[] = [];
  if (typeof limits.maxGroups === "number") {
    out.push(
      limits.maxGroups === -1
        ? t("plan.limit.groupsUnl")
        : t("plan.limit.groupsCount", { n: String(limits.maxGroups) }),
    );
  }
  if (typeof limits.maxMembersPerGroup === "number") {
    out.push(
      limits.maxMembersPerGroup === -1
        ? t("plan.limit.membersUnl")
        : t("plan.limit.membersCount", {
            n: String(limits.maxMembersPerGroup),
          }),
    );
  }
  if (typeof limits.ocrPerMonth === "number") {
    out.push(
      limits.ocrPerMonth === -1
        ? t("plan.limit.ocrUnl")
        : limits.ocrPerMonth === 0
          ? t("plan.limit.ocrNone")
          : t("plan.limit.ocrCount", { n: String(limits.ocrPerMonth) }),
    );
  }
  if (limits.whatsappBot) out.push(t("plan.limit.whatsappBot"));
  if (limits.multiCurrency) out.push(t("plan.limit.multiCurrency"));
  if (limits.debtSwap) out.push(t("plan.limit.debtSwap"));
  if (limits.exportPdfExcel) out.push(t("plan.limit.exportPdfExcel"));
  if (limits.taxReceipts) out.push(t("plan.limit.taxReceipts"));
  if (limits.prioritySupport) out.push(t("plan.limit.prioritySupport"));
  if (limits.adsEnabled === false) out.push(t("plan.limit.adFree"));
  return out;
}

const ZERO_DECIMAL_PG = new Set([
  "XAF", "XOF", "JPY", "KRW", "VND", "RWF", "UGX", "BIF",
  "DJF", "GNF", "KMF", "MGA", "MWK", "TZS",
]);

const SYMBOL_PG: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "$CA",
  XAF: "FCFA", XOF: "FCFA", MAD: "DH", DZD: "DA", TND: "DT",
  NGN: "₦", KES: "Ksh", GHS: "GH₵", ZAR: "R",
  CNY: "¥", INR: "₹", IDR: "Rp", PHP: "₱", VND: "₫",
};

function formatPrice(cents: number, currency: string = "EUR"): string {
  if (cents === 0) return "Gratuit";
  const cur = currency || "EUR";
  const symbol = SYMBOL_PG[cur] ?? cur;
  const value = ZERO_DECIMAL_PG.has(cur) ? cents : cents / 100;
  const formatted = ZERO_DECIMAL_PG.has(cur)
    ? value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
    : value.toFixed(value % 1 === 0 ? 0 : 2).replace(".", ",");
  const symbolBefore = ["€", "$", "£", "$CA", "¥", "₦", "₹", "₱", "₫"].includes(symbol);
  const priceStr = symbolBefore ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
  return `${priceStr}/mois`;
}

export function PlanGateDialog({
  open,
  onClose,
  error,
  currentPlanCode,
  requiredPlanCode,
}: Props) {
  const t = useT();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .listPlans()
      .then((res) => {
        setPlans(
          res.plans
            .filter((p) => p.isActive)
            .sort((a, b) => a.displayOrder - b.displayOrder),
        );
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose}>

        {/* Bandeau d'erreur si bloqué */}
        {error && (
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
              border: "1px solid rgba(232,163,61,0.35)",
              borderRadius: 14,
              padding: "12px 14px",
              marginBottom: 18,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 28,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              🔒
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--saffron, #e8a33d)",
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Limite de ton forfait atteinte
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "var(--cream)",
                }}
              >
                {error.message}
              </div>
              {error.tip && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--cream-soft, #d4c4a8)",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {error.tip}
                </div>
              )}
            </div>
          </div>
        )}

        <h2
          id="plan-gate-title"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 26,
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--cream)",
          }}
        >
          Choisis ton forfait
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--cream-soft, #d4c4a8)",
            margin: "0 0 20px",
            lineHeight: 1.5,
          }}
        >
          Passe à un plan supérieur pour débloquer plus de groupes, plus de
          membres, le scan IA et les exports.
        </p>

        {loading ? (
          <div
            style={{
              padding: 30,
              textAlign: "center",
              color: "var(--cream-soft)",
              fontSize: 13,
            }}
          >
            Chargement des forfaits…
          </div>
        ) : plans.length === 0 ? (
          <div
            style={{
              padding: 30,
              textAlign: "center",
              color: "var(--cream-soft)",
              fontSize: 13,
            }}
          >
            Aucun forfait disponible pour l'instant.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "1fr",
            }}
            className="plan-gate-grid"
          >
            {plans.map((plan) => {
              const isCurrent = plan.code === currentPlanCode;
              const isRecommended = plan.code === requiredPlanCode;
              const bullets = limitsToBullets(plan.limits, t);
              return (
                <div
                  key={plan.code}
                  style={{
                    background: isRecommended
                      ? "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.06))"
                      : "rgba(244,228,193,0.03)",
                    border: isRecommended
                      ? "1.5px solid rgba(232,163,61,0.55)"
                      : "1px solid rgba(244,228,193,0.08)",
                    borderRadius: 16,
                    padding: 18,
                    position: "relative",
                  }}
                >
                  {isRecommended && (
                    <div
                      style={{
                        position: "absolute",
                        top: -10,
                        right: 14,
                        background:
                          "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                        color: "#16111E",
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        padding: "4px 10px",
                        borderRadius: 999,
                      }}
                    >
                      Recommandé
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "Cormorant Garamond, serif",
                          fontSize: 22,
                          fontWeight: 700,
                          color: "var(--cream)",
                          lineHeight: 1.1,
                        }}
                      >
                        {plan.name}
                      </div>
                      {isCurrent && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--saffron)",
                            letterSpacing: 0.6,
                            textTransform: "uppercase",
                            fontWeight: 700,
                            marginTop: 2,
                          }}
                        >
                          Forfait actuel
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "var(--saffron, #e8a33d)",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatPrice(plan.priceCents, plan.currency)}
                    </div>
                  </div>
                  {plan.description && (
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--cream-soft, #d4c4a8)",
                        margin: "0 0 10px",
                        lineHeight: 1.5,
                      }}
                    >
                      {plan.description}
                    </p>
                  )}
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "0 0 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                    }}
                  >
                    {bullets.map((b, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 12.5,
                          color: "var(--cream-soft, #d4c4a8)",
                          display: "flex",
                          gap: 8,
                          lineHeight: 1.5,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            color: "var(--saffron, #e8a33d)",
                            flexShrink: 0,
                          }}
                        >
                          ✓
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent ? (
                    <button
                      type="button"
                      onClick={() => {
                        // Pour MVP : on redirige vers la page profil onglet Plan
                        // (où l'utilisateur peut effectivement souscrire).
                        // Pas de paiement implémenté ici — la spec §6.3 prévoit
                        // l'intégration Stripe plus tard.
                        onClose();
                        if (typeof window !== "undefined") {
                          window.location.href = `/dashboard/plans?upgrade=${plan.code}`;
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: isRecommended
                          ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
                          : "rgba(244,228,193,0.06)",
                        color: isRecommended ? "#16111E" : "var(--cream)",
                        border: isRecommended
                          ? "none"
                          : "1px solid rgba(244,228,193,0.15)",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {plan.priceCents === 0
                        ? "Choisir ce plan gratuit"
                        : `Passer à ${plan.name}`}
                    </button>
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "10px",
                        background: "rgba(232,163,61,0.06)",
                        border: "1px solid rgba(232,163,61,0.18)",
                        borderRadius: 10,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--saffron)",
                      }}
                    >
                      ★ Forfait en cours
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 16,
            padding: 12,
            background: "transparent",
            border: "1px solid rgba(244,228,193,0.15)",
            color: "var(--cream-soft)",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Plus tard
        </button>

        <style jsx>{`
          @keyframes plan-gate-fade {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          @keyframes plan-gate-slide {
            from {
              transform: translateY(40px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          @media (min-width: 769px) {
            :global(.plan-gate-grid) {
              grid-template-columns: repeat(
                auto-fit,
                minmax(220px, 1fr)
              ) !important;
              gap: 14px !important;
            }
          }
        `}</style>
    </BottomSheet>
  );
}
