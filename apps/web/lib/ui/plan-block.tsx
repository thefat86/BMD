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
import { useBreakpoint } from "../use-breakpoint";
// V52.C3 — SVG remplace EMOJI (icon registry V45)
import { Icon, type IconName } from "./icons";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  priceCentsYearly: number | null;
  description: string | null;
  limits: Record<string, any>;
  isActive: boolean;
}

// V46 · Mapping visuel des plans (incl. legacy alias)
// Les anciens codes PREMIUM/COMMUNITY/PARISH/EVENT héritent du visuel du
// nouveau plan équivalent pour ne pas casser les abonnements actifs.
// V52.C3 — SVG remplace EMOJI : on passe d'emoji string à un IconName du
// registry V45 outline.
const PLAN_VISUALS: Record<
  string,
  { iconName: IconName; gradient: string; text: string }
> = {
  FREE: {
    iconName: "sparkles", // 🌱 → sparkles (pas de leaf au registry)
    gradient:
      "linear-gradient(135deg, rgba(124,110,147,0.15), rgba(124,110,147,0.05))",
    text: "#7c6e93",
  },
  PERSONAL: {
    iconName: "sparkles", // ✨
    gradient:
      "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
    text: "#b54732",
  },
  FAMILY: {
    iconName: "users", // 👨‍👩‍👧
    gradient:
      "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(58,47,91,0.08))",
    text: "#10b981",
  },
  PRO: {
    iconName: "trophy", // 💼 → trophy (sens "pro/premium")
    gradient:
      "linear-gradient(135deg, rgba(68,88,181,0.15), rgba(43,31,21,0.05))",
    text: "#4458b5",
  },
  LIFETIME_PERSONAL: {
    iconName: "sparkles", // ⭐ → sparkles
    gradient:
      "linear-gradient(135deg, rgba(232,163,61,0.25), rgba(91,108,255,0.10))",
    text: "#c58a2e",
  },
  // === Legacy alias (V41 codes) → visuel du nouveau plan équivalent ===
  PREMIUM: {
    iconName: "sparkles", // ✨
    gradient:
      "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
    text: "#b54732",
  },
  COMMUNITY: {
    iconName: "users", // 👨‍👩‍👧
    gradient:
      "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(58,47,91,0.08))",
    text: "#10b981",
  },
  PARISH: {
    iconName: "trophy", // 💼
    gradient:
      "linear-gradient(135deg, rgba(68,88,181,0.15), rgba(43,31,21,0.05))",
    text: "#4458b5",
  },
  EVENT: {
    iconName: "party-popper", // 🎉
    gradient:
      "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
    text: "#b54732",
  },
};

export function PlanBlock() {
  const t = useT();
  const { isMobile } = useBreakpoint();
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

  // === Variante MOBILE : strip compacte (one-screen profile) ===
  // Pattern banking : 1 ligne avec emoji + nom plan + prix + CTA arrow.
  // Tap sur la strip → /dashboard/plans (page comparaison). Si upgrade
  // dispo, on affiche un mini pill saffron en dessous, sinon on garde
  // juste la strip.
  if (isMobile) {
    const isFree = currentCode === "FREE";
    const upgradeTarget = upgradeOptions[0];
    return (
      <Link
        href="/dashboard/plans"
        style={{
          display: "block",
          marginTop: 4,
          marginBottom: 12,
          borderRadius: 18,
          overflow: "hidden",
          background: visual.gradient,
          border: `1px solid ${visual.text}55`,
          textDecoration: "none",
          position: "relative",
          touchAction: "manipulation",
        }}
      >
        {/* Halo bancaire en coin */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -30,
            right: -30,
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${visual.text}25 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* V52.C3 — SVG remplace EMOJI */}
          <div
            aria-hidden
            style={{
              lineHeight: 1,
              flexShrink: 0,
              color: visual.text,
              display: "inline-flex",
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
            }}
          >
            <Icon
              name={visual.iconName}
              size={26}
              color="currentColor"
              strokeWidth={1.6}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                color: "var(--cream-soft)",
                letterSpacing: 1.6,
                textTransform: "uppercase",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              Mon forfait
            </div>
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 18,
                fontWeight: 700,
                color: visual.text,
                lineHeight: 1.2,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {currentPlan?.name ?? currentCode}
            </div>
          </div>
          <div
            style={{
              textAlign: "right",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 2,
            }}
          >
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 18,
                fontWeight: 700,
                color: visual.text,
                lineHeight: 1,
              }}
            >
              {currentPlan && currentPlan.priceCents > 0
                ? `${(currentPlan.priceCents / 100).toFixed(2)} €`
                : "Gratuit"}
            </div>
            {currentPlan && currentPlan.priceCents > 0 && (
              <div
                style={{
                  fontSize: 8.5,
                  color: "var(--cream-soft)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                / mois
              </div>
            )}
          </div>
          <span
            aria-hidden
            style={{
              fontSize: 16,
              color: visual.text,
              opacity: 0.6,
              marginLeft: 2,
              flexShrink: 0,
            }}
          >
            ›
          </span>
        </div>

        {/* Mini pill upgrade subtil sur fond plus sombre — visible mais discret */}
        {upgradeTarget && (
          <div
            style={{
              padding: "8px 14px 10px",
              background: "rgba(14,11,20,0.35)",
              borderTop: `1px solid ${visual.text}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--cream-soft)",
                letterSpacing: 0.3,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {/* V52.C3 — SVG remplace EMOJI (✨) */}
              <Icon
                name="sparkles"
                size={12}
                color="var(--saffron)"
                strokeWidth={1.6}
              />
              <strong style={{ color: "var(--saffron)" }}>{upgradeTarget.name}</strong>
              <span>
                {" "}dès {(upgradeTarget.priceCents / 100).toFixed(2)} €/mois
              </span>
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--saffron)",
                fontWeight: 800,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Upgrade →
            </span>
          </div>
        )}

        {!upgradeTarget && !isFree && (
          <div
            style={{
              padding: "8px 14px 10px",
              background: "rgba(14,11,20,0.35)",
              borderTop: `1px solid ${visual.text}22`,
              fontSize: 10.5,
              color: "var(--cream-soft)",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            {/* V52.C3 — SVG remplace EMOJI (🙏). Pas d'équivalent au registry,
                on supprime l'emoji et on garde le message texte. */}
            Merci de soutenir BMD avec le forfait le plus complet
          </div>
        )}
      </Link>
    );
  }

  // === Variante DESKTOP : layout original (riche, 2 colonnes) ===
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
        {/* V52.C3 — SVG remplace EMOJI */}
        <div
          style={{
            flexShrink: 0,
            display: "inline-flex",
            color: visual.text,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
          }}
          aria-hidden
        >
          <Icon
            name={visual.iconName}
            size={40}
            color="currentColor"
            strokeWidth={1.6}
          />
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

      {/* Limites visibles du plan actuel (desktop only — sur mobile on garde
          le bloc bancaire net sans bullet points qui surchargent) */}
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
              {/* V52.C3 — SVG remplace EMOJI : `iconName` est un IconName du
                  registry V45. Fallback `check` si renvoi inconnu. */}
              <Icon
                name={line.iconName ?? "check"}
                size={12}
                color="currentColor"
                strokeWidth={1.6}
              />
              <span>{line.text}</span>
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
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {/* V52.C3 — SVG remplace EMOJI (✨) */}
            <Icon
              name="sparkles"
              size={13}
              color="var(--saffron)"
              strokeWidth={1.6}
            />
            <strong>{t("plan.unlockMoreFeatures")}</strong>{" "}
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
          {/* V52.C3 — SVG remplace EMOJI (🙏). Pas d'équivalent au registry,
              on supprime l'emoji et on garde le message texte. */}
          Tu profites du forfait le plus complet de BMD. Merci de ton soutien.
        </p>
      )}
    </div>
  );
}

// V52.C3 — SVG remplace EMOJI : on retourne désormais un IconName du registry
// V45 outline plutôt qu'un emoji string. Le rendu <Icon /> se fait côté JSX.
function renderLimits(
  limits: Record<string, any>,
  t: (key: any, vars?: Record<string, string>) => string,
): Array<{ iconName: IconName | null; text: string }> {
  const out: Array<{ iconName: IconName | null; text: string }> = [];
  if (typeof limits.maxGroups === "number") {
    out.push({
      iconName: "users", // 👥
      text:
        limits.maxGroups === -1
          ? t("plan.limit.groupsUnl")
          : t("plan.limit.groupsCount", { n: String(limits.maxGroups) }),
    });
  }
  if (typeof limits.maxMembersPerGroup === "number") {
    out.push({
      iconName: "user", // 👤
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
      iconName: "camera", // 📷
      text:
        limits.ocrPerMonth === -1
          ? t("plan.limit.ocrUnl")
          : t("plan.limit.ocrCount", { n: String(limits.ocrPerMonth) }),
    });
  }
  if (limits.debtSwap)
    out.push({ iconName: "repeat", text: t("plan.limit.debtSwap") }); // ↔️
  if (limits.multiCurrency)
    out.push({ iconName: "repeat", text: t("plan.limit.multiCurrency") }); // 💱
  if (limits.exportPdfExcel)
    out.push({ iconName: "file-text", text: t("plan.limit.exportPdfExcel") }); // 📄
  if (limits.whatsappBot)
    out.push({ iconName: "mail", text: t("plan.limit.whatsappBot") }); // 💬 → mail (pas de chat-bubble au registry)
  if (limits.taxReceipts)
    out.push({ iconName: "receipt", text: t("plan.limit.taxReceipts") }); // 🧾
  if (limits.twoFactor)
    out.push({ iconName: "lock", text: t("plan.limit.twoFactor") }); // 🔐
  if (limits.adminDashboard)
    out.push({ iconName: "bar-chart-2", text: t("plan.limit.adminDashboard") }); // 📊
  if (limits.adsEnabled === false)
    out.push({ iconName: "shield", text: t("plan.limit.adFree") }); // 🚫 → shield (anti-ads)
  return out.slice(0, 8);
}
