"use client";

/**
 * <RateLimitScreen> · Plein-écran "petite pause" affiché quand l'API
 * renvoie 429 (anti-bombing OTP, brute-force, etc.).
 *
 * Deux variants visuels selon le viewport :
 *  - Mobile : style splash bancaire — gros logo BMD plein-écran, halo,
 *    timer central en Cormorant, mini-message rassurant. Très peu de
 *    texte, gros chiffres lisibles à bout de bras.
 *  - Desktop : carte centrée, plus aérée, avec une icône horloge décorative
 *    et un message expliquant le mécanisme + lien d'aide.
 *
 * Le composant accepte un `retryAfter` en secondes (depuis l'erreur API)
 * et affiche un countdown en temps réel. Quand le timer atteint 0, on
 * appelle `onRetryReady` (le caller peut alors réafficher le formulaire).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBreakpoint } from "../use-breakpoint";
import { useT } from "../i18n/app-strings";

interface Props {
  /** Secondes restantes avant pouvoir retenter */
  retryAfter: number;
  /** Message principal (ex: "Trop de codes envoyés…") */
  message?: string;
  /** Conseil secondaire (ex: "Vérifie tes SMS — le code est peut-être déjà arrivé") */
  tip?: string;
  /** Callback déclenché quand le countdown arrive à 0 */
  onRetryReady?: () => void;
  /** Lien de retour (par défaut /login) */
  backHref?: string;
}

export function RateLimitScreen({
  retryAfter,
  message,
  tip,
  onRetryReady,
  backHref = "/login",
}: Props): JSX.Element {
  const { isMobile } = useBreakpoint();
  const t = useT();
  const [secondsLeft, setSecondsLeft] = useState(retryAfter);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onRetryReady?.();
      return;
    }
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display =
    minutes > 0
      ? `${minutes}:${seconds.toString().padStart(2, "0")}`
      : `${seconds}s`;
  const ready = secondsLeft <= 0;

  if (isMobile) {
    return <MobileVariant {...{ display, ready, message, tip, backHref, t }} />;
  }
  return <DesktopVariant {...{ display, ready, message, tip, backHref, t }} />;
}

interface VariantProps {
  display: string;
  ready: boolean;
  message?: string;
  tip?: string;
  backHref: string;
  t: (key: any, vars?: any) => string;
}

/**
 * Variant mobile — splash screen banking app : très épuré, le timer prend
 * tout l'espace, le logo plane au-dessus comme une signature.
 */
function MobileVariant({
  display,
  ready,
  message,
  tip,
  backHref,
  t,
}: VariantProps) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(800px 500px at 50% -10%, rgba(232,163,61,0.18), transparent 60%), " +
          "linear-gradient(180deg, #0E0B14 0%, #1F1429 100%)",
        color: "var(--cream, #f4e4c1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "calc(env(safe-area-inset-top, 0px) + 32px) 28px calc(env(safe-area-inset-bottom, 0px) + 32px)",
        textAlign: "center",
        fontFamily:
          "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Logo en haut, avec halo "respirant" pour effet calmant */}
      <div
        aria-hidden
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.20), rgba(181,70,46,0.08))",
          border: "1.5px solid rgba(232,163,61,0.30)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
          opacity: 0.92,
          animation: ready
            ? undefined
            : "bmd-breathe 4s ease-in-out infinite",
        }}
      >
        {/* V181 — Écran rare : loading=lazy + decoding=async pour ne pas peser sur le mount path. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bmd-logo.svg"
          alt="BMD"
          width={56}
          height={56}
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* Timer central — gros chiffres Cormorant comme un vrai écran de banque */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--saffron, #e8a33d)",
            letterSpacing: 3,
            textTransform: "uppercase",
            fontWeight: 700,
            opacity: 0.85,
          }}
        >
          {t("rateLimit.mobilePauseLabel")}
        </div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: ready ? 44 : "clamp(72px, 22vw, 120px)",
            fontWeight: 600,
            color: ready ? "#7DC59E" : "var(--cream)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            transition: "all 0.3s ease",
          }}
        >
          {ready ? t("rateLimit.mobileReady") : display}
        </div>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--cream-soft, #d4c4a8)",
            margin: "0 auto",
            maxWidth: 320,
            opacity: 0.9,
          }}
        >
          {ready
            ? t("rateLimit.mobileReadyHint")
            : message ?? t("rateLimit.mobileDefaultMsg")}
        </p>
        {!ready && tip && (
          <p
            style={{
              fontSize: 12,
              color: "var(--muted, #8a7b6b)",
              margin: "0 auto",
              maxWidth: 280,
              lineHeight: 1.55,
              fontStyle: "italic",
            }}
          >
            {tip}
          </p>
        )}
      </div>

      {/* CTA bas */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        {ready ? (
          <Link
            href={backHref}
            style={{
              display: "block",
              padding: "16px 24px",
              background: "linear-gradient(135deg, #E8A33D, #B5462E)",
              color: "#16111E",
              borderRadius: 14,
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
              textAlign: "center",
              boxShadow: "0 12px 32px rgba(232,163,61,0.30)",
            }}
          >
            {t("rateLimit.mobileRequestBtn")}
          </Link>
        ) : (
          <Link
            href={backHref}
            style={{
              display: "block",
              padding: "12px 16px",
              background: "transparent",
              color: "var(--cream-soft)",
              border: "1px solid rgba(244,228,193,0.10)",
              borderRadius: 12,
              fontSize: 13,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            ← Retour
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Variant desktop — carte centrée, plus aérée, design portail web pro.
 * Détaille un peu plus le mécanisme (l'utilisateur a souvent l'attention
 * disponible en desktop, contrairement au mobile où on coupe au minimum).
 */
function DesktopVariant({
  display,
  ready,
  message,
  tip,
  backHref,
  t,
}: VariantProps) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(900px 500px at 50% -10%, rgba(232,163,61,0.10), transparent 60%), " +
          "linear-gradient(180deg, #0E0B14 0%, #1F1429 100%)",
        color: "var(--cream, #f4e4c1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          background: "rgba(244,228,193,0.03)",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 22,
          padding: "40px 32px",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Icône horloge décorative */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.08))",
            border: "1px solid rgba(232,163,61,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
            fontSize: 28,
          }}
        >
          {ready ? "✓" : "⏳"}
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--saffron)",
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {ready ? t("rateLimit.desktopReady") : t("rateLimit.desktopSecured")}
        </div>

        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: ready ? 36 : 64,
            fontWeight: 600,
            color: ready ? "#7DC59E" : "var(--cream)",
            lineHeight: 1,
            margin: "0 0 14px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {ready ? t("rateLimit.desktopReadyLabel") : display}
        </h1>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--cream-soft)",
            margin: "0 0 16px",
          }}
        >
          {ready
            ? t("rateLimit.mobileReadyHint")
            : message ?? t("rateLimit.desktopDefaultMsg")}
        </p>

        {!ready && tip && (
          <p
            style={{
              fontSize: 12,
              color: "var(--muted)",
              margin: "0 0 24px",
              lineHeight: 1.6,
              fontStyle: "italic",
              padding: "10px 14px",
              background: "rgba(244,228,193,0.04)",
              border: "1px dashed rgba(244,228,193,0.10)",
              borderRadius: 10,
            }}
          >
            💡 {tip}
          </p>
        )}

        <Link
          href={backHref}
          style={{
            display: "inline-block",
            padding: ready ? "14px 32px" : "10px 20px",
            background: ready
              ? "linear-gradient(135deg, #E8A33D, #B5462E)"
              : "transparent",
            color: ready ? "#16111E" : "var(--cream-soft)",
            border: ready ? "none" : "1px solid rgba(244,228,193,0.10)",
            borderRadius: 12,
            fontSize: ready ? 14 : 13,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: ready ? "0 8px 24px rgba(232,163,61,0.25)" : "none",
          }}
        >
          {ready ? t("rateLimit.desktopRequestBtn") : "← " + t("common.back")}
        </Link>
      </div>
      <BreatheKeyframes />
    </div>
  );
}

/**
 * Animation "respirer" : 4s aller-retour qui simule une inspiration/expiration
 * lente. Effet psycho-physiologique calmant — utilisé dans les apps de
 * méditation pour ralentir le rythme cardiaque de l'utilisateur stressé.
 *
 * @media (prefers-reduced-motion) → désactive (déjà géré par le globals.css).
 */
function BreatheKeyframes() {
  return (
    <style>{`
      @keyframes bmd-breathe {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(232,163,61,0.30);
        }
        50% {
          transform: scale(1.06);
          box-shadow: 0 0 0 18px rgba(232,163,61,0);
        }
      }
    `}</style>
  );
}
