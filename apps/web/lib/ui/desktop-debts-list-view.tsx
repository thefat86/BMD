"use client";

/**
 * V153.B — DesktopDebtsListView.
 *
 * Vue web riche pour la liste des RDD. Pensée comme un vrai dashboard
 * portail (genre Wise Business, Pennylane) — plus d'infos que la vue
 * mobile, dense mais lisible.
 *
 * Structure :
 *  - Hero stats : 6 KPI cards (Total, À signer, Actives, En retard,
 *    Complétées, Solde net dû/à recevoir)
 *  - Toolbar : recherche + filtres (statut, rôle, période) + CTA "+ Nouvelle"
 *  - Table : DebtWheel mini · code · parties · montant · échéance · niveau
 *    signature · statut · actions rapides
 *  - Zero-state intelligent quand pas de RDD ou filtres vides
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DebtWheel, schedulesToSegments } from "./debt-wheel";
import { useT } from "../i18n/app-strings";
// V169 — Compteur RDD mensuel (push upgrade)
import { DebtCounter } from "./debt-counter";
// V179.C — SegmentedControl pour filtrer les RDD par bucket de statut
import { SegmentedControl } from "./segmented-control";

// V179.C — Buckets pour les 3 onglets de filtre (Actives / Soldées / Annulées)
type DebtBucketTab = "active" | "settled" | "cancelled";
const DEBT_FILTER_LS_KEY = "bmd_debts_filter";

function bucketForDebtStatus(status: string): DebtBucketTab {
  if (status === "CANCELLED" || status === "DEFAULTED") return "cancelled";
  if (status === "COMPLETED") return "settled";
  return "active";
}

interface DebtScheduleSummary {
  id: string;
  sequenceNumber: number;
  dueDate: string;
  expectedAmount: string;
  status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
}

interface DebtPartySummary {
  id: string;
  userId: string | null;
  displayName: string;
  role: string;
  signatureStatus: string;
}

export interface DesktopDebtSummary {
  id: string;
  publicCode: string;
  status: string;
  amount: string;
  currency: string;
  interestRate: string;
  purpose: string | null;
  endDate: string;
  frequency: string;
  totalInstallments: number;
  signatureLevel: string;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  parties: DebtPartySummary[];
  schedules: DebtScheduleSummary[];
  createdAt: string;
}

interface Props {
  debts: DesktopDebtSummary[] | null;
  error: string | null;
}

type RoleFilter = "ALL" | "CREDITOR" | "DEBTOR" | "WITNESS_OR_GUARANTOR";
type StatusFilter =
  | "ALL"
  | "DRAFT"
  | "PROPOSED"
  | "SIGNED"
  | "ACTIVE"
  | "LATE"
  | "COMPLETED"
  | "DISPUTED";

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  DRAFT: { bg: "#F4ECD8", fg: "#6B5A47", label: "Brouillon" },
  PROPOSED: { bg: "#FEF3C7", fg: "#92400E", label: "À signer" },
  SIGNED: { bg: "#DBEAFE", fg: "#1E40AF", label: "Signée" },
  ACTIVE: { bg: "#D1FAE5", fg: "#065F46", label: "En cours" },
  LATE: { bg: "#FED7AA", fg: "#9A3412", label: "En retard" },
  COMPLETED: { bg: "#DCFCE7", fg: "#15803D", label: "Soldée" },
  DISPUTED: { bg: "#FEE2E2", fg: "#991B1B", label: "Litige" },
  CANCELLED: { bg: "#E5E7EB", fg: "#374151", label: "Annulée" },
  EXPIRED: { bg: "#E5E7EB", fg: "#374151", label: "Expirée" },
  MISSED: { bg: "#FEE2E2", fg: "#991B1B", label: "Défaut" },
};

const SIG_LEVEL_BADGE: Record<string, { color: string; label: string }> = {
  SIMPLE: { color: "#6B5A47", label: "SES" },
  ADVANCED: { color: "#854F0B", label: "AES" },
  NOTARIZED: { color: "#0F6E56", label: "QES" },
};

export function DesktopDebtsListView({ debts, error }: Props): JSX.Element {
  const t = useT();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  // V179.C — Filtre 3 onglets actives / soldées / annulées, persisté
  const [bucketTab, setBucketTab] = useState<DebtBucketTab>("active");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DEBT_FILTER_LS_KEY);
      if (saved === "active" || saved === "settled" || saved === "cancelled") {
        setBucketTab(saved);
      }
    } catch {
      /* localStorage indisponible */
    }
  }, []);
  function handleBucketChange(v: DebtBucketTab) {
    setBucketTab(v);
    try {
      window.localStorage.setItem(DEBT_FILTER_LS_KEY, v);
    } catch {
      /* localStorage indisponible */
    }
  }

  const kpis = useMemo(() => computeKpis(debts ?? []), [debts]);
  // V179.C — Compteurs par bucket (sur l'ensemble des dettes, avant search/role)
  const bucketCounts = useMemo(() => {
    const c = { active: 0, settled: 0, cancelled: 0 };
    for (const d of debts ?? []) c[bucketForDebtStatus(d.status)]++;
    return c;
  }, [debts]);
  const filtered = useMemo(() => {
    // 1. Filtre bucket (actives / soldées / annulées)
    const byBucket = (debts ?? []).filter(
      (d) => bucketForDebtStatus(d.status) === bucketTab,
    );
    // 2. Filtres existants (search, status précis, role)
    return applyFilters(byBucket, query, statusFilter, roleFilter);
  }, [debts, query, statusFilter, roleFilter, bucketTab]);

  if (error) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "#9F4628",
          background: "rgba(159,70,40,0.06)",
          borderRadius: 12,
        }}
      >
        {t("debts.list.error") || "Impossible de charger les reconnaissances."}{" "}
        <small style={{ display: "block", marginTop: 4, opacity: 0.7 }}>
          {error}
        </small>
      </div>
    );
  }

  if (debts === null) {
    return <ListSkeleton />;
  }

  if (debts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <KpiRow kpis={kpis} t={t} />

      {/* V169 — Compteur RDD mensuel (push upgrade) */}
      <DebtCounter variant="card" />

      {/* V179.C — SegmentedControl 3 onglets actives/soldées/annulées */}
      <div style={{ maxWidth: 520 }}>
        <SegmentedControl<DebtBucketTab>
          value={bucketTab}
          onChange={handleBucketChange}
          size="sm"
          ariaLabel={t("debts.list.filterAria") || "Filtrer les RDD"}
          segments={[
            {
              value: "active",
              label: `${t("debts.list.tabActive") || "Actives"} (${bucketCounts.active})`,
            },
            {
              value: "settled",
              label: `${t("debts.list.tabSettled") || "Soldées"} (${bucketCounts.settled})`,
            },
            {
              value: "cancelled",
              label: `${t("debts.list.tabCancelled") || "Annulées"} (${bucketCounts.cancelled})`,
            },
          ]}
        />
      </div>

      {/* Toolbar */}
      <Toolbar
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        t={t}
      />

      {/* Table */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "#6B5A47",
            background: "#FBF6EC",
            border: "1px dashed rgba(43,31,21,0.18)",
            borderRadius: 12,
          }}
        >
          {t("debts.list.noResults") ||
            "Aucune reconnaissance ne correspond à tes filtres."}
        </div>
      ) : (
        <DebtsTable debts={filtered} t={t} />
      )}

      {/* Footer hint */}
      <div
        style={{
          fontSize: 11,
          color: "#6B5A47",
          textAlign: "center",
          opacity: 0.7,
        }}
      >
        {t("debts.list.showing")?.replace("{n}", String(filtered.length))?.replace(
          "{total}",
          String(debts.length),
        ) || `${filtered.length} sur ${debts.length} reconnaissance(s)`}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// KPI Row
// ───────────────────────────────────────────────────────────────────────────

interface Kpis {
  total: number;
  toSign: number;
  active: number;
  late: number;
  completed: number;
  iLend: number;
  iOwe: number;
  currency: string;
}

function computeKpis(debts: DesktopDebtSummary[]): Kpis {
  const k: Kpis = {
    total: debts.length,
    toSign: 0,
    active: 0,
    late: 0,
    completed: 0,
    iLend: 0,
    iOwe: 0,
    currency: "EUR",
  };
  for (const d of debts) {
    if (d.status === "PROPOSED") k.toSign++;
    if (d.status === "ACTIVE" || d.status === "SIGNED") k.active++;
    if (d.status === "LATE" || hasLateSchedules(d)) k.late++;
    if (d.status === "COMPLETED") k.completed++;
    if (d.status === "ACTIVE" || d.status === "SIGNED") {
      const remaining = computeRemaining(d);
      if (d.myRole === "CREDITOR") k.iLend += remaining;
      if (d.myRole === "DEBTOR") k.iOwe += remaining;
      k.currency = d.currency || k.currency;
    }
  }
  return k;
}

function hasLateSchedules(d: DesktopDebtSummary): boolean {
  return d.schedules.some(
    (s) => s.status === "LATE" || s.status === "MISSED",
  );
}

function computeRemaining(d: DesktopDebtSummary): number {
  return d.schedules
    .filter((s) => s.status !== "PAID" && s.status !== "CONFIRMED")
    .reduce((sum, s) => sum + parseFloat(s.expectedAmount || "0"), 0);
}

function KpiRow({ kpis, t }: { kpis: Kpis; t: (k: string) => string }) {
  const netBalance = kpis.iLend - kpis.iOwe;
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: kpis.currency || "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  const items = [
    {
      key: "total",
      label: t("debts.list.kpiTotal") || "Total",
      value: String(kpis.total),
      accent: "#2B1F15",
      sub: t("debts.list.kpiTotalSub") || "dossiers",
    },
    {
      key: "toSign",
      label: t("debts.list.kpiToSign") || "À signer",
      value: String(kpis.toSign),
      accent: "#854F0B",
      sub: t("debts.list.kpiToSignSub") || "en attente",
      highlight: kpis.toSign > 0,
    },
    {
      key: "active",
      label: t("debts.list.kpiActive") || "Actives",
      value: String(kpis.active),
      accent: "#1F7A57",
      sub: t("debts.list.kpiActiveSub") || "en cours",
    },
    {
      key: "late",
      label: t("debts.list.kpiLate") || "En retard",
      value: String(kpis.late),
      accent: "#9F4628",
      sub: t("debts.list.kpiLateSub") || "à relancer",
      highlight: kpis.late > 0,
    },
    {
      key: "completed",
      label: t("debts.list.kpiCompleted") || "Soldées",
      value: String(kpis.completed),
      accent: "#0F6E56",
      sub: t("debts.list.kpiCompletedSub") || "remboursées",
    },
    {
      key: "balance",
      label:
        netBalance >= 0
          ? t("debts.list.kpiNetLend") || "Solde net dû"
          : t("debts.list.kpiNetOwe") || "Solde net à verser",
      value: fmt(Math.abs(netBalance)),
      accent: netBalance >= 0 ? "#1F7A57" : "#9F4628",
      sub:
        netBalance >= 0
          ? t("debts.list.kpiNetLendSub") || "à recevoir"
          : t("debts.list.kpiNetOweSub") || "à rembourser",
      isMoney: true,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <div
          key={it.key}
          style={{
            background: "#FFFFFF",
            border: it.highlight
              ? `1.5px solid ${it.accent}`
              : "1px solid rgba(43,31,21,0.10)",
            borderRadius: 14,
            padding: "14px 16px",
            boxShadow: it.highlight
              ? `0 4px 12px ${it.accent}22`
              : "0 1px 3px rgba(43,31,21,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minHeight: 92,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              color: "#6B5A47",
              fontWeight: 700,
            }}
          >
            {it.label}
          </div>
          <div
            className={it.isMoney ? "bmd-num" : undefined}
            style={{
              fontSize: it.isMoney ? 20 : 26,
              fontWeight: 700,
              color: it.accent,
              lineHeight: 1.1,
            }}
          >
            {it.value}
          </div>
          <div style={{ fontSize: 11, color: "#6B5A47", opacity: 0.85 }}>
            {it.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Toolbar
// ───────────────────────────────────────────────────────────────────────────

function Toolbar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  roleFilter,
  setRoleFilter,
  t,
}: {
  query: string;
  setQuery: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  roleFilter: RoleFilter;
  setRoleFilter: (v: RoleFilter) => void;
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            t("debts.list.searchPlaceholder") ||
            "Rechercher par nom, code, objet…"
          }
          style={{
            width: "100%",
            padding: "10px 14px 10px 38px",
            fontSize: 13,
            color: "#2B1F15",
            background: "#FFFFFF",
            border: "1px solid rgba(43,31,21,0.14)",
            borderRadius: 10,
            outline: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 13,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 14,
            opacity: 0.5,
          }}
        >
          🔍
        </span>
      </div>

      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        style={selectStyle}
      >
        <option value="ALL">
          {t("debts.list.filterAllStatus") || "Tous les statuts"}
        </option>
        <option value="PROPOSED">{STATUS_BADGE.PROPOSED.label}</option>
        <option value="SIGNED">{STATUS_BADGE.SIGNED.label}</option>
        <option value="ACTIVE">{STATUS_BADGE.ACTIVE.label}</option>
        <option value="LATE">{STATUS_BADGE.LATE.label}</option>
        <option value="COMPLETED">{STATUS_BADGE.COMPLETED.label}</option>
        <option value="DISPUTED">{STATUS_BADGE.DISPUTED.label}</option>
        <option value="DRAFT">{STATUS_BADGE.DRAFT.label}</option>
      </select>

      <select
        value={roleFilter}
        onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        style={selectStyle}
      >
        <option value="ALL">
          {t("debts.list.filterAllRoles") || "Tous les rôles"}
        </option>
        <option value="CREDITOR">
          {t("debts.list.filterCreditor") || "Je prête"}
        </option>
        <option value="DEBTOR">{t("debts.list.filterDebtor") || "Je dois"}</option>
        <option value="WITNESS_OR_GUARANTOR">
          {t("debts.list.filterWitnessGuarantor") || "Témoin / Garant"}
        </option>
      </select>

      <Link
        href="/dashboard/debts/new"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 10,
          background: "linear-gradient(135deg, #C58A2E, #854F0B)",
          color: "#FBF6EC",
          textDecoration: "none",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(133,79,11,0.25)",
        }}
      >
        + {t("debts.list.createCta") || "Nouvelle RDD"}
      </Link>
    </div>
  );
}

const selectStyle = {
  padding: "10px 14px",
  fontSize: 13,
  color: "#2B1F15",
  background: "#FFFFFF",
  border: "1px solid rgba(43,31,21,0.14)",
  borderRadius: 10,
  cursor: "pointer",
  outline: "none",
  minWidth: 160,
} as const;

// ───────────────────────────────────────────────────────────────────────────
// Table
// ───────────────────────────────────────────────────────────────────────────

function DebtsTable({
  debts,
  t,
}: {
  debts: DesktopDebtSummary[];
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
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
          <tr style={{ background: "#F4ECD8" }}>
            <Th>{t("debts.list.colWheel") || ""}</Th>
            <Th>{t("debts.list.colCode") || "Code"}</Th>
            <Th>{t("debts.list.colParties") || "Parties"}</Th>
            <Th align="right">{t("debts.list.colAmount") || "Montant"}</Th>
            <Th>{t("debts.list.colNext") || "Prochaine échéance"}</Th>
            <Th>{t("debts.list.colSignature") || "Signature"}</Th>
            <Th>{t("debts.list.colStatus") || "Statut"}</Th>
            <Th align="right">{t("debts.list.colAction") || ""}</Th>
          </tr>
        </thead>
        <tbody>
          {debts.map((d) => (
            <DebtRow key={d.id} debt={d} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 14px",
        fontSize: 10,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        color: "#6B5A47",
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

function DebtRow({
  debt,
  t,
}: {
  debt: DesktopDebtSummary;
  t: (k: string) => string;
}) {
  const segments = schedulesToSegments(
    debt.schedules.map((s) => ({
      sequenceNumber: s.sequenceNumber,
      status: s.status,
      dueDate: s.dueDate,
    })),
  );
  const badge = STATUS_BADGE[debt.status] || STATUS_BADGE.DRAFT;
  const sigBadge = SIG_LEVEL_BADGE[debt.signatureLevel] || SIG_LEVEL_BADGE.SIMPLE;
  const creditor = debt.parties.find((p) => p.role === "CREDITOR");
  const debtor = debt.parties.find((p) => p.role === "DEBTOR");
  const nextSchedule = debt.schedules.find(
    (s) => s.status === "PENDING" || s.status === "LATE",
  );
  const fmtMoney = (amount: string, currency: string) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(parseFloat(amount));
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });

  return (
    <tr
      style={{
        borderTop: "1px solid rgba(43,31,21,0.06)",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "#FBF6EC")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "transparent")
      }
    >
      <td style={tdStyle}>
        <DebtWheel segments={segments} size={36} />
      </td>
      <td style={tdStyle}>
        <Link
          href={`/dashboard/debts/${debt.id}`}
          style={{
            fontWeight: 600,
            color: "#2B1F15",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          {debt.publicCode}
        </Link>
        {debt.purpose && (
          <div
            style={{
              fontSize: 11,
              color: "#6B5A47",
              opacity: 0.8,
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {debt.purpose}
          </div>
        )}
      </td>
      <td style={tdStyle}>
        <div style={{ fontSize: 12, lineHeight: 1.4 }}>
          <span style={{ color: "#0F6E56", fontWeight: 600 }}>
            {creditor?.displayName ?? "—"}
          </span>
          <span style={{ color: "#6B5A47", margin: "0 6px" }}>→</span>
          <span style={{ color: "#9F4628", fontWeight: 600 }}>
            {debtor?.displayName ?? "—"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#6B5A47", opacity: 0.8 }}>
          {debt.myRole === "CREDITOR"
            ? t("debts.list.youLend") || "Tu prêtes"
            : debt.myRole === "DEBTOR"
              ? t("debts.list.youOwe") || "Tu dois"
              : debt.myRole === "WITNESS"
                ? t("debts.list.youWitness") || "Témoin"
                : debt.myRole === "GUARANTOR"
                  ? t("debts.list.youGuarantor") || "Garant"
                  : ""}
        </div>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <span className="bmd-num" style={{ fontWeight: 700, fontSize: 14 }}>
          {fmtMoney(debt.amount, debt.currency)}
        </span>
        <div style={{ fontSize: 11, color: "#6B5A47", opacity: 0.8 }}>
          {debt.totalInstallments} ×{" "}
          {fmtMoney(
            (parseFloat(debt.amount) / debt.totalInstallments).toFixed(2),
            debt.currency,
          )}
        </div>
      </td>
      <td style={tdStyle}>
        {nextSchedule ? (
          <>
            <div className="bmd-num" style={{ fontWeight: 600, fontSize: 12 }}>
              {fmtDate(nextSchedule.dueDate)}
            </div>
            <div style={{ fontSize: 11, color: "#6B5A47" }}>
              {fmtMoney(nextSchedule.expectedAmount, debt.currency)}
            </div>
          </>
        ) : (
          <span style={{ color: "#6B5A47", fontSize: 11 }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: sigBadge.color,
            background: `${sigBadge.color}15`,
            border: `1px solid ${sigBadge.color}30`,
            borderRadius: 6,
          }}
        >
          {sigBadge.label}
        </span>
      </td>
      <td style={tdStyle}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 9px",
            fontSize: 11,
            fontWeight: 600,
            color: badge.fg,
            background: badge.bg,
            borderRadius: 999,
          }}
        >
          {badge.label}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <Link
          href={`/dashboard/debts/${debt.id}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#854F0B",
            textDecoration: "none",
          }}
        >
          {t("debts.list.open") || "Ouvrir →"}
        </Link>
      </td>
    </tr>
  );
}

const tdStyle = {
  padding: "12px 14px",
  verticalAlign: "middle",
  color: "#2B1F15",
} as const;

// ───────────────────────────────────────────────────────────────────────────
// Filters & search
// ───────────────────────────────────────────────────────────────────────────

function applyFilters(
  debts: DesktopDebtSummary[],
  query: string,
  status: StatusFilter,
  role: RoleFilter,
): DesktopDebtSummary[] {
  const q = query.trim().toLowerCase();
  return debts.filter((d) => {
    if (status !== "ALL" && d.status !== status) return false;
    if (role !== "ALL") {
      if (role === "WITNESS_OR_GUARANTOR") {
        if (d.myRole !== "WITNESS" && d.myRole !== "GUARANTOR") return false;
      } else if (d.myRole !== role) {
        return false;
      }
    }
    if (q) {
      const haystack = [
        d.publicCode,
        d.purpose ?? "",
        ...d.parties.map((p) => p.displayName),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Skeleton & empty state
// ───────────────────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: 92,
              background: "rgba(43,31,21,0.04)",
              borderRadius: 14,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ))}
      </div>
      <div
        style={{
          height: 320,
          background: "rgba(43,31,21,0.04)",
          borderRadius: 14,
        }}
      />
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div
      style={{
        textAlign: "center",
        padding: "80px 32px",
        background: "#FFFFFF",
        border: "1px dashed rgba(43,31,21,0.18)",
        borderRadius: 14,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>📜</div>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "#2B1F15",
          margin: "0 0 6px",
        }}
      >
        {t("debts.list.emptyTitle") ||
          "Tu n'as encore aucune reconnaissance de dette"}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "#6B5A47",
          maxWidth: 480,
          margin: "0 auto 18px",
          lineHeight: 1.5,
        }}
      >
        {t("debts.list.emptyHint") ||
          "Formalise un prêt entre amis ou en famille en quelques clics. Signé, traçable, opposable juridiquement."}
      </p>
      <Link
        href="/dashboard/debts/new"
        style={{
          display: "inline-block",
          padding: "12px 24px",
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 10,
          background: "linear-gradient(135deg, #C58A2E, #854F0B)",
          color: "#FBF6EC",
          textDecoration: "none",
          boxShadow: "0 4px 12px rgba(133,79,11,0.25)",
        }}
      >
        + {t("debts.list.emptyCta") || "Créer ma première reconnaissance"}
      </Link>
    </div>
  );
}
