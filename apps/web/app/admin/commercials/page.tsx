"use client";

/**
 * V164.D — Console admin : module Commercial
 *
 * 3 sections :
 *   1. Ambassadeurs (Phase 1) — liste + promouvoir/révoquer
 *   2. Commerciaux agréés (Phase 3) — liste + CA généré + commissions
 *   3. Configurations — commission % + durée + avantages ambassadeur + avantages parrain
 *
 * SuperAdmin only.
 */

import { useEffect, useState } from "react";
import { api } from "../../../lib/api-client";
import { useToast } from "../../../lib/ui/toast";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";

export default function CommercialsAdminPage(): JSX.Element {
  const toast = useToast();
  const [tab, setTab] = useState<
    "ambassadors" | "commercials" | "commission" | "ambassadorBenefits" | "referralBenefits"
  >("ambassadors");

  return (
    <ResponsiveShell
      breadcrumb="Admin · Module Commercial"
      desktopTitle="Module Commercial"
      subtitle="Ambassadeurs (Phase 1, no cash) + Commerciaux agréés (Phase 3, 20% via Stripe Connect)"
      mobileTitle="Module Commercial"
      back={{ href: "/admin" }}
      hideFab
    >
      <div style={{ padding: "0 16px", maxWidth: 1100, margin: "0 auto" }}>
      <nav
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        {[
          { key: "ambassadors", label: "Ambassadeurs" },
          { key: "commercials", label: "Commerciaux agréés" },
          { key: "commission", label: "Commission" },
          { key: "ambassadorBenefits", label: "Avantages ambassadeur" },
          { key: "referralBenefits", label: "Avantages parrain" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key as any)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${
                tab === t.key
                  ? "var(--v45-saffron, #C58A2E)"
                  : "var(--cocoa-line, rgba(43,31,21,0.15))"
              }`,
              background:
                tab === t.key
                  ? "var(--v45-saffron-pale, #F6E8C5)"
                  : "transparent",
              color:
                tab === t.key
                  ? "var(--v45-saffron-strong, #854F0B)"
                  : "var(--cocoa, #2B1F15)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "ambassadors" && <AmbassadorsSection toast={toast} />}
      {tab === "commercials" && <CommercialsSection toast={toast} />}
      {tab === "commission" && <CommissionConfigSection toast={toast} />}
      {tab === "ambassadorBenefits" && <AmbassadorBenefitsSection toast={toast} />}
      {tab === "referralBenefits" && <ReferralBenefitsSection toast={toast} />}
      </div>
    </ResponsiveShell>
  );
}

function AmbassadorsSection({ toast }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.adminListAmbassadors();
      setRows(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function promote() {
    const userId = prompt("ID utilisateur à promouvoir ambassadeur (UUID) :");
    if (!userId) return;
    try {
      await api.adminPromoteAmbassador(userId);
      toast.success("Ambassadeur promu ✓");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }
  async function revoke(userId: string) {
    if (!confirm("Révoquer cet ambassadeur ?")) return;
    try {
      await api.adminRevokeAmbassador(userId);
      toast.success("Ambassadeur révoqué ✓");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Card>
      <Header>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          {rows.length} ambassadeur{rows.length > 1 ? "s" : ""}
        </h2>
        <button type="button" onClick={promote} style={primaryBtn}>
          + Promouvoir un utilisateur
        </button>
      </Header>
      {loading ? <Empty>…</Empty> : rows.length === 0 ? (
        <Empty>Aucun ambassadeur. Promeus tes 5-10 amis cibles pour démarrer.</Empty>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Utilisateur</th>
              <th style={th}>Plan</th>
              <th style={th}>Filleuls</th>
              <th style={th}>Promu le</th>
              <th style={th}>Statut</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={tr}>
                <td style={td}>
                  <strong>{r.displayName}</strong>
                  <div style={{ fontSize: 10, color: "var(--cocoa-soft)" }}>{r.id.slice(0, 8)}…</div>
                </td>
                <td style={td}>{r.planCode}</td>
                <td style={td}>{r._count?.referrals ?? 0}</td>
                <td style={td}>
                  {r.ambassadorPromotedAt
                    ? new Date(r.ambassadorPromotedAt).toLocaleDateString()
                    : "—"}
                </td>
                <td style={td}>
                  {r.isCommercialAgreed && (
                    <span style={badgeAgreed}>+ Commercial agréé</span>
                  )}
                </td>
                <td style={td}>
                  <button type="button" onClick={() => revoke(r.id)} style={ghostBtn}>
                    Révoquer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function CommercialsSection({ toast }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.adminListCommercials();
      setRows(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function promote() {
    const userId = prompt("ID utilisateur à promouvoir commercial agréé :");
    if (!userId) return;
    const siret = prompt("SIRET/SIREN du commercial (9-14 chiffres) :");
    if (!siret) return;
    const companyName = prompt("Raison sociale :");
    if (!companyName) return;
    const address = prompt("Adresse complète :");
    if (!address) return;
    const contractFileUrl = prompt("URL du contrat PDF signé (Yousign ou cloud) :");
    if (!contractFileUrl) return;
    try {
      await api.adminPromoteCommercial(userId, {
        siret, companyName, address, contractFileUrl,
      });
      toast.success("Commercial agréé promu ✓");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function revoke(userId: string) {
    if (!confirm("Révoquer ce commercial ? Les commissions PAID restent intactes, les PENDING peuvent être annulées séparément.")) return;
    try {
      await api.adminRevokeCommercial(userId);
      toast.success("Commercial révoqué ✓");
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Card>
      <Header>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          {rows.length} commercial{rows.length > 1 ? "(aux)" : ""} agréé{rows.length > 1 ? "s" : ""}
        </h2>
        <button type="button" onClick={promote} style={primaryBtn}>
          + Promouvoir commercial (Phase 3)
        </button>
      </Header>
      {loading ? <Empty>…</Empty> : rows.length === 0 ? (
        <Empty>Aucun commercial agréé. Phase 3 = signature contrat + SIRET + Stripe Connect.</Empty>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Commercial</th>
              <th style={th}>Société</th>
              <th style={th}>SIRET</th>
              <th style={th}>Filleuls</th>
              <th style={th}>CA 3 mois (HT)</th>
              <th style={th}>Commission 3 mois</th>
              <th style={th}>Stripe Connect</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={tr}>
                <td style={td}>
                  <strong>{r.displayName}</strong>
                  <div style={{ fontSize: 10, color: "var(--cocoa-soft)" }}>
                    {r.commercialContractAcceptedAt
                      ? `Contrat ${new Date(r.commercialContractAcceptedAt).toLocaleDateString()}`
                      : "—"}
                  </div>
                </td>
                <td style={td}>{r.commercialCompanyName ?? "—"}</td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>
                  {r.commercialSiret ?? "—"}
                </td>
                <td style={td}>{r._count?.referrals ?? 0}</td>
                <td style={{ ...td, fontFamily: "monospace" }}>
                  {(r.last3Months.baseRevenueCents / 100).toFixed(2)} €
                </td>
                <td style={{ ...td, fontFamily: "monospace", fontWeight: 700, color: "var(--v45-saffron-strong, #854F0B)" }}>
                  {(r.last3Months.commissionCents / 100).toFixed(2)} €
                </td>
                <td style={td}>
                  {r.stripeConnectAccountId ? (
                    <span style={badgeOk}>✓ Connecté</span>
                  ) : (
                    <span style={badgeWarn}>Non connecté</span>
                  )}
                </td>
                <td style={td}>
                  <button type="button" onClick={() => revoke(r.id)} style={ghostBtn}>
                    Révoquer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function CommissionConfigSection({ toast }: any) {
  const [cfg, setCfg] = useState<any | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const c = await api.adminGetCommissionConfig();
      setCfg(c);
      setDraft({});
    } catch (e) {
      toast.error(e);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    setSaving(true);
    try {
      await api.adminUpdateCommissionConfig(draft);
      toast.success("Config commission mise à jour ✓");
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally { setSaving(false); }
  }

  if (!cfg) return <Card><Empty>…</Empty></Card>;
  const v = (k: string, fallback: any) => draft[k] ?? cfg[k] ?? fallback;

  return (
    <Card>
      <h2 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
        Commission commerciale agréée
      </h2>
      <Row>
        <Field label="Taux (basis points, 2000 = 20%)">
          <input
            type="number"
            min={0} max={5000}
            value={v("rateBps", 2000)}
            onChange={(e) => setDraft({ ...draft, rateBps: parseInt(e.target.value, 10) })}
            style={input}
          />
          <span style={hint}>= {(v("rateBps", 2000) / 100).toFixed(1)}% du CA HT encaissé</span>
        </Field>
        <Field label="Durée par filleul (mois)">
          <input
            type="number"
            min={1} max={60}
            value={v("durationMonths", 12)}
            onChange={(e) => setDraft({ ...draft, durationMonths: parseInt(e.target.value, 10) })}
            style={input}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Plafond mensuel par commercial (centimes, 0 = pas de plafond)">
          <input
            type="number"
            min={0} max={10000000}
            value={v("maxMonthlyPayoutCents", 0) ?? 0}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setDraft({ ...draft, maxMonthlyPayoutCents: n > 0 ? n : null });
            }}
            style={input}
          />
        </Field>
        <Field label="Calcul basé sur">
          <label style={{ display: "block", fontSize: 13 }}>
            <input
              type="radio"
              checked={v("basedOnCollected", true)}
              onChange={() => setDraft({ ...draft, basedOnCollected: true })}
            />
            {" "}CA HT encaissé (recommandé)
          </label>
          <label style={{ display: "block", fontSize: 13 }}>
            <input
              type="radio"
              checked={!v("basedOnCollected", true)}
              onChange={() => setDraft({ ...draft, basedOnCollected: false })}
            />
            {" "}CA HT facturé
          </label>
        </Field>
      </Row>
      <button
        type="button"
        onClick={save}
        disabled={saving || Object.keys(draft).length === 0}
        style={{ ...primaryBtn, opacity: Object.keys(draft).length === 0 ? 0.5 : 1 }}
      >
        {saving ? "…" : "Enregistrer"}
      </button>
    </Card>
  );
}

function AmbassadorBenefitsSection({ toast }: any) {
  const [cfg, setCfg] = useState<any | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const c = await api.adminGetAmbassadorConfig();
    setCfg(c);
    setDraft({});
  }
  useEffect(() => { refresh().catch(toast.error); }, []);

  async function save() {
    setSaving(true);
    try {
      await api.adminUpdateAmbassadorConfig(draft);
      toast.success("Config mise à jour ✓");
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally { setSaving(false); }
  }

  if (!cfg) return <Card><Empty>…</Empty></Card>;
  const v = (k: string, f: any) => draft[k] ?? cfg[k] ?? f;

  return (
    <Card>
      <h2 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
        Avantages produit Ambassadeur (Phase 1, no cash)
      </h2>
      <Row>
        <Field label="Mois Pro gratuits à la promotion">
          <input type="number" min={0} max={60} value={v("freePremiumMonthsOnPromo", 12)}
            onChange={(e) => setDraft({ ...draft, freePremiumMonthsOnPromo: parseInt(e.target.value, 10) })}
            style={input} />
        </Field>
        <Field label="Crédits OCR mensuels">
          <input type="number" min={0} max={10000} value={v("ocrCreditsMonthly", 500)}
            onChange={(e) => setDraft({ ...draft, ocrCreditsMonthly: parseInt(e.target.value, 10) })}
            style={input} />
        </Field>
      </Row>
      <Row>
        <Field label="Crédits Voice mensuels">
          <input type="number" min={0} max={10000} value={v("voiceCreditsMonthly", 300)}
            onChange={(e) => setDraft({ ...draft, voiceCreditsMonthly: parseInt(e.target.value, 10) })}
            style={input} />
        </Field>
        <Field label="Badge social">
          <input type="text" maxLength={60} value={v("badgeLabel", "Pionnier BMD")}
            onChange={(e) => setDraft({ ...draft, badgeLabel: e.target.value })}
            style={input} />
        </Field>
      </Row>
      <Row>
        <Field label="Accès anticipé features">
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={v("earlyAccessEnabled", true)}
              onChange={(e) => setDraft({ ...draft, earlyAccessEnabled: e.target.checked })} />
            {" "}Activé
          </label>
        </Field>
        <Field label="Cadeau trimestriel optionnel">
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={v("quarterlyGiftEnabled", false)}
              onChange={(e) => setDraft({ ...draft, quarterlyGiftEnabled: e.target.checked })} />
            {" "}Activé (max centimes ci-dessous)
          </label>
          <input type="number" min={0} max={100000} value={v("quarterlyGiftMaxCents", 10000)}
            onChange={(e) => setDraft({ ...draft, quarterlyGiftMaxCents: parseInt(e.target.value, 10) })}
            style={input} />
        </Field>
      </Row>
      <button type="button" onClick={save} disabled={saving || Object.keys(draft).length === 0}
        style={{ ...primaryBtn, opacity: Object.keys(draft).length === 0 ? 0.5 : 1 }}>
        {saving ? "…" : "Enregistrer"}
      </button>
    </Card>
  );
}

function ReferralBenefitsSection({ toast }: any) {
  const [cfg, setCfg] = useState<any | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const c = await api.adminGetReferralConfig();
    setCfg(c); setDraft({});
  }
  useEffect(() => { refresh().catch(toast.error); }, []);

  async function save() {
    setSaving(true);
    try {
      await api.adminUpdateReferralConfig(draft);
      toast.success("Config parrain mise à jour ✓");
      await refresh();
    } catch (e) { toast.error(e); }
    finally { setSaving(false); }
  }

  if (!cfg) return <Card><Empty>…</Empty></Card>;
  const v = (k: string, f: any) => draft[k] ?? cfg[k] ?? f;

  return (
    <Card>
      <h2 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>
        5 mécaniques d'avantages parrain (utilisateur lambda)
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--cocoa-soft)" }}>
        Active/désactive chaque mécanique. Reco lancement : A + B + E (mois gratuit + crédits IA + badges).
      </p>
      {/* A. Mois gratuit */}
      <Section title="A. Mois gratuit cumulable" enabled={v("freeMonthsEnabled", true)}
        onToggle={(b) => setDraft({ ...draft, freeMonthsEnabled: b })}>
        <Row>
          <Field label="Mois par filleul payant">
            <input type="number" min={0} max={12} value={v("freeMonthsPerReferral", 1)}
              onChange={(e) => setDraft({ ...draft, freeMonthsPerReferral: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
          <Field label="Plafond cumul (mois)">
            <input type="number" min={0} max={60} value={v("freeMonthsCap", 12)}
              onChange={(e) => setDraft({ ...draft, freeMonthsCap: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
        </Row>
      </Section>

      {/* B. Crédits IA */}
      <Section title="B. Crédits IA bonus" enabled={v("aiCreditsEnabled", true)}
        onToggle={(b) => setDraft({ ...draft, aiCreditsEnabled: b })}>
        <Row>
          <Field label="OCR par filleul payant">
            <input type="number" min={0} max={1000} value={v("ocrCreditsPerReferralPaid", 50)}
              onChange={(e) => setDraft({ ...draft, ocrCreditsPerReferralPaid: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
          <Field label="Voice par filleul payant">
            <input type="number" min={0} max={1000} value={v("voiceCreditsPerReferralPaid", 30)}
              onChange={(e) => setDraft({ ...draft, voiceCreditsPerReferralPaid: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
        </Row>
      </Section>

      {/* C. Réduction */}
      <Section title="C. Réduction renouvellement" enabled={v("discountEnabled", false)}
        onToggle={(b) => setDraft({ ...draft, discountEnabled: b })}>
        <Field label="% de réduction par filleul payant">
          <input type="number" min={0} max={100} value={v("discountPercentPerReferral", 20)}
            onChange={(e) => setDraft({ ...draft, discountPercentPerReferral: parseInt(e.target.value, 10) })}
            style={input} />
        </Field>
      </Section>

      {/* D. Points */}
      <Section title="D. Système de points" enabled={v("pointsEnabled", false)}
        onToggle={(b) => setDraft({ ...draft, pointsEnabled: b })}>
        <Row>
          <Field label="Points par filleul payant">
            <input type="number" min={0} max={100} value={v("pointsPerReferralPaid", 10)}
              onChange={(e) => setDraft({ ...draft, pointsPerReferralPaid: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
          <Field label="Points par filleul gratuit">
            <input type="number" min={0} max={100} value={v("pointsPerReferralFree", 1)}
              onChange={(e) => setDraft({ ...draft, pointsPerReferralFree: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
        </Row>
      </Section>

      {/* E. Badges */}
      <Section title="E. Badges sociaux (viral, coût 0)" enabled={v("badgesEnabled", true)}
        onToggle={(b) => setDraft({ ...draft, badgesEnabled: b })}>
        <Row>
          <Field label="Bronze (filleuls)">
            <input type="number" min={1} max={1000} value={v("badgeBronzeThreshold", 1)}
              onChange={(e) => setDraft({ ...draft, badgeBronzeThreshold: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
          <Field label="Argent">
            <input type="number" min={1} value={v("badgeSilverThreshold", 3)}
              onChange={(e) => setDraft({ ...draft, badgeSilverThreshold: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
        </Row>
        <Row>
          <Field label="Or">
            <input type="number" min={1} value={v("badgeGoldThreshold", 10)}
              onChange={(e) => setDraft({ ...draft, badgeGoldThreshold: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
          <Field label="Platine">
            <input type="number" min={1} value={v("badgePlatinumThreshold", 30)}
              onChange={(e) => setDraft({ ...draft, badgePlatinumThreshold: parseInt(e.target.value, 10) })}
              style={input} />
          </Field>
        </Row>
      </Section>

      <button type="button" onClick={save} disabled={saving || Object.keys(draft).length === 0}
        style={{ ...primaryBtn, opacity: Object.keys(draft).length === 0 ? 0.5 : 1 }}>
        {saving ? "…" : "Enregistrer"}
      </button>
    </Card>
  );
}

// ============== Styles utilitaires ==============

function Card({ children }: any) {
  return (
    <section style={{
      background: "var(--paper, #FBF6EC)",
      border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))",
      borderRadius: 14,
      padding: 18,
    }}>{children}</section>
  );
}
function Header({ children }: any) {
  return <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>{children}</header>;
}
function Empty({ children }: any) {
  return <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--cocoa-soft)" }}>{children}</p>;
}
function Row({ children }: any) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>{children}</div>;
}
function Field({ label, children }: any) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, color: "var(--cocoa-soft)", marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}
function Section({ title, enabled, onToggle, children }: any) {
  return (
    <div style={{
      padding: 12, marginBottom: 12,
      border: `1px solid ${enabled ? "var(--v45-saffron, #C58A2E)" : "var(--cocoa-line)"}`,
      borderRadius: 10, opacity: enabled ? 1 : 0.55,
    }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, marginBottom: 8 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        {title}
      </label>
      {enabled && children}
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", color: "var(--cocoa-soft)", fontWeight: 700, letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: "10px", fontSize: 13, color: "var(--cocoa, #2B1F15)" };
const tr: React.CSSProperties = { borderBottom: "1px solid var(--cocoa-line, rgba(43,31,21,0.06))" };
const input: React.CSSProperties = { padding: "6px 10px", border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))", borderRadius: 8, fontSize: 13, fontFamily: "inherit", width: "100%", background: "var(--paper-stronger, #F4ECD8)" };
const hint: React.CSSProperties = { display: "block", marginTop: 4, fontSize: 11, color: "var(--cocoa-soft)" };
const primaryBtn: React.CSSProperties = { padding: "8px 14px", background: "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))", color: "#FBF6EC", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 36 };
const ghostBtn: React.CSSProperties = { padding: "6px 12px", background: "transparent", color: "var(--v45-terracotta, #9F4628)", border: "1px solid var(--v45-terracotta, #9F4628)", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const badgeOk: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--v45-emerald, #1F7A57)", color: "#FBF6EC", fontWeight: 700 };
const badgeWarn: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--v45-terracotta, #9F4628)", color: "#FBF6EC", fontWeight: 700 };
const badgeAgreed: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--v45-saffron, #C58A2E)", color: "#FBF6EC", fontWeight: 700 };
