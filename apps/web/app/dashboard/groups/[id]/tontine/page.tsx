"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../../../lib/api-client";

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

const STATUS_BADGE: Record<Status, { chip: string; label: string }> = {
  DRAFT: { chip: "chip-muted", label: "Brouillon" },
  ACTIVE: { chip: "chip-saffron", label: "🟢 Active" },
  COMPLETED: { chip: "chip-emerald", label: "✓ Terminée" },
  CANCELLED: { chip: "chip-rose", label: "Annulée" },
};

export default function TontinePage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [tontine, setTontine] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Création
  const [showCreate, setShowCreate] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("250");
  const [frequency, setFrequency] =
    useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("MONTHLY");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [orderMode, setOrderMode] = useState<"MANUAL" | "RANDOM">("MANUAL");
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  async function refresh() {
    try {
      const [m, g, t] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.getTontine(groupId),
      ]);
      setMe(m.user);
      setGroup(g);
      setTontine(t.tontine);
      if (!t.tontine && g.members) {
        setManualOrder(g.members.map((mem: any) => mem.user.id));
      }
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function createTontine() {
    setError(null);
    try {
      const created = await api.createTontine(groupId, {
        contributionAmount,
        frequency,
        startDate: new Date(startDate).toISOString(),
        orderMode,
        notes: notes || undefined,
      });
      await api.activateTontine(
        created.id,
        orderMode === "MANUAL" ? manualOrder : undefined,
      );
      setShowCreate(false);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markPaid(contributionId: string) {
    setError(null);
    try {
      await api.markContributionPaid(contributionId, "Manuel");
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm(contributionId: string) {
    setError(null);
    try {
      await api.confirmContribution(contributionId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function distribute(turnId: string) {
    setError(null);
    try {
      await api.distributeTurn(turnId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancel() {
    if (!window.confirm("Annuler cette tontine ? Cette action est irréversible.")) return;
    try {
      await api.cancelTontine(tontine.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function moveOrder(idx: number, dir: -1 | 1) {
    const newOrder = [...manualOrder];
    const swap = idx + dir;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[idx], newOrder[swap]] = [newOrder[swap]!, newOrder[idx]!];
    setManualOrder(newOrder);
  }

  function memberName(userId: string): string {
    return (
      group?.members.find((m: any) => m.user.id === userId)?.user.displayName ??
      "?"
    );
  }

  if (!group) {
    return (
      <div className="container">
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Top bar */}
      <div className="between" style={{ marginBottom: 14 }}>
        <Link
          href={`/dashboard/groups/${groupId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "var(--cream-soft)",
          }}
        >
          ← {group.name}
        </Link>
        <span
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 18,
            color: "var(--cream)",
            fontWeight: 700,
          }}
        >
          BMD<span style={{ color: "var(--saffron)" }}>·</span>
        </span>
      </div>

      {/* Page header */}
      <div className="page-header">
        <div className="titles">
          <h1>
            <span style={{ marginRight: 8 }}>🪙</span>
            Tontine
          </h1>
          <div className="sub">{group.name}</div>
        </div>
        {tontine && (
          <span className={`chip ${STATUS_BADGE[tontine.status as Status].chip}`}>
            {STATUS_BADGE[tontine.status as Status].label}
          </span>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {/* === Aucune tontine encore === */}
      {!tontine && !showCreate && (
        <div className="card text-center" style={{ padding: "30px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🪙</div>
          <h2 style={{ marginBottom: 8 }}>Pas encore de tontine</h2>
          <p
            className="muted"
            style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}
          >
            Crée une tontine pour démarrer une épargne collective rotative
            entre les <strong>{group.members.length} membres</strong> du groupe.
          </p>
          <button
            className="btn btn-block"
            onClick={() => setShowCreate(true)}
            disabled={group.members.length < 2}
          >
            ＋ Créer une tontine
          </button>
          {group.members.length < 2 && (
            <p
              className="muted"
              style={{ fontSize: 11, marginTop: 12 }}
            >
              Il faut au moins 2 membres dans le groupe.
            </p>
          )}
        </div>
      )}

      {/* === Form création === */}
      {!tontine && showCreate && (
        <div className="card">
          <div className="card-head">
            <h2>Nouvelle tontine</h2>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setShowCreate(false)}
            >
              ✕
            </button>
          </div>

          <div className="field">
            <label>Cotisation par membre ({group.defaultCurrency})</label>
            <input
              value={contributionAmount}
              onChange={(e) => setContributionAmount(e.target.value)}
              inputMode="decimal"
              placeholder="250.00"
            />
          </div>

          <div className="field">
            <label>Fréquence</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
            >
              <option value="WEEKLY">Hebdomadaire</option>
              <option value="BIWEEKLY">Tous les 15 jours</option>
              <option value="MONTHLY">Mensuelle</option>
            </select>
          </div>

          <div className="field">
            <label>Date du 1er tour</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Ordre des bénéficiaires</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              {[
                { v: "MANUAL", lbl: "✋ Je choisis" },
                { v: "RANDOM", lbl: "🎲 Tirage au sort" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setOrderMode(opt.v as any)}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    border:
                      orderMode === opt.v
                        ? "1px solid var(--saffron)"
                        : "1px solid var(--line-soft)",
                    background:
                      orderMode === opt.v
                        ? "rgba(232,163,61,0.16)"
                        : "var(--overlay-2)",
                    color:
                      orderMode === opt.v
                        ? "var(--saffron)"
                        : "var(--cream-soft)",
                    cursor: "pointer",
                    minHeight: 44,
                  }}
                >
                  {opt.lbl}
                </button>
              ))}
            </div>
          </div>

          {orderMode === "MANUAL" && (
            <div className="field">
              <label>Ordre des tours (1er en haut)</label>
              <div
                style={{
                  background: "var(--overlay)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 12,
                  padding: 6,
                }}
              >
                {manualOrder.map((userId, i) => (
                  <div
                    key={userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: 8,
                      borderRadius: 8,
                      background: "rgba(232,163,61,0.04)",
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg,var(--saffron),var(--terracotta))",
                        color: "#16111e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: "var(--cream)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {memberName(userId)}
                    </div>
                    <button
                      type="button"
                      onClick={() => moveOrder(i, -1)}
                      disabled={i === 0}
                      className="btn-ghost btn-sm"
                      style={{
                        padding: "4px 10px",
                        opacity: i === 0 ? 0.3 : 1,
                        minHeight: 32,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOrder(i, 1)}
                      disabled={i === manualOrder.length - 1}
                      className="btn-ghost btn-sm"
                      style={{
                        padding: "4px 10px",
                        opacity: i === manualOrder.length - 1 ? 0.3 : 1,
                        minHeight: 32,
                      }}
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label>Notes (optionnel)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: tontine annuelle…"
            />
          </div>

          <div className="info" style={{ fontSize: 12 }}>
            ℹ️ {group.members.length} tour(s) ·{" "}
            {(
              parseFloat(contributionAmount || "0") *
              (group.members.length - 1)
            ).toFixed(2)}{" "}
            {group.defaultCurrency} par tour
          </div>

          <button className="btn btn-block" onClick={createTontine}>
            ✓ Créer & démarrer
          </button>
        </div>
      )}

      {/* === Tontine existante === */}
      {tontine && (
        <>
          {/* Hero card : montant principal */}
          <div className="hero-card">
            <div className="label">Cotisation par tour</div>
            <div className="amount">
              {parseFloat(tontine.contributionAmount).toFixed(2)}
              <span className="unit">{tontine.currency}</span>
            </div>
            <div className="row" style={{ color: "var(--cream-soft)" }}>
              <span>
                {tontine.frequency === "WEEKLY"
                  ? "Hebdo"
                  : tontine.frequency === "BIWEEKLY"
                    ? "Bi-hebdo"
                    : "Mensuelle"}
              </span>
              <span>·</span>
              <span>
                Démarrée le{" "}
                {new Date(tontine.startDate).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                })}
              </span>
            </div>
            {/* Stats */}
            <div className="stats">
              <div className="stat">
                <div className="v">
                  {tontine.stats.completedTurns}/{tontine.stats.totalTurns}
                </div>
                <div className="l">Tours</div>
              </div>
              <div className="stat">
                <div
                  className="v"
                  style={{ color: "var(--emerald-soft)" }}
                >
                  {tontine.stats.confirmedCount}
                </div>
                <div className="l">Conf.</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--gold)" }}>
                  {tontine.stats.paidCount}
                </div>
                <div className="l">Payées</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--rose)" }}>
                  {tontine.stats.pendingCount}
                </div>
                <div className="l">Att.</div>
              </div>
            </div>
            {tontine.status === "ACTIVE" && (
              <button
                className="btn-ghost btn-sm btn-block"
                onClick={cancel}
                style={{ marginTop: 12 }}
              >
                ✗ Annuler la tontine
              </button>
            )}
          </div>

          {/* Liste des tours */}
          {tontine.turns.map((turn: any) => (
            <div key={turn.id} className="card">
              <div className="card-head">
                <h2>
                  Tour {turn.turnNumber}
                  {turn.status === "IN_PROGRESS" && (
                    <span
                      className="chip chip-saffron"
                      style={{ marginLeft: 8, fontSize: 9 }}
                    >
                      🔵 En cours
                    </span>
                  )}
                  {turn.status === "DISTRIBUTED" && (
                    <span
                      className="chip chip-emerald"
                      style={{ marginLeft: 8, fontSize: 9 }}
                    >
                      ✓ Distribué
                    </span>
                  )}
                </h2>
                <span className="muted" style={{ fontSize: 11 }}>
                  {new Date(turn.dueDate).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>

              {/* Bénéficiaire */}
              <div
                style={{
                  background:
                    "linear-gradient(135deg,rgba(232,163,61,0.12),rgba(181,70,46,0.05))",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    flexShrink: 0,
                  }}
                >
                  🎁
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--gold)",
                      letterSpacing: 1.4,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Bénéficiaire
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontFamily: "Cormorant Garamond, serif",
                      color: "var(--cream)",
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {turn.beneficiary.displayName}
                    {me?.id === turn.beneficiary.id && (
                      <span
                        style={{
                          color: "var(--saffron)",
                          fontSize: 10,
                          marginLeft: 6,
                          letterSpacing: 1,
                        }}
                      >
                        TOI
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontFamily: "Cormorant Garamond, serif",
                    color: "var(--saffron)",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {turn.contributions.length > 0
                    ? (
                        parseFloat(turn.contributions[0].amount) *
                        turn.contributions.length
                      ).toFixed(2)
                    : "0"}{" "}
                  {tontine.currency}
                </div>
              </div>

              {/* Cotisations */}
              <div className="list">
                {turn.contributions.map((c: any) => {
                  const isMe = me?.id === c.contributor.id;
                  const canMarkPaid = isMe && c.status === "PENDING";
                  const canConfirm =
                    c.status === "PAID" &&
                    (me?.id === turn.beneficiary.id ||
                      group.members.find(
                        (m: any) => m.user.id === me?.id,
                      )?.role === "ADMIN");

                  return (
                    <div key={c.id} className="list-item">
                      <div className="icon">
                        {c.contributor.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="text">
                        <div className="name">
                          {c.contributor.displayName}
                          {isMe && (
                            <span
                              style={{
                                color: "var(--saffron)",
                                fontSize: 9,
                                marginLeft: 6,
                                letterSpacing: 1,
                              }}
                            >
                              MOI
                            </span>
                          )}
                        </div>
                        <div className="meta">
                          {c.status === "PENDING" && "⏳ En attente"}
                          {c.status === "PAID" && (
                            <>
                              ✓ Payée
                              {c.paymentMethod && ` · ${c.paymentMethod}`}
                            </>
                          )}
                          {c.status === "CONFIRMED" && "✓✓ Confirmée"}
                          {c.status === "MISSED" && "✗ Manquée"}
                        </div>
                      </div>
                      {!canMarkPaid && !canConfirm && (
                        <div
                          className={`amount ${c.status === "CONFIRMED" ? "amount-pos" : ""}`}
                          style={{ fontSize: 14 }}
                        >
                          {c.amount}
                        </div>
                      )}
                      {canMarkPaid && (
                        <button
                          className="btn btn-sm"
                          onClick={() => markPaid(c.id)}
                        >
                          💸 J'ai payé
                        </button>
                      )}
                      {canConfirm && (
                        <button
                          className="btn btn-sm"
                          onClick={() => confirm(c.id)}
                          style={{
                            background:
                              "linear-gradient(135deg,var(--emerald),var(--indigo-2))",
                          }}
                        >
                          ✓ Confirmer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Distribution */}
              {turn.status === "IN_PROGRESS" &&
                turn.contributions.length > 0 &&
                turn.contributions.every(
                  (c: any) => c.status === "CONFIRMED",
                ) && (
                  <button
                    className="btn btn-block"
                    onClick={() => distribute(turn.id)}
                    style={{ marginTop: 10 }}
                  >
                    🎁 Distribuer le pot à {turn.beneficiary.displayName}
                  </button>
                )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
