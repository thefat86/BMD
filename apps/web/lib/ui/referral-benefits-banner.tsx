"use client";

/**
 * V164.H5 — Bandeau dynamique des avantages parrain.
 *
 * Affiche UNIQUEMENT les mécaniques activées par l'admin via
 * ReferralBenefitConfig. Les 5 mécaniques A-E :
 *   A. Mois gratuit cumulable
 *   B. Crédits IA bonus
 *   C. Réduction renouvellement
 *   D. Système de points
 *   E. Badges sociaux (bronze/argent/or/platine)
 *
 * Réutilisable web + mobile (responsive via prop `compact`).
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";

interface Props {
  /** Mode mobile (tiles 2×2 au lieu de grille horizontale). */
  compact?: boolean;
}

export function ReferralBenefitsBanner({ compact = false }: Props): JSX.Element | null {
  const t = useT();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.getReferralBenefits>
  > | null>(null);

  useEffect(() => {
    api
      .getReferralBenefits()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const anyEnabled =
    data.enabled.freeMonths ||
    data.enabled.aiCredits ||
    data.enabled.discount ||
    data.enabled.points ||
    data.enabled.badges;
  if (!anyEnabled) return null;

  // Liste de tiles à afficher (1 par mécanique activée)
  const tiles: Array<{ key: string; icon: string; label: string; value: string; hint?: string }> = [];

  if (data.enabled.freeMonths) {
    tiles.push({
      key: "freeMonths",
      icon: "🎁",
      label: t("referralBenefits.freeMonths.label") || "Mois gratuits",
      value: `${data.earned.freeMonths} / ${data.earned.freeMonthsCap}`,
      hint: t("referralBenefits.freeMonths.hint", {
        n: String(data.perReferral.freeMonths),
      }) || `+${data.perReferral.freeMonths} par filleul payant`,
    });
  }
  if (data.enabled.aiCredits) {
    tiles.push({
      key: "ai",
      icon: "✨",
      label: t("referralBenefits.aiCredits.label") || "Crédits IA",
      value: `${data.earned.ocrCredits} OCR · ${data.earned.voiceCredits} voice`,
      hint: t("referralBenefits.aiCredits.hint", {
        ocr: String(data.perReferral.ocr),
        voice: String(data.perReferral.voice),
      }) || `+${data.perReferral.ocr} OCR & +${data.perReferral.voice} voice par filleul`,
    });
  }
  if (data.enabled.discount) {
    tiles.push({
      key: "discount",
      icon: "💸",
      label: t("referralBenefits.discount.label") || "Réduction renouvellement",
      value: `-${data.earned.discountPercent}%`,
      hint: t("referralBenefits.discount.hint", {
        p: String(data.perReferral.discountPercent),
      }) || `-${data.perReferral.discountPercent}% par filleul (max -100%)`,
    });
  }
  if (data.enabled.points) {
    tiles.push({
      key: "points",
      icon: "⭐",
      label: t("referralBenefits.points.label") || "Points BMD",
      value: `${data.earned.points} pts`,
      hint: t("referralBenefits.points.hint", {
        paid: String(data.perReferral.pointsPaid),
        free: String(data.perReferral.pointsFree),
      }) || `+${data.perReferral.pointsPaid} par payant, +${data.perReferral.pointsFree} par gratuit`,
    });
  }
  if (data.enabled.badges) {
    const badgeLabels: Record<string, string> = {
      NONE: t("referralBenefits.badges.none") || "Aucun (encore)",
      BRONZE: "Bronze 🥉",
      SILVER: "Argent 🥈",
      GOLD: "Or 🥇",
      PLATINUM: "Platine 💎",
    };
    const next =
      data.earned.badge === "NONE"
        ? data.badgeThresholds.bronze
        : data.earned.badge === "BRONZE"
          ? data.badgeThresholds.silver
          : data.earned.badge === "SILVER"
            ? data.badgeThresholds.gold
            : data.earned.badge === "GOLD"
              ? data.badgeThresholds.platinum
              : null;
    const remaining = next !== null ? Math.max(0, next - data.stats.paidReferrals) : 0;
    tiles.push({
      key: "badge",
      icon: "🏆",
      label: t("referralBenefits.badges.label") || "Badge",
      value: badgeLabels[data.earned.badge] ?? "—",
      hint: next === null
        ? t("referralBenefits.badges.maxed") || "Niveau max atteint !"
        : t("referralBenefits.badges.next", { n: String(remaining) }) || `Encore ${remaining} payants pour le niveau suivant`,
    });
  }

  return (
    <section
      style={{
        padding: compact ? 14 : 18,
        marginBottom: 16,
        background:
          "linear-gradient(135deg, var(--paper, #FBF6EC) 0%, var(--v45-saffron-pale, #F6E8C5) 100%)",
        border: "1px solid var(--v45-saffron-line, rgba(197,138,46,0.30))",
        borderRadius: 14,
      }}
    >
      <header style={{ marginBottom: compact ? 10 : 14 }}>
        <h3
          style={{
            margin: "0 0 4px",
            fontSize: compact ? 13 : 15,
            fontWeight: 700,
            color: "var(--v45-saffron-strong, #854F0B)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          🎉 {t("referralBenefits.title") || "Tes avantages parrain"}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: compact ? 11 : 12,
            color: "var(--cocoa-soft, #6B5942)",
          }}
        >
          {t("referralBenefits.subtitle", {
            paid: String(data.stats.paidReferrals),
            total: String(data.stats.totalReferrals),
          }) ||
            `${data.stats.paidReferrals} filleul(s) payant(s) · ${data.stats.totalReferrals} au total`}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact
            ? "1fr 1fr"
            : `repeat(${Math.min(tiles.length, 5)}, 1fr)`,
          gap: compact ? 8 : 10,
        }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.key}
            style={{
              padding: compact ? 10 : 12,
              borderRadius: 10,
              background: "var(--paper, #FBF6EC)",
              border: "1px solid var(--cocoa-line, rgba(43,31,21,0.08))",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: compact ? 16 : 20, marginBottom: 4 }}>{tile.icon}</div>
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                color: "var(--cocoa-soft, #6B5942)",
                fontWeight: 700,
                marginBottom: 2,
              }}
            >
              {tile.label}
            </div>
            <div
              style={{
                fontSize: compact ? 16 : 18,
                fontWeight: 700,
                fontFamily: "Cormorant Garamond, serif",
                color: "var(--cocoa, #2B1F15)",
                lineHeight: 1.1,
              }}
            >
              {tile.value}
            </div>
            {tile.hint && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--cocoa-soft, #6B5942)",
                  marginTop: 4,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {tile.hint}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
