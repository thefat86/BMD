"use client";

/**
 * V171.D — Vue dédiée RDD sur le dashboard.
 *
 * Affichage banking-style des reconnaissances de dette de l'utilisateur :
 *  - Hero stats : 2 chiffres-clés (on me doit / je dois) côté RDD
 *  - Liste des RDD actives avec prochaine échéance + statut
 *  - CTA "Créer une RDD" et "Voir toutes mes RDD"
 *
 * Palette V45-light (ivory + saffron + emerald + terracotta).
 */

import Link from "next/link";
import { useEffect, useState, memo } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";

interface DebtSummary {
  id: string;
  publicCode: string;
  status: string;
  amount: string;
  currency: string;
  totalInstallments: number;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  parties: Array<{ displayName: string; role: string; userId?: string }>;
  schedules: Array<{
    id: string;
    sequenceNumber: number;
    dueDate: string;
    expectedAmount: string;
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
  }>;
  endDate: string;
}

export interface DashboardDebtsAggregate {
  /** Somme arithmétique de ce qu'on me doit sur les RDD (statut actif). */
  totalOwedToMe: number;
  /** Somme arithmétique de ce que je dois sur les RDD (statut actif). */
  totalIOwe: number;
  /** Nombre de RDD actives (status NEGOTIATING/SIGNED/ACTIVE/IN_PROGRESS). */
  activeCount: number;
  /** Prochaine échéance toutes RDD confondues (date ISO, ou null). */
  nextDueDate: string | null;
  /** Devise principale utilisée pour les totaux (1ère trouvée). */
  primaryCurrency: string;
}

/** Calcule l'agrégat dashboard depuis la liste brute de RDD. */
export function aggregateDebts(debts: DebtSummary[]): DashboardDebtsAggregate {
  let totalOwedToMe = 0;
  let totalIOwe = 0;
  let activeCount = 0;
  let nextDue: Date | null = null;
  let primaryCurrency = "EUR";

  for (const d of debts) {
    if (!ACTIVE_DEBT_STATUSES.includes(d.status)) continue;
    activeCount += 1;
    primaryCurrency = d.currency;
    // Calcul du restant à payer : sum des schedules non confirmés
    const remaining = d.schedules
      .filter((s) => s.status !== "CONFIRMED")
      .reduce((sum, s) => sum + parseFloat(s.expectedAmount), 0);
    if (d.myRole === "CREDITOR") totalOwedToMe += remaining;
    else if (d.myRole === "DEBTOR") totalIOwe += remaining;
    // Prochaine échéance non confirmée
    const next = d.schedules.find((s) => s.status !== "CONFIRMED");
    if (next) {
      const dt = new Date(next.dueDate);
      if (!nextDue || dt < nextDue) nextDue = dt;
    }
  }

  return {
    totalOwedToMe,
    totalIOwe,
    activeCount,
    nextDueDate: nextDue ? nextDue.toISOString() : null,
    primaryCurrency,
  };
}

export const ACTIVE_DEBT_STATUSES = [
  "NEGOTIATING",
  "SIGNED",
  "ACTIVE",
  "IN_PROGRESS",
  "PROPOSED",
  "ACCEPTED",
];

function statusBadgeColor(status: string): { bg: string; fg: string; label: string } {
  if (status === "ACTIVE" || status === "SIGNED" || status === "IN_PROGRESS") {
    return { bg: "rgba(31,122,87,0.10)", fg: "#0F6E56", label: "Actif" };
  }
  if (status === "PROPOSED" || status === "NEGOTIATING") {
    return { bg: "rgba(197,138,46,0.10)", fg: "#854F0B", label: "En cours" };
  }
  if (status === "COMPLETED") {
    return { bg: "rgba(43,31,21,0.06)", fg: "#6B5A47", label: "Soldé" };
  }
  if (status === "DISPUTED") {
    return { bg: "rgba(159,70,40,0.10)", fg: "#9F4628", label: "Litige" };
  }
  if (status === "CANCELLED" || status === "DEFAULTED") {
    return { bg: "rgba(159,70,40,0.10)", fg: "#9F4628", label: "Annulé" };
  }
  return { bg: "rgba(43,31,21,0.06)", fg: "#6B5A47", label: status };
}

export function DashboardDebtsView({
  onCreate,
}: {
  onCreate?: () => void;
} = {}): JSX.Element {
  const t = useT();
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listDebts()
      .then((r) => {
        if (cancelled) return;
        setDebts((r.debts ?? []) as DebtSummary[]);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setUnavailable(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          padding: "12px 14px",
          textAlign: "center",
          color: "#6B5A47",
          fontSize: 13,
        }}
      >
        {t("common.loading") || "Chargement…"}
      </div>
    );
  }

  if (unavailable) {
    return (
      <div
        style={{
          padding: 16,
          background: "rgba(159,70,40,0.06)",
          border: "1px solid rgba(159,70,40,0.20)",
          borderRadius: 12,
          fontSize: 12.5,
          color: "#9F4628",
          textAlign: "center",
        }}
      >
        {t("debts.dashboard.unavailable") ||
          "Module RDD non encore activé sur cette instance."}
      </div>
    );
  }

  const agg = aggregateDebts(debts);
  const active = debts.filter((d) => ACTIVE_DEBT_STATUSES.includes(d.status));

  if (debts.length === 0) {
    return <DashboardDebtsEmptyState onCreate={onCreate} t={t} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Hero stats RDD */}
      <div
        style={{
          background:
            "linear-gradient(135deg, #FBF6EC 0%, #F4ECD8 100%)",
          border: "1px solid rgba(197,138,46,0.20)",
          borderRadius: 16,
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <DebtStatTile
          eyebrow={t("debts.dashboard.owedToMe") || "On me doit"}
          amount={agg.totalOwedToMe}
          currency={agg.primaryCurrency}
          color="#1F7A57"
        />
        <DebtStatTile
          eyebrow={t("debts.dashboard.iOwe") || "Je dois"}
          amount={agg.totalIOwe}
          currency={agg.primaryCurrency}
          color="#9F4628"
        />
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: "1px dashed rgba(43,31,21,0.12)",
            fontSize: 11,
            color: "#6B5A47",
          }}
        >
          <span>
            {t("debts.dashboard.activeCount") || "Actives"} ·{" "}
            <strong className="bmd-num" style={{ color: "#2B1F15" }}>
              {agg.activeCount}
            </strong>
          </span>
          {agg.nextDueDate && (
            <span>
              {t("debts.dashboard.nextDue") || "Prochaine échéance"} ·{" "}
              <strong style={{ color: "#2B1F15" }}>
                {new Date(agg.nextDueDate).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Liste des RDD actives */}
      {active.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: 10.5,
              color: "var(--muted, #8a7b6b)",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontWeight: 700,
              margin: "0 0 8px",
            }}
          >
            {t("debts.dashboard.activeList") || "Mes contrats actifs"}
          </h3>
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
            {active.slice(0, 6).map((d) => (
              <DebtRow key={d.id} debt={d} t={t} />
            ))}
          </ul>
        </div>
      )}

      {/* CTA voir toutes / créer */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Link
          href="/dashboard/debts"
          prefetch
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
            padding: "11px 14px",
            background: "#FFFFFF",
            border: "1px solid rgba(43,31,21,0.16)",
            borderRadius: 12,
            color: "#2B1F15",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <Icon name="folder" size={14} color="#2B1F15" strokeWidth={1.8} />
          {t("debts.dashboard.viewAll") || "Toutes mes RDD"}
        </Link>
        <button
          type="button"
          onClick={onCreate}
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
            padding: "11px 14px",
            background: "#C58A2E",
            border: "none",
            borderRadius: 12,
            color: "#FBF6EC",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Icon name="plus" size={14} color="#FBF6EC" strokeWidth={1.8} />
          {t("debts.dashboard.create") || "Créer une RDD"}
        </button>
      </div>
    </div>
  );
}

// V175.J — memoised : invariant tant que les props ne changent pas.
const DebtStatTile = memo(function DebtStatTile({
  eyebrow,
  amount,
  currency,
  color,
}: {
  eyebrow: string;
  amount: number;
  currency: string;
  color: string;
}): JSX.Element {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          color: "#6B5A47",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 2,
        }}
      >
        {eyebrow}
      </div>
      <div
        className="bmd-num"
        style={{
          fontSize: 22,
          fontWeight: 800,
          color,
          letterSpacing: -0.4,
          lineHeight: 1.1,
        }}
      >
        {amount.toFixed(2).replace(".", ",")}{" "}
        <span style={{ fontSize: 11, color: "#6B5A47", fontWeight: 600 }}>
          {currency === "EUR" ? "€" : currency}
        </span>
      </div>
    </div>
  );
});

// V175.J — memoised : optimise re-render dans la liste .map() des RDD.
const DebtRow = memo(function DebtRow({
  debt,
  t,
}: {
  debt: DebtSummary;
  t: (k: string) => string;
}): JSX.Element {
  const status = statusBadgeColor(debt.status);
  const isCreditor = debt.myRole === "CREDITOR";
  const accent = isCreditor ? "#1F7A57" : "#9F4628";
  const counterparty = debt.parties.find(
    (p) => p.role === (isCreditor ? "DEBTOR" : "CREDITOR"),
  );
  const nextSched = debt.schedules.find((s) => s.status !== "CONFIRMED");
  const remaining = debt.schedules
    .filter((s) => s.status !== "CONFIRMED")
    .reduce((sum, s) => sum + parseFloat(s.expectedAmount), 0);

  return (
    <li>
      <Link
        href={`/dashboard/debts/${debt.id}`}
        prefetch
        style={{
          display: "block",
          background: "#FFFFFF",
          border: "0.5px solid rgba(43,31,21,0.12)",
          borderRadius: 12,
          padding: "10px 12px",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 9.5,
                color: accent,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 2,
              }}
            >
              {isCreditor
                ? t("debts.dashboard.iLent") || "Tu prêtes à"
                : t("debts.dashboard.iBorrowed") || "Tu dois à"}
            </div>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "#2B1F15",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {counterparty?.displayName ?? "—"}
            </div>
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 999,
              background: status.bg,
              color: status.fg,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {status.label}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginTop: 6,
          }}
        >
          <div className="bmd-num" style={{ fontSize: 15, fontWeight: 700, color: accent }}>
            {remaining.toFixed(2).replace(".", ",")}{" "}
            <span style={{ fontSize: 11, color: "#6B5A47", fontWeight: 600 }}>
              {debt.currency === "EUR" ? "€" : debt.currency}
            </span>
          </div>
          {nextSched && (
            <div style={{ fontSize: 10.5, color: "#6B5A47" }}>
              {t("debts.dashboard.nextOn") || "Prochain"} ·{" "}
              {new Date(nextSched.dueDate).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
});

function DashboardDebtsEmptyState({
  onCreate,
  t,
}: {
  onCreate?: () => void;
  t: (k: string) => string;
}): JSX.Element {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
        border: "1px solid rgba(197,138,46,0.20)",
        borderRadius: 18,
        padding: "22px 18px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          margin: "0 auto 10px",
          borderRadius: "50%",
          background: "rgba(197,138,46,0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="file-text" size={24} color="#C58A2E" strokeWidth={1.8} />
      </div>
      <h3
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 20,
          fontWeight: 700,
          color: "#2B1F15",
          margin: "0 0 6px",
        }}
      >
        {t("debts.dashboard.emptyTitle") || "Aucune reconnaissance de dette"}
      </h3>
      <p style={{ fontSize: 12.5, color: "#6B5A47", margin: "0 0 14px", lineHeight: 1.5 }}>
        {t("debts.dashboard.emptyBody") ||
          "Formalise un prêt entre amis ou famille : montant, échéances, signatures électroniques. Tout est documenté, sécurisé, et BMD veille à la bonne exécution."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        style={{
          padding: "10px 18px",
          background: "#C58A2E",
          color: "#FBF6EC",
          border: "none",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {t("debts.dashboard.createFirst") || "Créer ma première RDD"}
      </button>
    </div>
  );
}
