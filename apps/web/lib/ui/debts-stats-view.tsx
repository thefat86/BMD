"use client";

/**
 * <DebtsStatsView> · V148.C — Sous-onglet « Dettes » de la page Stats.
 *
 * Affiche un panorama des contrats RDD (V149) du user :
 *   - KPIs : Je prête, Je dois, Contrats actifs, Échéances payées
 *   - Prochaine échéance à venir (créancier ou débiteur)
 *   - Statut global : ratio payé vs à payer
 *   - Liste compacte des contrats avec rôle et avancement
 *
 * Conçu pour s'intégrer dans la page Stats existante derrière un toggle
 * Groupes/Dettes (cf. /dashboard/stats/page.tsx).
 *
 * Mobile + desktop : un seul composant, layout flex/grid adaptatif.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useT } from "../i18n/app-strings";

interface DebtSummary {
  id: string;
  publicCode: string;
  status: string;
  amount: string;
  currency: string;
  myRole: "CREDITOR" | "DEBTOR" | "WITNESS" | "GUARANTOR" | "UNKNOWN";
  schedules: Array<{
    id: string;
    sequenceNumber: number;
    dueDate: string;
    expectedAmount: string;
    status: "PENDING" | "PAID" | "CONFIRMED" | "LATE" | "MISSED";
  }>;
}

export function DebtsStatsView(): JSX.Element {
  const router = useRouter();
  const t = useT();
  const [debts, setDebts] = useState<DebtSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setDebts([]);
      });
  }, [router]);

  if (debts === null) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--cocoa-soft, #6B5A47)",
          fontSize: 13,
        }}
      >
        {t("common.loading") || "Chargement…"}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="card"
        style={{
          padding: 16,
          color: "var(--terracotta, #9F4628)",
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }

  // === Calculs des stats RDD ===
  const activeDebts = debts.filter(
    (d) => d.status === "ACTIVE" || d.status === "SIGNED",
  );

  const iLend = activeDebts
    .filter((d) => d.myRole === "CREDITOR")
    .reduce((sum, d) => sum + parseFloat(d.amount), 0);

  const iOwe = activeDebts
    .filter((d) => d.myRole === "DEBTOR")
    .reduce((sum, d) => sum + parseFloat(d.amount), 0);

  // Devise dominante (la plus présente dans les contrats actifs).
  const currencyCount = activeDebts.reduce<Record<string, number>>((acc, d) => {
    acc[d.currency] = (acc[d.currency] ?? 0) + 1;
    return acc;
  }, {});
  const dominantCurrency =
    Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";

  // Échéances toutes confondues
  const allSchedules = activeDebts.flatMap((d) =>
    d.schedules.map((s) => ({ ...s, debtId: d.id, myRole: d.myRole })),
  );
  const paidSchedules = allSchedules.filter(
    (s) => s.status === "PAID" || s.status === "CONFIRMED",
  );
  const pendingSchedules = allSchedules.filter((s) => s.status === "PENDING");
  const lateSchedules = allSchedules.filter(
    (s) => s.status === "LATE" || s.status === "MISSED",
  );

  // Prochaine échéance (la plus proche dans le futur)
  const upcomingSchedule = pendingSchedules
    .filter((s) => new Date(s.dueDate) >= new Date())
    .sort(
      (a, b) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    )[0];

  // Ratio de progression global
  const totalScheduledAmount = allSchedules.reduce(
    (sum, s) => sum + parseFloat(s.expectedAmount),
    0,
  );
  const paidAmount = paidSchedules.reduce(
    (sum, s) => sum + parseFloat(s.expectedAmount),
    0,
  );
  const progressPct =
    totalScheduledAmount > 0
      ? Math.round((paidAmount / totalScheduledAmount) * 100)
      : 0;

  // Zero state
  if (activeDebts.length === 0) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--cocoa-soft, #6B5A47)",
        }}
      >
        <div
          style={{
            fontSize: 48,
            marginBottom: 12,
            opacity: 0.4,
          }}
          aria-hidden
        >
          📜
        </div>
        <h3
          style={{
            margin: "0 0 6px",
            fontSize: 16,
            color: "var(--cocoa, #2B1F15)",
          }}
        >
          {t("debts.stats.emptyTitle") || "Aucun contrat actif"}
        </h3>
        <p style={{ fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
          {t("debts.stats.emptyHint") ||
            "Quand tu auras formalisé un prêt, tes stats apparaîtront ici."}
        </p>
        <Link
          href="/dashboard/debts/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #C58A2E, #9F4628)",
            color: "#FBF6EC",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          {t("debts.stats.cta") || "Créer une reconnaissance"}
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "8px 0 24px",
      }}
    >
      {/* === KPIs principaux === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <DebtKpi
          label={t("debts.stats.iLend") || "Je prête"}
          value={fmt(iLend, dominantCurrency)}
          hint={
            (activeDebts.filter((d) => d.myRole === "CREDITOR").length || 0) +
            " " +
            (t("debts.stats.activeContracts") || "contrat(s) actif(s)")
          }
          accent="emerald"
        />
        <DebtKpi
          label={t("debts.stats.iOwe") || "Je dois"}
          value={fmt(iOwe, dominantCurrency)}
          hint={
            (activeDebts.filter((d) => d.myRole === "DEBTOR").length || 0) +
            " " +
            (t("debts.stats.activeContracts") || "contrat(s) actif(s)")
          }
          accent="terracotta"
        />
        <DebtKpi
          label={t("debts.stats.installmentsPaid") || "Échéances payées"}
          value={`${paidSchedules.length} / ${allSchedules.length}`}
          hint={`${progressPct}% ${t("debts.stats.progress") || "progression"}`}
          accent="saffron"
        />
        <DebtKpi
          label={t("debts.stats.lateInstallments") || "En retard"}
          value={String(lateSchedules.length)}
          hint={
            lateSchedules.length === 0
              ? t("debts.stats.allOnTime") || "Tout est à jour 🎯"
              : t("debts.stats.actionNeeded") || "Action requise"
          }
          accent={lateSchedules.length === 0 ? "muted" : "terracotta"}
        />
      </div>

      {/* === Prochaine échéance === */}
      {upcomingSchedule && (
        <div
          className="card"
          style={{
            padding: 14,
            background:
              "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(197,138,46,0.02))",
            border: "1px solid rgba(197,138,46,0.25)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--cocoa-soft, #6B5A47)",
              textTransform: "uppercase",
              letterSpacing: 1.2,
              marginBottom: 4,
              fontWeight: 700,
            }}
          >
            {t("debts.stats.upcomingTitle") || "Prochaine échéance"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              {fmt(
                parseFloat(upcomingSchedule.expectedAmount),
                dominantCurrency,
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color:
                  upcomingSchedule.myRole === "CREDITOR"
                    ? "var(--emerald, #1F7A57)"
                    : "var(--terracotta, #9F4628)",
                fontWeight: 700,
              }}
            >
              {upcomingSchedule.myRole === "CREDITOR"
                ? t("debts.stats.toReceive") || "À recevoir"
                : t("debts.stats.toPay") || "À payer"}
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5A47)",
            }}
          >
            {t("debts.stats.dueOn") || "Échéance le"}{" "}
            {new Date(upcomingSchedule.dueDate).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <Link
            href={`/dashboard/debts/${upcomingSchedule.debtId}`}
            style={{
              display: "inline-block",
              marginTop: 10,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--saffron, #C58A2E)",
              textDecoration: "none",
            }}
          >
            {t("debts.stats.viewContract") || "Voir le contrat"} →
          </Link>
        </div>
      )}

      {/* === Progress bar globale === */}
      {totalScheduledAmount > 0 && (
        <div
          className="card"
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              {t("debts.stats.globalProgress") || "Progression globale"}
            </h3>
            <span
              style={{
                fontSize: 12,
                color: "var(--cocoa-soft, #6B5A47)",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {fmt(paidAmount, dominantCurrency)} /{" "}
              {fmt(totalScheduledAmount, dominantCurrency)}
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: "rgba(43,31,21,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background:
                  "linear-gradient(90deg, #C58A2E, #1F7A57)",
                transition: "width 400ms ease-out",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--cocoa-soft, #6B5A47)",
              textAlign: "right",
              fontWeight: 700,
            }}
          >
            {progressPct}%
          </div>
        </div>
      )}

      {/* === Liste compacte des contrats actifs === */}
      <div
        className="card"
        style={{
          padding: 14,
        }}
      >
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
          }}
        >
          {t("debts.stats.activeContractsTitle") || "Contrats actifs"} (
          {activeDebts.length})
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
          {activeDebts.map((d) => {
            const dPaid = d.schedules.filter(
              (s) => s.status === "PAID" || s.status === "CONFIRMED",
            ).length;
            const dTotal = d.schedules.length;
            const dPct = dTotal > 0 ? Math.round((dPaid / dTotal) * 100) : 0;
            return (
              <li key={d.id}>
                <Link
                  href={`/dashboard/debts/${d.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--line-soft, rgba(43,31,21,0.10))",
                    textDecoration: "none",
                    color: "var(--cocoa, #2B1F15)",
                    background: "var(--ivory, #FBF6EC)",
                    transition: "background 150ms",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 2,
                      }}
                    >
                      {d.publicCode}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--cocoa-soft, #6B5A47)",
                      }}
                    >
                      {d.myRole === "CREDITOR"
                        ? t("debts.role.creditor") || "Créancier"
                        : d.myRole === "DEBTOR"
                          ? t("debts.role.debtor") || "Débiteur"
                          : d.myRole}{" "}
                      · {dPaid}/{dTotal} {t("debts.stats.installments") || "échéances"}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "Cormorant Garamond, serif",
                        fontSize: 16,
                        fontWeight: 700,
                        color:
                          d.myRole === "CREDITOR"
                            ? "var(--emerald, #1F7A57)"
                            : "var(--terracotta, #9F4628)",
                      }}
                    >
                      {fmt(parseFloat(d.amount), d.currency)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--cocoa-soft, #6B5A47)",
                        fontWeight: 700,
                      }}
                    >
                      {dPct}%
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function DebtKpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: "saffron" | "emerald" | "terracotta" | "muted";
}) {
  const colors = {
    saffron: "#C58A2E",
    emerald: "#1F7A57",
    terracotta: "#9F4628",
    muted: "#8A7C66",
  };
  const accentColor = colors[accent];
  return (
    <div
      style={{
        background: "var(--ivory, #FBF6EC)",
        border: "1px solid var(--line-soft, rgba(43,31,21,0.10))",
        borderRadius: 12,
        padding: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          background: accentColor,
        }}
      />
      <div
        style={{
          fontSize: 10,
          color: "var(--cocoa-soft, #6B5A47)",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 4,
          paddingLeft: 6,
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
          color: "var(--cocoa, #2B1F15)",
          lineHeight: 1.1,
          paddingLeft: 6,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 10,
            color: "var(--cocoa-soft, #6B5A47)",
            marginTop: 2,
            paddingLeft: 6,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function fmt(n: number, currency: string): string {
  const noDecimals = ["XAF", "XOF", "KES", "TZS", "UGX", "RWF", "CDF"];
  const decimals = noDecimals.includes(currency) ? 0 : 2;
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${currency}`;
}
