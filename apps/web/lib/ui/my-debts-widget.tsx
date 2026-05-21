"use client";

/**
 * V153.E — Widget "Mes RDD" pour l'accueil dashboard desktop.
 *
 * Composant compact (1 carte) qui résume l'état des RDD du user :
 *  - 4 mini-stats : À signer / Actives / En retard / Soldées
 *  - Solde net dû/à recevoir
 *  - CTA → /dashboard/debts
 *
 * Auto-hide si l'endpoint /debts est indisponible (avant migration V149)
 * ou si le user n'a aucune RDD (zero-state intégré à la page d'accueil).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";

interface DebtBrief {
  status: string;
  amount: string;
  currency: string;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  schedules: Array<{
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
    expectedAmount: string;
  }>;
}

export function MyDebtsWidget(): JSX.Element | null {
  const t = useT();
  const [debts, setDebts] = useState<DebtBrief[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    api
      .listDebts()
      .then((r) => setDebts(r.debts as DebtBrief[]))
      .catch(() => setUnavailable(true));
  }, []);

  if (unavailable) return null;
  if (debts === null) return <WidgetSkeleton />;
  if (debts.length === 0) return null; // zero-state laissé au dashboard

  const toSign = debts.filter((d) => d.status === "PROPOSED").length;
  const active = debts.filter(
    (d) => d.status === "ACTIVE" || d.status === "SIGNED",
  ).length;
  const late = debts.filter(
    (d) =>
      d.status === "LATE" ||
      d.schedules.some((s) => s.status === "LATE" || s.status === "MISSED"),
  ).length;
  const completed = debts.filter((d) => d.status === "COMPLETED").length;

  let iLend = 0;
  let iOwe = 0;
  let currency = "EUR";
  for (const d of debts) {
    if (d.status !== "ACTIVE" && d.status !== "SIGNED") continue;
    const remaining = d.schedules
      .filter((s) => s.status !== "PAID" && s.status !== "CONFIRMED")
      .reduce((sum, s) => sum + parseFloat(s.expectedAmount), 0);
    if (d.myRole === "CREDITOR") iLend += remaining;
    if (d.myRole === "DEBTOR") iOwe += remaining;
    currency = d.currency || currency;
  }
  const net = iLend - iOwe;
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #FFFFFF 0%, #FBF6EC 100%)",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 14,
        padding: "18px 22px",
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#854F0B",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            {t("dashboard.debts.eyebrow") || "Mes reconnaissances"}
          </div>
          <div
            style={{ fontSize: 14, color: "#2B1F15", fontWeight: 600 }}
          >
            {debts.length}{" "}
            {debts.length === 1
              ? t("dashboard.debts.singular") || "reconnaissance"
              : t("dashboard.debts.plural") || "reconnaissances"}
          </div>
        </div>
        <Link
          href="/dashboard/debts"
          style={{
            fontSize: 11,
            color: "#854F0B",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {t("dashboard.debts.viewAll") || "Tout voir →"}
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <MiniStat
          label={t("dashboard.debts.toSign") || "À signer"}
          value={toSign}
          color="#854F0B"
          highlight={toSign > 0}
        />
        <MiniStat
          label={t("dashboard.debts.active") || "Actives"}
          value={active}
          color="#1F7A57"
        />
        <MiniStat
          label={t("dashboard.debts.late") || "En retard"}
          value={late}
          color="#9F4628"
          highlight={late > 0}
        />
        <MiniStat
          label={t("dashboard.debts.completed") || "Soldées"}
          value={completed}
          color="#0F6E56"
        />
      </div>

      {(iLend > 0 || iOwe > 0) && (
        <div
          style={{
            padding: "10px 14px",
            background: "#FFFFFF",
            borderRadius: 10,
            border: "1px solid rgba(43,31,21,0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "#6B5A47",
                fontWeight: 700,
              }}
            >
              {net >= 0
                ? t("dashboard.debts.netLend") || "Solde net dû"
                : t("dashboard.debts.netOwe") || "Solde net à verser"}
            </div>
            <div style={{ fontSize: 11, color: "#6B5A47", opacity: 0.85 }}>
              {iLend > 0 && (
                <span style={{ color: "#0F6E56" }}>
                  +{fmtMoney(iLend)}{" "}
                  {t("dashboard.debts.youLend") || "tu prêtes"}
                </span>
              )}
              {iLend > 0 && iOwe > 0 && (
                <span style={{ opacity: 0.5 }}> · </span>
              )}
              {iOwe > 0 && (
                <span style={{ color: "#9F4628" }}>
                  −{fmtMoney(iOwe)}{" "}
                  {t("dashboard.debts.youOwe") || "tu dois"}
                </span>
              )}
            </div>
          </div>
          <div
            className="bmd-num"
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: net >= 0 ? "#1F7A57" : "#9F4628",
            }}
          >
            {fmtMoney(Math.abs(net))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
  highlight = false,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "10px 6px",
        background: highlight ? `${color}10` : "rgba(43,31,21,0.03)",
        border: highlight ? `1px solid ${color}40` : "1px solid transparent",
        borderRadius: 10,
      }}
    >
      <div
        className="bmd-num"
        style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#6B5A47",
          opacity: 0.85,
          marginTop: 4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div
      style={{
        height: 160,
        background: "rgba(43,31,21,0.04)",
        borderRadius: 14,
      }}
    />
  );
}
