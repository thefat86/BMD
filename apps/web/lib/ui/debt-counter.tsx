"use client";

/**
 * V169 — <DebtCounter> · Compteur visible des reconnaissances de dette mensuelles.
 *
 * Même esprit que <OcrCounter> pour les scans IA : on affiche en permanence
 * où le user en est de son quota mensuel pour générer une envie d'upgrade
 * visible et progressive plutôt qu'un blocage abrupt au moment où il veut
 * créer sa 2e RDD.
 *
 * Comportement :
 *  - Plan illimité (PERSO/FAMILY/PRO/LIFETIME) → badge doré « RDD illimitées »
 *  - Plan FREE (1 RDD/mois) :
 *    - 0/1 → badge calme « 0/1 reconnaissance · ce mois »
 *    - 1/1 → badge alerte rouge « 1/1 atteint · Upgrade →»
 *  - Plan legacy 0/mois → badge red « Plan ne permet pas · Upgrade »
 *
 * Variantes :
 *  - `variant="badge"` : compact (header hub debts)
 *  - `variant="card"` : full avec barre de progression (hub + wizard)
 *
 * Pour info contextuelle, on indique aussi les signatures incluses
 * (« 2 signatures simples / mois incluses ») histoire que l'user voie ce
 * qu'il y a au-delà de simplement créer un DRAFT.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";

interface DebtsUsage {
  used: number;
  max: number;
  resetsAt: string;
  planCode: string;
  signaturesSimpleIncluded: number;
  signaturesAdvancedIncluded: number;
}

interface Props {
  variant?: "badge" | "card";
  /** Forcer un rafraîchissement après une RDD créée (parent incrémente) */
  refreshKey?: number;
}

export function DebtCounter({
  variant = "badge",
  refreshKey,
}: Props): JSX.Element | null {
  const t = useT();
  const [usage, setUsage] = useState<DebtsUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // V170.A — Garde anti-crash si le bundle a un api-client obsolète
    // (HMR cache, Capacitor offline build, etc.). On bypass complètement
    // au lieu de planter la page entière.
    if (typeof (api as any).getDebtsUsage !== "function") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      (api as any)
        .getDebtsUsage()
        .then((u: DebtsUsage) => {
          if (!cancelled) setUsage(u);
        })
        .catch(() => {
          /* silencieux : le compteur n'est pas critique pour l'app */
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } catch {
      // Sync throw (très improbable) — on ne plante pas la page
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading || !usage) return null;

  // ============================================================
  // Cas 1 : Plan illimité → badge doré (réjouissant, pas un nag).
  // ============================================================
  if (usage.max === -1) {
    const sigLabel = describeSignatures(usage, t);
    if (variant === "badge") {
      return (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--gold, #C9A24A)",
            background: "rgba(201,162,74,0.12)",
            border: "1px solid rgba(201,162,74,0.3)",
            padding: "3px 8px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
          title={sigLabel}
        >
          <Icon name="sparkles" size={12} color="currentColor" strokeWidth={1.6} />
          <span>{t("debtCounter.unlimited") || "RDD illimitées"}</span>
        </span>
      );
    }
    return (
      <div
        style={{
          padding: "10px 12px",
          background: "rgba(201,162,74,0.08)",
          border: "1px solid rgba(201,162,74,0.25)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--gold, #C9A24A)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="sparkles" size={14} color="currentColor" strokeWidth={1.6} />
          <span>{t("debtCounter.unlimited") || "RDD illimitées"}</span>
        </strong>
        {sigLabel && (
          <small style={{ fontSize: 11, color: "var(--cocoa-soft, #6B5942)", lineHeight: 1.4 }}>
            {sigLabel}
          </small>
        )}
      </div>
    );
  }

  // ============================================================
  // Cas 2 : Plan limité (FREE = 1/mois, legacy = 0/mois)
  // ============================================================
  const used = usage.used;
  const max = usage.max;
  const remaining = Math.max(0, max - used);
  const isOver = used >= max;
  // FREE : 1 RDD/mois donc isNear ≡ isOver. On garde la sémantique pour
  // l'évolutivité (si on passe à 2/mois plus tard).
  const isNear = max > 0 && remaining <= 1;

  const tone = isOver ? "danger" : isNear ? "warn" : "calm";
  const colors = {
    calm: {
      fg: "var(--cocoa, #2B1F15)",
      bg: "rgba(43,31,21,0.04)",
      border: "rgba(43,31,21,0.15)",
    },
    warn: {
      fg: "var(--v45-saffron-strong, #854F0B)",
      bg: "rgba(197,138,46,0.10)",
      border: "rgba(197,138,46,0.30)",
    },
    danger: {
      fg: "var(--v45-terracotta, #9F4628)",
      bg: "rgba(159,70,40,0.10)",
      border: "rgba(159,70,40,0.30)",
    },
  }[tone];

  // Cas spécial : max=0 (legacy, plan ne permet aucune RDD)
  if (max === 0) {
    if (variant === "badge") {
      return (
        <Link
          href="/dashboard/plans"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: colors.fg,
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            padding: "3px 8px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icon
            name="file-text"
            size={12}
            color="currentColor"
            strokeWidth={1.6}
          />
          <span>{t("debtCounter.blocked") || "RDD bloquées · Upgrade"} →</span>
        </Link>
      );
    }
    return (
      <div
        style={{
          padding: "12px 14px",
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          fontSize: 13,
          color: colors.fg,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon
            name="file-text"
            size={14}
            color="currentColor"
            strokeWidth={1.6}
          />
          <span>
            {t("debtCounter.blockedTitle") || "Reconnaissances de dette bloquées"}
          </span>
        </strong>
        <small style={{ fontSize: 11.5, color: "var(--cocoa-soft, #6B5942)", lineHeight: 1.45 }}>
          {t("debtCounter.blockedHint") ||
            "Active un plan payant pour créer ta première reconnaissance de dette."}
        </small>
        <Link
          href="/dashboard/plans"
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
            fontWeight: 700,
            color: "#FBF6EC",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
            padding: "8px 14px",
            borderRadius: 999,
            textDecoration: "none",
            marginTop: 4,
          }}
        >
          {t("debtCounter.upgradeCta") || "Voir les plans"} →
        </Link>
      </div>
    );
  }

  const label = isOver
    ? t("debtCounter.exhausted", { used: String(used), max: String(max) }) ||
      `${used}/${max} reconnaissance(s) · épuisé ce mois`
    : t("debtCounter.usage", { used: String(used), max: String(max) }) ||
      `${used}/${max} reconnaissance(s) ce mois`;

  if (variant === "badge") {
    return (
      <Link
        href="/dashboard/plans"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: colors.fg,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          padding: "3px 8px",
          borderRadius: 999,
          whiteSpace: "nowrap",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
        title={
          isOver
            ? t("debtCounter.upgradeTooltip") ||
              "Tu as atteint ta limite mensuelle. Upgrade pour en créer plus."
            : t("debtCounter.usageTooltip", { remaining: String(remaining) }) ||
              `Il te reste ${remaining} reconnaissance(s) ce mois.`
        }
      >
        <Icon name="file-text" size={12} color="currentColor" strokeWidth={1.6} />
        <span>{label}</span>
        {isNear && (
          <> · {t("debtCounter.upgradeCta") || "Upgrade"} →</>
        )}
      </Link>
    );
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        fontSize: 13,
        color: colors.fg,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon
            name="file-text"
            size={14}
            color="currentColor"
            strokeWidth={1.6}
          />
          <span>{label}</span>
        </strong>
        {isNear && (
          <Link
            href="/dashboard/plans"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--v45-saffron-strong, #854F0B)",
              textDecoration: "none",
              padding: "4px 10px",
              border: "1px solid var(--v45-saffron, #C58A2E)",
              borderRadius: 999,
            }}
          >
            {t("debtCounter.upgradeCta") || "Upgrade"} →
          </Link>
        )}
      </div>
      {/* Barre de progression */}
      <div
        style={{
          height: 6,
          background: "rgba(0,0,0,0.08)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, (used / max) * 100)}%`,
            background: colors.fg,
            transition: "width 250ms ease",
            borderRadius: 999,
          }}
        />
      </div>
      {/* Sous-texte : signatures incluses ou reset hint */}
      {!isOver && (
        <small
          style={{
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5942)",
            lineHeight: 1.4,
          }}
        >
          {t("debtCounter.resetHint") ||
            "Quota remis à zéro le 1er du mois prochain."}
          {describeSignatures(usage, t) ? (
            <> · {describeSignatures(usage, t)}</>
          ) : null}
        </small>
      )}
      {isOver && (
        <small
          style={{
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5942)",
            lineHeight: 1.4,
          }}
        >
          {t("debtCounter.exhaustedHint") ||
            "Passe à PERSO pour créer des reconnaissances illimitées + 2 signatures simples incluses chaque mois."}
        </small>
      )}
    </div>
  );
}

/**
 * Construit un sous-titre type « 2 signatures simples incluses / mois »
 * selon les quotas signatures du plan. Retourne null si rien à dire.
 */
function describeSignatures(u: DebtsUsage, t: (k: string, p?: any) => string): string | null {
  const parts: string[] = [];
  if (u.signaturesSimpleIncluded === -1) {
    parts.push(
      t("debtCounter.signaturesUnlimitedSimple") || "Signatures simples illimitées",
    );
  } else if (u.signaturesSimpleIncluded > 0) {
    parts.push(
      t("debtCounter.signaturesSimple", {
        n: String(u.signaturesSimpleIncluded),
      }) || `${u.signaturesSimpleIncluded} signature(s) simple(s) incluses`,
    );
  }
  if (u.signaturesAdvancedIncluded === -1) {
    parts.push(
      t("debtCounter.signaturesUnlimitedAdvanced") || "Signatures avancées illimitées",
    );
  } else if (u.signaturesAdvancedIncluded > 0) {
    parts.push(
      t("debtCounter.signaturesAdvanced", {
        n: String(u.signaturesAdvancedIncluded),
      }) || `${u.signaturesAdvancedIncluded} signature(s) avancée(s)`,
    );
  }
  if (!parts.length) return null;
  return parts.join(" · ");
}
