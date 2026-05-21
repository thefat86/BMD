"use client";

/**
 * <DevFreshBadge /> · Badge dev (visible UNIQUEMENT en non-production).
 *
 * Affiche en bas-droite de l'écran un petit badge avec :
 *  - Le timestamp du build / hot reload (utile pour confirmer qu'on a bien
 *    la dernière version sur iPhone via ngrok)
 *  - Un bouton "🧹" qui clear localStorage + caches + SW puis reload
 *
 * IMPORTANT : ne render rien en production. Ce composant est destiné
 * exclusivement au cycle dev/test sur mobile.
 */
import { useEffect, useState } from "react";

export function DevFreshBadge() {
  const [now, setNow] = useState<string>("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    setShow(true);
    const t = new Date();
    setNow(
      `${t.getHours().toString().padStart(2, "0")}:${t
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${t.getSeconds().toString().padStart(2, "0")}`,
    );
  }, []);

  if (!show) return null;

  async function forceFresh() {
    try {
      // 1. localStorage / sessionStorage
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        /* ignore */
      }
      // 2. Service worker
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          try {
            await reg.unregister();
          } catch {
            /* ignore */
          }
        }
      }
      // 3. CacheStorage
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          try {
            await caches.delete(k);
          } catch {
            /* ignore */
          }
        }
      }
      // 4. Hard reload (cache busting via timestamp)
      const url = new URL(window.location.href);
      url.searchParams.set("_fresh", String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[DevFreshBadge] forceFresh failed:", e);
      window.location.reload();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 14,
        right: 14,
        zIndex: 99999,
        display: "flex",
        gap: 6,
        alignItems: "center",
        background: "rgba(232, 163, 61, 0.95)",
        color: "#16111E",
        padding: "6px 10px 6px 12px",
        borderRadius: 999,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.4,
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        pointerEvents: "auto",
      }}
      title="Build dev — tape 🧹 pour clear tout"
    >
      <span>DEV · {now}</span>
      <button
        type="button"
        onClick={forceFresh}
        aria-label="Force fresh (clear all caches and reload)"
        style={{
          background: "rgba(22,17,30,0.9)",
          color: "#E8A33D",
          border: "none",
          borderRadius: 999,
          width: 22,
          height: 22,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "inherit",
        }}
      >
        🧹
      </button>
    </div>
  );
}
