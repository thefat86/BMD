"use client";

/**
 * <PlanBlock> · Affichage du forfait actuel + upgrade (spec §6.3).
 *
 * Bloc visible dans le profil qui montre :
 *  - Le plan en cours (Découverte / Premium / Communauté)
 *  - Les avantages du plan
 *  - Un bouton « Passer à PREMIUM » qui ouvre une page de comparaison
 *
 * Les détails du plan sont fetched depuis /admin/plans (route public-friendly :
 *  on l'expose en lecture libre car les plans tarifaires sont publics).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api-client";
import { ApiErrorAlert } from "./api-error-alert";
import { useT } from "../i18n/app-strings";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  priceCentsYearly: number | null;
  description: string | null;
  limits: Record<string, any>;
  isActive: boolean;
}

const PLAN_VISUALS: Record<string, { emoji: string; gradient: string; text: string }> =
  {
    FREE: {
      emoji: "🌱",
      gradient: "linear-gradient(135deg, rgba(124,110,147,0.15), rgba(124,110,147,0.05))",
      text: "#7c6e93",
    },
    PREMIUM: {
      emoji: "✨",
      gradient: "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
      text: "#b54732",
    },
    COMMUNITY: {
      emoji: "🤝",
      gradient: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(58,47,91,0.08))",
      text: "#10b981",
    },
  };

export function PlanBlock() {
  const t = useT();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      api.listPlans().catch(() => null),
      api.me(),
    ])
      .then(([res, meRes]) => {
        setMe(meRes.user);
        setPlans((res?.plans as Plan[]) ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e);
        setLoading(false);
      });
  }, []);

  if (loading || !me) return null;

  const currentCode = me.planCode ?? "FREE";
  const visual = PLAN_VISUALS[currentCode] ?? PLAN_VISUALS.FREE!;
  const currentPlan = plans.find((p) => p.code === currentCode);
  const upgradeOptions = plans
    .filter((p) => p.code !== currentCode && p.priceCents > (currentPlan?.priceCents ?? 0))
    .sort((a, b) => a.priceCents - b.priceCents);

  return (
    <div
      className="card"
      style={{
        marginTop: 20,
        background: visual.gradient,
        border: `1px solid ${visual.text}33`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 40,
            flexShrink: 0,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
          }}
        >
          {visual.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--cream-soft)",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            Mon forfait
          </div>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 24,
              fontWeight: 700,
              color: visual.text,
              lineHeight: 1.1,
            }}
          >
            {currentPlan?.name ?? currentCode}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--cream-soft)",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {currentPlan?.description ??
              (currentCode === "FREE"
                ? "Idéal pour démarrer — fonctionnalités essentielles incluses"
                : "Tout illimité, sans publicité")}
          </div>
          {currentPlan && currentPlan.priceCents > 0 && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: visual.text,
                fontWeight: 600,
              }}
            >
              {(currentPlan.priceCents / 100).toFixed(2)} €/mois
              {currentPlan.priceCentsYearly &&
                ` · ${(currentPlan.priceCentsYearly / 100).toFixed(0)} €/an`}
            </div>
          )}
        </div>
      </div>

      {/* Limites visibles du plan actuel */}
      {currentPlan?.limits && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "8px 0 12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          {renderLimits(currentPlan.limits, t).map((line, i) => (
            <li
              key={i}
              style={{
                fontSize: 11,
                color: "var(--cream-soft)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {line.icon} {line.text}
            </li>
          ))}
        </ul>
      )}

      {/* CTA upgrade */}
      {upgradeOptions.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            background: "rgba(232,163,61,0.08)",
            border: "1px dashed var(--saffron)",
            borderRadius: 10,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--cream)",
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            ✨ <strong>{t("plan.unlockMoreFeatures")}</strong>{" "}
            {t("plan.upgradeCallout")}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {upgradeOptions.map((p) => (
              <Link
                key={p.code}
                href={`/dashboard/plans?upgrade=${p.code}`}
                className="btn btn-sm"
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                Passer en {p.name} →
              </Link>
            ))}
            <Link
              href="/dashboard/plans"
              style={{
                padding: "6px 14px",
                fontSize: 12,
                textDecoration: "none",
                color: "var(--cream-soft)",
                border: "1px solid rgba(244,228,193,0.15)",
                borderRadius: 8,
              }}
            >
              Comparer tous les forfaits
            </Link>
          </div>
        </div>
      )}

      {currentCode !== "FREE" && upgradeOptions.length === 0 && (
        <p
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            margin: "8px 0 0",
            fontStyle: "italic",
          }}
        >
          Tu profites du forfait le plus complet de BMD. Merci de ton soutien 🙏
        </p>
      )}
    </div>
  );
}

function renderLimits(
  limits: Record<string, any>,
  t: (key: any, vars?: Record<string, string>) => string,
) {
  const out: Array<{ icon: string; text: string }> = [];
  if (typeof limits.maxGroups === "number") {
    out.push({
      icon: "👥",
      text:
        limits.maxGroups === -1
          ? t("plan.limit.groupsUnl")
          : t("plan.limit.groupsCount", { n: String(limits.maxGroups) }),
    });
  }
  if (typeof limits.maxMembersPerGroup === "number") {
    out.push({
      icon: "👤",
      text:
        limits.maxMembersPerGroup === -1
          ? t("plan.limit.membersUnl")
          : t("plan.limit.membersCount", {
              n: String(limits.maxMembersPerGroup),
            }),
    });
  }
  if (typeof limits.ocrPerMonth === "number") {
    out.push({
      icon: "📷",
      text:
        limits.ocrPerMonth === -1
          ? t("plan.limit.ocrUnl")
          : t("plan.limit.ocrCount", { n: String(limits.ocrPerMonth) }),
    });
  }
  if (limits.debtSwap) out.push({ icon: "↔️", text: t("plan.limit.debtSwap") });
  if (limits.multiCurrency)
    out.push({ icon: "💱", text: t("plan.limit.multiCurrency") });
  if (limits.exportPdfExcel)
    out.push({ icon: "📄", text: t("plan.limit.exportPdfExcel") });
  if (limits.whatsappBot)
    out.push({ icon: "💬", text: t("plan.limit.whatsappBot") });
  if (limits.taxReceipts)
    out.push({ icon: "🧾", text: t("plan.limit.taxReceipts") });
  if (limits.twoFactor)
    out.push({ icon: "🔐", text: t("plan.limit.twoFactor") });
  if (limits.adminDashboard)
    out.push({ icon: "📊", text: t("plan.limit.adminDashboard") });
  if (limits.adsEnabled === false)
    out.push({ icon: "🚫", text: t("plan.limit.adFree") });
  return out.slice(0, 8);
}
