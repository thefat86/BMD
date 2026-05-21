"use client";

/**
 * V52.I3 — <MobilePlansSuccessView /> · Confirmation paiement Stripe
 * mobile-native.
 *
 * Vue 100% mobile : grand check V45 saffron pulse anim, titre Cormorant,
 * CTA full-width 56px. Plus d'emojis 🎉⏳✓ — remplacés par Icon V45
 * (check + sparkles).
 *
 * Le composant gère le polling api.me() en interne (10 retries × 1s)
 * pour attendre la confirmation du webhook Stripe.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../api-client";
import { Icon } from "./icons";

export function MobilePlansSuccessView() {
  const params = useSearchParams();
  const sessionId = params?.get("session_id") ?? null;
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [pollDone, setPollDone] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const r = await api.me();
        const code = r.user?.planCode;
        if (code && code !== "FREE") {
          setPlanCode(code);
          setPollDone(true);
          clearInterval(timer);
          return;
        }
      } catch {
        /* silent */
      }
      if (attempts >= 10) {
        setPollDone(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        padding: "24px 20px 40px",
        minHeight: "calc(100dvh - 120px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      {/* Icône succès pulse */}
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, var(--v45-emerald, #7DC59E), var(--v45-saffron, var(--saffron)))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
          boxShadow:
            "0 18px 44px rgba(125,197,158,0.35), 0 0 0 8px rgba(125,197,158,0.10)",
          color: "var(--ivory, white)",
          animation: planCode
            ? "bmd-success-pulse 2s ease-in-out 1"
            : "bmd-success-spin 1.4s linear infinite",
        }}
      >
        <Icon
          name={planCode ? "check" : "sparkles"}
          size={48}
          color="currentColor"
          strokeWidth={2.4}
        />
      </div>

      <h1
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 30,
          fontWeight: 700,
          color: "var(--cocoa, var(--cream))",
          margin: "0 0 12px",
          lineHeight: 1.15,
        }}
      >
        {planCode ? "Bienvenue !" : "On active ton forfait…"}
      </h1>

      {planCode && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            background:
              "var(--v45-saffron-pale, rgba(232,163,61,0.18))",
            border:
              "1px solid var(--v45-saffron, var(--saffron))",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--v45-saffron, var(--saffron))",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          <Icon name="sparkles" size={12} color="currentColor" strokeWidth={2} />
          {planCode}
        </div>
      )}

      <p
        style={{
          fontSize: 14,
          color: "var(--cocoa-soft, var(--cream-soft))",
          lineHeight: 1.6,
          margin: "0 0 28px",
          maxWidth: 320,
        }}
      >
        {planCode ? (
          <>
            Ton paiement a été reçu. Ton compte est désormais sur le forfait{" "}
            <strong style={{ color: "var(--cocoa, var(--cream))" }}>
              {planCode}
            </strong>{" "}
            et toutes les fonctionnalités premium sont déverrouillées.
          </>
        ) : pollDone ? (
          <>
            Ton paiement a bien été reçu côté Stripe. L&apos;activation peut
            prendre quelques secondes — tu peux rafraîchir si l&apos;icône
            reste en attente.
          </>
        ) : (
          <>
            Ton paiement vient d&apos;être validé. On finalise
            l&apos;activation de ton compte côté serveur, ça prend quelques
            secondes…
          </>
        )}
      </p>

      {sessionId && (
        <div
          style={{
            fontSize: 10,
            color: "var(--cocoa-mute, var(--muted))",
            marginBottom: 22,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: 0.4,
          }}
        >
          Réf : {sessionId.slice(0, 24)}…
        </div>
      )}

      <Link
        href="/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          maxWidth: 340,
          minHeight: 56,
          padding: "0 28px",
          background:
            "linear-gradient(135deg, var(--v45-saffron, var(--saffron)), var(--v45-terracotta, var(--terracotta)))",
          color: "var(--night-deep, #16111E)",
          borderRadius: 14,
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
          boxShadow: "0 14px 36px rgba(232,163,61,0.30)",
          touchAction: "manipulation",
        }}
      >
        Aller à mon tableau de bord
        <Icon name="arrow-right" size={18} color="currentColor" strokeWidth={2} />
      </Link>

      <style jsx>{`
        @keyframes bmd-success-pulse {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          60% {
            transform: scale(1.08);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes bmd-success-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
