"use client";

/**
 * /dashboard/plans/success — Atterrissage post-Stripe Checkout.
 *
 * V52.I3 — Bascule mobile/desktop : early-return isMobile vers
 * <MobilePlansSuccessView /> (icône check V45 pulse + CTA full-width
 * 56px). Vue desktop conservée (carte centrée 520px).
 *
 * Le polling api.me() pour confirmer l'activation Stripe est dans chaque
 * sous-vue (mobile/desktop) — pas dupliqué, chaque vue gère son propre
 * polling pour rester autonome.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../../../lib/api-client";
import { ResponsiveShell } from "../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../lib/use-breakpoint";
import { MobilePlansSuccessView } from "../../../../lib/ui/mobile-plans-success-view";
import { Icon } from "../../../../lib/ui/icons";

export default function StripeSuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: 30 }}>Chargement…</div>}>
      <SuccessInner />
    </Suspense>
  );
}

function SuccessInner() {
  const { isMobile, ready: bpReady } = useBreakpoint();

  // V52.I3 — Mobile : early-return vers la vue dédiée mobile-native.
  // V54 — Retiré `hideBottomNav` (demande Fabrice : bandeau visible PARTOUT
  // sauf sur profil pour qu'on puisse toujours rejoindre Home/Groupes/Stats/Search
  // d'un tap après confirmation paiement, sans avoir à revenir en arrière).
  if (bpReady && isMobile) {
    return (
      <ResponsiveShell
        mobileTitle="Paiement reçu"
        back={{ href: "/dashboard" }}
      >
        <MobilePlansSuccessView />
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      breadcrumb="Mon compte › Forfait"
      desktopTitle="Paiement reçu"
    >
      <DesktopPlansSuccessView />
    </ResponsiveShell>
  );
}

function DesktopPlansSuccessView() {
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
        maxWidth: 520,
        margin: "40px auto",
        textAlign: "center",
        padding: "40px 32px",
        background:
          "linear-gradient(135deg, rgba(125,197,158,0.10), rgba(232,163,61,0.06))",
        border: "1px solid var(--v45-emerald, rgba(125,197,158,0.30))",
        borderRadius: 18,
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          margin: "0 auto 22px",
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, var(--v45-emerald, #7DC59E), var(--v45-saffron, var(--saffron)))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ivory, white)",
        }}
      >
        <Icon
          name={planCode ? "check" : "sparkles"}
          size={40}
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
        }}
      >
        {planCode
          ? `Bienvenue en formule ${planCode} !`
          : "On active ton forfait…"}
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--cocoa-soft, var(--cream-soft))",
          lineHeight: 1.6,
          margin: "0 0 22px",
        }}
      >
        {planCode ? (
          <>
            Ton paiement a été reçu et ton compte est désormais sur le forfait{" "}
            <strong>{planCode}</strong>. Toutes les fonctionnalités premium
            sont déverrouillées.
          </>
        ) : pollDone ? (
          <>
            Ton paiement a bien été reçu côté Stripe. L&apos;activation peut
            prendre quelques secondes — actualise la page si l&apos;icône
            reste en attente.
          </>
        ) : (
          <>
            Ton paiement vient d&apos;être validé. On finalise
            l&apos;activation de ton compte côté serveur (quelques secondes)…
          </>
        )}
      </p>

      {sessionId && (
        <div
          style={{
            fontSize: 10,
            color: "var(--cocoa-mute, var(--muted))",
            marginBottom: 16,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Réf : {sessionId.slice(0, 24)}…
        </div>
      )}

      <Link
        href="/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 28px",
          background:
            "linear-gradient(135deg, var(--v45-saffron, var(--saffron)), var(--v45-terracotta, var(--terracotta)))",
          color: "var(--night-deep, #16111E)",
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 14,
          textDecoration: "none",
          boxShadow: "0 12px 32px rgba(232,163,61,0.30)",
        }}
      >
        Aller à mon dashboard
        <Icon name="arrow-right" size={16} color="currentColor" strokeWidth={2} />
      </Link>
    </div>
  );
}
