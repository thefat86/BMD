"use client";

/**
 * V149.D — Page "Reconnaissances de dette" (hub) branchée sur l'API.
 *
 * Affiche en haut un hero compact "Je prête / Je dois" calculé depuis les
 * contrats actifs. En dessous, liste de contrats avec une mini-roue à gauche
 * de chaque ligne pour visualiser l'avancement du remboursement en un coup
 * d'œil. Zero-state intelligent quand pas de contrat.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
import { useT } from "../../../lib/i18n/app-strings";
import { api, isUnauthorized, clearToken } from "../../../lib/api-client";
import {
  DebtWheel,
  schedulesToSegments,
  type DebtSegmentState,
} from "../../../lib/ui/debt-wheel";
// V169 — Compteur RDD mensuel (push upgrade plan payant)
import { DebtCounter } from "../../../lib/ui/debt-counter";
// V179.C — SegmentedControl pour filtrer les RDD par statut
import { SegmentedControl } from "../../../lib/ui/segmented-control";

// V179.C — Buckets de statuts RDD pour les 3 onglets
const DEBT_ACTIVE_STATUSES = [
  "NEGOTIATING",
  "SIGNED",
  "ACTIVE",
  "IN_PROGRESS",
  "PROPOSED",
  "ACCEPTED",
  "DISPUTED",
  "DRAFT",
];
const DEBT_SETTLED_STATUSES = ["COMPLETED"];
const DEBT_CANCELLED_STATUSES = ["CANCELLED", "DEFAULTED"];

type DebtFilterTab = "active" | "settled" | "cancelled";
const DEBT_FILTER_LS_KEY = "bmd_debts_filter";

function bucketForStatus(status: string): DebtFilterTab {
  if (DEBT_CANCELLED_STATUSES.includes(status)) return "cancelled";
  if (DEBT_SETTLED_STATUSES.includes(status)) return "settled";
  return "active";
}

// V153.B — Vue web premium chargée à la demande (Recharts inclus)
const DesktopDebtsListView = dynamic(
  () =>
    import("../../../lib/ui/desktop-debts-list-view").then(
      (m) => m.DesktopDebtsListView,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 360,
          background: "rgba(43,31,21,0.04)",
          borderRadius: 14,
        }}
      />
    ),
  },
);

interface DebtSummary {
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
  parties: Array<{
    id: string;
    userId: string | null;
    displayName: string;
    role: string;
    signatureStatus: string;
  }>;
  schedules: Array<{
    id: string;
    sequenceNumber: number;
    dueDate: string;
    expectedAmount: string;
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
  }>;
  createdAt: string;
}

export default function DebtsPage(): JSX.Element {
  const router = useRouter();
  const t = useT();
  const { isMobile } = useBreakpoint();
  const [debts, setDebts] = useState<DebtSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // V179.C — Filtre par statut persisté en localStorage
  const [filterTab, setFilterTab] = useState<DebtFilterTab>("active");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DEBT_FILTER_LS_KEY);
      if (saved === "active" || saved === "settled" || saved === "cancelled") {
        setFilterTab(saved);
      }
    } catch {
      /* localStorage indisponible */
    }
  }, []);
  function handleFilterChange(v: DebtFilterTab) {
    setFilterTab(v);
    try {
      window.localStorage.setItem(DEBT_FILTER_LS_KEY, v);
    } catch {
      /* localStorage indisponible */
    }
  }

  useEffect(() => {
    api
      .listDebts()
      .then((r) => setDebts(r.debts as DebtSummary[]))
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
        setDebts([]); // évite le loader infini
      });
  }, [router]);

  // Calcul des totaux je prête / je dois (uniquement contrats ACTIVE)
  const totals = (debts ?? [])
    .filter((d) => d.status === "ACTIVE" || d.status === "SIGNED")
    .reduce(
      (acc, d) => {
        const amount = parseFloat(d.amount);
        if (d.myRole === "CREDITOR") acc.iLend += amount;
        if (d.myRole === "DEBTOR") acc.iOwe += amount;
        return acc;
      },
      { iLend: 0, iOwe: 0 },
    );

  return (
    <ResponsiveShell
      breadcrumb={t("debts.breadcrumb") || "Reconnaissances"}
      desktopTitle={t("debts.title") || "Mes reconnaissances de dette"}
      subtitle={
        t("debts.subtitle") ||
        "Tes prêts et emprunts formalisés, traçables et signés"
      }
      mobileTitle={t("debts.title") || "Reconnaissances"}
    >
      {!isMobile ? (
        <DesktopDebtsListView debts={debts as any} error={error} />
      ) : (
      <div style={{ padding: "0 4px", maxWidth: 600, margin: "0 auto" }}>
        {/* === Hero "Je prête / Je dois" === */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: "rgba(31,122,87,0.10)",
              border: "0.5px solid rgba(31,122,87,0.30)",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "#1F7A57",
                fontWeight: 700,
              }}
            >
              {t("debts.iLend") || "Je prête"}
            </div>
            <div
              className="bmd-num"
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 500,
                color: "#1F7A57",
                lineHeight: 1.1,
                marginTop: 4,
              }}
            >
              {totals.iLend.toLocaleString("fr-FR", {
                maximumFractionDigits: 0,
              })}{" "}
              €
            </div>
            <div style={{ fontSize: 10.5, color: "#6B5A47", marginTop: 2 }}>
              {(debts ?? []).filter((d) => d.myRole === "CREDITOR" && (d.status === "ACTIVE" || d.status === "SIGNED")).length}{" "}
              {t("debts.activeContracts") || "actifs"}
            </div>
          </div>
          <div
            style={{
              background: "rgba(159,70,40,0.10)",
              border: "0.5px solid rgba(159,70,40,0.30)",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "#9F4628",
                fontWeight: 700,
              }}
            >
              {t("debts.iOwe") || "Je dois"}
            </div>
            <div
              className="bmd-num"
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 500,
                color: "#9F4628",
                lineHeight: 1.1,
                marginTop: 4,
              }}
            >
              {totals.iOwe.toLocaleString("fr-FR", {
                maximumFractionDigits: 0,
              })}{" "}
              €
            </div>
            <div style={{ fontSize: 10.5, color: "#6B5A47", marginTop: 2 }}>
              {(debts ?? []).filter((d) => d.myRole === "DEBTOR" && (d.status === "ACTIVE" || d.status === "SIGNED")).length}{" "}
              {t("debts.activeContracts") || "actifs"}
            </div>
          </div>
        </div>

        {/* V169 — Compteur RDD mensuel (push upgrade) */}
        <div style={{ marginBottom: 14 }}>
          <DebtCounter variant="card" />
        </div>

        {/* === CTA Nouveau contrat === */}
        <button
          type="button"
          onClick={() => router.push("/dashboard/debts/new")}
          style={{
            width: "100%",
            background: "#C58A2E",
            color: "#FBF6EC",
            border: "none",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>
          {t("debts.newContract") || "Nouveau contrat"}
        </button>

        {/* === États : loading / error / empty / list === */}
        {debts === null && (
          <div
            style={{
              textAlign: "center",
              color: "#6B5A47",
              padding: "32px 16px",
              fontSize: 13,
            }}
          >
            {t("common.loading") || "Chargement…"}
          </div>
        )}

        {debts !== null && debts.length === 0 && (
          <EmptyState
            onCreate={() => router.push("/dashboard/debts/new")}
            label={t("debts.emptyTitle") || "Pas encore de reconnaissance"}
            hint={
              t("debts.emptyHint") ||
              "Transforme une promesse orale en contrat traçable et signé. La confiance qui dure, c'est celle qui s'écrit."
            }
            cta={t("debts.createCta") || "Créer ma première reconnaissance"}
          />
        )}

        {debts !== null && debts.length > 0 && (() => {
          // V179.C — Compteurs + filtrage par bucket de statut
          const counts = { active: 0, settled: 0, cancelled: 0 };
          for (const d of debts) {
            counts[bucketForStatus(d.status)]++;
          }
          const filtered = debts.filter(
            (d) => bucketForStatus(d.status) === filterTab,
          );
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* V179.C — SegmentedControl 3 onglets actives/soldées/annulées */}
              <div style={{ marginBottom: 4 }}>
                <SegmentedControl<DebtFilterTab>
                  value={filterTab}
                  onChange={handleFilterChange}
                  size="sm"
                  ariaLabel={t("debts.list.filterAria") || "Filtrer les RDD"}
                  segments={[
                    {
                      value: "active",
                      label: `${t("debts.list.tabActive") || "Actives"} (${counts.active})`,
                    },
                    {
                      value: "settled",
                      label: `${t("debts.list.tabSettled") || "Soldées"} (${counts.settled})`,
                    },
                    {
                      value: "cancelled",
                      label: `${t("debts.list.tabCancelled") || "Annulées"} (${counts.cancelled})`,
                    },
                  ]}
                />
              </div>
              {filtered.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "24px 16px",
                    color: "#6B5A47",
                    fontSize: 12.5,
                    background: "rgba(255,255,255,0.6)",
                    border: "0.5px dashed rgba(43,31,21,0.15)",
                    borderRadius: 12,
                  }}
                >
                  {t("debts.list.emptyBucket") ||
                    "Aucune reconnaissance dans cet onglet."}
                </div>
              ) : (
                filtered.map((d) => (
                  <DebtCard
                    key={d.id}
                    debt={d}
                    onClick={() => router.push(`/dashboard/debts/${d.id}`)}
                  />
                ))
              )}
            </div>
          );
        })()}

        {error && (
          <div
            style={{
              background: "rgba(159,70,40,0.10)",
              border: "0.5px solid rgba(159,70,40,0.30)",
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              color: "#9F4628",
              marginTop: 16,
            }}
          >
            {error}
          </div>
        )}
      </div>
      )}
    </ResponsiveShell>
  );
}

function DebtCard({
  debt,
  onClick,
}: {
  debt: DebtSummary;
  onClick: () => void;
}) {
  const segments: DebtSegmentState[] = schedulesToSegments(debt.schedules);
  const otherParty = debt.parties.find(
    (p) =>
      p.role !== debt.myRole &&
      (p.role === "CREDITOR" || p.role === "DEBTOR"),
  );
  const isCreditor = debt.myRole === "CREDITOR";
  const amountColor = isCreditor ? "#1F7A57" : "#9F4628";
  const amountSign = isCreditor ? "+" : "−";
  const paidCount = segments.filter((s) => s === "paid").length;
  const total = segments.length;
  const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        border: "0.5px solid rgba(43,31,21,0.12)",
        borderRadius: 12,
        padding: "11px 13px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <DebtWheel segments={segments} size={54} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 8,
          }}
        >
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
            {otherParty?.displayName ?? "—"}
          </div>
          <div
            className="bmd-num"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: amountColor,
              flexShrink: 0,
            }}
          >
            {amountSign}
            {parseFloat(debt.amount).toLocaleString("fr-FR", {
              maximumFractionDigits: 0,
            })}{" "}
            {debt.currency === "EUR" ? "€" : debt.currency}
          </div>
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "#6B5A47",
            marginTop: 2,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>
            {isCreditor
              ? "Tu prêtes"
              : "Tu dois"}{" "}
            · {paidCount} / {total}
          </span>
          <span style={{ color: "#C58A2E", fontWeight: 600 }}>{pct}%</span>
        </div>
        {debt.purpose && (
          <div
            style={{
              fontSize: 10.5,
              color: "#6B5A47",
              marginTop: 2,
              fontStyle: "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {debt.purpose}
          </div>
        )}
      </div>
    </button>
  );
}

function EmptyState({
  onCreate,
  label,
  hint,
  cta,
}: {
  onCreate: () => void;
  label: string;
  hint: string;
  cta: string;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "32px 20px",
        background: "rgba(255,255,255,0.6)",
        border: "0.5px solid rgba(43,31,21,0.10)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "rgba(197,138,46,0.15)",
          color: "#C58A2E",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <svg
          width={32}
          height={32}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 500,
          color: "#2B1F15",
          lineHeight: 1.2,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "#6B5A47",
          lineHeight: 1.5,
          maxWidth: 320,
          margin: "0 auto 18px",
        }}
      >
        {hint}
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{
          background: "#C58A2E",
          color: "#FBF6EC",
          border: "none",
          borderRadius: 12,
          padding: "12px 22px",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {cta}
      </button>
    </div>
  );
}
