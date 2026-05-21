"use client";

/**
 * /dashboard/plans/success
 *
 * Page d'atterrissage après un paiement Stripe Checkout réussi. Le
 * webhook Stripe a déjà été reçu côté backend (asynchrone — peut prendre
 * quelques secondes), donc on attend en faisant 3 polls sur api.me() pour
 * vérifier que le planCode a bien été mis à jour.
 *
 * Si après 10s on n'a toujours pas le bon plan, on affiche un message
 * rassurant ("le paiement est bien reçu, l'activation arrive sous peu") +
 * lien retour dashboard. C'est le pattern standard Stripe.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../../../lib/api-client";
import { ResponsiveShell } from "../../../../lib/ui/responsive-shell";

export default function StripeSuccessPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 30 }}>Chargement…</div>}
    >
      <SuccessInner />
    </Suspense>
  );
}

function SuccessInner() {
  const params = useSearchParams();
  const sessionId = params?.get("session_id") ?? null;
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [pollDone, setPollDone] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        // Force le rebustage du cache me()
        const r = await api.me();
        const code = r.user?.planCode;
        if (code && code !== "FREE") {
          setPlanCode(code);
          setPollDone(true);
          clearInterval(timer);
          return;
        }
      } catch {
        /* silencieux — on retentera au prochain tick */
      }
      if (attempts >= 10) {
        // 10 polls × 1s = 10s, on abandonne et on montre le message
        setPollDone(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ResponsiveShell
      breadcrumb="Mon compte › Forfait"
      desktopTitle="Paiement reçu 🎉"
      mobileTitle="Paiement reçu"
      back={{ href: "/dashboard" }}
      hideFab
    >
      <div
        style={{
          maxWidth: 520,
          margin: "40px auto",
          textAlign: "center",
          padding: "30px 24px",
          background:
            "linear-gradient(135deg, rgba(125,197,158,0.10), rgba(232,163,61,0.06))",
          border: "1px solid rgba(125,197,158,0.30)",
          borderRadius: 18,
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 14 }}>
          {planCode ? "✓" : "⏳"}
        </div>
        <h1
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 30,
            fontWeight: 700,
            color: "var(--cream)",
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
            color: "var(--cream-soft)",
            lineHeight: 1.6,
            margin: "0 0 22px",
          }}
        >
          {planCode ? (
            <>
              Ton paiement a été reçu et ton compte est désormais sur le
              forfait <strong>{planCode}</strong>. Toutes les fonctionnalités
              premium sont déverrouillées.
            </>
          ) : pollDone ? (
            <>
              Ton paiement a bien été reçu côté Stripe. L'activation peut
              prendre quelques secondes — actualise la page si l'icône reste
              en attente.
            </>
          ) : (
            <>
              Ton paiement vient d'être validé. On finalise l'activation de
              ton compte côté serveur (quelques secondes)…
            </>
          )}
        </p>

        {sessionId && (
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
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
            display: "inline-block",
            padding: "14px 28px",
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "#16111E",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
            boxShadow: "0 12px 32px rgba(232,163,61,0.30)",
          }}
        >
          Aller à mon dashboard →
        </Link>
      </div>
    </ResponsiveShell>
  );
}
