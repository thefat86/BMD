"use client";

/**
 * /dashboard/affiliate · Dashboard commercial multi-niveaux (spec §6.9).
 *
 * Affiché uniquement aux users avec User.isAffiliate = true (promus par
 * l'admin). Pour les autres : message d'accueil + lien pour candidater.
 *
 * Affichage transparent :
 *  - KPIs : commissions PENDING (en hold), PAYABLE (prêtes au virement),
 *    PAID (déjà reçues), counts L1/L2/L3
 *  - Liste réseau L1 : pour chaque filleul direct, son statut d'abonnement,
 *    sa devise, le nombre de filleuls L2 sous lui, les commissions générées
 *  - Feed temps réel des dernières commissions (50 dernières) avec niveau,
 *    montant, devise, status
 *  - KYC banner si pas encore vérifié (les commissions PAYABLE ne pourront
 *    pas être virées tant que le KYC n'est pas validé)
 *
 * Wrappé dans <ResponsiveShell> : sidebar admin + header desktop / shell
 * mobile complet.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, isUnauthorized, clearToken } from "../../../lib/api-client";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
import { useT } from "../../../lib/i18n/app-strings";

interface Dash {
  isAffiliate: boolean;
  affiliateCode: string | null;
  kycStatus: string;
  l1Count: number;
  l2Count: number;
  l3Count: number;
  pendingCents: number;
  payableCents: number;
  paidCents: number;
}

interface NetworkMember {
  id: string;
  displayName: string;
  avatar: string | null;
  defaultCurrency: string;
  planCode: string;
  subscriptionStatus: string;
  joinedAt: string;
  subL2Count: number;
  totalPendingCents: number;
  totalPayableCents: number;
  totalPaidCents: number;
}

interface Commission {
  id: string;
  payer: { id: string; displayName: string; avatar: string | null };
  level: number;
  percent: number;
  sourceCurrency: string;
  sourceAmountCents: number;
  payoutCurrency: string;
  payoutAmountCents: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

const ZERO_DECIMAL = new Set([
  "XAF", "XOF", "JPY", "KRW", "VND", "RWF", "UGX", "BIF",
  "DJF", "GNF", "KMF", "MGA", "MWK", "TZS",
]);

function formatMoney(cents: number, currency: string): string {
  const cur = currency || "EUR";
  const value = ZERO_DECIMAL.has(cur) ? cents : cents / 100;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : 2 })} ${cur}`;
}

export default function AffiliatePage() {
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const t = useT();
  const [dash, setDash] = useState<Dash | null>(null);
  const [network, setNetwork] = useState<NetworkMember[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [d, n] = await Promise.all([
        api.getAffiliateDashboard(),
        api.getAffiliateNetwork().catch(() => ({
          network: [],
          recentCommissions: [],
        })),
      ]);
      setDash(d);
      setNetwork(n.network);
      setCommissions(n.recentCommissions);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Polling 30s — pour que le commercial voie ses commissions tomber
    // en temps réel quand un filleul paye.
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !dash) {
    return (
      <ResponsiveShell
        breadcrumb={t("affiliate.title")}
        desktopTitle={t("affiliate.title")}
        mobileTitle={t("affiliate.title")}
        back={{ href: "/dashboard/profile" }}
        hideFab
      >
        <p style={{ padding: 30, color: "var(--cream-soft)" }}>
          {t("common.loading")}
        </p>
      </ResponsiveShell>
    );
  }

  // Pas commercial → message + lien admin
  if (!dash.isAffiliate) {
    return (
      <ResponsiveShell
        breadcrumb={t("affiliate.title")}
        desktopTitle={t("affiliate.title")}
        mobileTitle={t("affiliate.title")}
        back={{ href: "/dashboard/profile" }}
        hideFab
      >
        <div
          style={{
            maxWidth: 560,
            margin: "40px auto",
            textAlign: "center",
            padding: "30px 24px",
            background: "rgba(244,228,193,0.04)",
            border: "1px dashed rgba(232,163,61,0.30)",
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤝</div>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 26,
              margin: "0 0 8px",
              color: "var(--cream)",
            }}
          >
            Tu n'es pas encore commercial
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--cream-soft)",
              lineHeight: 1.6,
              margin: "0 0 18px",
            }}
          >
            Le programme commercial multi-niveaux est réservé aux apporteurs
            d'affaires sélectionnés par l'équipe BMD. Tu touches des
            commissions récurrentes (jusqu'à 20 %) sur ton réseau jusqu'à 3
            niveaux de profondeur.
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            Contacte-nous pour candidater — on évalue selon ton profil et ta
            communauté.
          </p>
        </div>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      breadcrumb={t("affiliate.title")}
      desktopTitle={`🤝 ${t("affiliate.title")}`}
      subtitle={t("affiliate.subtitle")}
      mobileTitle={t("affiliate.title")}
      back={{ href: "/dashboard/profile" }}
      hideFab
    >
      <div
        style={{
          padding: isMobile ? "8px 16px 24px" : 0,
          maxWidth: isMobile ? "100%" : 1200,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* KYC banner si pas verified */}
        {dash.kycStatus !== "VERIFIED" && (
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.15), rgba(217,113,74,0.08))",
              border: "1px solid rgba(232,163,61,0.40)",
              borderRadius: 14,
              padding: "12px 16px",
              fontSize: 13,
              color: "var(--cream)",
              lineHeight: 1.5,
            }}
          >
            ⚠️ <strong>KYC en attente</strong> — tes commissions PAYABLE
            seront virées dès que ton dossier sera validé par l'équipe BMD.
            Statut actuel : <strong>{dash.kycStatus}</strong>
          </div>
        )}

        {/* KPIs en haut */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <Kpi
            label={t("affiliate.activeReferrals")}
            value={String(dash.l1Count)}
            color="#7DC59E"
            icon="👥"
          />
          <Kpi
            label={t("affiliate.activeReferrals")}
            value={String(dash.l2Count)}
            color="#5b6cff"
            icon="👥"
          />
          <Kpi
            label={t("affiliate.activeReferrals")}
            value={String(dash.l3Count)}
            color="#7c6e93"
            icon="👥"
          />
          <Kpi
            label={t("affiliate.pending")}
            value={`${(dash.pendingCents / 100).toFixed(2)} €`}
            color="#e8a33d"
            icon="⏳"
          />
          <Kpi
            label={t("affiliate.totalEarned")}
            value={`${(dash.payableCents / 100).toFixed(2)} €`}
            color="#10b981"
            icon="💰"
          />
          <Kpi
            label={t("affiliate.totalEarned")}
            value={`${(dash.paidCents / 100).toFixed(2)} €`}
            color="#7DC59E"
            icon="✓"
          />
        </div>

        {/* 2 colonnes : Réseau L1 + Feed commissions */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr",
            gap: 16,
          }}
        >
          {/* Liste réseau L1 */}
          <div
            className="card"
            style={{
              background: "rgba(244,228,193,0.03)",
              border: "1px solid rgba(244,228,193,0.08)",
            }}
          >
            <div className="card-head">
              <h2>👥 Mon réseau direct (L1)</h2>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--saffron)",
                  fontWeight: 700,
                }}
              >
                {network.length}
              </span>
            </div>
            {network.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 13,
                  padding: "30px 16px",
                }}
              >
                Tu n'as pas encore de filleuls. Partage ton code{" "}
                <strong style={{ color: "var(--saffron)" }}>
                  {dash.affiliateCode}
                </strong>{" "}
                pour démarrer.
              </p>
            ) : (
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
                {network.map((m) => (
                  <li
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 10,
                      background: "rgba(244,228,193,0.03)",
                      border: "1px solid rgba(244,228,193,0.06)",
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#16111E",
                        fontWeight: 700,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {m.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--cream)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.displayName}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          marginTop: 2,
                        }}
                      >
                        <PlanChip plan={m.planCode} status={m.subscriptionStatus} />{" "}
                        · {m.defaultCurrency}
                        {m.subL2Count > 0 && ` · +${m.subL2Count} L2`}
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontSize: 11,
                        color: "var(--muted)",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          color: "var(--saffron)",
                          fontWeight: 700,
                          fontSize: 13,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {((m.totalPendingCents +
                          m.totalPayableCents +
                          m.totalPaidCents) /
                          100
                        ).toFixed(2)}{" "}
                        €
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {m.totalPaidCents > 0 && (
                          <span style={{ color: "#7DC59E" }}>
                            ✓ {(m.totalPaidCents / 100).toFixed(2)}€
                          </span>
                        )}
                        {m.totalPendingCents > 0 && (
                          <span style={{ color: "#e8a33d", marginLeft: 4 }}>
                            ⏳ {(m.totalPendingCents / 100).toFixed(2)}€
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Feed commissions */}
          <div
            className="card"
            style={{
              background: "rgba(244,228,193,0.03)",
              border: "1px solid rgba(244,228,193,0.08)",
              minHeight: 200,
            }}
          >
            <div className="card-head">
              <h2>📡 Feed temps réel</h2>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  fontStyle: "italic",
                }}
              >
                refresh 30s
              </span>
            </div>
            {commissions.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 13,
                  padding: "30px 16px",
                }}
              >
                Aucune commission pour l'instant.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxHeight: 600,
                  overflowY: "auto",
                }}
              >
                {commissions.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      padding: 10,
                      background: "rgba(244,228,193,0.03)",
                      border: "1px solid rgba(244,228,193,0.06)",
                      borderRadius: 10,
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <strong style={{ color: "var(--cream)" }}>
                        {c.payer.displayName}
                      </strong>
                      <StatusChip status={c.status} />
                    </div>
                    <div
                      style={{
                        color: "var(--cream-soft)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      L{c.level} · {c.percent}% · payé{" "}
                      {formatMoney(c.sourceAmountCents, c.sourceCurrency)}
                    </div>
                    <div
                      style={{
                        color: "var(--saffron)",
                        fontWeight: 700,
                        fontSize: 13,
                        fontVariantNumeric: "tabular-nums",
                        marginTop: 2,
                      }}
                    >
                      → {formatMoney(c.payoutAmountCents, c.payoutCurrency)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--muted)",
                        marginTop: 4,
                      }}
                    >
                      {new Date(c.createdAt).toLocaleString("fr-FR")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Note transparence */}
        <div
          style={{
            background: "rgba(244,228,193,0.04)",
            border: "1px dashed rgba(244,228,193,0.10)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 11,
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >
          💡 <strong style={{ color: "var(--cream-soft)" }}>Transparence totale</strong>{" "}
          — tu vois en temps réel ce que paient tes filleuls et la commission
          que ça te génère. Les commissions <strong>PENDING</strong> passent
          en <strong>PAYABLE</strong> après 30 jours (anti-chargeback Stripe),
          puis sont versées sur ton compte au prochain batch (seuil min de payout
          configurable en admin).
        </div>
      </div>
    </ResponsiveShell>
  );
}

function Kpi({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${color}1A`,
          border: `1px solid ${color}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            color: "var(--muted)",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--cream)",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function PlanChip({ plan, status }: { plan: string; status: string }) {
  const isPaying = status === "ACTIVE" || status === "GRACE";
  const color = isPaying ? "#7DC59E" : "var(--muted)";
  return (
    <span
      style={{
        color,
        fontWeight: 700,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.6,
      }}
    >
      ● {plan}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "#e8a33d",
    PAYABLE: "#10b981",
    PAID: "#7DC59E",
    CANCELLED: "#D9714A",
  };
  const color = colors[status] ?? "var(--muted)";
  return (
    <span
      style={{
        color,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        background: `${color}15`,
        border: `1px solid ${color}40`,
        padding: "2px 6px",
        borderRadius: 6,
      }}
    >
      {status}
    </span>
  );
}
