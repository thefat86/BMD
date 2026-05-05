"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, clearToken, getToken } from "../../lib/api-client";

const TYPES = [
  { value: "TONTINE", label: "🪙 Tontine" },
  { value: "COLOC", label: "🏠 Coloc" },
  { value: "TRAVEL", label: "✈️ Voyage" },
  { value: "EVENT", label: "💍 Événement" },
  { value: "CLUB", label: "⚽ Club" },
  { value: "PARISH", label: "⛪ Paroisse" },
  { value: "GENERIC", label: "📁 Autre" },
];

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
        setError((e as Error).message);
        if ((e as Error).message.includes("unauthorized")) {
          clearToken();
          router.replace("/login");
        }
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
    void api.logout().finally(() => {
      clearToken();
      router.push("/login");
    });
  }

  if (!me) {
    return (
      <div className="container">
        <div className="brand">BMD<span>·</span></div>
        <p>Chargement…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div className="brand" style={{ marginBottom: 0 }}>
          BMD<span>·</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "var(--cream-soft)", fontSize: 14 }}>
            👋 {me.displayName}
          </span>
          <button className="btn-ghost" onClick={logout}>
            ↩ Déconnexion
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ marginBottom: 0 }}>🪙 Mes groupes ({groups.length})</h2>
          <button className="btn" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Annuler" : "+ Nouveau groupe"}
          </button>
        </div>

        {showCreate && (
          <div style={{ marginTop: 18 }}>
            <div className="field">
              <label>Nom du groupe</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Tontine Bamiléké"
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
              className="btn"
              onClick={createGroup}
              disabled={!name}
              style={{ width: "100%" }}
            >
              ✓ Créer
            </button>
          </div>
        )}

        {groups.length === 0 && !showCreate && (
          <p style={{ marginTop: 18, color: "var(--muted)", fontSize: 14 }}>
            Aucun groupe pour l'instant. Crée-en un !
          </p>
        )}

        <div style={{ marginTop: 18 }}>
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/dashboard/groups/${g.id}`}
              style={{ textDecoration: "none" }}
            >
              <div className="list-item">
                <div className="name">{g.name}</div>
                <div className="meta">
                  {g.membersCount} membre{g.membersCount > 1 ? "s" : ""} ·{" "}
                  {g.defaultCurrency}
                </div>
                <div style={{ color: "var(--saffron)" }}>→</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
