"use client";

/**
 * V200 — Admin · Feature flags globaux
 * =============================================================================
 * Page de pilotage des modules activables / désactivables instantanément
 * sans redéploiement. Sert de kill switch en cas de demande régulateur
 * (CSSF / ACPR) ou de bug critique.
 *
 * Module 1 — Caisses Projet : registre de cotisations communes (funérailles,
 * mariage, projet, solidarité…). BMD agit en registre, jamais en
 * dépositaire — le trésorier détient les fonds physiquement.
 *
 * Permissions : super-admin uniquement (auth déjà gérée côté backend par
 * admin.routes.ts → middleware assertSuperAdmin).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, isUnauthorized } from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { ResponsiveShell } from "@/lib/ui/responsive-shell";

interface SiteConfig {
  id: string;
  supportEmail: string;
  privacyEmail: string;
  securityEmail: string;
  whatsappNumber: string | null;
  siteUrl: string;
  projectFundsEnabled: boolean;
  projectFundsVoteThresholdEur: string;
  // V212 — Mode test temporaire (ajout direct de membres sans approbation).
  testModeEnabled?: boolean;
  updatedAt: string;
}

export default function AdminFeatureFlagsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // V200 — Inputs contrôlés (état local pour ne pas spammer le backend).
  const [voteThreshold, setVoteThreshold] = useState("500");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void (async () => {
      try {
        const c = await api.adminGetSiteConfig();
        setConfig(c);
        setVoteThreshold(c.projectFundsVoteThresholdEur);
      } catch (e) {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function toggleProjectFunds(next: boolean) {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.adminUpdateSiteConfig({
        projectFundsEnabled: next,
      });
      setConfig((prev) => (prev ? { ...prev, ...updated } : prev));
      setSuccess(
        next
          ? "Module activé. Les routes /project-funds/* sont accessibles."
          : "Module désactivé. Les routes /project-funds/* renvoient 404 et l'onglet « Caisses » disparaît pour tous les utilisateurs.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  // V212 — Toggle mode test (ajout direct de membres sans approbation).
  async function toggleTestMode(next: boolean) {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.adminUpdateSiteConfig({
        testModeEnabled: next,
      } as any);
      setConfig((prev) => (prev ? { ...prev, ...(updated as any) } : prev));
      setSuccess(
        next
          ? "⚠️ Mode test ACTIVÉ. Désactive-le avant la prod."
          : "Mode test désactivé.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  async function saveVoteThreshold() {
    const n = Number(voteThreshold);
    if (!Number.isFinite(n) || n <= 0) {
      setError(new Error("Le seuil doit être un nombre positif."));
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.adminUpdateSiteConfig({
        projectFundsVoteThresholdEur: n,
      });
      setConfig((prev) => (prev ? { ...prev, ...updated } : prev));
      setSuccess(`Seuil de vote mis à jour : ${n.toFixed(2)} €.`);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ResponsiveShell title="Feature flags">
        <div style={{ padding: 24, color: "var(--cocoa-mute, #6B5949)" }}>
          Chargement…
        </div>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell title="Feature flags">
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "20px 16px 60px",
          fontFamily: "inherit",
          color: "var(--cocoa, #2B1F15)",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <Link
            href="/admin"
            style={{
              fontSize: 12,
              color: "var(--saffron, #C58A2E)",
              textDecoration: "none",
            }}
          >
            ← Console admin
          </Link>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 28,
              fontWeight: 500,
              margin: "6px 0 4px",
            }}
          >
            Feature flags globaux
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--cocoa-mute, #6B5949)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Activer / désactiver instantanément les modules sensibles sans
            redéploiement. Utile en cas de demande régulateur ou bug critique.
          </p>
        </div>

        {error ? <ApiErrorAlert error={error} /> : null}
        {success ? (
          <div
            style={{
              background: "rgba(31,122,87,0.10)",
              border: "0.5px solid rgba(31,122,87,0.30)",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--emerald, #1F7A57)",
              marginBottom: 16,
            }}
          >
            {success}
          </div>
        ) : null}

        {/* === Module : Caisses Projet === */}
        <div
          style={{
            background: "#fff",
            border: "0.5px solid rgba(43,31,21,0.10)",
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 20,
                  fontWeight: 500,
                  marginBottom: 2,
                }}
              >
                Caisses Projet
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--cocoa-mute, #6B5949)",
                  marginBottom: 10,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  fontWeight: 600,
                }}
              >
                V200 · routes /project-funds/*
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--cocoa, #2B1F15)",
                  margin: "0 0 10px",
                  lineHeight: 1.55,
                }}
              >
                Registre de cotisations communes pour funérailles, mariage,
                projet collectif ou solidarité. BMD agit en registre — le
                trésorier nommé détient les fonds sous sa propre
                responsabilité.
              </p>
              {/* Bandeau juridique */}
              <div
                style={{
                  background: "rgba(159,70,40,0.06)",
                  border: "0.5px solid rgba(159,70,40,0.25)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 11,
                  color: "var(--cocoa, #2B1F15)",
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}
              >
                <strong style={{ color: "var(--terracotta, #9F4628)" }}>
                  Important :
                </strong>{" "}
                Ne pas activer en prod tant que la validation juridique LU /
                FR n'est pas faite. Une fois désactivé, toutes les routes
                renvoient 404 et l'onglet « Caisses » disparaît du front sans
                redéploiement.
              </div>
            </div>
            {/* Toggle */}
            <div
              role="switch"
              aria-checked={config?.projectFundsEnabled ?? false}
              tabIndex={0}
              onClick={() =>
                !saving && toggleProjectFunds(!config?.projectFundsEnabled)
              }
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  if (!saving)
                    toggleProjectFunds(!config?.projectFundsEnabled);
                }
              }}
              style={{
                width: 52,
                height: 30,
                borderRadius: 999,
                background: config?.projectFundsEnabled
                  ? "linear-gradient(135deg, #1F7A57, #C58A2E)"
                  : "rgba(43,31,21,0.20)",
                position: "relative",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.6 : 1,
                transition: "background 0.2s ease",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  left: config?.projectFundsEnabled ? 25 : 3,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 4px rgba(43,31,21,0.20)",
                  transition: "left 0.2s ease",
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: "inline-flex",
              padding: "4px 10px",
              borderRadius: 999,
              background: config?.projectFundsEnabled
                ? "rgba(31,122,87,0.15)"
                : "rgba(43,31,21,0.06)",
              color: config?.projectFundsEnabled
                ? "var(--emerald, #1F7A57)"
                : "var(--cocoa-mute, #6B5949)",
              fontSize: 11,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            {config?.projectFundsEnabled ? "● Module ACTIF" : "○ Module désactivé"}
          </div>

          {/* === Sub-config : seuil de vote === */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 18,
              borderTop: "0.5px solid rgba(43,31,21,0.10)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--cocoa, #2B1F15)",
                marginBottom: 4,
              }}
            >
              Seuil de vote requis sur dépense (EUR)
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--cocoa-mute, #6B5949)",
                margin: "0 0 10px",
                lineHeight: 1.5,
              }}
            >
              Au-delà de ce montant, une dépense ne peut être exécutée par le
              trésorier qu'après vote majoritaire des contributeurs. Override
              possible par caisse (champ <code>voteThreshold</code>).
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                min="0"
                step="50"
                value={voteThreshold}
                onChange={(e) => setVoteThreshold(e.target.value)}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  fontSize: 14,
                  border: "0.5px solid rgba(43,31,21,0.15)",
                  borderRadius: 10,
                  background: "#fff",
                  color: "var(--cocoa, #2B1F15)",
                  fontFamily: "inherit",
                  fontVariantNumeric: "tabular-nums",
                }}
              />
              <button
                type="button"
                onClick={() => void saveVoteThreshold()}
                disabled={
                  saving || voteThreshold === config?.projectFundsVoteThresholdEur
                }
                style={{
                  padding: "10px 20px",
                  background:
                    saving ||
                    voteThreshold === config?.projectFundsVoteThresholdEur
                      ? "rgba(43,31,21,0.10)"
                      : "linear-gradient(135deg, #C58A2E, #9F4628)",
                  color:
                    saving ||
                    voteThreshold === config?.projectFundsVoteThresholdEur
                      ? "var(--cocoa-mute, #6B5949)"
                      : "#FBF6EC",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor:
                    saving ||
                    voteThreshold === config?.projectFundsVoteThresholdEur
                      ? "default"
                      : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {saving ? "…" : "Enregistrer"}
              </button>
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--cocoa-mute, #6B5949)",
                marginTop: 6,
              }}
            >
              Actuel : {config?.projectFundsVoteThresholdEur ?? "—"} €
            </div>
          </div>
        </div>

        {/* === V212 · Mode test (TEMPORAIRE) === */}
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(159,70,40,0.06), rgba(197,138,46,0.04))",
            border: "1px solid rgba(159,70,40,0.3)",
            borderLeft: "4px solid #9F4628",
            borderRadius: 14,
            padding: "18px 20px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "inline-block",
                  fontSize: 10,
                  fontWeight: 700,
                  background: "#9F4628",
                  color: "#FAF6EE",
                  padding: "3px 8px",
                  borderRadius: 5,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                ⚠️ Temporaire — phase de test
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--cocoa, #2B1F15)" }}>
                Mode test : accès complet à toutes les fonctionnalités
              </h3>
              <div style={{ fontSize: 12, color: "var(--cocoa-mute, #6B5949)", marginTop: 4, lineHeight: 1.5 }}>
                Quand activé, <b>tous les utilisateurs ont accès à toutes les
                fonctionnalités de l'app</b>, peu importe leur plan :
                <ul style={{ margin: "4px 0 4px 18px", padding: 0, fontSize: 11 }}>
                  <li>Groupes/membres/dépenses/tontines/caisses illimités</li>
                  <li>OCR, voix, transcription IA sans quota</li>
                  <li>Signatures qualifiées RDD illimitées</li>
                  <li>Photo profil, reçu fiscal, logo perso PDF activés</li>
                  <li>Ajout direct de membres sans email ni OTP (bouton « + Membre test »)</li>
                  <li>Connexion directe sans recevoir d'OTP par email/SMS</li>
                </ul>
                Une fois <b>désactivé</b>, l'app fonctionne immédiatement comme
                en prod avec les vrais plans Free/Perso/Famille/Pro.
                <div style={{ marginTop: 6 }}>
                  <b style={{ color: "#9F4628" }}>
                    ⚠️ À DÉSACTIVER IMPÉRATIVEMENT AVANT LA PROD — débloque tout
                    le contenu payant pour tous les comptes.
                  </b>
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(config?.testModeEnabled)}
              onClick={() =>
                !saving && void toggleTestMode(!config?.testModeEnabled)
              }
              style={{
                position: "relative",
                width: 52,
                height: 30,
                borderRadius: 999,
                background: config?.testModeEnabled
                  ? "#9F4628"
                  : "rgba(43,31,21,0.18)",
                border: "none",
                cursor: saving ? "default" : "pointer",
                transition: "background 0.18s ease",
                flexShrink: 0,
              }}
              disabled={saving}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: config?.testModeEnabled ? 25 : 3,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#FAF6EE",
                  transition: "left 0.18s ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                }}
              />
            </button>
          </div>
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: config?.testModeEnabled
                ? "rgba(159,70,40,0.10)"
                : "rgba(43,31,21,0.04)",
              border: `0.5px solid ${config?.testModeEnabled ? "#9F4628" : "rgba(43,31,21,0.12)"}`,
              borderRadius: 8,
              fontSize: 11,
              color: config?.testModeEnabled ? "#7A2C12" : "var(--cocoa-mute, #6B5949)",
              fontWeight: 600,
            }}
          >
            {config?.testModeEnabled
              ? "● Mode test ACTIF — toutes les capacités plan illimitées + ajout direct de membres autorisé"
              : "○ Mode test désactivé — l'app applique les vrais plans (mode prod)"}
          </div>
        </div>

        {/* === Bloc info technique === */}
        <div
          style={{
            background: "rgba(197,138,46,0.04)",
            border: "0.5px solid rgba(197,138,46,0.20)",
            borderRadius: 14,
            padding: "14px 16px",
            fontSize: 11,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Comment fonctionne le kill switch ?
          </div>
          Le flag <code>SiteConfig.projectFundsEnabled</code> est lu à chaque
          requête par <code>assertFeatureEnabled()</code> dans le service
          backend. Quand désactivé, toutes les routes{" "}
          <code>/project-funds/*</code> renvoient un 404 instantanément
          (sauf <code>/project-funds/feature-gate</code> qui renvoie{" "}
          <code>{"{ enabled: false }"}</code>). Le front masque l'onglet
          « Caisses » au prochain mount du composant. Aucun déploiement n'est
          requis. La désactivation est <strong>réversible</strong> : les
          données restent en base et redeviennent accessibles à la
          réactivation.
        </div>
      </div>
    </ResponsiveShell>
  );
}
