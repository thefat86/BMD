"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../lib/api-client";
import { AdminPlansEditor } from "../../lib/ui/admin-plans-editor";
import { AdminPricingMatrix } from "../../lib/ui/admin-pricing-matrix";
import { AdminAffiliateConfig } from "../../lib/ui/admin-affiliate-config";
import { AdminAdsBlock } from "../../lib/ui/admin-ads-block";
import { AdminSiteConfigBlock } from "../../lib/ui/admin-site-config-block";
import { AdminCharts } from "../../lib/ui/admin-charts";
import { AdminCohorts } from "../../lib/ui/admin-cohorts";
import { AdminFunnel } from "../../lib/ui/admin-funnel";
import { AdminKpis } from "../../lib/ui/admin-kpis";
import { AdminFxBlock } from "../../lib/ui/admin-fx-block";
import { AdminProfitability } from "../../lib/ui/admin-profitability";
import { useDialog } from "../../lib/ui/dialog-provider";
import { ResponsiveShell } from "../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../lib/use-breakpoint";

// V71 — Onglet "rentabilité" : revenu MRR vs coût IA estimé par client.
// V204.HOTFIX2 — Onglet "modules" : hub central des pages admin secondaires
// (feature flags, tarifs régionalisés, CMS, traductions, audit log, etc.).
// Évite à l'admin de connaître les URLs par cœur.
type Tab =
  | "stats"
  | "users"
  | "groups"
  | "activity"
  | "tarifs"
  | "profitability"
  | "modules";

const TYPE_ICONS: Record<string, string> = {
  TONTINE: "🪙",
  COLOC: "🏠",
  TRAVEL: "✈️",
  EVENT: "💍",
  CLUB: "⚽",
  PARISH: "⛪",
  GENERIC: "📁",
};

export default function AdminPage() {
  const router = useRouter();
  const dialog = useDialog();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const [tab, setTab] = useState<Tab>("stats");
  const [error, setError] = useState<string | null>(null);

  // === Console admin = DESKTOP ONLY ===
  // La quantité de données, les tableaux denses et les éditeurs (plans, tarifs
  // régionalisés, charts) ne sont pas pensés pour un viewport mobile. On
  // redirige vers /dashboard et l'admin doit ouvrir l'app sur un ordinateur.
  useEffect(() => {
    if (!bpReady) return;
    if (isMobile) {
      router.replace("/dashboard");
    }
  }, [bpReady, isMobile, router]);

  // V204.HOTFIX — Rules of Hooks : on ne peut PAS faire d'early return ici
  // car ~30 hooks (useState/useEffect) suivent. Si on bail à ce stade en
  // mobile/loading, l'ordre des hooks change entre 2 renders → crash React
  // « Rendered more hooks than during the previous render ». On garde juste
  // le flag et le bail se fait APRÈS tous les hooks, avant le return final.
  const shouldShowMobileBlock = !bpReady || isMobile;

  // Données par tab (chargées à la demande)
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any>(null);
  const [usersQuery, setUsersQuery] = useState("");
  // V94 — Filtre vrais users vs comptes de test (E2E + seed fixture).
  // V95.A — Ajout option "suspended" pour traquer les comptes suspendus.
  // Par défaut on affiche les vrais users (les comptes de test polluent la
  // console et n'ont pas d'intérêt opérationnel pour l'admin).
  const [usersKind, setUsersKind] = useState<
    "real" | "test" | "suspended" | "all"
  >("real");
  const [groups, setGroups] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);

  // V95.C — Création de user depuis la console admin + envoi d'invitation
  // par email / SMS (serveur) ou copie WhatsApp (deeplink wa.me).
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserType, setNewUserType] = useState<"EMAIL" | "PHONE">("EMAIL");
  const [newUserValue, setNewUserValue] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    user: { id: string; displayName: string };
    inviteMessage: string;
    inviteUrl: string;
    whatsappShareUrl: string;
    smsShareUrl: string | null;
    mailtoUrl: string | null;
  } | null>(null);
  const [sendingInvite, setSendingInvite] = useState<"EMAIL" | "SMS" | null>(
    null,
  );
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  // Détail user
  const [openUser, setOpenUser] = useState<any>(null);
  // Liste des plans dispo (chargée 1 fois au mount) pour le sélecteur "Changer le plan"
  const [adminPlans, setAdminPlans] = useState<
    Array<{ code: string; name: string; priceCents: number }>
  >([]);
  const [planSel, setPlanSel] = useState<string>("");
  const [changingPlan, setChangingPlan] = useState(false);

  useEffect(() => {
    void api
      .listPlans()
      .then((r) =>
        setAdminPlans(
          r.plans
            .filter((p: any) => p.isActive)
            .sort((a: any, b: any) => a.displayOrder - b.displayOrder)
            .map((p: any) => ({
              code: p.code,
              name: p.name,
              priceCents: p.priceCents,
            })),
        ),
      )
      .catch(() => {
        /* user non admin ne devrait pas être ici de toute façon */
      });
  }, []);

  // Quand on ouvre un user, on pré-sélectionne son plan actuel
  useEffect(() => {
    if (openUser?.planCode) {
      setPlanSel(openUser.planCode);
    }
  }, [openUser]);

  async function changeUserPlan() {
    if (!openUser || !planSel || planSel === openUser.planCode) return;
    setChangingPlan(true);
    setError(null);
    try {
      await api.adminChangeUserPlan(openUser.id, planSel);
      // Rafraîchit le détail user pour refléter le nouveau plan
      const u = await api.adminGetUser(openUser.id);
      setOpenUser(u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangingPlan(false);
    }
  }

  async function load(t: Tab) {
    setError(null);
    try {
      if (t === "stats") {
        const s = await api.adminStats();
        setStats(s);
      } else if (t === "users") {
        const u = await api.adminListUsers(usersQuery || undefined);
        setUsers(u);
      } else if (t === "groups") {
        const g = await api.adminListGroups();
        setGroups(g);
      } else if (t === "activity") {
        const a = await api.adminActivity();
        setActivity(a);
      }
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      const msg = (e as Error).message;
      if (msg.includes("Super admin")) {
        setError("⛔ Tu n'as pas les droits super admin. Lance `npm run make-admin <ton_email>` dans apps/api.");
      } else {
        setError(msg);
      }
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load("stats");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(t: Tab) {
    setTab(t);
    setOpenUser(null);
    void load(t);
  }

  async function searchUsers() {
    const u = await api.adminListUsers(usersQuery || undefined);
    setUsers(u);
  }

  async function suspendUser(id: string) {
    const ok = await dialog.confirm(
      "Suspendre ce compte ? Toutes ses sessions seront révoquées.",
      {
        variant: "danger",
        title: "Suspendre l'utilisateur",
        confirmLabel: "Suspendre",
      },
    );
    if (!ok) return;
    try {
      await api.adminSuspendUser(id);
      await load("users");
      if (openUser?.id === id) {
        const u = await api.adminGetUser(id);
        setOpenUser(u);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function unsuspendUser(id: string) {
    try {
      await api.adminUnsuspendUser(id);
      await load("users");
      if (openUser?.id === id) {
        const u = await api.adminGetUser(id);
        setOpenUser(u);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function viewUser(id: string) {
    try {
      const u = await api.adminGetUser(id);
      setOpenUser(u);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // V95.C — Crée un user shadow et affiche les options d'invitation
  async function createUser() {
    setError(null);
    setInviteFeedback(null);
    const value = newUserValue.trim();
    if (!value) {
      setError("Saisis un email ou un numéro de téléphone");
      return;
    }
    setCreatingUser(true);
    try {
      const result = await api.adminCreateUser({
        contactType: newUserType,
        contactValue: value,
        displayName: newUserName.trim() || undefined,
      });
      setCreatedResult(result);
      // Recharge la liste pour voir le nouveau user
      await load("users");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingUser(false);
    }
  }

  function resetCreateUserForm() {
    setShowCreateUser(false);
    setNewUserType("EMAIL");
    setNewUserValue("");
    setNewUserName("");
    setCreatedResult(null);
    setInviteFeedback(null);
  }

  async function sendInvite(channel: "EMAIL" | "SMS") {
    if (!createdResult) return;
    setSendingInvite(channel);
    setInviteFeedback(null);
    try {
      const r = await api.adminSendInvite(createdResult.user.id, {
        channel,
        message: createdResult.inviteMessage,
      });
      setInviteFeedback(
        r.ok
          ? `✓ Invitation envoyée par ${channel === "EMAIL" ? "e-mail" : "SMS"} à ${r.to}`
          : `❌ Échec d'envoi (${channel}) : ${r.error ?? "réessaie"}`,
      );
    } catch (e) {
      setInviteFeedback(`❌ ${(e as Error).message}`);
    } finally {
      setSendingInvite(null);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setInviteFeedback(`📋 ${label} copié dans le presse-papier`);
    } catch {
      setInviteFeedback("❌ Impossible de copier (autorise le presse-papier)");
    }
  }

  const superAdminBadge = (
    <span className="chip chip-saffron" style={{ flexShrink: 0 }}>
      Super admin
    </span>
  );

  // V204.HOTFIX — Bail mobile/loading APRÈS tous les hooks (Rules of Hooks).
  // Le useEffect ligne 56 redirige déjà vers /dashboard si isMobile ; ce bloc
  // sert juste à afficher un message le temps du replace + à bloquer le flash
  // de la console admin avant que le redirect ne s'applique.
  if (shouldShowMobileBlock) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background:
            "linear-gradient(180deg, var(--indigo) 0%, var(--night) 100%)",
          color: "var(--cream-soft)",
          textAlign: "center",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <div style={{ maxWidth: 320 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💻</div>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              margin: "0 0 8px",
              color: "var(--cream)",
            }}
          >
            Console admin réservée au PC
          </h2>
          <p style={{ margin: 0 }}>
            La console d'administration nécessite un écran plus large.
            Ouvre BMD depuis ton ordinateur.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveShell
      breadcrumb="Administration › Console"
      desktopTitle="⚙ Console admin"
      subtitle="Pilotage de la plateforme — Stats, utilisateurs, groupes, plans, pubs."
      primaryAction={superAdminBadge}
      mobileTitle="Admin"
      back={{ href: "/dashboard" }}
      mobileHeaderRight={superAdminBadge}
      hideFab
    >
      <div
        style={{
          padding: isMobile ? "8px 16px 24px" : 0,
          maxWidth: isMobile ? "100%" : 1280,
          margin: "0 auto",
        }}
      >
      {error && <div className="error">{error}</div>}

      {/* Tabs · V204.HOTFIX3 : tous les onglets tiennent sur une seule ligne,
          y compris sur mobile (emoji + label, label tronqué si besoin). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: isMobile ? 4 : 6,
          marginBottom: 14,
          ...(isMobile
            ? {
                position: "sticky" as const,
                top: 56,
                zIndex: 10,
                background: "linear-gradient(180deg, #16111E, transparent)",
                paddingTop: 4,
                paddingBottom: 8,
                margin: "0 -16px",
                paddingLeft: 16,
                paddingRight: 16,
              }
            : {}),
        }}
      >
        {[
          { v: "stats", emoji: "📊", lbl: "Stats" },
          { v: "users", emoji: "👤", lbl: "Users" },
          { v: "groups", emoji: "🪙", lbl: "Groupes" },
          { v: "activity", emoji: "⚡", lbl: "Activité" },
          { v: "tarifs", emoji: "💰", lbl: "Tarifs" },
          { v: "profitability", emoji: "📈", lbl: "Renta." }, // V71
          { v: "modules", emoji: "🧩", lbl: "Modules" }, // V204
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => switchTab(opt.v as Tab)}
            title={opt.lbl}
            style={{
              padding: isMobile ? "8px 2px" : "10px 4px",
              borderRadius: 10,
              fontSize: isMobile ? 10 : 12,
              fontWeight: 700,
              border:
                tab === opt.v
                  ? "1px solid var(--saffron)"
                  : "1px solid var(--line-soft)",
              background:
                tab === opt.v
                  ? "rgba(232,163,61,0.16)"
                  : "var(--overlay-2)",
              color: tab === opt.v ? "var(--saffron)" : "var(--cream-soft)",
              cursor: "pointer",
              minHeight: 44,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: "center",
              justifyContent: "center",
              gap: isMobile ? 2 : 6,
              lineHeight: 1.15,
            }}
          >
            <span style={{ fontSize: isMobile ? 14 : 13 }}>{opt.emoji}</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {opt.lbl}
            </span>
          </button>
        ))}
      </div>

      {/* === STATS === */}
      {tab === "stats" && stats && (
        <>
          {/* KPIs financiers (MRR, ARPU, churn) — en haut, c'est ce que
              regardent les fondateurs/investisseurs en premier */}
          <AdminKpis />

          {/* Graphiques temps réel — wire SSE + timeseries 14j */}
          <AdminCharts days={14} />

          {/* Funnel de conversion (signup → plan payant) */}
          <AdminFunnel />

          {/* Grille de rétention par cohorte */}
          <AdminCohorts weeks={8} />

          {/* Surcharge manuelle des taux FX (spec §6.5) */}
          <AdminFxBlock />

          <div className="card">
            <div className="card-head">
              <h2>👥 Utilisateurs</h2>
            </div>
            <div className="stats">
              <div className="stat">
                <div className="v">{stats.users.total}</div>
                <div className="l">Total</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--emerald-soft)" }}>
                  {stats.users.active}
                </div>
                <div className="l">Actifs</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--rose)" }}>
                  {stats.users.suspended}
                </div>
                <div className="l">Suspendus</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--gold)" }}>
                  {stats.users.last7Days}
                </div>
                <div className="l">7 jours</div>
              </div>
            </div>
            <div
              className="muted"
              style={{ fontSize: 11, marginTop: 10, textAlign: "center" }}
            >
              {stats.users.superAdmins} super admin(s) ·{" "}
              {stats.contacts.verified} contacts vérifiés ·{" "}
              {stats.sessions.active} sessions actives
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>🪙 Groupes</h2>
            </div>
            <div className="hero-card">
              <div className="label">Total groupes</div>
              <div className="amount">
                {stats.groups.total}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 10,
              }}
            >
              {Object.entries(stats.groups.byType).map(([type, count]) => (
                <span key={type} className="chip chip-saffron">
                  {TYPE_ICONS[type] ?? "📁"} {type.toLowerCase()} ·{" "}
                  {count as number}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>💸 Dépenses</h2>
            </div>
            <div className="stats">
              <div className="stat">
                <div className="v">{stats.expenses.total}</div>
                <div className="l">Total</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--gold)" }}>
                  {stats.expenses.last7Days}
                </div>
                <div className="l">7 jours</div>
              </div>
              <div className="stat" style={{ gridColumn: "span 2" }}>
                <div
                  className="v"
                  style={{ color: "var(--saffron)", fontSize: 18 }}
                >
                  {parseFloat(stats.expenses.totalVolume).toFixed(2)}
                </div>
                <div className="l">Volume cumulé</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>🪙 Tontines & ⇄ Swaps</h2>
            </div>
            <div className="stats">
              <div className="stat">
                <div className="v">{stats.tontines.total}</div>
                <div className="l">Tontines</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--emerald-soft)" }}>
                  {stats.tontines.active}
                </div>
                <div className="l">Actives</div>
              </div>
              <div className="stat">
                <div className="v">{stats.swaps.total}</div>
                <div className="l">Swaps</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--gold)" }}>
                  {stats.swaps.proposed}
                </div>
                <div className="l">En attente</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* === USERS === */}
      {tab === "users" && users && (() => {
        // V94 — Helper : un compte est de "test" si AU MOINS UN de ses contacts
        // match les patterns connus :
        //   - email @bmd-e2e.local (fixture Playwright `uniqueEmail`)
        //   - téléphone +33612360XXX (seed dev fixture du groupe "Resto soir")
        const isTestUser = (u: any): boolean => {
          if (!u.contacts || u.contacts.length === 0) return false;
          return u.contacts.some((c: any) => {
            const v = String(c.value ?? "");
            if (/@bmd-e2e\.local$/i.test(v)) return true;
            if (/^\+33612360\d{3}$/.test(v)) return true;
            return false;
          });
        };

        const allItems: any[] = users.items ?? [];
        const realItems = allItems.filter((u) => !isTestUser(u));
        const testItems = allItems.filter(isTestUser);
        // V95.A — Suspendus : un user "suspended" a `suspendedAt !== null`
        // ET on ne montre que les vrais (les tests suspendus n'intéressent
        // personne).
        const suspendedItems = realItems.filter((u) => u.suspendedAt);

        const filteredItems =
          usersKind === "real"
            ? realItems
            : usersKind === "test"
              ? testItems
              : usersKind === "suspended"
                ? suspendedItems
                : allItems;

        return (
        <>
          {/* V95.C — Création de user + invitation 3 canaux */}
          <div className="card" style={{ marginBottom: 12 }}>
            {!showCreateUser && !createdResult && (
              <button
                type="button"
                onClick={() => {
                  setShowCreateUser(true);
                  setError(null);
                  setInviteFeedback(null);
                }}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px dashed var(--saffron, #E8A33D)",
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.08), rgba(181,70,46,0.04))",
                  color: "var(--saffron, #E8A33D)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                + Créer un nouvel utilisateur
              </button>
            )}

            {showCreateUser && !createdResult && (
              <>
                <div
                  className="section-title"
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>👤 Nouveau user</span>
                  <button
                    type="button"
                    onClick={resetCreateUserForm}
                    className="btn-ghost btn-sm"
                    style={{ fontSize: 11 }}
                  >
                    Annuler
                  </button>
                </div>

                {/* Toggle type EMAIL / PHONE */}
                <div
                  role="tablist"
                  aria-label="Type de contact"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                    padding: 4,
                    background: "rgba(244,228,193,0.05)",
                    borderRadius: 10,
                    marginBottom: 10,
                  }}
                >
                  {(["EMAIL", "PHONE"] as const).map((t) => {
                    const active = newUserType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setNewUserType(t)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: active
                            ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
                            : "transparent",
                          color: active ? "#16111E" : "var(--cream-soft)",
                          border: "none",
                          fontWeight: active ? 700 : 500,
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {t === "EMAIL" ? "✉️ Email" : "📞 Téléphone"}
                      </button>
                    );
                  })}
                </div>

                <div className="field">
                  <label>
                    {newUserType === "EMAIL" ? "E-mail" : "Téléphone (+E.164)"}
                  </label>
                  <input
                    type={newUserType === "EMAIL" ? "email" : "tel"}
                    value={newUserValue}
                    onChange={(e) => setNewUserValue(e.target.value)}
                    placeholder={
                      newUserType === "EMAIL"
                        ? "marie@exemple.com"
                        : "+33612345678"
                    }
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Nom affiché (optionnel)</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Laisse vide pour déduire automatiquement"
                  />
                </div>

                <button
                  type="button"
                  onClick={createUser}
                  disabled={creatingUser || !newUserValue.trim()}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    background:
                      "linear-gradient(135deg, var(--saffron), var(--terracotta))",
                    color: "#16111E",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor:
                      creatingUser || !newUserValue.trim()
                        ? "not-allowed"
                        : "pointer",
                    opacity: creatingUser || !newUserValue.trim() ? 0.5 : 1,
                    fontFamily: "inherit",
                    marginTop: 4,
                  }}
                >
                  {creatingUser ? "Création…" : "Créer + préparer l'invitation"}
                </button>
              </>
            )}

            {createdResult && (
              <>
                <div className="section-title">
                  ✓ {createdResult.user.displayName} créé(e)
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 12, marginBottom: 12 }}
                >
                  Choisis comment lui envoyer son invitation.
                </div>

                <div
                  style={{
                    background: "rgba(244,228,193,0.04)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 12,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-line",
                    color: "var(--cream-soft)",
                    maxHeight: 140,
                    overflowY: "auto",
                  }}
                >
                  {createdResult.inviteMessage}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  {/* Email */}
                  <button
                    type="button"
                    onClick={() => sendInvite("EMAIL")}
                    disabled={
                      sendingInvite !== null ||
                      !createdResult.user ||
                      createdResult.mailtoUrl === null
                    }
                    title={
                      createdResult.mailtoUrl === null
                        ? "Le user n'a pas d'e-mail"
                        : "Envoie l'invitation par e-mail (serveur)"
                    }
                    style={{
                      padding: "10px 8px",
                      borderRadius: 10,
                      border: "1px solid var(--line-soft)",
                      background:
                        createdResult.mailtoUrl === null
                          ? "rgba(244,228,193,0.04)"
                          : "rgba(125,197,158,0.10)",
                      color:
                        createdResult.mailtoUrl === null
                          ? "var(--cream-soft)"
                          : "#7DC59E",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor:
                        createdResult.mailtoUrl === null
                          ? "not-allowed"
                          : "pointer",
                      fontFamily: "inherit",
                      opacity: createdResult.mailtoUrl === null ? 0.5 : 1,
                    }}
                  >
                    {sendingInvite === "EMAIL" ? "Envoi…" : "✉️ E-mail"}
                  </button>

                  {/* SMS */}
                  <button
                    type="button"
                    onClick={() => sendInvite("SMS")}
                    disabled={
                      sendingInvite !== null ||
                      !createdResult.user ||
                      createdResult.smsShareUrl === null
                    }
                    title={
                      createdResult.smsShareUrl === null
                        ? "Le user n'a pas de téléphone"
                        : "Envoie l'invitation par SMS (serveur Twilio)"
                    }
                    style={{
                      padding: "10px 8px",
                      borderRadius: 10,
                      border: "1px solid var(--line-soft)",
                      background:
                        createdResult.smsShareUrl === null
                          ? "rgba(244,228,193,0.04)"
                          : "rgba(232,163,61,0.10)",
                      color:
                        createdResult.smsShareUrl === null
                          ? "var(--cream-soft)"
                          : "var(--saffron)",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor:
                        createdResult.smsShareUrl === null
                          ? "not-allowed"
                          : "pointer",
                      fontFamily: "inherit",
                      opacity: createdResult.smsShareUrl === null ? 0.5 : 1,
                    }}
                  >
                    {sendingInvite === "SMS" ? "Envoi…" : "📞 SMS"}
                  </button>

                  {/* WhatsApp (deeplink + copie du message) */}
                  <a
                    href={createdResult.whatsappShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void copyToClipboard(
                        createdResult.inviteMessage,
                        "Message WhatsApp",
                      );
                    }}
                    style={{
                      padding: "10px 8px",
                      borderRadius: 10,
                      border: "1px solid var(--line-soft)",
                      background: "rgba(37,211,102,0.12)",
                      color: "#25D366",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "center",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    💬 WhatsApp
                  </a>
                </div>

                {/* Bouton copier le message brut */}
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      createdResult.inviteMessage,
                      "Message",
                    )
                  }
                  className="btn-ghost"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: 11,
                    marginBottom: 8,
                  }}
                >
                  📋 Copier juste le message
                </button>

                {inviteFeedback && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: inviteFeedback.startsWith("✓")
                        ? "rgba(125,197,158,0.12)"
                        : inviteFeedback.startsWith("❌")
                          ? "rgba(228,124,95,0.12)"
                          : "rgba(232,163,61,0.10)",
                      color: inviteFeedback.startsWith("✓")
                        ? "#7DC59E"
                        : inviteFeedback.startsWith("❌")
                          ? "#E47C5F"
                          : "var(--saffron)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {inviteFeedback}
                  </div>
                )}

                <button
                  type="button"
                  onClick={resetCreateUserForm}
                  className="btn-ghost btn-sm"
                  style={{
                    width: "100%",
                    marginTop: 10,
                    fontSize: 12,
                  }}
                >
                  Terminer
                </button>
              </>
            )}
          </div>

          <div className="card">
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                value={usersQuery}
                onChange={(e) => setUsersQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                placeholder="Rechercher par nom, email ou numéro…"
              />
            </div>

            {/* V94 + V95.A — Toggle vrais users / tests / suspendus / tous */}
            <div
              role="tablist"
              aria-label="Filtre type d'utilisateur"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 6,
                marginTop: 10,
                padding: 4,
                background: "var(--overlay, rgba(244,228,193,0.05))",
                borderRadius: 10,
              }}
            >
              {(
                [
                  { v: "real", lbl: `Vrais (${realItems.length})` },
                  {
                    v: "suspended",
                    lbl: `Suspendus (${suspendedItems.length})`,
                  },
                  { v: "test", lbl: `Tests (${testItems.length})` },
                  { v: "all", lbl: `Tous (${allItems.length})` },
                ] as const
              ).map((opt) => {
                const active = usersKind === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setUsersKind(opt.v)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: active
                        ? "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))"
                        : "transparent",
                      color: active ? "#16111E" : "var(--cream-soft)",
                      border: "none",
                      fontWeight: active ? 700 : 500,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 140ms ease",
                    }}
                  >
                    {opt.lbl}
                  </button>
                );
              })}
            </div>

            <div
              className="muted"
              style={{ fontSize: 11, marginTop: 8, textAlign: "right" }}
            >
              {filteredItems.length} affiché{filteredItems.length > 1 ? "s" : ""}
              {usersKind !== "all" && ` sur ${allItems.length} total`}
            </div>
          </div>

          <div className="list">
            {filteredItems.map((u: any) => (
              <div key={u.id} className="list-item">
                <div
                  className="icon"
                  style={
                    u.isSuperAdmin
                      ? {
                          background:
                            "linear-gradient(135deg,var(--saffron),var(--terracotta))",
                          color: "#16111e",
                        }
                      : undefined
                  }
                >
                  {u.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="text" onClick={() => viewUser(u.id)} style={{ cursor: "pointer" }}>
                  <div className="name">
                    {u.displayName}
                    {u.isSuperAdmin && (
                      <span
                        className="chip chip-saffron"
                        style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px" }}
                      >
                        ★ ADMIN
                      </span>
                    )}
                    {u.suspendedAt && (
                      <span
                        className="chip chip-rose"
                        style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px" }}
                      >
                        SUSPENDU
                      </span>
                    )}
                  </div>
                  <div className="meta">
                    {u.contacts[0]?.value ?? "(aucun contact)"} · {u.counts.groupMemberships}g · {u.counts.expensesPaid}d
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Détail user (modal-like inline) */}
          {openUser && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-head">
                <h2>👤 {openUser.displayName}</h2>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setOpenUser(null)}
                >
                  ✕
                </button>
              </div>

              <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
                Créé le {new Date(openUser.createdAt).toLocaleDateString("fr-FR")}
                {openUser.suspendedAt &&
                  ` · suspendu le ${new Date(openUser.suspendedAt).toLocaleDateString("fr-FR")}`}
              </div>

              <div className="section-title">Contacts</div>
              <div className="list">
                {openUser.contacts.map((c: any) => (
                  <div key={c.id} className="list-item">
                    <div className="icon">{c.type === "PHONE" ? "📞" : "✉️"}</div>
                    <div className="text">
                      <div className="name">
                        {c.value}
                        {c.isPrimary && (
                          <span
                            className="chip chip-saffron"
                            style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px" }}
                          >
                            ★
                          </span>
                        )}
                      </div>
                      <div className="meta">
                        {c.isVerified ? "✓ Vérifié" : "⚠ Non vérifié"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-title">Groupes ({openUser.groups.length})</div>
              <div className="list">
                {openUser.groups.map((g: any) => (
                  <div key={g.id} className="list-item">
                    <div className="icon">{TYPE_ICONS[g.type] ?? "📁"}</div>
                    <div className="text">
                      <div className="name">{g.name}</div>
                      <div className="meta">{g.role.toLowerCase()}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-title">
                Sessions actives ({openUser.activeSessions.length})
              </div>
              <div className="list">
                {openUser.activeSessions.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12 }}>
                    Aucune session active
                  </p>
                ) : (
                  openUser.activeSessions.map((s: any) => (
                    <div key={s.id} className="list-item">
                      <div className="icon">🔓</div>
                      <div className="text">
                        <div
                          className="name"
                          style={{
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {(s.device ?? "device inconnu").slice(0, 60)}
                        </div>
                        <div className="meta">
                          Depuis le{" "}
                          {new Date(s.createdAt).toLocaleDateString("fr-FR")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* === Plan / forfait === */}
              <div className="section-title">Plan / forfait</div>
              <div
                style={{
                  background: "rgba(232,163,61,0.05)",
                  border: "1px solid rgba(232,163,61,0.20)",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginBottom: 6,
                  }}
                >
                  Plan actuel :{" "}
                  <strong style={{ color: "var(--cream)" }}>
                    {openUser.planCode ?? "FREE"}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <select
                    value={planSel}
                    onChange={(e) => setPlanSel(e.target.value)}
                    style={{
                      flex: "1 1 140px",
                      minWidth: 0,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(244,228,193,0.04)",
                      color: "var(--cream)",
                      border: "1px solid rgba(244,228,193,0.1)",
                      fontFamily: "inherit",
                    }}
                    disabled={changingPlan}
                  >
                    {adminPlans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} ({p.code}) ·{" "}
                        {p.priceCents === 0
                          ? "Gratuit"
                          : `${(p.priceCents / 100).toFixed(2)}€`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={changeUserPlan}
                    disabled={
                      changingPlan ||
                      !planSel ||
                      planSel === openUser.planCode
                    }
                    style={{ flexShrink: 0 }}
                  >
                    {changingPlan ? "…" : "✓ Appliquer"}
                  </button>
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginTop: 8,
                    lineHeight: 1.5,
                  }}
                >
                  ⚠ Action admin directe — pas de prélèvement bancaire. À
                  utiliser pour granter un upgrade de test ou résoudre un cas
                  client.
                </p>
              </div>

              {!openUser.isSuperAdmin && (
                <>
                  {!openUser.suspendedAt ? (
                    <button
                      className="btn-ghost btn-block"
                      onClick={() => suspendUser(openUser.id)}
                      style={{
                        marginTop: 12,
                        color: "var(--rose)",
                        borderColor: "rgba(217,113,74,0.3)",
                      }}
                    >
                      ⛔ Suspendre ce compte
                    </button>
                  ) : (
                    <button
                      className="btn btn-block"
                      onClick={() => unsuspendUser(openUser.id)}
                      style={{ marginTop: 12 }}
                    >
                      ✓ Réactiver ce compte
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
        );
      })()}

      {/* === GROUPS === */}
      {tab === "groups" && groups && (
        <>
          <div className="card">
            <div className="card-head">
              <h2>Tous les groupes</h2>
              <span className="muted" style={{ fontSize: 11 }}>
                {groups.total}
              </span>
            </div>
          </div>
          <div className="list">
            {groups.items.map((g: any) => (
              <div key={g.id} className="list-item">
                <div className="icon">{TYPE_ICONS[g.type] ?? "📁"}</div>
                <div className="text">
                  <div className="name">{g.name}</div>
                  <div className="meta">
                    {g.counts.members}m · {g.counts.expenses}d ·{" "}
                    {g.defaultCurrency} ·{" "}
                    {g.admin?.displayName ?? "?"} (admin)
                  </div>
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 10, flexShrink: 0 }}
                >
                  {new Date(g.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* === ACTIVITY === */}
      {tab === "activity" && (
        <>
          <div className="card">
            <div className="card-head">
              <h2>⚡ Activité récente</h2>
            </div>
          </div>
          <div className="list">
            {activity.length === 0 ? (
              <p className="muted text-center" style={{ padding: "20px 0" }}>
                Aucune activité récente
              </p>
            ) : (
              activity.map((e) => (
                <div key={e.id} className="list-item">
                  <div className="icon">
                    {e.kind === "user_signup"
                      ? "🆕"
                      : e.kind === "expense"
                        ? "💸"
                        : "⇄"}
                  </div>
                  <div className="text">
                    <div className="name" style={{ fontSize: 13 }}>
                      {e.label}
                    </div>
                    <div className="meta">
                      {new Date(e.at).toLocaleString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

        </>
      )}

      {/* === ONGLET TARIFS (spec §6.3) === */}
      {/* Regroupe TOUTE la gestion tarifaire :
          - Catalogue des forfaits (FREE / PREMIUM / COMMUNITY) — limites,
            descriptions, ordre, activation
          - Matrice régionale PPA (Europe / Afrique FR / Afrique EN / Asie)
            avec tarifs par devise locale
       */}
      {tab === "tarifs" && (
        <>
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.05))",
              border: "1px solid rgba(232,163,61,0.25)",
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 16,
              fontSize: 13,
              color: "var(--cream-soft)",
              lineHeight: 1.55,
            }}
          >
            💰{" "}
            <strong style={{ color: "var(--saffron)" }}>
              Gestion tarifaire complète
            </strong>{" "}
            — Configure les forfaits (limites, fonctionnalités) et les prix
            par région du monde. Toute modification est appliquée{" "}
            <strong>en live</strong> sur la vitrine et l'app : pas besoin de
            redéploiement.
          </div>

          {/* 1. Catalogue des forfaits (limites & features) */}
          <AdminPlansEditor />

          {/* 2. Matrice tarifs régionaux (PPA) */}
          <div
            className="card"
            style={{
              marginTop: 16,
              background:
                "linear-gradient(135deg,rgba(232,163,61,0.06),rgba(91,108,255,0.04))",
              border: "1px solid var(--line)",
            }}
          >
            <div className="card-head">
              <h2>🌍 Tarifs régionaux (PPA)</h2>
            </div>
            <AdminPricingMatrix />
          </div>

          {/* 3. Programme parrainage + commercial multi-niveaux */}
          <div style={{ marginTop: 16 }}>
            <AdminAffiliateConfig />
          </div>
        </>
      )}

      {/* === V71 — ONGLET RENTABILITÉ ===
          Compare la conso IA réelle de chaque client (OCR, voix, meetings)
          avec son MRR, pour identifier les pertes (gros consommateurs sur
          plans gratuits ou sous-tarifés). Coûts unitaires en pied de tableau. */}
      {tab === "profitability" && (
        <>
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(125,197,158,0.10), rgba(232,163,61,0.05))",
              border: "1px solid rgba(125,197,158,0.30)",
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 16,
              fontSize: 13,
              color: "var(--cream-soft)",
              lineHeight: 1.55,
            }}
          >
            📈{" "}
            <strong style={{ color: "#7DC59E" }}>
              Rentabilité par client
            </strong>{" "}
            — MRR de l'abonnement vs coût IA estimé (OCR + voix + meetings)
            sur le mois en cours. Tri par défaut : marge croissante (les
            pertes apparaissent en haut) pour identifier rapidement les
            clients à faire migrer vers un plan supérieur ou rappeler à
            l'ordre. Les coûts unitaires sont configurables dans le
            backend.
          </div>

          <AdminProfitability limit={150} />
        </>
      )}

      {/* === Configuration site public (V23) === */}
      <AdminSiteConfigBlock />

      {/* === Module Publicités (spec §6.4) === */}
      <AdminAdsBlock />

      {/* === Audit log (spec §6.10 / §9.1) === */}
      <div
        className="card"
        style={{
          marginTop: 16,
          background:
            "linear-gradient(135deg,rgba(232,163,61,0.08),rgba(16,185,129,0.04))",
          border: "1px solid var(--line)",
        }}
      >
        <div className="between" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: "var(--cream)" }}>
              🛡️ Journal d'audit immuable
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--cream-soft)",
                lineHeight: 1.4,
              }}
            >
              Toutes les actions sensibles (création, modification, suppression)
              sont chaînées par hash SHA-256 — toute altération est détectable.
            </p>
          </div>
          <a
            href="/admin/audit-log"
            className="btn btn-sm"
            style={{ flexShrink: 0, textDecoration: "none" }}
          >
            Ouvrir le journal →
          </a>
        </div>
      </div>

      {/* === CMS Traductions (spec §6.6) === */}
      <div
        className="card"
        style={{
          marginTop: 16,
          background:
            "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(232,163,61,0.04))",
          border: "1px solid var(--line)",
        }}
      >
        <div className="between" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: "var(--cream)" }}>
              🌍 Traductions ligne par ligne
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--cream-soft)",
                lineHeight: 1.4,
              }}
            >
              Édite chaque chaîne UI (11 langues) sans déployer de code.
              Les modifications surchargent les défauts du code source.
            </p>
          </div>
          <a
            href="/admin/translations"
            className="btn btn-sm"
            style={{ flexShrink: 0, textDecoration: "none" }}
          >
            Ouvrir l'éditeur →
          </a>
        </div>
      </div>

      {/* === CMS Pages (spec §6.7) === */}
      <div
        className="card"
        style={{
          marginTop: 16,
          background:
            "linear-gradient(135deg,rgba(99,102,241,0.06),rgba(232,163,61,0.04))",
          border: "1px solid var(--line)",
        }}
      >
        <div className="between" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: "var(--cream)" }}>
              📝 Pages CMS
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--cream-soft)",
                lineHeight: 1.4,
              }}
            >
              Édite les pages publiques (à propos, aide, mentions légales…)
              en drag & drop, multi-langue, avec publication versionnée.
            </p>
          </div>
          <a
            href="/admin/cms"
            className="btn btn-sm"
            style={{ flexShrink: 0, textDecoration: "none" }}
          >
            Ouvrir l'éditeur →
          </a>
        </div>
      </div>

      {/* === SIM swap detection (spec §7.5) === */}
      <div
        className="card"
        style={{
          marginTop: 16,
          background:
            "linear-gradient(135deg,rgba(239,68,68,0.06),rgba(232,163,61,0.04))",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <div className="between" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: "var(--cream)" }}>
              🛡️ Détection SIM swap
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--cream-soft)",
                lineHeight: 1.4,
              }}
            >
              Connexions inhabituelles détectées et bloquées par sécurité.
              Investigation et résolution manuelle des cas suspects.
            </p>
          </div>
          <a
            href="/admin/sim-swap"
            className="btn btn-sm"
            style={{ flexShrink: 0, textDecoration: "none" }}
          >
            Investiguer →
          </a>
        </div>
      </div>

      {/* === V204 — TAB MODULES : hub central des pages admin secondaires === */}
      {tab === "modules" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(125,197,158,0.05))",
              border: "1px solid rgba(232,163,61,0.30)",
              borderRadius: 14,
              padding: "14px 18px",
              fontSize: 13,
              color: "var(--cream-soft)",
              lineHeight: 1.55,
            }}
          >
            🧩{" "}
            <strong style={{ color: "var(--saffron)" }}>
              Modules &amp; pages admin
            </strong>{" "}
            — Hub central pour accéder aux feature flags, tarifs régionalisés,
            CMS, traductions et tous les outils d'administration.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <AdminModuleCard
              href="/admin/feature-flags"
              icon="🎚️"
              title="Feature flags"
              description="Activer/désactiver les modules (Caisses Projet) et seuils globaux. Kill switch instantané sans redéploiement."
              accent="var(--saffron)"
            />
            <AdminModuleCard
              href="/admin/signature-pricing"
              icon="✍️"
              title="Tarifs signature qualifiée"
              description="Prix de la signature électronique RDD par pays (Yousign 3 niveaux × pays clés)."
              accent="#7DC59E"
            />
            <AdminModuleCard
              href="/admin/custom-logo-pricing"
              icon="🎨"
              title="Prix logo custom"
              description="Tarif mensuel pour qu'un groupe PRO ajoute son propre logo sur ses PDF (reçus, certificats)."
              accent="#9BB7E6"
            />
            <AdminModuleCard
              href="/admin/cms"
              icon="📝"
              title="CMS (blog &amp; aide)"
              description="Articles du site vitrine et centre d'aide. Multilingue, brouillons / publié."
              accent="var(--terracotta)"
            />
            <AdminModuleCard
              href="/admin/translations"
              icon="🌍"
              title="Traductions"
              description="Override les libellés i18n sans toucher au code. Utile pour rectifier une faute en prod."
              accent="#C9A14A"
            />
            <AdminModuleCard
              href="/admin/audit-log"
              icon="📜"
              title="Audit log"
              description="Journal signé de toutes les actions admin (changement de plan, suspension, modif tarif). Irréfutable."
              accent="var(--cream)"
            />
            <AdminModuleCard
              href="/admin/commercials"
              icon="🤝"
              title="Ambassadeurs &amp; commerciaux"
              description="Gestion du réseau (parrains, commerciaux agréés, configurations d'avantages)."
              accent="var(--saffron)"
            />
            <AdminModuleCard
              href="/admin/sim-swap"
              icon="📱"
              title="SIM swap"
              description="Détection anti-fraude OTP : changements de SIM suspects, blocages, investigations."
              accent="var(--rose)"
            />
            <AdminModuleCard
              href="/admin/web-vitals"
              icon="⚡"
              title="Web Vitals"
              description="Core Web Vitals (LCP / CLS / INP) en prod. Diagnostic perf agrégé par page."
              accent="#7DC59E"
            />
          </div>
        </div>
      )}

      </div>
    </ResponsiveShell>
  );
}

/**
 * V204 — Card de navigation vers une page admin secondaire.
 * Utilisée dans le tab "Modules" pour donner accès rapide à toutes les
 * pages d'administration sans avoir à connaître les URLs par cœur.
 */
function AdminModuleCard({
  href,
  icon,
  title,
  description,
  accent,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid var(--line-soft)",
        background: "var(--overlay-2)",
        textDecoration: "none",
        color: "inherit",
        transition: "transform .14s ease, border-color .14s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--line-soft)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: accent,
            letterSpacing: 0.3,
          }}
        >
          {title}
        </h3>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--cream-soft)",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: accent,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        Ouvrir →
      </div>
    </Link>
  );
}

