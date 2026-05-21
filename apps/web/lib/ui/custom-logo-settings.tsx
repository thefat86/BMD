"use client";

/**
 * V163.E — Section settings groupe « Logo personnalisé sur les PDF ».
 *
 * Affiche :
 *   - L'état actuel (logo présent, abonnement actif jusqu'au …)
 *   - Un upload d'image (file picker → base64) + preview
 *   - Le CTA d'activation 9,99 €/mois (Stripe Checkout — squelette V163)
 *   - Un bouton "Retirer le logo" si présent
 *   - L'option mock-activate (visible seulement aux SuperAdmins) pour
 *     les tests sans Stripe live
 *
 * Design V45-light : palette saffron + cocoa, card ivoire, preview grande
 * pour rassurer sur le rendu, badges actif / inactif clairs.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";

interface Props {
  groupId: string;
  /** Si true, affiche le bouton mock-activate (SuperAdmin only). */
  isSuperAdmin?: boolean;
}

export function CustomLogoSettings({
  groupId,
  isSuperAdmin = false,
}: Props): JSX.Element {
  const t = useT();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof api.getCustomLogoStatus>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activating, setActivating] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const s = await api.getCustomLogoStatus(groupId);
      setStatus(s);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500 * 1024) {
      toast.error(new Error(t("customLogo.tooLarge")));
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(f);
      await api.uploadCustomLogo(groupId, dataUrl);
      toast.success(t("customLogo.uploaded"));
      await refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!confirm(t("customLogo.removeConfirm"))) return;
    try {
      await api.removeCustomLogo(groupId);
      toast.success(t("customLogo.removed"));
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function handleCheckout() {
    setActivating(true);
    try {
      const r = await api.startCustomLogoCheckout(groupId);
      if (r.ready && r.url) {
        window.location.href = r.url;
        return;
      }
      // Squelette V163 — Stripe pas encore branché live.
      toast.error(
        new Error(r.message ?? t("customLogo.checkoutNotReady")),
      );
    } catch (e) {
      toast.error(e);
    } finally {
      setActivating(false);
    }
  }

  async function handleMockActivate() {
    setActivating(true);
    try {
      await api.mockActivateCustomLogo(groupId);
      toast.success(t("customLogo.mockActivated"));
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setActivating(false);
    }
  }

  if (loading || !status) {
    return (
      <div
        style={{
          padding: 18,
          background: "var(--paper, rgba(244,228,193,0.30))",
          border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))",
          borderRadius: 14,
          color: "var(--cocoa-soft, #6B5942)",
          fontSize: 13,
        }}
      >
        …
      </div>
    );
  }

  const activeUntilLabel = status.activeUntil
    ? new Date(status.activeUntil).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <section
      style={{
        padding: 20,
        background:
          "linear-gradient(135deg, var(--paper, #FBF6EC) 0%, var(--v45-saffron-pale, #F6E8C5) 80%)",
        border: "1px solid var(--v45-saffron-line, rgba(197,138,46,0.30))",
        borderRadius: 16,
        marginBottom: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: "0 0 4px",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {t("customLogo.title")}
            <span
              style={{
                fontSize: 9,
                padding: "2px 8px",
                background:
                  "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
                color: "#FBF6EC",
                borderRadius: 999,
                letterSpacing: 0.4,
                fontWeight: 700,
              }}
            >
              PRO
            </span>
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--cocoa-soft, #6B5942)",
              lineHeight: 1.45,
            }}
          >
            {t("customLogo.subtitle")}
          </p>
        </div>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: status.active
              ? "var(--v45-emerald, #1F7A57)"
              : "var(--paper, rgba(244,228,193,0.60))",
            color: status.active ? "#FBF6EC" : "var(--cocoa-soft, #6B5942)",
            border: status.active
              ? "1px solid var(--v45-emerald, #1F7A57)"
              : "1px solid var(--cocoa-line, rgba(43,31,21,0.15))",
            whiteSpace: "nowrap",
          }}
        >
          {status.active
            ? `✓ ${t("customLogo.statusActive")}`
            : t("customLogo.statusInactive")}
        </span>
      </header>

      {/* Preview du logo s'il existe */}
      {status.hasLogo && status.logoUrl && (
        <div
          style={{
            background: "var(--paper, #FBF6EC)",
            border: "1px dashed var(--cocoa-line, rgba(43,31,21,0.20))",
            borderRadius: 12,
            padding: 18,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 100,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={status.logoUrl}
            alt="Logo personnalisé"
            style={{
              maxWidth: 220,
              maxHeight: 80,
              objectFit: "contain",
            }}
          />
        </div>
      )}

      {/* Badge "actif jusqu'au …" */}
      {status.active && activeUntilLabel && (
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 12,
            color: "var(--v45-emerald, #1F7A57)",
            fontWeight: 600,
          }}
        >
          {t("customLogo.activeUntil", { date: activeUntilLabel })}
        </p>
      )}

      {/* Upload + Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFile}
          disabled={uploading}
          style={{ display: "none" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={primaryBtnStyle}
          >
            {uploading
              ? "…"
              : status.hasLogo
                ? t("customLogo.replaceCta")
                : t("customLogo.uploadCta")}
          </button>
          {status.hasLogo && (
            <button
              type="button"
              onClick={handleRemove}
              style={ghostBtnStyle}
            >
              {t("customLogo.removeCta")}
            </button>
          )}
        </div>

        {/* Bandeau pricing + activation */}
        {!status.active && (
          <div
            style={{
              marginTop: 6,
              padding: 14,
              background: "var(--paper, rgba(244,228,193,0.50))",
              border: "1px solid var(--v45-saffron, #C58A2E)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--v45-saffron-strong, #854F0B)",
                  }}
                >
                  {status.pricing.monthlyPriceFormatted}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--cocoa-soft, #6B5942)",
                      marginLeft: 4,
                    }}
                  >
                    / {t("customLogo.perMonth")}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cocoa-soft, #6B5942)",
                    marginTop: 2,
                  }}
                >
                  {t("customLogo.cancelAnytime")}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={activating || !status.hasLogo}
                style={{
                  ...primaryBtnStyle,
                  opacity: !status.hasLogo ? 0.55 : 1,
                  cursor: !status.hasLogo
                    ? "not-allowed"
                    : activating
                      ? "wait"
                      : "pointer",
                }}
                title={
                  !status.hasLogo
                    ? t("customLogo.uploadFirst")
                    : t("customLogo.activateCta")
                }
              >
                {activating ? "…" : t("customLogo.activateCta")}
              </button>
            </div>
            {!status.hasLogo && (
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontStyle: "italic",
                  color: "var(--cocoa-soft, #6B5942)",
                }}
              >
                💡 {t("customLogo.uploadFirstHint")}
              </p>
            )}
          </div>
        )}

        {/* SuperAdmin only — mock activate pour tests */}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={handleMockActivate}
            disabled={activating}
            style={{
              ...ghostBtnStyle,
              fontSize: 11,
              color: "var(--v45-terracotta, #9F4628)",
              borderColor: "var(--v45-terracotta, #9F4628)",
            }}
          >
            🛠 Mock-activate 30j (SuperAdmin)
          </button>
        )}
      </div>
    </section>
  );
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 18px",
  background:
    "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
  color: "#FBF6EC",
  border: "none",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 42,
  fontFamily: "inherit",
  boxShadow: "0 4px 12px -4px rgba(133,79,11,0.40)",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "transparent",
  color: "var(--cocoa, #2B1F15)",
  border: "1px solid var(--cocoa-line, rgba(43,31,21,0.20))",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 42,
  fontFamily: "inherit",
};
