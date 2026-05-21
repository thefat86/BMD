"use client";

/**
 * V164.E — Espace commercial (ambassadeur OU commercial agréé).
 *
 * Affiche dynamiquement selon le statut :
 *   - Si isAmbassador uniquement : KPI réseau + table filleuls + messagerie +
 *     CTA viral "Devenir commercial agréé" avec estimation gains
 *   - Si isCommercialAgreed : KPI commission + table commissions mensuelles +
 *     Stripe Connect status + bouton recompute
 *
 * Si user n'est ni l'un ni l'autre : page d'attente avec CTA "Demande à
 * devenir ambassadeur" qui ouvre un mailto/contact.
 *
 * ResponsiveShell pour brancher la version mobile dédiée.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, isUnauthorized } from "../../../lib/api-client";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
import { useT } from "../../../lib/i18n/app-strings";
import { useToast } from "../../../lib/ui/toast";
import { MobileCommercialView } from "../../../lib/ui/mobile-commercial-view";

export default function CommercialEspacePage(): JSX.Element {
  const router = useRouter();
  const { isMobile, ready } = useBreakpoint();
  const t = useT();

  if (ready && isMobile) {
    return (
      <ResponsiveShell
        mobileTitle={t("commercial.title") || "Espace commercial"}
        breadcrumb={t("nav.dashboard")}
        back={{ href: "/dashboard" }}
      >
        <MobileCommercialView />
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      desktopTitle={t("commercial.title") || "Espace commercial"}
      breadcrumb={t("nav.dashboard")}
    >
      <DesktopCommercialView router={router} t={t} />
    </ResponsiveShell>
  );
}

function DesktopCommercialView({ router, t }: any) {
  const toast = useToast();
  const [ambStatus, setAmbStatus] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [potential, setPotential] = useState<any | null>(null);
  const [network, setNetwork] = useState<any[]>([]);
  const [commercialStatus, setCommercialStatus] = useState<any | null>(null);
  const [commissions, setCommissions] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageDraft, setMessageDraft] = useState<{
    recipientId: string;
    recipientName: string;
    templateKey: "RELANCE" | "MOTIVATION" | "WELCOME" | "CUSTOM";
    subject: string;
    body: string;
  } | null>(null);
  const [sendingMsg, setSendingMsg] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const ambs = await api.getAmbassadorStatus();
        setAmbStatus(ambs);
        if (ambs.isAmbassador || ambs.isCommercialAgreed) {
          const [s, p, n] = await Promise.all([
            api.getAmbassadorStats(),
            api.getPotentialEarnings(),
            api.getAmbassadorNetwork(),
          ]);
          setStats(s);
          setPotential(p);
          setNetwork(n);
        }
        if (ambs.isCommercialAgreed) {
          const [cs, cm] = await Promise.all([
            api.getCommercialStatus(),
            api.getMyCommissions(),
          ]);
          setCommercialStatus(cs);
          setCommissions(cm);
        }
      } catch (e) {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        toast.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function sendMessage() {
    if (!messageDraft) return;
    setSendingMsg(true);
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
      setSendingMsg(false);
    }
  }

  if (loading) {
    return <Empty>…</Empty>;
  }

  // ====== Cas 1 : ni ambassadeur ni commercial ======
  if (!ambStatus?.isAmbassador && !ambStatus?.isCommercialAgreed) {
    return (
      <Card style={{ textAlign: "center", padding: 40 }}>
        <h2 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 28, fontWeight: 600, color: "var(--cocoa, #2B1F15)", margin: "0 0 12px" }}>
          {t("commercial.notAmbassador.title")}
        </h2>
        <p style={{ fontSize: 14, color: "var(--cocoa-soft, #6B5942)", lineHeight: 1.6, marginBottom: 24, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          {t("commercial.notAmbassador.body")}
        </p>
        <a
          href="mailto:support@backmesdo.com?subject=Je%20souhaite%20devenir%20ambassadeur%20BMD"
          style={primaryBtn}
        >
          {t("commercial.notAmbassador.requestCta")}
        </a>
      </Card>
    );
  }

  // ====== Cas 2 : ambassadeur ET/OU commercial agréé ======
  const isAgreed = !!ambStatus.isCommercialAgreed;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Hero avec badge */}
      <Card style={{ marginBottom: 18, padding: 24, background: "linear-gradient(135deg, var(--paper, #FBF6EC) 0%, var(--v45-saffron-pale, #F6E8C5) 100%)", border: "1px solid var(--v45-saffron-line, rgba(197,138,46,0.30))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: isAgreed ? "linear-gradient(135deg, var(--v45-emerald, #1F7A57), #4F8E6E)" : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))", color: "#FBF6EC", fontWeight: 700, letterSpacing: 0.4 }}>
            {isAgreed ? t("commercial.statusAgreed") : t("commercial.statusAmbassador")}
          </span>
          {ambStatus.benefits?.badgeLabel && (
            <span style={{ fontSize: 11, color: "var(--cocoa-soft, #6B5942)", fontStyle: "italic" }}>
              {ambStatus.benefits.badgeLabel}
            </span>
          )}
        </div>
        <h2 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 32, fontWeight: 600, color: "var(--cocoa, #2B1F15)", margin: "10px 0 6px" }}>
          {t("commercial.welcome")}
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--cocoa-soft, #6B5942)" }}>
          {isAgreed ? t("commercial.welcomeAgreedSub") : t("commercial.welcomeAmbassadorSub")}
        </p>
      </Card>

      {/* KPI réseau */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Kpi label={t("commercial.kpi.network")} value={stats?.total ?? 0} hint={`${stats?.paid ?? 0} payants · ${stats?.free ?? 0} gratuits`} />
        <Kpi label={t("commercial.kpi.conversion")} value={`${stats?.conversionRate ?? 0}%`} hint={t("commercial.kpi.conversionHint")} accent />
        <Kpi label={t("commercial.kpi.monthlyRevenue")} value={`${((stats?.estimatedMonthlyRevenueCents ?? 0) / 100).toFixed(0)} €`} hint={t("commercial.kpi.monthlyRevenueHint")} />
        {isAgreed && commissions ? (
          <Kpi label={t("commercial.kpi.pendingCommission")} value={`${(commissions.totalPendingCents / 100).toFixed(2)} €`} hint={t("commercial.kpi.pendingCommissionHint")} highlight />
        ) : (
          <Kpi label={t("commercial.kpi.potentialAnnual")} value={`${((potential?.annualCommissionCents ?? 0) / 100).toFixed(0)} €`} hint={`${potential?.rateLabel ?? "20%"} × ${potential?.durationMonths ?? 12} mois`} highlight />
        )}
      </div>

      {/* V164.H4 — Bandeau Stripe Connect onboarding pour commercial agréé
          sans compte Stripe encore lié. Sans ça, on ne peut pas verser les
          commissions automatiquement. */}
      {isAgreed && commercialStatus && !commercialStatus.stripeConnectAccountId && (
        <Card style={{ marginBottom: 18, background: "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), var(--paper, #FBF6EC))", border: "1px solid var(--v45-saffron, #C58A2E)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--v45-saffron-strong, #854F0B)" }}>
                💳 {t("commercial.stripeConnect.title") || "Active Stripe Connect"}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--cocoa, #2B1F15)", lineHeight: 1.5 }}>
                {t("commercial.stripeConnect.body") || "Pour recevoir tes commissions automatiquement, complète l'onboarding Stripe (KYC + RIB). 5 min, sécurisé, géré par Stripe."}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await api.startStripeConnectOnboarding();
                  window.location.href = r.url;
                } catch (e) { toast.error(e); }
              }}
              style={primaryBtn}
            >
              {t("commercial.stripeConnect.cta") || "Démarrer →"}
            </button>
          </div>
        </Card>
      )}

      {/* Bandeau CTA viral pour ambassadeur uniquement */}
      {!isAgreed && potential && potential.networkPaid >= 5 && (
        <Card style={{ marginBottom: 18, background: "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), var(--paper, #FBF6EC))", border: "1px solid var(--v45-saffron, #C58A2E)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--v45-saffron-strong, #854F0B)" }}>
                ✨ {t("commercial.upgrade.title")}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--cocoa, #2B1F15)", lineHeight: 1.5 }}>
                {t("commercial.upgrade.body", { amount: ((potential.annualCommissionCents ?? 0) / 100).toFixed(0) })}
              </p>
            </div>
            <a href="mailto:support@backmesdo.com?subject=Devenir%20commercial%20agr%C3%A9%C3%A9" style={primaryBtn}>
              {t("commercial.upgrade.cta")}
            </a>
          </div>
        </Card>
      )}

      {/* Commercial agréé : commissions mensuelles */}
      {isAgreed && commissions && (
        <Card style={{ marginBottom: 18 }}>
          <Header>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{t("commercial.commissions.title")}</h3>
            <button type="button" style={ghostBtn} onClick={async () => {
              try {
                const r = await api.recomputeMyCommissions();
                toast.success(`${r.recomputed} ${t("commercial.commissions.recomputed")}`);
              } catch (e) { toast.error(e); }
            }}>
              {t("commercial.commissions.recompute")}
            </button>
          </Header>
          {commissions.lines.length === 0 ? (
            <Empty>{t("commercial.commissions.empty")}</Empty>
          ) : (
            <table style={tableStyle}>
              <thead><tr>
                <th style={th}>{t("commercial.commissions.month")}</th>
                <th style={th}>{t("commercial.commissions.referred")}</th>
                <th style={th}>{t("commercial.commissions.baseRevenue")}</th>
                <th style={th}>{t("commercial.commissions.rate")}</th>
                <th style={th}>{t("commercial.commissions.commission")}</th>
                <th style={th}>{t("commercial.commissions.status")}</th>
              </tr></thead>
              <tbody>
                {commissions.lines.map((l: any) => (
                  <tr key={l.id} style={tr}>
                    <td style={td}>{new Date(l.billingMonth).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</td>
                    <td style={td}><strong>{l.referredUser.displayName}</strong> <span style={{ fontSize: 10, color: "var(--cocoa-soft)" }}>({l.referredUser.planCode})</span></td>
                    <td style={{ ...td, fontFamily: "monospace" }}>{(l.baseRevenueCents / 100).toFixed(2)} €</td>
                    <td style={{ ...td, fontSize: 11 }}>{(l.rateBpsApplied / 100).toFixed(0)}%</td>
                    <td style={{ ...td, fontFamily: "monospace", fontWeight: 700, color: "var(--v45-saffron-strong, #854F0B)" }}>{(l.commissionCents / 100).toFixed(2)} €</td>
                    <td style={td}>
                      {l.payoutStatus === "PAID" ? (
                        <span style={badgeOk}>✓ Versée</span>
                      ) : l.payoutStatus === "CANCELLED" ? (
                        <span style={badgeMute}>Annulée</span>
                      ) : (
                        <span style={badgePending}>En attente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Table réseau filleuls */}
      <Card style={{ marginBottom: 18 }}>
        <Header>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{t("commercial.network.title")} ({network.length})</h3>
          <div style={{ fontSize: 11, color: "var(--cocoa-soft)" }}>
            {t("commercial.network.referralCode")} <code style={{ fontWeight: 700, color: "var(--v45-saffron-strong, #854F0B)", padding: "2px 6px", background: "var(--v45-saffron-pale, #F6E8C5)", borderRadius: 4 }}>{ambStatus.referralCode}</code>
          </div>
        </Header>
        {network.length === 0 ? (
          <Empty>{t("commercial.network.empty")}</Empty>
        ) : (
          <table style={tableStyle}>
            <thead><tr>
              <th style={th}>{t("commercial.network.member")}</th>
              <th style={th}>{t("commercial.network.plan")}</th>
              <th style={th}>{t("commercial.network.joined")}</th>
              <th style={th}></th>
            </tr></thead>
            <tbody>
              {network.map((m) => (
                <tr key={m.id} style={tr}>
                  <td style={td}>
                    <strong>{m.displayName}</strong>
                    {m.hasVerifiedEmail && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--v45-emerald, #1F7A57)" }}>✓ email</span>}
                  </td>
                  <td style={td}>
                    {m.isPaid ? (
                      <span style={badgePaid}>{m.planCode}</span>
                    ) : (
                      <span style={badgeFree}>{m.planCode}</span>
                    )}
                  </td>
                  <td style={td}>{new Date(m.joinedAt).toLocaleDateString()}</td>
                  <td style={td}>
                    <button type="button" onClick={() => setMessageDraft({
                      recipientId: m.id,
                      recipientName: m.displayName,
                      templateKey: m.isPaid ? "MOTIVATION" : "RELANCE",
                      subject: "",
                      body: "",
                    })} style={ghostBtn}>
                      ✉ {t("commercial.network.sendMessage")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modal d'envoi de message */}
      {messageDraft && (
        <MessageModal
          draft={messageDraft}
          onChange={setMessageDraft}
          onClose={() => setMessageDraft(null)}
          onSend={sendMessage}
          sending={sendingMsg}
          t={t}
        />
      )}
    </div>
  );
}

function MessageModal({ draft, onChange, onClose, onSend, sending, t }: any) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(43,31,21,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: "var(--paper, #FBF6EC)", borderRadius: 18, padding: 24,
        maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontFamily: "Cormorant Garamond, serif", fontSize: 24, fontWeight: 600 }}>
          {t("commercial.message.title", { name: draft.recipientName })}
        </h3>
        <Field label={t("commercial.message.template")}>
          <select value={draft.templateKey} onChange={(e) => onChange({ ...draft, templateKey: e.target.value })} style={input}>
            <option value="CUSTOM">{t("commercial.message.tpl.custom")}</option>
            <option value="RELANCE">{t("commercial.message.tpl.relance")}</option>
            <option value="MOTIVATION">{t("commercial.message.tpl.motivation")}</option>
            <option value="WELCOME">{t("commercial.message.tpl.welcome")}</option>
          </select>
        </Field>
        <Field label={t("commercial.message.subject")}>
          <input type="text" value={draft.subject} onChange={(e) => onChange({ ...draft, subject: e.target.value })}
            placeholder={draft.templateKey === "CUSTOM" ? "" : t("commercial.message.subjectPlaceholderTpl")}
            style={input} maxLength={200} />
        </Field>
        <Field label={t("commercial.message.body")}>
          <textarea value={draft.body} onChange={(e) => onChange({ ...draft, body: e.target.value })}
            placeholder={draft.templateKey === "CUSTOM" ? t("commercial.message.bodyPlaceholderCustom") : t("commercial.message.bodyPlaceholderTpl")}
            rows={8} style={{ ...input, fontFamily: "inherit" }} maxLength={5000} />
        </Field>
        <p style={{ fontSize: 11, fontStyle: "italic", color: "var(--cocoa-soft)" }}>
          {t("commercial.message.channelsHint")}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" onClick={onClose} style={ghostBtn}>{t("common.cancel")}</button>
          <button type="button" onClick={onSend} disabled={sending} style={primaryBtn}>
            {sending ? "…" : t("commercial.message.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========== Styles ===========

function Card({ children, style }: any) {
  return <section style={{ background: "var(--paper, #FBF6EC)", border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))", borderRadius: 14, padding: 18, ...(style ?? {}) }}>{children}</section>;
}
function Header({ children }: any) {
  return <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>{children}</header>;
}
function Empty({ children }: any) {
  return <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--cocoa-soft)", padding: 16, textAlign: "center" }}>{children}</p>;
}
function Field({ label, children }: any) {
  return <label style={{ display: "block", marginBottom: 12 }}><span style={{ display: "block", fontSize: 11, color: "var(--cocoa-soft)", fontWeight: 700, marginBottom: 4, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</span>{children}</label>;
}
function Kpi({ label, value, hint, accent, highlight }: any) {
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: highlight ? "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), var(--paper, #FBF6EC))" : "var(--paper, #FBF6EC)",
      border: `1px solid ${accent || highlight ? "var(--v45-saffron, #C58A2E)" : "var(--cocoa-line, rgba(43,31,21,0.10))"}`,
    }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--cocoa-soft, #6B5942)", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Cormorant Garamond, serif", color: highlight ? "var(--v45-saffron-strong, #854F0B)" : "var(--cocoa, #2B1F15)", lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--cocoa-soft, #6B5942)", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", color: "var(--cocoa-soft)", fontWeight: 700, letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: "10px", fontSize: 13, color: "var(--cocoa)" };
const tr: React.CSSProperties = { borderBottom: "1px solid var(--cocoa-line, rgba(43,31,21,0.06))" };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))", borderRadius: 8, fontSize: 13, fontFamily: "inherit", width: "100%", background: "var(--paper-stronger, #F4ECD8)" };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", background: "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))", color: "#FBF6EC", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block", fontFamily: "inherit" };
const ghostBtn: React.CSSProperties = { padding: "8px 14px", background: "transparent", border: "1px solid var(--cocoa-line, rgba(43,31,21,0.20))", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--cocoa)", fontFamily: "inherit" };
const badgeOk: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--v45-emerald, #1F7A57)", color: "#FBF6EC", fontWeight: 700 };
const badgePending: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--v45-saffron, #C58A2E)", color: "#FBF6EC", fontWeight: 700 };
const badgeMute: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--cocoa-line)", color: "var(--cocoa-soft)", fontWeight: 700 };
const badgePaid: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--v45-emerald, #1F7A57)", color: "#FBF6EC", fontWeight: 700 };
const badgeFree: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--paper-stronger, #F4ECD8)", color: "var(--cocoa-soft)", fontWeight: 700, border: "1px solid var(--cocoa-line)" };
