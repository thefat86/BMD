"use client";
import { useEffect, useState } from "react";

/**
 * Composant client pour la PWA :
 *  1. Enregistrer le service worker (en prod uniquement)
 *  2. Afficher un prompt d'installation discret au bon moment
 *
 * Stratégies d'affichage du prompt :
 *  - Android / Chrome desktop → on capture `beforeinstallprompt` et on
 *    déclenche le prompt natif au tap utilisateur.
 *  - iOS Safari → pas d'API d'install standard, on affiche un mini-tutoriel
 *    "Tape sur ⎘ puis Ajouter à l'écran d'accueil".
 *  - Déjà installé (display-mode standalone) → on ne montre rien.
 *  - Déjà refusé → on ne re-propose pas avant 30 jours (localStorage).
 *
 * Timing : on attend que l'utilisateur soit AUTHENTIFIÉ et ait passé au
 * moins 60s sur l'app avant de proposer. Évite de polluer la 1ère visite.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "bmd_pwa_dismissed_at";
const DISMISS_COOLDOWN_DAYS = 30;
const ENGAGEMENT_DELAY_MS = 60_000; // 60s d'usage avant prompt

export function PwaRegister() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [iosFlow, setIosFlow] = useState(false);

  useEffect(() => {
    // V31 — En dev mode : si un SW prod traîne d'une session précédente,
    // on l'unregister pour ne PAS servir des chunks stales aux tests.
    // Sans ça, un dev qui passe de `npm start` → `npm run dev` reste bloqué
    // sur les anciens chunks cachés.
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV !== "production"
    ) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const reg of regs) reg.unregister().catch(() => {});
        })
        .catch(() => {});
      // Vide aussi tous les caches BMD pour ne pas garder de chunks v3
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => {
            for (const k of keys) {
              if (k.startsWith("bmd-")) caches.delete(k).catch(() => {});
            }
          })
          .catch(() => {});
      }
    }

    // 1. Enregistrer le service worker (en prod uniquement, pas en dev).
    //
    // V31 — Auto-update agressif : sans ça, quand on bump CACHE_VERSION
    // (ex: v3 → v4 pour invalider un cache stale), le nouveau SW reste en
    // état WAITING tant que l'utilisateur n'a pas fermé tous les onglets.
    // Sur mobile / PWA installée, ça peut ne JAMAIS arriver → l'utilisateur
    // reste bloqué sur l'ancien bundle (bug "api.getSiteConfig undefined").
    //
    // Solution :
    //  a. Au mount, on vérifie si une nouvelle version est en attente
    //  b. Si oui → on lui envoie un `SKIP_WAITING` pour qu'elle prenne
    //     le contrôle immédiatement
    //  c. On écoute `controllerchange` → quand le nouveau SW prend la main,
    //     on reload la page automatiquement pour utiliser le nouveau bundle
    //  d. Sinon, on déclenche `update()` qui force la vérification d'une
    //     nouvelle version même si on est dans la fenêtre HTTP cache (24h)
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      let reloadInProgress = false;
      // Auto-reload quand un nouveau SW prend le contrôle
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadInProgress) return;
        reloadInProgress = true;
        // eslint-disable-next-line no-console
        console.info("[BMD] New SW activated — reloading for fresh bundle");
        window.location.reload();
      });

      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          // Si une version est DÉJÀ en attente (bumped CACHE_VERSION) →
          // on l'active immédiatement
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          // Force la vérif d'update à chaque mount (au cas où le HTTP
          // cache de sw.js retiendrait l'ancienne version)
          registration.update().catch(() => {});
          // Quand un nouveau SW est trouvé pendant la session, dès qu'il
          // est en `installed` state on lui dit de prendre le relais
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // Nouvelle version installée et il y a déjà un controller
                // (= update, pas first install) → skipWaiting + reload
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch((err) => console.warn("[BMD] SW register failed:", err));
    }

    // 2. Pas la peine de proposer si déjà installé (PWA standalone)
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // 3. Cooldown : si refusé récemment, on attend 30j
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const days =
          (Date.now() - parseInt(dismissedAt, 10)) /
          (24 * 3600 * 1000);
        if (days < DISMISS_COOLDOWN_DAYS) return;
      }
    } catch {
      /* ignore quota */
    }

    // 4. Pas authentifié → on ne propose pas (pas la peine d'installer
    // une app qu'on ne sait pas encore si on va utiliser)
    const isAuth = !!localStorage.getItem("bmd_token");
    if (!isAuth) return;

    // 5. Détection iOS : ajout manuel via le menu partage
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari =
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // 6. Capture l'event Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      // N'affiche le prompt qu'après ENGAGEMENT_DELAY_MS d'usage
      setTimeout(() => setShowPrompt(true), ENGAGEMENT_DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // 7. iOS Safari : pas d'event natif, on affiche le tutoriel manuel
    // après le même délai d'engagement
    if (isIOS && isSafari) {
      const t = setTimeout(() => {
        setIosFlow(true);
        setShowPrompt(true);
      }, ENGAGEMENT_DELAY_MS);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setShowPrompt(false);
      setInstallEvent(null);
    } else {
      dismiss();
    }
  }

  function dismiss() {
    setShowPrompt(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  if (!showPrompt) return null;

  // Variant iOS : tutoriel manuel
  if (iosFlow) {
    return (
      <PromptCard
        emoji="📲"
        title="Installer BMD sur ton iPhone"
        body={
          <span>
            Tape sur le bouton{" "}
            <strong style={{ color: "var(--saffron, #E8A33D)" }}>
              Partager
            </strong>{" "}
            <span aria-hidden style={{ marginInline: 4 }}>
              ⎘
            </span>{" "}
            en bas, puis{" "}
            <strong>« Sur l'écran d'accueil »</strong>.
          </span>
        }
        onPrimary={dismiss}
        primaryLabel="Compris"
        onDismiss={dismiss}
      />
    );
  }

  return (
    <PromptCard
      emoji="📱"
      title="Installer BMD"
      body={
        <span>
          Accès rapide depuis ton écran d'accueil + notifications push.
        </span>
      }
      onPrimary={install}
      primaryLabel="Installer"
      onDismiss={dismiss}
    />
  );
}

function PromptCard({
  emoji,
  title,
  body,
  onPrimary,
  primaryLabel,
  onDismiss,
}: {
  emoji: string;
  title: string;
  body: React.ReactNode;
  onPrimary: () => void;
  primaryLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-labelledby="pwa-prompt-title"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        left: 16,
        right: 16,
        maxWidth: 420,
        margin: "0 auto",
        background:
          "linear-gradient(135deg, #2A2244 0%, #1E1830 100%)",
        border: "1px solid rgba(232,163,61,0.4)",
        borderRadius: 18,
        padding: 16,
        zIndex: 1000,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        animation: "bmd-pwa-slidein 0.3s ease-out",
      }}
    >
      <div
        style={{
          fontSize: 28,
          flexShrink: 0,
          width: 48,
          height: 48,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
          border: "1px solid rgba(232,163,61,0.30)",
        }}
      >
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          id="pwa-prompt-title"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 17,
            fontWeight: 700,
            color: "#F4E4C1",
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#E8D5B7",
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {body}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={onPrimary}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background:
              "linear-gradient(135deg, #E8A33D, #B5462E)",
            color: "#16111E",
            border: "none",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {primaryLabel}
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: "none",
            color: "#8A7B6B",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
          aria-label="Plus tard"
        >
          Plus tard
        </button>
      </div>
      <style jsx>{`
        @keyframes bmd-pwa-slidein {
          from {
            transform: translateY(120%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
