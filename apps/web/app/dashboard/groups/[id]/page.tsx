"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../../lib/api-client";

type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE";

interface Member {
  id: string;
  role: string;
  user: { id: string; displayName: string; avatar?: string | null };
}

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite
  const [showInvite, setShowInvite] = useState(false);
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");

  // Add expense
  const [showExpense, setShowExpense] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>("");
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  // userId -> selected
  const [participants, setParticipants] = useState<Record<string, boolean>>({});
  // userId -> share value (montant for UNEQUAL, % for PERCENTAGE)
  const [shares, setShares] = useState<Record<string, string>>({});

  // Active swap state (M09)
  const [activeSwap, setActiveSwap] = useState<any>(null);

  async function refresh() {
    try {
      const [m, g, e, b, swaps] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.getBalance(groupId),
        api.listSwaps(groupId, false),
      ]);
      setMe(m.user);
      setGroup(g);
      setExpenses(e);
      setBalance(b);
      setActiveSwap(swaps[0] ?? null); // au plus 1 swap actif à la fois
    } catch (er) {
      if (isUnauthorized(er)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((er as Error).message);
    }
  }

  async function proposeSwap() {
    setError(null);
    try {
      await api.proposeSwap(groupId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function acceptSwap() {
    setError(null);
    try {
      await api.acceptSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rejectSwap() {
    setError(null);
    try {
      await api.rejectSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancelSwap() {
    if (!window.confirm("Annuler la proposition de swap ?")) return;
    try {
      await api.cancelSwap(activeSwap.id);
      void refresh();
    } catch (e) {
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

  // Quand on ouvre le panneau "ajouter dépense" : précocher tout le monde + définir le payeur par défaut
  useEffect(() => {
    if (!group || !me) return;
    if (showExpense) {
      const allSelected: Record<string, boolean> = {};
      group.members.forEach((m: Member) => {
        allSelected[m.user.id] = true;
      });
      setParticipants(allSelected);
      setShares({});
      // Le payeur par défaut = l'utilisateur connecté s'il est membre, sinon le 1er membre
      const meIsMember = group.members.some((m: Member) => m.user.id === me.id);
      setPaidByUserId(meIsMember ? me.id : group.members[0]?.user.id ?? "");
    }
  }, [showExpense, group, me]);

  function toggleParticipant(userId: string) {
    setParticipants((p) => ({ ...p, [userId]: !p[userId] }));
  }

  function setShare(userId: string, value: string) {
    setShares((s) => ({ ...s, [userId]: value }));
  }

  // Liste des participants sélectionnés
  const selectedIds = useMemo(
    () => Object.keys(participants).filter((id) => participants[id]),
    [participants],
  );

  // Calcul de validation en temps réel selon le mode
  const validation = useMemo(() => {
    const amt = parseFloat(amount);
    if (!description.trim()) return { ok: false, msg: "Description requise" };
    if (!amt || amt <= 0) return { ok: false, msg: "Montant doit être > 0" };
    if (selectedIds.length === 0)
      return { ok: false, msg: "Sélectionne au moins 1 participant" };
    if (!paidByUserId) return { ok: false, msg: "Choisis qui a payé" };

    if (splitMode === "EQUAL") {
      const each = (amt / selectedIds.length).toFixed(2);
      return { ok: true, msg: `${each} € par personne · ${selectedIds.length} participant(s)` };
    }

    if (splitMode === "UNEQUAL") {
      const total = selectedIds.reduce(
        (acc, id) => acc + (parseFloat(shares[id] || "0") || 0),
        0,
      );
      const diff = Math.abs(total - amt);
      if (diff > 0.01) {
        return {
          ok: false,
          msg: `Somme des parts: ${total.toFixed(2)} € · doit être ${amt.toFixed(2)} € (écart ${diff.toFixed(2)} €)`,
        };
      }
      return { ok: true, msg: `Somme des parts: ${total.toFixed(2)} € ✓` };
    }

    // PERCENTAGE
    const totalPct = selectedIds.reduce(
      (acc, id) => acc + (parseFloat(shares[id] || "0") || 0),
      0,
    );
    if (Math.abs(totalPct - 100) > 0.01) {
      return {
        ok: false,
        msg: `Somme: ${totalPct.toFixed(1)} % · doit être 100 % (écart ${(100 - totalPct).toFixed(1)} %)`,
      };
    }
    return { ok: true, msg: `Somme: ${totalPct.toFixed(1)} % ✓` };
  }, [description, amount, selectedIds, paidByUserId, splitMode, shares]);

  async function invite() {
    setError(null);
    try {
      await api.inviteMember(groupId, contactType, contactValue);
      setShowInvite(false);
      setContactValue("+33");
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addExpense() {
    setError(null);
    if (!validation.ok) {
      setError(validation.msg);
      return;
    }
    try {
      const payload: any = {
        description,
        amount,
        paidByUserId,
        splitMode,
        participants:
          splitMode === "EQUAL"
            ? selectedIds.map((id) => ({ userId: id }))
            : selectedIds.map((id) => ({
                userId: id,
                share: parseFloat(shares[id] || "0"),
              })),
      };
      await api.createExpense(groupId, payload);
      setShowExpense(false);
      setDescription("");
      setAmount("");
      setShares({});
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Helper : préremplir les parts (UNEQUAL) ou pourcentages (PERCENTAGE) en parts égales
  function autoFillShares() {
    if (selectedIds.length === 0) return;
    const next: Record<string, string> = {};
    if (splitMode === "UNEQUAL") {
      const amt = parseFloat(amount) || 0;
      const each = (amt / selectedIds.length).toFixed(2);
      selectedIds.forEach((id) => (next[id] = each));
    } else if (splitMode === "PERCENTAGE") {
      const each = (100 / selectedIds.length).toFixed(2);
      selectedIds.forEach((id) => (next[id] = each));
    }
    setShares(next);
  }

  if (!group)
    return (
      <div className="container">
        <p>Chargement…</p>
      </div>
    );

  return (
    <div className="container">
      <Link
        href="/dashboard"
        className="btn-ghost"
        style={{ display: "inline-block", marginBottom: 18 }}
      >
        ← Retour
      </Link>

      <div className="brand">
        <span style={{ color: "var(--cream)" }}>{group.name}</span>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Quick links vers les sous-modules */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/dashboard/groups/${groupId}/tontine`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 20px",
            borderRadius: 12,
            background:
              "linear-gradient(135deg,rgba(232,163,61,0.15),rgba(181,70,46,0.1))",
            border: "1px solid var(--saffron)",
            color: "var(--saffron)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          🪙 Tontine →
        </Link>
      </div>

      {/* Members + invite */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ marginBottom: 0 }}>👥 Membres ({group.members.length})</h2>
          <button className="btn" onClick={() => setShowInvite(!showInvite)}>
            {showInvite ? "Annuler" : "+ Inviter"}
          </button>
        </div>
        {showInvite && (
          <div style={{ marginTop: 18 }}>
            <div className="field">
              <label>Type</label>
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as any)}
              >
                <option value="PHONE">Téléphone</option>
                <option value="EMAIL">Email</option>
              </select>
            </div>
            <div className="field">
              <label>{contactType === "PHONE" ? "Numéro" : "Email"}</label>
              <input
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
              />
            </div>
            <button className="btn" onClick={invite} style={{ width: "100%" }}>
              ✓ Inviter
            </button>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          {group.members.map((m: Member) => (
            <div key={m.id} className="list-item">
              <div className="name">
                {m.user.displayName}
                {me?.id === m.user.id && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      letterSpacing: 1,
                      color: "var(--saffron)",
                      textTransform: "uppercase",
                    }}
                  >
                    · toi
                  </span>
                )}
              </div>
              <div className="meta">{m.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Balances */}
      {balance && (
        <div className="card">
          <h2>⚖ Soldes ({balance.currency})</h2>
          {balance.balances.map((b: any) => (
            <div key={b.userId} className="list-item">
              <div className="name">{b.displayName}</div>
              <div
                className="amount"
                style={{ color: parseFloat(b.net) < 0 ? "#D9714A" : undefined }}
              >
                {parseFloat(b.net) > 0 ? "+" : ""}
                {b.net} {balance.currency}
              </div>
            </div>
          ))}

          {balance.suggestions.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h2 style={{ fontSize: 18 }}>↔ Règlements suggérés</h2>
              {balance.suggestions.map((s: any, i: number) => (
                <div key={i} className="list-item">
                  <div className="name">
                    {s.fromName} → {s.toName}
                  </div>
                  <div className="amount">
                    {s.amount} {s.currency}
                  </div>
                </div>
              ))}

              {/* Bouton Proposer Swap (M09) — si pas de swap actif */}
              {!activeSwap && (
                <button
                  className="btn"
                  onClick={proposeSwap}
                  style={{ width: "100%", marginTop: 12 }}
                >
                  ⇄ Proposer un swap (compensation officielle)
                </button>
              )}
            </div>
          )}

          {/* === Swap actif (M09) === */}
          {activeSwap && (
            <div
              style={{
                marginTop: 18,
                padding: 18,
                background:
                  "linear-gradient(135deg,rgba(232,163,61,0.1),rgba(181,70,46,0.05))",
                border: "1.5px solid var(--saffron)",
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <h2 style={{ marginBottom: 0, fontSize: 18, color: "var(--saffron)" }}>
                  ⇄ Swap proposé
                </h2>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--gold)",
                    background: "rgba(232,163,61,0.15)",
                    padding: "3px 10px",
                    borderRadius: 99,
                    border: "1px solid var(--gold)",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  Expire {new Date(activeSwap.expiresAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <p style={{ color: "var(--cream-soft)", fontSize: 13, marginBottom: 14 }}>
                {activeSwap.description ?? "Compensation des dettes"}.{" "}
                Une fois accepté par tous, devient le plan de règlement officiel.
              </p>

              {/* Legs */}
              <div style={{ marginBottom: 14 }}>
                {activeSwap.legs.map((l: any, i: number) => {
                  const fromName =
                    activeSwap.participants.find((p: any) => p.userId === l.fromUserId)
                      ?.displayName ?? "?";
                  const toName =
                    activeSwap.participants.find((p: any) => p.userId === l.toUserId)
                      ?.displayName ?? "?";
                  return (
                    <div key={i} className="list-item">
                      <div className="name">
                        {fromName} → {toName}
                      </div>
                      <div className="amount">
                        {l.amount} {l.currency}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Acceptations */}
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
                {activeSwap.participants.map((p: any) => (
                  <span
                    key={p.id}
                    style={{
                      display: "inline-block",
                      padding: "3px 9px",
                      margin: "2px",
                      borderRadius: 99,
                      background: p.acceptedAt
                        ? "rgba(63,125,92,0.15)"
                        : p.rejectedAt
                          ? "rgba(217,113,74,0.15)"
                          : "rgba(255,255,255,0.05)",
                      color: p.acceptedAt
                        ? "#7DC59E"
                        : p.rejectedAt
                          ? "#D9714A"
                          : "var(--cream-soft)",
                      border: `1px solid ${
                        p.acceptedAt
                          ? "rgba(63,125,92,0.3)"
                          : p.rejectedAt
                            ? "rgba(217,113,74,0.3)"
                            : "var(--line-soft)"
                      }`,
                      fontSize: 11,
                    }}
                  >
                    {p.acceptedAt ? "✓" : p.rejectedAt ? "✗" : "⏳"} {p.displayName}
                  </span>
                ))}
              </div>

              {/* Mes actions */}
              {(() => {
                const myPart = activeSwap.participants.find(
                  (p: any) => p.userId === me?.id,
                );
                if (!myPart) return null;
                if (myPart.acceptedAt) {
                  return (
                    <div
                      style={{
                        background: "rgba(63,125,92,0.12)",
                        border: "1px solid var(--emerald)",
                        color: "#7DC59E",
                        padding: 10,
                        borderRadius: 8,
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      ✓ Tu as accepté ce swap
                    </div>
                  );
                }
                if (myPart.rejectedAt) {
                  return (
                    <div
                      style={{
                        background: "rgba(217,113,74,0.12)",
                        border: "1px solid #D9714A",
                        color: "#D9714A",
                        padding: 10,
                        borderRadius: 8,
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      ✗ Tu as refusé ce swap
                    </div>
                  );
                }
                return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn-ghost"
                      onClick={rejectSwap}
                      style={{ flex: 1 }}
                    >
                      ✗ Refuser
                    </button>
                    <button
                      className="btn"
                      onClick={acceptSwap}
                      style={{ flex: 2 }}
                    >
                      ✓ Accepter
                    </button>
                  </div>
                );
              })()}

              {activeSwap.proposedById === me?.id && (
                <button
                  className="btn-ghost"
                  onClick={cancelSwap}
                  style={{ width: "100%", marginTop: 8 }}
                >
                  Annuler ma proposition
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expenses */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ marginBottom: 0 }}>🧾 Dépenses ({expenses.length})</h2>
          <button className="btn" onClick={() => setShowExpense(!showExpense)}>
            {showExpense ? "Annuler" : "+ Dépense"}
          </button>
        </div>

        {showExpense && (
          <div style={{ marginTop: 18 }}>
            {/* Description */}
            <div className="field">
              <label>Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Resto, courses, hôtel…"
              />
            </div>

            {/* Montant */}
            <div className="field">
              <label>Montant ({group.defaultCurrency})</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="60.00"
                inputMode="decimal"
              />
            </div>

            {/* Payeur */}
            <div className="field">
              <label>Qui a payé ?</label>
              <select
                value={paidByUserId}
                onChange={(e) => setPaidByUserId(e.target.value)}
              >
                {group.members.map((m: Member) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.displayName}
                    {me?.id === m.user.id ? " (moi)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode de partage */}
            <div className="field">
              <label>Mode de partage</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { v: "EQUAL", label: "🟰 Égal" },
                  { v: "UNEQUAL", label: "✏️ Parts inégales (€)" },
                  { v: "PERCENTAGE", label: "％ Pourcentages" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => {
                      setSplitMode(opt.v as SplitMode);
                      setShares({});
                    }}
                    style={{
                      flex: 1,
                      minWidth: 110,
                      padding: "10px 12px",
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      border:
                        splitMode === opt.v
                          ? "1px solid var(--saffron)"
                          : "1px solid var(--line-soft)",
                      background:
                        splitMode === opt.v
                          ? "rgba(232,163,61,0.15)"
                          : "rgba(255,255,255,0.04)",
                      color:
                        splitMode === opt.v
                          ? "var(--saffron)"
                          : "var(--cream-soft)",
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sélection des participants */}
            <div className="field">
              <label>
                Qui participe à cette dépense ? ({selectedIds.length}/
                {group.members.length})
              </label>
              <div
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                {group.members.map((m: Member) => {
                  const isSelected = !!participants[m.user.id];
                  return (
                    <div
                      key={m.user.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background: isSelected
                          ? "rgba(232,163,61,0.08)"
                          : "transparent",
                      }}
                      onClick={() => toggleParticipant(m.user.id)}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: "1.5px solid var(--saffron)",
                          background: isSelected
                            ? "var(--saffron)"
                            : "transparent",
                          color: "#16111e",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {isSelected ? "✓" : ""}
                      </div>
                      <div style={{ flex: 1, fontSize: 13 }}>
                        {m.user.displayName}
                        {me?.id === m.user.id && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: "var(--saffron)",
                            }}
                          >
                            (moi)
                          </span>
                        )}
                      </div>

                      {/* Champ de saisie pour UNEQUAL ou PERCENTAGE */}
                      {isSelected && splitMode !== "EQUAL" && (
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 4 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            value={shares[m.user.id] || ""}
                            onChange={(e) =>
                              setShare(m.user.id, e.target.value)
                            }
                            placeholder={splitMode === "UNEQUAL" ? "0.00" : "0"}
                            inputMode="decimal"
                            style={{
                              width: 80,
                              padding: "6px 8px",
                              fontSize: 12,
                              background: "rgba(0,0,0,0.3)",
                              border: "1px solid var(--line-soft)",
                              borderRadius: 6,
                              color: "var(--cream)",
                              textAlign: "right",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--muted)",
                              width: 20,
                            }}
                          >
                            {splitMode === "UNEQUAL"
                              ? group.defaultCurrency.slice(0, 2)
                              : "%"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {splitMode !== "EQUAL" && selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={autoFillShares}
                  style={{
                    marginTop: 8,
                    padding: "6px 12px",
                    fontSize: 11,
                    background: "transparent",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 8,
                    color: "var(--cream-soft)",
                    cursor: "pointer",
                  }}
                >
                  ⚖ Pré-remplir en parts égales
                </button>
              )}
            </div>

            {/* Validation en temps réel */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 12,
                marginBottom: 12,
                background: validation.ok
                  ? "rgba(63,125,92,0.12)"
                  : "rgba(217,113,74,0.12)",
                border: validation.ok
                  ? "1px solid var(--emerald)"
                  : "1px solid #d9714a",
                color: validation.ok ? "#7DC59E" : "#D9714A",
              }}
            >
              {validation.ok ? "✓ " : "⚠ "}
              {validation.msg}
            </div>

            <button
              className="btn"
              onClick={addExpense}
              disabled={!validation.ok}
              style={{ width: "100%", opacity: validation.ok ? 1 : 0.5 }}
            >
              ✓ Ajouter la dépense
            </button>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {expenses.map((e: any) => (
            <div key={e.id} className="list-item">
              <div>
                <div className="name">{e.description}</div>
                <div className="meta">
                  Payé par <strong>{e.paidBy.displayName}</strong> ·{" "}
                  {e.shares.length} participant(s) · {e.splitMode} ·{" "}
                  {new Date(e.occurredAt).toLocaleDateString("fr-FR")}
                </div>
              </div>
              <div style={{ marginLeft: "auto" }} className="amount">
                {e.amount} {e.currency}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
