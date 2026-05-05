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
  joinedAt?: string;
  user: { id: string; displayName: string; avatar?: string | null };
}

const GROUP_TYPE_ICONS: Record<string, string> = {
  TONTINE: "🪙",
  COLOC: "🏠",
  TRAVEL: "✈️",
  EVENT: "💍",
  CLUB: "⚽",
  PARISH: "⛪",
  GENERIC: "📁",
};

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSwap, setActiveSwap] = useState<any>(null);

  // Un seul panel ouvert à la fois (mobile-friendly)
  const [openPanel, setOpenPanel] = useState<"none" | "invite" | "expense">(
    "none",
  );

  // Invite
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");

  // Expense form
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>("");
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [participants, setParticipants] = useState<Record<string, boolean>>({});
  const [shares, setShares] = useState<Record<string, string>>({});

  // OCR
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    merchant: string | null;
    confidence: number;
  } | null>(null);

  // Split presets (M10)
  const [presets, setPresets] = useState<any[]>([]);

  async function refresh() {
    try {
      const [m, g, e, b, swaps, ps] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.getBalance(groupId),
        api.listSwaps(groupId, false),
        api.listPresets(groupId),
      ]);
      setMe(m.user);
      setGroup(g);
      setExpenses(e);
      setBalance(b);
      setActiveSwap(swaps[0] ?? null);
      setPresets(ps);
    } catch (er) {
      if (isUnauthorized(er)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((er as Error).message);
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

  // Init form expense
  useEffect(() => {
    if (!group || !me) return;
    if (openPanel === "expense") {
      const all: Record<string, boolean> = {};
      group.members.forEach((m: Member) => (all[m.user.id] = true));
      setParticipants(all);
      setShares({});
      const meIsMember = group.members.some(
        (m: Member) => m.user.id === me.id,
      );
      setPaidByUserId(meIsMember ? me.id : group.members[0]?.user.id ?? "");
    }
  }, [openPanel, group, me]);

  function toggleParticipant(userId: string) {
    setParticipants((p) => ({ ...p, [userId]: !p[userId] }));
  }
  function setShare(userId: string, value: string) {
    setShares((s) => ({ ...s, [userId]: value }));
  }
  const selectedIds = useMemo(
    () => Object.keys(participants).filter((id) => participants[id]),
    [participants],
  );

  const validation = useMemo(() => {
    const amt = parseFloat(amount);
    if (!description.trim()) return { ok: false, msg: "Description requise" };
    if (!amt || amt <= 0) return { ok: false, msg: "Montant > 0 requis" };
    if (selectedIds.length === 0)
      return { ok: false, msg: "Au moins 1 participant" };
    if (!paidByUserId) return { ok: false, msg: "Choisis qui a payé" };

    if (splitMode === "EQUAL") {
      const each = (amt / selectedIds.length).toFixed(2);
      return {
        ok: true,
        msg: `${each} ${group?.defaultCurrency ?? "€"} × ${selectedIds.length}`,
      };
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
          msg: `Somme ${total.toFixed(2)} ≠ ${amt.toFixed(2)}`,
        };
      }
      return { ok: true, msg: `Somme ${total.toFixed(2)} ✓` };
    }
    const totalPct = selectedIds.reduce(
      (acc, id) => acc + (parseFloat(shares[id] || "0") || 0),
      0,
    );
    if (Math.abs(totalPct - 100) > 0.01) {
      return { ok: false, msg: `${totalPct.toFixed(1)} % ≠ 100 %` };
    }
    return { ok: true, msg: `100 % ✓` };
  }, [
    description,
    amount,
    selectedIds,
    paidByUserId,
    splitMode,
    shares,
    group,
  ]);

  async function invite() {
    setError(null);
    try {
      await api.inviteMember(groupId, contactType, contactValue);
      setOpenPanel("none");
      setContactValue(contactType === "PHONE" ? "+33" : "");
      void refresh();
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    }
  }

  function loadPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    // Applique le mode + les participants + les parts du preset
    setSplitMode(preset.splitMode);
    const sel: Record<string, boolean> = {};
    const sh: Record<string, string> = {};
    for (const p of preset.config.participants) {
      sel[p.userId] = true;
      if (p.share !== undefined) sh[p.userId] = String(p.share);
    }
    setParticipants(sel);
    setShares(sh);
    if (preset.config.paidByUserId) {
      setPaidByUserId(preset.config.paidByUserId);
    }
  }

  async function savePreset() {
    if (selectedIds.length === 0) {
      setError("Sélectionne d'abord les participants");
      return;
    }
    const name = window.prompt(
      "Nom du modèle ? (ex: 'Couple seul', 'Comité salle', 'Famille 60% / amis 40%')",
    );
    if (!name?.trim()) return;
    setError(null);
    try {
      const config = {
        paidByUserId,
        participants:
          splitMode === "EQUAL"
            ? selectedIds.map((id) => ({ userId: id }))
            : selectedIds.map((id) => ({
                userId: id,
                share: parseFloat(shares[id] || "0"),
              })),
      };
      await api.createPreset(groupId, {
        name: name.trim(),
        splitMode,
        config,
      });
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deletePreset(presetId: string) {
    if (!window.confirm("Supprimer ce modèle de partage ?")) return;
    try {
      await api.deletePreset(presetId);
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
      setOpenPanel("none");
      setDescription("");
      setAmount("");
      setShares({});
      setScanResult(null);
      void refresh();
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    }
  }

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

  async function scanTicket(file: File) {
    setError(null);
    setScanning(true);
    setScanResult(null);
    try {
      const result = await api.scanReceipt(file);
      if (result.amount) setAmount(result.amount);
      if (result.merchant) setDescription(result.merchant);
      else if (result.category) setDescription(result.category);
      setScanResult({
        merchant: result.merchant,
        confidence: result.confidence,
      });
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(`Échec du scan : ${(e as Error).message}`);
    } finally {
      setScanning(false);
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

  if (!group) {
    return (
      <div className="container">
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  const groupIcon = GROUP_TYPE_ICONS[group.type] ?? "📁";

  return (
    <div className="container">
      {/* Top bar : retour + brand */}
      <div className="between" style={{ marginBottom: 14 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "var(--cream-soft)",
          }}
        >
          ← Mes groupes
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
            <span style={{ marginRight: 8 }}>{groupIcon}</span>
            {group.name}
          </h1>
          <div className="sub">
            {group.members.length} membre{group.members.length > 1 ? "s" : ""}{" "}
            · {group.defaultCurrency} · {group.type.toLowerCase()}
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Quick actions */}
      <div className="quick-row">
        <Link
          href={`/dashboard/groups/${groupId}/tontine`}
          className="quick-card"
        >
          <span className="ico">🪙</span>
          <span className="lbl">Tontine</span>
        </Link>
        <button
          type="button"
          className="quick-card"
          onClick={() =>
            setOpenPanel(openPanel === "expense" ? "none" : "expense")
          }
          style={{
            cursor: "pointer",
            ...(openPanel === "expense" && {
              borderColor: "var(--saffron)",
              background: "rgba(232,163,61,0.18)",
            }),
          }}
        >
          <span className="ico">＋</span>
          <span className="lbl">Dépense</span>
        </button>
        <button
          type="button"
          className="quick-card"
          onClick={() =>
            setOpenPanel(openPanel === "invite" ? "none" : "invite")
          }
          style={{
            cursor: "pointer",
            ...(openPanel === "invite" && {
              borderColor: "var(--saffron)",
              background: "rgba(232,163,61,0.18)",
            }),
          }}
        >
          <span className="ico">👤</span>
          <span className="lbl">Inviter</span>
        </button>
      </div>

      {/* === PANEL : Inviter === */}
      {openPanel === "invite" && (
        <div className="card">
          <div className="card-head">
            <h2>👤 Inviter un membre</h2>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setOpenPanel("none")}
            >
              ✕
            </button>
          </div>
          <div className="field">
            <label>Méthode</label>
            <select
              value={contactType}
              onChange={(e) => {
                const t = e.target.value as "PHONE" | "EMAIL";
                setContactType(t);
                setContactValue(t === "PHONE" ? "+33" : "");
              }}
            >
              <option value="PHONE">📞 Téléphone</option>
              <option value="EMAIL">✉️ Email</option>
            </select>
          </div>
          <div className="field">
            <label>{contactType === "PHONE" ? "Numéro" : "Email"}</label>
            <input
              type={contactType === "EMAIL" ? "email" : "tel"}
              inputMode={contactType === "EMAIL" ? "email" : "tel"}
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              placeholder={
                contactType === "PHONE"
                  ? "+33 6 12 34 56 78"
                  : "ami@exemple.com"
              }
            />
          </div>
          <button className="btn btn-block" onClick={invite}>
            ✓ Inviter
          </button>
        </div>
      )}

      {/* === PANEL : Ajouter dépense === */}
      {openPanel === "expense" && (
        <div className="card">
          <div className="card-head">
            <h2>＋ Nouvelle dépense</h2>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setOpenPanel("none")}
            >
              ✕
            </button>
          </div>

          {/* Charger un preset (M10) */}
          {presets.length > 0 && (
            <div className="field">
              <label>🔖 Charger un partage type</label>
              <select
                onChange={(e) => {
                  if (e.target.value) loadPreset(e.target.value);
                  e.target.value = "";
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Choisis un modèle…
                </option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.config.participants.length}p ·{" "}
                    {p.splitMode === "EQUAL"
                      ? "égal"
                      : p.splitMode === "PERCENTAGE"
                        ? "%"
                        : "parts"}
                    )
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* OCR scan */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1.5px dashed var(--saffron)",
              background:
                "linear-gradient(135deg,rgba(232,163,61,0.08),rgba(181,70,46,0.04))",
              cursor: scanning ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: scanning ? "var(--cream-soft)" : "var(--saffron)",
              marginBottom: 14,
              minHeight: 50,
              opacity: scanning ? 0.7 : 1,
              transition: "all 0.15s",
            }}
          >
            {scanning ? "⏳ Analyse en cours…" : "📷 Scanner ticket ou PDF"}
            <input
              type="file"
              accept="image/*,application/pdf,.pdf"
              disabled={scanning}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void scanTicket(f);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>

          {scanResult && !scanning && (
            <div
              className={scanResult.confidence > 0.6 ? "success" : "info"}
              style={{ fontSize: 12 }}
            >
              ✓ Lu · confiance {Math.round(scanResult.confidence * 100)} %
            </div>
          )}

          <div className="field">
            <label>Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resto, courses, hôtel…"
            />
          </div>

          <div className="field">
            <label>Montant ({group.defaultCurrency})</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="60.00"
              inputMode="decimal"
            />
          </div>

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

          <div className="field">
            <label>Mode de partage</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 6,
              }}
            >
              {[
                { v: "EQUAL", lbl: "🟰 Égal" },
                { v: "UNEQUAL", lbl: "✏️ Parts" },
                { v: "PERCENTAGE", lbl: "% Pourc." },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => {
                    setSplitMode(opt.v as SplitMode);
                    setShares({});
                  }}
                  style={{
                    padding: "10px 4px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    border:
                      splitMode === opt.v
                        ? "1px solid var(--saffron)"
                        : "1px solid var(--line-soft)",
                    background:
                      splitMode === opt.v
                        ? "rgba(232,163,61,0.16)"
                        : "var(--overlay-2)",
                    color:
                      splitMode === opt.v
                        ? "var(--saffron)"
                        : "var(--cream-soft)",
                    cursor: "pointer",
                    minHeight: 42,
                  }}
                >
                  {opt.lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>
              Participants ({selectedIds.length}/{group.members.length})
            </label>
            <div
              style={{
                background: "var(--overlay)",
                border: "1px solid var(--line-soft)",
                borderRadius: 12,
                padding: 6,
              }}
            >
              {group.members.map((m: Member) => {
                const isSel = !!participants[m.user.id];
                return (
                  <div
                    key={m.user.id}
                    onClick={() => toggleParticipant(m.user.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: isSel
                        ? "rgba(232,163,61,0.06)"
                        : "transparent",
                      minHeight: 42,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        border: "1.5px solid var(--saffron)",
                        background: isSel ? "var(--saffron)" : "transparent",
                        color: "#16111e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {isSel ? "✓" : ""}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: "var(--cream)",
                        fontWeight: isSel ? 600 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.user.displayName}
                      {me?.id === m.user.id && (
                        <span
                          style={{
                            color: "var(--saffron)",
                            fontSize: 10,
                            marginLeft: 4,
                          }}
                        >
                          (moi)
                        </span>
                      )}
                    </div>
                    {isSel && splitMode !== "EQUAL" && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <input
                          value={shares[m.user.id] || ""}
                          onChange={(e) =>
                            setShare(m.user.id, e.target.value)
                          }
                          placeholder="0"
                          inputMode="decimal"
                          style={{
                            width: 64,
                            padding: "6px 8px",
                            fontSize: 13,
                            background: "rgba(0,0,0,0.3)",
                            border: "1px solid var(--line-soft)",
                            borderRadius: 6,
                            color: "var(--cream)",
                            textAlign: "right",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            width: 16,
                          }}
                        >
                          {splitMode === "UNEQUAL"
                            ? group.defaultCurrency.slice(0, 1)
                            : "%"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              {splitMode !== "EQUAL" && selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={autoFillShares}
                  className="btn-ghost btn-sm"
                >
                  ⚖ Auto · parts égales
                </button>
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={savePreset}
                  className="btn-ghost btn-sm"
                >
                  💾 Sauver comme modèle
                </button>
              )}
            </div>

            {/* Mes presets existants — gérables depuis ici */}
            {presets.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    letterSpacing: 1.4,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  🔖 Mes modèles ({presets.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {presets.map((p) => (
                    <span
                      key={p.id}
                      className="chip chip-saffron"
                      style={{
                        cursor: "pointer",
                        textTransform: "none",
                        letterSpacing: 0.3,
                      }}
                      onClick={() => loadPreset(p.id)}
                      onDoubleClick={() => deletePreset(p.id)}
                      title="Clic pour charger · double-clic pour supprimer"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className={validation.ok ? "success" : "error"}
            style={{ fontSize: 12 }}
          >
            {validation.ok ? "✓ " : "⚠ "}
            {validation.msg}
          </div>

          <button
            className="btn btn-block"
            onClick={addExpense}
            disabled={!validation.ok}
          >
            ✓ Ajouter
          </button>
        </div>
      )}

      {/* === SOLDES === */}
      {balance && balance.balances.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>⚖ Soldes</h2>
            <span className="muted" style={{ fontSize: 11 }}>
              {balance.currency}
            </span>
          </div>
          <div className="list">
            {balance.balances.map((b: any) => {
              const v = parseFloat(b.net);
              const isMe = me?.id === b.userId;
              return (
                <div key={b.userId} className="list-item">
                  <div
                    className="icon"
                    style={
                      isMe
                        ? {
                            background:
                              "linear-gradient(135deg,var(--saffron),var(--terracotta))",
                            color: "#16111e",
                          }
                        : undefined
                    }
                  >
                    {b.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="text">
                    <div className="name">
                      {b.displayName}
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
                      {v > 0
                        ? "On lui doit"
                        : v < 0
                          ? "Doit au groupe"
                          : "À l'équilibre"}
                    </div>
                  </div>
                  <div
                    className={`amount ${v < 0 ? "amount-neg" : v > 0 ? "amount-pos" : ""}`}
                  >
                    {v > 0 ? "+" : ""}
                    {v.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          {balance.suggestions.length > 0 && (
            <>
              <div className="section-title">↔ Règlements suggérés</div>
              <div className="list">
                {balance.suggestions.map((s: any, i: number) => (
                  <div key={i} className="list-item">
                    <div className="icon">↔</div>
                    <div className="text">
                      <div className="name">
                        {s.fromName} → {s.toName}
                      </div>
                      <div className="meta">Paiement à effectuer</div>
                    </div>
                    <div className="amount">
                      {parseFloat(s.amount).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              {!activeSwap && (
                <button
                  className="btn-ghost btn-block"
                  onClick={proposeSwap}
                  style={{ marginTop: 12 }}
                >
                  ⇄ Proposer un swap officiel
                </button>
              )}
            </>
          )}

          {activeSwap && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background:
                  "linear-gradient(135deg,rgba(232,163,61,0.1),rgba(181,70,46,0.04))",
                border: "1.5px solid var(--saffron)",
                borderRadius: 14,
              }}
            >
              <div className="between" style={{ marginBottom: 10 }}>
                <strong
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 16,
                    color: "var(--saffron)",
                  }}
                >
                  ⇄ Swap proposé
                </strong>
                <span className="chip chip-saffron">
                  {new Date(activeSwap.expiresAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--cream-soft)",
                  marginBottom: 10,
                }}
              >
                {activeSwap.description}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  marginBottom: 12,
                }}
              >
                {activeSwap.participants.map((p: any) => (
                  <span
                    key={p.id}
                    className={
                      p.acceptedAt
                        ? "chip chip-emerald"
                        : p.rejectedAt
                          ? "chip chip-rose"
                          : "chip chip-muted"
                    }
                  >
                    {p.acceptedAt ? "✓" : p.rejectedAt ? "✗" : "⏳"}{" "}
                    {p.displayName}
                  </span>
                ))}
              </div>
              {(() => {
                const myPart = activeSwap.participants.find(
                  (p: any) => p.userId === me?.id,
                );
                if (!myPart) return null;
                if (myPart.acceptedAt) {
                  return (
                    <div className="success" style={{ marginBottom: 0 }}>
                      ✓ Tu as accepté
                    </div>
                  );
                }
                if (myPart.rejectedAt) {
                  return (
                    <div className="error" style={{ marginBottom: 0 }}>
                      ✗ Tu as refusé
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
                  className="btn-ghost btn-block btn-sm"
                  onClick={cancelSwap}
                  style={{ marginTop: 8 }}
                >
                  Annuler ma proposition
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* === MEMBRES === */}
      <div className="card">
        <div className="card-head">
          <h2>👥 Membres</h2>
          <span className="muted" style={{ fontSize: 11 }}>
            {group.members.length}
          </span>
        </div>
        <div className="list">
          {group.members.map((m: Member) => (
            <div key={m.id} className="list-item">
              <div className="icon">
                {m.user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="text">
                <div className="name">
                  {m.user.displayName}
                  {me?.id === m.user.id && (
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
                <div className="meta">{m.role.toLowerCase()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === DÉPENSES === */}
      <div className="card">
        <div className="card-head">
          <h2>🧾 Dépenses</h2>
          <span className="muted" style={{ fontSize: 11 }}>
            {expenses.length}
          </span>
        </div>
        {expenses.length === 0 ? (
          <p className="muted text-center" style={{ padding: "20px 0" }}>
            Aucune dépense pour l'instant
          </p>
        ) : (
          <div className="list">
            {expenses.map((e: any) => (
              <div key={e.id} className="list-item">
                <div className="icon">💸</div>
                <div className="text">
                  <div className="name">{e.description}</div>
                  <div className="meta">
                    {e.paidBy.displayName} · {e.shares.length}p ·{" "}
                    {new Date(e.occurredAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
                <div className="amount">
                  {parseFloat(e.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
