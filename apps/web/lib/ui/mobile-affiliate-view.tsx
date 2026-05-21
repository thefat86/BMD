"use client";

/**
 * <MobileAffiliateView> · V41 — refonte affiliate mobile, carte parrain.
 *
 * Innovation visuelle :
 *  1. CARTE DE PARRAIN — type Apple Wallet, gradient saffron→indigo, code
 *     en très gros (Cormorant Garamond), avec bouton "Partager" natif.
 *  2. GAUGES GAMIFIÉES — anneau de progression vers le palier suivant +
 *     compteurs L1/L2/L3 en cards colorées.
 *  3. EARNINGS TRACKER — pending / payable / paid en 3 cards horizontales
 *     avec mini-barre de progression visuelle.
 *  4. NETWORK RING — visualisation simple du réseau (toi au centre,
 *     L1 autour, L2 plus loin) en SVG.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useToast } from "./toast";
import { useT } from "../i18n/app-strings";
import { haptic } from "../platform";
// V164.H5 — Avantages parrain dynamiques (5 mécaniques A-E configurables admin)
import { ReferralBenefitsBanner } from "./referral-benefits-banner";

interface Dash {
  isAffiliate: boolean;
  affiliateCode: string | null;
  kycStatus: string;
  l1Count: number;
  l2Count: number;
  l3Count: number;
  pendingCents: number;
  payableCents: number;
  paidCents: number;
}

interface Referral {
  code: string;
  totalReferred: number;
  totalRedeemed: number;
}

// V41.2 — Réseau détaillé (liste filleuls L1) + dernières commissions
interface NetworkMember {
  id: string;
  displayName: string;
  avatar: string | null;
  defaultCurrency: string;
  planCode: string;
  subscriptionStatus: string;
  joinedAt: string;
  subL2Count: number;
  totalPendingCents: number;
  totalPayableCents: number;
  totalPaidCents: number;
  // V177.C — Avantage filleul (estimé centimes EUR) + plan payant ?
  discountSavedCents?: number;
  hasPayingPlan?: boolean;
}
interface Commission {
  id: string;
  payer: { id: string; displayName: string; avatar: string | null };
  level: number;
  percent: number;
  sourceCurrency: string;
  sourceAmountCents: number;
  payoutCurrency: string;
  payoutAmountCents: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

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

function formatMoneyCents(cents: number, currency: string): string {
  const cur = currency || "EUR";
  const value = ZERO_DECIMAL.has(cur) ? cents : cents / 100;
  return `${value.toLocaleString("fr-FR", {
    maximumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : 2,
  })} ${cur}`;
}

export function MobileAffiliateView() {
  const router = useRouter();
  const toast = useToast();
  const t = useT();

  const [dash, setDash] = useState<Dash | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  // V41.2 — Network + commissions
  const [network, setNetwork] = useState<NetworkMember[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  // V177.B — Infos parrain actuel (verrou one-shot)
  const [referrerInfo, setReferrerInfo] = useState<
    Awaited<ReturnType<typeof api.getMyReferrer>> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r, n, myRef] = await Promise.all([
        api.getAffiliateDashboard().catch(() => null),
        api.getMyReferralCode().catch(() => null),
        // Network = optionnel (uniquement si affiliate actif)
        api
          .getAffiliateNetwork()
          .catch(() => ({ network: [], recentCommissions: [] })),
        api.getMyReferrer().catch(() => null),
      ]);
      setDash(d);
      setReferral(r);
      setNetwork(n.network ?? []);
      setCommissions(n.recentCommissions ?? []);
      setReferrerInfo(myRef);
      setError(null);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <AffiliateSkeleton />;

  // Mode parrainage simple (référral code) — visible pour tout le monde
  // Mode affiliate (commercial) — visible si activé
  const refCode = referral?.code ?? null;
  const isAffiliate = !!dash?.isAffiliate;
  const affiliateCode = dash?.affiliateCode ?? null;
  // Code prioritaire : affiliate > referral
  const displayCode = affiliateCode ?? refCode;
  const shareUrl =
    typeof window !== "undefined" && displayCode
      ? `${window.location.origin}/?ref=${displayCode}`
      : "";

  async function copyCode() {
    if (!displayCode) return;
    try {
      await navigator.clipboard.writeText(displayCode);
      haptic("success");
      toast.success(
        t("affiliate.codeCopied") || "Code copié dans le presse-papier",
      );
    } catch {
      toast.warning(t("common.copyFailed") || "Échec de la copie");
    }
  }

  async function shareInvite() {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: t("affiliate.shareTitle") || "Rejoins-moi sur BMD",
          text:
            t("affiliate.shareText", { code: displayCode! }) ||
            `Découvre BMD pour partager dépenses et tontines avec tes proches. Utilise mon code ${displayCode}.`,
          url: shareUrl,
        });
        haptic("success");
      } catch {
        /* annulé — silent */
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t("affiliate.linkCopied") || "Lien copié");
      } catch {
        toast.warning(t("common.copyFailed") || "Échec de la copie");
      }
    }
  }

  return (
    <div
      style={{
        padding: "0 16px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* === CARTE DE PARRAIN === */}
      <PatronCard
        code={displayCode}
        isAffiliate={isAffiliate}
        totalReferred={referral?.totalReferred ?? 0}
        onCopy={copyCode}
        onShare={shareInvite}
        t={t}
      />

      {/* V177.B — Vue filleul : verrou + infos parrain (acquis à vie) */}
      {referrerInfo?.referrer && (
        <MobileReferrerCard info={referrerInfo} t={t} />
      )}

      {/* V164.H5 — Bandeau avantages parrain dynamiques (mois gratuits, crédits
          IA, points, badges) en mode compact mobile (tiles 2×2). */}
      <ReferralBenefitsBanner compact />

      {/* === Si non-affiliate : pitch pour rejoindre === */}
      {!isAffiliate && (
        <BecomeAffiliateCta t={t} />
      )}

      {/* === GAUGE NETWORK (si affiliate) === */}
      {isAffiliate && dash && (
        <NetworkSection dash={dash} t={t} />
      )}

      {/* === EARNINGS (si affiliate) === */}
      {isAffiliate && dash && (
        <EarningsSection
          dash={dash}
          t={t}
        />
      )}

      {/* V41.2 — Liste détaillée des filleuls L1 (uniquement si affiliate) */}
      {isAffiliate && network.length > 0 && (
        <NetworkList network={network} t={t} />
      )}

      {/* V41.2 — Dernières commissions (10 max) */}
      {isAffiliate && commissions.length > 0 && (
        <CommissionsList commissions={commissions} t={t} />
      )}

      {/* === KYC status === */}
      {isAffiliate && dash && (
        <KycBanner status={dash.kycStatus} t={t} />
      )}

      {error && (
        <div
          style={{
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
    </div>
  );
}

// ============ CARTE DE PARRAIN (Apple Wallet style) ============

function PatronCard({
  code,
  isAffiliate,
  totalReferred,
  onCopy,
  onShare,
  t,
}: {
  code: string | null;
  isAffiliate: boolean;
  totalReferred: number;
  onCopy: () => void;
  onShare: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <section
      style={{
        position: "relative",
        padding: "22px 20px",
        borderRadius: 24,
        background: isAffiliate
          ? "linear-gradient(135deg, #4A3568 0%, #B54732 60%, #E8A33D 100%)"
          : "linear-gradient(135deg, #1F2966 0%, #3A2A52 60%, #5B6CFF 100%)",
        border: `1px solid ${isAffiliate ? "rgba(232,163,61,0.45)" : "rgba(91,108,255,0.40)"}`,
        boxShadow: "0 18px 60px rgba(14,11,20,0.55)",
        overflow: "hidden",
        minHeight: 200,
        color: "var(--cream)",
      }}
    >
      {/* Halo signature */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: isAffiliate
            ? "radial-gradient(circle, rgba(232,163,61,0.36), transparent 70%)"
            : "radial-gradient(circle, rgba(91,108,255,0.32), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* Patron icon */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              opacity: 0.8,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {isAffiliate
              ? t("affiliate.cardLabelPro") || "Carte Partenaire"
              : t("affiliate.cardLabelRef") || "Carte Parrain"}
          </div>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            BMD
          </div>
        </div>
        <span
          aria-hidden
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: "rgba(244,228,193,0.18)",
            border: "1px solid rgba(244,228,193,0.30)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          {isAffiliate ? "💎" : "🎁"}
        </span>
      </div>

      {/* Code en gros */}
      <div style={{ position: "relative", minWidth: 0, maxWidth: "100%" }}>
        <div
          style={{
            fontSize: 10,
            opacity: 0.85,
            letterSpacing: 0.6,
            marginBottom: 6,
          }}
        >
          {t("affiliate.yourCode") || "Ton code"}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            // V41.2 — clamp() : sur 320px le code aura ~26px, sur 400+ il sera ~38px
            fontSize: "clamp(24px, 10vw, 38px)",
            fontWeight: 700,
            letterSpacing: 1,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            wordBreak: "break-all",
            overflowWrap: "anywhere",
            maxWidth: "100%",
          }}
        >
          {code ?? "—"}
        </div>
      </div>

      {/* Stats + actions */}
      <div
        style={{
          position: "relative",
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(244,228,193,0.10)",
            border: "1px solid rgba(244,228,193,0.18)",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              opacity: 0.85,
              letterSpacing: 0.4,
            }}
          >
            {t("affiliate.referredCount") || "Parrainés"}
          </div>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 20,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              marginTop: 2,
            }}
          >
            {totalReferred}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={t("affiliate.copyCode") || "Copier le code"}
          style={miniIconBtn()}
        >
          <IconCopy />
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label={t("affiliate.shareLink") || "Partager"}
          style={{ ...miniIconBtn(), background: "var(--cream)", color: "#16111E" }}
        >
          <IconShare />
        </button>
      </div>
    </section>
  );
}

function miniIconBtn(): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "rgba(244,228,193,0.14)",
    border: "1px solid rgba(244,228,193,0.22)",
    color: "var(--cream)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  };
}

// ============ BECOME AFFILIATE CTA ============

function BecomeAffiliateCta({
  t,
}: {
  t: ReturnType<typeof useT>;
}) {
  return (
    <section
      style={{
        padding: "16px 14px",
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(232,163,61,0.02))",
        border: "1px dashed rgba(232,163,61,0.30)",
        borderRadius: 14,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>💎</div>
      <h3
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--cream)",
          margin: "0 0 6px",
        }}
      >
        {t("affiliate.becomeTitle") || "Deviens partenaire BMD"}
      </h3>
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {t("affiliate.becomeBody") ||
          "Touche une commission sur chaque ami qui s'abonne grâce à toi. Contacte-nous pour activer ton statut commercial."}
      </p>
    </section>
  );
}

// ============ NETWORK section ============

function NetworkSection({
  dash,
  t,
}: {
  dash: Dash;
  t: ReturnType<typeof useT>;
}) {
  const total = dash.l1Count + dash.l2Count + dash.l3Count;
  return (
    <section>
      <h3
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1.4,
          fontWeight: 700,
          margin: "0 0 10px 4px",
        }}
      >
        {t("affiliate.networkTitle") || "Ton réseau"}
      </h3>

      {/* Visual ring : toi au centre + 3 cercles concentriques pour L1/L2/L3 */}
      <div
        style={{
          padding: "16px 14px",
          background: "rgba(244,228,193,0.03)",
          border: "1px solid rgba(244,228,193,0.06)",
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <NetworkOrbits l1={dash.l1Count} l2={dash.l2Count} l3={dash.l3Count} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <NetworkLevelRow
            label="L1"
            color="#E8A33D"
            count={dash.l1Count}
            description={t("affiliate.l1Desc") || "Directement parrainés"}
          />
          <NetworkLevelRow
            label="L2"
            color="#5B6CFF"
            count={dash.l2Count}
            description={t("affiliate.l2Desc") || "Parrainés au 2e degré"}
          />
          <NetworkLevelRow
            label="L3"
            color="#7DC59E"
            count={dash.l3Count}
            description={t("affiliate.l3Desc") || "Parrainés au 3e degré"}
          />
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          fontSize: 11,
          color: "var(--cream-soft)",
          marginTop: 6,
        }}
      >
        {t("affiliate.totalNetwork", { n: String(total) }) ||
          `Total : ${total} membres dans ton réseau`}
      </div>
    </section>
  );
}

function NetworkOrbits({
  l1,
  l2,
  l3,
}: {
  l1: number;
  l2: number;
  l3: number;
}) {
  const size = 110;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <defs>
        <radialGradient id="bmd-aff-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--saffron, #e8a33d)" />
          <stop offset="100%" stopColor="var(--terracotta, #b54732)" />
        </radialGradient>
      </defs>
      {/* Orbits */}
      <circle
        cx={center}
        cy={center}
        r={48}
        fill="none"
        stroke="rgba(125,197,158,0.40)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <circle
        cx={center}
        cy={center}
        r={34}
        fill="none"
        stroke="rgba(91,108,255,0.45)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <circle
        cx={center}
        cy={center}
        r={20}
        fill="none"
        stroke="rgba(232,163,61,0.55)"
        strokeWidth="1.4"
      />
      {/* Dots L1 (3 dots) */}
      {Array.from({ length: Math.min(3, Math.max(1, l1)) }).map((_, i) => {
        const angle = (i / 3) * 2 * Math.PI - Math.PI / 2;
        return (
          <circle
            key={`l1-${i}`}
            cx={center + 20 * Math.cos(angle)}
            cy={center + 20 * Math.sin(angle)}
            r="3"
            fill="#E8A33D"
          />
        );
      })}
      {/* Dots L2 (4 dots) */}
      {Array.from({ length: Math.min(4, Math.max(1, l2)) }).map((_, i) => {
        const angle = (i / 4) * 2 * Math.PI - Math.PI / 4;
        return (
          <circle
            key={`l2-${i}`}
            cx={center + 34 * Math.cos(angle)}
            cy={center + 34 * Math.sin(angle)}
            r="2.5"
            fill="#5B6CFF"
          />
        );
      })}
      {/* Dots L3 (6 dots) */}
      {Array.from({ length: Math.min(6, Math.max(1, l3)) }).map((_, i) => {
        const angle = (i / 6) * 2 * Math.PI;
        return (
          <circle
            key={`l3-${i}`}
            cx={center + 48 * Math.cos(angle)}
            cy={center + 48 * Math.sin(angle)}
            r="2"
            fill="#7DC59E"
          />
        );
      })}
      {/* Centre : toi */}
      <circle cx={center} cy={center} r={10} fill="url(#bmd-aff-center)" />
      <text
        x={center}
        y={center + 4}
        textAnchor="middle"
        fill="#16111E"
        fontSize="11"
        fontWeight="800"
      >
        ★
      </text>
    </svg>
  );
}

function NetworkLevelRow({
  label,
  color,
  count,
  description,
}: {
  label: string;
  color: string;
  count: number;
  description: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 0",
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: `${color}26`,
          color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.5,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--cream)",
            display: "flex",
            alignItems: "baseline",
            gap: 6,
          }}
        >
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
          <span
            style={{
              fontSize: 10.5,
              color: "var(--muted)",
              fontWeight: 500,
              letterSpacing: 0.2,
            }}
          >
            · {description}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============ EARNINGS section ============

function EarningsSection({
  dash,
  t,
}: {
  dash: Dash;
  t: ReturnType<typeof useT>;
}) {
  const total = dash.pendingCents + dash.payableCents + dash.paidCents;
  // % de chaque bucket
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <section>
      <h3
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1.4,
          fontWeight: 700,
          margin: "0 0 10px 4px",
        }}
      >
        {t("affiliate.earningsTitle") || "Gains"}
      </h3>
      <div
        style={{
          padding: "14px 14px",
          background: "rgba(244,228,193,0.03)",
          border: "1px solid rgba(244,228,193,0.06)",
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Composite bar */}
        <div
          style={{
            display: "flex",
            height: 10,
            borderRadius: 999,
            overflow: "hidden",
            background: "rgba(244,228,193,0.06)",
          }}
        >
          <div
            style={{
              width: `${pct(dash.paidCents)}%`,
              background: "linear-gradient(90deg, #7DC59E, #5BA383)",
              transition: "width 0.4s ease",
            }}
          />
          <div
            style={{
              width: `${pct(dash.payableCents)}%`,
              background: "linear-gradient(90deg, var(--saffron), var(--terracotta))",
              transition: "width 0.4s ease",
            }}
          />
          <div
            style={{
              width: `${pct(dash.pendingCents)}%`,
              background: "rgba(244,228,193,0.18)",
              transition: "width 0.4s ease",
            }}
          />
        </div>

        {/* Lignes : 1 par bucket */}
        <EarningsRow
          color="#7DC59E"
          label={t("affiliate.paid") || "Versés"}
          value={formatMoneyCents(dash.paidCents, "EUR")}
        />
        <EarningsRow
          color="var(--saffron)"
          label={t("affiliate.payable") || "Disponibles"}
          value={formatMoneyCents(dash.payableCents, "EUR")}
        />
        <EarningsRow
          color="var(--cream-soft)"
          label={t("affiliate.pending") || "En attente"}
          value={formatMoneyCents(dash.pendingCents, "EUR")}
        />
      </div>
    </section>
  );
}

function EarningsRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12.5,
            color: "var(--cream)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <span
        style={{
          fontSize: 13,
          color: "var(--cream)",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "Cormorant Garamond, serif",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ============ KYC BANNER ============

function KycBanner({
  status,
  t,
}: {
  status: string;
  t: ReturnType<typeof useT>;
}) {
  const color =
    status === "VERIFIED"
      ? "#7DC59E"
      : status === "REJECTED"
        ? "#FFB89A"
        : "var(--saffron)";
  const bg =
    status === "VERIFIED"
      ? "rgba(125,197,158,0.10)"
      : status === "REJECTED"
        ? "rgba(217,113,74,0.10)"
        : "rgba(232,163,61,0.10)";
  const border =
    status === "VERIFIED"
      ? "rgba(125,197,158,0.30)"
      : status === "REJECTED"
        ? "rgba(217,113,74,0.30)"
        : "rgba(232,163,61,0.30)";
  const icon =
    status === "VERIFIED" ? "✓" : status === "REJECTED" ? "✕" : "○";
  const label =
    status === "VERIFIED"
      ? t("affiliate.kycVerified") || "KYC vérifié"
      : status === "PENDING"
        ? t("affiliate.kycPending") || "KYC en cours"
        : status === "REJECTED"
          ? t("affiliate.kycRejected") || "KYC refusé"
          : t("affiliate.kycNone") || "KYC à faire";

  return (
    <div
      style={{
        padding: "10px 14px",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: bg,
          color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 800,
          flexShrink: 0,
          border: `1px solid ${border}`,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color }}>{label}</div>
    </div>
  );
}

// ============ V41.2 — NETWORK LIST (filleuls L1) ============

function NetworkList({
  network,
  t,
}: {
  network: NetworkMember[];
  t: ReturnType<typeof useT>;
}) {
  return (
    <section>
      <h3
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1.4,
          fontWeight: 700,
          margin: "0 0 10px 4px",
        }}
      >
        {t("affiliate.networkListTitle") || "Tes filleuls"} ({network.length})
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {network.slice(0, 20).map((m) => (
          <NetworkRow key={m.id} member={m} t={t} />
        ))}
      </div>
    </section>
  );
}

function NetworkRow({
  member,
  t,
}: {
  member: NetworkMember;
  t: ReturnType<typeof useT>;
}) {
  const since = new Date(member.joinedAt);
  const joinedAgo = relativeTime(since);
  const isActive = member.subscriptionStatus === "ACTIVE";
  // V177.C — Avantage filleul (estimation) + ton avantage (commissions)
  const hasPayingPlan = member.hasPayingPlan ?? false;
  const savedCents = member.discountSavedCents ?? 0;
  const yourPaidCents = member.totalPaidCents;
  const yourPendingCents = member.totalPendingCents + member.totalPayableCents;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 11,
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: "rgba(232,163,61,0.15)",
          color: "var(--saffron)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {member.displayName.charAt(0).toUpperCase()}
      </span>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--cream)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {member.displayName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 4,
              background: isActive
                ? "rgba(125,197,158,0.18)"
                : "rgba(244,228,193,0.06)",
              color: isActive ? "#7DC59E" : "var(--cream-soft)",
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {member.planCode}
          </span>
          <span>{joinedAgo}</span>
          {member.subL2Count > 0 && (
            <span style={{ color: "var(--saffron)" }}>
              · {member.subL2Count} L2
            </span>
          )}
        </div>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--cream)",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {formatMoneyCents(member.totalPaidCents + member.totalPayableCents, "EUR")}
      </span>
      </div>
      {/* V177.C — Avantages mutuels : filleul & toi */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          paddingTop: 6,
          borderTop: "1px dashed rgba(244,228,193,0.07)",
          fontSize: 11,
          lineHeight: 1.4,
        }}
      >
        <div style={{ color: "var(--cream-soft)" }}>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>
            {t("affiliate.network.benefitFilleul", {
              name: member.displayName.split(" ")[0],
            }) || `Avantage ${member.displayName.split(" ")[0]}`}
            {": "}
          </span>
          {hasPayingPlan ? (
            <>
              {t("affiliate.network.discount20pct3m") ||
                "−20 % sur 3 mois"}
              {savedCents > 0 && (
                <>
                  {" ("}
                  {t("affiliate.network.savedAmount", {
                    amount: formatMoneyCents(savedCents, "EUR"),
                  }) || `économise ${formatMoneyCents(savedCents, "EUR")}`}
                  {")"}
                </>
              )}
            </>
          ) : (
            t("affiliate.network.noBenefitYet") ||
            "Pas encore d'avantage (pas d'abonnement payant)"
          )}
        </div>
        <div style={{ color: "var(--cream-soft)" }}>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>
            {t("affiliate.network.yourBenefit") || "Ton avantage"}
            {": "}
          </span>
          {t("affiliate.network.commissionPaid", {
            amount: formatMoneyCents(yourPaidCents, "EUR"),
          }) || `${formatMoneyCents(yourPaidCents, "EUR")} versés`}
          {yourPendingCents > 0 && (
            <>
              {" · "}
              {t("affiliate.network.commissionPending", {
                amount: formatMoneyCents(yourPendingCents, "EUR"),
              }) || `${formatMoneyCents(yourPendingCents, "EUR")} en attente`}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function relativeTime(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ============ V41.2 — COMMISSIONS LIST (10 dernières) ============

function CommissionsList({
  commissions,
  t,
}: {
  commissions: Commission[];
  t: ReturnType<typeof useT>;
}) {
  return (
    <section>
      <h3
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1.4,
          fontWeight: 700,
          margin: "0 0 10px 4px",
        }}
      >
        {t("affiliate.recentCommissionsTitle") || "Commissions récentes"}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {commissions.slice(0, 10).map((c) => (
          <CommissionRow key={c.id} commission={c} />
        ))}
      </div>
    </section>
  );
}

function CommissionRow({ commission: c }: { commission: Commission }) {
  const statusColor =
    c.status === "PAID"
      ? "#7DC59E"
      : c.status === "PAYABLE"
        ? "var(--saffron)"
        : "var(--cream-soft)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 11,
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          background: "rgba(91,108,255,0.15)",
          color: "#9eabff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        L{c.level}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--cream)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {c.payer.displayName}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--muted)",
            marginTop: 1,
          }}
        >
          {c.percent}% ·{" "}
          {new Date(c.createdAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
          })}
        </div>
      </div>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: statusColor,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        +{formatMoneyCents(c.payoutAmountCents, c.payoutCurrency)}
      </span>
    </div>
  );
}

// ============ ICONS ============

function IconCopy() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

// ============ SKELETON ============

function AffiliateSkeleton() {
  return (
    <div
      style={{
        padding: "0 16px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          height: 220,
          borderRadius: 24,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-aff-skel 1.2s infinite ease-in-out",
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 80,
            borderRadius: 14,
            background: "rgba(244,228,193,0.04)",
            animation: `bmd-aff-skel 1.2s infinite ease-in-out ${0.1 + i * 0.05}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes bmd-aff-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ============ V177.B — Mobile vue filleul (verrou parrain) ============

function MobileReferrerCard({
  info,
  t,
}: {
  info: NonNullable<Awaited<ReturnType<typeof api.getMyReferrer>>>;
  t: ReturnType<typeof useT>;
}) {
  const r = info.referrer!;
  const discount = info.discount;
  const remaining = info.remainingDays;
  const initials = (r.displayName || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <section
      style={{
        padding: "14px 16px",
        borderRadius: 16,
        background:
          "linear-gradient(180deg, rgba(244,228,193,0.05) 0%, rgba(244,228,193,0.02) 100%)",
        border: "1px solid rgba(197,138,46,0.30)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--muted)",
            fontWeight: 700,
          }}
        >
          {t("affiliate.referrer.eyebrow") || "Ton parrain"}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(31,122,87,0.15)",
            color: "#7DC59E",
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {t("affiliate.referrer.acquired") || "Acquis pour la vie"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {r.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.avatar}
            alt=""
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, #C58A2E 0%, #854F0B 100%)",
              color: "#FBF6EC",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--cream)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {r.displayName}
          </div>
          {r.codeUsed && (
            <div
              style={{
                fontSize: 10.5,
                color: "var(--muted)",
                marginTop: 1,
              }}
            >
              {t("affiliate.referrer.codeUsed") || "Code utilisé"}{" "}
              <code
                style={{
                  fontFamily: "monospace",
                  color: "var(--saffron)",
                  fontWeight: 700,
                }}
              >
                {r.codeUsed}
              </code>
            </div>
          )}
        </div>
      </div>

      {discount && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.06)",
            marginBottom: 8,
            fontSize: 12.5,
            color: "var(--cream-soft)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--cream)" }}>
            {t("affiliate.referrer.benefitValue", {
              percent: String(discount.value),
              months: String(discount.durationMonths),
            }) ||
              `−${discount.value} % sur ${discount.durationMonths} mois`}
          </span>
          {remaining > 0 ? (
            <span style={{ marginLeft: 6, color: "#7DC59E" }}>
              ·{" "}
              {t("affiliate.referrer.remainingDays", {
                days: String(remaining),
              }) || `Reste ${remaining} j`}
            </span>
          ) : (
            <span style={{ marginLeft: 6, color: "var(--muted)" }}>
              · {t("affiliate.referrer.expired") || "Terminée"}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          fontSize: 10.5,
          color: "var(--muted)",
          lineHeight: 1.5,
        }}
      >
        {t("affiliate.referrer.lockedHint") ||
          "Un seul code par compte — ce choix est définitif."}
      </div>
    </section>
  );
}
