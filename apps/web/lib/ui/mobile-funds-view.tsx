"use client";

/**
 * V201 — Vue mobile « Liste des Caisses Projet » d'un groupe.
 * =============================================================================
 * Affiche les caisses du groupe + bouton de création.
 *
 * Comportement kill switch :
 *   - Au mount on appelle `api.projectFundsFeatureGate()`. Si `enabled: false`,
 *     on affiche un placeholder sobre « Module bientôt disponible » et on
 *     n'appelle PAS `listProjectFunds` (qui renverrait 404).
 *   - Pas d'erreur réseau visible : le module est désactivé, pas en panne.
 *
 * Bannière « Registre » obligatoire en haut.
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { FundsLegalNotice } from "./funds-legal-notice";
import { Icon } from "./icons";

// Le sheet de création est lourd (3 étapes + sélecteur trésorier) → lazy.
const MobileCreateFundSheet = lazy(() =>
  import("./mobile-create-fund-sheet").then((m) => ({
    default: m.MobileCreateFundSheet,
  })),
);

type Fund = Awaited<ReturnType<typeof api.listProjectFunds>>[number];

// Icônes prises dans le registry V45 existant (icons/icon-paths.ts).
// Pas d'ajout d'icône au registry pour V201 — on réutilise.
const TEMPLATE_META: Record<
  Fund["template"],
  { iconName: string; tintCss: string }
> = {
  EVENT: {
    iconName: "party-popper",
    tintCss: "var(--v45-saffron, #C58A2E)",
  },
  PROJECT: { iconName: "sparkles", tintCss: "var(--v45-emerald, #1F7A57)" },
  SOLIDARITY: {
    iconName: "shield",
    tintCss: "var(--v45-terracotta, #9F4628)",
  },
  ASSOCIATION: { iconName: "users", tintCss: "var(--v45-cocoa, #2B1F15)" },
  GIFT: { iconName: "gift", tintCss: "var(--v45-saffron, #C58A2E)" },
};

interface Props {
  groupId: string;
  /** Membres du groupe — sert au sheet de création (sélection trésorier). */
  members?: Array<{
    user: { id: string; displayName: string; avatar: string | null };
  }>;
  /** Devise par défaut du groupe (préselectionnée à la création). */
  defaultCurrency?: string;
}

export function MobileFundsView({
  groupId,
  members = [],
  defaultCurrency = "EUR",
}: Props) {
  const router = useRouter();
  const t = useT();
  const toast = useToast();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [funds, setFunds] = useState<Fund[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    try {
      const gate = await api.projectFundsFeatureGate();
      if (!gate.enabled) {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      const list = await api.listProjectFunds(groupId);
      setFunds(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Loading initial
  if (enabled === null) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>
        {t("common.loading") || "Chargement…"}
      </div>
    );
  }

  // Kill switch ON → placeholder sobre
  if (enabled === false) {
    return (
      <div style={{ padding: "20px 16px 28px" }}>
        <div
          style={{
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 16,
            padding: "28px 22px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 14px",
              borderRadius: 16,
              background:
                "linear-gradient(135deg, rgba(31,122,87,0.18), rgba(197,138,46,0.06))",
              border: "1px solid rgba(31,122,87,0.30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name="lock"
              size={26}
              color="var(--v45-emerald, #1F7A57)"
              strokeWidth={1.6}
            />
          </div>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "var(--cream)",
            }}
          >
            {t("funds.disabled.title") || "Bientôt disponible"}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--cream-soft)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {t("funds.disabled.body") ||
              "Le module Caisses Projet sera activé après validation juridique. Revenez bientôt."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 32px", display: "grid", gap: 14 }}>
      <FundsLegalNotice />

      {error && (
        <div
          role="alert"
          style={{
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.30)",
            color: "var(--v45-terracotta, #9F4628)",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Liste des caisses ou empty state */}
      {funds === null && (
        <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
          {t("common.loading") || "Chargement…"}
        </div>
      )}

      {funds && funds.length === 0 && (
        <EmptyStateNewFund onCreate={() => setShowCreate(true)} t={t} />
      )}

      {funds && funds.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bmd-tap"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px dashed rgba(232,163,61,0.40)",
              background: "rgba(232,163,61,0.06)",
              color: "var(--saffron, #E8A33D)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 48,
              touchAction: "manipulation",
            }}
          >
            <Icon name="plus" size={18} strokeWidth={1.8} />
            <span>{t("funds.createNew") || "Nouvelle caisse"}</span>
          </button>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 10,
            }}
          >
            {funds.map((fund) => (
              <FundCard
                key={fund.id}
                fund={fund}
                onOpen={() =>
                  router.push(`/dashboard/groups/${groupId}/funds/${fund.id}`)
                }
                t={t}
              />
            ))}
          </ul>
        </>
      )}

      {/* Sheet de création */}
      {showCreate && (
        <Suspense fallback={null}>
          <MobileCreateFundSheet
            groupId={groupId}
            members={members}
            defaultCurrency={defaultCurrency}
            onClose={() => setShowCreate(false)}
            onCreated={(fundId) => {
              setShowCreate(false);
              toast.success(t("funds.createdToast") || "Caisse créée !");
              router.push(`/dashboard/groups/${groupId}/funds/${fundId}`);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

// ============================================================================
// Sous-composants
// ============================================================================

function EmptyStateNewFund({
  onCreate,
  t,
}: {
  onCreate: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      style={{
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.08)",
        borderRadius: 18,
        padding: "30px 22px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          margin: "0 auto 16px",
          borderRadius: 20,
          background:
            "linear-gradient(135deg, rgba(197,138,46,0.20), rgba(31,122,87,0.08))",
          border: "1px solid rgba(197,138,46,0.32)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--saffron, #E8A33D)",
        }}
      >
        <Icon name="gift" size={32} strokeWidth={1.6} />
      </div>
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 24,
          fontWeight: 700,
          margin: "0 0 8px",
          color: "var(--cream)",
        }}
      >
        {t("funds.emptyTitle") || "Aucune caisse encore"}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--cream-soft)",
          margin: "0 0 20px",
          lineHeight: 1.55,
        }}
      >
        {t("funds.emptyBody") ||
          "Une caisse projet permet de collecter des contributions pour un événement, un projet ou un acte de solidarité. BMD enregistre, tu gardes l'argent."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="bmd-tap"
        style={{
          width: "100%",
          padding: "14px 22px",
          background:
            "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
          color: "#FBF6EC",
          border: "none",
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 0.3,
          cursor: "pointer",
          fontFamily: "inherit",
          minHeight: 54,
          boxShadow: "0 8px 24px -8px rgba(197,138,46,0.50)",
          touchAction: "manipulation",
        }}
      >
        ＋ {t("funds.createFirst") || "Créer la première caisse"}
      </button>
    </div>
  );
}

function FundCard({
  fund,
  onOpen,
  t,
}: {
  fund: Fund;
  onOpen: () => void;
  t: ReturnType<typeof useT>;
}) {
  const target = fund.targetAmount ? parseFloat(fund.targetAmount) : null;
  const progress =
    target && target > 0
      ? Math.min(100, Math.round((fund.contributed / target) * 100))
      : null;
  const meta = TEMPLATE_META[fund.template];
  const isClosed = fund.status === "CLOSED" || fund.status === "ARCHIVED";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="bmd-tap"
        style={{
          width: "100%",
          textAlign: "left",
          background: "var(--paper, #FFFFFF)",
          border: "1px solid var(--line, rgba(244,228,193,0.10))",
          borderRadius: 16,
          padding: "14px 14px 12px",
          display: "grid",
          gap: 10,
          cursor: "pointer",
          fontFamily: "inherit",
          color: "inherit",
          opacity: isClosed ? 0.68 : 1,
          touchAction: "manipulation",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "rgba(197,138,46,0.10)",
              border: "1px solid rgba(197,138,46,0.24)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: meta.tintCss,
              flexShrink: 0,
            }}
          >
            <Icon name={meta.iconName} size={22} strokeWidth={1.6} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.25,
              }}
            >
              {fund.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted, #7a7164)",
                marginTop: 2,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {t(`funds.template.${fund.template.toLowerCase()}`) ||
                fund.template}
              {" · "}
              {fund.contributorsCount}{" "}
              {t("funds.contributors") || "contributeurs"}
            </div>
          </div>
          {isClosed && (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: "rgba(122,113,100,0.14)",
                color: "var(--muted, #7a7164)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              {t("funds.statusClosed") || "Clôturée"}
            </span>
          )}
        </div>

        {/* Progression */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fund.contributed.toFixed(0)}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--muted, #7a7164)",
                  marginLeft: 4,
                  fontFamily: "inherit",
                }}
              >
                {fund.currency}
              </span>
            </span>
            {target && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted, #7a7164)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                / {target.toFixed(0)} {fund.currency}
              </span>
            )}
          </div>
          {progress !== null && (
            <div
              style={{
                height: 6,
                background: "rgba(197,138,46,0.10)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                  transition: "width .3s ease",
                }}
              />
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
