"use client";

/**
 * V164.E mobile — Espace commercial / ambassadeur version mobile-native.
 *
 * Design : épuré, scroll vertical, cards compactes, juste l'essentiel pour
 * un commercial en mouvement :
 *   - Hero badge + bonjour
 *   - 4 KPI grid 2×2 (réseau / conversion / CA mensuel / commission ou potentiel)
 *   - Liste filleuls avec bouton "Message" → bottom-sheet
 *   - Si ambassadeur : CTA viral "Devenir commercial agréé" avec montant
 *   - Si commercial agréé : commissions du mois en cours
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { BottomSheet } from "./bottom-sheet";

export function MobileCommercialView(): JSX.Element {
  const t = useT();
  const toast = useToast();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageDraft, setMessageDraft] = useState<any | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ambs = await api.getAmbassadorStatus();
        if (!ambs.isAmbassador && !ambs.isCommercialAgreed) {
          setData({ status: "none", ambs });
          return;
        }
        const [stats, potential, network, commercialStatus, commissions] = await Promise.all([
          api.getAmbassadorStats(),
          api.getPotentialEarnings(),
          api.getAmbassadorNetwork(),
          ambs.isCommercialAgreed ? api.getCommercialStatus().catch(() => null) : Promise.resolve(null),
          ambs.isCommercialAgreed ? api.getMyCommissions().catch(() => null) : Promise.resolve(null),
        ]);
        setData({ status: ambs.isCommercialAgreed ? "agreed" : "ambassador", ambs, stats, potential, network, commercialStatus, commissions });
      } catch (e) {
        toast.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function send() {
    if (!messageDraft) return;
    setSending(true);
    try {
      await api.sendNetworkMessage({
        recipientUserId: messageDraft.recipientId,
        templateKey: messageDraft.templateKey,
        subject: messageDraft.subject,
        body: messageDraft.body,
        channels: "BOTH",
      });
      toast.success(t("commercial.messageSent"));
      setMessageDraft(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  }

  if (loading || !data) {
    return <div style={{ padding: 20, fontSize: 13, color: "var(--cocoa-soft)" }}>…</div>;
  }

  if (data.status === "none") {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <h3 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 22, fontWeight: 600, color: "var(--cocoa, #2B1F15)", margin: "20px 0 10px" }}>
          {t("commercial.notAmbassador.title")}
        </h3>
        <p style={{ fontSize: 13, color: "var(--cocoa-soft, #6B5942)", lineHeight: 1.5, marginBottom: 20 }}>
          {t("commercial.notAmbassador.body")}
        </p>
        <a href="mailto:support@backmesdo.com?subject=Je%20souhaite%20devenir%20ambassadeur%20BMD" style={primaryBtnMobile}>
          {t("commercial.notAmbassador.requestCta")}
        </a>
      </div>
    );
  }

  const isAgreed = data.status === "agreed";
  const stats = data.stats;
  const potential = data.potential;
  const network = data.network ?? [];

  return (
    <div style={{ padding: "12px 14px 80px" }}>
      {/* Hero badge */}
      <div style={{
        padding: "14px 16px", borderRadius: 14, marginBottom: 14,
        background: "linear-gradient(135deg, var(--paper, #FBF6EC) 0%, var(--v45-saffron-pale, #F6E8C5) 100%)",
        border: "1px solid var(--v45-saffron-line, rgba(197,138,46,0.30))",
      }}>
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 999,
          background: isAgreed ? "linear-gradient(135deg, var(--v45-emerald, #1F7A57), #4F8E6E)" : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
          color: "#FBF6EC", fontWeight: 700, letterSpacing: 0.4, display: "inline-block", marginBottom: 6,
        }}>
          {isAgreed ? t("commercial.statusAgreed") : t("commercial.statusAmbassador")}
        </span>
        <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 22, fontWeight: 600, color: "var(--cocoa, #2B1F15)", lineHeight: 1.15 }}>
          {t("commercial.welcome")}
        </div>
        <div style={{ fontSize: 11, color: "var(--cocoa-soft)", marginTop: 4 }}>
          {t("commercial.network.referralCode")} <code style={{ fontWeight: 700, color: "var(--v45-saffron-strong)" }}>{data.ambs.referralCode}</code>
        </div>
      </div>

      {/* KPI grid 2×2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <KpiMobile label={t("commercial.kpi.network")} value={stats?.total ?? 0} hint={`${stats?.paid ?? 0} payants`} />
        <KpiMobile label={t("commercial.kpi.conversion")} value={`${stats?.conversionRate ?? 0}%`} accent />
        <KpiMobile label={t("commercial.kpi.monthlyRevenue")} value={`${((stats?.estimatedMonthlyRevenueCents ?? 0) / 100).toFixed(0)} €`} />
        {isAgreed && data.commissions ? (
          <KpiMobile label={t("commercial.kpi.pendingCommission")} value={`${(data.commissions.totalPendingCents / 100).toFixed(0)} €`} highlight />
        ) : (
          <KpiMobile label={t("commercial.kpi.potentialAnnual")} value={`${((potential?.annualCommissionCents ?? 0) / 100).toFixed(0)} €`} hint={potential?.rateLabel} highlight />
        )}
      </div>

      {/* CTA viral ambassadeur → commercial agréé */}
      {!isAgreed && potential?.networkPaid >= 5 && (
        <div style={{
          padding: 16, borderRadius: 14, marginBottom: 14,
          background: "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), var(--paper, #FBF6EC))",
          border: "1px solid var(--v45-saffron, #C58A2E)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--v45-saffron-strong, #854F0B)", marginBottom: 6 }}>
            ✨ {t("commercial.upgrade.title")}
          </div>
          <div style={{ fontSize: 12, color: "var(--cocoa, #2B1F15)", lineHeight: 1.5, marginBottom: 10 }}>
            {t("commercial.upgrade.body", { amount: ((potential.annualCommissionCents ?? 0) / 100).toFixed(0) })}
          </div>
          <a href="mailto:support@backmesdo.com?subject=Devenir%20commercial%20agr%C3%A9%C3%A9" style={primaryBtnMobile}>
            {t("commercial.upgrade.cta")}
          </a>
        </div>
      )}

      {/* Liste filleuls compacte */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--cocoa, #2B1F15)" }}>
            {t("commercial.network.title")} ({network.length})
          </h3>
        </div>
        {network.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--cocoa-soft)", fontStyle: "italic" }}>
            {t("commercial.network.empty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {network.map((m: any) => (
              <div key={m.id} style={{
                padding: 12, borderRadius: 12,
                background: "var(--paper, #FBF6EC)",
                border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cocoa, #2B1F15)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.displayName}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--cocoa-soft, #6B5942)" }}>
                    {m.isPaid ? (
                      <span style={{ color: "var(--v45-emerald, #1F7A57)", fontWeight: 600 }}>● {m.planCode}</span>
                    ) : (
                      <span>{m.planCode}</span>
                    )}
                    {" · "}{new Date(m.joinedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </div>
                </div>
                <button type="button" onClick={() => setMessageDraft({
                  recipientId: m.id, recipientName: m.displayName,
                  templateKey: m.isPaid ? "MOTIVATION" : "RELANCE",
                  subject: "", body: "",
                })} style={{
                  padding: "8px 12px", background: "var(--v45-saffron-pale, #F6E8C5)",
                  color: "var(--v45-saffron-strong, #854F0B)",
                  border: "1px solid var(--v45-saffron, #C58A2E)",
                  borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  minHeight: 36, whiteSpace: "nowrap",
                }}>
                  ✉ {t("commercial.network.sendMessage")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom sheet messagerie */}
      <BottomSheet
        open={!!messageDraft}
        onClose={() => setMessageDraft(null)}
        title={t("commercial.message.title", { name: messageDraft?.recipientName ?? "" })}
      >
        {messageDraft && (
          <div style={{ padding: "8px 0 20px" }}>
            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={{ display: "block", fontSize: 11, color: "var(--cocoa-soft)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>{t("commercial.message.template")}</span>
              <select value={messageDraft.templateKey}
                onChange={(e) => setMessageDraft({ ...messageDraft, templateKey: e.target.value })}
                style={inputMobile}>
                <option value="CUSTOM">{t("commercial.message.tpl.custom")}</option>
                <option value="RELANCE">{t("commercial.message.tpl.relance")}</option>
                <option value="MOTIVATION">{t("commercial.message.tpl.motivation")}</option>
                <option value="WELCOME">{t("commercial.message.tpl.welcome")}</option>
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={{ display: "block", fontSize: 11, color: "var(--cocoa-soft)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>{t("commercial.message.subject")}</span>
              <input type="text" value={messageDraft.subject}
                onChange={(e) => setMessageDraft({ ...messageDraft, subject: e.target.value })}
                placeholder={messageDraft.templateKey === "CUSTOM" ? "" : t("commercial.message.subjectPlaceholderTpl")}
                style={inputMobile} maxLength={200} />
            </label>
            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={{ display: "block", fontSize: 11, color: "var(--cocoa-soft)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>{t("commercial.message.body")}</span>
              <textarea value={messageDraft.body}
                onChange={(e) => setMessageDraft({ ...messageDraft, body: e.target.value })}
                placeholder={messageDraft.templateKey === "CUSTOM" ? t("commercial.message.bodyPlaceholderCustom") : t("commercial.message.bodyPlaceholderTpl")}
                rows={8} style={{ ...inputMobile, fontFamily: "inherit", minHeight: 160 }} maxLength={5000} />
            </label>
            <p style={{ fontSize: 11, fontStyle: "italic", color: "var(--cocoa-soft)", margin: "0 0 12px" }}>
              {t("commercial.message.channelsHint")}
            </p>
            <button type="button" onClick={send} disabled={sending}
              style={{ ...primaryBtnMobile, width: "100%", textAlign: "center" }}>
              {sending ? "…" : t("commercial.message.send")}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function KpiMobile({ label, value, hint, accent, highlight }: any) {
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: highlight
        ? "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), var(--paper, #FBF6EC))"
        : "var(--paper, #FBF6EC)",
      border: `1px solid ${accent || highlight ? "var(--v45-saffron, #C58A2E)" : "var(--cocoa-line, rgba(43,31,21,0.10))"}`,
    }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--cocoa-soft)", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "Cormorant Garamond, serif", color: highlight ? "var(--v45-saffron-strong, #854F0B)" : "var(--cocoa, #2B1F15)", lineHeight: 1, marginTop: 4 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 10, color: "var(--cocoa-soft)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const primaryBtnMobile: React.CSSProperties = {
  padding: "12px 18px",
  background: "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
  color: "#FBF6EC",
  border: "none",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
  fontFamily: "inherit",
  minHeight: 48,
};

const inputMobile: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "inherit",
  width: "100%",
  background: "var(--paper-stronger, #F4ECD8)",
  color: "var(--cocoa, #2B1F15)",
};
