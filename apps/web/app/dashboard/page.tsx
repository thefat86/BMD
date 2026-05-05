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
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("TONTINE");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void Promise.all([api.me(), api.listGroups()])
      .then(([m, g]) => {
        setMe(m.user);
        setGroups(g);
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
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/dashboard/groups/${g.id}`}
              className="list-item"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="icon">{TYPE_ICONS[g.type] ?? "📁"}</div>
              <div className="text">
                <div className="name">{g.name}</div>
                <div className="meta">
                  {g.membersCount} membre{g.membersCount > 1 ? "s" : ""} ·{" "}
                  {g.defaultCurrency} · {g.type.toLowerCase()}
                </div>
              </div>
              <div
                style={{
                  color: "var(--saffron)",
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                ›
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
