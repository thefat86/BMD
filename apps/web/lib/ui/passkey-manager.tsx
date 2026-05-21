"use client";

/**
 * <PasskeyManager /> · Gestion des passkeys WebAuthn dans le profil.
 *
 * Permet à l'utilisateur connecté de :
 *  - Voir la liste de ses passkeys (device, dernière utilisation)
 *  - Ajouter un passkey (Touch ID / Face ID / Windows Hello / Yubikey…)
 *  - Renommer / supprimer un passkey
 *
 * Le composant détecte automatiquement si le browser supporte WebAuthn.
 * Si non, affiche un message explicatif (Safari sur iPhone < 16, etc.).
 *
 * Sécurité : pas d'auto-enrollment. L'utilisateur doit cliquer
 * explicitement sur "+ Ajouter un passkey", confirmer son intention,
 * puis valider la pop-up système (TouchID/FaceID/PIN).
 */

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { api } from "../api-client";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { detectPlatform, haptic } from "../platform";

interface Passkey {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
  transports: string[] | undefined;
}

export function PasskeyManager() {
  const dialog = useDialog();
  const t = useT();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supported = typeof window !== "undefined" && hasPasskeySupport();

  async function loadPasskeys() {
    try {
      const r = await api.listMyPasskeys();
      setPasskeys(r.items);
    } catch (e) {
      setError(t("passkey.loadError", { msg: (e as Error).message }));
    }
  }

  useEffect(() => {
    void loadPasskeys();
  }, []);

  async function addPasskey() {
    setError(null);
    setSuccess(null);
    setAdding(true);
    try {
      // Nom suggéré : platform info
      const defaultName = guessDeviceName();
      const deviceName =
        (await dialog.prompt(t("passkey.namePrompt"), {
          title: t("passkey.nameTitle"),
          defaultValue: defaultName,
          confirmLabel: t("passkey.continue"),
        })) ?? defaultName;

      // 1. Récupère les options du serveur
      const options = await api.passkeyRegisterOptions(deviceName);

      // Guard : si la réponse serveur est malformée (challenge undefined),
      // on bail avec un message clair au lieu de laisser simplewebauthn
      // crasher avec "base64URLString.replace is undefined".
      if (!options || typeof options.challenge !== "string") {
        throw new Error(
          t("passkey.serverResponseInvalid"),
        );
      }

      // 2. Browser génère la paire de clés (popup système)
      // V10 signature : (optionsJSON) — pas d'objet wrapper
      const attResp = await startRegistration(options);

      // 3. Renvoie au serveur pour vérification + persistance
      await api.passkeyRegisterFinish(attResp, deviceName);

      setSuccess(t("passkey.registered", { name: deviceName }));
      haptic("success");
      // V24 — Marque le statut « enrolled » côté login pour que le prompt
      // post-OTP de la page /login ne reposera plus la question (l'utilisateur
      // a déjà au moins un passkey — c'est la condition principale qui le
      // bloque, mais on stocke aussi la décision côté localStorage par
      // robustesse au cas où l'API listMyPasskeys serait momentanément KO).
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "bmd_passkey_enroll_status_v1",
            "enrolled",
          );
        }
      } catch {
        /* ignore */
      }
      await loadPasskeys();
    } catch (e) {
      const msg = (e as Error).message;
      const lower = msg.toLowerCase();
      // Erreurs natives WebAuthn courantes — messages plus parlants
      if (lower.includes("aborted") || lower.includes("cancelled")) {
        setError(t("passkey.cancelled"));
      } else if (
        lower.includes("already registered") ||
        lower.includes("excludecredentials")
      ) {
        setError(t("passkey.alreadyRegistered"));
      } else if (
        lower.includes("not allowed") ||
        lower.includes("notallowederror") ||
        lower.includes("denied permission") ||
        lower.includes("timed out")
      ) {
        // iOS / Android refus typique : rpID mismatch, Face ID refusé,
        // pas de biométrie configurée, contexte HTTPS strict requis, etc.
        setError(t("passkey.notAllowedHint"));
      } else if (
        lower.includes("security") ||
        lower.includes("invalid state")
      ) {
        setError(t("passkey.securityContextError"));
      } else {
        setError(t("passkey.addError", { msg }));
      }
    } finally {
      setAdding(false);
    }
  }

  async function renamePasskey(pk: Passkey) {
    const newName = await dialog.prompt(t("passkey.renamePrompt"), {
      title: t("passkey.renameTitle"),
      defaultValue: pk.deviceName,
      confirmLabel: t("passkey.rename"),
    });
    if (!newName || newName === pk.deviceName) return;
    try {
      await api.renameMyPasskey(pk.id, newName);
      await loadPasskeys();
    } catch (e) {
      setError(t("passkey.renameError", { msg: (e as Error).message }));
    }
  }

  async function deletePasskey(pk: Passkey) {
    const ok = await dialog.confirm(t("passkey.deleteConfirm", { name: pk.deviceName }), {
      title: t("passkey.deleteTitle"),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteMyPasskey(pk.id);
      await loadPasskeys();
    } catch (e) {
      setError(t("passkey.deleteError", { msg: (e as Error).message }));
    }
  }

  if (!supported) {
    return (
      <div className="card">
        <div className="card-head">
          <h2>🔐 Passkeys</h2>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          {t("passkey.notSupported")}
        </p>
      </div>
    );
  }

  return (
    <div className="card" data-testid="passkey-manager">
      <div className="card-head">
        <h2>🔐 Passkeys</h2>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={addPasskey}
          disabled={adding}
          title={t("passkey.addTitle")}
        >
          {adding ? t("passkey.registering") : t("passkey.add")}
        </button>
      </div>

      <p
        className="muted"
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          margin: "0 0 12px",
        }}
      >
        {t("passkey.description")}
      </p>

      {error && (
        <div role="alert" className="error" style={{ marginBottom: 10 }}>
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="success" style={{ marginBottom: 10 }}>
          {success}
        </div>
      )}

      {passkeys === null ? (
        <p style={{ color: "var(--cream-soft)", fontSize: 13 }}>{t("common.loading")}</p>
      ) : passkeys.length === 0 ? (
        <div
          style={{
            background: "rgba(244,228,193,0.04)",
            border: "1px dashed rgba(244,228,193,0.18)",
            borderRadius: 12,
            padding: 16,
            textAlign: "center",
            color: "var(--cream-soft)",
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 6 }}>🔑</div>
          {t("passkey.empty")}
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {passkeys.map((pk) => (
            <li
              key={pk.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "rgba(244,228,193,0.04)",
                borderRadius: 12,
                border: "1px solid rgba(244,228,193,0.08)",
              }}
            >
              <span
                aria-hidden
                style={{ fontSize: 20, flexShrink: 0 }}
                title={describeTransports(pk.transports)}
              >
                {iconForTransports(pk.transports)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--cream)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pk.deviceName}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}
                >
                  Ajouté {fmtDate(pk.createdAt)}
                  {pk.lastUsedAt && ` · dernière utilisation ${fmtDate(pk.lastUsedAt)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => renamePasskey(pk)}
                className="btn-ghost btn-sm"
                title="Renommer"
                style={{ flexShrink: 0 }}
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={() => deletePasskey(pk)}
                className="btn-ghost btn-sm"
                title="Supprimer"
                style={{ flexShrink: 0, color: "var(--rose, #ec5e5e)" }}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Détecte si le browser supporte WebAuthn et `startRegistration()`.
 * On vérifie aussi la disponibilité du PublicKeyCredential global.
 */
function hasPasskeySupport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "Passkey";
  const info = detectPlatform();
  const ua = navigator.userAgent;
  // Plus précis : type d'appareil + moyen biométrique
  if (info.platform === "ios") {
    if (/iPad/i.test(ua)) return `iPad · ${info.biometricLabel}`;
    return `iPhone · ${info.biometricLabel}`;
  }
  if (info.platform === "android") return `Android · ${info.biometricLabel}`;
  if (info.platform === "macos") return `Mac · ${info.biometricLabel}`;
  if (info.platform === "windows") return `PC · ${info.biometricLabel}`;
  if (info.platform === "linux") return "Linux";
  return "Passkey";
}

function iconForTransports(transports: string[] | undefined): string {
  if (!transports || transports.length === 0) return "🔑";
  if (transports.includes("internal")) return "📱";
  if (transports.includes("usb")) return "🔌";
  if (transports.includes("nfc")) return "📡";
  if (transports.includes("ble")) return "📶";
  if (transports.includes("hybrid") || transports.includes("cable")) return "🔗";
  return "🔑";
}

function describeTransports(transports: string[] | undefined): string {
  if (!transports || transports.length === 0) return "Type de passkey inconnu";
  const labels: Record<string, string> = {
    internal: "Biométrique intégré (Touch ID / Face ID / Windows Hello)",
    usb: "Clé USB (Yubikey, etc.)",
    nfc: "Clé NFC",
    ble: "Bluetooth",
    hybrid: "Cross-device (QR + smartphone)",
    cable: "Cross-device (caBLE)",
  };
  return transports.map((t) => labels[t] ?? t).join(" ·");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffDays = Math.floor(diffH / 24);
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
