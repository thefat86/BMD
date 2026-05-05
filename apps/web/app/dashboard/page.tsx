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
import { NotificationBell } from "../../lib/ui/notification-bell";
import { BarChart } from "../../lib/ui/charts";
import { BottomNav } from "../../lib/ui/bottom-nav";
import {
  OnboardingModal,
  shouldShowOnboarding,
} from "../../lib/ui/onboarding-modal";

const TYPES = [
  { value: "TONTINE", label: "🪙 Tontine" },
  { value: "COLOC", label: "🏠 Coloc" },
  { value: "TRAVEL", label: "✈️ Voyage" },
  { value: "EVENT", label: "💍 Événement" },
  { value: "CLUB", label: "⚽ Club" },
  { value: "PARISH", label: "⛪ Paroisse" },
  { value: "GENERIC", label: "📁 Autre" },
];

const TYPE_ICONS: Record<string, string> = {
  TONTINE: "🪙",
  COLOC: "🏠",
  TRAVEL: "✈️",
  EVENT: "💍",
  CLUB: "⚽",
  PARISH: "⛪",
  GENERIC: "📁",
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [globalBalance, setGlobalBalance] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("TONTINE");
  const [error, setError] = useState<string | null>(null);
  // Onboarding contextuel : "tu es ici pour quoi ?" affiché si 0 groupe
  // et flag localStorage pas encore positionné.
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void Promise.all([
      api.me(),
      api.listGroups(),
      api.getMyGlobalBalance().catch(() => null),
    ])
      .then(([m, g, gb]) => {
        setMe(m.user);
        setGroups(g);
        setGlobalBalance(gb);
        // Décide si on déclenche l'onboarding (uniquement si aucun groupe)
        if (shouldShowOnboarding(g.length > 0)) {
          setShowOnboarding(true);
        }
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
      });
  }, [router]);

  async function createGroup() {
    setError(null);
    try {
      const created = await api.createGroup({ name, type });
      setGroups([{ ...created, type, membersCount: 1 }, ...groups]);
      setShowCreate(false);
      setName("");
      router.push(`/dashboard/groups/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function logout() {
    clearToken();
    api.logout().catch(() => {});
    // Après déconnexion : retour à la page d'accueil (vitrine), pas /login.
    // L'utilisateur peut alors se reconnecter ou explorer le site.
    router.replace("/");
  }

  if (!me) {
    return (
      <div className="container">
        <div className="brand">
          BMD<span>·</span>
        </div>
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Top bar : brand (logo SVG + texte) + cloche + profil */}
      <div className="between" style={{ marginBottom: 18 }}>
        <Link
          href="/"
          aria-label="Retour à l'accueil"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {/* Logo BMD SVG (fichier public/bmd-logo.svg) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bmd-logo.svg"
            alt=""
            width={36}
            height={36}
            style={{ flexShrink: 0 }}
          />
          <div className="brand" style={{ marginBottom: 0, fontSize: 22 }}>
            BMD<span>·</span>
          </div>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <NotificationBell />
        <Link
          href="/dashboard/profile"
          className="btn-ghost btn-sm"
          style={{
            minHeight: 36,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg,var(--saffron),var(--terracotta))",
              color: "#16111e",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {me.displayName.charAt(0).toUpperCase()}
          </span>
          Profil
        </Link>
        </div>
      </div>

      {/* Salutation + nom utilisateur (page-header) */}
      <div className="page-header">
        <div className="titles">
          <h1>Bonjour {me.displayName}</h1>
          <div className="sub">
            {groups.length} groupe{groups.length > 1 ? "s" : ""} actif
            {groups.length > 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Balance card style maquette (BMD_site_web.html / BMD_maquettes.html) */}
      {/* Solde global = ce que tout le monde te doit - ce que tu dois */}
      <GlobalBalanceCard balance={globalBalance} groupCount={groups.length} />

      {/* Quick actions ronds (style maquette mobile) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          marginBottom: 18,
        }}
      >
        {[
          {
            ic: "＋",
            lbl: "Groupe",
            onClick: () => setShowCreate(true),
            href: undefined as string | undefined,
          },
          {
            ic: "👤",
            lbl: "Profil",
            onClick: undefined,
            href: "/dashboard/profile",
          },
          {
            ic: "🔔",
            lbl: "Activité",
            onClick: undefined,
            href: "#",
          },
          {
            ic: "🌐",
            lbl: "Site",
            onClick: undefined,
            href: "/",
          },
        ].map((q, i) => {
          const inner = (
            <>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.15), rgba(181,70,46,0.1))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "var(--saffron, #E8A33D)",
                  fontWeight: 700,
                }}
              >
                {q.ic}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--cream-soft, #E8D5B7)",
                  fontWeight: 600,
                }}
              >
                {q.lbl}
              </div>
            </>
          );
          const wrapStyle: React.CSSProperties = {
            background: "rgba(232,163,61,0.06)",
            border: "1px solid var(--line-soft, rgba(244,228,193,0.08))",
            borderRadius: 14,
            padding: "12px 6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            color: "inherit",
            textDecoration: "none",
            minHeight: 76,
          };
          return q.href ? (
            <Link key={i} href={q.href} style={wrapStyle}>
              {inner}
            </Link>
          ) : (
            <button
              key={i}
              onClick={q.onClick}
              type="button"
              style={{ ...wrapStyle, fontFamily: "inherit" }}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {error && <div className="error">{error}</div>}

      {/* Nouveau groupe — bouton large en tête */}
      {!showCreate && (
        <button
          className="btn btn-block"
          onClick={() => setShowCreate(true)}
          style={{ marginBottom: 14 }}
        >
          ＋ Créer un nouveau groupe
        </button>
      )}

      {/* Form création groupe */}
      {showCreate && (
        <div className="card">
          <div className="card-head">
            <h2>Nouveau groupe</h2>
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                setShowCreate(false);
                setName("");
              }}
            >
              ✕
            </button>
          </div>
          <div className="field">
            <label>Nom du groupe</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Tontine Bamiléké, Voyage Dakar…"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-block"
            onClick={createGroup}
            disabled={!name.trim()}
          >
            ✓ Créer
          </button>
        </div>
      )}

      {/* Vue d'ensemble : graphique répartition par type de groupe */}
      {groups.length >= 2 && (
        <div className="card">
          <div className="card-head">
            <h2>📊 Répartition de mes groupes</h2>
            <span className="muted" style={{ fontSize: 11 }}>
              par type
            </span>
          </div>
          <BarChart
            data={Object.entries(
              groups.reduce(
                (acc: Record<string, number>, g: any) => {
                  acc[g.type] = (acc[g.type] ?? 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
            ).map(([k, v]) => ({
              label:
                k === "TONTINE"
                  ? "Tontines"
                  : k === "COLOC"
                    ? "Colocs"
                    : k === "TRAVEL"
                      ? "Voyages"
                      : k === "EVENT"
                        ? "Évents"
                        : k === "CLUB"
                          ? "Clubs"
                          : k === "PARISH"
                            ? "Paroisses"
                            : "Autres",
              value: v,
            }))}
            height={140}
            valueFormat={(n) => String(n)}
          />
        </div>
      )}

      {/* Section groupes */}
      <div className="section-title">
        <span>Mes groupes</span>
        <span className="muted" style={{ fontSize: 11 }}>
          {groups.length}
        </span>
      </div>

      {groups.length === 0 ? (
        <div
          className="card text-center"
          style={{ padding: "30px 20px" }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>🌱</div>
          <p className="muted" style={{ fontSize: 13 }}>
            Aucun groupe pour l'instant.
            <br />
            Crée-en un pour démarrer.
          </p>
        </div>
      ) : (
        <div className="list">
          {groups.map((g) => {
            const myNet = parseFloat(g.myNet ?? "0");
            const totalSpent = parseFloat(g.totalSpent ?? "0");
            return (
              <Link
                key={g.id}
                href={`/dashboard/groups/${g.id}`}
                className="list-item"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  alignItems: "center",
                }}
              >
                {/* Icône type avec fond saffron tinté (style maquette) */}
                <div
                  className="icon"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "rgba(232,163,61,0.15)",
                    color: "var(--saffron)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {TYPE_ICONS[g.type] ?? "📁"}
                </div>
                <div className="text" style={{ flex: 1, minWidth: 0 }}>
                  {/* Nom du groupe en Cormorant Garamond, fin & lisible */}
                  <div
                    className="name"
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--cream)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {g.name}
                  </div>
                  {/* Méta : type · N membres · total dépensé */}
                  <div
                    className="meta"
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginTop: 2,
                    }}
                  >
                    {g.type === "TONTINE"
                      ? "Tontine"
                      : g.type === "COLOC"
                        ? "Coloc"
                        : g.type === "TRAVEL"
                          ? "Voyage"
                          : g.type === "EVENT"
                            ? "Événement"
                            : g.type === "CLUB"
                              ? "Club"
                              : g.type === "PARISH"
                                ? "Paroisse"
                                : "Autre"}{" "}
                    · {g.membersCount} membre{g.membersCount > 1 ? "s" : ""} ·{" "}
                    {totalSpent.toFixed(0)} {g.defaultCurrency}
                  </div>
                </div>
                {/* Mon solde net en saffron (positif vert, négatif rouge) */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                    color:
                      myNet > 0
                        ? "var(--emerald, #3F7D5C)"
                        : myNet < 0
                          ? "#D9714A"
                          : "var(--saffron)",
                  }}
                >
                  {myNet > 0 ? "+" : ""}
                  {myNet.toFixed(0)} {g.defaultCurrency}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Bottom-nav mobile (fixe en bas, visible uniquement < 768px) */}
      <BottomNav active="home" onCreate={() => setShowCreate(true)} />

      {/* Onboarding contextuel "tu es ici pour quoi ?" — voir spec §3.1 */}
      <OnboardingModal
        open={showOnboarding}
        userName={me.displayName}
        onClose={() => setShowOnboarding(false)}
        onChoose={(groupType) => {
          setType(groupType);
          setShowCreate(true);
          setShowOnboarding(false);
        }}
      />
    </div>
  );
}

/**
 * Balance card globale (spec / maquette BMD_site_web.html).
 * Affiche le solde net + ce qu'on doit à l'utilisateur + ce qu'il doit.
 *
 * Design fidèle à la maquette :
 *   - Gradient indigo #2A2244 → #3A2A52
 *   - Halo radial saffron en haut-droite
 *   - Solde en Cormorant Garamond, gros chiffres, saffron pour la devise
 *   - Ligne du bas : ↗ on vous doit · ↘ vous devez (vert/rouge)
 *
 * Si le user a des groupes en plusieurs devises, on affiche un mini-disclaimer
 * + détail par devise au clic.
 */
function GlobalBalanceCard({
  balance,
  groupCount,
}: {
  balance: any | null;
  groupCount: number;
}): JSX.Element {
  const [showByCurrency, setShowByCurrency] = useState(false);

  const net = balance ? parseFloat(balance.net) : 0;
  const owedToMe = balance ? parseFloat(balance.owedToMe) : 0;
  const iOwe = balance ? parseFloat(balance.iOwe) : 0;
  const currency = balance?.primaryCurrency ?? "EUR";
  const hasMultipleCurrencies =
    balance && Object.keys(balance.byCurrency ?? {}).length > 1;
  const symbol = currencySymbol(currency);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #2A2244, #3A2A52 80%)",
        borderRadius: 22,
        padding: 22,
        border: "1px solid var(--line, rgba(232,163,61,0.18))",
        position: "relative",
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {/* Halo radial saffron */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -40,
          top: -40,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(232,163,61,0.30), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          fontSize: 10,
          color: "var(--cream-soft, #E8D5B7)",
          letterSpacing: 2,
          textTransform: "uppercase",
          opacity: 0.85,
          position: "relative",
          fontWeight: 700,
        }}
      >
        Solde global
      </div>

      <div
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 44,
          fontWeight: 600,
          marginTop: 4,
          color: net < 0 ? "#D9714A" : "var(--cream, #F4E4C1)",
          position: "relative",
          lineHeight: 1.1,
        }}
      >
        {balance === null ? (
          <span style={{ fontSize: 16, color: "var(--cream-soft)" }}>
            …
          </span>
        ) : (
          <>
            {net >= 0 ? "+" : "−"}
            {Math.abs(net).toFixed(2).replace(".", ",")}
            <span
              style={{
                color: "var(--saffron, #E8A33D)",
                fontSize: 22,
                marginLeft: 4,
              }}
            >
              {symbol}
            </span>
          </>
        )}
      </div>

      {balance && (groupCount > 0) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 16,
            fontSize: 12,
            position: "relative",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: "#7DC59E",
              fontWeight: 600,
            }}
          >
            ↗ On vous doit{" "}
            <strong>
              {owedToMe.toFixed(0)} {symbol}
            </strong>
          </span>
          <span style={{ color: "#D9714A", fontWeight: 600 }}>
            ↘ Vous devez{" "}
            <strong>
              {iOwe.toFixed(0)} {symbol}
            </strong>
          </span>
        </div>
      )}

      {balance && groupCount === 0 && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "var(--cream-soft)",
            opacity: 0.7,
            position: "relative",
          }}
        >
          Crée un groupe pour commencer à suivre tes dépenses partagées.
        </div>
      )}

      {/* Disclaimer multi-devises + détail au clic */}
      {hasMultipleCurrencies && (
        <div
          style={{
            marginTop: 12,
            position: "relative",
            fontSize: 10,
            color: "var(--gold, #C9A24A)",
          }}
        >
          ⚠ {Object.keys(balance.byCurrency).length} devises sans conversion
          live —{" "}
          <button
            type="button"
            onClick={() => setShowByCurrency((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--saffron)",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
              fontSize: 10,
              fontFamily: "inherit",
            }}
          >
            {showByCurrency ? "masquer le détail" : "voir par devise"}
          </button>
          {showByCurrency && (
            <div
              style={{
                marginTop: 8,
                background: "rgba(0,0,0,0.25)",
                borderRadius: 8,
                padding: 8,
                fontSize: 11,
                color: "var(--cream-soft)",
              }}
            >
              {Object.entries(balance.byCurrency).map(
                ([cur, b]: [string, any]) => (
                  <div
                    key={cur}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "2px 0",
                    }}
                  >
                    <span>{cur}</span>
                    <span
                      style={{
                        color:
                          parseFloat(b.net) >= 0 ? "#7DC59E" : "#D9714A",
                        fontWeight: 600,
                      }}
                    >
                      {parseFloat(b.net) >= 0 ? "+" : ""}
                      {parseFloat(b.net).toFixed(2)}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function currencySymbol(code: string): string {
  switch (code) {
    case "EUR":
      return "€";
    case "USD":
      return "$";
    case "GBP":
      return "£";
    case "CHF":
      return "CHF";
    case "XAF":
    case "XOF":
      return "F";
    default:
      return code;
  }
}
