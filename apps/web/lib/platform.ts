"use client";

/**
 * Détection plateforme côté client — sert à adapter les libellés et
 * l'UX biométrique (Face ID vs Touch ID vs Empreinte vs Windows Hello).
 *
 * On reste dans une heuristique conservatrice : userAgent + propriétés
 * `navigator` + `userAgentData` (Chrome récent uniquement). En cas de
 * doute, on retombe sur des labels génériques ("Passkey", "Biométrie").
 *
 * Pourquoi pas une lib ? Pour ce niveau de finesse, 30 lignes home-made
 * suffisent et évitent un bundle externe.
 */

export type Platform =
  | "ios" // iPhone / iPad / iPod (et iPad Safari qui ment en se faisant passer pour Mac)
  | "android"
  | "macos"
  | "windows"
  | "linux"
  | "unknown";

export interface PlatformInfo {
  platform: Platform;
  /** Phone (small touch screen) — true sur iPhone/Android phone. */
  isMobile: boolean;
  /** Tablet (medium touch screen) — true sur iPad/Android tablet. */
  isTablet: boolean;
  /** Standalone (PWA installée et lancée hors-navigateur). */
  isStandalone: boolean;
  /**
   * Label "natif" du moyen biométrique le plus probable.
   * iPhone X+ / iPad Pro = Face ID
   * iPhone < X = Touch ID
   * Mac Apple Silicon = Touch ID
   * Android = Empreinte
   * Windows = Windows Hello
   */
  biometricLabel: string;
  /** Emoji / icône courte associée au moyen biométrique. */
  biometricEmoji: string;
}

export function detectPlatform(): PlatformInfo {
  if (typeof window === "undefined") {
    return defaultInfo();
  }
  const ua = navigator.userAgent;
  const platform = detectOs(ua);

  // iPad récent se déclare "Macintosh" + maxTouchPoints>0
  const isIpadPretendingMac =
    platform === "macos" && navigator.maxTouchPoints > 1;

  const isMobile =
    /iPhone|Android.*Mobile|iPod/i.test(ua) || platform === "ios";
  const isTablet =
    /iPad|Android(?!.*Mobile)|Tablet/i.test(ua) || isIpadPretendingMac;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS spécifique : Safari ajoute navigator.standalone
    (window.navigator as any).standalone === true;

  // Heuristique Face ID / Touch ID :
  // - iPhone X (2017) et plus = Face ID. Avant = Touch ID.
  // - iPhone modèles : on regarde via screen.height (X = 812pt+) — pas
  //   parfait, mais évite de demander en dur le modèle.
  let biometricLabel = "Passkey";
  let biometricEmoji = "🔐";

  if (platform === "ios") {
    // iPhone Face ID a une notch → screen.height >= 812 ou screen.width >= 375 + ratio
    const h = window.screen?.height ?? 0;
    const w = window.screen?.width ?? 0;
    const max = Math.max(h, w);
    const isFaceId = max >= 812; // iPhone X / 11 / 12 / 13 / 14 / 15 / 16
    biometricLabel = isFaceId ? "Face ID" : "Touch ID";
    biometricEmoji = isFaceId ? "👤" : "👆";
  } else if (platform === "macos") {
    biometricLabel = "Touch ID";
    biometricEmoji = "👆";
  } else if (platform === "android") {
    biometricLabel = "Empreinte";
    biometricEmoji = "👆";
  } else if (platform === "windows") {
    biometricLabel = "Windows Hello";
    biometricEmoji = "🪟";
  }

  return {
    platform,
    isMobile,
    isTablet: isTablet && !isMobile,
    isStandalone,
    biometricLabel,
    biometricEmoji,
  };
}

function detectOs(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
}

function defaultInfo(): PlatformInfo {
  return {
    platform: "unknown",
    isMobile: false,
    isTablet: false,
    isStandalone: false,
    biometricLabel: "Passkey",
    biometricEmoji: "🔐",
  };
}

/**
 * Vibre le device — UX banking app : feedback haptique léger à la
 * confirmation d'une action importante. No-op si non supporté.
 *
 * Patterns courants :
 *  - tap : 10ms — confirmation discrète d'un tap réussi
 *  - success : [10, 30, 10] — double "tic" agréable
 *  - warn : [40, 20, 40] — "ondulé"
 *  - error : [80, 40, 80, 40, 80] — solide, attire l'attention
 */
export function haptic(
  pattern: "tap" | "success" | "warn" | "error" | number | number[] = "tap",
): void {
  if (typeof window === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  const patterns: Record<string, number | number[]> = {
    tap: 10,
    success: [10, 30, 10],
    warn: [40, 20, 40],
    error: [80, 40, 80, 40, 80],
  };
  const v =
    typeof pattern === "string"
      ? patterns[pattern]
      : pattern;
  try {
    navigator.vibrate(v);
  } catch {
    /* ignore */
  }
}

/**
 * Résultat de la détection asynchrone d'un platform authenticator
 * (Touch ID / Face ID intégré au device, par opposition à une clé USB).
 *
 * À appeler après le mount, car ça fait un round-trip système.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    const fn =
      window.PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable;
    if (!fn) return false;
    return await fn.call(window.PublicKeyCredential);
  } catch {
    return false;
  }
}
