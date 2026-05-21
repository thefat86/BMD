"use client";

/**
 * <BoosterPurchaseCard> · V47 — Achat du Pack IA Booster (4,99 €).
 *
 * Affiche :
 *  - Le pack disponible (prix, durée, scans) + CTA "Acheter"
 *  - Les packs Booster actifs du user avec scansRemaining + expiresAt
 *
 * Flux d'achat :
 *  1. Tap "Acheter" → api.createBoosterCheckoutIntent (crée mock dev / Stripe prod)
 *  2. Si prod : Stripe Elements modal pour saisir CB
 *  3. Sur succès → api.confirmBoosterPurchase → ligne PlanBoosterPurchase créée
 *  4. Toast + refresh état pour afficher le nouveau pack actif
 *
 * NOTE V47 : en dev (mock=true), on saute Stripe Elements et appelle directement
 * confirm-purchase avec le mock ID. Tester avec le vrai Stripe quand la clé
 * sera prête.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, isUnauthorized } from "../api-client";
import { useToast } from "./toast";
import { useT } from "../i18n/app-strings";

interface BoosterState {
  pack: {
    code: string;
    name: string;
    priceCents: number;
    scansAdded: number;
    durationDays: number;
  };
  activePacks: Array<{
    id: string;
    scansRemaining: number;
    expiresAt: string;
  }>;
  totalScansRemaining: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

export function BoosterPurchaseCard() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<BoosterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  async function refresh() {
    try {
      const s = await api.listBoosters();
      setState(s as BoosterState);
    } catch (e) {
      // 404 si l'endpoint pas encore migré → on cache le composant
      console.warn("[booster] fetch échec:", e);
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handlePurchase() {
    if (purchasing || !state) return;
    // V174.F — Guard auth : si pas de token, on évite l'erreur backend
    // "No Authorization was found in request.headers" (fastify-jwt sans bearer)
    // et on redirige propre vers login avec retour.
    if (!getToken()) {
      toast.error(
        t("booster.authRequired") ||
          "Connecte-toi pour acheter le Pack IA Booster.",
      );
      router.push("/login?next=/dashboard/plans");
      return;
    }
    setPurchasing(true);
    try {
      // V49 · Utilise Stripe Checkout Session hostée (pas besoin de Stripe.js).
      // Le frontend redirige vers la page Stripe checkout. Après paiement,
      // Stripe redirige vers /dashboard/plans?booster=success et le webhook
      // checkout.session.completed déclenche l'enregistrement du pack.
      const session = await api.createBoosterCheckoutSession();
      if (session.mock) {
        // === Mode dev mock : on simule le succès directement ===
        const fakePiId = `pi_mock_${Date.now()}`;
        await api.confirmBoosterPurchase(fakePiId, state.pack.priceCents);
        toast.success(
          t("booster.purchaseSuccess") ||
            `+${state.pack.scansAdded} scans IA ajoutés`,
        );
        await refresh();
      } else {
        // === Prod : redirection vers Stripe Checkout ===
        // Le user revient sur /dashboard/plans?booster=success après paiement.
        // Le webhook gère l'enregistrement BDD. Le useEffect ci-dessous
        // détectera le query param et fera un refresh + toast succès.
        window.location.href = session.url;
      }
    } catch (e) {
      // V174.F — Si le token a expiré entre-temps, redirige plutôt qu'afficher
      // le message brut Fastify "No Authorization was found in request.headers".
      if (isUnauthorized(e)) {
        toast.error(
          t("booster.authRequired") ||
            "Session expirée. Reconnecte-toi pour acheter le pack.",
        );
        router.push("/login?next=/dashboard/plans");
      } else {
        toast.error(e);
      }
    } finally {
      setPurchasing(false);
    }
  }

  // V49 · Au retour de Stripe Checkout (success_url), affiche un toast
  // de succès et rafraîchit l'état (webhook a normalement déjà tourné).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const booster = params.get("booster");
    if (booster === "success") {
      toast.success(
        t("booster.purchaseSuccess") ||
          "Pack IA Booster activé · scans ajoutés à ton quota",
      );
      // Nettoie le query param pour ne pas re-trigger au reload
      const url = new URL(window.location.href);
      url.searchParams.delete("booster");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
      void refresh();
    } else if (booster === "cancelled") {
      toast.info(
        t("booster.purchaseCancelled") ||
          "Achat annulé · tu peux réessayer quand tu veux",
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("booster");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !state) return null;

  const { pack, activePacks, totalScansRemaining } = state;

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(91,108,255,0.06))",
        border: "2px dashed var(--saffron, #E8A33D)",
        borderRadius: 18,
        padding: 18,
        margin: "16px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          aria-hidden
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background:
              "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))",
            color: "var(--paper, #fff)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
            <line x1="12" y1="2" x2="12" y2="22" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--cocoa, var(--cream))",
              lineHeight: 1.1,
            }}
          >
            {pack.name}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--cocoa-soft, var(--cream-soft))",
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {t("booster.subtitle") ||
              `+${pack.scansAdded} scans IA · valable ${pack.durationDays} jours · idéal pour un mariage, un voyage`}
          </div>
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            color: "var(--saffron, #E8A33D)",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {formatPrice(pack.priceCents)}
        </div>
      </div>

      {/* Packs actifs */}
      {activePacks.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "rgba(255,255,255,0.50)",
            borderRadius: 10,
            fontSize: 11.5,
            color: "var(--cocoa-soft, var(--cream-soft))",
          }}
        >
          <strong style={{ color: "var(--saffron, #E8A33D)" }}>
            {totalScansRemaining}{" "}
            {t("booster.remaining") || "scans Booster restants"}
          </strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {activePacks.map((p) => (
              <li key={p.id} style={{ marginBottom: 2 }}>
                {p.scansRemaining}{" "}
                {t("booster.scansUntil") || "scans jusqu'au"}{" "}
                <strong style={{ color: "var(--cocoa, var(--cream))" }}>
                  {formatDate(p.expiresAt)}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={handlePurchase}
        disabled={purchasing}
        style={{
          width: "100%",
          marginTop: 12,
          background:
            "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))",
          color: "var(--paper, #16111E)",
          border: "none",
          borderRadius: 12,
          padding: "12px 16px",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: purchasing ? "wait" : "pointer",
          opacity: purchasing ? 0.7 : 1,
          fontFamily: "inherit",
          boxShadow: "0 8px 20px rgba(197,138,46,0.30)",
          letterSpacing: 0.2,
        }}
      >
        {purchasing
          ? t("booster.purchasing") || "Achat en cours…"
          : `${t("booster.buyCta") || "Acheter le pack"} · ${formatPrice(pack.priceCents)}`}
      </button>
    </div>
  );
}
