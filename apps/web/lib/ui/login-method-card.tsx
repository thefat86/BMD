"use client";

/**
 * V52.D2 — LoginMethodCard : card méthode d'auth signature V45.
 *
 * Composant utilisé sur l'écran de login pour présenter chaque moyen
 * d'authentification (Face ID, Passkey, OTP) sous forme de card empilée
 * verticalement (cf. AUDIT-V45-VS-PROD.md écran 1 « Login premium »).
 *
 * Variants :
 *  - `primary` : Face ID / méthode hero — fond cocoa (var(--cocoa-night))
 *                avec icône saffron à gauche, label cream, sublabel cream-soft
 *  - `default` : Passkey / OTP / méthode secondaire — fond paper (var(--paper))
 *                avec icône cocoa, label cocoa, sublabel cocoa-soft
 *
 * Layout : icône à gauche (44×44 carrée), bloc texte au milieu (label gras +
 * sublabel discret), chevron-right à droite. Tap target plein-card.
 *
 * Usage :
 *   <LoginMethodCard
 *     variant="primary"
 *     icon={<BiometricIcon platform={p} hasPlatformAuth size={22} />}
 *     label={t("auth.faceIdLabel", { label: p.biometricLabel })}
 *     sublabel={t("auth.faceIdSub")}
 *     loading={passkeyLoading}
 *     onClick={startPasskeyLogin}
 *   />
 *
 *   <LoginMethodCard
 *     variant="default"
 *     iconName="key-round"
 *     label="Clé de sécurité"
 *     sublabel="Passkey sur un autre appareil"
 *     onClick={startPasskeyLogin}
 *   />
 *
 * Le composant accepte SOIT `icon` (ReactNode), SOIT `iconName` (IconName du
 * registry V45) — l'un ou l'autre, pas les deux.
 */
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export interface LoginMethodCardProps {
  /** Variant visuel : primary cocoa hero ou default paper. */
  variant?: "primary" | "default";
  /** Icône custom (ReactNode) à afficher à gauche. Prioritaire sur iconName. */
  icon?: ReactNode;
  /** Nom d'icône du registry V45 (alternative à `icon`). */
  iconName?: IconName;
  /** Label principal de la card (gras). */
  label: string;
  /** Sublabel optionnel (1 ligne, discret, sous le label). */
  sublabel?: string;
  /** State de chargement : remplace l'icône par un spinner. */
  loading?: boolean;
  /** Handler de clic (toute la card est cliquable). */
  onClick: () => void;
  /** Désactive la card (busy state global du parent). */
  disabled?: boolean;
  /** ARIA label optionnel ; sinon construit depuis `label`. */
  ariaLabel?: string;
}

export function LoginMethodCard({
  variant = "default",
  icon,
  iconName,
  label,
  sublabel,
  loading = false,
  onClick,
  disabled = false,
  ariaLabel,
}: LoginMethodCardProps) {
  const isPrimary = variant === "primary";
  // Couleurs selon variant — utilise les CSS vars V45 avec fallback hex pour
  // que la card rende correctement même quand data-theme="dark" (l'app par
  // défaut). En dark, --cocoa = vide → fallback ; en v45-light, --cocoa
  // est défini dans :root.
  const bg = isPrimary
    ? "var(--night-deep, #14101E)"
    : "var(--paper, #FFFFFF)";
  const labelColor = isPrimary
    ? "var(--paper, #FFFFFF)"
    : "var(--cocoa, #2B1F15)";
  const sublabelColor = isPrimary
    ? "rgba(255,255,255,0.65)"
    : "var(--cocoa-soft, #6B5A47)";
  const iconColor = isPrimary
    ? "var(--v45-saffron, #C58A2E)"
    : "var(--cocoa, #2B1F15)";
  const borderColor = isPrimary
    ? "transparent"
    : "var(--v45-line, rgba(43,31,21,0.08))";
  const shadowPrimary = "0 12px 30px rgba(20,16,30,0.25)";
  const shadowDefault = "0 2px 8px rgba(43,31,21,0.04)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      aria-label={ariaLabel ?? label}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 14px",
        background: bg,
        color: labelColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        cursor: loading || disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        boxShadow: isPrimary ? shadowPrimary : shadowDefault,
        opacity: disabled ? 0.55 : 1,
        transition: "transform 0.1s ease, box-shadow 0.2s ease",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        minHeight: 64,
      }}
      onMouseDown={(e) => {
        if (!loading && !disabled) e.currentTarget.style.transform = "scale(0.98)";
      }}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onTouchStart={(e) => {
        if (!loading && !disabled) e.currentTarget.style.transform = "scale(0.98)";
      }}
      onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {/* Icône à gauche (slot 44×44) */}
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: isPrimary
            ? "rgba(255,255,255,0.06)"
            : "var(--v45-saffron-pale, #F6E8C5)",
          color: iconColor,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {loading ? (
          <span
            style={{
              display: "inline-block",
              width: 18,
              height: 18,
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "lmc-spin 0.8s linear infinite",
            }}
          />
        ) : icon ? (
          icon
        ) : iconName ? (
          <Icon name={iconName} size={22} color="currentColor" strokeWidth={1.6} />
        ) : null}
      </span>

      {/* Bloc texte (label + sublabel) */}
      <span style={{ flex: 1, minWidth: 0, display: "block" }}>
        <span
          style={{
            display: "block",
            fontSize: 15,
            fontWeight: 600,
            color: labelColor,
            lineHeight: 1.25,
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 400,
              color: sublabelColor,
              marginTop: 2,
              lineHeight: 1.35,
            }}
          >
            {sublabel}
          </span>
        )}
      </span>

      {/* Chevron à droite (juste sur les cards default — la primary n'en a pas) */}
      {!isPrimary && (
        <Icon
          name="chevron-right"
          size={18}
          color="var(--cocoa-soft, #6B5A47)"
          strokeWidth={1.8}
        />
      )}

      <style jsx>{`
        @keyframes lmc-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </button>
  );
}
