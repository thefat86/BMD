/**
 * V85 — Helpers anti-crash production pour BMD.
 *
 * Trois familles d'utilitaires :
 *  - `safeNum()` : conversion string → number qui ne retourne JAMAIS NaN.
 *    Critique fintech : afficher "NaN €" sur un solde est inacceptable.
 *  - `safeStorage` : wrapper localStorage / sessionStorage qui swallow les
 *    erreurs (mode privé iOS, quota dépassé, WebView restrictive Capacitor).
 *  - `safeAsync()` : exécute une promise et log l'erreur via Sentry sans
 *    re-throw. Pour les fire-and-forget qui ne doivent pas crasher l'UI.
 *
 * Ces utilitaires n'introduisent PAS de dépendances externes — uniquement
 * `captureError` de notre wrapper Sentry. Si Sentry n'est pas configuré,
 * ils restent fonctionnels (juste un console.warn en dev).
 *
 * Convention d'usage :
 *   import { safeNum, safeStorage, safeAsync } from "@/lib/safe";
 *
 *   const amount = safeNum(rawInput);              // toujours number fini
 *   const token = safeStorage.get("bmd-token");    // null si erreur
 *   safeStorage.set("bmd-prefs", JSON.stringify(p)); // void si erreur
 *   safeAsync(api.deleteNotification(id), { context: "notif.delete" });
 */

import { captureError } from "./sentry";

// ============================================================
// safeNum : parseFloat qui ne retourne jamais NaN
// ============================================================

/**
 * Convertit une valeur (string | number | unknown) en number fini.
 * Retourne `fallback` (par défaut 0) si la valeur est :
 *   - null / undefined / vide
 *   - NaN
 *   - ±Infinity
 *   - une string non parsable
 *
 * Accepte les virgules françaises ("12,50" → 12.5) et les espaces
 * (insécables ou normaux) pour les formats financiers européens
 * ("1 234,56" → 1234.56).
 *
 * @example
 *   safeNum("12,50")     → 12.5
 *   safeNum("abc")       → 0
 *   safeNum(null)        → 0
 *   safeNum("")          → 0
 *   safeNum("1 234,56")  → 1234.56
 *   safeNum(NaN)         → 0
 *   safeNum(Infinity)    → 0
 *   safeNum("10", 999)   → 10
 *   safeNum("bad", 999)  → 999
 */
export function safeNum(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    // Normalise format européen : retire espaces + remplace virgule décimale
    const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
  }
  // boolean, object, etc. → fallback (n'a pas de sens financier)
  return fallback;
}

/**
 * Variante stricte : retourne null au lieu du fallback quand non parsable.
 * Utile pour distinguer "0 explicite" de "vide / invalide".
 */
export function safeNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ============================================================
// safeStorage : wrapper localStorage / sessionStorage défensif
// ============================================================

/**
 * Wrapper localStorage qui ne throw JAMAIS :
 *  - Mode privé iOS Safari : localStorage.setItem throw QuotaExceededError
 *  - WebView Capacitor restrictive : peut throw SecurityError
 *  - SSR (Next.js) : `localStorage` n'existe pas côté serveur
 *  - Disque plein : throw QuotaExceededError
 *
 * En cas d'erreur :
 *  - get() retourne null
 *  - set()/remove()/clear() sont no-op silencieux
 *  - En dev : console.warn
 *  - En prod : capture via Sentry (sauf pour SSR : on attend que ce soit silent)
 */
function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export const safeStorage = {
  /**
   * Lit une valeur de localStorage. Retourne null si :
   *  - SSR (pas de window)
   *  - clé inexistante
   *  - localStorage levée (rare mais possible)
   */
  get(key: string): string | null {
    if (!isBrowserStorageAvailable()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[safeStorage.get] failed for "${key}":`, err);
      }
      captureError(err as Error, { context: "safeStorage.get", key });
      return null;
    }
  },

  /**
   * Écrit une valeur. Silent en cas d'échec (mode privé, quota, etc.).
   * Retourne true si succès, false sinon — utile pour fallback UI.
   */
  set(key: string, value: string): boolean {
    if (!isBrowserStorageAvailable()) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[safeStorage.set] failed for "${key}":`, err);
      }
      captureError(err as Error, { context: "safeStorage.set", key });
      return false;
    }
  },

  /**
   * Supprime une clé. Silent en cas d'échec.
   */
  remove(key: string): void {
    if (!isBrowserStorageAvailable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[safeStorage.remove] failed for "${key}":`, err);
      }
    }
  },

  /**
   * Lit + JSON.parse. Retourne null si la clé n'existe pas OU si le JSON
   * est malformé (un seul char corrompu et tout l'app crashait avant ce
   * helper — cas classique des objets sérialisés avec un bug de schema).
   *
   * Le `fallback` est retourné en cas d'absence/corruption — typer T strict.
   */
  getJSON<T>(key: string, fallback: T): T {
    const raw = this.get(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[safeStorage.getJSON] malformed JSON for "${key}":`, err);
      }
      // JSON corrompu → on supprime la clé pour éviter de re-crasher au
      // prochain reload (la sentinelle empoisonnée doit dégager).
      this.remove(key);
      return fallback;
    }
  },

  /**
   * JSON.stringify + set. Silent en cas d'échec (incluant cycles JSON).
   * Retourne true si succès.
   */
  setJSON(key: string, value: unknown): boolean {
    try {
      return this.set(key, JSON.stringify(value));
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[safeStorage.setJSON] stringify failed for "${key}":`, err);
      }
      return false;
    }
  },
};

// ============================================================
// safeAsync : fire-and-forget avec capture Sentry
// ============================================================

interface SafeAsyncOptions {
  /** Contexte pour identifier le call site dans Sentry. */
  context?: string;
  /** Métadonnées additionnelles pour le breadcrumb Sentry. */
  meta?: Record<string, unknown>;
  /** En cas d'erreur, log aussi en console.error en prod (default: false). */
  loud?: boolean;
}

/**
 * Exécute une promise et capture l'erreur sans la re-throw.
 *
 * Cas d'usage : un onClick qui déclenche une mutation API (delete, dismiss)
 * et qui ne doit JAMAIS planter l'UI si le réseau échoue.
 *
 *   onClick={() => safeAsync(api.dismissNotification(id), {
 *     context: "notif.dismiss",
 *     meta: { notificationId: id }
 *   })}
 *
 * Sans `safeAsync` : si la promise rejette, c'est une unhandledRejection
 * qui remonte au window.onerror — invisible pour le user mais pas pour
 * Sentry. Avec safeAsync : capture propre + UI continue.
 *
 * @returns une promise<void> qui ne rejette JAMAIS.
 */
export async function safeAsync<T>(
  promise: Promise<T>,
  options: SafeAsyncOptions = {},
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (options.loud && process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.error(
        `[safeAsync${options.context ? ":" + options.context : ""}]`,
        error,
      );
    } else if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `[safeAsync${options.context ? ":" + options.context : ""}]`,
        error.message,
      );
    }
    captureError(error, {
      context: options.context ?? "safeAsync",
      ...(options.meta ?? {}),
    });
    return undefined;
  }
}

/**
 * Variante synchrone : exécute une fonction et capture l'erreur sans throw.
 * Utile pour wrap des opérations qui peuvent throw mais qu'on veut isoler
 * (parsing user-input dans un event handler, accès à window.matchMedia, etc.).
 *
 *   const isMobile = safeSync(() => window.matchMedia("(max-width: 768px)").matches, false);
 */
export function safeSync<T>(
  fn: () => T,
  fallback: T,
  context?: string,
): T {
  try {
    return fn();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[safeSync${context ? ":" + context : ""}]`, error.message);
    }
    captureError(error, { context: context ?? "safeSync" });
    return fallback;
  }
}
