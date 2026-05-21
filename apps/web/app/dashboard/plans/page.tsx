"use client";

/**
 * /dashboard/plans · Page de comparaison des forfaits (spec §6.3).
 *
 * Vue dédiée pour comparer / changer de forfait. Accessible :
 *  - depuis le profil ("Mon forfait" → bouton "Voir tous les forfaits")
 *  - depuis le PlanGateDialog (action recommandée quand on tape une limite)
 *
 * Comportement attendu :
 *  - Liste tous les plans actifs (api.listPlans), triés par displayOrder
 *  - Marque le plan actuel de l'utilisateur (api.me().planCode)
 *  - Si query string ?upgrade=PRO : pré-sélectionne le plan visé et CTA primaire
 *  - Bouton CTA → MVP : POST /me/plan { planCode } (via api.changeMyPlan)
 *    Note : la facturation Stripe réelle sera branchée plus tard (spec §6.3).
 *
 * Affichage adapté mobile (1 col) / desktop (3 cols) via <ResponsiveShell>.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, isUnauthorized, clearToken } from "../../../lib/api-client";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useDialog } from "../../../lib/ui/dialog-provider";
import { detectCountry } from "../../../lib/region-detect";
import { useT } from "../../../lib/i18n/app-strings";
import { useBreakpoint } from "../../../lib/use-breakpoint";
// V40 — Carrousel cartes premium mobile.
import { MobilePlansView } from "../../../lib/ui/mobile-plans-view";
// V47 — Achat du Pack IA Booster (4,99 €).
import { BoosterPurchaseCard } from "../../../lib/ui/booster-purchase-card";
// V151 — Tarifs signatures électroniques eIDAS (auto-cachés si tout désactivé)
import { SignaturePricingSection } from "../../../lib/ui/signature-pricing-section";
// V152 — Packs Booster RDD (Sérénité + Affaires)
import { DebtBoosterSection } from "../../../lib/ui/debt-booster-section";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  priceCentsYearly: number | null;
  currency: string;
  isRegionalPrice: boolean;
  description: string | null;
  limits: Record<string, any>;
  displayOrder: number;
  isActive: boolean;
}

const ZERO_DECIMAL = new Set([
  "XAF", "XOF", "JPY", "KRW", "VND", "RWF", "UGX", "BIF",
  "DJF", "GNF", "KMF", "MGA", "MWK", "TZS",
]);

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "$CA",
  XAF: "FCFA", XOF: "FCFA", MAD: "DH", DZD: "DA", TND: "DT",
  NGN: "₦", KES: "Ksh", GHS: "GH₵", ZAR: "R", UGX: "USh",
  TZS: "TSh", CNY: "¥", INR: "₹", IDR: "Rp", PHP: "₱", VND: "₫",
};

function formatMoney(cents: number, currency: string): string {
  const cur = currency || "EUR";
  const symbol = CURRENCY_SYMBOL[cur] ?? cur;
  const value = ZERO_DECIMAL.has(cur) ? cents : cents / 100;
  const formatted = ZERO_DECIMAL.has(cur)
    ? value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
    : value.toFixed(value % 1 === 0 ? 0 : 2).replace(".", ",");
  const symbolBefore = ["€", "$", "£", "$CA", "¥", "₦", "₹", "₱", "₫"].includes(symbol);
  return symbolBefore ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

export default function PlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const t = useT();
  const { isMobile, ready: bpReady } = useBreakpoint();

  const [me, setMe] = useState<any>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [regionName, setRegionName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upgradeTarget = searchParams?.get("upgrade") ?? null;

  useEffect(() => {
    const country = detectCountry();
    void Promise.all([api.me(), api.listPlans(country ?? undefined)])
      .then(([m, ps]) => {
        setMe(m.user);
        setPlans(
          ps.plans
            .filter((p) => p.isActive)
            .sort((a, b) => a.displayOrder - b.displayOrder),
        );
        setRegionName(ps.regionName);
        setLoading(false);
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
        setLoading(false);
      });
  }, [router]);

  const currentPlanCode = me?.planCode ?? "FREE";

  async function chooseplan(plan: Plan) {
    if (plan.code === currentPlanCode) return;

    // Plan gratuit (FREE) : pas de paiement → directement via changeMyPlan
    if (plan.priceCents === 0) {
      const ok = await dialog.confirm(
        t("plans.confirmRevert", { plan: plan.name }),
        {
          variant: "info",
          title: t("plans.confirmRevertTitle"),
          confirmLabel: t("plans.confirmRevertConfirm"),
        },
      );
      if (!ok) return;
      setBusy(plan.code);
      setError(null);
      try {
        await api.changeMyPlan(plan.code);
        await dialog.alert(
          t("plans.successBody", { plan: plan.name }),
          { variant: "success", title: t("plans.successTitle") },
        );
        const m = await api.me();
        setMe(m.user);
      } catch (e: any) {
        setError(e?.message ?? t("plans.errorChange"));
      } finally {
        setBusy(null);
      }
      return;
    }

    // Plan payant : créer une session Stripe Checkout et rediriger.
    // Le webhook stripe (invoice.payment_succeeded) mettra le user à jour
    // côté serveur après réception du paiement.
    setBusy(plan.code);
    setError(null);
    try {
      const session = await api.createCheckoutSession({
        planCode: plan.code,
        interval: "month",
      });
      // Redirection vers checkout.stripe.com — au retour, le user atterrit
      // sur /dashboard/plans/success?session_id=cs_test_xxx
      window.location.href = session.url;
    } catch (e: any) {
      const msg = e?.message ?? t("plans.errorCheckout");
      setError(msg);
      setBusy(null);
    }
  }

  // Construit une matrice de features pour la table comparative desktop
  const allFeatures = useMemo(() => {
    return [
      { key: "maxGroups", label: t("plans.feature.maxGroups") },
      { key: "maxMembersPerGroup", label: t("plans.feature.maxMembers") },
      { key: "ocrPerMonth", label: t("plans.feature.ocrPerMonth") },
      { key: "whatsappBot", label: t("plans.feature.whatsappBot") },
      { key: "multiCurrency", label: t("plans.feature.multiCurrency") },
      // V77 — Photo de profil visible aux autres membres
      { key: "profilePhotoVisible", label: t("plans.feature.profilePhotoVisible") },
      { key: "debtSwap", label: t("plans.feature.debtSwap") },
      { key: "exportPdfExcel", label: t("plans.feature.exportPdfExcel") },
      { key: "taxReceipts", label: t("plans.feature.taxReceipts") },
      { key: "prioritySupport", label: t("plans.feature.prioritySupport") },
      { key: "adsEnabled", label: t("plans.feature.adsEnabled"), invert: true },
    ];
  }, [t]);

  function valueFor(plan: Plan, key: string, invert?: boolean) {
    const v = plan.limits[key];
    if (typeof v === "number") {
      if (v === -1) return "∞";
      if (v === 0) return "—";
      return String(v);
    }
    if (typeof v === "boolean") {
      const display = invert ? !v : v;
      return display ? "✓" : "—";
    }
    return "—";
  }

  // V40 — Bascule mobile vers carrousel cartes premium. Placée APRÈS tous
  // les hooks pour respecter les Rules of Hooks (sinon le hook order
  // changerait au resize du viewport).
  if (bpReady && isMobile) {
    return (
      <ResponsiveShell
        breadcrumb={t("plans.title") || "Forfaits"}
        mobileTitle={t("plans.title") || "Forfaits"}
        back={{ href: "/dashboard/profile" }}
      >
        <MobilePlansView />
        {/* V47 — Pack IA Booster : achat one-shot +100 scans / 30 jours.
            Affiché APRÈS la liste des plans pour proposer une alternative
            douce à l'upgrade quand le quota est tendu. Composant auto-caché
            si l'endpoint /me/boosters renvoie 404 (avant migration). */}
        <div style={{ padding: "0 18px" }}>
          <BoosterPurchaseCard />
        </div>
        {/* V151 — Tarifs signatures eIDAS, auto-cachés si tout désactivé */}
        <SignaturePricingSection />
        {/* V152 — Packs Booster RDD (Sérénité + Affaires) */}
        <DebtBoosterSection />
      </ResponsiveShell>
    );
  }

  if (loading) {
    return (
      <ResponsiveShell
        breadcrumb={t("plans.myAccount")}
        desktopTitle={t("plans.shortTitle")}
        mobileTitle={t("plans.shortTitle")}
        back={{ href: "/dashboard/profile" }}
      >
        <div style={{ padding: 30, color: "var(--cream-soft)" }}>
          {t("plans.loading")}
        </div>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      breadcrumb={t("plans.breadcrumb")}
      desktopTitle={t("plans.title")}
      subtitle={t("plans.subtitle")}
      mobileTitle={t("plans.shortTitle")}
      back={{ href: "/dashboard/profile" }}
    >
      <div
        style={{
          padding: "8px 16px 24px",
          maxWidth: 1100,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {error && (
          <div
            style={{
              background: "rgba(217,113,74,0.1)",
              border: "1px solid rgba(217,113,74,0.3)",
              color: "#D9714A",
              padding: 12,
              borderRadius: 10,
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {upgradeTarget && (
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
              border: "1px solid rgba(232,163,61,0.4)",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 18,
              fontSize: 13,
              color: "var(--cream)",
            }}
          >
            {t("plans.upgradeHint", {
              plan:
                plans.find((p) => p.code === upgradeTarget)?.name ??
                upgradeTarget ??
                "",
            })}
          </div>
        )}

        {/* Bandeau région — affiche les tarifs adaptés au visiteur */}
        {regionName && plans.some((p) => p.isRegionalPrice) && (
          <div
            style={{
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.10)",
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "var(--cream-soft)",
              lineHeight: 1.5,
            }}
          >
            {t("plans.regionBanner", { region: regionName })}
          </div>
        )}

        {/* Cards plans (1 col mobile, grid desktop) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 14,
            marginBottom: 24,
          }}
          className="plans-grid"
        >
          {plans.map((plan) => {
            const isCurrent = plan.code === currentPlanCode;
            const isUpgrade = plan.code === upgradeTarget;
            return (
              <div
                key={plan.code}
                style={{
                  background:
                    isCurrent || isUpgrade
                      ? "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.05))"
                      : "rgba(244,228,193,0.03)",
                  border:
                    isCurrent || isUpgrade
                      ? "1.5px solid rgba(232,163,61,0.45)"
                      : "1px solid rgba(244,228,193,0.08)",
                  borderRadius: 16,
                  padding: 20,
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {(isCurrent || isUpgrade) && (
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      right: 14,
                      background: isCurrent
                        ? "rgba(232,163,61,0.85)"
                        : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                      color: "#16111E",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      padding: "4px 10px",
                      borderRadius: 999,
                    }}
                  >
                    {isCurrent ? t("plans.current") : t("plans.recommended")}
                  </div>
                )}
                <div
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 26,
                    fontWeight: 700,
                    color: "var(--cream)",
                    marginBottom: 4,
                  }}
                >
                  {plan.name}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--saffron)",
                    fontVariantNumeric: "tabular-nums",
                    marginBottom: 6,
                  }}
                >
                  {plan.priceCents === 0
                    ? t("plans.free")
                    : formatMoney(plan.priceCents, plan.currency)}
                  {plan.priceCents > 0 && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--cream-soft)",
                        fontWeight: 500,
                        marginLeft: 4,
                      }}
                    >
                      {t("plans.perMonth")}
                    </span>
                  )}
                </div>
                {plan.priceCentsYearly && plan.priceCentsYearly > 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--cream-soft)",
                      marginBottom: 10,
                    }}
                  >
                    {t("plans.yearlyHint", {
                      yearly: formatMoney(plan.priceCentsYearly, plan.currency),
                      percent: String(
                        Math.round(
                          (1 -
                            plan.priceCentsYearly /
                              (plan.priceCents * 12)) *
                            100,
                        ),
                      ),
                    })}
                  </div>
                )}
                {plan.description && (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--cream-soft)",
                      margin: "0 0 14px",
                      lineHeight: 1.5,
                      flex: 1,
                    }}
                  >
                    {plan.description}
                  </p>
                )}

                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "0 0 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {allFeatures.map((f) => {
                    const v = valueFor(plan, f.key, f.invert);
                    if (v === "—" && !f.invert) return null;
                    return (
                      <li
                        key={f.key}
                        style={{
                          fontSize: 13,
                          color:
                            v === "—"
                              ? "var(--muted, #8a7b6b)"
                              : "var(--cream-soft, #d4c4a8)",
                          display: "flex",
                          gap: 8,
                          lineHeight: 1.5,
                        }}
                      >
                        <span
                          style={{
                            color:
                              v === "—"
                                ? "var(--muted)"
                                : "var(--saffron)",
                            flexShrink: 0,
                            fontWeight: 700,
                            minWidth: 20,
                            textAlign: "center",
                          }}
                        >
                          {v === "—" ? "—" : v === "✓" ? "✓" : v}
                        </span>
                        {f.label}
                      </li>
                    );
                  })}
                </ul>

                <button
                  type="button"
                  disabled={isCurrent || busy === plan.code}
                  onClick={() => chooseplan(plan)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: isCurrent
                      ? "rgba(232,163,61,0.12)"
                      : isUpgrade
                        ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
                        : "rgba(244,228,193,0.06)",
                    color: isCurrent
                      ? "var(--saffron)"
                      : isUpgrade
                        ? "#16111E"
                        : "var(--cream)",
                    border:
                      isCurrent || isUpgrade
                        ? "none"
                        : "1px solid rgba(244,228,193,0.15)",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isCurrent ? "default" : "pointer",
                    opacity: busy === plan.code ? 0.6 : 1,
                  }}
                >
                  {isCurrent
                    ? t("plans.currentBadge")
                    : busy === plan.code
                      ? t("plans.activating")
                      : plan.priceCents === 0
                        ? t("plans.revert")
                        : t("plans.chooseAction", { plan: plan.name })}
                </button>
              </div>
            );
          })}
        </div>

        <p
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textAlign: "center",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {t("plans.footer")}
        </p>

        {/* V50.2 — BoosterPurchaseCard désormais aussi visible sur desktop.
            Une oubliée lors de la séparation MobilePlansView : un user
            desktop a tout autant vocation à acheter +100 scans IA. */}
        <BoosterPurchaseCard />
        {/* V151 — Tarifs signatures eIDAS (auto-cachés si tout désactivé) */}
        <SignaturePricingSection />
      </div>

      <style jsx global>{`
        @media (min-width: 769px) {
          .plans-grid {
            grid-template-columns: repeat(
              auto-fit,
              minmax(260px, 1fr)
            ) !important;
            gap: 18px !important;
          }
        }
      `}</style>
    </ResponsiveShell>
  );
}
