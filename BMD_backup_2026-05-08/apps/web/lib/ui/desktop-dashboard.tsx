"use client";

/**
 * <DesktopDashboard> · Vue desktop du tableau de bord (spec §8.5).
 *
 * Inspirée des portails financiers pro (Wise, Revolut Business, N26 Business) :
 *  - Bandeau "hero" haut : carte solde XL + KPIs juxtaposés
 *  - Grille 2 colonnes : Mes groupes (gauche) + Activité récente (droite)
 *  - Quick actions en barre horizontale (6-7 raccourcis)
 *  - Densité d'information plus élevée que le mobile
 *  - Placée DANS le <DesktopShell> (qui fournit sidebar + header)
 *
 * Ne s'affiche QUE pour les viewports ≥ 768px (via <ResponsiveShell>).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, isUnauthorized, clearToken } from "../api-client";
import { useCurrency } from "../currency-provider";
import { useT } from "../i18n/app-strings";
import { SubscriptionBanner } from "./subscription-banner";
import { OcrCounter } from "./ocr-counter";
import { prefetchBatch, prewarmGroupApi } from "../use-prefetch";
import { useMyEvents } from "../use-realtime";
import { DashboardEmptyState } from "./dashboard-empty-state";
import {
  PersonBalanceList,
  PersonBalanceDetailModal,
  type PersonBalanceItem,
} from "./person-balance-list";
import { CrossSettlementInbox } from "./cross-settlement-inbox";

/**
 * V26 · Clé localStorage pour la préférence de vue dashboard
 * (par groupe ou par personne). Persistance côté client uniquement —
 * recommandation V26 phase 1, en DB plus tard si demande.
 */
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
  createdAt: string;
}

interface GlobalBalance {
  net: string;
  owedToMe: string;
  iOwe: string;
  primaryCurrency: string;
  hasConversion?: boolean;
  groupCount: number;
  byCurrency?: Record<string, { net: string; owedToMe: string; iOwe: string }>;
}

const TYPE_VISUAL: Record<string, { emoji: string; label: string; color: string }> = {
  TONTINE: { emoji: "🪙", label: "Tontine", color: "#e8a33d" },
  COLOC: { emoji: "🏠", label: "Coloc", color: "#10b981" },
  TRAVEL: { emoji: "✈️", label: "Voyage", color: "#5b6cff" },
  EVENT: { emoji: "🎉", label: "Événement", color: "#ec4899" },
  CLUB: { emoji: "⚽", label: "Club", color: "#3a2f5b" },
  PARISH: { emoji: "⛪", label: "Paroisse", color: "#7c6e93" },
  GENERIC: { emoji: "👥", label: "Autre", color: "#b54732" },
};

interface Props {
  /** Callback déclenché par le bouton "+ Nouveau groupe" du header. */
  onCreateGroup?: () => void;
  /** Variant qui pré-remplit le type au moment de l'ouverture du modal. */
  onCreateGroupWithType?: (type: string) => void;
}

export function DesktopDashboard({
  onCreateGroup,
  onCreateGroupWithType,
}: Props) {
  const router = useRouter();
  const t = useT();
  const { code: userCurrency, formatAmount } = useCurrency();
  const [me, setMe] = useState<any>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [balance, setBalance] = useState<GlobalBalance | null>(null);
  const [loading, setLoading] = useState(true);
  // V26 — Toggle "vue par groupe / vue par personne", persisté en localStorage.
  // Mount initial : "byGroup" pour matcher le SSR (la valeur localStorage est
  // appliquée après hydration via useEffect).
  const [view, setView] = useState<DashboardView>("byGroup");
  // Modal drill-down par personne (V26-4)
  const [selectedPerson, setSelectedPerson] =
    useState<PersonBalanceItem | null>(null);

  useEffect(() => {
    setView(loadDashboardView());
  }, []);

  function changeView(v: DashboardView) {
    setView(v);
    saveDashboardView(v);
  }

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
        const urls = (groupsRes as Group[])
          .slice(0, 8)
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

  // Re-fetch quand la devise change : la balance globale est convertie
  // côté serveur dans la devise par défaut de l'utilisateur.
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, userCurrency]);

  // SSE temps réel : update auto quand un membre ailleurs change ma balance.
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
    if (triggers.includes(event.kind)) fetchAll();
  });

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--cream-soft)" }}>Chargement…</div>
    );
  }

  const net = balance ? parseFloat(balance.net) : 0;
  const owedToMe = balance ? parseFloat(balance.owedToMe) : 0;
  const iOwe = balance ? parseFloat(balance.iOwe) : 0;
  const currency = balance?.primaryCurrency ?? "EUR";

  // Grouper par type pour le panneau "Répartition"
  const byType = groups.reduce<Record<string, number>>((acc, g) => {
    acc[g.type] = (acc[g.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Bandeau d'état d'abonnement (visible si GRACE/WARN/DOWNGRADED) */}
      <SubscriptionBanner />

      {/* X4 — Inbox des règlements multi-groupe en attente.
          Auto-hidden si vide (zéro pollution visuelle). Visible dès que
          quelqu'un a initié un cross-settlement t'impliquant ou que tu en
          as un en attente de confirmation par la counterparty. */}
      <CrossSettlementInbox variant="card" />

      {/* === Bandeau hero === */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        {/* Carte solde XL */}
        <div
          style={{
            background: "linear-gradient(135deg, #2A2244 0%, #3A2A52 100%)",
            borderRadius: 22,
            padding: 28,
            position: "relative",
            overflow: "hidden",
            border: "1px solid rgba(232,163,61,0.18)",
            minHeight: 200,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -80,
              right: -80,
              width: 280,
              height: 280,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(232,163,61,0.20), transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "relative",
              fontSize: 11,
              color: "var(--cream-soft, #d4c4a8)",
              letterSpacing: 1.8,
              textTransform: "uppercase",
              fontWeight: 700,
              opacity: 0.9,
              marginBottom: 10,
            }}
          >
            {t("dashboard.balance")} · {me?.displayName?.split(" ")[0] ?? ""}
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 56,
                fontWeight: 600,
                color: net >= 0 ? "var(--cream)" : "var(--terracotta, #b54732)",
                lineHeight: 1,
              }}
            >
              {net >= 0 ? "+" : "−"}
              {Math.abs(net).toLocaleString("fr-FR", {
                minimumFractionDigits: noDecimals(currency) ? 0 : 2,
                maximumFractionDigits: noDecimals(currency) ? 0 : 2,
              })}
            </div>
            <div
              style={{
                fontSize: 22,
                color: "var(--saffron, #e8a33d)",
                fontWeight: 600,
              }}
            >
              {currency}
            </div>
          </div>

          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <BalanceMetric
              label={t("dashboard.owedToMe")}
              value={owedToMe}
              currency={currency}
              positive
            />
            <BalanceMetric label={t("dashboard.iOwe")} value={iOwe} currency={currency} />
          </div>

          {balance?.hasConversion && (
            <div
              style={{
                position: "relative",
                marginTop: 14,
                fontSize: 11,
                color: "var(--cream-soft)",
                fontStyle: "italic",
                opacity: 0.7,
              }}
            >
              {t("dashboard.fxConvertedHint")}
            </div>
          )}
        </div>

        {/* KPIs latéraux */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <KpiCard
            label={t("dashboard.activeGroups")}
            value={String(groups.length)}
            icon="👥"
            color="#5b6cff"
          />
          <KpiCard
            label={t("dashboard.totalSpent")}
            value={
              groups
                .reduce((acc, g) => acc + parseFloat(g.totalSpent), 0)
                .toLocaleString(undefined, { maximumFractionDigits: 0 }) +
              " " +
              currency
            }
            icon="💰"
            color="#10b981"
          />
          <KpiCard
            label={t("dashboard.defaultCurrency")}
            value={currency}
            sub={
              balance?.byCurrency &&
              Object.keys(balance.byCurrency).length > 1
                ? t(
                    Object.keys(balance.byCurrency).length - 1 > 1
                      ? "dashboard.otherCurrenciesCount"
                      : "dashboard.otherCurrenciesCountSingular",
                    { count: String(Object.keys(balance.byCurrency).length - 1) },
                  )
                : undefined
            }
            icon="🌍"
            color="#e8a33d"
          />
        </div>
      </section>

      {/* === Quick actions === */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <SectionTitle inline>{t("dashboard.shortcuts")}</SectionTitle>
          {/* Sprint AB · Compteur OCR visible en permanence pour générer
              l'envie d'upgrade (carrot) plutôt qu'un blocage frustrant. */}
          <OcrCounter variant="badge" />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <DesktopQuickAction
            href="/dashboard/stats"
            emoji="📊"
            label={t("nav.stats")}
            color="#5b6cff"
          />
          <DesktopQuickAction
            href="/dashboard/profile"
            emoji="👤"
            label={t("nav.profile")}
            color="#e8a33d"
          />
          <DesktopQuickAction
            href="/dashboard/profile"
            emoji="🎁"
            label={t("dashboard.referrals")}
            color="#10b981"
          />
          <DesktopQuickAction
            href="/dashboard/profile"
            emoji="💳"
            label={t("dashboard.payments")}
            color="#b54732"
          />
          <DesktopQuickAction
            href="/dashboard/profile"
            emoji="🌍"
            label={t("dashboard.langCurrency")}
            color="#7c6e93"
          />
          <DesktopQuickAction
            href="/"
            emoji="🏠"
            label={t("dashboard.viewSite")}
            color="#5b6cff"
          />
          <DesktopQuickAction
            onClick={onCreateGroup}
            emoji="＋"
            label={t("dashboard.newGroupCta")}
            color="#e8a33d"
            highlight
          />
        </div>
      </section>

      {/* === Grille 2 colonnes : Groupes + Répartition === */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        {/* Liste des groupes */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <SectionTitle inline>
              {view === "byGroup"
                ? `${t("dashboard.myGroups")} (${groups.length})`
                : t("dashboard.myCounterparties")}
            </SectionTitle>

            {/* V26 — Toggle Par groupe / Par personne */}
            <div
              role="tablist"
              aria-label={t("dashboard.viewToggleAria")}
              style={{
                display: "inline-flex",
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.08)",
                borderRadius: 999,
                padding: 3,
                gap: 2,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "byGroup"}
                onClick={() => changeView("byGroup")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
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
                  transition: "all 0.18s ease",
                  letterSpacing: 0.3,
                  minHeight: 30,
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
                  padding: "6px 14px",
                  borderRadius: 999,
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
                  transition: "all 0.18s ease",
                  letterSpacing: 0.3,
                  minHeight: 30,
                }}
              >
                {t("dashboard.viewByPerson")}
              </button>
            </div>

            <button
              type="button"
              onClick={onCreateGroup}
              style={{
                background: "transparent",
                border: "1px solid rgba(232,163,61,0.3)",
                color: "var(--saffron)",
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("dashboard.newGroup")}
            </button>
          </div>

          {/* V26 — Vue par personne : on rend `<PersonBalanceList>` au lieu
              du tableau de groupes. Cohabitent dans le même slot UI. */}
          {view === "byPerson" ? (
            <PersonBalanceList onSelect={setSelectedPerson} />
          ) : groups.length === 0 ? (
            <DashboardEmptyState
              onCreate={onCreateGroup}
              onCreateWithType={onCreateGroupWithType}
            />
          ) : (
            <div
              style={{
                background: "rgba(244,228,193,0.03)",
                border: "1px solid rgba(244,228,193,0.06)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "rgba(0,0,0,0.2)",
                      color: "var(--muted, #8a7b6b)",
                      fontSize: 10,
                      letterSpacing: 1.4,
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    <th style={thStyle}>{t("dashboard.tableGroup")}</th>
                    <th style={thStyle}>{t("dashboard.tableType")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      {t("dashboard.tableMembers")}
                    </th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      {t("dashboard.tableSpent")}
                    </th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      {t("dashboard.tableNet")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const visual = TYPE_VISUAL[g.type] ?? TYPE_VISUAL.GENERIC!;
                    const myNet = parseFloat(g.myNet);
                    return (
                      <tr
                        key={g.id}
                        style={{
                          borderTop: "1px solid rgba(244,228,193,0.06)",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onClick={() => router.push(`/dashboard/groups/${g.id}`)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(232,163,61,0.06)";
                          // Pre-warm API cache + Next.js route prefetch
                          prewarmGroupApi(g.id);
                          router.prefetch(`/dashboard/groups/${g.id}`);
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: `${visual.color}22`,
                                border: `1px solid ${visual.color}55`,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 16,
                                flexShrink: 0,
                              }}
                            >
                              {visual.emoji}
                            </span>
                            <span
                              style={{
                                fontWeight: 600,
                                color: "var(--cream)",
                              }}
                            >
                              {g.name}
                            </span>
                          </div>
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            color: "var(--cream-soft)",
                          }}
                        >
                          {visual.label}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "right",
                            color: "var(--cream-soft)",
                          }}
                        >
                          {g.membersCount}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "right",
                            color: "var(--cream-soft)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {/* Z2 — Convertit le totalSpent (en devise du
                              groupe) vers la devise utilisateur via FX. */}
                          {formatAmount(g.totalSpent, g.defaultCurrency)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "right",
                            fontWeight: 700,
                            color:
                              myNet > 0
                                ? "#7DC59E"
                                : myNet < 0
                                  ? "#D9714A"
                                  : "var(--muted)",
                            fontVariantNumeric: "tabular-nums",
                            fontFamily: "Cormorant Garamond, serif",
                            fontSize: 16,
                          }}
                        >
                          {myNet > 0 ? "+" : myNet < 0 ? "−" : ""}
                          {/* Z2 — Convertit le solde par groupe vers la devise
                              utilisateur. Sans ça, USD configuré ne se voyait
                              pas reflété dans les lignes par groupe. */}
                          {formatAmount(
                            Math.abs(myNet).toString(),
                            g.defaultCurrency,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Répartition par type + Activité */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title={t("dashboard.distribution")}>
            {groups.length === 0 ? (
              <div
                style={{
                  padding: "16px 0",
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                {t("dashboard.noGroupsYet")}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {Object.entries(byType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => {
                    const visual =
                      TYPE_VISUAL[type] ?? TYPE_VISUAL.GENERIC!;
                    const pct = (count / groups.length) * 100;
                    return (
                      <div key={type}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 12,
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ color: "var(--cream-soft)" }}>
                            {visual.emoji} {visual.label}
                          </span>
                          <span
                            style={{
                              color: "var(--cream)",
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {count}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: "rgba(244,228,193,0.06)",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, ${visual.color}, ${visual.color}99)`,
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Panel>

          {balance?.byCurrency &&
            Object.keys(balance.byCurrency).length > 1 && (
              <Panel title={t("dashboard.balancesByCurrency")}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {Object.entries(balance.byCurrency).map(([cur, b]) => {
                    const n = parseFloat(b.net);
                    return (
                      <div
                        key={cur}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 0",
                          fontSize: 13,
                          borderBottom:
                            "1px solid rgba(244,228,193,0.04)",
                        }}
                      >
                        <span style={{ color: "var(--cream)" }}>{cur}</span>
                        <span
                          style={{
                            color:
                              n > 0
                                ? "#7DC59E"
                                : n < 0
                                  ? "#D9714A"
                                  : "var(--muted)",
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {n > 0 ? "+" : ""}
                          {n.toLocaleString("fr-FR", {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

          <Panel title={t("dashboard.tip")}>
            <div
              style={{
                fontSize: 12,
                color: "var(--cream-soft)",
                lineHeight: 1.6,
              }}
            >
              💡 {t("dashboard.tipBody")}{" "}
              <Link
                href="/dashboard/profile"
                style={{
                  color: "var(--saffron)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {t("nav.profile")}
              </Link>
            </div>
          </Panel>
        </div>
      </section>

      {/* V26 — Modal drill-down par personne (rendu au top-level pour le z-index) */}
      <PersonBalanceDetailModal
        person={selectedPerson}
        primaryCurrency={balance?.primaryCurrency ?? "EUR"}
        onClose={() => setSelectedPerson(null)}
      />
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
};

function SectionTitle({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <h2
      style={{
        fontSize: 11,
        letterSpacing: 1.8,
        color: "var(--muted, #8a7b6b)",
        textTransform: "uppercase",
        fontWeight: 700,
        margin: inline ? 0 : "0 0 12px",
      }}
    >
      {children}
    </h2>
  );
}

function BalanceMetric({
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
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1.3,
          color: "var(--cream-soft)",
          textTransform: "uppercase",
          marginBottom: 4,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: positive ? "#7DC59E" : "#D9714A",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString("fr-FR", {
          minimumFractionDigits: noDecimals(currency) ? 0 : 2,
          maximumFractionDigits: noDecimals(currency) ? 0 : 2,
        })}{" "}
        <span style={{ fontSize: 12, opacity: 0.7 }}>{currency}</span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        gap: 14,
        alignItems: "center",
        flex: 1,
        minHeight: 60,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${color}33, ${color}11)`,
          border: `1px solid ${color}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.4,
            color: "var(--muted, #8a7b6b)",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--cream)",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 10,
              color: "var(--saffron)",
              marginTop: 2,
              fontWeight: 600,
            }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopQuickAction({
  href,
  onClick,
  emoji,
  label,
  color,
  highlight,
}: {
  href?: string;
  onClick?: () => void;
  emoji: string;
  label: string;
  color: string;
  highlight?: boolean;
}) {
  const inner = (
    <>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: highlight
            ? `linear-gradient(135deg, ${color}, ${color}cc)`
            : `linear-gradient(135deg, ${color}33, ${color}11)`,
          border: highlight ? "none" : `1px solid ${color}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color: highlight ? "#16111E" : undefined,
          fontWeight: 700,
        }}
      >
        {emoji}
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--cream)",
        }}
      >
        {label}
      </span>
    </>
  );
  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: "rgba(244,228,193,0.03)",
    border: "1px solid rgba(244,228,193,0.06)",
    borderRadius: 12,
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s, border 0.15s",
  };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={baseStyle}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href ?? "#"} style={baseStyle}>
      {inner}
    </Link>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.6,
          color: "var(--muted, #8a7b6b)",
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div
      style={{
        background: "rgba(244,228,193,0.03)",
        border: "1px dashed rgba(232,163,61,0.3)",
        borderRadius: 14,
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--cream-soft)",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 10 }}>🌱</div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--cream)",
          marginBottom: 6,
        }}
      >
        Aucun groupe pour l'instant
      </div>
      <div style={{ fontSize: 13, marginBottom: 18 }}>
        Crée ton premier groupe pour suivre tes dépenses partagées.
      </div>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          style={{
            padding: "10px 20px",
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "#16111E",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ＋ Créer mon premier groupe
        </button>
      )}
    </div>
  );
}

function noDecimals(currency: string): boolean {
  return ["XAF", "XOF", "KES", "TZS", "UGX", "RWF", "CDF"].includes(currency);
}
