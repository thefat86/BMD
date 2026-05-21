"use client";

/**
 * <MobilePlansView> · V40 — refonte plans mobile, carrousel premium.
 *
 * Innovation visuelle :
 *  1. CARROUSEL CARTES — chaque plan est une "carte de membre" qu'on swipe
 *     horizontalement (scroll-snap CSS, pas de lib JS lourde). Chaque carte
 *     a sa propre visual identity (couleur, halo, badge "actuel").
 *  2. TOGGLE Mensuel / Annuel prominent en haut avec calcul d'économies réel.
 *  3. FEATURES en colonne verticale sous le carrousel, icônes outlined,
 *     mises à jour selon le plan sélectionné (highlight).
 *  4. CTA STICKY BAS — bouton plein avec prix, comportement banking
 *     (haptic + boucle paiement Stripe).
 *
 * Pour l'instant on supporte les 2 plans payants principaux (PLUS / PRO) +
 * FREE. Si l'API retourne plus de plans, ils sont tous affichés en swipe.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { haptic } from "../platform";

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

type Interval = "month" | "year";

const ZERO_DECIMAL = new Set([
  "XAF",
  "XOF",
  "JPY",
  "KRW",
  "VND",
  "RWF",
  "UGX",
  "BIF",
  "DJF",
  "GNF",
  "KMF",
  "MGA",
  "MWK",
  "TZS",
]);
const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
  CAD: "$CA",
  XAF: "FCFA",
  XOF: "FCFA",
  MAD: "DH",
  DZD: "DA",
  TND: "DT",
  NGN: "₦",
  KES: "Ksh",
  GHS: "GH₵",
  ZAR: "R",
  UGX: "USh",
  TZS: "TSh",
  CNY: "¥",
  INR: "₹",
  IDR: "Rp",
  PHP: "₱",
  VND: "₫",
};

function formatMoney(cents: number, currency: string): string {
  const cur = currency || "EUR";
  const symbol = CURRENCY_SYMBOL[cur] ?? cur;
  const value = ZERO_DECIMAL.has(cur) ? cents : cents / 100;
  const formatted = ZERO_DECIMAL.has(cur)
    ? value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
    : value.toFixed(value % 1 === 0 ? 0 : 2).replace(".", ",");
  const symbolBefore = [
    "€",
    "$",
    "£",
    "$CA",
    "¥",
    "₦",
    "₹",
    "₱",
    "₫",
  ].includes(symbol);
  return symbolBefore ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

/**
 * Couleurs identitaires par plan. On essaie de matcher avec une heuristique
 * sur le code (FREE/PLUS/PRO/PREMIUM/etc.). Fallback = saffron.
 */
function planTheme(code: string): {
  gradient: string;
  border: string;
  badge: string;
  haloColor: string;
  iconBg: string;
} {
  const c = code.toUpperCase();
  if (c.includes("FREE") || c === "GRATUIT") {
    return {
      gradient: "linear-gradient(135deg, #2A2244 0%, #3A2A52 100%)",
      border: "rgba(244,228,193,0.18)",
      badge: "rgba(244,228,193,0.10)",
      haloColor: "rgba(244,228,193,0.18)",
      iconBg: "rgba(244,228,193,0.08)",
    };
  }
  if (c.includes("PRO") || c.includes("PREMIUM") || c.includes("BUSINESS")) {
    return {
      gradient: "linear-gradient(135deg, #4A3568 0%, #B54732 60%, #E8A33D 100%)",
      border: "rgba(232,163,61,0.45)",
      badge: "rgba(232,163,61,0.20)",
      haloColor: "rgba(232,163,61,0.30)",
      iconBg: "rgba(232,163,61,0.18)",
    };
  }
  if (c.includes("PLUS") || c.includes("STANDARD")) {
    return {
      gradient: "linear-gradient(135deg, #1F2966 0%, #3A2A52 60%, #5B6CFF 100%)",
      border: "rgba(91,108,255,0.40)",
      badge: "rgba(91,108,255,0.18)",
      haloColor: "rgba(91,108,255,0.28)",
      iconBg: "rgba(91,108,255,0.16)",
    };
  }
  // Default = teal
  return {
    gradient: "linear-gradient(135deg, #1A3D3A 0%, #2A5C57 60%, #7DC59E 100%)",
    border: "rgba(125,197,158,0.40)",
    badge: "rgba(125,197,158,0.18)",
    haloColor: "rgba(125,197,158,0.28)",
    iconBg: "rgba(125,197,158,0.16)",
  };
}

export function MobilePlansView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const toast = useToast();
  const t = useT();

  const [me, setMe] = useState<any>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [regionName, setRegionName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("month");

  const upgradeTarget = searchParams?.get("upgrade") ?? null;

  // ID de plan sélectionné (carte au centre du carrousel)
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void Promise.all([api.me(), api.listPlans()])
      .then(([m, ps]) => {
        setMe(m.user);
        const sorted = ps.plans
          .filter((p) => p.isActive)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        setPlans(sorted);
        setRegionName(ps.regionName);
        // Sélection initiale : si upgrade=PRO dans l'URL, on scrolle dessus ;
        // sinon plan actuel ; sinon premier plan.
        const initial =
          upgradeTarget ??
          m.user?.planCode ??
          sorted[0]?.code ??
          null;
        setSelectedCode(initial);
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
  }, [router, upgradeTarget]);

  // Scroll vers le plan sélectionné après mount initial
  useEffect(() => {
    if (!selectedCode || !carouselRef.current) return;
    const idx = plans.findIndex((p) => p.code === selectedCode);
    if (idx < 0) return;
    const card = carouselRef.current.children[idx] as HTMLElement | undefined;
    if (card) {
      // Scroll natif avec smooth, marche bien iOS/Android
      card.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
    // On ne re-déclenche pas à chaque selectedCode change pour éviter le
    // war de scroll (le user scrolle = on met à jour, mais on ne scrolle pas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const currentPlanCode = me?.planCode ?? "FREE";
  const selectedPlan = useMemo(
    () => plans.find((p) => p.code === selectedCode) ?? null,
    [plans, selectedCode],
  );

  async function choosePlan(plan: Plan) {
    if (plan.code === currentPlanCode) return;
    haptic("tap");

    // FREE : pas de paiement → confirm + changeMyPlan
    if (plan.priceCents === 0) {
      const ok = await dialog.confirm(
        t("plans.confirmRevert", { plan: plan.name }) ||
          `Repasser au plan ${plan.name} ?`,
        {
          variant: "info",
          title: t("plans.confirmRevertTitle") || "Changement de plan",
          confirmLabel: t("plans.confirmRevertConfirm") || "Confirmer",
          cancelLabel: t("common.cancel") || "Annuler",
        },
      );
      if (!ok) return;
      setBusy(plan.code);
      setError(null);
      try {
        await api.changeMyPlan(plan.code);
        haptic("success");
        toast.success(
          t("plans.successBody", { plan: plan.name }) ||
            `Tu es passé au plan ${plan.name}`,
        );
        const m = await api.me();
        setMe(m.user);
      } catch (e) {
        setError((e as Error).message);
        haptic("error");
      } finally {
        setBusy(null);
      }
      return;
    }

    // Plan payant → Stripe Checkout
    setBusy(plan.code);
    setError(null);
    try {
      const session = await api.createCheckoutSession({
        planCode: plan.code,
        interval,
      });
      window.location.href = session.url;
    } catch (e) {
      setError((e as Error).message);
      haptic("error");
      setBusy(null);
    }
  }

  if (loading) return <PlansSkeleton />;
  if (error && plans.length === 0) {
    return (
      <div style={{ padding: "20px 16px" }}>
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(217,113,74,0.10)",
            border: "1px solid rgba(217,113,74,0.30)",
            color: "#FFB89A",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      </div>
    );
  }
  if (plans.length === 0) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center" }}>
        <p style={{ color: "var(--cream-soft)" }}>
          {t("plans.noPlans") || "Aucun plan disponible pour ta région."}
        </p>
      </div>
    );
  }

  const intervalSavings = computeYearlySavings(plans);

  return (
    <div
      style={{
        padding: "0 0 110px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* En-tête */}
      <header style={{ padding: "0 16px" }}>
        <h1
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--cream)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {t("plans.title") || "Choisis ton plan"}
        </h1>
        {regionName && (
          <p
            style={{
              fontSize: 12,
              color: "var(--cream-soft)",
              margin: "6px 0 0",
              opacity: 0.85,
            }}
          >
            {t("plans.regionHint", { region: regionName }) ||
              `Tarifs adaptés pour ${regionName}`}
          </p>
        )}
      </header>

      {/* Toggle Mensuel / Annuel */}
      {plans.some((p) => p.priceCentsYearly !== null) && (
        <div style={{ padding: "0 16px" }}>
          <div
            role="tablist"
            style={{
              display: "flex",
              gap: 6,
              padding: 4,
              borderRadius: 12,
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.06)",
            }}
          >
            <IntervalPill
              active={interval === "month"}
              onClick={() => setInterval("month")}
              label={t("plans.monthly") || "Mensuel"}
            />
            <IntervalPill
              active={interval === "year"}
              onClick={() => setInterval("year")}
              label={t("plans.yearly") || "Annuel"}
              badge={
                intervalSavings > 0
                  ? `-${intervalSavings}%`
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* ⬤⬤⬤ CARROUSEL CARTES PLANS ⬤⬤⬤ */}
      <div
        ref={carouselRef}
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          padding: "4px 16px 14px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
        onScroll={(e) => {
          // Détecter quelle carte est au centre pour la sélection
          const container = e.currentTarget;
          const centerX = container.scrollLeft + container.clientWidth / 2;
          let bestIdx = 0;
          let bestDistance = Infinity;
          Array.from(container.children).forEach((child, idx) => {
            const el = child as HTMLElement;
            const childCenter = el.offsetLeft + el.offsetWidth / 2;
            const distance = Math.abs(childCenter - centerX);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIdx = idx;
            }
          });
          const next = plans[bestIdx]?.code;
          if (next && next !== selectedCode) setSelectedCode(next);
        }}
      >
        {plans.map((plan) => {
          const isCurrent = plan.code === currentPlanCode;
          const isSelected = plan.code === selectedCode;
          const theme = planTheme(plan.code);
          const priceCents =
            interval === "year" && plan.priceCentsYearly !== null
              ? plan.priceCentsYearly
              : plan.priceCents;
          const priceCentsPerMonth =
            interval === "year" && plan.priceCentsYearly !== null
              ? Math.round(plan.priceCentsYearly / 12)
              : plan.priceCents;
          return (
            <PlanCard
              key={plan.code}
              plan={plan}
              theme={theme}
              isCurrent={isCurrent}
              isSelected={isSelected}
              interval={interval}
              priceCents={priceCents}
              priceCentsPerMonth={priceCentsPerMonth}
              onTap={() => setSelectedCode(plan.code)}
              t={t}
            />
          );
        })}
      </div>

      {/* Pagination dots */}
      <div
        style={{
          display: "flex",
          gap: 6,
          justifyContent: "center",
          padding: "4px 0",
        }}
      >
        {plans.map((p) => (
          <span
            key={p.code}
            aria-hidden
            style={{
              width: p.code === selectedCode ? 18 : 6,
              height: 6,
              borderRadius: 999,
              background:
                p.code === selectedCode
                  ? "linear-gradient(90deg, var(--saffron), var(--terracotta))"
                  : "rgba(244,228,193,0.18)",
              transition: "width 0.25s ease",
            }}
          />
        ))}
      </div>

      {/* Features détaillées du plan sélectionné */}
      {selectedPlan && (
        <PlanFeatures plan={selectedPlan} t={t} />
      )}

      {error && (
        <div
          style={{
            margin: "0 16px",
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(217,113,74,0.10)",
            border: "1px solid rgba(217,113,74,0.30)",
            color: "#FFB89A",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {/* V50 · BANNER LIFETIME — capture les early adopters engagés.
          Affiché en bas du carrousel, pas dans le scroll des plans réguliers
          pour ne pas le banaliser. Reste discret en signature cocoa profond
          avec accent saffron. Caché si l'user a déjà LIFETIME_PERSONAL. */}
      {currentPlanCode !== "LIFETIME_PERSONAL" && (
        <LifetimeBanner
          plans={plans}
          busy={busy === "LIFETIME_PERSONAL"}
          onChoose={(plan) => choosePlan(plan)}
          t={t}
        />
      )}

      {/* CTA STICKY BAS */}
      {selectedPlan && (
        <StickyCta
          plan={selectedPlan}
          isCurrent={selectedPlan.code === currentPlanCode}
          interval={interval}
          busy={busy === selectedPlan.code}
          onChoose={() => choosePlan(selectedPlan)}
          t={t}
        />
      )}
    </div>
  );
}

// ============ V50 · LIFETIME BANNER ============

/**
 * Banner Lifetime — capture les early adopters engagés sans cannibaliser
 * le MRR récurrent. Positionné à 99 € (~ 2,5 ans de Perso annuel).
 *
 * Caché automatiquement si :
 *  - L'user a déjà LIFETIME_PERSONAL (rien à vendre)
 *  - Le plan LIFETIME_PERSONAL n'existe pas (pas seed ou _hidden=true)
 */
function LifetimeBanner({
  plans,
  busy,
  onChoose,
  t,
}: {
  plans: Plan[];
  busy: boolean;
  onChoose: (plan: Plan) => void;
  t: ReturnType<typeof useT>;
}) {
  const lifetimePlan = plans.find((p) => p.code === "LIFETIME_PERSONAL");
  if (!lifetimePlan) return null;

  const formatted = formatMoney(
    lifetimePlan.priceCents,
    lifetimePlan.currency || "EUR",
  );

  return (
    <button
      type="button"
      onClick={() => {
        if (!busy) onChoose(lifetimePlan);
      }}
      disabled={busy}
      style={{
        width: "100%",
        marginTop: 18,
        marginBottom: 12,
        background:
          "linear-gradient(135deg, #16111E 0%, #2A2244 100%)",
        color: "var(--cream, #F4E4C1)",
        border: "1px solid rgba(232,163,61,0.30)",
        borderRadius: 18,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: busy ? "wait" : "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        boxShadow: "0 14px 38px rgba(20,16,30,0.22)",
        opacity: busy ? 0.7 : 1,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Halo saffron */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(232,163,61,0.30) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background:
            "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))",
          color: "#16111E",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* Étoile SVG (sans emoji) */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <span
          style={{
            display: "block",
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1.2,
            color: "var(--cream, #F4E4C1)",
          }}
        >
          {t("plans.lifetimeTitle") || "Perso à vie"}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: "rgba(244,228,193,0.70)",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {t("plans.lifetimeSubtitle") ||
            "Paie une fois · profite à vie · adieu les renouvellements"}
        </span>
      </span>
      <span
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          color: "var(--saffron, #E8A33D)",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {formatted}
      </span>
    </button>
  );
}

// ============ PLAN CARD ============

function PlanCard({
  plan,
  theme,
  isCurrent,
  isSelected,
  interval,
  priceCents,
  priceCentsPerMonth,
  onTap,
  t,
}: {
  plan: Plan;
  theme: ReturnType<typeof planTheme>;
  isCurrent: boolean;
  isSelected: boolean;
  interval: Interval;
  priceCents: number;
  priceCentsPerMonth: number;
  onTap: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        flexShrink: 0,
        scrollSnapAlign: "center",
        // V41.2 — Largeur plus généreuse : sur 320px on prend 88vw, sur larger
        // 88vw monte vers 320px (cap). Combiné au padding 16px du parent,
        // pas de débordement.
        width: "min(88vw, 320px)",
        minHeight: 260,
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <div
        style={{
          position: "relative",
          padding: "22px 20px",
          borderRadius: 22,
          background: theme.gradient,
          border: `1px solid ${theme.border}`,
          overflow: "hidden",
          height: "100%",
          minHeight: 260,
          color: "var(--cream)",
          textAlign: "left",
          transform: isSelected ? "scale(1)" : "scale(0.96)",
          opacity: isSelected ? 1 : 0.75,
          transition: "transform 0.25s ease, opacity 0.25s ease",
          boxShadow: isSelected
            ? "0 18px 60px rgba(14,11,20,0.55)"
            : "0 8px 22px rgba(14,11,20,0.30)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Halo signature */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.haloColor}, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        {/* Badge actuel */}
        {isCurrent && (
          <span
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              fontSize: 10,
              fontWeight: 800,
              padding: "3px 9px",
              borderRadius: 999,
              background: theme.badge,
              color: "var(--cream)",
              border: "1px solid rgba(244,228,193,0.30)",
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            ✓ {t("plans.currentBadge") || "Actuel"}
          </span>
        )}

        {/* Identité plan */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              opacity: 0.7,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {t("plans.planLabel") || "Plan"}
          </div>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 32,
              fontWeight: 700,
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {plan.name}
          </div>
          {plan.description && (
            <div
              style={{
                fontSize: 12,
                opacity: 0.85,
                lineHeight: 1.5,
                marginTop: 4,
              }}
            >
              {plan.description}
            </div>
          )}
        </div>

        {/* Prix */}
        <div style={{ position: "relative", marginTop: "auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 38,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {plan.priceCents === 0
                ? t("plans.free") || "Gratuit"
                : interval === "year"
                  ? formatMoney(priceCentsPerMonth, plan.currency)
                  : formatMoney(priceCents, plan.currency)}
            </span>
            {plan.priceCents > 0 && (
              <span
                style={{
                  fontSize: 12,
                  opacity: 0.85,
                  fontWeight: 500,
                }}
              >
                /{t("plans.perMonth") || "mois"}
              </span>
            )}
          </div>
          {plan.priceCents > 0 && interval === "year" && (
            <div
              style={{
                fontSize: 11,
                opacity: 0.75,
                marginTop: 4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {t("plans.billedYearly", {
                amount: formatMoney(priceCents, plan.currency),
              }) ||
                `Facturé ${formatMoney(priceCents, plan.currency)} par an`}
            </div>
          )}
          {plan.isRegionalPrice && plan.priceCents > 0 && (
            <div
              style={{
                fontSize: 10,
                marginTop: 4,
                opacity: 0.65,
                letterSpacing: 0.4,
              }}
            >
              🌍 {t("plans.regionalPrice") || "Tarif local"}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ============ INTERVAL PILL ============

function IntervalPill({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 8px",
        background: active
          ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
          : "transparent",
        color: active ? "var(--night-2, #16111E)" : "var(--cream-soft)",
        border: "none",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span>{label}</span>
      {badge && (
        <span
          style={{
            fontSize: 9,
            padding: "1px 6px",
            borderRadius: 999,
            background: active ? "rgba(22,17,30,0.18)" : "rgba(125,197,158,0.20)",
            color: active ? "#16111E" : "#7DC59E",
            fontWeight: 800,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ============ PLAN FEATURES (sous le carrousel) ============

function PlanFeatures({
  plan,
  t,
}: {
  plan: Plan;
  t: ReturnType<typeof useT>;
}) {
  const limits = plan.limits ?? {};
  // On essaie d'extraire des features lisibles depuis l'objet limits.
  // Pattern observé : { maxGroups: 3, maxMembersPerGroup: 5, exportPdf: true, ... }
  const features = useMemo(
    () => buildFeaturesList(limits, plan.code, t),
    [limits, plan.code, t],
  );

  return (
    <section style={{ padding: "0 16px", marginTop: 4 }}>
      <h3
        style={{
          fontSize: 10,
          color: "var(--saffron)",
          letterSpacing: 1.6,
          textTransform: "uppercase",
          fontWeight: 700,
          margin: "0 0 10px 4px",
        }}
      >
        {t("plans.featuresIn", { plan: plan.name }) ||
          `Inclus dans ${plan.name}`}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {features.map((f, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "rgba(244,228,193,0.03)",
              border: "1px solid rgba(244,228,193,0.06)",
              borderRadius: 12,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: f.included
                  ? "rgba(125,197,158,0.16)"
                  : "rgba(244,228,193,0.06)",
                color: f.included ? "#7DC59E" : "var(--muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {f.included ? "✓" : "○"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: f.included ? "var(--cream)" : "var(--cream-soft)",
                  opacity: f.included ? 1 : 0.7,
                }}
              >
                {f.label}
              </div>
              {f.subtitle && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginTop: 1,
                  }}
                >
                  {f.subtitle}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface Feature {
  label: string;
  subtitle?: string;
  included: boolean;
}

function buildFeaturesList(
  limits: Record<string, any>,
  planCode: string,
  t: ReturnType<typeof useT>,
): Feature[] {
  // Heuristique pragmatique : on lit les clés de `limits` et on construit
  // une liste lisible. Pour un MVP V40 on hardcode les features prioritaires
  // visibles dans la maquette desktop.
  const features: Feature[] = [];
  const code = planCode.toUpperCase();

  // Nombre max de groupes
  const maxGroups = limits.maxGroups ?? limits.groupsMax ?? null;
  features.push({
    label:
      maxGroups === null || maxGroups < 0
        ? t("plans.featGroupsUnlimited") || "Groupes illimités"
        : t("plans.featGroupsLimit", { n: String(maxGroups) }) ||
          `Jusqu'à ${maxGroups} groupe${maxGroups > 1 ? "s" : ""}`,
    included: true,
  });

  // Membres par groupe
  const maxMembers = limits.maxMembersPerGroup ?? limits.membersMax ?? null;
  features.push({
    label:
      maxMembers === null || maxMembers < 0
        ? t("plans.featMembersUnlimited") || "Membres illimités par groupe"
        : t("plans.featMembersLimit", { n: String(maxMembers) }) ||
          `${maxMembers} membres / groupe`,
    included: true,
  });

  // Exports
  features.push({
    label: t("plans.featExportPdf") || "Export PDF / Excel / CSV",
    included: !!(limits.exportPdf ?? limits.exports ?? code !== "FREE"),
  });

  // Scan OCR
  features.push({
    label: t("plans.featOcr") || "Scan reçus OCR",
    subtitle: t("plans.featOcrHint") || "Détection auto du montant et du marchand",
    included: !!(limits.ocrScan ?? code !== "FREE"),
  });

  // Tontines
  features.push({
    label: t("plans.featTontines") || "Tontines & rotations",
    included: !!(limits.tontines ?? true),
  });

  // Passkeys
  features.push({
    label: t("plans.featPasskeys") || "Connexion Passkey (Face ID / Touch ID)",
    included: !!(limits.passkeys ?? true),
  });

  // 2FA
  features.push({
    label: t("plans.feat2fa") || "Double authentification 2FA",
    included: !!(limits.twoFactor ?? code !== "FREE"),
  });

  // Support prioritaire
  features.push({
    label: t("plans.featSupport") || "Support prioritaire",
    subtitle: t("plans.featSupportHint") || "Réponse sous 24 h ouvrées",
    included: !!(limits.prioritySupport ?? (code.includes("PRO") || code.includes("PREMIUM"))),
  });

  return features;
}

// ============ STICKY CTA ============

function StickyCta({
  plan,
  isCurrent,
  interval,
  busy,
  onChoose,
  t,
}: {
  plan: Plan;
  isCurrent: boolean;
  interval: Interval;
  busy: boolean;
  onChoose: () => void;
  t: ReturnType<typeof useT>;
}) {
  const priceCents =
    interval === "year" && plan.priceCentsYearly !== null
      ? plan.priceCentsYearly
      : plan.priceCents;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 86, // au-dessus du bottom-nav (56px) + safe-area
        padding: "10px 16px",
        background:
          "linear-gradient(180deg, rgba(14,11,20,0.0), rgba(14,11,20,0.85))",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <button
        type="button"
        onClick={onChoose}
        disabled={isCurrent || busy}
        style={{
          width: "100%",
          padding: "14px 18px",
          background: isCurrent
            ? "rgba(244,228,193,0.10)"
            : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
          color: isCurrent ? "var(--cream-soft)" : "#16111E",
          border: "none",
          borderRadius: 16,
          fontSize: 14.5,
          fontWeight: 700,
          cursor: isCurrent ? "default" : "pointer",
          fontFamily: "inherit",
          boxShadow: isCurrent ? "none" : "0 16px 40px rgba(232,163,61,0.35)",
          opacity: busy ? 0.7 : 1,
          pointerEvents: "auto",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {busy ? (
          <span>{t("common.loading") || "Chargement…"}</span>
        ) : isCurrent ? (
          <span>
            ✓ {t("plans.currentPlanCta", { plan: plan.name }) || `Plan actuel · ${plan.name}`}
          </span>
        ) : plan.priceCents === 0 ? (
          <span>
            {t("plans.revertCta", { plan: plan.name }) ||
              `Repasser à ${plan.name}`}
          </span>
        ) : (
          <>
            <span>
              {t("plans.subscribeCta", { plan: plan.name }) ||
                `Passer à ${plan.name}`}
            </span>
            <span
              style={{
                fontSize: 12,
                opacity: 0.85,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
              }}
            >
              · {formatMoney(priceCents, plan.currency)}/
              {interval === "year"
                ? t("plans.perYear") || "an"
                : t("plans.perMonth") || "mois"}
            </span>
          </>
        )}
      </button>
    </div>
  );
}

// ============ SKELETON ============

function PlansSkeleton() {
  return (
    <div
      style={{
        padding: "16px 16px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          height: 36,
          width: "60%",
          borderRadius: 8,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-pl-skel 1.2s infinite ease-in-out",
        }}
      />
      <div
        style={{
          height: 44,
          borderRadius: 12,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-pl-skel 1.2s infinite ease-in-out 0.1s",
        }}
      />
      <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              flexShrink: 0,
              width: 280,
              height: 260,
              borderRadius: 22,
              background: "rgba(244,228,193,0.04)",
              animation: `bmd-pl-skel 1.2s infinite ease-in-out ${0.2 + i * 0.1}s`,
            }}
          />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 44,
            borderRadius: 12,
            background: "rgba(244,228,193,0.04)",
            animation: `bmd-pl-skel 1.2s infinite ease-in-out ${0.3 + i * 0.05}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes bmd-pl-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ============ HELPERS ============

function computeYearlySavings(plans: Plan[]): number {
  // Calcule un % moyen d'économie annuelle sur les plans payants qui ont un
  // priceCentsYearly. Retourne 0 si aucun n'a de tarif annuel.
  const eligible = plans.filter(
    (p) => p.priceCents > 0 && p.priceCentsYearly !== null,
  );
  if (eligible.length === 0) return 0;
  let sum = 0;
  for (const p of eligible) {
    const monthlyOverYear = p.priceCents * 12;
    if (monthlyOverYear <= 0) continue;
    const saving =
      ((monthlyOverYear - (p.priceCentsYearly ?? monthlyOverYear)) /
        monthlyOverYear) *
      100;
    sum += saving;
  }
  return Math.round(sum / eligible.length);
}
