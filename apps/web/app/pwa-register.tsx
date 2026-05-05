"use client";
import { useEffect, useState } from "react";

/**
 * Composant client pour :
 *  1. Enregistrer le service worker
 *  2. Afficher le bouton "Installer BMD" quand le navigateur le permet
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegister() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. Enregistrer le service worker (en prod uniquement, pas en dev)
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[BMD] SW register failed:", err));
    }

    // 2. Capturer l'événement d'installation Android/Chrome desktop
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      // N'affiche le bouton qu'après quelques secondes (moins intrusif)
      setTimeout(() => setShowPrompt(true), 8000);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setShowPrompt(false);
      setInstallEvent(null);
    }
  }

  if (!showPrompt) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        right: 20,
        maxWidth: 380,
        margin: "0 auto",
        background: "linear-gradient(135deg, #2A2244, #1E1830)",
        border: "1px solid #E8A33D",
        borderRadius: 16,
        padding: 16,
        zIndex: 1000,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 32 }}>📱</div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 16,
            fontWeight: 700,
            color: "#F4E4C1",
          }}
        >
          Installer BMD
        </div>
        <div style={{ fontSize: 11, color: "#E8D5B7", marginTop: 2 }}>
          Accès rapide depuis ton écran d'accueil
        </div>
      </div>
      <button
        onClick={install}
        style={{
          padding: "8px 16px",
          borderRadius: 10,
          background: "linear-gradient(135deg, #E8A33D, #B5462E)",
          color: "#16111E",
          border: "none",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Installer
      </button>
      <button
        onClick={() => setShowPrompt(false)}
        style={{
          background: "transparent",
          border: "none",
          color: "#8A7B6B",
          fontSize: 18,
          cursor: "pointer",
          padding: 4,
        }}
        aria-label="Fermer"
      >
        ✕
      </button>
    </div>
  );
}
