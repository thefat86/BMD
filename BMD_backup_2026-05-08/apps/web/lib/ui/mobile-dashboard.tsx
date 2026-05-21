"use client";

/**
 * <MobileDashboard> · Vue mobile native du dashboard (spec §8.5, maquette).
 *
 * Inspirée des apps bancaires/trading :
 *  - Salutation chaleureuse en gros (Cormorant Garamond)
 *  - Carte solde principale plein écran (devise utilisateur, conversion FX)
 *  - Quick actions horizontales scrollables (icônes pleines)
 *  - Liste de groupes type "feed" verticale
 *  - CTA flottant central via le FAB de MobileShell
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, isUnauthorized, clearToken } from "../api-client";
import { useRouter } from "next/navigation";
import { useCurrency } from "../currency-provider";
import { SubscriptionBanner } from "./subscription-banner";
import { OcrCounter } from "./ocr-counter";
import { DashboardEmptyState } from "./dashboard-empty-state";
import {
  SkeletonGroupList,
  SkeletonHeroCard,
  SkeletonStyles,
} from "./skeleton";
import { useT } from "../i18n/app-strings";
import { prefetchBatch, prewarmGroupApi } from "../use-prefetch";
import { haptic } from "../platform";
import { useMyEvents } from "../use-realtime";
import { usePullToRefresh } from "../use-pull-to-refresh";
import { PullIndicator } from "./pull-indicator";
import {
  PersonBalanceList,
  PersonBalanceDetailModal,
  type PersonBalanceItem,
} from "./person-balance-list";
import { CrossSettlementInbox } from "./cross-settlement-inbox";

// V26 — partage la même clé localStorage que desktop-dashboard pour
// que la préférence soit cohérente entre les deux contextes.
const DASHBOARD_VIEW_KEY = "bmd_dashboard_view";
type DashboardView = "byGroup" | "byPerson";

function loadDashboardView(): DashboardView {
  if (typeof window === "undefined") return "byGroup";
  try {
    const v = window.localStorage.getItem(DASHBOARD_VIEW_KEY);
    if (v === "byPerson") return "byPerson";
  } catch {
    /* ignore */
  }
  return "byGroup";
}

function saveDashboardView(v: DashboardView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DASHBOARD_VIEW_KEY, v);
  } catch {
    /* ignore */
  }
}

interface Group {
  id: string;
  name: string;
  type: string;
  defaultCurrency: string;
  membersCount: number;
  totalSpent: string;
  myNet: string;
}

interface GlobalBalance {
  net: string;
  owedToMe: string;
  iOwe: string;
  primaryCurrency: string;
  hasConversion?: boolean;
  groupCount: number;
}

const TYPE_VISUAL: Record<string, { emoji: string; color: string }> = {
  TONTINE: { emoji: "🪙", color: "#e8a33d" },
  COLOC: { emoji: "🏠", color: "#10b981" },
  TRAVEL: { emoji: "✈️", color: "#5b6cff" },
  EVENT: { emoji: "🎉", color: "#ec4899" },
  CLUB: { emoji: "⚽", color: "#3a2f5b" },
  PARISH: { emoji: "⛪", color: "#7c6e93" },
  GENERIC: { emoji: "👥", color: "#b54732" },
};

export function MobileDashboard({
  onCreate,
  onCreateWithType,
}: {
  onCreate?: () => void;
  onCreateWithType?: (type: string) => void;
} = {}) {
  const router = useRouter();
  const { code: userCurrency, formatAmount } = useCurrency();
  const t = useT();
  const greetingText = useGreeting();
  const [me, setMe] = useState<any>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [balance, setBalance] = useState<GlobalBalance | null>(null);
  const [loading, setLoading] = useState(true);
  // V26 — Toggle vue par groupe / par personne (partagé avec desktop)
  const [view, setView] = useState<DashboardView>("byGroup");
  const [selectedPerson, setSelectedPerson] =
    useState<PersonBalanceItem | null>(null);
  useEffect(() => {
    setView(loadDashboardView());
  }, []);
  function changeView(v: DashboardView) {
    setView(v);
    saveDashboardView(v);
    haptic("tap");
  }

  // Fonction de fetch réutilisée par mount initial + refresh SSE
  function fetchAll() {
    Promise.all([
      api.me(),
      api.listGroups(),
      api.getMyGlobalBalance().catch(() => null),
    ])
      .then(([meRes, groupsRes, balRes]) => {
        setMe(meRes.user);
        setGroups(groupsRes as Group[]);
        setBalance(balRes as GlobalBalance | null);
        setLoading(false);
        // Prefetch les routes des groupes au mount → navigation instantanée
        const urls = (groupsRes as Group[])
          .slice(0, 5)
          .map((g) => `/dashboard/groups/${g.id}`);
        if (urls.length > 0) prefetchBatch(urls);
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setLoading(false);
      });
  }

  // Re-fetch au mount + quand la devise change (la balance globale est
  // convertie côté serveur dans la devise par défaut de l'utilisateur).
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, userCurrency]);

  // SSE temps réel : quand un membre quelque part fait une action qui
  // change ma balance (paiement, dépense, accept swap…), le serveur push
  // l'event et le dashboard se met à jour automatiquement. UX vivante.
  useMyEvents((event) => {
    const triggers = [
      "balance.changed",
      "expense.created",
      "settlement.created",
      "settlement.confirmed",
      "member.joined",
      "swap.accepted",
      "debt-transfer.accepted",
    ];
    if (triggers.includes(event.kind)) {
      fetchAll();
    }
  });

  // Pull-to-refresh natif (mobile uniquement — désactivé sur desktop par
  // détection touch dans le hook). UX standard banking app.
  const { state: pullState, bindToScrollContainer } = usePullToRefresh({
    onRefresh: async () => {
      // Délai mini 600ms pour laisser le user voir le spinner même si
      // le fetch est ultra-rapide (sinon il flashe et on a l'impression
      // que rien ne s'est passé)
      await Promise.all([
        new Promise((r) => setTimeout(r, 600)),
        new Promise<void>((resolve) => {
          fetchAll();
          resolve();
        }),
      ]);
    },
  });

  // Branche le hook au document body (le scroll racine de l'app mobile).
  // Le ResponsiveShell wrap déjà tout dans un container scrollable.
  useEffect(() => {
    bindToScrollContainer(document.body);
  }, [bindToScrollContainer]);

  if (loading) {
    return (
      <div
        style={{
          padding: "8px 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <SkeletonStyles />
        <SkeletonHeroCard />
        <SkeletonGroupList count={3} />
      </div>
    );
  }

  const net = balance ? parseFloat(balance.net) : 0;
  const owedToMe = balance ? parseFloat(balance.owedToMe) : 0;
  const iOwe = balance ? parseFloat(balance.iOwe) : 0;
  const currency = balance?.primaryCurrency ?? "EUR";

  return (
    <div style={{ padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Pull-to-refresh indicator — apparaît quand l'utilisateur tire
          la liste vers le bas, disparaît au release. Mobile only. */}
      <PullIndicator {...pullState} />

      {/* Bandeau d'état d'abonnement (silencieux si ACTIVE) */}
      <SubscriptionBanner />

      {/* X4 — Inbox cross-settlements en attente. Auto-hidden si vide. */}
      <CrossSettlementInbox variant="compact" />

      {/* Salutation */}
      <div style={{ paddingTop: 4 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--saffron, #e8a33d)",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {greetingText}
        </div>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--cream)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {me?.displayName
            ? `${me.displayName.split(" ")[0]} 👋`
            : t("dashboard.greetingShort", { name: "" }).trim()}
        </h2>
      </div>

      {/* Hero balance — refonte Degiro/Revolut style :
          - Chiffre ULTRA grand (sans-serif lourd, fontVariantNumeric:tabular-nums)
          - Cents en plus petit en superscript pour lisibilité
          - Mini-bars verticales (équilibre on me doit / je dois) en-dessous
          - Halo + grain texture pour la profondeur
          - Tappable → ouvre /dashboard/stats pour les détails */}
      <Link
        href="/dashboard/stats"
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
          background:
            "linear-gradient(135deg, #2A2244 0%, #3A2A52 60%, #4A3568 100%)",
          borderRadius: 24,
          padding: 24,
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(232,163,61,0.18)",
          boxShadow: "0 12px 40px rgba(14,11,20,0.5)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* Halo radial signature BMD */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 240,
            height: 240,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(232,163,61,0.22), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        {/* Grain texture subtile */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(244,228,193,1) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            pointerEvents: "none",
          }}
        />

        {/* Header : label + indicateur de variation */}
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--cream-soft, #d4c4a8)",
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            {t("dashboard.balance")}
          </div>
          <div
            style={{
              fontSize: 10,
              color:
                net > 0
                  ? "#7DC59E"
                  : net < 0
                    ? "#D9714A"
                    : "var(--muted)",
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 999,
              background:
                net > 0
                  ? "rgba(125,197,158,0.12)"
                  : net < 0
                    ? "rgba(217,113,74,0.12)"
                    : "rgba(244,228,193,0.06)",
              border: `1px solid ${
                net > 0
                  ? "rgba(125,197,158,0.30)"
                  : net < 0
                    ? "rgba(217,113,74,0.30)"
                    : "rgba(244,228,193,0.10)"
              }`,
              letterSpacing: 0.5,
            }}
          >
            {net > 0
              ? t("dashboard.balanceCreditor")
              : net < 0
                ? t("dashboard.balanceDebtor")
                : t("dashboard.balanceBalanced")}
          </div>
        </div>

        {/* Chiffre principal style Degiro : très gros, sans-serif lourd,
            cents superscript pour lisibilité */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            marginBottom: 4,
            color:
              net > 0
                ? "#7DC59E"
                : net < 0
                  ? "#D9714A"
                  : "var(--cream)",
          }}
        >
          <span
            style={{
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.2,
              opacity: 0.85,
            }}
          >
            {net >= 0 ? "+" : "−"}
          </span>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            {(() => {
              const abs = Math.abs(net);
              const intPart = Math.floor(abs);
              const decimals = noDecimals(currency)
                ? null
                : abs.toFixed(2).split(".")[1] ?? "00";
              return (
                <>
                  <span
                    style={{
                      fontSize: 56,
                      fontWeight: 800,
                      lineHeight: 1,
                      letterSpacing: -1.5,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {intPart.toLocaleString("fr-FR")}
                  </span>
                  {decimals !== null && (
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        opacity: 0.7,
                        marginLeft: 2,
                        marginTop: 6,
                      }}
                    >
                      ,{decimals}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--saffron, #e8a33d)",
              marginLeft: 6,
              marginTop: 8,
              letterSpacing: 0.5,
            }}
          >
            {currency}
          </span>
        </div>

        {/* Mini-bars équilibre on me doit / je dois — visualisation
            instantanée du ratio des deux côtés. */}
        {(owedToMe > 0 || iOwe > 0) && (
          <BalanceVisual
            owedToMe={owedToMe}
            iOwe={iOwe}
            currency={currency}
          />
        )}

        {balance?.hasConversion && (
          <div
            style={{
              position: "relative",
              marginTop: 12,
              fontSize: 10,
              color: "var(--cream-soft, #d4c4a8)",
              opacity: 0.7,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>💱</span>
            <span>Converti dans ta devise · taux du jour</span>
          </div>
        )}
      </Link>

      {/* Quick actions */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, margin: "0 0 10px" }}>
          <h3
            style={{
              fontSize: 11,
              color: "var(--muted, #8a7b6b)",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {t("dashboard.shortcuts")}
          </h3>
          <OcrCounter variant="badge" />
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            paddingBottom: 4,
            // Cache la scrollbar tout en gardant le scroll
            scrollbarWidth: "none",
          }}
        >
          <QuickAction
            href="/dashboard/stats"
            emoji="📊"
            label={t("nav.stats")}
            color="#5b6cff"
          />
          <QuickAction
            href="/dashboard/profile"
            emoji="👤"
            label={t("nav.profile")}
            color="#e8a33d"
          />
          <QuickAction
            href="/dashboard/profile"
            emoji="🎁"
            label={t("dashboard.referrals")}
            color="#10b981"
          />
          <QuickAction
            href="/dashboard/profile"
            emoji="💳"
            label={t("dashboard.payments")}
            color="#b54732"
          />
          <QuickAction
            href="/dashboard/profile"
            emoji="🌍"
            label={t("dashboard.langCurrency")}
            color="#7c6e93"
          />
        </div>
      </div>

      {/* Liste des groupes / Vue par personne */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              color: "var(--muted, #8a7b6b)",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {view === "byGroup"
              ? `${t("dashboard.myGroups")} (${groups.length})`
              : t("dashboard.myCounterparties")}
          </h3>
        </div>

        {/* V26 — Toggle compact mobile : pleine largeur, 2 segments */}
        <div
          role="tablist"
          aria-label={t("dashboard.viewToggleAria")}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.08)",
            borderRadius: 12,
            padding: 4,
            marginBottom: 12,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "byGroup"}
            onClick={() => changeView("byGroup")}
            style={{
              padding: "8px 10px",
              borderRadius: 9,
              border: "none",
              background:
                view === "byGroup"
                  ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
                  : "transparent",
              color:
                view === "byGroup" ? "var(--night-2, #16111E)" : "var(--cream)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 36,
              letterSpacing: 0.3,
              WebkitTapHighlightColor: "transparent",
              transition: "all 0.18s ease",
            }}
          >
            {t("dashboard.viewByGroup")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "byPerson"}
            onClick={() => changeView("byPerson")}
            style={{
              padding: "8px 10px",
              borderRadius: 9,
              border: "none",
              background:
                view === "byPerson"
                  ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
                  : "transparent",
              color:
                view === "byPerson"
                  ? "var(--night-2, #16111E)"
                  : "var(--cream)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 36,
              letterSpacing: 0.3,
              WebkitTapHighlightColor: "transparent",
              transition: "all 0.18s ease",
            }}
          >
            {t("dashboard.viewByPerson")}
          </button>
        </div>

        {view === "byPerson" ? (
          <PersonBalanceList onSelect={setSelectedPerson} />
        ) : groups.length === 0 ? (
          <DashboardEmptyState
            onCreate={onCreate}
            onCreateWithType={onCreateWithType}
          />
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {groups.map((g) => {
              const visual = TYPE_VISUAL[g.type] ?? TYPE_VISUAL.GENERIC!;
              const myNet = parseFloat(g.myNet);
              return (
                <li key={g.id}>
                  <Link
                    href={`/dashboard/groups/${g.id}`}
                    prefetch
                    onTouchStart={() => {
                      prewarmGroupApi(g.id);
                      haptic("tap");
                    }}
                    onMouseEnter={() => prewarmGroupApi(g.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 14,
                      background: "rgba(244,228,193,0.03)",
                      border: "1px solid rgba(244,228,193,0.06)",
                      borderRadius: 14,
                      textDecoration: "none",
                      color: "var(--cream)",
                      WebkitTapHighlightColor: "transparent",
                      transition: "transform 0.1s, background 0.15s",
                    }}
                    /* Active state visuel pour feedback immédiat tactile */
                    onTouchStartCapture={(e) => {
                      e.currentTarget.style.transform = "scale(0.98)";
                      e.currentTarget.style.background =
                        "rgba(232,163,61,0.10)";
                    }}
                    onTouchEnd={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                      e.currentTarget.style.background =
                        "rgba(244,228,193,0.03)";
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: `linear-gradient(135deg, ${visual.color}33, ${visual.color}11)`,
                        border: `1px solid ${visual.color}55`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      {visual.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--cream)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {g.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--muted, #8a7b6b)",
                          marginTop: 2,
                        }}
                      >
                        {g.membersCount} {t("group.members").toLowerCase()} ·{" "}
                        {/* Z2 — Conversion FX vers la devise utilisateur */}
                        {formatAmount(g.totalSpent, g.defaultCurrency)}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: "Cormorant Garamond, serif",
                        fontSize: 16,
                        fontWeight: 700,
                        color:
                          myNet > 0
                            ? "#7DC59E"
                            : myNet < 0
                              ? "#D9714A"
                              : "var(--muted)",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {myNet > 0 ? "+" : myNet < 0 ? "−" : ""}
                      {/* Z2 — Conversion FX du myNet vers devise utilisateur */}
                      {formatAmount(
                        Math.abs(myNet).toString(),
                        g.defaultCurrency,
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* V26 — Modal drill-down par personne (overlay full-screen sur mobile) */}
      <PersonBalanceDetailModal
        person={selectedPerson}
        primaryCurrency={balance?.primaryCurrency ?? "EUR"}
        onClose={() => setSelectedPerson(null)}
      />
    </div>
  );
}

function BalanceCol({
  label,
  value,
  currency,
  positive,
}: {
  label: string;
  value: number;
  currency: string;
  positive?: boolean;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1.2,
          color: "var(--cream-soft)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 20,
          fontWeight: 700,
          color: positive ? "#7DC59E" : "#D9714A",
          lineHeight: 1.1,
        }}
      >
        {value.toLocaleString("fr-FR", {
          minimumFractionDigits: noDecimals(currency) ? 0 : 2,
          maximumFractionDigits: noDecimals(currency) ? 0 : 2,
        })}{" "}
        <span style={{ fontSize: 11, opacity: 0.7 }}>{currency}</span>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  emoji,
  label,
  color,
}: {
  href: string;
  emoji: string;
  label: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "14px 12px",
        minWidth: 90,
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 14,
        textDecoration: "none",
        color: "var(--cream)",
        scrollSnapAlign: "start",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: `linear-gradient(135deg, ${color}33, ${color}11)`,
          border: `1px solid ${color}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        {emoji}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--cream-soft)",
        }}
      >
        {label}
      </span>
    </Link>
  );
}

function useGreeting(): string {
  const t = useT();
  const h = new Date().getHours();
  if (h < 6) return t("time.night");
  if (h < 12) return t("time.morning");
  if (h < 18) return t("time.afternoon");
  return t("time.evening");
}

function noDecimals(currency: string): boolean {
  return ["XAF", "XOF", "KES", "TZS", "UGX", "RWF", "CDF"].includes(currency);
}

/**
 * Visualisation graphique de l'équilibre on-me-doit / je-dois sous le
 * gros chiffre du hero. Inspiré des barres de répartition Wise/Revolut :
 * deux barres horizontales proportionnelles, vert pour ce qu'on me doit,
 * orange pour ce que je dois. Si les deux côtés sont à 0, ne rend rien.
 */
function BalanceVisual({
  owedToMe,
  iOwe,
  currency,
}: {
  owedToMe: number;
  iOwe: number;
  currency: string;
}) {
  const t = useT();
  const total = owedToMe + iOwe;
  const owedPct = total > 0 ? (owedToMe / total) * 100 : 50;
  const owePct = total > 0 ? (iOwe / total) * 100 : 50;
  const decimals = noDecimals(currency) ? 0 : 0;
  const fmt = (n: number) =>
    n.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
  return (
    <div style={{ position: "relative", marginTop: 18 }}>
      {/* 2 barres juxtaposées */}
      <div
        style={{
          display: "flex",
          gap: 4,
          height: 6,
          marginBottom: 10,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        {owedToMe > 0 && (
          <div
            style={{
              width: `${owedPct}%`,
              background:
                "linear-gradient(90deg, rgba(125,197,158,0.5), #7DC59E)",
              borderRadius: 999,
              transition: "width 0.4s",
            }}
          />
        )}
        {iOwe > 0 && (
          <div
            style={{
              width: `${owePct}%`,
              background:
                "linear-gradient(90deg, #D9714A, rgba(217,113,74,0.5))",
              borderRadius: 999,
              transition: "width 0.4s",
            }}
          />
        )}
      </div>
      {/* Légende */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--cream-soft, #d4c4a8)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#7DC59E",
              flexShrink: 0,
            }}
          />
          <span>
            {t("dashboard.owedToMe")}{" "}
            <strong
              style={{
                color: "#7DC59E",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(owedToMe)}
            </strong>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>
            {t("dashboard.iOwe")}{" "}
            <strong
              style={{
                color: "#D9714A",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(iOwe)}
            </strong>
          </span>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#D9714A",
              flexShrink: 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}
