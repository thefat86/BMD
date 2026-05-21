"use client";

/**
 * <DesktopDashboard> · Vue desktop du tableau de bord — refonte V240
 * (maquette B v2 validée par Fabrice).
 *
 * Layout cible :
 *   1. Hero épuré centré : SOLDE NET CONSOLIDÉ (Cormorant Garamond 52px)
 *   2. 4 micro-stats : Groupes / Reconnaissances / À encaisser / Retards
 *   3. Raccourcis pliables (<details> natif) — 6 boutons
 *   4. 2 cards larges : Mes groupes | Reconnaissances
 *      Chaque card a un encart "On me doit / Je dois" + 3 lignes cliquables.
 *
 * Source : 4 endpoints en parallèle (api.me, api.listGroups, api.listDebts,
 * api.getMyGlobalBalance — ce dernier optionnel pour le fallback).
 * Conversion devise via useCurrency() pour les totaux mixtes.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, isUnauthorized, clearToken } from "../api-client";
import { useCurrency } from "../currency-provider";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons/icon";
import { SubscriptionBanner } from "./subscription-banner";
import { prefetchBatch } from "../use-prefetch";
import { useMyEvents } from "../use-realtime";
// V157 — Modal partagé Créer Groupe / RDD
import { CreateChoiceModal } from "./create-choice-modal";
// V159 — Modaux d'édition rapide depuis raccourcis
import {
  ReferralModal,
  PaymentsModal,
} from "./dashboard-quick-modals";
// V153.E — Widget RDD lazy (utilisé hors hero pour la signature/retards)
const MyDebtsWidget = dynamic(
  () => import("./my-debts-widget").then((m) => m.MyDebtsWidget),
  { ssr: false, loading: () => null },
);

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

interface DebtSummary {
  id: string;
  status: string;
  amount: string;
  currency: string;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  parties: Array<{ displayName: string; role: string; userId?: string }>;
  schedules: Array<{
    id?: string;
    dueDate: string;
    expectedAmount: string;
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
  }>;
  createdAt?: string;
}

const ACTIVE_DEBT_STATUSES = [
  "NEGOTIATING",
  "SIGNED",
  "ACTIVE",
  "IN_PROGRESS",
  "PROPOSED",
  "ACCEPTED",
];

// Palette V240
const COCOA = "#2B1F15";
const COCOA_SOFT = "#8B6F47";
const SAFFRON = "#C58A2E";
const CREAM = "#FAF6EE";
const SABLE = "#F4ECD9";
const SAGE = "#1F7A57";
const TERRACOTTA = "#9F4628";
const BORDER = "#EAD9B8";

interface Props {
  onCreateGroup?: () => void;
  onCreateGroupWithType?: (type: string) => void;
}

export function DesktopDashboard({ onCreateGroup }: Props) {
  const router = useRouter();
  const t = useT();
  const { code: userCurrency, formatAmount, convert } = useCurrency();
  const [me, setMe] = useState<any>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // V157/V159 — modaux quick actions
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  function fetchAll() {
    Promise.all([
      api.me(),
      api.listGroups(),
      api.listDebts().catch(() => ({ debts: [] as any[] })),
    ])
      .then(([meRes, groupsRes, debtsRes]) => {
        setMe(meRes.user);
        setGroups(groupsRes as Group[]);
        setDebts(((debtsRes as any)?.debts ?? []) as DebtSummary[]);
        setLoading(false);
        const urls = (groupsRes as Group[])
          .slice(0, 6)
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

  // V118.D — anti double-fetch sur init currency
  const initialCurrencyRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialCurrencyRef.current === null) {
      initialCurrencyRef.current = userCurrency;
      fetchAll();
      return;
    }
    if (initialCurrencyRef.current === userCurrency) return;
    initialCurrencyRef.current = userCurrency;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, userCurrency]);

  // SSE temps réel : update auto sur events qui changent ma balance
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

  // === Agrégations ===========================================================
  const groupsAgg = useMemo(() => {
    let net = 0;
    let owed = 0;
    let oweing = 0;
    const activeCount = groups.length;
    for (const g of groups) {
      const raw = Number.parseFloat(g.myNet ?? "0") || 0;
      // Convertit dans la devise user (le hook convert utilise les FX rates BMD)
      const converted = convert ? convert(raw, g.defaultCurrency) : raw;
      net += converted;
      if (converted > 0) owed += converted;
      else if (converted < 0) oweing += Math.abs(converted);
    }
    return { net, owed, oweing, activeCount };
  }, [groups, convert]);

  const debtsAgg = useMemo(() => {
    let owedToMe = 0;
    let iOwe = 0;
    let activeCount = 0;
    let lateCount = 0;
    const counterpartiesOwingMe = new Set<string>();
    const counterpartiesIoweTo = new Set<string>();
    const todayMs = Date.now();
    for (const d of debts) {
      const isActive = ACTIVE_DEBT_STATUSES.includes(d.status);
      if (!isActive) continue;
      activeCount += 1;
      let isLate = false;
      const remaining = d.schedules
        .filter((s) => s.status !== "CONFIRMED" && s.status !== "PAID")
        .reduce((sum, s) => {
          const due = new Date(s.dueDate).getTime();
          if (
            (s.status === "LATE" ||
              s.status === "MISSED" ||
              (Number.isFinite(due) && due < todayMs))
          ) {
            isLate = true;
          }
          return sum + (Number.parseFloat(s.expectedAmount) || 0);
        }, 0);
      if (isLate) lateCount += 1;
      const conv = convert ? convert(remaining, d.currency) : remaining;
      // Identifie la counterparty (autre partie principale)
      const counter =
        d.parties.find((p) => {
          if (d.myRole === "CREDITOR") return p.role === "DEBTOR";
          if (d.myRole === "DEBTOR") return p.role === "CREDITOR";
          return false;
        })?.userId ??
        d.parties.find((p) => {
          if (d.myRole === "CREDITOR") return p.role === "DEBTOR";
          if (d.myRole === "DEBTOR") return p.role === "CREDITOR";
          return false;
        })?.displayName ??
        d.id;
      if (d.myRole === "CREDITOR") {
        owedToMe += conv;
        if (conv > 0) counterpartiesOwingMe.add(counter);
      } else if (d.myRole === "DEBTOR") {
        iOwe += conv;
        if (conv > 0) counterpartiesIoweTo.add(counter);
      }
    }
    const net = owedToMe - iOwe;
    return {
      net,
      owedToMe,
      iOwe,
      activeCount,
      lateCount,
      counterpartiesOwingMe,
      counterpartiesIoweTo,
    };
  }, [debts, convert]);

  // À encaisser = personnes uniques (cross groupes + RDD) qui me doivent.
  // Pour les groupes on ne fait pas de breakdown par membre via myNet, donc on
  // compte au moins les counterparties RDD côté CREDITOR + 1 ligne par groupe
  // positif (heuristique). C'est volontairement simple pour le MVP V240.
  const toCollectCount = useMemo(() => {
    const set = new Set<string>(debtsAgg.counterpartiesOwingMe);
    for (const g of groups) {
      const n = Number.parseFloat(g.myNet ?? "0");
      if (n > 0) set.add(`group:${g.id}`);
    }
    return set.size;
  }, [debtsAgg.counterpartiesOwingMe, groups]);

  const consolidatedNet = groupsAgg.net + debtsAgg.net;

  // 3 groupes les plus récents (CSS : 3 lignes max)
  const topGroups = useMemo(() => {
    return [...groups]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 3);
  }, [groups]);

  // 3 RDD les plus récentes (actives prioritaires)
  const topDebts = useMemo(() => {
    const actives = debts.filter((d) => ACTIVE_DEBT_STATUSES.includes(d.status));
    return actives.slice(0, 3);
  }, [debts]);

  const completedDebtsCount = useMemo(
    () => debts.filter((d) => d.status === "COMPLETED").length,
    [debts],
  );

  if (loading) {
    return (
      <div style={{ padding: 40, color: COCOA_SOFT }}>
        {t("common.loading") || "Chargement…"}
      </div>
    );
  }

  const firstName = me?.displayName?.split(" ")[0] ?? "";
  const fmt = (n: number) =>
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtZero = (n: number) =>
    n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

  function navAdd(href: string) {
    router.push(href);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SubscriptionBanner />

      {/* ===== HERO CENTRÉ ÉPURÉ ============================================ */}
      <section
        style={{
          textAlign: "center",
          padding: "12px 0 6px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: COCOA_SOFT,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {t("dashboardV240.hero.label")}
        </div>
        <div
          className="bmd-num"
          style={{
            fontFamily: "Cormorant Garamond, Georgia, serif",
            fontSize: 52,
            fontWeight: 500,
            letterSpacing: "-1.6px",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            marginTop: 6,
            color:
              consolidatedNet > 0.005
                ? SAGE
                : consolidatedNet < -0.005
                  ? TERRACOTTA
                  : COCOA,
          }}
        >
          {consolidatedNet >= 0 ? "+" : "−"}
          {fmt(Math.abs(consolidatedNet))} {userCurrency}
        </div>
        <div
          style={{
            fontSize: 12,
            color: COCOA_SOFT,
            marginTop: 6,
          }}
        >
          {t("dashboardV240.hero.greeting", {
            firstName,
            nGroups: String(groupsAgg.activeCount),
            nDebts: String(debtsAgg.activeCount),
          })}
        </div>
      </section>

      {/* ===== 4 MICRO-STATS ================================================ */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        <MicroStat
          label={t("dashboardV240.stats.groups")}
          value={`${groupsAgg.net >= 0 ? "+" : "−"}${fmtZero(Math.abs(groupsAgg.net))} ${userCurrency}`}
          hint={t("dashboardV240.stats.groupsHint", {
            n: String(groupsAgg.activeCount),
          })}
          valueColor={
            groupsAgg.net > 0.005
              ? SAGE
              : groupsAgg.net < -0.005
                ? TERRACOTTA
                : COCOA
          }
        />
        <MicroStat
          label={t("dashboardV240.stats.debts")}
          value={`${debtsAgg.net >= 0 ? "+" : "−"}${fmtZero(Math.abs(debtsAgg.net))} ${userCurrency}`}
          hint={t("dashboardV240.stats.debtsHint", {
            n: String(debtsAgg.activeCount),
          })}
          valueColor={
            debtsAgg.net > 0.005
              ? SAGE
              : debtsAgg.net < -0.005
                ? TERRACOTTA
                : COCOA
          }
        />
        <MicroStat
          label={t("dashboardV240.stats.toCollect")}
          value={String(toCollectCount)}
          hint={t("dashboardV240.stats.toCollectHint")}
          valueColor={COCOA}
        />
        <MicroStat
          label={t("dashboardV240.stats.late")}
          value={String(debtsAgg.lateCount)}
          hint={t("dashboardV240.stats.lateHint")}
          valueColor={debtsAgg.lateCount > 0 ? TERRACOTTA : COCOA}
        />
      </section>

      {/* ===== RACCOURCIS PLIABLES ========================================== */}
      <details className="bmd-v240-shortcuts">
        <summary
          style={{
            background: SABLE,
            border: `0.5px solid ${BORDER}`,
            borderRadius: 10,
            padding: "9px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            fontSize: 12,
            color: COCOA,
            fontWeight: 500,
            listStyle: "none",
            userSelect: "none",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={14} color={SAFFRON} />
            {t("dashboardV240.shortcuts.title")}
            <span style={{ color: COCOA_SOFT, fontWeight: 400 }}>(6)</span>
          </span>
          <span style={{ color: COCOA_SOFT, fontSize: 11 }}>
            {t("dashboardV240.shortcuts.hint")} ▾
          </span>
        </summary>
        <div
          style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8,
          }}
          className="bmd-v240-shortcuts-grid"
        >
          <ShortcutBtn
            iconName="plus"
            label={t("dashboardV240.shortcuts.create")}
            onClick={() => setCreateChoiceOpen(true)}
          />
          <ShortcutBtn
            iconName="gift"
            label={t("dashboardV240.shortcuts.referral")}
            onClick={() => setReferralOpen(true)}
          />
          <ShortcutBtn
            iconName="bar-chart-2"
            label={t("dashboardV240.shortcuts.stats")}
            onClick={() => navAdd("/dashboard/stats")}
          />
          <ShortcutBtn
            iconName="receipt"
            label={t("dashboardV240.shortcuts.settle")}
            onClick={() => setPaymentsOpen(true)}
          />
          <ShortcutBtn
            iconName="bell"
            label={t("dashboardV240.shortcuts.remind")}
            onClick={() => navAdd("/dashboard/notifications")}
          />
          <ShortcutBtn
            iconName="users"
            label={t("dashboardV240.shortcuts.invite")}
            onClick={() => navAdd("/dashboard/affiliate")}
          />
        </div>
        <style>{`
          .bmd-v240-shortcuts > summary::-webkit-details-marker { display: none; }
          @media (max-width: 760px) {
            .bmd-v240-shortcuts-grid {
              grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)) !important;
            }
          }
        `}</style>
      </details>

      {/* ===== 2 CARDS LARGES =============================================== */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
        className="bmd-v240-cards"
      >
        {/* MES GROUPES */}
        <WideCard
          title={t("dashboardV240.groupsCard.title")}
          onViewAll={() => navAdd("/dashboard/groups")}
          viewAllLabel={t("dashboardV240.viewAll")}
        >
          <SplitBox
            leftLabel={t("dashboardV240.onMeDoit")}
            leftValue={`+${fmtZero(groupsAgg.owed)} ${userCurrency}`}
            leftColor={groupsAgg.owed > 0.005 ? SAGE : COCOA_SOFT}
            rightLabel={t("dashboardV240.jeDois")}
            rightValue={`${groupsAgg.oweing > 0.005 ? "−" : ""}${fmtZero(groupsAgg.oweing)} ${userCurrency}`}
            rightColor={groupsAgg.oweing > 0.005 ? TERRACOTTA : COCOA_SOFT}
          />
          {topGroups.length === 0 ? (
            <EmptyLine text={t("dashboardV240.empty.groups")} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {topGroups.map((g) => {
                const n = Number.parseFloat(g.myNet ?? "0") || 0;
                return (
                  <ClickableRow
                    key={g.id}
                    onClick={() => navAdd(`/dashboard/groups/${g.id}`)}
                  >
                    <RowAvatar
                      seed={g.id}
                      name={g.name}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: COCOA,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.name}
                      </div>
                      <div style={{ fontSize: 10, color: COCOA_SOFT }}>
                        {g.membersCount} {t("group.membersCount") || "membres"}
                      </div>
                    </div>
                    <div
                      className="bmd-num"
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        fontVariantNumeric: "tabular-nums",
                        color:
                          n > 0.005
                            ? SAGE
                            : n < -0.005
                              ? TERRACOTTA
                              : COCOA_SOFT,
                      }}
                    >
                      {n > 0.005
                        ? `+${formatAmount(Math.abs(n).toString(), g.defaultCurrency)}`
                        : n < -0.005
                          ? `−${formatAmount(Math.abs(n).toString(), g.defaultCurrency)}`
                          : `0 ${g.defaultCurrency}`}
                    </div>
                  </ClickableRow>
                );
              })}
            </div>
          )}
        </WideCard>

        {/* RECONNAISSANCES */}
        <WideCard
          title={t("dashboardV240.debtsCard.title")}
          onViewAll={() => navAdd("/dashboard/debts")}
          viewAllLabel={t("dashboardV240.viewAll")}
        >
          <SplitBox
            leftLabel={t("dashboardV240.onMeDoit")}
            leftValue={`+${fmtZero(debtsAgg.owedToMe)} ${userCurrency}`}
            leftColor={debtsAgg.owedToMe > 0.005 ? SAGE : COCOA_SOFT}
            rightLabel={t("dashboardV240.jeDois")}
            rightValue={`${debtsAgg.iOwe > 0.005 ? "−" : ""}${fmtZero(debtsAgg.iOwe)} ${userCurrency}`}
            rightColor={debtsAgg.iOwe > 0.005 ? TERRACOTTA : COCOA_SOFT}
          />
          {topDebts.length === 0 ? (
            <EmptyLine text={t("dashboardV240.empty.debts")} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {topDebts.map((d) => {
                const remaining = d.schedules
                  .filter(
                    (s) => s.status !== "CONFIRMED" && s.status !== "PAID",
                  )
                  .reduce(
                    (sum, s) =>
                      sum + (Number.parseFloat(s.expectedAmount) || 0),
                    0,
                  );
                const counter =
                  d.parties.find(
                    (p) =>
                      (d.myRole === "CREDITOR" && p.role === "DEBTOR") ||
                      (d.myRole === "DEBTOR" && p.role === "CREDITOR"),
                  )?.displayName ?? "—";
                const sign = d.myRole === "CREDITOR" ? "+" : d.myRole === "DEBTOR" ? "−" : "";
                const color =
                  d.myRole === "CREDITOR"
                    ? SAGE
                    : d.myRole === "DEBTOR"
                      ? TERRACOTTA
                      : COCOA_SOFT;
                return (
                  <ClickableRow
                    key={d.id}
                    onClick={() => navAdd(`/dashboard/debts/${d.id}`)}
                  >
                    <RowAvatar seed={d.id} name={counter} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: COCOA,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {counter}
                      </div>
                      <div style={{ fontSize: 10, color: COCOA_SOFT }}>
                        {d.status}
                      </div>
                    </div>
                    <div
                      className="bmd-num"
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        fontVariantNumeric: "tabular-nums",
                        color,
                      }}
                    >
                      {sign}
                      {formatAmount(remaining.toString(), d.currency)}
                    </div>
                  </ClickableRow>
                );
              })}
              {completedDebtsCount > 0 && (
                <ClickableRow
                  onClick={() => navAdd("/dashboard/debts?tab=completed")}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: SABLE,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: COCOA_SOFT,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ✓
                  </div>
                  <div
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: COCOA_SOFT,
                    }}
                  >
                    {t("dashboardV240.debts.settledCount", {
                      n: String(completedDebtsCount),
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: SAFFRON }}>›</div>
                </ClickableRow>
              )}
            </div>
          )}
        </WideCard>

        <style>{`
          @media (max-width: 900px) {
            .bmd-v240-cards { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      {/* Widget RDD enrichi (caché si aucune RDD) — laissé en bas pour
          conserver la visibilité statuts détaillés (à signer / en retard). */}
      <MyDebtsWidget />

      {/* ===== Modaux raccourcis ============================================ */}
      <CreateChoiceModal
        open={createChoiceOpen}
        onClose={() => setCreateChoiceOpen(false)}
        onCreateGroup={() => {
          setCreateChoiceOpen(false);
          if (onCreateGroup) onCreateGroup();
        }}
        onCreateDebt={() => {
          setCreateChoiceOpen(false);
          router.push("/dashboard/debts/new");
        }}
        t={t}
      />
      <ReferralModal
        open={referralOpen}
        onClose={() => setReferralOpen(false)}
      />
      <PaymentsModal
        open={paymentsOpen}
        onClose={() => setPaymentsOpen(false)}
      />
    </div>
  );
}

// =============================================================================
// Sous-composants
// =============================================================================

function MicroStat({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string;
  value: string;
  hint: string;
  valueColor: string;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 11,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: COCOA_SOFT,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        className="bmd-num"
        style={{
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 20,
          fontWeight: 500,
          lineHeight: 1,
          marginTop: 4,
          color: valueColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: COCOA_SOFT,
          marginTop: 4,
        }}
      >
        {hint}
      </div>
    </div>
  );
}

function ShortcutBtn({
  iconName,
  label,
  onClick,
}: {
  iconName: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "12px 6px",
        background: "#FFFFFF",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 10,
        color: COCOA,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.15s, transform 0.05s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CREAM;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#FFFFFF";
      }}
    >
      <Icon name={iconName} size={18} color={SAFFRON} />
      <span style={{ fontSize: 10, color: COCOA, fontWeight: 500 }}>
        {label}
      </span>
    </button>
  );
}

function WideCard({
  title,
  onViewAll,
  viewAllLabel,
  children,
}: {
  title: string;
  onViewAll: () => void;
  viewAllLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 14,
        padding: "18px 18px 14px",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontFamily: "Cormorant Garamond, Georgia, serif",
            fontSize: 18,
            fontWeight: 600,
            color: COCOA,
            margin: 0,
            letterSpacing: "-0.2px",
          }}
        >
          {title}
        </h3>
        <button
          type="button"
          onClick={onViewAll}
          style={{
            background: "transparent",
            border: "none",
            color: SAFFRON,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          {viewAllLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function SplitBox({
  leftLabel,
  leftValue,
  leftColor,
  rightLabel,
  rightValue,
  rightColor,
}: {
  leftLabel: string;
  leftValue: string;
  leftColor: string;
  rightLabel: string;
  rightValue: string;
  rightColor: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        padding: "10px 12px",
        background: CREAM,
        borderRadius: 9,
        marginBottom: 14,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 9,
            color: COCOA_SOFT,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 2,
          }}
        >
          {leftLabel}
        </div>
        <div
          className="bmd-num"
          style={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 14,
            fontWeight: 600,
            color: leftColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {leftValue}
        </div>
      </div>
      <div style={{ borderLeft: `0.5px dashed ${BORDER}`, paddingLeft: 10 }}>
        <div
          style={{
            fontSize: 9,
            color: COCOA_SOFT,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 2,
          }}
        >
          {rightLabel}
        </div>
        <div
          className="bmd-num"
          style={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 14,
            fontWeight: 600,
            color: rightColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rightValue}
        </div>
      </div>
    </div>
  );
}

function ClickableRow({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 8px",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.15s",
        fontFamily: "inherit",
        width: "100%",
        textAlign: "left",
        color: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CREAM;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function RowAvatar({ seed, name }: { seed: string; name: string }) {
  // V240 — Avatar 30x30 carré arrondi (borderRadius 8) — déterministe par seed.
  // On n'utilise pas <AvatarColored> direct ici car ce composant est en cercle
  // (50%) ; le design B v2 demande des tuiles rondes-carrées (squircle 8px).
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("") || "?";
  // Palette déterministe simple — hash du seed → 1 des 5 couleurs V45
  const palette = [
    { bg: "#F3E2C4", fg: "#854F0B" },
    { bg: "#E8DFCB", fg: "#3F5240" },
    { bg: "#F2D9C6", fg: "#9F4628" },
    { bg: "#DDE5DB", fg: "#1F7A57" },
    { bg: "#E3DDE9", fg: "#5B4583" },
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const { bg, fg } = palette[Math.abs(h) % palette.length]!;
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: bg,
        color: fg,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
        fontFamily: "inherit",
      }}
    >
      {initials}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "16px 10px",
        textAlign: "center",
        fontSize: 12,
        color: COCOA_SOFT,
        fontStyle: "italic",
      }}
    >
      {text}
    </div>
  );
}
