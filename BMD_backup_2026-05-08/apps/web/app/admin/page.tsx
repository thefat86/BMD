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
import { useDialog } from "../../lib/ui/dialog-provider";
import { ResponsiveShell } from "../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../lib/use-breakpoint";

type Tab = "stats" | "users" | "groups" | "activity" | "tarifs";

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
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState<Tab>("stats");
  const [error, setError] = useState<string | null>(null);

  // Données par tab (chargées à la demande)
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any>(null);
  const [usersQuery, setUsersQuery] = useState("");
  const [groups, setGroups] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);

  // Détail user
  const [openUser, setOpenUser] = useState<any>(null);

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

  const superAdminBadge = (
    <span className="chip chip-saffron" style={{ flexShrink: 0 }}>
      Super admin
    </span>
  );

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

      {/* Tabs · sur mobile : scroll horizontal pour confort tactile,
          sur desktop : grid 5 colonnes égales */}
      <div
        style={{
          display: isMobile ? "flex" : "grid",
          gridTemplateColumns: isMobile ? undefined : "repeat(5, 1fr)",
          gap: 6,
          marginBottom: 14,
          // Scroll horizontal sticky en mobile, sticky sous le header MobileShell
          ...(isMobile
            ? {
                overflowX: "auto" as const,
                scrollSnapType: "x mandatory" as const,
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
          { v: "stats", lbl: "📊 Stats" },
          { v: "users", lbl: "👤 Users" },
          { v: "groups", lbl: "🪙 Groupes" },
          { v: "activity", lbl: "⚡ Activité" },
          { v: "tarifs", lbl: "💰 Tarifs" },
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => switchTab(opt.v as Tab)}
            style={{
              padding: isMobile ? "10px 14px" : "10px 4px",
              borderRadius: 10,
              fontSize: 12,
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
              flexShrink: 0,
              whiteSpace: "nowrap",
              scrollSnapAlign: isMobile ? "start" : undefined,
              fontFamily: "inherit",
            }}
          >
            {opt.lbl}
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
      {tab === "users" && users && (
        <>
          <div className="card">
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                value={usersQuery}
                onChange={(e) => setUsersQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                placeholder="Rechercher par nom, email ou numéro…"
              />
            </div>
            <div
              className="muted"
              style={{ fontSize: 11, marginTop: 8, textAlign: "right" }}
            >
              {users.total} utilisateur{users.total > 1 ? "s" : ""}
            </div>
          </div>

          <div className="list">
            {users.items.map((u: any) => (
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
      )}

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
      </div>
    </ResponsiveShell>
  );
}

