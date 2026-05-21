"use client";

/**
 * <IosInstallNotice /> · Bandeau d'éducation iOS pour les notifications push.
 *
 * Sur iOS (Safari), les notifications push web ne fonctionnent QUE si la
 * PWA est installée sur l'écran d'accueil (iOS 16.4+). Tant que l'app
 * tourne dans Safari, `navigator.serviceWorker.pushManager.subscribe()`
 * échoue silencieusement avec NotAllowedError.
 *
 * Ce composant détecte le cas iOS-Safari-non-standalone et affiche un
 * mini-tutoriel pour installer l'app sur l'écran d'accueil. Une fois
 * installé (et donc en mode standalone), le composant ne s'affiche plus.
 *
 * Triggers d'affichage :
 *  - Plateforme = iOS
 *  - Pas en mode standalone (= dans Safari)
 *  - User authentifié (a un token)
 *  - Pas dismissé depuis < 7j
 *  - Pas déjà abonné aux push (= pas la peine de proposer)
 */

import { useEffect, useState } from "react";
import { detectPlatform } from "../platform";

const DISMISS_KEY = "bmd_ios_install_dismissed_at";
const DISMISS_COOLDOWN_DAYS = 7;

export function IosInstallNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const info = detectPlatform();
    // 1. Filtre plateforme : iOS uniquement
    if (info.platform !== "ios") return;
    // 2. Filtre standalone : si déjà installée, pas la peine
    if (info.isStandalone) return;
    // 3. Filtre auth : pas connecté = pas de push à activer
    try {
      if (!localStorage.getItem("bmd_token")) return;
    } catch {
      return;
    }
    // 4. Filtre cooldown
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const days =
          (Date.now() - parseInt(dismissedAt, 10)) /
          (24 * 3600 * 1000);
        if (days < DISMISS_COOLDOWN_DAYS) return;
      }
    } catch {
      /* ignore */
    }
    setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Installer BMD sur l'écran d'accueil"
      className="card"
      style={{
        position: "relative",
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.08))",
        border: "1px solid rgba(232,163,61,0.30)",
      }}
    >
      <div className="card-head">
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ fontSize: 22 }}>📲</span>
          Active les notifications BMD
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--cream-soft)",
            fontSize: 18,
            cursor: "pointer",
            padding: 4,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--cream)",
          lineHeight: 1.5,
          margin: "0 0 14px",
        }}
      >
        Sur iPhone, les notifications push (nouvelle dépense, rappel
        cotisation, paiement reçu) ne marchent que si BMD est installé sur
        ton écran d'accueil. C'est aussi plus rapide à ouvrir et tu auras
        une vraie app sans la barre Safari.
      </p>

      <ol
        style={{
          margin: "0 0 14px",
          padding: "0 0 0 18px",
          fontSize: 13,
          color: "var(--cream-soft)",
          lineHeight: 1.7,
        }}
      >
        <li>
          Tape sur le bouton{" "}
          <strong style={{ color: "var(--saffron)" }}>Partager</strong>{" "}
          <span aria-hidden style={{ display: "inline-flex" }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ verticalAlign: "middle" }}
            >
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <rect x="4" y="14" width="16" height="6" rx="1" />
            </svg>
          </span>{" "}
          en bas de Safari.
        </li>
        <li>
          Choisis{" "}
          <strong style={{ color: "var(--saffron)" }}>
            « Sur l'écran d'accueil »
          </strong>
          .
        </li>
        <li>
          Touche{" "}
          <strong style={{ color: "var(--saffron)" }}>« Ajouter »</strong>{" "}
          en haut à droite.
        </li>
        <li>
          Lance BMD depuis ton écran d'accueil et active les notifs dans
          ton profil.
        </li>
      </ol>

      <p
        style={{
          fontSize: 11,
          color: "var(--cream-muted, #aaa)",
          margin: 0,
          fontStyle: "italic",
        }}
      >
        💡 Compatible iOS 16.4 et plus. iCloud Keychain garde ton passkey
        Face ID synchronisé entre tous tes appareils Apple.
      </p>
    </div>
  );
}
