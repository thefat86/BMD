"use client";

/**
 * Bloc de gestion 2FA TOTP dans la page profil (spec §7.5).
 *
 * Workflow utilisateur :
 *  1. Statut "désactivée" → bouton "Activer la 2FA"
 *  2. Génère le secret côté serveur, affiche QR code + texte de secours
 *  3. L'utilisateur scanne avec Google Authenticator / Authy / etc.
 *  4. Saisit le 1er code → vérifié → 2FA activée
 *  5. Statut "active" → bouton "Désactiver" (requiert un code valide)
 *
 * Compatible avec toutes les apps TOTP standard (RFC 6238).
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";
import { SecretField } from "./secret-field";
import { useT } from "../i18n/app-strings";

export function TwoFactorBlock(): JSX.Element {
  const toast = useToast();
  const t = useT();
  const [status, setStatus] = useState<"loading" | "off" | "on">("loading");
  const [enabledAt, setEnabledAt] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "setup" | "verify" | "disable">(
    "idle",
  );
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const s = await api.twoFactorStatus();
      setStatus(s.enabled ? "on" : "off");
      setEnabledAt(s.enabledAt);
    } catch {
      setStatus("off");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function startSetup() {
    setBusy(true);
    try {
      const r = await api.twoFactorSetup();
      setSecret(r.secret);
      setUri(r.uri);
      setStep("setup");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    if (!/^\d{6}$/.test(code) || !secret) {
      toast.error(t("twoFactor.codeRequired"));
      return;
    }
    setBusy(true);
    try {
      await api.twoFactorEnable(secret, code);
      toast.success(t("twoFactor.enabledSuccess"));
      setStep("idle");
      setSecret(null);
      setUri(null);
      setCode("");
      await load();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (!/^\d{6}$/.test(code)) {
      toast.error(t("twoFactor.codeRequired"));
      return;
    }
    setBusy(true);
    try {
      await api.twoFactorDisable(code);
      toast.success(t("twoFactor.disabledSuccess"));
      setStep("idle");
      setCode("");
      await load();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <div />;

  return (
    <div className="card">
      <div className="card-head">
        <h2>🔐 Authentification 2 facteurs</h2>
        <span
          style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 99,
            background:
              status === "on"
                ? "rgba(63,125,92,0.15)"
                : "rgba(138,123,107,0.15)",
            color: status === "on" ? "#7DC59E" : "var(--muted)",
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {status === "on" ? "✓ ACTIVE" : "○ INACTIVE"}
        </span>
      </div>

      <p
        className="muted"
        style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}
      >
        Une seconde couche de sécurité avec ton app authenticator (Google
        Authenticator, Authy, 1Password, Bitwarden…). Recommandé pour les
        comptes Premium et Communauté.
      </p>

      {/* État inactif : proposer activation */}
      {status === "off" && step === "idle" && (
        <button
          type="button"
          onClick={startSetup}
          disabled={busy}
          className="btn btn-block"
        >
          {busy ? "…" : "🔐 Activer la 2FA"}
        </button>
      )}

      {/* Étape setup : afficher QR + secret */}
      {step === "setup" && secret && uri && (
        <div
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--line, rgba(232,163,61,0.18))",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              color: "var(--gold, #C9A24A)",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Étape 1/2 · Scanne ce QR avec ton app TOTP
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 12,
              background: "#fff",
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(uri)}`}
              alt="QR code à scanner"
              width={240}
              height={240}
              style={{ display: "block" }}
            />
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginBottom: 6,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Ou saisis manuellement ce secret :
          </div>
          <div
            style={{
              padding: 10,
              background: "rgba(232,163,61,0.06)",
              border: "1px dashed var(--saffron, #E8A33D)",
              borderRadius: 8,
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <SecretField value={secret} copyable monospace />
            <span
              style={{
                fontSize: 10,
                color: "var(--cream-soft)",
                fontStyle: "italic",
              }}
            >
              Press long pour révéler
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStep("verify")}
            className="btn btn-block"
          >
            J'ai scanné · suite →
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("idle");
              setSecret(null);
              setUri(null);
            }}
            className="btn-ghost btn-block"
            style={{ marginTop: 6 }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Étape verify : saisir le 1er code */}
      {step === "verify" && (
        <div
          style={{
            background: "rgba(232,163,61,0.04)",
            border: "1px solid var(--saffron)",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              color: "var(--saffron)",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Étape 2/2 · Confirme avec le 1er code
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            style={{
              width: "100%",
              padding: 14,
              fontSize: 22,
              letterSpacing: 4,
              textAlign: "center",
              fontFamily: "'Cormorant Garamond', monospace",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              color: "var(--cream)",
              marginBottom: 10,
            }}
          />
          <button
            type="button"
            onClick={confirmEnable}
            disabled={busy || code.length !== 6}
            className="btn btn-block"
          >
            {busy ? "Vérification…" : "✓ Activer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("setup");
              setCode("");
            }}
            className="btn-ghost btn-block"
            style={{ marginTop: 6 }}
          >
            ← Retour
          </button>
        </div>
      )}

      {/* État actif : proposer désactivation */}
      {status === "on" && step === "idle" && (
        <>
          <p style={{ fontSize: 12, color: "var(--cream-soft)" }}>
            Activée le{" "}
            <strong>
              {enabledAt
                ? new Date(enabledAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </strong>
          </p>
          <button
            type="button"
            onClick={() => setStep("disable")}
            className="btn-ghost btn-block"
            style={{
              color: "var(--rose, #ef4444)",
              borderColor: "var(--rose, #ef4444)",
            }}
          >
            ✗ Désactiver la 2FA
          </button>
        </>
      )}

      {/* Étape désactiver : code requis */}
      {step === "disable" && (
        <div
          style={{
            background: "rgba(239,68,68,0.06)",
            border: "1px solid var(--rose, #ef4444)",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--rose, #ef4444)",
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            Saisis un code TOTP valide pour désactiver :
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            style={{
              width: "100%",
              padding: 14,
              fontSize: 22,
              letterSpacing: 4,
              textAlign: "center",
              fontFamily: "'Cormorant Garamond', monospace",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              color: "var(--cream)",
              marginBottom: 10,
            }}
          />
          <button
            type="button"
            onClick={confirmDisable}
            disabled={busy || code.length !== 6}
            className="btn btn-block"
            style={{
              background: "var(--rose, #ef4444)",
              color: "#fff",
            }}
          >
            {busy ? "…" : "✗ Confirmer la désactivation"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("idle");
              setCode("");
            }}
            className="btn-ghost btn-block"
            style={{ marginTop: 6 }}
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
