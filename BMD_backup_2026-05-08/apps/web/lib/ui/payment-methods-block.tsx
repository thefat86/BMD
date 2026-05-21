"use client";

/**
 * <PaymentMethodsBlock> · Vault de moyens de paiement (spec §9.1).
 *
 * Bloc à insérer dans le profil. Permet à l'utilisateur de :
 *  - Voir ses moyens sauvegardés (avec last4 uniquement)
 *  - Ajouter un moyen (chiffré côté serveur AES-256-GCM)
 *  - Révéler un moyen (avec <SecretField> anti-shoulder surfing)
 *  - Renommer / supprimer
 *
 * Le composant n'apparaît PAS si le serveur n'a pas configuré le vault
 * (PAYMENT_VAULT_KEY absente).
 *
 * UX multi-culturelle :
 *  - Catalogue de types adapté à chaque région (Mobile Money africains,
 *    options européennes, etc.)
 *  - Labels custom par l'utilisateur ("Mon Wave Sénégal" plutôt que "Wave 1")
 *  - Suggestions "Test rapide" : si l'user tape un IBAN, on devine, etc.
 */

import { useEffect, useState } from "react";
import { api } from "../api-client";
import { ApiErrorAlert } from "./api-error-alert";
import { SecretField } from "./secret-field";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";

interface Method {
  id: string;
  type: string;
  typeLabel: string;
  typeEmoji: string;
  label: string;
  last4: string;
  defaultCurrency: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const TYPE_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
  { value: "WAVE", label: "Wave", emoji: "🌊" },
  { value: "ORANGE_MONEY", label: "Orange Money", emoji: "🟠" },
  { value: "MTN_MOMO", label: "MTN MoMo", emoji: "🟡" },
  { value: "MPESA", label: "M-Pesa", emoji: "📱" },
  { value: "AIRTEL_MONEY", label: "Airtel Money", emoji: "🔴" },
  { value: "MOOV_MONEY", label: "Moov Money", emoji: "🔵" },
  { value: "LYDIA", label: "Lydia", emoji: "💙" },
  { value: "WERO", label: "Wero", emoji: "💶" },
  { value: "WISE", label: "Wise", emoji: "🌍" },
  { value: "REVOLUT", label: "Revolut", emoji: "🟣" },
  { value: "PAYPAL", label: "PayPal", emoji: "🅿️" },
  { value: "TWINT", label: "TWINT", emoji: "🇨🇭" },
  { value: "INTERAC", label: "Interac", emoji: "🇨🇦" },
  { value: "IBAN", label: "IBAN / Virement", emoji: "🏦" },
  { value: "OTHER", label: "Autre", emoji: "💳" },
];

export function PaymentMethodsBlock() {
  const t = useT();
  const dialog = useDialog();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Add form
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("WAVE");
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  // Reveal cache (par méthode)
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");

  async function load() {
    try {
      const cfg = await api.paymentMethodsConfig();
      setEnabled(cfg.enabled);
      if (cfg.enabled) {
        const r = await api.listMyPaymentMethods();
        setMethods(r);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setError(null);
    if (!newValue.trim() || !newLabel.trim()) {
      setError(
        new Error("Renseigne un nom et une valeur pour ce moyen de paiement."),
      );
      return;
    }
    setBusy(true);
    try {
      const created = await api.addPaymentMethod({
        type: newType,
        value: newValue,
        label: newLabel,
      });
      setMethods((prev) => [created, ...prev]);
      setAdding(false);
      setNewValue("");
      setNewLabel("");
      setNewType("WAVE");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function reveal(id: string) {
    if (revealed[id]) {
      // Re-cache (l'utilisateur veut re-masquer)
      const next = { ...revealed };
      delete next[id];
      setRevealed(next);
      return;
    }
    setRevealing(id);
    try {
      const r = await api.revealPaymentMethod(id);
      setRevealed((prev) => ({ ...prev, [id]: r.value }));
      // Auto-hide après 30 secondes pour ne pas laisser exposé
      setTimeout(() => {
        setRevealed((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
      }, 30_000);
    } catch (e) {
      setError(e);
    } finally {
      setRevealing(null);
    }
  }

  async function deleteOne(id: string, label: string) {
    const ok = await dialog.confirm(
      `Supprimer le moyen de paiement "${label}" ? Cette action est définitive.`,
      {
        variant: "danger",
        title: "Supprimer un moyen de paiement",
        confirmLabel: "Supprimer",
      },
    );
    if (!ok) return;
    try {
      await api.deletePaymentMethod(id);
      setMethods((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e);
    }
  }

  async function rename(id: string) {
    if (!renameLabel.trim()) return;
    try {
      await api.renamePaymentMethod(id, renameLabel.trim());
      setMethods((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, label: renameLabel.trim() } : m,
        ),
      );
      setRenamingId(null);
      setRenameLabel("");
    } catch (e) {
      setError(e);
    }
  }

  if (loading || enabled === null) {
    return null; // pas la peine d'afficher quoi que ce soit pendant le chargement
  }

  if (!enabled) {
    return null; // masqué si vault non configuré côté serveur
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>💳 Mes moyens de paiement</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Sauvegarde tes numéros de Mobile Money, IBAN ou comptes en ligne pour
        les retrouver rapidement lors des règlements. Tout est chiffré
        (AES-256-GCM) — seul toi peux voir la valeur en clair.
      </p>

      {error ? (
        <ApiErrorAlert error={error} onClose={() => setError(null)} />
      ) : null}

      {/* Liste des méthodes */}
      {methods.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "12px 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {methods.map((m) => (
            <li
              key={m.id}
              style={{
                padding: 12,
                background: "var(--overlay-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }} aria-hidden>
                    {m.typeEmoji}
                  </span>
                  <div>
                    {renamingId === m.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          value={renameLabel}
                          onChange={(e) => setRenameLabel(e.target.value)}
                          autoFocus
                          style={{
                            padding: "4px 8px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: "1px solid var(--saffron)",
                            background: "var(--overlay-2)",
                            color: "var(--cream)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => rename(m.id)}
                          className="btn btn-sm"
                          style={{ padding: "4px 8px", fontSize: 11 }}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(null);
                            setRenameLabel("");
                          }}
                          className="btn-ghost btn-sm"
                          style={{ padding: "4px 8px", fontSize: 11 }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: "var(--cream)",
                          }}
                        >
                          {m.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--muted)",
                            letterSpacing: 1,
                          }}
                        >
                          {m.typeLabel}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(m.id);
                      setRenameLabel(m.label);
                    }}
                    aria-label="Renommer"
                    title="Renommer"
                    className="btn-ghost btn-sm"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteOne(m.id, m.label)}
                    aria-label="Supprimer"
                    title="Supprimer"
                    className="btn-ghost btn-sm"
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      color: "#ef4444",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Affichage : last4 par défaut, valeur complète après reveal */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {revealed[m.id] ? (
                  <SecretField value={revealed[m.id]!} copyable monospace />
                ) : (
                  <code
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 14,
                      letterSpacing: 2,
                      padding: "4px 10px",
                      background: "rgba(232,163,61,0.06)",
                      borderRadius: 6,
                      color: "var(--cream-soft)",
                    }}
                  >
                    •••• {m.last4}
                  </code>
                )}
                <button
                  type="button"
                  onClick={() => reveal(m.id)}
                  disabled={revealing === m.id}
                  className="btn-ghost btn-sm"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                  title={
                    revealed[m.id]
                      ? "Re-masquer"
                      : "Afficher la valeur complète (auto-masque après 30s)"
                  }
                >
                  {revealing === m.id
                    ? "…"
                    : revealed[m.id]
                      ? `🙈 ${t("common.hide")}`
                      : `👁️ ${t("common.show")}`}
                </button>
                {m.lastUsedAt && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginLeft: "auto",
                    }}
                  >
                    Dernière utilisation :{" "}
                    {new Date(m.lastUsedAt).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Ajout */}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-sm"
          style={{ marginTop: 12, padding: "6px 14px" }}
        >
          ＋ Ajouter un moyen de paiement
        </button>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: "rgba(232,163,61,0.05)",
            border: "1px solid rgba(232,163,61,0.2)",
            borderRadius: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--cream)",
              marginBottom: 10,
            }}
          >
            ➕ Nouveau moyen de paiement
          </h3>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 11, color: "var(--cream-soft)" }}>
              Type
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                style={{
                  display: "block",
                  marginTop: 4,
                  padding: "6px 10px",
                  width: "100%",
                  fontSize: 13,
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  color: "var(--cream)",
                }}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.emoji} {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 11, color: "var(--cream-soft)" }}>
              Petit nom
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder='Ex: "Mon Wave Sénégal", "PayPal pro"…'
                maxLength={80}
                style={{
                  display: "block",
                  marginTop: 4,
                  padding: "6px 10px",
                  width: "100%",
                  fontSize: 13,
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  color: "var(--cream)",
                }}
              />
            </label>

            <label style={{ fontSize: 11, color: "var(--cream-soft)" }}>
              Numéro / IBAN / Email
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={
                  newType === "IBAN"
                    ? "FR76 3000 4000…"
                    : newType === "PAYPAL"
                      ? "moi@exemple.com"
                      : "+221 77 123 45 67"
                }
                maxLength={120}
                style={{
                  display: "block",
                  marginTop: 4,
                  padding: "6px 10px",
                  width: "100%",
                  fontSize: 13,
                  fontFamily: "ui-monospace, monospace",
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  color: "var(--cream)",
                }}
              />
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontSize: 10,
                  color: "var(--muted)",
                  fontStyle: "italic",
                }}
              >
                🔒 Cette valeur sera chiffrée (AES-256) avant d'être stockée
              </span>
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={add}
                disabled={busy || !newValue || !newLabel}
                className="btn btn-sm"
                style={{ padding: "6px 14px" }}
              >
                {busy ? "Chiffrement…" : "🔐 Sauvegarder"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewValue("");
                  setNewLabel("");
                  setError(null);
                }}
                className="btn-ghost btn-sm"
                style={{ padding: "6px 14px" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
