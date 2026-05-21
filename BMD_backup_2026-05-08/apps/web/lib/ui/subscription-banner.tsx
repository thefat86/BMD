"use client";

/**
 * <SubscriptionBanner> · Bandeau d'état d'abonnement (spec §6.3).
 *
 * Affiche un bandeau contextuel selon SubscriptionState :
 *   ACTIVE     → rien (silencieux)
 *   GRACE      → bandeau jaune "Ton paiement a échoué — réessaye dans X jours"
 *   WARN       → bandeau orange "Ta surcapacité passera en lecture seule
 *                dans X jours" + compteur
 *   DOWNGRADED → bandeau rouge "Tu as N groupes verrouillés — passe en
 *                Premium ou libère une slot" + CTA upgrade
 *   CANCELLED  → bandeau neutre "Abonnement annulé — réactive à tout moment"
 *
 * Cliquable → /dashboard/plans pour upgrade direct.
 *
 * Affiché TOUT EN HAUT du contenu de l'app (juste après le shell), avant
 * le hero balance — c'est important que l'utilisateur le voie en premier.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";

interface SubInfo {
  status: string;
  expiresAt: string | null;
  graceEndsAt: string | null;
  readOnlyAt: string | null;
  daysUntilWarn: number | null;
  daysUntilReadOnly: number | null;
  lockedGroupCount: number;
}

export function SubscriptionBanner(): JSX.Element | null {
  const t = useT();
  const [info, setInfo] = useState<SubInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSubscriptionInfo()
      .then((r) => {
        if (!cancelled) setInfo(r);
      })
      .catch(() => {
        /* échec silencieux : si la route n'existe pas, on ne montre rien */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;
  if (info.status === "ACTIVE") return null;

  // Détermine le visuel selon l'état
  const config = getVisualForStatus(info, t);
  if (!config) return null;

  return (
    <Link
      href="/dashboard/plans"
      style={{
        display: "block",
        textDecoration: "none",
        margin: "0 0 16px",
      }}
    >
      <div
        style={{
          background: config.background,
          border: `1px solid ${config.border}`,
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: config.text,
        }}
      >
        <div
          aria-hidden
          style={{
            fontSize: 22,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {config.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              marginBottom: 2,
            }}
          >
            {config.title}
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.85,
              lineHeight: 1.4,
            }}
          >
            {config.message}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: config.cta,
            fontWeight: 700,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {config.ctaLabel} →
        </div>
      </div>
    </Link>
  );
}

function getVisualForStatus(
  info: SubInfo,
  t: ReturnType<typeof useT>
): {
  icon: string;
  title: string;
  message: string;
  background: string;
  border: string;
  text: string;
  cta: string;
  ctaLabel: string;
} | null {
  switch (info.status) {
    case "GRACE":
      return {
        icon: "⏰",
        title: "Paiement en attente",
        message: t("subscription.gracePeriod", {
          date:
            info.graceEndsAt ?
              new Date(info.graceEndsAt).toLocaleDateString("fr-FR")
            : "",
        }),
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.16), rgba(201,162,74,0.10))",
        border: "rgba(232,163,61,0.40)",
        text: "var(--cream, #f4e4c1)",
        cta: "var(--saffron, #e8a33d)",
        ctaLabel: "Mettre à jour",
      };
    case "WARN":
      return {
        icon: "⚠️",
        title: "Bascule en lecture seule imminente",
        message: t("subscription.warnSoon", {
          days: String(info.daysUntilReadOnly ?? 0),
        }),
        background:
          "linear-gradient(135deg, rgba(217,113,74,0.18), rgba(232,163,61,0.10))",
        border: "rgba(217,113,74,0.45)",
        text: "var(--cream, #f4e4c1)",
        cta: "var(--terracotta, #b54732)",
        ctaLabel: "Repasser Premium",
      };
    case "DOWNGRADED":
      return {
        icon: "🔒",
        title: t(
          info.lockedGroupCount > 1
            ? "subscription.locked"
            : "subscription.lockedSingular",
          { count: String(info.lockedGroupCount), plan: "Premium" }
        ),
        message:
          "Repasse en Premium pour les déverrouiller — ou libère des slots en quittant des groupes.",
        background:
          "linear-gradient(135deg, rgba(217,113,74,0.18), rgba(181,70,46,0.12))",
        border: "rgba(181,70,46,0.50)",
        text: "var(--cream, #f4e4c1)",
        cta: "#FFB89A",
        ctaLabel: "Débloquer",
      };
    case "CANCELLED":
      return {
        icon: "✕",
        title: "Abonnement annulé",
        message:
          "Tu peux réactiver à tout moment — tes groupes sont préservés.",
        background:
          "linear-gradient(135deg, rgba(124,110,147,0.15), rgba(244,228,193,0.04))",
        border: "rgba(124,110,147,0.30)",
        text: "var(--cream-soft, #d4c4a8)",
        cta: "var(--cream-soft)",
        ctaLabel: "Réactiver",
      };
    default:
      return null;
  }
}
