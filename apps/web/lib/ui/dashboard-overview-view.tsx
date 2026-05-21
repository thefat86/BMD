"use client";

/**
 * V171.C — Vue "globale" du dashboard.
 *
 * Synthèse banking-style combinant groupes + reconnaissances de dette :
 *  - Hero solde NET TOTAL (groupes + RDD) au centre
 *  - 2 mini-pills : "ON ME DOIT" et "JE DOIS" cumulés
 *  - Breakdown 2 colonnes (Groupes vs RDD) avec leur sous-total
 *  - Prochaine échéance toutes sources confondues
 *  - 2 CTAs raccourcis vers les vues détaillées
 *
 * L'idée : en un coup d'œil, savoir où on en est financièrement avec ses
 * proches, sans devoir naviguer entre les 2 modules.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";
import {
  aggregateDebts,
  type DashboardDebtsAggregate,
} from "./dashboard-debts-view";

interface GlobalBalance {
  net: string;
  owedToMe: string;
  iOwe: string;
  primaryCurrency: string;
  groupCount: number;
}

export function DashboardOverviewView({
  balance,
  groupCount,
}: {
  balance: GlobalBalance | null;
  groupCount: number;
}): JSX.Element {
  const t = useT();
  const [debtsAgg, setDebtsAgg] = useState<DashboardDebtsAggregate | null>(
    null,
  );
  const [debtsUnavailable, setDebtsUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listDebts()
      .then((r) => {
        if (cancelled) return;
        setDebtsAgg(aggregateDebts((r.debts ?? []) as any));
      })
      .catch(() => {
        if (cancelled) return;
        setDebtsUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groupsOwedToMe = balance ? parseFloat(balance.owedToMe) : 0;
  const groupsIOwe = balance ? parseFloat(balance.iOwe) : 0;
  const debtsOwedToMe = debtsAgg?.totalOwedToMe ?? 0;
  const debtsIOwe = debtsAgg?.totalIOwe ?? 0;
  const totalOwedToMe = groupsOwedToMe + debtsOwedToMe;
  const totalIOwe = groupsIOwe + debtsIOwe;
  const totalNet = totalOwedToMe - totalIOwe;
  const currency =
    balance?.primaryCurrency ?? debtsAgg?.primaryCurrency ?? "EUR";

  const accent = totalNet > 0 ? "#1F7A57" : totalNet < 0 ? "#9F4628" : "#2B1F15";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Hero combiné */}
      <div
        style={{
          background:
            "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
          borderRadius: 20,
          padding: "16px 18px 18px",
          border: "1px solid rgba(197,138,46,0.20)",
          boxShadow:
            "0 6px 20px rgba(43,31,21,0.08), 0 1px 2px rgba(43,31,21,0.06)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(197,138,46,0.18), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            fontSize: 10,
            color: "#6B5A47",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {t("dashboard.overview.netLabel") || "Mon solde net (tout compris)"}
        </div>

        {/* Solde net */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            color: accent,
            marginBottom: 10,
          }}
        >
          <span
            className="bmd-num"
            style={{ fontSize: 22, fontWeight: 700, opacity: 0.9 }}
          >
            {totalNet >= 0 ? "+" : "−"}
          </span>
          <span
            className="bmd-num"
            style={{
              fontSize: "clamp(28px, 10vw, 44px)",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: -1,
            }}
          >
            {Math.abs(totalNet)
              .toFixed(2)
              .replace(".", ",")
              .replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
          </span>
          <span
            className="bmd-num"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#C58A2E",
              marginLeft: 4,
            }}
          >
            {currency}
          </span>
        </div>

        {/* 2 mini-pills owed vs i-owe */}
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <MiniPill
            eyebrow={t("dashboard.overview.owedToMe") || "On me doit"}
            amount={totalOwedToMe}
            currency={currency}
            color="#1F7A57"
          />
          <MiniPill
            eyebrow={t("dashboard.overview.iOwe") || "Je dois"}
            amount={totalIOwe}
            currency={currency}
            color="#9F4628"
          />
        </div>

        {/* Breakdown 2 col Groupes / RDD */}
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            paddingTop: 10,
            borderTop: "1px dashed rgba(43,31,21,0.12)",
          }}
        >
          <BreakdownTile
            iconName="users"
            label={t("dashboard.overview.groupsLabel") || "Groupes"}
            countLabel={
              groupCount > 0
                ? `${groupCount} ${groupCount > 1 ? t("dashboard.overview.groupsCount") || "groupes" : t("dashboard.overview.groupCount") || "groupe"}`
                : t("dashboard.overview.groupsEmpty") || "Aucun"
            }
            owedToMe={groupsOwedToMe}
            iOwe={groupsIOwe}
            currency={currency}
          />
          <BreakdownTile
            iconName="file-text"
            label={t("dashboard.overview.debtsLabel") || "Reconnaissances"}
            countLabel={
              debtsUnavailable
                ? t("dashboard.overview.debtsModule") || "Module"
                : debtsAgg && debtsAgg.activeCount > 0
                  ? `${debtsAgg.activeCount} ${debtsAgg.activeCount > 1 ? t("dashboard.overview.debtsCount") || "actives" : t("dashboard.overview.debtCount") || "active"}`
                  : t("dashboard.overview.debtsEmpty") || "Aucune"
            }
            owedToMe={debtsOwedToMe}
            iOwe={debtsIOwe}
            currency={currency}
            dim={debtsUnavailable}
          />
        </div>

        {/* Prochaine échéance globale */}
        {debtsAgg?.nextDueDate && (
          <div
            style={{
              position: "relative",
              marginTop: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.55)",
              borderRadius: 10,
              fontSize: 11.5,
              color: "#6B5A47",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon
              name="calendar"
              size={13}
              color="#C58A2E"
              strokeWidth={1.8}
            />
            <span>
              {t("dashboard.overview.nextDue") || "Prochaine échéance"} ·{" "}
              <strong style={{ color: "#2B1F15" }}>
                {new Date(debtsAgg.nextDueDate).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* CTAs raccourcis vers vues détaillées */}
      <div style={{ display: "flex", gap: 8 }}>
        <Link
          href="/dashboard/stats"
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
          <Icon name="bar-chart-2" size={14} color="#2B1F15" strokeWidth={1.8} />
          {t("dashboard.overview.statsCta") || "Voir mes stats"}
        </Link>
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
          <Icon name="file-text" size={14} color="#2B1F15" strokeWidth={1.8} />
          {t("dashboard.overview.debtsCta") || "Mes RDD"}
        </Link>
      </div>
    </div>
  );
}

function MiniPill({
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
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(255,255,255,0.6)",
        borderRadius: 10,
        border: "1px solid rgba(43,31,21,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "#6B5A47",
          letterSpacing: 1.1,
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
          fontSize: 16,
          fontWeight: 800,
          color,
          letterSpacing: -0.2,
          lineHeight: 1.1,
        }}
      >
        {amount.toFixed(2).replace(".", ",")}{" "}
        <span style={{ fontSize: 10, color: "#6B5A47", fontWeight: 600 }}>
          {currency === "EUR" ? "€" : currency}
        </span>
      </div>
    </div>
  );
}

function BreakdownTile({
  iconName,
  label,
  countLabel,
  owedToMe,
  iOwe,
  currency,
  dim,
}: {
  iconName: "users" | "file-text";
  label: string;
  countLabel: string;
  owedToMe: number;
  iOwe: number;
  currency: string;
  dim?: boolean;
}): JSX.Element {
  const net = owedToMe - iOwe;
  return (
    <div
      style={{
        opacity: dim ? 0.45 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Icon name={iconName} size={12} color="#6B5A47" strokeWidth={1.8} />
        <span
          style={{
            fontSize: 9.5,
            color: "#6B5A47",
            letterSpacing: 1.1,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="bmd-num"
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: net > 0 ? "#1F7A57" : net < 0 ? "#9F4628" : "#2B1F15",
          letterSpacing: -0.2,
        }}
      >
        {net >= 0 ? "+" : "−"}
        {Math.abs(net).toFixed(2).replace(".", ",")}{" "}
        <span style={{ fontSize: 9.5, color: "#6B5A47", fontWeight: 600 }}>
          {currency === "EUR" ? "€" : currency}
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: "#8a7b6b" }}>{countLabel}</div>
    </div>
  );
}
