"use client";

/**
 * Page paramètres d'un groupe :
 *  - Renommer
 *  - Changer la devise par défaut
 *  - Gérer les membres (rôle, retirer)
 *  - Liens d'invitation (générer / révoquer + QR)
 *  - Supprimer le groupe (admin uniquement, double confirmation)
 *
 * Permissions :
 *  - Tous les membres : voient les paramètres
 *  - ADMIN / TREASURER : peuvent renommer, gérer membres, invites
 *  - ADMIN seul : peut supprimer le groupe
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../../../lib/api-client";
import { useToast } from "../../../../../lib/ui/toast";

const ROLES = ["ADMIN", "TREASURER", "MEMBER", "OBSERVER"] as const;
type Role = (typeof ROLES)[number];

const CURRENCIES = ["EUR", "USD", "XAF", "XOF", "CDF", "GBP", "CAD"];

export default function GroupSettingsPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const toast = useToast();

  const [group, setGroup] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // QR code modal
  const [qrToken, setQrToken] = useState<string | null>(null);

  async function load() {
    try {
      const [m, g, t] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.listInviteTokens(groupId).catch(() => []),
      ]);
      setMe(m.user);
      setGroup(g);
      setName(g.name);
      setCurrency(g.defaultCurrency);
      setTokens(t);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const myRole = useMemo<Role | null>(() => {
    if (!group || !me) return null;
    const m = group.members.find((x: any) => x.user.id === me.id);
    return (m?.role as Role) ?? null;
  }, [group, me]);

  const canManage = myRole === "ADMIN" || myRole === "TREASURER";
  const isAdmin = myRole === "ADMIN";

  async function saveBasics() {
    if (!canManage) return;
    try {
      const changes: { name?: string; defaultCurrency?: string } = {};
      if (name.trim() !== group.name) changes.name = name.trim();
      if (currency !== group.defaultCurrency)
        changes.defaultCurrency = currency;
      if (Object.keys(changes).length === 0) {
        toast.info("Aucun changement à enregistrer");
        return;
      }
      await api.updateGroup(groupId, changes);
      toast.success("Paramètres enregistrés");
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function changeRole(memberId: string, newRole: Role) {
    if (!canManage) return;
    try {
      await api.changeMemberRole(groupId, memberId, newRole);
      toast.success("Rôle mis à jour");
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function removeMember(memberId: string, memberName: string) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Retirer ${memberName} du groupe ? Cette action est irréversible.`,
      )
    ) {
      return;
    }
    try {
      await api.removeMember(groupId, memberId);
      toast.success(`${memberName} retiré du groupe`);
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function generateInvite() {
    if (!canManage) return;
    try {
      const t = await api.createInviteToken(groupId, {
        expiresInHours: 24 * 7,
      });
      toast.success("Lien d'invitation généré (valable 7 jours)");
      // Ouvre direct le QR
      setQrToken(t.token);
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function revokeInvite(tokenId: string) {
    if (!canManage) return;
    if (!window.confirm("Révoquer ce lien d'invitation ?")) return;
    try {
      await api.revokeInviteToken(tokenId);
      toast.success("Lien révoqué");
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/join/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié dans le presse-papier");
    } catch {
      // Fallback : prompt
      window.prompt("Copie ce lien :", url);
    }
  }

  async function shareLink(token: string) {
    const url = `${window.location.origin}/join/${token}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Rejoins ${group?.name} sur BMD`,
          text: `Tu es invité·e à rejoindre le groupe « ${group?.name} » sur BMD`,
          url,
        });
        return;
      } catch {
        // utilisateur a annulé : on ne fait rien
        return;
      }
    }
    void copyLink(token);
  }

  async function deleteGroupConfirmed() {
    if (!isAdmin) return;
    if (confirmText !== group.name) {
      toast.error(`Tape exactement « ${group.name} » pour confirmer`);
      return;
    }
    try {
      await api.deleteGroup(groupId);
      toast.success("Groupe supprimé");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(e);
    }
  }

  if (loading || !group) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p>Chargement…</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 16, paddingBottom: 80 }}>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href={`/dashboard/groups/${groupId}`}
          style={{
            color: "inherit",
            textDecoration: "none",
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Retour au groupe
        </Link>
      </div>

      <h1 style={{ marginTop: 0 }}>⚙️ Paramètres</h1>
      <p className="muted" style={{ fontSize: 13 }}>
        Tu es <strong>{myRole?.toLowerCase()}</strong> dans ce groupe
      </p>

      {/* === Mode "Ne pas déranger" (spec §3.12) === */}
      <DndToggle group={group} meId={me?.id} onChanged={load} />

      {/* === BASE === */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Informations</h2>
        <label
          style={{ display: "block", marginBottom: 12, fontSize: 13 }}
        >
          Nom du groupe
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 12px",
              fontSize: 16,
              border: "1px solid #ccc",
              borderRadius: 8,
              marginTop: 6,
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "block", fontSize: 13 }}>
          Devise par défaut
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={!canManage}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 12px",
              fontSize: 16,
              border: "1px solid #ccc",
              borderRadius: 8,
              marginTop: 6,
              boxSizing: "border-box",
              background: "#fff",
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {canManage && (
          <button
            onClick={saveBasics}
            style={{
              marginTop: 16,
              padding: "12px 20px",
              background: "#0E0B14",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              minHeight: 44,
            }}
          >
            Enregistrer
          </button>
        )}
      </div>

      {/* === MEMBRES === */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>👥 Membres ({group.members.length})</h2>
        <div className="list">
          {group.members.map((m: any) => {
            const isMe = m.user.id === me?.id;
            return (
              <div
                key={m.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "#e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {m.user.displayName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {m.user.displayName}
                    {isMe && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--saffron, #E8A33D)",
                          marginLeft: 6,
                          letterSpacing: 1,
                        }}
                      >
                        MOI
                      </span>
                    )}
                  </div>
                </div>
                {canManage ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value as Role)}
                    disabled={isMe && myRole === "ADMIN"}
                    style={{
                      padding: "6px 8px",
                      fontSize: 12,
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      background: "#fff",
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.toLowerCase()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {m.role.toLowerCase()}
                  </span>
                )}
                {canManage && !isMe && (
                  <button
                    onClick={() => removeMember(m.id, m.user.displayName)}
                    title="Retirer du groupe"
                    aria-label="Retirer du groupe"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 18,
                      padding: "4px 8px",
                      minHeight: 32,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* === LIENS D'INVITATION === */}
      {canManage && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>🔗 Liens d'invitation</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Génère un lien partageable (WhatsApp, SMS, QR…) que tes proches
            cliquent pour rejoindre le groupe sans saisie manuelle.
          </p>
          <button
            onClick={generateInvite}
            style={{
              padding: "12px 20px",
              background: "var(--saffron, #E8A33D)",
              color: "#0E0B14",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
              minHeight: 44,
            }}
          >
            ＋ Nouveau lien
          </button>

          {tokens.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {tokens.map((t: any) => {
                const expired = new Date(t.expiresAt) < new Date();
                const usesText = t.maxUses
                  ? `${t.uses}/${t.maxUses} utilisations`
                  : `${t.uses} utilisations`;
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: 12,
                      border: "1px solid #eee",
                      borderRadius: 8,
                      marginBottom: 8,
                      opacity: expired || t.revokedAt ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginBottom: 6,
                      }}
                    >
                      {expired
                        ? "⚠ Expiré"
                        : t.revokedAt
                          ? "🚫 Révoqué"
                          : `Expire le ${new Date(t.expiresAt).toLocaleDateString("fr-FR")}`}
                      {" · "}
                      {usesText}
                    </div>
                    <code
                      style={{
                        display: "block",
                        fontSize: 11,
                        background: "#f3f4f6",
                        padding: "6px 8px",
                        borderRadius: 4,
                        marginBottom: 8,
                        wordBreak: "break-all",
                      }}
                    >
                      {`/join/${t.token}`}
                    </code>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {!expired && !t.revokedAt && (
                        <>
                          <button
                            onClick={() => copyLink(t.token)}
                            style={btnSmall}
                          >
                            📋 Copier
                          </button>
                          <button
                            onClick={() => shareLink(t.token)}
                            style={btnSmall}
                          >
                            📤 Partager
                          </button>
                          <button
                            onClick={() => setQrToken(t.token)}
                            style={btnSmall}
                          >
                            ⊞ QR
                          </button>
                        </>
                      )}
                      {!t.revokedAt && (
                        <button
                          onClick={() => revokeInvite(t.id)}
                          style={{ ...btnSmall, color: "#ef4444" }}
                        >
                          🚫 Révoquer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === DANGER ZONE === */}
      {isAdmin && (
        <div
          className="card"
          style={{ marginTop: 20, borderColor: "#fee2e2" }}
        >
          <h2 style={{ marginTop: 0, color: "#991b1b" }}>⚠ Zone dangereuse</h2>
          {!confirmDeleteGroup ? (
            <button
              onClick={() => setConfirmDeleteGroup(true)}
              style={{
                padding: "12px 20px",
                background: "#fef2f2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                minHeight: 44,
              }}
            >
              🗑 Supprimer ce groupe
            </button>
          ) : (
            <div>
              <p style={{ color: "#991b1b", fontSize: 13 }}>
                Cette action est <strong>irréversible</strong>. Toutes les
                dépenses, contributions, swaps et historique seront
                définitivement perdus.
              </p>
              <p style={{ fontSize: 13 }}>
                Tape exactement <code>{group.name}</code> pour confirmer :
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={group.name}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 16,
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  marginBottom: 12,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    setConfirmDeleteGroup(false);
                    setConfirmText("");
                  }}
                  style={{
                    padding: "10px 16px",
                    background: "#fff",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    cursor: "pointer",
                    minHeight: 44,
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={deleteGroupConfirmed}
                  disabled={confirmText !== group.name}
                  style={{
                    padding: "10px 16px",
                    background:
                      confirmText === group.name ? "#ef4444" : "#fca5a5",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor:
                      confirmText === group.name ? "pointer" : "not-allowed",
                    minHeight: 44,
                    fontWeight: 600,
                  }}
                >
                  Supprimer définitivement
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === MODAL QR CODE === */}
      {qrToken && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setQrToken(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 24,
              maxWidth: 360,
              width: "100%",
              textAlign: "center",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Scanner pour rejoindre</h3>
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              {group.name}
            </p>
            <div
              style={{
                margin: "16px auto",
                width: 256,
                maxWidth: "100%",
                aspectRatio: "1 / 1",
                background: "#fff",
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 12,
              }}
            >
              {/* QR via Google Charts API (gratuit, public, pas de dépendance) */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                  `${window.location.origin}/join/${qrToken}`,
                )}`}
                alt="QR code d'invitation"
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>
            <p
              style={{
                fontSize: 11,
                color: "#6b7280",
                wordBreak: "break-all",
              }}
            >
              {`${typeof window !== "undefined" ? window.location.origin : ""}/join/${qrToken}`}
            </p>
            <button
              onClick={() => setQrToken(null)}
              style={{
                marginTop: 12,
                padding: "10px 20px",
                background: "#0E0B14",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnSmall: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 36,
};

/**
 * Toggle "Ne pas déranger" pour la membership courante (spec §3.12).
 * Lit le flag `doNotDisturb` depuis le membre courant, déclenche un PATCH
 * /groups/:id/dnd, puis recharge le groupe via onChanged().
 */
function DndToggle({
  group,
  meId,
  onChanged,
}: {
  group: any;
  meId?: string;
  onChanged: () => void | Promise<void>;
}): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  if (!group || !meId) return null;
  const me = group.members.find((m: any) => m.user.id === meId);
  if (!me) return null;
  const dnd = !!me.doNotDisturb;

  async function toggle() {
    setBusy(true);
    try {
      await api.setGroupDND(group.id, !dnd);
      await onChanged();
    } catch (e) {
      window.alert(`Échec : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 20,
        background: dnd
          ? "rgba(232,163,61,0.06)"
          : "rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            {dnd ? "🔕" : "🔔"} Notifications de ce groupe
          </h2>
          <p
            className="muted"
            style={{ fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}
          >
            {dnd
              ? "Désactivées · tu ne reçois plus de notifs sauf paiement direct."
              : "Activées · tu reçois les notifs de tout ce qui se passe."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          style={{
            padding: "10px 16px",
            background: dnd
              ? "var(--saffron, #E8A33D)"
              : "rgba(255,255,255,0.05)",
            color: dnd ? "#16111E" : "var(--cream, #F4E4C1)",
            border: "1px solid var(--line-soft, rgba(244,228,193,0.08))",
            borderRadius: 10,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
            minHeight: 44,
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          {dnd ? "Réactiver" : "Mettre en sourdine"}
        </button>
      </div>
    </div>
  );
}
