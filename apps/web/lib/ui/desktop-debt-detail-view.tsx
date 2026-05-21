"use client";

/**
 * V153.C — DesktopDebtDetailView.
 *
 * Vue web premium pour le détail d'une reconnaissance de dette.
 * Layout 2 colonnes (style portail bancaire / SaaS B2B).
 *
 *  ┌─────────────────────────────────────────────────────┐
 *  │  Header : montant + parties + statut + actions    │
 *  ├─────────────────────────────────┬───────────────────┤
 *  │  Col Gauche (2/3)                │  Col Droite (1/3) │
 *  │   • Timeline activité audit      │  • Méta contrat   │
 *  │   • Graph amortissement Recharts │  • Parties        │
 *  │   • Échéancier détaillé          │  • Section juridiq│
 *  │                                  │  • Actions sec.   │
 *  └─────────────────────────────────┴───────────────────┘
 *
 * Le parent (page.tsx) fournit les handlers d'actions via la prop
 * `primaryActions` (ReactNode). Cette view se concentre sur l'affichage.
 */

import { lazy, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { DebtWheel, schedulesToSegments } from "./debt-wheel";
import { useT } from "../i18n/app-strings";

// Lazy load Recharts pour ne pas alourdir le bundle initial
const AmortizationChart = lazy(() => import("./debt-amortization-chart"));

export interface DesktopDebtDetail {
  id: string;
  publicCode: string;
  status: string;
  amount: string;
  currency: string;
  interestRate: string;
  purpose: string | null;
  startDate: string | null;
  endDate: string;
  frequency: string;
  totalInstallments: number;
  signatureLevel: string;
  jurisdictionCode?: string;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  parties: Array<{
    id: string;
    displayName: string;
    role: string;
    signatureStatus: string;
    userId?: string | null;
  }>;
  schedules: Array<{
    id: string;
    sequenceNumber: number;
    dueDate: string;
    expectedAmount: string;
    capitalAmount: string;
    interestAmount: string;
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
    paidAmount: string | null;
    paidAt: string | null;
  }>;
  createdAt?: string;
}

interface Props {
  debt: DesktopDebtDetail;
  /** Barre d'actions primaires (rendue dans le header) — fournie par parent */
  primaryActions?: ReactNode;
  /** Section d'actions secondaires (rendue dans la col droite) */
  secondaryActions?: ReactNode;
  /** Bandeau d'info contextuel (litige, négociation en cours…) */
  banner?: ReactNode;
}

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

const SIG_LEVEL_INFO: Record<
  string,
  {
    code: string;
    label: string;
    color: string;
    description: string;
    juridicalArt: string;
  }
> = {
  SIMPLE: {
    code: "SES",
    label: "Simple (SES)",
    color: "#6B5A47",
    description:
      "Signature électronique simple (clic + email + OTP). Recevable comme preuve devant juge. Idéale pour prêts <1500€.",
    juridicalArt: "Art. 1366 Code civil (FR) · eIDAS art. 25",
  },
  ADVANCED: {
    code: "AES",
    label: "Avancée (AES)",
    color: "#854F0B",
    description:
      "Signature électronique avancée avec OTP SMS + audit trail horodaté. Présomption forte d'équivalence à la signature manuscrite.",
    juridicalArt: "Art. 1367 Code civil (FR) · eIDAS art. 26",
  },
  NOTARIZED: {
    code: "QES",
    label: "Qualifiée (QES)",
    color: "#0F6E56",
    description:
      "Signature électronique qualifiée avec vérification d'identité notariée (visio opérateur). Force exécutoire UE — saisie directe possible sans tribunal.",
    juridicalArt: "Règlement eIDAS art. 25 (UE) · Force probante = manuscrite",
  },
};

const ROLE_LABEL: Record<string, string> = {
  CREDITOR: "Créancier",
  DEBTOR: "Débiteur",
  WITNESS: "Témoin",
  GUARANTOR: "Garant",
};

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Hebdomadaire",
  MONTHLY: "Mensuelle",
  QUARTERLY: "Trimestrielle",
  YEARLY: "Annuelle",
  CUSTOM: "Personnalisée",
};

export function DesktopDebtDetailView({
  debt,
  primaryActions,
  secondaryActions,
  banner,
}: Props): JSX.Element {
  const t = useT();
  const segments = schedulesToSegments(
    debt.schedules.map((s) => ({
      sequenceNumber: s.sequenceNumber,
      status: s.status,
      dueDate: s.dueDate,
    })),
  );
  const badge = STATUS_BADGE[debt.status] || STATUS_BADGE.DRAFT;
  const sigInfo =
    SIG_LEVEL_INFO[debt.signatureLevel] || SIG_LEVEL_INFO.SIMPLE;
  const creditor = debt.parties.find((p) => p.role === "CREDITOR");
  const debtor = debt.parties.find((p) => p.role === "DEBTOR");
  const witnesses = debt.parties.filter((p) => p.role === "WITNESS");
  const guarantors = debt.parties.filter((p) => p.role === "GUARANTOR");

  const totalPaid = debt.schedules
    .filter((s) => s.status === "PAID" || s.status === "CONFIRMED")
    .reduce((sum, s) => sum + parseFloat(s.paidAmount ?? s.expectedAmount), 0);
  const totalDue = parseFloat(debt.amount);
  const remaining = totalDue - totalPaid;
  const progressPct = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ─── Back link ─── */}
      <Link
        href="/dashboard/debts"
        style={{
          fontSize: 12,
          color: "#854F0B",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        ← {t("debts.detail.backToList") || "Toutes mes reconnaissances"}
      </Link>

      {/* ─── Header card ─── */}
      <HeaderCard
        debt={debt}
        badge={badge}
        creditor={creditor?.displayName}
        debtor={debtor?.displayName}
        primaryActions={primaryActions}
        t={t}
      />

      {/* ─── Banner ─── */}
      {banner}

      {/* ─── 2-col layout ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        {/* ─── Col Gauche ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ProgressCard
            debt={debt}
            totalPaid={totalPaid}
            remaining={remaining}
            progressPct={progressPct}
            segments={segments}
            t={t}
          />
          <Card title={t("debts.detail.amortChart") || "Amortissement prévu"}>
            <Suspense
              fallback={
                <div
                  style={{
                    height: 240,
                    background: "rgba(43,31,21,0.04)",
                    borderRadius: 8,
                  }}
                />
              }
            >
              <AmortizationChart schedules={debt.schedules} currency={debt.currency} />
            </Suspense>
          </Card>
          <Card title={t("debts.detail.scheduleList") || "Échéancier détaillé"}>
            <ScheduleTable schedules={debt.schedules} currency={debt.currency} t={t} />
          </Card>
          <Card title={t("debts.detail.activity") || "Historique d'activité"}>
            <ActivityTimeline debt={debt} t={t} />
          </Card>
        </div>

        {/* ─── Col Droite ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card title={t("debts.detail.meta") || "Informations contrat"}>
            <MetaList debt={debt} t={t} />
          </Card>
          <Card title={t("debts.detail.parties") || "Parties au contrat"}>
            <PartiesList
              creditor={creditor}
              debtor={debtor}
              witnesses={witnesses}
              guarantors={guarantors}
              t={t}
            />
          </Card>
          <Card title={t("debts.detail.legal") || "Aspects juridiques"}>
            <LegalSection
              sigInfo={sigInfo}
              jurisdictionCode={debt.jurisdictionCode}
              t={t}
            />
          </Card>
          {secondaryActions && (
            <Card title={t("debts.detail.otherActions") || "Autres actions"}>
              {secondaryActions}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Header Card
// ───────────────────────────────────────────────────────────────────────────

function HeaderCard({
  debt,
  badge,
  creditor,
  debtor,
  primaryActions,
  t,
}: {
  debt: DesktopDebtDetail;
  badge: { bg: string; fg: string; label: string };
  creditor?: string;
  debtor?: string;
  primaryActions?: ReactNode;
  t: (k: string) => string;
}) {
  const fmtMoney = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: debt.currency || "EUR",
    maximumFractionDigits: 2,
  }).format(parseFloat(debt.amount));

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #FFFFFF 0%, #FBF6EC 100%)",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 16,
        padding: "24px 28px",
        boxShadow: "0 4px 16px rgba(43,31,21,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 280 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <code
            style={{
              fontSize: 11,
              color: "#6B5A47",
              fontFamily: "monospace",
              letterSpacing: 1,
            }}
          >
            {debt.publicCode}
          </code>
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 600,
              color: badge.fg,
              background: badge.bg,
              borderRadius: 999,
            }}
          >
            {badge.label}
          </span>
        </div>
        <div
          className="bmd-num"
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: "#2B1F15",
            lineHeight: 1.1,
            marginBottom: 6,
          }}
        >
          {fmtMoney}
        </div>
        <div style={{ fontSize: 13, color: "#6B5A47", lineHeight: 1.5 }}>
          <span style={{ color: "#0F6E56", fontWeight: 600 }}>
            {creditor ?? "—"}
          </span>{" "}
          <span style={{ opacity: 0.6 }}>{t("debts.detail.lendsTo") || "prête à"}</span>{" "}
          <span style={{ color: "#9F4628", fontWeight: 600 }}>
            {debtor ?? "—"}
          </span>
          {debt.purpose && (
            <>
              <span style={{ opacity: 0.6 }}> · </span>
              <em>{debt.purpose}</em>
            </>
          )}
        </div>
      </div>
      {primaryActions && (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {primaryActions}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Progress Card (wheel + montants)
// ───────────────────────────────────────────────────────────────────────────

function ProgressCard({
  debt,
  totalPaid,
  remaining,
  progressPct,
  segments,
  t,
}: {
  debt: DesktopDebtDetail;
  totalPaid: number;
  remaining: number;
  progressPct: number;
  segments: ReturnType<typeof schedulesToSegments>;
  t: (k: string) => string;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: debt.currency || "EUR",
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 14,
        padding: 24,
        display: "flex",
        alignItems: "center",
        gap: 28,
        flexWrap: "wrap",
      }}
    >
      <DebtWheel segments={segments} size={180} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#6B5A47",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {t("debts.detail.progress") || "Avancement du remboursement"}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Metric
            label={t("debts.detail.paid") || "Remboursé"}
            value={fmt(totalPaid)}
            color="#0F6E56"
          />
          <Metric
            label={t("debts.detail.remaining") || "Restant"}
            value={fmt(remaining)}
            color="#9F4628"
          />
          <Metric
            label={t("debts.detail.progressPct") || "Avancement"}
            value={`${progressPct.toFixed(0)}%`}
            color="#854F0B"
          />
        </div>
        <div
          style={{
            height: 8,
            background: "rgba(43,31,21,0.08)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, progressPct)}%`,
              height: "100%",
              background: "linear-gradient(90deg, #1F7A57, #0F6E56)",
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#6B5A47",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        className="bmd-num"
        style={{ fontSize: 18, fontWeight: 700, color }}
      >
        {value}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Generic Card wrapper
// ───────────────────────────────────────────────────────────────────────────

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid rgba(43,31,21,0.06)",
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "#854F0B",
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Schedule Table (échéancier détaillé)
// ───────────────────────────────────────────────────────────────────────────

function ScheduleTable({
  schedules,
  currency,
  t,
}: {
  schedules: DesktopDebtDetail["schedules"];
  currency: string;
  t: (k: string) => string;
}) {
  const fmt = (n: string | number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(typeof n === "string" ? parseFloat(n) : n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const statusColors: Record<string, { bg: string; fg: string }> = {
    PAID: { bg: "#D1FAE5", fg: "#065F46" },
    CONFIRMED: { bg: "#DCFCE7", fg: "#15803D" },
    PENDING: { bg: "#F4ECD8", fg: "#854F0B" },
    LATE: { bg: "#FED7AA", fg: "#9A3412" },
    MISSED: { bg: "#FEE2E2", fg: "#991B1B" },
  };
  const statusLabels: Record<string, string> = {
    PAID: t("debts.detail.statusPaid") || "Payée",
    CONFIRMED: t("debts.detail.statusConfirmed") || "Confirmée",
    PENDING: t("debts.detail.statusPending") || "À venir",
    LATE: t("debts.detail.statusLate") || "En retard",
    MISSED: t("debts.detail.statusMissed") || "Défaut",
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ background: "#FBF6EC" }}>
          <Th2>#</Th2>
          <Th2>{t("debts.detail.colDue") || "Échéance"}</Th2>
          <Th2 align="right">{t("debts.detail.colCapital") || "Capital"}</Th2>
          <Th2 align="right">{t("debts.detail.colInterest") || "Intérêts"}</Th2>
          <Th2 align="right">{t("debts.detail.colTotal") || "Total"}</Th2>
          <Th2>{t("debts.detail.colStatus") || "Statut"}</Th2>
          <Th2>{t("debts.detail.colPaidAt") || "Payée le"}</Th2>
        </tr>
      </thead>
      <tbody>
        {schedules.map((s) => {
          const sc = statusColors[s.status] || statusColors.PENDING;
          return (
            <tr
              key={s.id}
              style={{ borderTop: "1px solid rgba(43,31,21,0.05)" }}
            >
              <Td2>{s.sequenceNumber}</Td2>
              <Td2>
                <span className="bmd-num">{fmtDate(s.dueDate)}</span>
              </Td2>
              <Td2 align="right">
                <span className="bmd-num">{fmt(s.capitalAmount)}</span>
              </Td2>
              <Td2 align="right">
                <span
                  className="bmd-num"
                  style={{ color: "#6B5A47", opacity: 0.8 }}
                >
                  {fmt(s.interestAmount)}
                </span>
              </Td2>
              <Td2 align="right">
                <span className="bmd-num" style={{ fontWeight: 600 }}>
                  {fmt(s.expectedAmount)}
                </span>
              </Td2>
              <Td2>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: sc.fg,
                    background: sc.bg,
                    borderRadius: 999,
                  }}
                >
                  {statusLabels[s.status] || s.status}
                </span>
              </Td2>
              <Td2>
                {s.paidAt ? (
                  <span className="bmd-num" style={{ fontSize: 11 }}>
                    {fmtDate(s.paidAt)}
                  </span>
                ) : (
                  <span style={{ color: "#6B5A47", opacity: 0.5 }}>—</span>
                )}
              </Td2>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Th2({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 12px",
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "#6B5A47",
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

function Td2({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td style={{ textAlign: align, padding: "10px 12px", color: "#2B1F15" }}>
      {children}
    </td>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Activity Timeline (audit trail reconstitué)
// ───────────────────────────────────────────────────────────────────────────

function ActivityTimeline({
  debt,
  t,
}: {
  debt: DesktopDebtDetail;
  t: (k: string) => string;
}) {
  // Reconstitue les événements depuis schedules + parties + statut
  const events: Array<{
    icon: string;
    color: string;
    title: string;
    date: string;
    detail?: string;
  }> = [];

  if (debt.createdAt) {
    events.push({
      icon: "📝",
      color: "#6B5A47",
      title: t("debts.detail.evtCreated") || "Contrat créé",
      date: debt.createdAt,
      detail: t("debts.detail.evtCreatedDetail") || "Brouillon initialisé",
    });
  }
  for (const p of debt.parties) {
    if (p.signatureStatus === "SIGNED") {
      events.push({
        icon: "✍️",
        color: "#1F7A57",
        title: `${p.displayName} ${t("debts.detail.evtSigned") || "a signé"}`,
        date: debt.createdAt ?? debt.endDate,
        detail: ROLE_LABEL[p.role] ?? p.role,
      });
    }
  }
  for (const s of debt.schedules) {
    if (s.status === "PAID" || s.status === "CONFIRMED") {
      events.push({
        icon: "💰",
        color: "#0F6E56",
        title: `${t("debts.detail.evtPayment") || "Paiement échéance"} #${s.sequenceNumber}`,
        date: s.paidAt ?? s.dueDate,
        detail: `${parseFloat(s.paidAmount ?? s.expectedAmount).toFixed(2)} ${debt.currency}`,
      });
    } else if (s.status === "LATE" || s.status === "MISSED") {
      events.push({
        icon: "⚠️",
        color: "#9F4628",
        title: `${t("debts.detail.evtLate") || "Échéance manquée"} #${s.sequenceNumber}`,
        date: s.dueDate,
        detail: `${parseFloat(s.expectedAmount).toFixed(2)} ${debt.currency}`,
      });
    }
  }

  // Tri descendant
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (events.length === 0) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "#6B5A47",
          textAlign: "center",
          padding: 16,
        }}
      >
        {t("debts.detail.evtEmpty") || "Aucune activité enregistrée."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.map((e, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 14,
            paddingBottom: i === events.length - 1 ? 0 : 16,
            position: "relative",
          }}
        >
          {/* Vertical line */}
          {i !== events.length - 1 && (
            <div
              style={{
                position: "absolute",
                left: 13,
                top: 28,
                bottom: 0,
                width: 2,
                background: "rgba(43,31,21,0.10)",
              }}
            />
          )}
          <div
            style={{
              width: 28,
              height: 28,
              minWidth: 28,
              borderRadius: 14,
              background: `${e.color}15`,
              border: `1.5px solid ${e.color}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              flexShrink: 0,
              zIndex: 1,
            }}
          >
            {e.icon}
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#2B1F15",
                lineHeight: 1.3,
              }}
            >
              {e.title}
            </div>
            {e.detail && (
              <div style={{ fontSize: 11, color: "#6B5A47", marginTop: 2 }}>
                {e.detail}
              </div>
            )}
            <div
              className="bmd-num"
              style={{ fontSize: 11, color: "#6B5A47", opacity: 0.7, marginTop: 2 }}
            >
              {new Date(e.date).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Meta List (col droite)
// ───────────────────────────────────────────────────────────────────────────

function MetaList({
  debt,
  t,
}: {
  debt: DesktopDebtDetail;
  t: (k: string) => string;
}) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: t("debts.detail.metaAmount") || "Montant principal",
      value: new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: debt.currency || "EUR",
      }).format(parseFloat(debt.amount)),
    },
    {
      label: t("debts.detail.metaRate") || "Taux d'intérêt",
      value: `${parseFloat(debt.interestRate).toFixed(2)} %`,
    },
    {
      label: t("debts.detail.metaFrequency") || "Fréquence",
      value: FREQUENCY_LABEL[debt.frequency] ?? debt.frequency,
    },
    {
      label: t("debts.detail.metaInstallments") || "Échéances",
      value: String(debt.totalInstallments),
    },
    {
      label: t("debts.detail.metaStart") || "Début",
      value: debt.startDate
        ? new Date(debt.startDate).toLocaleDateString("fr-FR")
        : "—",
    },
    {
      label: t("debts.detail.metaEnd") || "Fin prévue",
      value: new Date(debt.endDate).toLocaleDateString("fr-FR"),
    },
    {
      label: t("debts.detail.metaJurisdiction") || "Juridiction",
      value: debt.jurisdictionCode ?? "—",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            fontSize: 12,
          }}
        >
          <span style={{ color: "#6B5A47" }}>{r.label}</span>
          <span
            className="bmd-num"
            style={{ color: "#2B1F15", fontWeight: 600, textAlign: "right" }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Parties List (col droite)
// ───────────────────────────────────────────────────────────────────────────

function PartiesList({
  creditor,
  debtor,
  witnesses,
  guarantors,
  t,
}: {
  creditor: DesktopDebtDetail["parties"][number] | undefined;
  debtor: DesktopDebtDetail["parties"][number] | undefined;
  witnesses: DesktopDebtDetail["parties"];
  guarantors: DesktopDebtDetail["parties"];
  t: (k: string) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {creditor && (
        <PartyRow
          party={creditor}
          accent="#0F6E56"
          subtitle={t("debts.detail.creditor") || "Créancier"}
        />
      )}
      {debtor && (
        <PartyRow
          party={debtor}
          accent="#9F4628"
          subtitle={t("debts.detail.debtor") || "Débiteur"}
        />
      )}
      {witnesses.length > 0 && (
        <PartyGroup
          title={`${t("debts.detail.witnesses") || "Témoins"} (${witnesses.length})`}
          parties={witnesses}
          accent="#854F0B"
          subtitle={t("debts.detail.witness") || "Témoin"}
        />
      )}
      {guarantors.length > 0 && (
        <PartyGroup
          title={`${t("debts.detail.guarantors") || "Garants"} (${guarantors.length})`}
          parties={guarantors}
          accent="#854F0B"
          subtitle={t("debts.detail.guarantor") || "Garant"}
        />
      )}
      {witnesses.length === 0 && guarantors.length === 0 && (
        <div
          style={{
            padding: 12,
            background: "rgba(43,31,21,0.04)",
            borderRadius: 8,
            fontSize: 11,
            color: "#6B5A47",
            textAlign: "center",
          }}
        >
          {t("debts.detail.noWitnessGuarantor") ||
            "Aucun témoin ni garant invité."}
        </div>
      )}
    </div>
  );
}

function PartyRow({
  party,
  accent,
  subtitle,
}: {
  party: DesktopDebtDetail["parties"][number];
  accent: string;
  subtitle: string;
}) {
  const initials = party.displayName
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sigDot =
    party.signatureStatus === "SIGNED"
      ? { color: "#0F6E56", label: "Signé" }
      : party.signatureStatus === "PENDING"
        ? { color: "#854F0B", label: "En attente" }
        : { color: "#6B5A47", label: party.signatureStatus };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          background: `${accent}15`,
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initials || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#2B1F15",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {party.displayName}
        </div>
        <div style={{ fontSize: 10, color: "#6B5A47", opacity: 0.8 }}>
          {subtitle}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          color: sigDot.color,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: sigDot.color,
          }}
        />
        {sigDot.label}
      </div>
    </div>
  );
}

function PartyGroup({
  title,
  parties,
  accent,
  subtitle,
}: {
  title: string;
  parties: DesktopDebtDetail["parties"];
  accent: string;
  subtitle: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#6B5A47",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {parties.map((p) => (
          <PartyRow key={p.id} party={p} accent={accent} subtitle={subtitle} />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Legal section (col droite)
// ───────────────────────────────────────────────────────────────────────────

function LegalSection({
  sigInfo,
  jurisdictionCode,
  t,
}: {
  sigInfo: (typeof SIG_LEVEL_INFO)[string];
  jurisdictionCode?: string;
  t: (k: string) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div
          style={{
            display: "inline-block",
            padding: "3px 10px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: sigInfo.color,
            background: `${sigInfo.color}15`,
            border: `1px solid ${sigInfo.color}30`,
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          {sigInfo.label}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "#2B1F15",
            lineHeight: 1.5,
          }}
        >
          {sigInfo.description}
        </p>
      </div>
      <div
        style={{
          padding: 10,
          background: "rgba(43,31,21,0.04)",
          borderRadius: 8,
          fontSize: 11,
          color: "#6B5A47",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "#854F0B" }}>
          {t("debts.detail.legalRef") || "Référence juridique"} :
        </strong>{" "}
        {sigInfo.juridicalArt}
        {jurisdictionCode && (
          <>
            <br />
            <strong style={{ color: "#854F0B" }}>
              {t("debts.detail.legalJurisdiction") || "Juridiction applicable"} :
            </strong>{" "}
            {jurisdictionCode}
          </>
        )}
      </div>
      <details
        style={{
          fontSize: 11,
          color: "#6B5A47",
          cursor: "pointer",
        }}
      >
        <summary style={{ fontWeight: 600, color: "#854F0B" }}>
          {t("debts.detail.legalMore") || "Plus d'infos sur la valeur probante"}
        </summary>
        <p style={{ marginTop: 8, lineHeight: 1.5 }}>
          {t("debts.detail.legalLong") ||
            "En cas de litige, la signature électronique est recevable comme preuve devant un tribunal. Le niveau de signature détermine la force probante : SES = preuve à part entière mais le juge apprécie. AES = présomption forte d'authenticité. QES = équivalence à la signature manuscrite + force exécutoire si notariée."}
        </p>
      </details>
    </div>
  );
}
