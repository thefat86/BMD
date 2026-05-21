"use client";

/**
 * V152.I — Block "Mes signatures" sur le profil.
 *
 * Affiche pour chaque niveau (SIMPLE / ADVANCED / NOTARIZED) :
 *  - Consommation du mois (usedThisMonth / includedInPlan)
 *  - Slots restants dans les packs Booster RDD actifs
 *  - CTA "Acheter un Pack" si tout est à zéro
 *
 * Auto-cachée si l'endpoint /me/signature-quota répond 404 (avant migration).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";

type Level = "SIMPLE" | "ADVANCED" | "NOTARIZED";

interface QuotaRow {
  level: Level;
  includedInPlan: number;
  usedThisMonth: number;
  remainingFromPacks: number;
}

interface ActivePack {
  id: string;
  packCode: string;
  advancedIncluded: number;
  advancedUsed: number;
  notarizedIncluded: number;
  notarizedUsed: number;
  expiresAt: string;
}

export function MySignaturesBlock(): JSX.Element | null {
  const t = useT();
  const [quota, setQuota] = useState<QuotaRow[]>([]);
  const [activePacks, setActivePacks] = useState<ActivePack[]>([]);
  const [packCatalog, setPackCatalog] = useState<
    Array<{ code: string; name: string }>
  >([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.getMySignatureQuota(), api.getMyDebtBoosters()])
      .then(([q, b]) => {
        setQuota(q.quota);
        setActivePacks(b.activePacks);
        setPackCatalog(b.catalog.map((p) => ({ code: p.code, name: p.name })));
        setLoaded(true);
      })
      .catch(() => {
        setUnavailable(true);
        setLoaded(true);
      });
  }, []);

  if (unavailable || !loaded) return null;

  // Si l'utilisateur n'a rien (plan FREE sans pack) → cache complètement
  const hasAnyQuota = quota.some(
    (q) =>
      q.includedInPlan !== 0 ||
      q.remainingFromPacks > 0 ||
      q.usedThisMonth > 0,
  );
  if (!hasAnyQuota && activePacks.length === 0) {
    return (
      <div
        style={{
          background: "rgba(43,31,21,0.04)",
          border: "1px dashed rgba(43,31,21,0.18)",
          borderRadius: 12,
          padding: 14,
          marginTop: 14,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#6B5A47",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {t("profile.signatures.eyebrow") || "Mes signatures"}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#2B1F15",
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          {t("profile.signatures.emptyTitle") ||
            "Tu n'as pas encore de signature configurée."}
        </div>
        <Link
          href="/dashboard/plans"
          style={{
            display: "inline-block",
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 999,
            background: "linear-gradient(135deg, #1F7A57, #0F6E56)",
            color: "#FBF6EC",
            textDecoration: "none",
          }}
        >
          {t("profile.signatures.discoverCta") || "Découvrir les packs"}
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(43,31,21,0.12)",
        borderRadius: 12,
        padding: 14,
        marginTop: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#854F0B",
            fontWeight: 700,
          }}
        >
          {t("profile.signatures.eyebrow") || "Mes signatures"}
        </div>
        <Link
          href="/dashboard/plans"
          style={{
            fontSize: 11,
            color: "#854F0B",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {t("profile.signatures.managePacks") || "Gérer →"}
        </Link>
      </div>

      {/* Lignes par niveau */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {quota.map((q) => (
          <QuotaRowDisplay key={q.level} row={q} t={t} />
        ))}
      </div>

      {/* Packs actifs */}
      {activePacks.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid rgba(43,31,21,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#0F6E56",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {t("profile.signatures.activePacks") || "Packs actifs"}
          </div>
          {activePacks.map((p) => {
            const advLeft = p.advancedIncluded - p.advancedUsed;
            const notLeft = p.notarizedIncluded - p.notarizedUsed;
            const expires = new Date(p.expiresAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            const name =
              packCatalog.find((c) => c.code === p.packCode)?.name ?? p.packCode;
            return (
              <div
                key={p.id}
                style={{
                  fontSize: 12,
                  color: "#2B1F15",
                  marginBottom: 4,
                  lineHeight: 1.4,
                }}
              >
                <strong>{name}</strong> ·{" "}
                <span className="bmd-num">{advLeft}</span>{" "}
                {t("profile.signatures.advancedLeft") || "ADVANCED"}
                {p.notarizedIncluded > 0 && (
                  <>
                    {" + "}
                    <span className="bmd-num">{notLeft}</span>{" "}
                    {t("profile.signatures.notarizedLeft") || "NOTARIZED"}
                  </>
                )}{" "}
                <span style={{ color: "#6B5A47", fontStyle: "italic" }}>
                  · {t("profile.signatures.until") || "jusqu'au"} {expires}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuotaRowDisplay({
  row,
  t,
}: {
  row: QuotaRow;
  t: (k: string) => string;
}): JSX.Element {
  const levelLabel =
    row.level === "SIMPLE"
      ? t("profile.signatures.levelSimple") || "Simple"
      : row.level === "ADVANCED"
        ? t("profile.signatures.levelAdvanced") || "Avancé"
        : t("profile.signatures.levelNotarized") || "Notarié";

  const accent =
    row.level === "SIMPLE"
      ? "#2B1F15"
      : row.level === "ADVANCED"
        ? "#854F0B"
        : "#0F6E56";

  const isUnlimited = row.includedInPlan === -1;
  const remainingPlan = isUnlimited
    ? -1
    : Math.max(0, row.includedInPlan - row.usedThisMonth);

  // Status text
  let statusText: string;
  let statusColor = "#2B1F15";
  if (isUnlimited) {
    statusText = t("profile.signatures.unlimited") || "Illimité";
    statusColor = "#0F6E56";
  } else if (row.includedInPlan === 0 && row.remainingFromPacks === 0) {
    statusText =
      t("profile.signatures.notIncluded") || "Non inclus dans ton plan";
    statusColor = "#6B5A47";
  } else if (remainingPlan === 0 && row.remainingFromPacks > 0) {
    statusText =
      (t("profile.signatures.packRemaining") || "{n} dans tes packs").replace(
        "{n}",
        String(row.remainingFromPacks),
      );
    statusColor = "#0F6E56";
  } else if (remainingPlan > 0) {
    statusText = (
      t("profile.signatures.planRemaining") || "{n}/{max} ce mois"
    )
      .replace("{n}", String(remainingPlan))
      .replace("{max}", String(row.includedInPlan));
    statusColor = remainingPlan === 0 ? "#9F4628" : "#2B1F15";
  } else {
    statusText = t("profile.signatures.quotaExhausted") || "Quota épuisé";
    statusColor = "#9F4628";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 4,
            background: accent,
          }}
        />
        <span style={{ fontSize: 13, color: "#2B1F15", fontWeight: 500 }}>
          {levelLabel}
        </span>
      </div>
      <span
        className={!isUnlimited && row.includedInPlan > 0 ? "bmd-num" : ""}
        style={{
          fontSize: 12,
          color: statusColor,
          fontWeight: 600,
        }}
      >
        {statusText}
      </span>
    </div>
  );
}
