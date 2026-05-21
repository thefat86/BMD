"use client";

/**
 * V204.A — Vues desktop dédiées pour les Caisses Projet.
 * =============================================================================
 * Deux composants exportés :
 *
 *   - DesktopFundsListView : grille de cards riche (4 col) + KPI hero +
 *     bouton « Nouvelle caisse » + bannière Registre. Vraie expérience
 *     dashboard, pas un mobile centré.
 *
 *   - DesktopFundDetailView : layout 2 colonnes (60/40) avec hero étendu
 *     + sections Cotisations/Dépenses/Audit en colonne gauche, actions +
 *     trésorier + actions admin en colonne droite. Tables denses au lieu
 *     de cards mobile.
 *
 * Respect règle « mobile ≠ responsive » de Fabrice : ces vues n'ont rien
 * à voir avec le rendu mobile (qui reste sur les MobileFundsView /
 * MobileFundDetailView dédiés). Branchement via ResponsiveShell dans les
 * pages route.
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { FundsLegalNotice } from "./funds-legal-notice";
import { Icon } from "./icons";
import { FundContributionsStatus } from "./fund-contributions-status";

// Réutilise les sheets mobile (logique formulaire identique)
const MobileCreateFundSheet = lazy(() =>
  import("./mobile-create-fund-sheet").then((m) => ({
    default: m.MobileCreateFundSheet,
  })),
);
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

type Fund = Awaited<ReturnType<typeof api.listProjectFunds>>[number];
type Detail = Awaited<ReturnType<typeof api.getProjectFund>>;

// ============================================================================
// 1. DesktopFundsListView — page liste
// ============================================================================

interface ListProps {
  groupId: string;
  members?: Array<{
    user: { id: string; displayName: string; avatar: string | null };
  }>;
  defaultCurrency?: string;
}

export function DesktopFundsListView({
  groupId,
  members = [],
  defaultCurrency = "EUR",
}: ListProps) {
  const router = useRouter();
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [funds, setFunds] = useState<Fund[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    try {
      const gate = await api.projectFundsFeatureGate();
      if (!gate.enabled) {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      const list = await api.listProjectFunds(groupId);
      setFunds(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (enabled === null) {
    return (
      <div style={loadingStyle}>{t("common.loading") || "Chargement…"}</div>
    );
  }
  if (enabled === false) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={emptyHeroBubbleStyle}>
          <Icon
            name="lock"
            size={32}
            color="var(--v45-emerald, #1F7A57)"
            strokeWidth={1.6}
          />
        </div>
        <h2 style={emptyTitleStyle}>
          {t("funds.disabled.title") || "Bientôt disponible"}
        </h2>
        <p style={emptyBodyStyle}>
          {t("funds.disabled.body") ||
            "Le module Caisses Projet sera activé après validation juridique."}
        </p>
      </div>
    );
  }

  // KPI hero : totaux agrégés
  const totalContributed =
    funds?.reduce((sum, f) => sum + f.contributed, 0) ?? 0;
  const totalBalance =
    funds?.reduce((sum, f) => sum + f.balance, 0) ?? 0;
  const activeCount =
    funds?.filter((f) => f.status === "ACTIVE").length ?? 0;
  const closedCount =
    funds?.filter((f) => f.status === "CLOSED").length ?? 0;

  return (
    <div style={{ padding: "24px 32px 80px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Hero KPI */}
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 32,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
                lineHeight: 1.15,
              }}
            >
              {t("funds.title") || "Caisses projet"}
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: "var(--muted, #7a7164)",
              }}
            >
              {t("funds.desktop.subtitle") ||
                "Cagnottes collectives en mode registre — BMD enregistre, le trésorier détient les fonds."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bmd-tap"
            style={primaryDesktopButtonStyle()}
          >
            <Icon name="plus" size={16} strokeWidth={2} />{" "}
            {t("funds.createNew") || "Nouvelle caisse"}
          </button>
        </div>

        {/* 4 KPI cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <KpiCard
            label={t("funds.kpi.totalCollected") || "Total collecté"}
            value={`${totalContributed.toFixed(0)} ${defaultCurrency}`}
            tint="var(--v45-saffron, #C58A2E)"
          />
          <KpiCard
            label={t("funds.kpi.totalBalance") || "Solde global"}
            value={`${totalBalance.toFixed(0)} ${defaultCurrency}`}
            tint="var(--v45-emerald, #1F7A57)"
          />
          <KpiCard
            label={t("funds.kpi.activeCount") || "Caisses actives"}
            value={String(activeCount)}
            tint="var(--cocoa, #2B1F15)"
          />
          <KpiCard
            label={t("funds.kpi.closedCount") || "Caisses clôturées"}
            value={String(closedCount)}
            tint="var(--muted, #7a7164)"
          />
        </div>
      </header>

      {/* Bannière Registre */}
      <div style={{ marginBottom: 20 }}>
        <FundsLegalNotice />
      </div>

      {error && (
        <div role="alert" style={errorBannerStyle}>
          {error}
        </div>
      )}

      {/* Grille de caisses */}
      {funds && funds.length === 0 && (
        <DesktopEmptyState onCreate={() => setShowCreate(true)} t={t} />
      )}

      {funds && funds.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {funds.map((fund) => (
            <DesktopFundCard
              key={fund.id}
              fund={fund}
              onOpen={() =>
                router.push(`/dashboard/groups/${groupId}/funds/${fund.id}`)
              }
              t={t}
            />
          ))}
        </ul>
      )}

      {showCreate && (
        <Suspense fallback={null}>
          <MobileCreateFundSheet
            groupId={groupId}
            members={members}
            defaultCurrency={defaultCurrency}
            onClose={() => setShowCreate(false)}
            onCreated={(fundId) => {
              setShowCreate(false);
              router.push(`/dashboard/groups/${groupId}/funds/${fundId}`);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

// ============================================================================
// 2. DesktopFundDetailView — page détail 2 colonnes
// ============================================================================

interface DetailProps {
  fundId: string;
  groupId: string;
  meId: string;
}

export function DesktopFundDetailView({
  fundId,
  groupId,
  meId,
}: DetailProps) {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();

  const [data, setData] = useState<Detail | null>(null);
  const [auditLog, setAuditLog] = useState<Awaited<
    ReturnType<typeof api.getProjectFundAuditLog>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showContribute, setShowContribute] = useState(false);
  const [showProposeExpense, setShowProposeExpense] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);

  async function refresh() {
    try {
      const [d, log] = await Promise.all([
        api.getProjectFund(fundId),
        api.getProjectFundAuditLog(fundId).catch(() => null),
      ]);
      setData(d);
      if (log) setAuditLog(log);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId]);

  if (!data) {
    return (
      <div style={loadingStyle}>
        {error ? (
          <span style={{ color: "var(--v45-terracotta, #9F4628)" }}>
            {error}
          </span>
        ) : (
          t("common.loading") || "Chargement…"
        )}
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
  const canEdit = (isTreasurer || isCreator) && !isClosed;
  const canVote = data.contributions.some(
    (c) => c.contributorUserId === meId && c.status === "VALIDATED",
  );
  const pendingContribs = data.contributions.filter(
    (c) => c.status === "PENDING",
  );

  async function handleValidate(contributionId: string) {
    try {
      await api.validateProjectFundContribution(fundId, contributionId);
      toast.success(t("funds.contribValidatedToast") || "Cotisation validée");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleVote(expenseId: string, vote: boolean) {
    try {
      await api.voteOnProjectFundExpense(fundId, expenseId, vote);
      toast.success(
        vote
          ? t("funds.voteForToast") || "Vote pour"
          : t("funds.voteAgainstToast") || "Vote contre",
      );
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleExecute(expenseId: string) {
    const ok = await dialog.confirm(
      t("funds.executeConfirmShort") || "Exécuter cette dépense ?",
      {
        variant: "warning",
        title: t("funds.executeTitle") || "Exécuter la dépense",
        confirmLabel: t("funds.executeAction") || "Exécuter",
      },
    );
    if (!ok) return;
    try {
      await api.executeProjectFundExpense(fundId, expenseId);
      toast.success(t("funds.executedToast") || "Dépense exécutée");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleClose() {
    const ok = await dialog.confirm(
      t("funds.closeConfirm") || "Clôturer la caisse ?",
      {
        variant: "danger",
        title: t("funds.closeTitle") || "Clôturer",
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
    <div style={{ padding: "24px 32px 60px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <button
          type="button"
          onClick={() =>
            router.push(`/dashboard/groups/${groupId}/funds`)
          }
          className="bmd-tap"
          // V222.D — Bouton retour rendu saillant (était transparent + gris pâle,
          // quasi invisible). Maintenant : background sable, bordure, padding,
          // weight 500 + icône Tabler pour le repère visuel.
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#F4ECD9",
            border: "0.5px solid #D9C8A6",
            color: "#2B1F15",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            padding: "7px 13px",
            borderRadius: 9,
            fontFamily: "inherit",
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>←</span>
          {t("funds.backToList") || "Toutes les caisses"}
        </button>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--saffron, #C58A2E)",
              letterSpacing: 1.4,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            {t(`funds.template.${fund.template.toLowerCase()}`) || fund.template}
            {isClosed && (
              <span
                style={{
                  marginLeft: 8,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(122,113,100,0.18)",
                  color: "var(--muted)",
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
              margin: "4px 0 4px",
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 32,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
            }}
          >
            {fund.name}
          </h1>
          {fund.description && (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "var(--muted, #7a7164)",
                maxWidth: 720,
              }}
            >
              {fund.description}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="bmd-tap"
              style={secondaryDesktopButtonStyle()}
            >
              <Icon name="pencil" size={14} strokeWidth={1.8} />{" "}
              {t("funds.edit.button") || "Modifier"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className="bmd-tap"
            style={{
              ...secondaryDesktopButtonStyle(),
              borderColor: "rgba(197,138,46,0.40)",
              background: "rgba(197,138,46,0.06)",
              color: "var(--saffron, #C58A2E)",
            }}
          >
            <Icon name="share-2" size={14} strokeWidth={1.8} />{" "}
            {t("funds.share.button") || "Partager"}
          </button>
          <a
            href={api.projectFundPdfReceiptUrl(fundId)}
            target="_blank"
            rel="noopener"
            className="bmd-tap"
            style={{
              ...secondaryDesktopButtonStyle(),
              borderColor: "rgba(31,122,87,0.40)",
              background: "rgba(31,122,87,0.06)",
              color: "var(--v45-emerald, #1F7A57)",
              textDecoration: "none",
            }}
          >
            <Icon name="file-text" size={14} strokeWidth={1.8} /> PDF
          </a>
        </div>
      </div>

      {/* Bannière Registre + trésorier */}
      <div style={{ marginBottom: 22 }}>
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
      </div>

      {/* Layout 2 colonnes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* Colonne gauche : balance + cotisations + dépenses + audit */}
        <main style={{ display: "grid", gap: 18, minWidth: 0 }}>
          {/* Balance card */}
          <section style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 16,
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 40,
                  fontWeight: 700,
                  color: "var(--cocoa)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {balance.contributed.toFixed(0)}
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginLeft: 6,
                    fontFamily: "inherit",
                  }}
                >
                  {fund.currency}
                </span>
              </span>
              {target && (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  / {target.toFixed(0)} {fund.currency}
                  {progress !== null && ` (${progress}%)`}
                </span>
              )}
            </div>
            {progress !== null && (
              <div style={progressBarOuter}>
                <div
                  style={{
                    ...progressBarInner,
                    width: `${progress}%`,
                  }}
                />
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                marginTop: 14,
              }}
            >
              <MiniStat
                label={t("funds.stats.spent") || "Dépensé"}
                value={`${balance.spent.toFixed(0)} ${fund.currency}`}
                tint="var(--v45-terracotta)"
              />
              <MiniStat
                label={t("funds.stats.balance") || "Disponible"}
                value={`${balance.balance.toFixed(0)} ${fund.currency}`}
                tint="var(--v45-emerald)"
              />
              <MiniStat
                label={t("funds.stats.contributors") || "Contributeurs"}
                value={String(balance.contributorsCount)}
                tint="var(--saffron)"
              />
            </div>
          </section>

          {/* V222.C — État cotisation par membre × période (qui à jour vs retard) */}
          <section style={cardStyle}>
            <SectionHeader
              title={t("funds.status.gridTitle") || "Qui est à jour ?"}
            />
            <FundContributionsStatus groupId={groupId} fundId={fundId} />
          </section>

          {/* Cotisations table */}
          <section style={cardStyle}>
            <SectionHeader
              title={t("funds.tabContributions") || "Cotisations"}
              count={data.contributions.length}
              badge={
                pendingContribs.length > 0
                  ? `${pendingContribs.length} en attente`
                  : undefined
              }
            />
            {data.contributions.length === 0 ? (
              <p style={emptySectionStyle}>
                {t("funds.noContributions") || "Aucune cotisation."}
              </p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Contributeur</th>
                    <th style={thStyle}>Montant</th>
                    <th style={thStyle}>Méthode</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Statut</th>
                    {isTreasurer && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.contributions.map((c) => (
                    <tr key={c.id} style={trStyle}>
                      <td style={tdStyle}>{c.contributor.displayName}</td>
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: "var(--bmd-num, inherit)",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                        }}
                      >
                        {parseFloat(c.amount).toFixed(0)} {c.currency}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--muted)" }}>
                        {t(`funds.method.${c.method.toLowerCase()}`) ||
                          c.method}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--muted)" }}>
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td style={tdStyle}>
                        <StatusPill status={c.status} t={t} />
                      </td>
                      {isTreasurer && (
                        <td style={tdStyle}>
                          {c.status === "PENDING" ? (
                            <button
                              type="button"
                              onClick={() => handleValidate(c.id)}
                              className="bmd-tap"
                              style={miniBtnStyle("emerald")}
                            >
                              ✓
                            </button>
                          ) : (
                            <span style={{ color: "var(--muted)" }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Dépenses table */}
          <section style={cardStyle}>
            <SectionHeader
              title={t("funds.tabExpenses") || "Dépenses"}
              count={data.expenses.length}
            />
            {data.expenses.length === 0 ? (
              <p style={emptySectionStyle}>
                {t("funds.noExpenses") || "Aucune dépense."}
              </p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Motif</th>
                    <th style={thStyle}>Bénéficiaire</th>
                    <th style={thStyle}>Montant</th>
                    <th style={thStyle}>Vote</th>
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses.map((e) => (
                    <tr key={e.id} style={trStyle}>
                      <td style={tdStyle}>{e.motive}</td>
                      <td style={{ ...tdStyle, color: "var(--muted)" }}>
                        {e.beneficiary ?? "—"}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: "var(--bmd-num, inherit)",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                        }}
                      >
                        {parseFloat(e.amount).toFixed(0)} {fund.currency}
                      </td>
                      <td style={tdStyle}>
                        {e.voteRequired ? (
                          <span style={{ fontSize: 11 }}>
                            <span
                              style={{ color: "var(--v45-emerald)" }}
                            >
                              ✓ {e.votesFor}
                            </span>
                            {" / "}
                            <span
                              style={{ color: "var(--v45-terracotta)" }}
                            >
                              ✕ {e.votesAgainst}
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <ExpenseStatusPill status={e.status} t={t} />
                      </td>
                      <td style={tdStyle}>
                        {e.status === "PENDING_VOTE" && canVote && (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => handleVote(e.id, true)}
                              className="bmd-tap"
                              style={miniBtnStyle("emerald")}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVote(e.id, false)}
                              className="bmd-tap"
                              style={miniBtnStyle("terracotta")}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        {e.status === "APPROVED" && isTreasurer && (
                          <button
                            type="button"
                            onClick={() => handleExecute(e.id)}
                            className="bmd-tap"
                            style={{
                              ...miniBtnStyle("emerald"),
                              padding: "4px 10px",
                            }}
                          >
                            {t("funds.executeAction") || "Exécuter"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Audit log table */}
          <section style={cardStyle}>
            <SectionHeader
              title={t("funds.tabAudit") || "Journal d'audit"}
              count={auditLog?.length ?? 0}
              hint={t("funds.auditHashTooltip") || "Hash SHA-256 chaîné"}
            />
            {!auditLog || auditLog.length === 0 ? (
              <p style={emptySectionStyle}>
                {t("funds.noAudit") || "Aucun événement."}
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: 6,
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {auditLog.map((ev) => (
                  <li
                    key={ev.id}
                    style={{
                      padding: "8px 10px",
                      borderLeft: "3px solid var(--saffron)",
                      background: "rgba(244,228,193,0.05)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color: "var(--cocoa)",
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          fontSize: 11,
                        }}
                      >
                        {t(`funds.event.${ev.kind}`) || ev.kind}
                      </span>
                      <span
                        style={{ color: "var(--muted)", fontSize: 11 }}
                      >
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <code
                      style={{
                        fontSize: 10,
                        color: "var(--muted)",
                        opacity: 0.7,
                        fontFamily: "monospace",
                        wordBreak: "break-all",
                      }}
                    >
                      #{ev.hash.slice(0, 32)}…
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        {/* Colonne droite : actions + meta */}
        <aside style={{ display: "grid", gap: 16 }}>
          {!isClosed && (
            <section style={cardStyle}>
              <h3 style={asideTitleStyle}>
                {t("funds.desktop.actionsTitle") || "Actions"}
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowContribute(true)}
                  className="bmd-tap"
                  style={primaryDesktopButtonStyle()}
                >
                  ＋ {t("funds.contribute.cta") || "Je cotise"}
                </button>
                {isTreasurer && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowProposeExpense(true)}
                      className="bmd-tap"
                      style={{
                        ...secondaryDesktopButtonStyle(),
                        borderColor: "rgba(31,122,87,0.40)",
                        background: "rgba(31,122,87,0.08)",
                        color: "var(--v45-emerald)",
                        width: "100%",
                        justifyContent: "center",
                      }}
                    >
                      {t("funds.proposeExpense.cta") || "Proposer dépense"}
                    </button>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="bmd-tap"
                      style={{
                        ...secondaryDesktopButtonStyle(),
                        borderColor: "rgba(159,70,40,0.28)",
                        color: "var(--v45-terracotta)",
                        background: "transparent",
                        width: "100%",
                        justifyContent: "center",
                      }}
                    >
                      {t("funds.closeAction") || "Clôturer la caisse"}
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          <section style={cardStyle}>
            <h3 style={asideTitleStyle}>
              {t("funds.desktop.metaTitle") || "Informations"}
            </h3>
            <dl style={{ margin: 0, display: "grid", gap: 8, fontSize: 13 }}>
              <MetaRow
                label={t("funds.desktop.metaCurrency") || "Devise"}
                value={fund.currency}
              />
              {fund.deadline && (
                <MetaRow
                  label={t("funds.desktop.metaDeadline") || "Échéance"}
                  value={new Date(fund.deadline).toLocaleDateString()}
                />
              )}
              <MetaRow
                label={t("funds.desktop.metaStatus") || "Statut"}
                value={fund.status}
              />
              <MetaRow
                label={t("funds.desktop.metaPublicCode") || "Code public"}
                value={fund.publicCode}
                code
              />
              <MetaRow
                label={t("funds.desktop.metaCreated") || "Créée le"}
                value={new Date(fund.createdAt).toLocaleDateString()}
              />
            </dl>
          </section>
        </aside>
      </div>

      {/* Sheets (réutilisés mobile) */}
      {showContribute && (
        <Suspense fallback={null}>
          <MobileContributeSheet
            fundId={fundId}
            fundCurrency={fund.currency}
            onClose={() => setShowContribute(false)}
            onContributed={() => {
              setShowContribute(false);
              toast.success(t("funds.contribDeclaredToast") || "Cotisation déclarée");
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
    </div>
  );
}

// ============================================================================
// Sous-composants partagés
// ============================================================================

function KpiCard({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--line, rgba(244,228,193,0.14))",
        borderRadius: 14,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--muted, #7a7164)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 24,
          fontWeight: 700,
          color: tint,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DesktopEmptyState({
  onCreate,
  t,
}: {
  onCreate: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      style={{
        padding: "48px 32px",
        textAlign: "center",
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--line, rgba(244,228,193,0.14))",
        borderRadius: 18,
      }}
    >
      <div style={emptyHeroBubbleStyle}>
        <Icon name="gift" size={36} strokeWidth={1.6} />
      </div>
      <h2 style={emptyTitleStyle}>
        {t("funds.emptyTitle") || "Aucune caisse encore"}
      </h2>
      <p style={emptyBodyStyle}>
        {t("funds.emptyBody") ||
          "Une caisse projet permet de collecter des contributions pour un événement ou un acte de solidarité."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="bmd-tap"
        style={primaryDesktopButtonStyle()}
      >
        ＋ {t("funds.createFirst") || "Créer la première caisse"}
      </button>
    </div>
  );
}

function DesktopFundCard({
  fund,
  onOpen,
  t,
}: {
  fund: Fund;
  onOpen: () => void;
  t: ReturnType<typeof useT>;
}) {
  const target = fund.targetAmount ? parseFloat(fund.targetAmount) : null;
  const progress =
    target && target > 0
      ? Math.min(100, Math.round((fund.contributed / target) * 100))
      : null;
  const isClosed = fund.status === "CLOSED" || fund.status === "ARCHIVED";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="bmd-tap"
        style={{
          width: "100%",
          textAlign: "left",
          background: "var(--paper, #FFFFFF)",
          border: "1px solid var(--line, rgba(244,228,193,0.14))",
          borderRadius: 16,
          padding: 16,
          cursor: "pointer",
          fontFamily: "inherit",
          color: "inherit",
          display: "grid",
          gap: 10,
          opacity: isClosed ? 0.7 : 1,
          transition: "transform .12s ease, box-shadow .12s ease",
        }}
        onMouseEnter={(ev) => {
          (ev.currentTarget.style.transform = "translateY(-2px)");
          (ev.currentTarget.style.boxShadow =
            "0 12px 28px -16px rgba(43,31,21,0.30)");
        }}
        onMouseLeave={(ev) => {
          ev.currentTarget.style.transform = "translateY(0)";
          ev.currentTarget.style.boxShadow = "none";
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--saffron, #C58A2E)",
          }}
        >
          {t(`funds.template.${fund.template.toLowerCase()}`) || fund.template}
          {isClosed && " · Clôturée"}
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.25,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {fund.name}
        </div>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 700,
                color: "var(--cocoa)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fund.contributed.toFixed(0)}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--muted)",
                  marginLeft: 4,
                  fontFamily: "inherit",
                }}
              >
                {fund.currency}
              </span>
            </span>
            {target && (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                / {target.toFixed(0)}
              </span>
            )}
          </div>
          {progress !== null && (
            <div style={progressBarOuter}>
              <div
                style={{ ...progressBarInner, width: `${progress}%` }}
              />
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: 0.3,
          }}
        >
          {fund.contributorsCount}{" "}
          {t("funds.contributors") || "contributeurs"}
        </div>
      </button>
    </li>
  );
}

function SectionHeader({
  title,
  count,
  badge,
  hint,
}: {
  title: string;
  count: number;
  badge?: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 12,
        gap: 12,
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            letterSpacing: 0.3,
          }}
        >
          {title}{" "}
          <span style={{ fontWeight: 500, color: "var(--muted)" }}>
            ({count})
          </span>
        </h3>
        {hint && (
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 10,
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            {hint}
          </p>
        )}
      </div>
      {badge && (
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            background: "var(--v45-terracotta, #9F4628)",
            color: "#FBF6EC",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: "PENDING" | "VALIDATED" | "REJECTED";
  t: ReturnType<typeof useT>;
}) {
  const map = {
    PENDING: { label: t("funds.status.pending") || "En attente", c: "var(--saffron)" },
    VALIDATED: { label: t("funds.status.validated") || "Validée", c: "var(--v45-emerald)" },
    REJECTED: { label: t("funds.status.rejected") || "Refusée", c: "var(--v45-terracotta)" },
  } as const;
  return <PillSpan label={map[status].label} color={map[status].c} />;
}

function ExpenseStatusPill({
  status,
  t,
}: {
  status: "PENDING_VOTE" | "APPROVED" | "REJECTED" | "EXECUTED";
  t: ReturnType<typeof useT>;
}) {
  const map = {
    PENDING_VOTE: { label: t("funds.expenseStatus.pendingVote") || "Vote", c: "var(--saffron)" },
    APPROVED: { label: t("funds.expenseStatus.approved") || "Approuvée", c: "var(--v45-emerald)" },
    REJECTED: { label: t("funds.expenseStatus.rejected") || "Refusée", c: "var(--v45-terracotta)" },
    EXECUTED: { label: t("funds.expenseStatus.executed") || "Exécutée", c: "var(--cocoa)" },
  } as const;
  return <PillSpan label={map[status].label} color={map[status].c} />;
}

function PillSpan({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color: color,
      }}
    >
      {label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(244,228,193,0.06)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--muted)",
          letterSpacing: 0.6,
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontWeight: 700,
          color: tint,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--bmd-num, inherit)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  code,
}: {
  label: string;
  value: string;
  code?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <dt style={{ color: "var(--muted)", fontSize: 12 }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: "var(--cocoa)",
          fontFamily: code ? "monospace" : "inherit",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

// ============================================================================
// Styles partagés
// ============================================================================

const loadingStyle: React.CSSProperties = {
  padding: 40,
  textAlign: "center",
  color: "var(--muted)",
  fontSize: 14,
};

const cardStyle: React.CSSProperties = {
  background: "var(--paper, #FFFFFF)",
  border: "1px solid var(--line, rgba(244,228,193,0.14))",
  borderRadius: 16,
  padding: 18,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--muted)",
  borderBottom: "1px solid var(--line, rgba(244,228,193,0.14))",
};

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(244,228,193,0.08)",
};

const tdStyle: React.CSSProperties = {
  padding: "9px 10px",
  color: "var(--cocoa)",
};

const progressBarOuter: React.CSSProperties = {
  height: 8,
  background: "rgba(197,138,46,0.12)",
  borderRadius: 999,
  overflow: "hidden",
};

const progressBarInner: React.CSSProperties = {
  height: "100%",
  background:
    "linear-gradient(90deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
  transition: "width .3s ease",
};

const emptyHeroBubbleStyle: React.CSSProperties = {
  width: 80,
  height: 80,
  margin: "0 auto 16px",
  borderRadius: 22,
  background:
    "linear-gradient(135deg, rgba(197,138,46,0.20), rgba(31,122,87,0.08))",
  border: "1px solid rgba(197,138,46,0.30)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--saffron, #C58A2E)",
};

const emptyTitleStyle: React.CSSProperties = {
  fontFamily: "Cormorant Garamond, serif",
  fontSize: 26,
  fontWeight: 700,
  margin: "0 0 8px",
  color: "var(--cocoa)",
};

const emptyBodyStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--muted)",
  margin: "0 0 22px",
  lineHeight: 1.55,
  maxWidth: 480,
  marginLeft: "auto",
  marginRight: "auto",
};

const errorBannerStyle: React.CSSProperties = {
  background: "rgba(159,70,40,0.10)",
  border: "1px solid rgba(159,70,40,0.30)",
  color: "var(--v45-terracotta, #9F4628)",
  padding: "10px 14px",
  borderRadius: 10,
  fontSize: 13,
  marginBottom: 16,
};

const asideTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--muted)",
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

const emptySectionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--muted)",
  fontStyle: "italic",
  padding: "12px 0",
};

function primaryDesktopButtonStyle(): React.CSSProperties {
  return {
    padding: "10px 18px",
    borderRadius: 999,
    border: "none",
    background:
      "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
    color: "#FBF6EC",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.3,
    cursor: "pointer",
    minHeight: 40,
    boxShadow: "0 6px 18px -6px rgba(197,138,46,0.50)",
    touchAction: "manipulation",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };
}

function secondaryDesktopButtonStyle(): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid rgba(43,31,21,0.14)",
    background: "var(--paper, #FFFFFF)",
    color: "var(--cocoa)",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    minHeight: 36,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    touchAction: "manipulation",
  };
}

function miniBtnStyle(variant: "emerald" | "terracotta"): React.CSSProperties {
  const c =
    variant === "emerald"
      ? { border: "rgba(31,122,87,0.40)", bg: "rgba(31,122,87,0.08)", fg: "var(--v45-emerald, #1F7A57)" }
      : { border: "rgba(159,70,40,0.30)", bg: "transparent", fg: "var(--v45-terracotta, #9F4628)" };
  return {
    padding: "4px 8px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.bg,
    color: c.fg,
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    minHeight: 26,
  };
}
