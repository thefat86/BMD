import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

/**
 * Configuration Capacitor — BMD app mobile (iOS + Android).
 *
 * V146 — Auto-pilote dev :
 *  - Défaut désormais "dev" (l'ancien défaut "production" causait l'erreur
 *    DNS quand `app.backmesdo.com` n'était pas encore mappé).
 *  - L'IP LAN est auto-détectée à chaque `cap sync` — plus besoin d'exporter
 *    `BMD_MOBILE_DEV_HOST=192.168.x.x` à chaque changement de Wi-Fi.
 *  - Force `BMD_MOBILE_ENV=production` UNIQUEMENT pour les builds destinés
 *    aux stores (`npm run mobile -- --prod`).
 *
 * Stratégie de servir le contenu :
 *  - DEV (défaut) → l'app pointe vers ton Next.js dev server LAN.
 *  - STAGING → staging.backmesdo.com.
 *  - PRODUCTION → app.backmesdo.com (requiert DNS configuré).
 *
 * Bundle ID : com.backmesdo.bmd (validé Fabrice 8 mai 2026).
 */

/**
 * V146 — Détecte automatiquement l'IP LAN de la machine (Wi-Fi/Ethernet).
 * Priorité : 1) fichier .bmd-dev-config.json écrit par dev-up.sh, 2) env var
 * BMD_MOBILE_DEV_HOST, 3) auto-scan des interfaces réseau, 4) localhost.
 */
function detectLanHost(): string {
  // 1) Fichier persisté par dev-up.sh (source de vérité quand on lance npm run up)
  try {
    const configPath = join(__dirname, "../../.bmd-dev-config.json");
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
      if (cfg.lanIp && typeof cfg.lanIp === "string") {
        return cfg.lanIp;
      }
    }
  } catch {
    /* ignore — fallback ci-dessous */
  }
  // 2) Variable d'env explicite (override manuel ou ngrok)
  if (process.env.BMD_MOBILE_DEV_HOST) {
    return process.env.BMD_MOBILE_DEV_HOST;
  }
  // 3) Auto-scan : prend la 1ère IPv4 LAN non-loopback (192.168 / 10.x / 172.16-31)
  try {
    const ifaces = networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] ?? []) {
        if (iface.family !== "IPv4" || iface.internal) continue;
        const ip = iface.address;
        if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip)) {
          return ip;
        }
      }
    }
  } catch {
    /* ignore */
  }
  // 4) Dernier recours
  return "localhost";
}

const env = (process.env.BMD_MOBILE_ENV ?? "dev") as
  | "dev"
  | "staging"
  | "production";

// Path d'entrée de l'app native — PAS la vitrine `/` (trop lourde et
// inutile en mobile, c'est du web marketing). On entre direct sur /login
// pour les utilisateurs non-authentifiés (l'API redirige vers /dashboard
// si une session est déjà active).
const APP_ENTRY_PATH = "/login";

/**
 * Détecte automatiquement si BMD_MOBILE_DEV_HOST est une IP LAN (192.168.x.x,
 * 10.x.x.x, 172.16-31.x.x) ou un domaine public (ngrok / cloudflared).
 *  - IP LAN  → http://… (ATS local autorisé via NSAllowsLocalNetworking)
 *  - Domaine → https://… (HTTPS forcé, plus fiable cross-réseau)
 */
function buildDevUrl(host: string): string {
  const isLanIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host);
  if (isLanIp) {
    return `http://${host}:3000${APP_ENTRY_PATH}`;
  }
  // ngrok/cloudflared servent déjà sur 443 et exposent du HTTPS auto.
  // Pas besoin de port — ngrok mappe 3000 → 443 transparent.
  return `https://${host}${APP_ENTRY_PATH}`;
}

// V146 — En dev, on auto-détecte toujours un host (LAN, env, fallback localhost)
// pour ne plus jamais avoir l'erreur DNS "Aucun serveur n'a été détecté".
const detectedHost = env === "dev" ? detectLanHost() : "";
const SERVER_URL: Record<typeof env, string | undefined> = {
  dev: buildDevUrl(detectedHost),
  staging: `https://staging.backmesdo.com${APP_ENTRY_PATH}`,
  production: `https://app.backmesdo.com${APP_ENTRY_PATH}`,
};

// V146 — Log explicite à chaque cap sync pour que Fabrice voie tout de suite
// quelle URL son app va charger. Évite les surprises silencieuses.
if (env === "dev") {
  console.log(`📱 BMD mobile · DEV mode · host: ${detectedHost}`);
  console.log(`   URL chargée par l'app : ${SERVER_URL.dev}`);
} else {
  console.log(`📱 BMD mobile · ${env.toUpperCase()} mode · ${SERVER_URL[env]}`);
}

const config: CapacitorConfig = {
  appId: "com.backmesdo.bmd",
  appName: "BMD",
  // webDir doit exister mais reste vide si on charge en remote.
  // On y mettra plus tard un fallback offline.html si besoin.
  webDir: "www",

  server: {
    url: SERVER_URL[env],
    cleartext: env === "dev", // accepte http:// uniquement en dev LAN
    // L'app charge backmesdo.com côté natif — Universal Links iOS et
    // App Links Android sont gérés par les manifests (Phase 2).
    androidScheme: "https",
    iosScheme: "https",
  },

  ios: {
    // Le scheme natif (pour les retours OAuth Apple/Google natifs en Phase 2).
    scheme: "BMD",
    // Le contenu est limité aux écrans dashboard ; la vitrine reste sur le web.
    contentInset: "always",
    // Path absolu vers le dossier ios/ (créé par `npx cap add ios` sur ton Mac).
    path: "ios",
    // ⚠️ EN DEV : false absolument, sinon les IPs LAN (192.168.x.x) sont
    // bloquées car non-déclarées comme Associated Domains.
    // EN PROD : true active la sandbox stricte iOS qui n'autorise que
    // les Universal Links déclarés via App.entitlements (backmesdo.com).
    // Activé uniquement en production pour préserver la sécurité.
    limitsNavigationsToAppBoundDomains: env === "production",
    // Réduit l'écho des taps (UX native plus fluide).
    backgroundColor: "#0E0B14", // night BMD
  },

  android: {
    // Path absolu vers android/ (créé par `npx cap add android`).
    path: "android",
    backgroundColor: "#0E0B14",
    // Bonnes pratiques Material 3 + Edge-to-edge.
    allowMixedContent: false,
    captureInput: true,
  },

  plugins: {
    SplashScreen: {
      // Splash par défaut — sera remplacée en Phase 4 par une animation custom.
      launchShowDuration: 1200,
      backgroundColor: "#0E0B14", // night BMD
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK", // mode dark only — barre de statut blanche sur fond sombre
      backgroundColor: "#0E0B14",
      overlaysWebView: true,
    },
  },
};

export default config;
