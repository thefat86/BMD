"use client";

/**
 * <PromoBlock> V2 · Refonte du module parrainage (spec §6.9).
 *
 * Affiche dans le profil :
 *  - Le code de parrainage du user (généré à la demande)
 *  - Stats live : filleuls actifs / inscrits / crédit accumulé / prochain palier
 *  - Lien viral partageable (`https://www.backmesdo.com/login?ref=REF-XXXXXX`)
 *  - Boutons partage (WhatsApp, SMS, Email, Copier le lien, Native share)
 *  - Si commercial (isAffiliate) : aperçu du dashboard commissions + lien
 *  - Champ pour saisir un code reçu d'un parrain
 *
 * Design app-native : carte centrée, gradient saffron, gros code stylisé.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";

interface ReferralInfo {
  code: string;
  totalReferred: number;
  totalActiveReferred: number;
  totalCreditCents: number;
  nextMilestone: { count: number; bonusCents: number; badge?: string } | null;
}

interface AffiliateDashboard {
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

export function PromoBlock(): JSX.Element | null {
  const toast = useToast();
  const dialog = useDialog();
  const t = useT();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [affDash, setAffDash] = useState<AffiliateDashboard | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  async function load() {
    try {
      const [r, a] = await Promise.all([
        api.getReferralInfo(),
        api.getAffiliateDashboard().catch(() => null),
      ]);
      setInfo(r);
      setAffDash(a);
    } catch (e) {
      // Échec silencieux — peut arriver pour les users non-loggués
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (!info) return null;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/login?ref=${info.code}`
      : `https://www.backmesdo.com/login?ref=${info.code}`;

  const shareText = `🎁 Rejoins-moi sur BMD avec mon code ${info.code} et profite de 20% de réduction sur ton abonnement Premium pendant 3 mois !`;

  function shareWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
  function shareSMS() {
    const url = `sms:?&body=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
    window.location.href = url;
  }
  function shareEmail() {
    const subject = encodeURIComponent("Rejoins-moi sur BMD");
    const body = encodeURIComponent(`${shareText}\n\n${shareUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("common.linkCopied"));
    } catch {
      await dialog.alert(shareUrl, {
        title: t("common.copyLinkManually"),
        okLabel: "Compris",
      });
    }
  }
  async function nativeShare() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "BMD", text: shareText, url: shareUrl });
        return;
      } catch {
        /* user cancel */
      }
    }
    void copyLink();
  }

  async function applyCode() {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const r = await api.applyReferralCode(redeemCode.trim().toUpperCase());
      toast.success(
        r.discount
          ? `Code appliqué — ${r.discount.value}% pendant ${r.discount.durationMonths} mois`
          : "Code appliqué",
      );
      setRedeemCode("");
      await load();
    } catch (e) {
      // V177.A — Message d'erreur contextuel (backend ApiError prioritaire)
      const msg =
        e instanceof ApiError
          ? e.message
          : ((e as Error)?.message ??
            "Erreur inconnue lors de l'application du code.");
      await dialog.alert(msg, {
        title: "Code non appliqué",
      });
    } finally {
      setRedeeming(false);
    }
  }

  const nextMilestone = info.nextMilestone;
  const progressPct = nextMilestone
    ? Math.min(100, (info.totalActiveReferred / nextMilestone.count) * 100)
    : 100;

  return (
    <div
      className="card"
      style={{
        marginTop: 20,
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(63,125,92,0.06))",
        border: "1px solid rgba(232,163,61,0.30)",
      }}
    >
      <div className="card-head">
        <h2>{t("profile.referralTitle")}</h2>
        <span
          style={{
            fontSize: 11,
            color: "var(--saffron)",
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {t("profile.referralActiveCount", {
            count: String(info.totalActiveReferred),
          })}
        </span>
      </div>

      {/* Code + lien viral */}
      <div
        style={{
          background:
            "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
          border: "1px solid rgba(232,163,61,0.25)",
          borderRadius: 14,
          padding: "16px 18px",
          marginBottom: 14,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "var(--cocoa-soft, #6B5A47)",
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("ref.myCode")}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 32,
            fontWeight: 700,
            color: "var(--saffron, #e8a33d)",
            letterSpacing: 4,
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
            marginBottom: 8,
          }}
        >
          {info.code}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5A47)",
            opacity: 0.8,
            wordBreak: "break-all",
          }}
        >
          {shareUrl}
        </div>
      </div>

      {/* Boutons partage */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <ShareBtn onClick={shareWhatsApp} icon="💬" label="WhatsApp" color="#25D366" />
        <ShareBtn onClick={shareSMS} icon="📱" label="SMS" color="#5b6cff" />
        <ShareBtn onClick={shareEmail} icon="✉" label="Email" color="#e8a33d" />
        <ShareBtn
          onClick={copyLink}
          icon="🔗"
          label={t("common.copy")}
          color="#7c6e93"
        />
        <ShareBtn
          onClick={nativeShare}
          icon="📲"
          label={t("common.share")}
          color="#10b981"
          full
        />
      </div>

      {/* Stats + progression palier */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Stat label={t("ref.referrals")} value={String(info.totalReferred)} color="#7c6e93" />
        <Stat
          label={t("ref.activeReferrals")}
          value={String(info.totalActiveReferred)}
          color="#10b981"
        />
        <Stat
          label={t("ref.credit")}
          value={`${(info.totalCreditCents / 100).toFixed(2)} €`}
          color="#e8a33d"
        />
      </div>

      {nextMilestone && (
        <div
          style={{
            background: "var(--paper, #FFFFFF)",
            border: "1px solid rgba(43,31,21,0.10)",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            <span style={{ color: "var(--cocoa-soft, #6B5A47)" }}>
              Prochain palier{" "}
              <strong style={{ color: "var(--saffron)" }}>
                {nextMilestone.count} filleuls actifs
              </strong>
            </span>
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontWeight: 700,
                color: "var(--saffron)",
              }}
            >
              +{(nextMilestone.bonusCents / 100).toFixed(0)} €
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--ivory-2, #F4ECD8)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background:
                  "linear-gradient(90deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                borderRadius: 999,
                transition: "width 0.4s",
              }}
            />
          </div>
          {nextMilestone.badge && (
            <div
              style={{
                fontSize: 10,
                color: "var(--cocoa-soft, #6B5A47)",
                marginTop: 4,
              }}
            >
              + badge{" "}
              <strong style={{ color: "var(--saffron)" }}>
                {nextMilestone.badge}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* Bloc commercial — affiché uniquement si user.isAffiliate */}
      {affDash?.isAffiliate && (
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(91,108,255,0.10), rgba(232,163,61,0.04))",
            border: "1px solid rgba(91,108,255,0.30)",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--cocoa-soft, #6B5A47)",
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            🤝 Code commercial · KYC {affDash.kycStatus.toLowerCase()}
          </div>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#5b6cff",
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            {affDash.affiliateCode}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
              marginBottom: 10,
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ color: "var(--muted)", fontSize: 10 }}>L1</div>
              <div style={{ color: "var(--cocoa, #2B1F15)", fontWeight: 700 }}>
                {affDash.l1Count}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 10 }}>L2</div>
              <div style={{ color: "var(--cocoa, #2B1F15)", fontWeight: 700 }}>
                {affDash.l2Count}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 10 }}>L3</div>
              <div style={{ color: "var(--cocoa, #2B1F15)", fontWeight: 700 }}>
                {affDash.l3Count}
              </div>
            </div>
          </div>
          <Link
            href="/dashboard/affiliate"
            className="btn btn-sm btn-block"
            style={{
              padding: "8px 14px",
              fontSize: 12,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Voir mon dashboard commercial →
          </Link>
        </div>
      )}

      {/* Saisir un code reçu d'un parrain */}
      <div
        style={{
          background: "var(--paper, #FFFFFF)",
          border: "1px solid rgba(43,31,21,0.12)",
          borderRadius: 10,
          padding: "10px 12px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5A47)",
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          {t("ref.haveCode")}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            placeholder="REF-XXXXXX"
            style={{
              flex: 1,
              padding: "8px 12px",
              background: "var(--paper, #FFFFFF)",
              border: "1px solid rgba(43,31,21,0.12)",
              borderRadius: 8,
              color: "var(--cocoa, #2B1F15)",
              fontSize: 13,
              fontFamily: "inherit",
              letterSpacing: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          <button
            type="button"
            onClick={applyCode}
            disabled={redeeming || !redeemCode.trim()}
            className="btn btn-sm"
            style={{
              padding: "8px 14px",
              fontSize: 12,
              opacity: redeeming || !redeemCode.trim() ? 0.5 : 1,
            }}
          >
            {redeeming ? "…" : "Appliquer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareBtn({
  onClick,
  icon,
  label,
  color,
  full,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  color: string;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        gridColumn: full ? "1 / -1" : undefined,
        padding: "10px 12px",
        background: `${color}1A`,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 10,
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--muted)",
          letterSpacing: 1.4,
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 20,
          fontWeight: 700,
          color,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
