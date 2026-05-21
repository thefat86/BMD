"use client";

/**
 * V201 — MobileFundDetailView · vue détail d'une caisse projet.
 * =============================================================================
 * Composants :
 *   - Hero : nom + statut + jauge + balance + bouton clôturer (si autorisé)
 *   - Tabs : Cotisations / Dépenses / Audit
 *   - Actions contextuelles selon rôle :
 *       - Tous : « Je cotise »
 *       - Trésorier (= createdByUserId par défaut, ou treasurerUserId) :
 *         valider/refuser cotisations, proposer/exécuter dépenses
 *       - Contributeurs validés : voter sur les dépenses en attente
 *
 * Bannière légale « Registre » + nom du trésorier toujours visible (transparence).
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { FundsLegalNotice } from "./funds-legal-notice";
import { Icon } from "./icons";

type Detail = Awaited<ReturnType<typeof api.getProjectFund>>;
type Contribution = Detail["contributions"][number];
type Expense = Detail["expenses"][number];
type Tab = "contributions" | "expenses" | "audit";

// Sheets d'action lazy-loadés (gros formulaires)
const MobileContributeSheet = lazy(() =>
  import("./mobile-fund-action-sheets").then((m) => ({
    default: m.MobileContributeSheet,
  })),
);
const MobileProposeExpenseSheet = lazy(() =>
  import("./mobile-fund-action-sheets").then((m) => ({
    default: m.MobileProposeExpenseSheet,
  })),
);
const MobileRejectContributionSheet = lazy(() =>
  import("./mobile-fund-action-sheets").then((m) => ({
    default: m.MobileRejectContributionSheet,
  })),
);
// V203 — Édition + partage (lazy car gros markup QR)
const MobileEditFundSheet = lazy(() =>
  import("./mobile-fund-meta-sheets").then((m) => ({
    default: m.MobileEditFundSheet,
  })),
);
const MobileShareFundSheet = lazy(() =>
  import("./mobile-fund-meta-sheets").then((m) => ({
    default: m.MobileShareFundSheet,
  })),
);

interface Props {
  fundId: string;
  groupId: string;
  meId: string;
}

export function MobileFundDetailView({ fundId, groupId, meId }: Props) {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();

  const [data, setData] = useState<Detail | null>(null);
  const [auditLog, setAuditLog] = useState<Awaited<
    ReturnType<typeof api.getProjectFundAuditLog>
  > | null>(null);
  const [tab, setTab] = useState<Tab>("contributions");
  const [error, setError] = useState<string | null>(null);

  const [showContribute, setShowContribute] = useState(false);
  const [showProposeExpense, setShowProposeExpense] = useState(false);
  const [rejectingContribution, setRejectingContribution] =
    useState<Contribution | null>(null);
  // V203 — Édition + partage
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);

  async function refresh() {
    try {
      const d = await api.getProjectFund(fundId);
      setData(d);
      if (tab === "audit" && !auditLog) {
        const log = await api.getProjectFundAuditLog(fundId);
        setAuditLog(log);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId]);

  async function switchTab(next: Tab) {
    setTab(next);
    if (next === "audit" && !auditLog) {
      try {
        const log = await api.getProjectFundAuditLog(fundId);
        setAuditLog(log);
      } catch (e) {
        toast.error(e);
      }
    }
  }

  // Loading
  if (!data) {
    if (error) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <p style={{ color: "var(--v45-terracotta, #9F4628)" }}>{error}</p>
        </div>
      );
    }
    return (
      <div
        style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}
      >
        {t("common.loading") || "Chargement…"}
      </div>
    );
  }

  const fund = data.fund;
  const balance = data.balance;
  const target = fund.targetAmount ? parseFloat(fund.targetAmount) : null;
  const progress =
    target && target > 0
      ? Math.min(100, Math.round((balance.contributed / target) * 100))
      : null;

  const treasurerId = fund.treasurerUserId ?? fund.createdByUserId;
  const isTreasurer = meId === treasurerId;
  const isCreator = meId === fund.createdByUserId;
  const isClosed = fund.status === "CLOSED" || fund.status === "ARCHIVED";
  // V203 — Bouton « Modifier » visible pour le créateur ou trésorier
  // tant que la caisse n'est pas clôturée (le backend re-vérifie).
  const canEdit = (isTreasurer || isCreator) && !isClosed;

  // L'user a-t-il au moins 1 cotisation validée ? Sinon il ne peut pas voter.
  const canVote = data.contributions.some(
    (c) => c.contributorUserId === meId && c.status === "VALIDATED",
  );

  const pendingContribs = data.contributions.filter(
    (c) => c.status === "PENDING",
  );

  async function handleValidate(c: Contribution) {
    try {
      await api.validateProjectFundContribution(fundId, c.id);
      toast.success(
        t("funds.contribValidatedToast") || "Cotisation validée",
      );
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleVote(expense: Expense, vote: boolean) {
    try {
      await api.voteOnProjectFundExpense(fundId, expense.id, vote);
      toast.success(
        vote
          ? t("funds.voteForToast") || "Vote pour enregistré"
          : t("funds.voteAgainstToast") || "Vote contre enregistré",
      );
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleExecute(expense: Expense) {
    const ok = await dialog.confirm(
      t("funds.executeConfirm", {
        amount: expense.amount,
        currency: expense.currency,
      }) ||
        `Confirmer l'exécution de cette dépense (${expense.amount} ${expense.currency}) ?`,
      {
        variant: "warning",
        title: t("funds.executeTitle") || "Exécuter la dépense",
        confirmLabel: t("funds.executeAction") || "Exécuter",
      },
    );
    if (!ok) return;
    try {
      await api.executeProjectFundExpense(fundId, expense.id);
      toast.success(t("funds.executedToast") || "Dépense exécutée");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleClose() {
    const ok = await dialog.confirm(
      t("funds.closeConfirm") ||
        "Clôturer cette caisse ? Plus aucune cotisation ni dépense ne sera possible.",
      {
        variant: "danger",
        title: t("funds.closeTitle") || "Clôturer la caisse",
        confirmLabel: t("funds.closeAction") || "Clôturer",
      },
    );
    if (!ok) return;
    try {
      await api.closeProjectFund(fundId);
      toast.success(t("funds.closedToast") || "Caisse clôturée");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div style={{ padding: "16px 16px 80px", display: "grid", gap: 14 }}>
      {/* === HERO === */}
      <section
        style={{
          background:
            "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(31,122,87,0.06))",
          border: "1px solid rgba(197,138,46,0.24)",
          borderRadius: 18,
          padding: "18px 18px 16px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "var(--saffron, #C58A2E)",
            letterSpacing: 1.4,
            fontWeight: 700,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          {t(`funds.template.${fund.template.toLowerCase()}`) ||
            fund.template}
          {isClosed && (
            <span
              style={{
                marginLeft: 8,
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgba(122,113,100,0.18)",
                color: "var(--muted, #7a7164)",
                fontSize: 9,
                letterSpacing: 0.8,
              }}
            >
              {t("funds.statusClosed") || "Clôturée"}
            </span>
          )}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 26,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.2,
          }}
        >
          {fund.name}
        </h1>
        {fund.description && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "var(--muted, #7a7164)",
              lineHeight: 1.5,
            }}
          >
            {fund.description}
          </p>
        )}

        {/* V203 — Actions meta : Modifier (créateur/trésorier) + Partager (tous) */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
          }}
        >
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="bmd-tap"
              aria-label={t("funds.edit.title") || "Modifier la caisse"}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(43,31,21,0.12)",
                background: "var(--paper, #FFFFFF)",
                color: "var(--cocoa, #2B1F15)",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 36,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                touchAction: "manipulation",
              }}
            >
              <Icon name="pencil" size={13} strokeWidth={1.8} />{" "}
              {t("funds.edit.button") || "Modifier"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className="bmd-tap"
            aria-label={t("funds.share.title") || "Partager la caisse"}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(197,138,46,0.35)",
              background: "rgba(197,138,46,0.08)",
              color: "var(--v45-saffron, #C58A2E)",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 36,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              touchAction: "manipulation",
            }}
          >
            <Icon name="share-2" size={13} strokeWidth={1.8} />{" "}
            {t("funds.share.button") || "Partager"}
          </button>
        </div>

        {/* Jauge */}
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 32,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {balance.contributed.toFixed(0)}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--muted, #7a7164)",
                  marginLeft: 6,
                  fontFamily: "inherit",
                }}
              >
                {fund.currency}
              </span>
            </span>
            {target && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--muted, #7a7164)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                / {target.toFixed(0)} {fund.currency}{" "}
                {progress !== null && `(${progress}%)`}
              </span>
            )}
          </div>
          {progress !== null && (
            <div
              style={{
                height: 8,
                background: "rgba(197,138,46,0.10)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                  transition: "width .3s ease",
                }}
              />
            </div>
          )}
        </div>

        {/* Stats compactes */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginTop: 14,
          }}
        >
          <Stat
            label={t("funds.stats.spent") || "Dépensé"}
            value={balance.spent}
            currency={fund.currency}
            tint="var(--v45-terracotta, #9F4628)"
          />
          <Stat
            label={t("funds.stats.balance") || "Disponible"}
            value={balance.balance}
            currency={fund.currency}
            tint="var(--v45-emerald, #1F7A57)"
          />
          <Stat
            label={t("funds.stats.contributors") || "Contributeurs"}
            value={balance.contributorsCount}
            tint="var(--saffron, #C58A2E)"
          />
        </div>

        {/* Action principale + bouton clôturer */}
        {!isClosed && (
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowContribute(true)}
              className="bmd-tap"
              style={{
                width: "100%",
                padding: "13px 14px",
                borderRadius: 999,
                border: "none",
                background:
                  "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                color: "#FBF6EC",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.3,
                cursor: "pointer",
                minHeight: 50,
                boxShadow: "0 8px 24px -8px rgba(197,138,46,0.50)",
                touchAction: "manipulation",
              }}
            >
              ＋ {t("funds.contribute.cta") || "Je cotise"}
            </button>
            {isTreasurer && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowProposeExpense(true)}
                  className="bmd-tap"
                  style={{
                    flex: 1,
                    padding: "11px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(31,122,87,0.40)",
                    background: "rgba(31,122,87,0.08)",
                    color: "var(--v45-emerald, #1F7A57)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 44,
                    touchAction: "manipulation",
                  }}
                >
                  {t("funds.proposeExpense.cta") || "Proposer dépense"}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="bmd-tap"
                  style={{
                    flex: 1,
                    padding: "11px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(159,70,40,0.28)",
                    background: "transparent",
                    color: "var(--v45-terracotta, #9F4628)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 44,
                    touchAction: "manipulation",
                  }}
                >
                  {t("funds.closeAction") || "Clôturer"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* === Bannière légale + trésorier === */}
      <FundsLegalNotice
        variant="compact"
        treasurerName={
          isTreasurer
            ? t("funds.treasurerYou") || "Toi"
            : data.contributions.find(
                (c) => c.contributorUserId === treasurerId,
              )?.contributor.displayName ?? null
        }
      />

      {/* === TABS === */}
      <div
        role="tablist"
        aria-label={t("funds.viewsLabel") || "Vues de la caisse"}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
          background: "rgba(244,228,193,0.06)",
          borderRadius: 12,
          padding: 4,
        }}
      >
        <TabPill
          active={tab === "contributions"}
          label={t("funds.tabContributions") || "Cotisations"}
          badge={pendingContribs.length || undefined}
          onClick={() => switchTab("contributions")}
        />
        <TabPill
          active={tab === "expenses"}
          label={t("funds.tabExpenses") || "Dépenses"}
          onClick={() => switchTab("expenses")}
        />
        <TabPill
          active={tab === "audit"}
          label={t("funds.tabAudit") || "Audit"}
          onClick={() => switchTab("audit")}
        />
      </div>

      {/* === CONTENU TABS === */}
      {tab === "contributions" && (
        <ContributionsList
          contributions={data.contributions}
          meId={meId}
          isTreasurer={isTreasurer}
          onValidate={handleValidate}
          onReject={setRejectingContribution}
          t={t}
        />
      )}
      {tab === "expenses" && (
        <ExpensesList
          expenses={data.expenses}
          fundCurrency={fund.currency}
          isTreasurer={isTreasurer}
          canVote={canVote}
          onVote={handleVote}
          onExecute={handleExecute}
          t={t}
        />
      )}
      {tab === "audit" && <AuditList log={auditLog} t={t} />}

      {/* === SHEETS === */}
      {showContribute && (
        <Suspense fallback={null}>
          <MobileContributeSheet
            fundId={fundId}
            fundCurrency={fund.currency}
            onClose={() => setShowContribute(false)}
            onContributed={() => {
              setShowContribute(false);
              toast.success(
                t("funds.contribDeclaredToast") || "Cotisation déclarée",
              );
              void refresh();
            }}
          />
        </Suspense>
      )}
      {showProposeExpense && (
        <Suspense fallback={null}>
          <MobileProposeExpenseSheet
            fundId={fundId}
            fundCurrency={fund.currency}
            availableBalance={balance.balance}
            onClose={() => setShowProposeExpense(false)}
            onProposed={() => {
              setShowProposeExpense(false);
              toast.success(t("funds.expenseProposedToast") || "Dépense proposée");
              void refresh();
            }}
          />
        </Suspense>
      )}
      {rejectingContribution && (
        <Suspense fallback={null}>
          <MobileRejectContributionSheet
            fundId={fundId}
            contribution={rejectingContribution}
            onClose={() => setRejectingContribution(null)}
            onRejected={() => {
              setRejectingContribution(null);
              toast.success(
                t("funds.contribRejectedToast") || "Cotisation refusée",
              );
              void refresh();
            }}
          />
        </Suspense>
      )}
      {/* V203 — Sheets meta : édition + partage */}
      {showEdit && (
        <Suspense fallback={null}>
          <MobileEditFundSheet
            fundId={fundId}
            current={{
              name: fund.name,
              description: fund.description,
              targetAmount: fund.targetAmount,
              currency: fund.currency,
              deadline: fund.deadline,
              treasurerUserId: fund.treasurerUserId,
            }}
            onClose={() => setShowEdit(false)}
            onUpdated={() => {
              setShowEdit(false);
              void refresh();
            }}
          />
        </Suspense>
      )}
      {showShare && (
        <Suspense fallback={null}>
          <MobileShareFundSheet
            fundId={fundId}
            publicCode={fund.publicCode}
            fundName={fund.name}
            onClose={() => setShowShare(false)}
          />
        </Suspense>
      )}

      {/* Bouton retour au groupe */}
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/groups/${groupId}/funds`)}
          className="bmd-tap"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted, #7a7164)",
            fontFamily: "inherit",
            fontSize: 12,
            padding: 8,
            cursor: "pointer",
          }}
        >
          ‹ {t("funds.backToList") || "Toutes les caisses"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Sous-composants
// ============================================================================

function Stat({
  label,
  value,
  currency,
  tint,
}: {
  label: string;
  value: number;
  currency?: string;
  tint: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.50)",
        border: "1px solid rgba(244,228,193,0.10)",
        borderRadius: 10,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--muted, #7a7164)",
          letterSpacing: 0.8,
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: tint,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--bmd-num, inherit)",
        }}
      >
        {currency
          ? `${value.toFixed(0)}`
          : value}
        {currency && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              marginLeft: 3,
              color: "var(--muted, #7a7164)",
              fontFamily: "inherit",
            }}
          >
            {currency}
          </span>
        )}
      </div>
    </div>
  );
}

function TabPill({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="bmd-tap"
      style={{
        padding: "9px 10px",
        borderRadius: 8,
        border: "none",
        background: active
          ? "var(--saffron, #C58A2E)"
          : "transparent",
        color: active ? "#FBF6EC" : "var(--cocoa, #2B1F15)",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
        cursor: "pointer",
        minHeight: 36,
        touchAction: "manipulation",
        position: "relative",
      }}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            display: "inline-block",
            marginLeft: 5,
            minWidth: 18,
            padding: "0 4px",
            borderRadius: 999,
            background: active
              ? "rgba(255,255,255,0.32)"
              : "var(--v45-terracotta, #9F4628)",
            color: active ? "#FBF6EC" : "#FBF6EC",
            fontSize: 10,
            fontWeight: 800,
            lineHeight: "16px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ContributionsList({
  contributions,
  meId,
  isTreasurer,
  onValidate,
  onReject,
  t,
}: {
  contributions: Contribution[];
  meId: string;
  isTreasurer: boolean;
  onValidate: (c: Contribution) => void;
  onReject: (c: Contribution) => void;
  t: ReturnType<typeof useT>;
}) {
  if (contributions.length === 0) {
    return (
      <EmptyState
        text={
          t("funds.noContributions") ||
          "Aucune cotisation pour le moment. Sois le premier à participer !"
        }
      />
    );
  }
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "grid",
        gap: 8,
      }}
    >
      {contributions.map((c) => (
        <li
          key={c.id}
          style={{
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--line, rgba(244,228,193,0.10))",
            borderRadius: 12,
            padding: "10px 12px",
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.contributor.displayName}
              {c.contributorUserId === meId && (
                <span
                  style={{
                    marginLeft: 5,
                    fontSize: 9,
                    color: "var(--saffron, #C58A2E)",
                    letterSpacing: 0.8,
                  }}
                >
                  {t("common.you") || "TOI"}
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--bmd-num, inherit)",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {parseFloat(c.amount).toFixed(0)} {c.currency}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 11,
              color: "var(--muted, #7a7164)",
            }}
          >
            <span>
              {t(`funds.method.${c.method.toLowerCase()}`) || c.method}
              {" · "}
              {new Date(c.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
            <StatusChip status={c.status} t={t} />
          </div>
          {c.note && (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: "var(--cocoa, #2B1F15)",
                fontStyle: "italic",
              }}
            >
              « {c.note} »
            </p>
          )}
          {c.proofUrl && (
            <a
              href={c.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: "var(--saffron, #C58A2E)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="paperclip" size={12} strokeWidth={1.8} />
              {t("funds.viewProof") || "Voir la preuve"}
            </a>
          )}
          {c.status === "REJECTED" && c.rejectionReason && (
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: "var(--v45-terracotta, #9F4628)",
              }}
            >
              {t("funds.rejectionReasonLabel") || "Motif"}: {c.rejectionReason}
            </p>
          )}
          {isTreasurer && c.status === "PENDING" && (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => onValidate(c)}
                className="bmd-tap"
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(31,122,87,0.40)",
                  background: "rgba(31,122,87,0.08)",
                  color: "var(--v45-emerald, #1F7A57)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  minHeight: 36,
                }}
              >
                ✓ {t("funds.validate") || "Valider"}
              </button>
              <button
                type="button"
                onClick={() => onReject(c)}
                className="bmd-tap"
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(159,70,40,0.30)",
                  background: "transparent",
                  color: "var(--v45-terracotta, #9F4628)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  minHeight: 36,
                }}
              >
                ✕ {t("funds.reject") || "Refuser"}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ExpensesList({
  expenses,
  fundCurrency,
  isTreasurer,
  canVote,
  onVote,
  onExecute,
  t,
}: {
  expenses: Expense[];
  fundCurrency: string;
  isTreasurer: boolean;
  canVote: boolean;
  onVote: (e: Expense, vote: boolean) => void;
  onExecute: (e: Expense) => void;
  t: ReturnType<typeof useT>;
}) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        text={t("funds.noExpenses") || "Aucune dépense proposée pour le moment."}
      />
    );
  }
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "grid",
        gap: 8,
      }}
    >
      {expenses.map((e) => {
        const isPendingVote = e.status === "PENDING_VOTE";
        const isApproved = e.status === "APPROVED";
        return (
          <li
            key={e.id}
            style={{
              background: "var(--paper, #FFFFFF)",
              border: "1px solid var(--line, rgba(244,228,193,0.10))",
              borderRadius: 12,
              padding: "10px 12px",
              display: "grid",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--cocoa, #2B1F15)",
                    lineHeight: 1.3,
                  }}
                >
                  {e.motive}
                </div>
                {e.beneficiary && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted, #7a7164)",
                      marginTop: 2,
                    }}
                  >
                    {t("funds.beneficiary") || "Bénéficiaire"}:{" "}
                    {e.beneficiary}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontFamily: "var(--bmd-num, inherit)",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--cocoa, #2B1F15)",
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {parseFloat(e.amount).toFixed(0)} {fundCurrency}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 11,
                color: "var(--muted, #7a7164)",
              }}
            >
              <span>
                {new Date(e.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
                {isPendingVote && e.voteClosesAt && (
                  <>
                    {" · "}
                    {t("funds.voteClosesIn") || "Vote jusqu'à"}{" "}
                    {new Date(e.voteClosesAt).toLocaleDateString()}
                  </>
                )}
              </span>
              <ExpenseStatusChip status={e.status} t={t} />
            </div>
            {(isPendingVote || isApproved || e.status === "EXECUTED") &&
              e.voteRequired && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--muted, #7a7164)",
                  }}
                >
                  <span style={{ color: "var(--v45-emerald, #1F7A57)" }}>
                    ✓ {e.votesFor}
                  </span>
                  <span style={{ color: "var(--v45-terracotta, #9F4628)" }}>
                    ✕ {e.votesAgainst}
                  </span>
                </div>
              )}
            {e.proofUrl && (
              <a
                href={e.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11,
                  color: "var(--saffron, #C58A2E)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon name="paperclip" size={12} strokeWidth={1.8} />
                {t("funds.viewProof") || "Voir la preuve"}
              </a>
            )}
            {isPendingVote && canVote && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => onVote(e, true)}
                  className="bmd-tap"
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(31,122,87,0.40)",
                    background: "rgba(31,122,87,0.08)",
                    color: "var(--v45-emerald, #1F7A57)",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 36,
                  }}
                >
                  ✓ {t("funds.voteFor") || "Pour"}
                </button>
                <button
                  type="button"
                  onClick={() => onVote(e, false)}
                  className="bmd-tap"
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(159,70,40,0.30)",
                    background: "transparent",
                    color: "var(--v45-terracotta, #9F4628)",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 36,
                  }}
                >
                  ✕ {t("funds.voteAgainst") || "Contre"}
                </button>
              </div>
            )}
            {isApproved && isTreasurer && (
              <button
                type="button"
                onClick={() => onExecute(e)}
                className="bmd-tap"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "none",
                  background:
                    "linear-gradient(135deg, var(--v45-emerald, #1F7A57), var(--v45-saffron, #C58A2E))",
                  color: "#FBF6EC",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  cursor: "pointer",
                  minHeight: 36,
                  marginTop: 4,
                }}
              >
                ✓ {t("funds.executeAction") || "Exécuter la dépense"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AuditList({
  log,
  t,
}: {
  log: Awaited<ReturnType<typeof api.getProjectFundAuditLog>> | null;
  t: ReturnType<typeof useT>;
}) {
  if (!log) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>
        {t("common.loading") || "Chargement…"}
      </div>
    );
  }
  if (log.length === 0) {
    return <EmptyState text={t("funds.noAudit") || "Aucun événement."} />;
  }
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "grid",
        gap: 6,
      }}
    >
      {log.map((ev) => (
        <li
          key={ev.id}
          style={{
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--line, rgba(244,228,193,0.10))",
            borderLeft: "3px solid var(--saffron, #C58A2E)",
            borderRadius: 10,
            padding: "8px 12px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {t(`funds.event.${ev.kind}`) || ev.kind}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted, #7a7164)",
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {new Date(ev.createdAt).toLocaleString()}
          </div>
          <div
            style={{
              fontSize: 9,
              color: "var(--muted, #7a7164)",
              marginTop: 2,
              wordBreak: "break-all",
              fontFamily: "monospace",
              opacity: 0.6,
            }}
            title={t("funds.auditHashTooltip") || "Hash d'intégrité SHA-256"}
          >
            #{ev.hash.slice(0, 16)}…
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusChip({
  status,
  t,
}: {
  status: Contribution["status"];
  t: ReturnType<typeof useT>;
}) {
  const map = {
    PENDING: {
      label: t("funds.status.pending") || "En attente",
      color: "var(--saffron, #C58A2E)",
      bg: "rgba(197,138,46,0.14)",
    },
    VALIDATED: {
      label: t("funds.status.validated") || "Validée",
      color: "var(--v45-emerald, #1F7A57)",
      bg: "rgba(31,122,87,0.14)",
    },
    REJECTED: {
      label: t("funds.status.rejected") || "Refusée",
      color: "var(--v45-terracotta, #9F4628)",
      bg: "rgba(159,70,40,0.14)",
    },
  } as const;
  const m = map[status];
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        background: m.bg,
        color: m.color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {m.label}
    </span>
  );
}

function ExpenseStatusChip({
  status,
  t,
}: {
  status: Expense["status"];
  t: ReturnType<typeof useT>;
}) {
  const map = {
    PENDING_VOTE: {
      label: t("funds.expenseStatus.pendingVote") || "Vote en cours",
      color: "var(--saffron, #C58A2E)",
      bg: "rgba(197,138,46,0.14)",
    },
    APPROVED: {
      label: t("funds.expenseStatus.approved") || "Approuvée",
      color: "var(--v45-emerald, #1F7A57)",
      bg: "rgba(31,122,87,0.14)",
    },
    REJECTED: {
      label: t("funds.expenseStatus.rejected") || "Refusée",
      color: "var(--v45-terracotta, #9F4628)",
      bg: "rgba(159,70,40,0.14)",
    },
    EXECUTED: {
      label: t("funds.expenseStatus.executed") || "Exécutée",
      color: "var(--v45-cocoa, #2B1F15)",
      bg: "rgba(43,31,21,0.10)",
    },
  } as const;
  const m = map[status];
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        background: m.bg,
        color: m.color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {m.label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "24px 16px",
        textAlign: "center",
        fontSize: 13,
        color: "var(--muted, #7a7164)",
        background: "rgba(244,228,193,0.04)",
        border: "1px dashed rgba(244,228,193,0.18)",
        borderRadius: 12,
      }}
    >
      {text}
    </div>
  );
}
