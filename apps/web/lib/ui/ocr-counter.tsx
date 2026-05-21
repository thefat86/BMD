"use client";

/**
 * <OcrCounter> · Compteur visible des scans IA mensuels (spec AB).
 *
 * Affiche en permanence à l'utilisateur où il en est de son quota mensuel,
 * pour générer une vraie envie d'upgrade (visible et progressive) plutôt
 * qu'un blocage abrupt au moment où il en a besoin.
 *
 * Comportement :
 *  - Plan illimité → affiche "✓ Scans illimités" en doré (badge premium)
 *  - Plan FREE :
 *    - 0..2/5 utilisés → badge calme : "2/5 scans IA"
 *    - 3..4/5 utilisés → badge attention : "4/5 scans IA · Premium illimité"
 *    - 5/5 utilisés    → badge alerte rouge : "5/5 atteint · Upgrade →"
 *  - Plan FREE + au moins 1 groupe avec admin payant → message rassurant :
 *    "5/5 perso · scans illimités dans tes groupes payants"
 *
 * Variantes :
 *  - `variant="badge"` : compact (header dashboard)
 *  - `variant="card"` : full (formulaire de scan, mode mise en avant)
 *
 * Le composant fetch /me/ocr-usage à chaque montage et expose un
 * callback onUpgradeClick pour ouvrir le modal d'upgrade (CTA contextuel
 * fait son effet quand l'user touche le mur).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
// V52.C3 — SVG remplace EMOJI (icon registry V45)
import { Icon } from "./icons";

interface OcrUsage {
  used: number;
  max: number;
  resetsAt: string;
  planCode: string;
  hasPaidGroup: boolean;
  trialEligible: boolean;
  trialActive: boolean;
  trialEndsAt: string | null;
}

interface Props {
  variant?: "badge" | "card";
  /** Forcer un rafraîchissement après un scan réussi (incrémente refreshKey) */
  refreshKey?: number;
}

export function OcrCounter({ variant = "badge", refreshKey }: Props): JSX.Element | null {
  const t = useT();
  const [usage, setUsage] = useState<OcrUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [activatingTrial, setActivatingTrial] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getOcrUsage()
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        /* silencieux : le compteur n'est pas critique pour l'app */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /**
   * Sprint AB · Active le trial 14 jours Premium. One-shot par user.
   * Au succès, on rafraîchit l'usage : le badge passe à "Scans IA illimités"
   * en doré et l'user peut scanner sans limite pendant 14 jours.
   */
  async function activateTrial() {
    if (!usage?.trialEligible || activatingTrial) return;
    setActivatingTrial(true);
    setTrialError(null);
    try {
      await api.startPremiumTrial();
      const fresh = await api.getOcrUsage();
      setUsage(fresh);
    } catch (e: any) {
      setTrialError(e?.message ?? t("ocrCounter.trialError"));
    } finally {
      setActivatingTrial(false);
    }
  }

  if (loading || !usage) return null;

  // Plan illimité : badge doré (réjouissant, pas un nag).
  // Si trial actif, on indique le nombre de jours restants pour créer l'urgence
  // de upgrade avant l'expiration.
  if (usage.max === -1) {
    const daysLeft = usage.trialActive && usage.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(usage.trialEndsAt).getTime() - Date.now()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : null;
    const label =
      daysLeft !== null
        ? t("ocrCounter.trialActive", { days: String(daysLeft) })
        : t("ocrCounter.unlimited");
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
          title={t("ocrCounter.unlimitedTooltip")}
        >
          {/* V52.C3 — SVG remplace EMOJI (✨) */}
          <Icon
            name="sparkles"
            size={12}
            color="currentColor"
            strokeWidth={1.6}
          />
          <span>{label}</span>
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
        {/* V52.C3 — SVG remplace EMOJI (✨) */}
        <strong
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Icon
            name="sparkles"
            size={14}
            color="currentColor"
            strokeWidth={1.6}
          />
          <span>{label}</span>
        </strong>
        {daysLeft !== null && daysLeft <= 5 && (
          <Link
            href="/dashboard/plans"
            style={{
              fontSize: 11,
              color: "var(--saffron, #E8A33D)",
              textDecoration: "underline",
              marginTop: 4,
            }}
          >
            {t("ocrCounter.trialExpiringSoonCta")} →
          </Link>
        )}
      </div>
    );
  }

  // Plan limité : compute couleur et message selon où on en est
  const used = usage.used;
  const max = usage.max;
  const remaining = Math.max(0, max - used);
  const isOver = used >= max;
  const isNear = remaining <= 1; // 4/5 ou 5/5

  const tone = isOver ? "danger" : isNear ? "warn" : "calm";
  const colors = {
    calm: { fg: "var(--cream-soft, #d4c4a8)", bg: "rgba(244,228,193,0.06)", border: "rgba(244,228,193,0.15)" },
    warn: { fg: "var(--saffron, #E8A33D)", bg: "rgba(232,163,61,0.10)", border: "rgba(232,163,61,0.30)" },
    danger: { fg: "var(--rose, #ef4444)", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.30)" },
  }[tone];

  const label = isOver
    ? usage.hasPaidGroup
      ? t("ocrCounter.exhaustedButPaidGroup", { used: String(used), max: String(max) })
      : t("ocrCounter.exhausted", { used: String(used), max: String(max) })
    : t("ocrCounter.usage", { used: String(used), max: String(max) });

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
            ? t("ocrCounter.upgradeTooltip")
            : t("ocrCounter.usageTooltip", { remaining: String(remaining) })
        }
      >
        {/* V52.C3 — SVG remplace EMOJI (📷) */}
        <Icon
          name="camera"
          size={12}
          color="currentColor"
          strokeWidth={1.6}
        />
        <span>{label}</span>
        {isNear && <> · {t("ocrCounter.upgradeCta")} →</>}
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* V52.C3 — SVG remplace EMOJI (📷) */}
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon
            name="camera"
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
              color: "var(--saffron, #E8A33D)",
              textDecoration: "none",
              padding: "4px 10px",
              border: "1px solid var(--saffron, #E8A33D)",
              borderRadius: 999,
            }}
          >
            {t("ocrCounter.upgradeCta")} →
          </Link>
        )}
      </div>
      {/* Barre de progression visible */}
      <div
        style={{
          height: 6,
          background: "rgba(0,0,0,0.25)",
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
      {/* Sous-texte explicatif (rassurant si paid group) */}
      {isOver && usage.hasPaidGroup && (
        <small style={{ fontSize: 11, color: "var(--cream-soft, #d4c4a8)", lineHeight: 1.4 }}>
          {t("ocrCounter.paidGroupHint")}
        </small>
      )}
      {!isOver && (
        <small style={{ fontSize: 11, color: "var(--muted, #8A7B6B)", lineHeight: 1.4 }}>
          {t("ocrCounter.resetHint")}
        </small>
      )}

      {/* Sprint AB · Banner de trial 14 jours Premium au 4e ou 5e scan.
          Apparaît dès qu'on est près du mur (4/5 ou 5/5) ET que l'user n'a
          jamais utilisé son trial. C'est le déclencheur de conversion : on
          offre 14 jours gratuits PILE au moment où la frustration commence. */}
      {isNear && usage.trialEligible && (
        <div
          style={{
            marginTop: 6,
            padding: "10px 12px",
            background:
              "linear-gradient(135deg, rgba(201,162,74,0.18), rgba(232,163,61,0.10))",
            border: "1px solid rgba(201,162,74,0.45)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--gold, #C9A24A)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {/* V52.C3 — SVG remplace EMOJI (🎁) */}
            <Icon
              name="gift"
              size={14}
              color="currentColor"
              strokeWidth={1.6}
            />
            <span>{t("ocrCounter.trialBannerTitle")}</span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--cream-soft, #d4c4a8)",
              lineHeight: 1.45,
            }}
          >
            {t("ocrCounter.trialBannerBody")}
          </div>
          {trialError && (
            <div
              style={{
                fontSize: 11,
                color: "var(--rose, #ef4444)",
                lineHeight: 1.4,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {/* V52.C3 — SVG remplace EMOJI (⚠) */}
              <Icon
                name="alert-triangle"
                size={12}
                color="currentColor"
                strokeWidth={1.6}
              />
              <span>{trialError}</span>
            </div>
          )}
          <button
            type="button"
            onClick={activateTrial}
            disabled={activatingTrial}
            style={{
              padding: "8px 12px",
              background:
                "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))",
              color: "#16111E",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: activatingTrial ? "not-allowed" : "pointer",
              opacity: activatingTrial ? 0.6 : 1,
              alignSelf: "flex-start",
              fontFamily: "inherit",
            }}
          >
            {activatingTrial
              ? t("ocrCounter.trialActivating")
              : t("ocrCounter.trialCta")}
          </button>
        </div>
      )}
    </div>
  );
}
