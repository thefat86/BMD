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

export default function TontinePage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [tontine, setTontine] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Form de création
  const [showCreate, setShowCreate] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("250");
  const [frequency, setFrequency] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("MONTHLY");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
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
      // pré-remplir l'ordre par défaut
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

      // Activer immédiatement avec l'ordre choisi
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
    if (!confirm) return;
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

  if (!group) {
    return (
      <div className="container">
        <p>Chargement…</p>
      </div>
    );
  }

  // Helpers d'affichage
  const statusBadge: Record<Status, { color: string; label: string }> = {
    DRAFT: { color: "var(--gold)", label: "Brouillon" },
    ACTIVE: { color: "var(--saffron)", label: "🟢 Active" },
    COMPLETED: { color: "var(--emerald)", label: "✓ Terminée" },
    CANCELLED: { color: "#D9714A", label: "Annulée" },
  };

  function memberName(userId: string): string {
    return (
      group.members.find((m: any) => m.user.id === userId)?.user.displayName ??
      "?"
    );
  }

  return (
    <div className="container">
      <Link
        href={`/dashboard/groups/${groupId}`}
        className="btn-ghost"
        style={{ display: "inline-block", marginBottom: 18 }}
      >
        ← Retour au groupe
      </Link>

      <div className="brand">
        🪙{" "}
        <span style={{ color: "var(--cream)" }}>
          Tontine · {group.name}
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      {/* ========== Pas de tontine encore ========== */}
      {!tontine && !showCreate && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 60, marginBottom: 14 }}>🪙</div>
          <h2 style={{ marginBottom: 10 }}>Aucune tontine pour ce groupe</h2>
          <p style={{ color: "var(--cream-soft)", marginBottom: 24 }}>
            Crée une tontine pour démarrer une épargne collective rotative entre
            les <strong>{group.members.length} membres</strong> du groupe.
          </p>
          <button
            className="btn"
            onClick={() => setShowCreate(true)}
            disabled={group.members.length < 2}
          >
            + Créer une tontine
          </button>
          {group.members.length < 2 && (
            <p
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              Il faut au moins 2 membres dans le groupe.
            </p>
          )}
        </div>
      )}

      {/* ========== Form de création ========== */}
      {!tontine && showCreate && (
        <div className="card">
          <h2>Nouvelle tontine</h2>
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
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setOrderMode("MANUAL")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  border:
                    orderMode === "MANUAL"
                      ? "1px solid var(--saffron)"
                      : "1px solid var(--line-soft)",
                  background:
                    orderMode === "MANUAL"
                      ? "rgba(232,163,61,0.15)"
                      : "rgba(255,255,255,0.04)",
                  color:
                    orderMode === "MANUAL"
                      ? "var(--saffron)"
                      : "var(--cream-soft)",
                  cursor: "pointer",
                }}
              >
                ✋ Manuel (je choisis)
              </button>
              <button
                type="button"
                onClick={() => setOrderMode("RANDOM")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  border:
                    orderMode === "RANDOM"
                      ? "1px solid var(--saffron)"
                      : "1px solid var(--line-soft)",
                  background:
                    orderMode === "RANDOM"
                      ? "rgba(232,163,61,0.15)"
                      : "rgba(255,255,255,0.04)",
                  color:
                    orderMode === "RANDOM"
                      ? "var(--saffron)"
                      : "var(--cream-soft)",
                  cursor: "pointer",
                }}
              >
                🎲 Tirage au sort
              </button>
            </div>
          </div>

          {orderMode === "MANUAL" && (
            <div className="field">
              <label>Ordre des tours (1er en haut)</label>
              <div
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                {manualOrder.map((userId, i) => (
                  <div
                    key={userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "rgba(232,163,61,0.05)",
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
                        fontSize: 13,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      {memberName(userId)}
                    </div>
                    <button
                      type="button"
                      onClick={() => moveOrder(i, -1)}
                      disabled={i === 0}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 6,
                        color: "var(--cream-soft)",
                        padding: "4px 10px",
                        cursor: i === 0 ? "not-allowed" : "pointer",
                        opacity: i === 0 ? 0.4 : 1,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOrder(i, 1)}
                      disabled={i === manualOrder.length - 1}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 6,
                        color: "var(--cream-soft)",
                        padding: "4px 10px",
                        cursor:
                          i === manualOrder.length - 1
                            ? "not-allowed"
                            : "pointer",
                        opacity: i === manualOrder.length - 1 ? 0.4 : 1,
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
              placeholder="Ex: tontine annuelle, paiements le 28 du mois…"
            />
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 12,
              marginBottom: 12,
              background: "rgba(63,125,92,0.12)",
              border: "1px solid var(--emerald)",
              color: "#7DC59E",
            }}
          >
            ✓ Sera créée avec {group.members.length} tour(s) ·{" "}
            {(parseFloat(contributionAmount || "0") *
              (group.members.length - 1)).toFixed(2)}{" "}
            {group.defaultCurrency} par tour
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn-ghost"
              onClick={() => setShowCreate(false)}
              style={{ flex: 1 }}
            >
              Annuler
            </button>
            <button className="btn" onClick={createTontine} style={{ flex: 2 }}>
              ✓ Créer & démarrer
            </button>
          </div>
        </div>
      )}

      {/* ========== Tontine existe : affichage ========== */}
      {tontine && (
        <>
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <h2 style={{ marginBottom: 4 }}>
                  {tontine.contributionAmount} {tontine.currency} par tour
                </h2>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {tontine.frequency === "WEEKLY"
                    ? "Hebdomadaire"
                    : tontine.frequency === "BIWEEKLY"
                      ? "Bi-hebdomadaire"
                      : "Mensuelle"}{" "}
                  · démarrée le{" "}
                  {new Date(tontine.startDate).toLocaleDateString("fr-FR")}
                </div>
              </div>
              <div
                style={{
                  padding: "6px 14px",
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  background: "rgba(232,163,61,0.1)",
                  color: statusBadge[tontine.status as Status].color,
                  border: `1px solid ${statusBadge[tontine.status as Status].color}`,
                }}
              >
                {statusBadge[tontine.status as Status].label}
              </div>
            </div>

            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 10,
                marginTop: 18,
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  padding: 12,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontFamily: "Cormorant Garamond, serif",
                    color: "var(--saffron)",
                    fontWeight: 700,
                  }}
                >
                  {tontine.stats.completedTurns}/{tontine.stats.totalTurns}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)" }}>
                  TOURS DISTRIBUÉS
                </div>
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  padding: 12,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontFamily: "Cormorant Garamond, serif",
                    color: "#7DC59E",
                    fontWeight: 700,
                  }}
                >
                  {tontine.stats.confirmedCount}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)" }}>
                  CONFIRMÉES
                </div>
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  padding: 12,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontFamily: "Cormorant Garamond, serif",
                    color: "var(--gold)",
                    fontWeight: 700,
                  }}
                >
                  {tontine.stats.paidCount}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)" }}>PAYÉES</div>
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  padding: 12,
                  borderRadius: 10,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontFamily: "Cormorant Garamond, serif",
                    color: "#D9714A",
                    fontWeight: 700,
                  }}
                >
                  {tontine.stats.pendingCount}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)" }}>
                  EN ATTENTE
                </div>
              </div>
            </div>

            {tontine.status === "ACTIVE" && (
              <button
                className="btn-ghost"
                onClick={cancel}
                style={{ marginTop: 14, width: "100%" }}
              >
                ✗ Annuler la tontine
              </button>
            )}
          </div>

          {/* Liste des tours */}
          {tontine.turns.map((turn: any) => (
            <div key={turn.id} className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h2 style={{ marginBottom: 0, fontSize: 20 }}>
                  Tour {turn.turnNumber}
                  {turn.status === "IN_PROGRESS" && (
                    <span
                      style={{ marginLeft: 10, color: "var(--saffron)", fontSize: 12 }}
                    >
                      🔵 En cours
                    </span>
                  )}
                  {turn.status === "DISTRIBUTED" && (
                    <span
                      style={{
                        marginLeft: 10,
                        color: "var(--emerald)",
                        fontSize: 12,
                      }}
                    >
                      ✓ Distribué
                    </span>
                  )}
                </h2>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Échéance : {new Date(turn.dueDate).toLocaleDateString("fr-FR")}
                </div>
              </div>

              <div
                style={{
                  background:
                    "linear-gradient(135deg,rgba(232,163,61,0.1),rgba(181,70,46,0.05))",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 32 }}>🎁</div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--gold)",
                      letterSpacing: 1.5,
                      fontWeight: 700,
                    }}
                  >
                    BÉNÉFICIAIRE DE CE TOUR
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontFamily: "Cormorant Garamond, serif",
                      color: "var(--cream)",
                      fontWeight: 700,
                    }}
                  >
                    {turn.beneficiary.displayName}
                    {me?.id === turn.beneficiary.id && (
                      <span style={{ color: "var(--saffron)", fontSize: 12 }}>
                        {" "}
                        (toi !)
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontFamily: "Cormorant Garamond, serif",
                    color: "var(--saffron)",
                    fontWeight: 700,
                  }}
                >
                  {turn.contributions.length > 0
                    ? (
                        parseFloat(turn.contributions[0].amount) *
                        turn.contributions.length
                      ).toFixed(2)
                    : "0.00"}{" "}
                  {tontine.currency}
                </div>
              </div>

              {/* Contributions */}
              {turn.contributions.map((c: any) => {
                const isMe = me?.id === c.contributor.id;
                const canMarkPaid = isMe && c.status === "PENDING";
                const canConfirm =
                  c.status === "PAID" &&
                  (me?.id === turn.beneficiary.id ||
                    group.members.find((m: any) => m.user.id === me?.id)?.role ===
                      "ADMIN");

                return (
                  <div key={c.id} className="list-item">
                    <div className="name">
                      {c.contributor.displayName}
                      {isMe && (
                        <span
                          style={{ color: "var(--saffron)", fontSize: 10, marginLeft: 6 }}
                        >
                          (toi)
                        </span>
                      )}
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                        {c.status === "PENDING" && "⏳ En attente de paiement"}
                        {c.status === "PAID" && (
                          <>
                            ✓ Payée · attente confirmation
                            {c.paymentMethod && ` (${c.paymentMethod})`}
                          </>
                        )}
                        {c.status === "CONFIRMED" && "✓✓ Confirmée"}
                        {c.status === "MISSED" && "✗ Manquée"}
                      </div>
                    </div>
                    <div className="amount" style={{ fontSize: 14 }}>
                      {c.amount} {tontine.currency}
                    </div>
                    {canMarkPaid && (
                      <button
                        className="btn"
                        onClick={() => markPaid(c.id)}
                        style={{ padding: "6px 12px", fontSize: 11 }}
                      >
                        💸 J'ai payé
                      </button>
                    )}
                    {canConfirm && (
                      <button
                        className="btn"
                        onClick={() => confirm(c.id)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 11,
                          background:
                            "linear-gradient(135deg,#3F7D5C,#2A2244)",
                        }}
                      >
                        ✓ Confirmer
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Bouton distribuer le pot */}
              {turn.status === "IN_PROGRESS" &&
                turn.contributions.every((c: any) => c.status === "CONFIRMED") &&
                turn.contributions.length > 0 && (
                  <button
                    className="btn"
                    onClick={() => distribute(turn.id)}
                    style={{ width: "100%", marginTop: 10 }}
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
