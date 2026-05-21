"use client";

/**
 * URL de l'API · résolution intelligente :
 *  1. Si NEXT_PUBLIC_API_URL est défini ET cohérent avec l'host du browser
 *     (= prod ou dev pointant vers le bon endroit), on l'utilise.
 *  2. Sinon, on dérive de window.location → essentiel pour l'accès mobile
 *     via le Wi-Fi local (l'iPhone connaît l'IP du Mac, pas localhost).
 *  3. Fallback SSR : localhost.
 *
 * Le piège classique en dev : si NEXT_PUBLIC_API_URL=localhost mais que
 * l'utilisateur accède au front via http://192.168.x.x:3000 (mobile sur
 * Wi-Fi), localhost = le téléphone lui-même → fetch fail. On détecte ce
 * cas et on bascule sur l'IP du host courant.
 */
function getApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const browserHost = window.location.hostname;

    // Tunnels publics (ngrok, cloudflared) : on ne peut PAS appeler
    // browserHost:4000 (le port 4000 n'est pas tunnelé). On passe par le
    // proxy Next.js `/_api/*` configuré dans `next.config.js` qui
    // rewrite vers http://localhost:4000/*.
    // Cas typique : dev iPhone via Capacitor + ngrok.
    const isTunnelHost =
      browserHost.endsWith(".ngrok-free.dev") ||
      browserHost.endsWith(".ngrok-free.app") ||
      browserHost.endsWith(".ngrok.io") ||
      browserHost.endsWith(".trycloudflare.com");
    if (isTunnelHost) {
      return `${window.location.protocol}//${browserHost}/_api`;
    }

    // Détection mismatch dev : env=localhost mais on n'est pas sur localhost
    const envIsLocalhost =
      fromEnv?.includes("localhost") || fromEnv?.includes("127.0.0.1");
    const browserIsLocalhost =
      browserHost === "localhost" || browserHost === "127.0.0.1";
    if (fromEnv && !(envIsLocalhost && !browserIsLocalhost)) {
      return fromEnv;
    }
    // Auto-dérive : même host, port 4000 (ou même port + 1000 ?)
    return `${window.location.protocol}//${browserHost}:4000`;
  }
  return fromEnv ?? "http://localhost:4000";
}

/**
 * V70.1 — Dérive l'extension de fichier audio à partir du mimeType d'un
 * Blob. Whisper (OpenAI) lit l'extension du filename multipart pour
 * identifier le codec quand le mimeType est ambigu. Sans cette fonction,
 * on enverrait toujours `voice.webm` même pour de l'audio iOS M4A, ce
 * qui peut confuser Whisper.
 *
 * Le wrapper voice-recorder.ts normalise déjà audio/aac → audio/m4a à
 * la source, donc ici on n'a qu'à traduire les mimeType déjà propres.
 */
function audioExtensionFromMime(mime: string): string {
  const base = (mime || "").split(";")[0].toLowerCase().trim();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return "m4a";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/aac":
    case "audio/x-aac":
      // Defensive : si jamais le wrapper laisse passer un audio/aac brut,
      // on l'étiquette en .m4a (Capacitor iOS produit toujours un container MP4).
      return "m4a";
    default:
      return "webm"; // fallback raisonnable
  }
}

const TOKEN_KEY = "bmd_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  // W2 — Fix : un login fraîchement réussi remet le timer de session-lock à
  // zéro. Sans ça, si l'utilisateur s'était déconnecté en background il y a
  // > 2 min, le SessionLock se déclenche IMMÉDIATEMENT après la connexion
  // et redemande un code OTP, alors qu'on vient juste d'en saisir un.
  // Bug observé en prod : "il demande deux fois le code envoyé par email".
  try {
    window.sessionStorage.removeItem("bmd:bg-since");
  } catch {
    /* sessionStorage indisponible (mode privé Safari) — ignore */
  }
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  // W2 — On nettoie aussi le timer de background pour éviter qu'un futur
  // login (sur le même tab) ne déclenche un lock orphelin.
  try {
    window.sessionStorage.removeItem("bmd:bg-since");
  } catch {
    /* ignore */
  }
  // V178.A — Nettoyage de la photo de profil mise en cache. Sans ça,
  // un user qui se connecte sur une machine où un autre user avait
  // uploadé sa photo verrait *cette autre photo* affichée comme si
  // c'était la sienne (bug rapporté Fabrice). La source de vérité est
  // serveur (User.photoUrl) ; le localStorage n'est qu'un optimistic
  // cache pour ne pas re-rendre vide au cold-start.
  try {
    window.localStorage.removeItem("bmd_profile_photo_v1");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event("bmd:profile-photo"));
  } catch {
    /* ignore */
  }
}

/**
 * Détails structurés renvoyés par le backend pour rendre l'UI parlante.
 * Voir apps/api/src/lib/errors.ts → AppErrorDetails.
 */
// V151 — Tarification signatures eIDAS (admin)
export interface AdminSignaturePricing {
  id: string;
  level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
  countryCode: string;
  enabled: boolean;
  costCents: number;
  priceCents: number;
  currency: string;
  yousignLevel: string;
  notes: string | null;
  marginCents: number;
  marginPct: number;
  updatedAt: string;
}

export interface ApiErrorDetails {
  /** Petit conseil expliquant pourquoi ça bloque */
  tip?: string;
  /** Texte du bouton CTA si une action est possible */
  action?: string;
  /** Destination du CTA (lien interne ou mailto:) */
  actionHref?: string;
  /** "info" → bleu / "warning" → ambre / "error" → rouge */
  severity?: "info" | "warning" | "error";
  [k: string]: unknown;
}

/**
 * Erreur typée renvoyée par notre wrapper fetch.
 * Permet aux composants de réagir au statut HTTP (ex: redirect sur 401).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Conseil d'aide affichable sous le message principal. */
  get tip(): string | undefined {
    return this.details?.tip;
  }

  /** Label du CTA si l'erreur en propose un (ex: "Passer en PREMIUM"). */
  get action(): string | undefined {
    return this.details?.action;
  }

  /** URL du CTA. */
  get actionHref(): string | undefined {
    return this.details?.actionHref;
  }

  /** Sévérité visuelle suggérée. Défaut : "warning" pour 4xx, "error" pour 5xx. */
  get severity(): "info" | "warning" | "error" {
    if (this.details?.severity) return this.details.severity;
    if (this.status >= 500) return "error";
    if (this.status === 401 || this.status === 404 || this.status === 402)
      return "info";
    return "warning";
  }
}

export function isUnauthorized(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    (e.status === 401 || e.code === "session_expired")
  );
}

/**
 * Détecte une erreur "plan insuffisant" (HTTP 402) — l'UI peut alors
 * afficher un CTA d'upgrade plutôt qu'un message d'erreur générique.
 */
export function isPlanRequired(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    (e.status === 402 ||
      e.code === "plan_required" ||
      e.code === "quota_reached")
  );
}

/**
 * Helper : retourne un message lisible à afficher dans un toast/alert,
 * incluant le tip si présent. Toujours non-vide.
 */
export function formatApiError(e: unknown): string {
  if (e instanceof ApiError) {
    return e.tip ? `${e.message}\n\n${e.tip}` : e.message;
  }
  if (e instanceof Error) return e.message;
  return "Une erreur inattendue est survenue.";
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  let r: Response;
  // Bug fix Fastify : un POST/PATCH avec `content-type: application/json`
  // mais sans body provoque "Body cannot be empty when content-type is set
  // to 'application/json'". On gère 2 cas :
  //  - body fourni → on l'envoie + content-type JSON
  //  - body undefined sur POST/PATCH/PUT → on envoie `{}` pour satisfaire
  //    le parser (les schemas Zod côté backend font déjà `req.body ?? {}`).
  //  - body undefined sur GET/DELETE → pas de body, pas de content-type
  const hasBody = body !== undefined && body !== null;
  const isMutating =
    method === "POST" || method === "PATCH" || method === "PUT";
  const serializedBody = hasBody
    ? JSON.stringify(body)
    : isMutating
      ? "{}"
      : undefined;
  try {
    r = await fetch(`${getApiUrl()}${path}`, {
      method,
      headers: {
        ...(serializedBody !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: serializedBody,
    });
  } catch (networkErr) {
    throw new ApiError(
      0,
      "network_error",
      "On n'arrive pas à joindre le serveur 📡",
      {
        severity: "warning",
        tip: "Vérifie ta connexion internet ou réessaie dans un instant — c'est peut-être une coupure passagère.",
        action: "Réessayer",
      },
    );
  }
  if (!r.ok) {
    const errBody = await r
      .json()
      .catch(() => ({ message: r.statusText, error: "unknown" }));
    const apiError = new ApiError(
      r.status,
      errBody.error ?? "unknown",
      errBody.message ?? `HTTP ${r.status}`,
      errBody.details,
    );
    // W3 — Pour les 402 "plan insuffisant", on dispatch un event global
    // que <PlanGateProvider> intercepte et qui ouvre le dialog d'upgrade
    // automatiquement, partout dans l'app — sans que chaque catch ait
    // besoin de penser à appeler planGate.handleApiError(e).
    // L'erreur est quand même thrown pour que les caller fassent leur
    // logique habituelle (clean state, optimistic rollback, etc.).
    if (
      typeof window !== "undefined" &&
      (apiError.status === 402 ||
        apiError.code === "plan_required" ||
        apiError.code === "quota_reached")
    ) {
      try {
        window.dispatchEvent(
          new CustomEvent("bmd:plan-required", { detail: apiError }),
        );
      } catch {
        /* CustomEvent indisponible — silent fallback */
      }
    }
    throw apiError;
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

/**
 * Cache mémoire pour les requêtes peu changeantes (perf).
 * Le cache de `me()` réduit le nombre de fetch lors des navigations.
 */
const meCache = {
  value: null as { user: any } | null,
  loadedAt: 0,
};
const ME_CACHE_TTL_MS = 60_000; // 1 minute

export function invalidateMeCache(): void {
  meCache.value = null;
  meCache.loadedAt = 0;
}

/**
 * Cache générique pour endpoints stables (currencies, locales, plans, fx).
 * TTL adapté par endpoint. Évite les re-fetch inutiles quand l'utilisateur
 * revient sur une page déjà visitée dans la session.
 *
 * Invalidation : appeler `invalidateGenericCache(key)` après une mutation
 * qui affecte cet endpoint (ex: admin change un tarif → invalider "/plans").
 */
const genericCache = new Map<
  string,
  { value: unknown; loadedAt: number; ttlMs: number }
>();

export function invalidateGenericCache(key?: string): void {
  if (key) genericCache.delete(key);
  else genericCache.clear();
}

/**
 * V53.C1 — Helper : invalide TOUTES les clés cache liées aux notifications.
 * Utilisé après mark-read, mark-unread, delete, etc. pour garantir que la
 * prochaine listNotifications retourne l'état frais.
 */
export function invalidateNotificationsCache(): void {
  for (const key of Array.from(genericCache.keys())) {
    if (key.startsWith("/notifications")) genericCache.delete(key);
  }
}

/**
 * V71 — Helper : invalide TOUTES les variantes du cache `/plans` (tous
 * country codes confondus). Doit être appelé après chaque mutation admin
 * sur la grille tarifaire (activer/désactiver un plan, changer un prix,
 * créer/supprimer un plan) pour que la page `/dashboard/plans` reflète
 * instantanément la nouvelle réalité au lieu d'attendre le TTL de 5 min.
 */
export function invalidatePlansCache(): void {
  for (const key of Array.from(genericCache.keys())) {
    if (key === "/plans" || key.startsWith("/plans?")) {
      genericCache.delete(key);
    }
  }
}

/**
 * Helper : mémoize une requête GET avec un TTL en ms.
 * Si le cache est encore frais, retourne la valeur sans toucher au réseau.
 */
async function memoized<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = genericCache.get(key);
  if (hit && Date.now() - hit.loadedAt < hit.ttlMs) {
    return hit.value as T;
  }
  const value = await fetcher();
  genericCache.set(key, { value, loadedAt: Date.now(), ttlMs });
  return value;
}

export const api = {
  requestOtp: (contactType: "PHONE" | "EMAIL", contactValue: string) =>
    request<{ sent: true; expiresAt: string }>("POST", "/auth/otp/request", {
      contactType,
      contactValue,
    }),

  /**
   * Demande un magic link par email (spec §7.2).
   * Mode dev : le code OTP est loggé en console serveur.
   * Mode prod : le lien sera envoyé par email transactionnel.
   */
  requestMagicLink: (email: string) =>
    request<{ sent: true; mode: string; hint: string }>(
      "POST",
      "/auth/magic-link/request",
      { email },
    ),

  verifyOtp: (input: {
    contactType: "PHONE" | "EMAIL";
    contactValue: string;
    code: string;
    displayName?: string;
  }) =>
    request<{
      token: string;
      expiresAt: string;
      user: {
        id: string;
        displayName: string;
        avatar?: string | null;
        defaultCurrency?: string;
        defaultLocale?: string;
        /** ISO date — sert au /login pour détecter les nouveaux comptes
         *  (< 1 min) et les rediriger vers /onboarding/intent. */
        createdAt: string;
      };
    }>("POST", "/auth/otp/verify", input),

  /**
   * Récupère le profil utilisateur courant.
   * Mémoïsé en mémoire 60s pour économiser les requêtes lors des navigations
   * (la plupart des pages appellent me() au mount). Bypass via clearMeCache().
   */
  me: async (): Promise<{ user: any }> => {
    const now = Date.now();
    if (meCache.value && now - meCache.loadedAt < ME_CACHE_TTL_MS) {
      return meCache.value;
    }
    const r = await request<{ user: any }>("GET", "/auth/me");
    meCache.value = r;
    meCache.loadedAt = now;
    return r;
  },

  updateMe: async (input: {
    displayName?: string;
    /** V144 — Pseudo optionnel. null pour effacer, "" toléré (vidé côté API). */
    nickname?: string | null;
    /** V144 — "NAME" ou "NICKNAME" : comment les autres me voient. */
    displayPreference?: "NAME" | "NICKNAME";
    defaultCurrency?: string;
    defaultLocale?: string;
    avatar?: string | null;
    /** Tonalité des rappels (spec §3.8) : sympa | ferme | humour | pro */
    reminderTone?: "sympa" | "ferme" | "humour" | "pro";
  }) => {
    const r = await request<{ user: any }>("PATCH", "/auth/me", input);
    // Invalide le cache pour que la prochaine lecture reflète la modif
    invalidateMeCache();
    // V144 — Si le nom (displayName, nickname ou displayPreference) change,
    // on DOIT invalider tous les caches qui contiennent une représentation
    // du nom de l'user, sinon les autres membres dans les groupes affichent
    // encore l'ancien nom jusqu'à expiration du TTL (= bug "mon nom modifié
    // ne se répercute pas"). Le cache backend est déjà purgé par auth.routes.
    const nameChanged =
      input.displayName !== undefined ||
      input.nickname !== undefined ||
      input.displayPreference !== undefined;
    // Si la devise change, idem côté balances. On regroupe les 2 conditions
    // car on doit purger un sur-ensemble qui couvre les deux cas (devise +
    // nom dépendent des mêmes caches : /groups, /me/balances/by-person…).
    if (input.defaultCurrency || nameChanged) {
      invalidateGenericCache("/me/global-balance");
      invalidateGenericCache("/me/balances/by-person");
      invalidateGenericCache("/groups");
      // Purge agressive : tous les /groups/:id/* incluent le nom des membres.
      invalidateGenericCache();
    }
    return r;
  },

  /**
   * Toggle "Ne pas déranger" sur un groupe (spec §3.12).
   * L'utilisateur ne reçoit plus de notifications pour ce groupe sauf si
   * une opération `bypassDND` (paiement le concernant directement).
   */
  setGroupDND: (groupId: string, doNotDisturb: boolean) =>
    request<{ doNotDisturb: boolean }>(
      "PATCH",
      `/groups/${groupId}/dnd`,
      { doNotDisturb },
    ),

  addContact: (contactType: "PHONE" | "EMAIL", contactValue: string) =>
    request<{ sent: true; expiresAt: string; message: string }>(
      "POST",
      "/auth/contacts/add",
      { contactType, contactValue },
    ),

  verifyContact: (input: {
    contactType: "PHONE" | "EMAIL";
    contactValue: string;
    code: string;
  }) => request<{ contact: any }>("POST", "/auth/contacts/verify", input),

  deleteContact: (contactId: string) =>
    request<void>("DELETE", `/auth/contacts/${contactId}`),

  setPrimaryContact: (contactId: string) =>
    request<{ ok: true }>("PUT", `/auth/contacts/${contactId}/primary`),

  logout: async () => {
    invalidateMeCache();
    return request<void>("POST", "/auth/logout");
  },

  /** Liste les sessions actives de l'utilisateur (spec §7.5). */
  listSessions: () =>
    request<
      Array<{
        id: string;
        device: string | null;
        createdAt: string;
        expiresAt: string;
        isCurrent: boolean;
      }>
    >("GET", "/auth/sessions"),

  /** Révoque une session à distance (déconnexion d'un autre appareil). */
  revokeSession: (sessionId: string) =>
    request<void>("DELETE", `/auth/sessions/${sessionId}`),

  // ============ 2FA TOTP (spec §7.5) ============

  twoFactorStatus: () =>
    request<{ enabled: boolean; enabledAt: string | null }>(
      "GET",
      "/auth/2fa/status",
    ),

  /** Génère un secret + URI otpauth (pas encore persisté). */
  twoFactorSetup: () =>
    request<{ secret: string; uri: string }>("POST", "/auth/2fa/setup"),

  /** Vérifie le 1er code et active 2FA. */
  twoFactorEnable: (secret: string, code: string) =>
    request<{ enabled: boolean }>("POST", "/auth/2fa/enable", {
      secret,
      code,
    }),

  /** Désactive 2FA (requiert code TOTP). */
  twoFactorDisable: (code: string) =>
    request<{ disabled: boolean }>("POST", "/auth/2fa/disable", { code }),

  // ============ SSO Google (spec §7.2) ============

  /** Indique si le SSO Google est activé côté serveur (sinon : masquer le bouton). */
  googleSsoConfig: () =>
    request<{ enabled: boolean }>("GET", "/auth/google/config"),

  /** Étape 1 : récupère l'URL d'autorisation Google + state CSRF. */
  googleSsoStart: () =>
    request<{ url: string; state: string }>("POST", "/auth/google/start"),

  /** Étape 2 : échange le code Google contre un JWT BMD. */
  googleSsoCallback: (code: string, state: string) =>
    request<{
      token: string;
      expiresAt: string;
      userId: string;
    }>("POST", "/auth/google/callback", { code, state }),

  // ============ SSO Apple (spec §7.2) ============

  appleSsoConfig: () =>
    request<{ enabled: boolean }>("GET", "/auth/apple/config"),

  appleSsoStart: () =>
    request<{ url: string; state: string }>("POST", "/auth/apple/start"),

  appleSsoCallback: (code: string, state: string, userName?: string) =>
    request<{
      token: string;
      expiresAt: string;
      userId: string;
    }>("POST", "/auth/apple/callback", { code, state, userName }),

  // ============ QR Login (spec §8.5) ============

  /** Desktop crée une demande, retourne un token à mettre dans un QR. */
  qrLoginStart: () =>
    // Body explicite (objet vide) pour éviter les soucis de body-parser
    // côté Fastify quand content-type est application/json sans body.
    request<{ token: string; expiresAt: string }>(
      "POST",
      "/auth/qr-login/start",
      {},
    ),

  /** Desktop poll cette route — quand APPROVED, reçoit le JWT. */
  qrLoginStatus: (token: string) =>
    request<
      | { status: "PENDING" | "EXPIRED" }
      | {
          status: "APPROVED";
          token: string;
          expiresAt: string;
          user: { id: string; displayName: string; avatar: string | null };
        }
    >("GET", `/auth/qr-login/status/${token}`),

  /** Mobile (connecté) approuve la demande. */
  qrLoginApprove: (token: string) =>
    request<{ approved: boolean }>("POST", "/auth/qr-login/approve", {
      token,
    }),

  /**
   * Liste de mes groupes — mémoïsée 30s pour éviter le re-fetch à chaque
   * navigation dashboard. Invalidée automatiquement à la création/suppression
   * de groupe et au changement de membership (events SSE).
   */
  listGroups: () =>
    memoized("/groups", 30_000, () =>
      request<
        Array<{
          id: string;
          name: string;
          type: string;
          defaultCurrency: string;
          membersCount: number;
          createdAt: string;
          /** Total des dépenses du groupe (string décimal) */
          totalSpent: string;
          /** Mon solde net dans ce groupe (positif = on me doit, négatif = je dois) */
          myNet: string;
        }>
      >("GET", "/groups"),
    ),

  // ===========================================================================
  // V149 — Module reconnaissance de dette (RDD)
  // ===========================================================================
  listDebts: () =>
    request<{ debts: any[] }>("GET", "/debts"),

  // V234 — Identité officielle (RDD, contrats juridiques)
  /**
   * Retourne le scan d'identité actuel du user (null si jamais scanné).
   * Status PENDING = scanné mais pas encore validé. VERIFIED = validé.
   */
  getMyIdentity: () =>
    request<{
      identity: null | {
        id: string;
        type: "ID_CARD" | "PASSPORT" | "RESIDENCE" | "DRIVER" | "OTHER";
        firstName: string | null;
        lastName: string | null;
        birthDate: string | null;
        birthPlace: string | null;
        documentNumber: string | null;
        issueDate: string | null;
        expiryDate: string | null;
        issuingCountry: string | null;
        fileUrl: string | null;
        fileType: string | null;
        status: "PENDING" | "VERIFIED" | "REJECTED";
        scannedAt: string;
        verifiedAt: string | null;
        aiConfidence: number | null;
      };
    }>("GET", "/identity/me"),

  /**
   * Envoie la pièce d'identité (base64) à OpenAI Vision pour extraction.
   * Le résultat est persisté en status PENDING. L'user doit ensuite
   * appeler verifyIdentity() après avoir corrigé les champs.
   */
  scanIdentity: (input: {
    type: "ID_CARD" | "PASSPORT" | "RESIDENCE" | "DRIVER" | "OTHER";
    fileBase64: string;
    mimeType: string;
  }) =>
    request<{
      identity: any;
      suggestions: {
        firstName: string | null;
        lastName: string | null;
        birthDate: string | null;
        birthPlace: string | null;
        documentNumber: string | null;
        issueDate: string | null;
        expiryDate: string | null;
        issuingCountry: string | null;
        confidence: number;
        type: string;
      };
    }>("POST", "/identity/scan", input),

  /**
   * Valide l'identité après correction manuelle des champs extraits.
   * Status passe à VERIFIED, le nom officiel est désormais utilisable
   * dans les documents juridiques (RDD, contrats Yousign...).
   */
  verifyIdentity: (edits?: {
    firstName?: string | null;
    lastName?: string | null;
    birthDate?: string | null;
    birthPlace?: string | null;
    documentNumber?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    issuingCountry?: string | null;
  }) =>
    request<{ identity: any }>("POST", "/identity/verify", { edits }),

  // V155 — Lookup débiteur par contact (email/tel) + track record agrégé
  /**
   * Cherche un user BMD par email ou téléphone (champs uniques).
   * Si found=true, retourne id + displayName + avatar pour auto-fill.
   * Si found=false avec normalizedValue, le wizard peut quand même
   * continuer en mode "nouveau contact à inviter".
   */
  lookupUserByContact: (value: string) =>
    request<
      | {
          found: true;
          userId: string;
          displayName: string;
          avatar: string | null;
          memberSince: string;
          normalizedValue: string;
          contactType: "EMAIL" | "PHONE";
        }
      | {
          found: false;
          normalizedValue?: string;
          contactType?: "EMAIL" | "PHONE";
          reason?: string;
        }
    >("GET", `/users/lookup-by-contact?value=${encodeURIComponent(value)}`),

  /**
   * Renvoie le track record agrégé d'un user en tant que débiteur.
   * Verdict global + stats anonymisées (pas de créanciers, pas de
   * montants individuels — uniquement compteurs et taux %).
   */
  getDebtTrackRecord: (userId: string) =>
    request<{
      userId: string;
      memberSince: string;
      memberSinceMonths: number;
      verdict: "NEW" | "EXCELLENT" | "GOOD" | "AVERAGE" | "AT_RISK";
      stats: {
        totalDebts: number;
        completedDebts: number;
        activeDebts: number;
        lateDebts: number;
        disputedDebts: number;
        totalSchedules: number;
        paidOnTime: number;
        paidLate: number;
        missed: number;
        onTimeRate: number | null;
      };
    }>("GET", `/users/${userId}/debt-track-record`),

  getDebt: (id: string) =>
    request<any>("GET", `/debts/${id}`),

  createDebt: async (input: {
    amount: number;
    currency?: string;
    interestRate?: number;
    purpose?: string;
    endDate: string;
    frequency?: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
    totalInstallments: number;
    signatureLevel?: "SIMPLE" | "ADVANCED" | "NOTARIZED";
    jurisdictionCode?: string;
    debtorUserId?: string;
    debtorContact?: string;
    debtorName: string;
    /** V165 — Dette déjà existante avec date d'origine passée + paiements reçus */
    isRetroactive?: boolean;
    pastStartDate?: string;
    previousPayments?: Array<{
      amount: number;
      paidAt: string;
      notes?: string;
      method?: "CASH" | "TRANSFER" | "MOBILE_MONEY" | "OTHER";
    }>;
    /** V165 — Mode "Registre personnel" (sans validation débiteur) */
    isPersonalLedger?: boolean;
    /** V242 — Texte libre éditable injecté dans le PDF brandé BMD */
    preamble?: string;
    additionalClauses?: string;
    footerNote?: string;
  }) => {
    const r = await request<{ id: string; publicCode: string; status: string }>(
      "POST",
      "/debts",
      input,
    );
    invalidateGenericCache("/debts");
    return r;
  },

  /**
   * V242 — Met à jour une RDD en cours d'édition.
   *  - DRAFT  : tous les champs modifiables (cœur + clauses libres).
   *  - PROPOSED : uniquement les 3 champs texte libre (preamble /
   *    additionalClauses / footerNote). Pour modifier le reste, annuler
   *    la proposition d'abord.
   */
  updateDebt: async (
    id: string,
    input: {
      amount?: number;
      interestRate?: number;
      purpose?: string;
      endDate?: string;
      frequency?: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM" | "LUMP_SUM";
      totalInstallments?: number;
      signatureLevel?: "SIMPLE" | "ADVANCED" | "NOTARIZED";
      preamble?: string | null;
      additionalClauses?: string | null;
      footerNote?: string | null;
    },
  ) => {
    const r = await request<{ id: string; status: string; updatedAt: string }>(
      "PATCH",
      `/debts/${id}`,
      input,
    );
    invalidateGenericCache(`/debts/${id}`);
    invalidateGenericCache("/debts");
    return r;
  },

  /**
   * V242 — Supprime DÉFINITIVEMENT une RDD encore en brouillon (DRAFT).
   *
   * Règles backend : statut DRAFT uniquement, créateur uniquement.
   * Cascade sur DebtParty / DebtSchedule / DebtEvent automatique.
   * 400 si la RDD a déjà été proposée (utiliser cancelDebt à la place).
   */
  deleteDebt: async (id: string) => {
    const r = await request<{ deletedId: string; publicCode: string }>(
      "DELETE",
      `/debts/${id}`,
    );
    invalidateGenericCache("/debts");
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  // V150.A — Workflow négociation
  proposeDebt: async (id: string) => {
    const r = await request<{
      id: string;
      status: string;
      expiresAt: string | null;
    }>("POST", `/debts/${id}/propose`, {});
    invalidateGenericCache("/debts");
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  respondToDebt: async (
    id: string,
    body: {
      action: "ACCEPT" | "REJECT" | "COUNTER";
      counterProposal?: {
        amount?: number;
        interestRate?: number;
        totalInstallments?: number;
        reason?: string;
      };
    },
  ) => {
    const r = await request<{
      id: string;
      status: string;
      signedAt: string | null;
    }>("POST", `/debts/${id}/respond`, body);
    invalidateGenericCache("/debts");
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  // V150.B — Témoins & garants
  addDebtParty: async (
    id: string,
    body: {
      role: "WITNESS" | "GUARANTOR";
      userId?: string;
      inviteContact?: string;
      displayName: string;
      guarantorCoverage?: number;
      guarantorTriggerDays?: number;
    },
  ) => {
    const r = await request<{
      id: string;
      role: "WITNESS" | "GUARANTOR";
      displayName: string;
      userId: string | null;
      inviteContact: string | null;
      signatureStatus: string;
      guarantorCoverage: number | null;
      guarantorTriggerDays: number | null;
      createdAt: string;
    }>("POST", `/debts/${id}/parties`, body);
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  removeDebtParty: async (debtId: string, partyId: string) => {
    const r = await request<{ ok: boolean }>(
      "DELETE",
      `/debts/${debtId}/parties/${partyId}`,
    );
    invalidateGenericCache(`/debts/${debtId}`);
    return r;
  },

  // V150.D — Médiation
  disputeDebt: async (
    id: string,
    body: {
      category:
        | "NON_PAYMENT"
        | "WRONG_AMOUNT"
        | "BAD_FAITH"
        | "FORCED_AGREEMENT"
        | "OTHER";
      reason: string;
    },
  ) => {
    const r = await request<{ id: string; status: string }>(
      "POST",
      `/debts/${id}/dispute`,
      body,
    );
    invalidateGenericCache("/debts");
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  resolveDebtDispute: async (id: string, body: { note?: string } = {}) => {
    const r = await request<{ id: string; status: string }>(
      "POST",
      `/debts/${id}/dispute/resolve`,
      body,
    );
    invalidateGenericCache("/debts");
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  // V170.D — Déclaration de paiement (créancier OU débiteur)
  /**
   * Le créancier déclare avoir reçu un paiement (status → CONFIRMED, final).
   */
  markDebtScheduleAsPaid: async (
    debtId: string,
    scheduleId: string,
    body: {
      amount?: number;
      paidAt?: string;
      method?: "CASH" | "TRANSFER" | "MOBILE_MONEY" | "OTHER";
      notes?: string;
    } = {},
  ) => {
    const r = await request<{
      id: string;
      status: string;
      paidAmount: string | null;
      paidAt: string | null;
      confirmedAt: string | null;
    }>(
      "POST",
      `/debts/${debtId}/schedules/${scheduleId}/mark-paid`,
      body,
    );
    invalidateGenericCache(`/debts/${debtId}`);
    invalidateGenericCache("/debts");
    return r;
  },

  /**
   * Le débiteur déclare avoir effectué un paiement (status → PAID, à confirmer).
   */
  declareDebtSchedulePayment: async (
    debtId: string,
    scheduleId: string,
    body: {
      amount?: number;
      paidAt?: string;
      method?: "CASH" | "TRANSFER" | "MOBILE_MONEY" | "OTHER";
      notes?: string;
    } = {},
  ) => {
    const r = await request<{
      id: string;
      status: string;
      paidAmount: string | null;
      paidAt: string | null;
    }>(
      "POST",
      `/debts/${debtId}/schedules/${scheduleId}/declare-payment`,
      body,
    );
    invalidateGenericCache(`/debts/${debtId}`);
    invalidateGenericCache("/debts");
    return r;
  },

  /**
   * Le créancier confirme une déclaration de paiement du débiteur (PAID → CONFIRMED).
   */
  confirmDebtSchedulePayment: async (
    debtId: string,
    scheduleId: string,
  ) => {
    const r = await request<{
      id: string;
      status: string;
      confirmedAt: string | null;
    }>(
      "POST",
      `/debts/${debtId}/schedules/${scheduleId}/confirm-payment`,
      {},
    );
    invalidateGenericCache(`/debts/${debtId}`);
    invalidateGenericCache("/debts");
    return r;
  },

  /**
   * V172.E — Le créancier rejette/conteste une déclaration de paiement du
   * débiteur (PAID → PENDING). Notifie le débiteur pour clarifier.
   */
  rejectDebtSchedulePayment: async (
    debtId: string,
    scheduleId: string,
    body: { reason?: string } = {},
  ) => {
    const r = await request<{
      id: string;
      status: string;
    }>(
      "POST",
      `/debts/${debtId}/schedules/${scheduleId}/reject-payment`,
      body,
    );
    invalidateGenericCache(`/debts/${debtId}`);
    invalidateGenericCache("/debts");
    return r;
  },

  // V150.C — Signature électronique qualifiée Yousign
  getYousignStatus: () =>
    request<{ enabled: boolean }>("GET", `/debts/yousign/status`),

  requestDebtSignature: async (id: string) => {
    const r = await request<{ procedureId: string; status: string }>(
      "POST",
      `/debts/${id}/sign-request`,
      {},
    );
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  getDebtSignatureStatus: (id: string) =>
    request<{
      procedureId: string;
      status: string;
      localStatus: string | null;
      signers: Array<{ id: string; status: string }>;
    }>("GET", `/debts/${id}/sign-request/status`),

  cancelDebtSignature: async (id: string, reason?: string) => {
    const r = await request<{ ok: boolean }>(
      "POST",
      `/debts/${id}/sign-request/cancel`,
      { reason },
    );
    invalidateGenericCache(`/debts/${id}`);
    return r;
  },

  // V151 — Tarification signatures (public + admin)
  // V151.F — `displayCurrency=auto` convertit en devise locale du pays (XOF, NGN, etc.)
  getSignaturePricing: (countryCode = "FR", displayCurrency = "auto") =>
    request<{
      countryCode: string;
      localCurrency: string;
      pricings: Array<{
        level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
        priceCents: number;
        currency: string;
        displayCurrency: string;
        displayPriceCents: number;
        displayZeroDecimal?: boolean;
        yousignLevel: string;
      }>;
    }>(
      "GET",
      `/signature-pricing?countryCode=${encodeURIComponent(countryCode)}&displayCurrency=${encodeURIComponent(displayCurrency)}`,
    ),

  adminListSignaturePricings: () =>
    request<{ pricings: AdminSignaturePricing[] }>(
      "GET",
      `/admin/signature-pricing`,
    ),

  adminUpsertSignaturePricing: async (input: {
    level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
    countryCode: string;
    enabled?: boolean;
    costCents: number;
    priceCents: number;
    currency?: string;
    yousignLevel?: string;
    notes?: string | null;
  }) => {
    const r = await request<{ pricing: AdminSignaturePricing }>(
      "POST",
      `/admin/signature-pricing`,
      input,
    );
    invalidateGenericCache("/admin/signature-pricing");
    invalidateGenericCache("/signature-pricing");
    return r;
  },

  adminDeleteSignaturePricing: async (id: string) => {
    const r = await request<{ ok: boolean }>(
      "DELETE",
      `/admin/signature-pricing/${id}`,
    );
    invalidateGenericCache("/admin/signature-pricing");
    invalidateGenericCache("/signature-pricing");
    return r;
  },

  adminSetSignaturePricingEnabled: async (id: string, enabled: boolean) => {
    const r = await request<{ pricing: AdminSignaturePricing }>(
      "PATCH",
      `/admin/signature-pricing/${id}/enabled`,
      { enabled },
    );
    invalidateGenericCache("/admin/signature-pricing");
    invalidateGenericCache("/signature-pricing");
    return r;
  },

  // V152 — Facturation signatures (quota + pack + à la carte)
  getDebtSignQuote: (debtId: string) =>
    request<{
      level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
      countryCode: string;
      quota: {
        level: string;
        includedInPlan: number;
        usedThisMonth: number;
        remainingFromPacks: number;
      } | null;
      pricing: { priceCents: number; currency: string } | null;
      chargeable: boolean;
      suggestedPacks: Array<{
        code: string;
        name: string;
        priceCents: number;
        currency: string;
        advancedIncluded: number;
        notarizedIncluded: number;
        durationDays: number;
      }>;
    }>("GET", `/debts/${debtId}/sign-quote`),

  createSignCheckoutIntent: (debtId: string) =>
    request<{
      clientSecret: string;
      amount: number;
      currency: string;
      level: string;
      mock?: boolean;
    }>("POST", `/debts/${debtId}/sign-checkout-intent`, {}),

  confirmSignCharge: (
    debtId: string,
    body: {
      stripePaymentIntentId: string;
      level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
    },
  ) =>
    request<{
      id: string;
      status: string;
      pricePaidCents: number;
      currency: string;
      alreadyRecorded?: boolean;
    }>("POST", `/debts/${debtId}/sign-confirm-charge`, body),

  getMySignatureQuota: () =>
    request<{
      quota: Array<{
        level: "SIMPLE" | "ADVANCED" | "NOTARIZED";
        includedInPlan: number;
        usedThisMonth: number;
        remainingFromPacks: number;
      }>;
    }>("GET", `/me/signature-quota`),

  getMyDebtBoosters: () =>
    request<{
      catalog: Array<{
        code: string;
        name: string;
        priceCents: number;
        currency: string;
        advancedIncluded: number;
        notarizedIncluded: number;
        durationDays: number;
      }>;
      activePacks: Array<{
        id: string;
        packCode: string;
        advancedIncluded: number;
        advancedUsed: number;
        notarizedIncluded: number;
        notarizedUsed: number;
        expiresAt: string;
        pricePaidCents: number;
        currency: string;
      }>;
      totals: { advancedRemaining: number; notarizedRemaining: number };
    }>("GET", `/me/debt-boosters`),

  createDebtBoosterCheckoutIntent: (
    packCode: "SIGN_PACK_SERENITY" | "SIGN_PACK_AFFAIRS",
  ) =>
    request<{
      clientSecret: string;
      amount: number;
      currency: string;
      packCode: string;
      mock?: boolean;
    }>("POST", `/me/debt-boosters/checkout-intent`, { packCode }),

  confirmDebtBoosterPurchase: (body: {
    packCode: "SIGN_PACK_SERENITY" | "SIGN_PACK_AFFAIRS";
    stripePaymentIntentId: string;
    amountCents?: number;
  }) =>
    request<{
      id: string;
      packCode: string;
      advancedIncluded: number;
      notarizedIncluded: number;
      expiresAt: string;
      pricePaidCents: number;
      currency: string;
      alreadyRecorded?: boolean;
    }>("POST", `/me/debt-boosters/confirm-purchase`, body),

  // V150.E — Certificat de remboursement
  /**
   * Télécharge le certificat soldé (acte de quittance PDF) d'une RDD.
   * Disponible uniquement quand status === COMPLETED.
   */
  downloadDebtCertificate: async (debtId: string, publicCode?: string) => {
    const token = getToken();
    const r = await fetch(`${getApiUrl()}/debts/${debtId}/certificate`, {
      method: "GET",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      const errBody = await r
        .json()
        .catch(() => ({ message: r.statusText, error: "unknown" }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
        errBody.details,
      );
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bmd-certificat-${publicCode ?? debtId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * V242 — Récupère le PDF d'APERÇU du contrat de RDD en cours (DRAFT /
   * PROPOSED / NEGOTIATING). Renvoie un Blob URL (object URL) que le
   * caller peut injecter dans une iframe pour preview live. Appel avec
   * `?mode=contract&inline=1` côté backend pour content-disposition
   * inline + titre "RECONNAISSANCE DE DETTE" + bandeau APERÇU.
   *
   * Le caller DOIT révoquer l'URL après usage avec `URL.revokeObjectURL`.
   */
  fetchDebtContractPreviewUrl: async (debtId: string): Promise<string> => {
    const token = getToken();
    const r = await fetch(
      `${getApiUrl()}/debts/${debtId}/certificate?mode=contract&inline=1`,
      {
        method: "GET",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    );
    if (!r.ok) {
      const errBody = await r
        .json()
        .catch(() => ({ message: r.statusText, error: "unknown" }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
        errBody.details,
      );
    }
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  },

  createGroup: async (input: {
    name: string;
    type: string;
    defaultCurrency?: string;
    /**
     * V111 · Cocher si le groupe est une association/à but non lucratif
     * et que ses membres doivent recevoir un reçu fiscal (article 200 CGI).
     */
    taxReceiptsEnabled?: boolean;
  }) => {
    const r = await request<{ id: string; name: string }>(
      "POST",
      "/groups",
      input,
    );
    invalidateGenericCache("/groups");
    return r;
  },

  /**
   * Détail d'un groupe — mémoïsé 15s par id. Cache court car la donnée
   * change vite (membres ajoutés, dépenses créées via SSE).
   */
  getGroup: (id: string) =>
    memoized(`/groups/${id}`, 15_000, () =>
      request<any>("GET", `/groups/${id}`),
    ),

  inviteMember: (
    groupId: string,
    contactType: "PHONE" | "EMAIL",
    contactValue: string,
    displayName?: string,
  ) =>
    request<any>("POST", `/groups/${groupId}/members`, {
      contactType,
      contactValue,
      displayName,
    }),

  /**
   * V97 — Invite plusieurs contacts d'un coup. Le backend crée maintenant
   * des invitations PENDING (plus de membre actif), envoie un email à
   * chaque contact EMAIL, et renvoie le token pour le lien magique.
   *
   * Réponse :
   *  - added[]  : invitations créées avec succès (incluent token+joinUrl)
   *  - failed[] : raison de l'échec par contact
   *  - invitations[] : alias V97 explicite (même contenu que added[])
   */
  batchInviteMembers: (
    groupId: string,
    invitations: Array<{
      contactType: "PHONE" | "EMAIL";
      contactValue: string;
      displayName?: string;
    }>,
  ) =>
    request<{
      added: Array<{
        contactValue: string;
        invitationId: string;
        token: string;
        joinUrl: string;
        emailSent: boolean;
      }>;
      failed: Array<{
        contactValue: string;
        reason: string;
        tip?: string;
      }>;
      invitations: Array<{
        invitationId: string;
        token: string;
        status: "PENDING";
        contactValue: string;
        inviteeUserId: string | null;
        joinUrl: string;
        emailSent: boolean;
      }>;
    }>("POST", `/groups/${groupId}/members/batch`, { invitations }),

  // ============================================================
  // V97 — INVITATIONS (lookup public + accept/decline + admin)
  // ============================================================

  /**
   * Lookup public d'une invitation par token. Utilisé sur la page
   * `/invite/[token]` AVANT que l'invité se connecte. Ne demande pas d'auth.
   */
  getInvitationByToken: (token: string) =>
    request<{
      id: string;
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "REVOKED";
      contactType: "PHONE" | "EMAIL";
      contactValue: string;
      displayName: string | null;
      expiresAt: string;
      declineReason: string | null;
      group: {
        id: string;
        name: string;
        type: string;
        defaultCurrency: string;
      };
      invitedBy: { displayName: string; avatar: string | null };
    }>("GET", `/invitations/${encodeURIComponent(token)}`),

  /**
   * Accepte l'invitation (auth requise — le backend vérifie que l'invité
   * connecté correspond bien au contact ciblé).
   */
  acceptInvitation: (token: string) =>
    request<{
      ok: boolean;
      alreadyMember?: boolean;
      groupId: string;
      memberId?: string | null;
      groupName?: string;
    }>("POST", `/invitations/${encodeURIComponent(token)}/accept`),

  /**
   * Refuse l'invitation avec un motif obligatoire (15 caractères min).
   * Peut être appelé sans être connecté.
   */
  declineInvitation: (token: string, reason: string) =>
    request<{ ok: boolean; alreadyDeclined?: boolean }>(
      "POST",
      `/invitations/${encodeURIComponent(token)}/decline`,
      { reason },
    ),

  /**
   * Admin : liste les invitations PENDING / ACCEPTED / DECLINED d'un groupe.
   */
  listGroupInvitations: (groupId: string) =>
    request<{
      items: Array<{
        id: string;
        status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "REVOKED";
        contactType: "PHONE" | "EMAIL";
        contactValue: string;
        displayName: string | null;
        createdAt: string;
        expiresAt: string;
        respondedAt: string | null;
        declineReason: string | null;
        invitedBy: { id: string; displayName: string };
        invitee: { id: string; displayName: string } | null;
      }>;
    }>("GET", `/groups/${groupId}/invitations`),

  /**
   * Admin : annule une invitation PENDING.
   */
  revokeInvitation: (groupId: string, invitationId: string) =>
    request<{ ok: boolean }>(
      "POST",
      `/groups/${groupId}/invitations/${invitationId}/revoke`,
    ),

  /**
   * V97.D — Génère un lien magique multi-usage + un message texte prêt à
   * poster dans un groupe WhatsApp (ou SMS, ou mail). Retourne aussi
   * des deeplinks `whatsappUrl` / `smsUrl` / `mailtoUrl` pour ouvrir
   * directement l'app correspondante avec le message pré-rempli.
   */
  generateBroadcastInvite: (
    groupId: string,
    params?: {
      tone?: "chaleureux" | "fun" | "pro";
      maxUses?: number;
      expiresInDays?: number;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params?.tone) qs.set("tone", params.tone);
    if (params?.maxUses) qs.set("maxUses", String(params.maxUses));
    if (params?.expiresInDays)
      qs.set("expiresInDays", String(params.expiresInDays));
    const url = `/groups/${groupId}/broadcast-invite${
      qs.toString() ? "?" + qs.toString() : ""
    }`;
    return request<{
      token: string;
      joinUrl: string;
      message: string;
      whatsappUrl: string;
      mailtoUrl: string;
      smsUrl: string;
      expiresInDays: number;
      maxUses: number | null;
      tone: "chaleureux" | "fun" | "pro";
    }>("GET", url);
  },

  // V53.C1 — Mémoize 20s : la liste des dépenses change peu pendant une
  // session de consultation. Invalidé automatiquement par create/update/delete
  // expense pour garantir la fraîcheur après mutation.
  listExpenses: (groupId: string) =>
    memoized(`/groups/${groupId}/expenses`, 20_000, () =>
      request<any[]>("GET", `/groups/${groupId}/expenses`),
    ),

  createExpense: async (
    groupId: string,
    input: {
      description: string;
      amount: string;
      splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
      paidByUserId?: string;
      participants: Array<{ userId: string; share?: number }>;
      /**
       * Sprint AC-2 — Multi-payeurs : si plusieurs personnes ont avancé, on
       * envoie ici la liste avec montant exact ou pourcentage. Le backend
       * choisit alors le payeur principal (plus grosse part) pour `paidById`
       * et persiste la liste complète dans ExpensePayer pour les balances.
       */
      payers?: Array<{ userId: string; amount?: string; percent?: number }>;
      /**
       * V42 — Hash SHA-256 du fichier de facture scannée (post-optim client).
       * Stocké sur la dépense pour la détection de doublons future.
       * 64 caractères hex.
       */
      receiptHash?: string;
      /**
       * V67 — Date d'occurrence de la dépense (ISO 8601). Si non fournie,
       * le backend utilise `now()`. Permet à l'utilisateur de saisir une
       * dépense passée manuellement.
       */
      occurredAt?: string;
      /**
       * V83 — Catégorie canonique de la dépense (resto / courses /
       * transport / logement / loisirs / autres). Pré-remplie par l'IA
       * (OCR scan ou voice → parseExpenseSmart) ou saisie manuellement
       * via CategoryGridSelector. Le backend stocke la valeur telle quelle
       * (champ `category String?` côté Prisma).
       */
      category?: string;
    },
  ) => {
    const r = await request<any>("POST", `/groups/${groupId}/expenses`, input);
    // Invalide les caches affectés par la création
    invalidateGenericCache("/groups");
    invalidateGenericCache(`/groups/${groupId}`);
    invalidateGenericCache(`/groups/${groupId}/balance`);
    // V53.C1 — Invalide la liste des dépenses cachée 20s
    invalidateGenericCache(`/groups/${groupId}/expenses`);
    invalidateGenericCache("/me/global-balance");
    invalidateGenericCache("/me/balances/by-person");
    return r;
  },

  /**
   * Import en lot depuis un CSV (spec §8.4).
   * Toutes les lignes deviennent des dépenses EQUAL avec tous les membres
   * comme participants et l'utilisateur courant comme payeur.
   */
  importCsvExpenses: (
    groupId: string,
    rows: Array<{
      description: string;
      amount: string;
      occurredAt?: string;
      category?: string;
    }>,
  ) =>
    request<{
      total: number;
      success: number;
      failed: number;
      results: Array<{
        ok: boolean;
        description: string;
        error?: string;
        expenseId?: string;
      }>;
    }>("POST", `/groups/${groupId}/expenses/import-csv`, { rows }),

  /**
   * Édite une dépense existante. Seul le payeur ou un admin/trésorier peut.
   * Si `amount` ou les `participants` changent, les parts sont recalculées.
   */
  updateExpense: async (
    expenseId: string,
    input: {
      description?: string;
      amount?: string;
      splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
      paidByUserId?: string;
      participants?: Array<{ userId: string; share?: number }>;
      /** Sprint AC-3 — Multi-payeurs en édition. Vide [] = repasser en single. */
      payers?: Array<{ userId: string; amount?: string; percent?: number }>;
      /**
       * V83 — Catégorie canonique. `null` retire la catégorie existante,
       * `undefined` laisse inchangé côté Prisma (PATCH partiel).
       */
      category?: string | null;
      /**
       * V216.C — Lieu libre (PATCH partiel : `null` efface, `undefined`
       * laisse inchangé). Max 120 caractères côté backend.
       */
      location?: string | null;
      /** V216.C — Date d'occurrence si on l'édite (ISO 8601). */
      occurredAt?: string;
    },
  ) => {
    const r = await request<any>("PATCH", `/expenses/${expenseId}`, input);
    // Invalide tous les caches groupes/balance — coût négligeable
    invalidateGenericCache();
    return r;
  },

  /** Supprime une dépense. Cascade auto sur les ExpenseShare. */
  deleteExpense: async (expenseId: string) => {
    const r = await request<void>("DELETE", `/expenses/${expenseId}`);
    invalidateGenericCache();
    return r;
  },

  // ============ GROUP SETTINGS / MEMBERS ============

  /** Renomme le groupe ou change la devise par défaut. */
  updateGroup: (
    groupId: string,
    input: {
      name?: string;
      defaultCurrency?: string;
      /** V111 · Active/désactive les reçus fiscaux (admin only). */
      taxReceiptsEnabled?: boolean;
      /** V141 · Exige la confirmation par le receveur après déclaration. */
      paymentConfirmationRequired?: boolean;
    },
  ) => {
    invalidateGenericCache(`/groups/${groupId}`);
    return request<any>("PATCH", `/groups/${groupId}`, input);
  },

  /** Supprime un groupe (admin uniquement, cascade sur tout). */
  deleteGroup: async (groupId: string) => {
    const r = await request<void>("DELETE", `/groups/${groupId}`);
    invalidateGenericCache("/groups");
    invalidateGenericCache(`/groups/${groupId}`);
    invalidateGenericCache(`/groups/${groupId}/balance`);
    invalidateGenericCache("/me/global-balance");
    return r;
  },

  /** Retire un membre. Empêche de retirer le dernier admin. */
  removeMember: (groupId: string, memberId: string) =>
    request<void>("DELETE", `/groups/${groupId}/members/${memberId}`),

  /** Change le rôle d'un membre (ADMIN, TREASURER, MEMBER, OBSERVER). */
  changeMemberRole: (
    groupId: string,
    memberId: string,
    role: "ADMIN" | "TREASURER" | "MEMBER" | "OBSERVER",
  ) =>
    request<any>("PATCH", `/groups/${groupId}/members/${memberId}`, { role }),

  // ============ INVITE TOKENS (lien partageable + QR) ============

  /**
   * Crée un lien d'invitation. `expiresInHours` (défaut 168 = 7j),
   * `maxUses` (défaut illimité).
   */
  createInviteToken: (
    groupId: string,
    opts?: { expiresInHours?: number; maxUses?: number | null },
  ) =>
    request<{
      id: string;
      token: string;
      expiresAt: string;
      maxUses: number | null;
      uses: number;
    }>("POST", `/groups/${groupId}/invite-tokens`, opts ?? {}),

  /** Liste les tokens d'invitation d'un groupe (admin/trésorier). */
  listInviteTokens: (groupId: string) =>
    request<
      Array<{
        id: string;
        token: string;
        expiresAt: string | null;
        maxUses: number | null;
        uses: number;
        revokedAt: string | null;
        createdAt: string;
        /** Statut humain calculé côté serveur. */
        status: "active" | "exhausted" | "expired" | "revoked";
      }>
    >("GET", `/groups/${groupId}/invite-tokens`),

  /** Révoque un token (le rend inutilisable). */
  revokeInviteToken: (tokenId: string) =>
    request<void>("DELETE", `/invite-tokens/${tokenId}`),

  /**
   * Récupère les infos publiques d'un token (PAS d'auth requise).
   * Utilisé par la page /join/[token] pour afficher "Rejoindre {nom du groupe}".
   */
  getInviteInfo: (token: string) =>
    request<{
      group: { id: string; name: string; type: string };
      valid: boolean;
      reason?: string;
    }>("GET", `/invite-info/${token}`),

  /** Rejoint un groupe via le token (auth requise). */
  joinViaInviteToken: (token: string) =>
    request<{ groupId: string; memberId: string }>(
      "POST",
      `/invite-join/${token}`,
    ),

  // ============ ACTIVITY FEED ============

  /**
   * Vérifie l'intégrité de la chaîne de hash de l'audit log (spec §3.6 §9.1).
   * Admin uniquement. Retourne valid=false + brokenAt si une entrée a été
   * altérée a posteriori (ce qui ne devrait jamais arriver en production).
   */
  verifyActivityChain: (groupId: string) =>
    request<{ valid: boolean; count: number; brokenAt?: number }>(
      "GET",
      `/groups/${groupId}/activity/verify`,
    ),

  /**
   * Feed d'activité d'un groupe (50 derniers événements).
   *
   * V119.#4 — Mémoize 20s : le feed change peu pendant la consultation
   * (pas plus d'1 event/min en moyenne). Sur navigation aller-retour
   * dashboard ↔ groupe, on évite un re-fetch HTTP de 200-400 ms et on
   * affiche l'activité instantanément depuis le cache. Invalidation
   * naturelle : les events SSE `expense.*` / `settlement.*` (cf.
   * `useGroupEvents` dans mobile-group-view) déclenchent un refresh
   * complet qui repasse par cette fonction et écrase l'entrée.
   */
  listActivity: (groupId: string) =>
    memoized(`/groups/${groupId}/activity`, 20_000, () =>
      request<
        Array<{
          id: string;
          kind: string;
          message: string;
          actorId: string | null;
          actorName: string | null;
          meta: any;
          createdAt: string;
        }>
      >("GET", `/groups/${groupId}/activity`),
    ),

  // ============ TONTINES (M08) ============

  // V53.C1 — Mémoize 20s : la tontine change peu pendant la consultation.
  // Invalidé via invalidateGenericCache après les mutations tontine.
  getTontine: (groupId: string) =>
    memoized(`/groups/${groupId}/tontine`, 20_000, () =>
      request<{ tontine: any | null }>("GET", `/groups/${groupId}/tontine`),
    ),

  /**
   * Historique des tontines du groupe (gains par bénéficiaire + dates effectives).
   * Pour le suivi long terme (2+ ans, plusieurs tontines successives).
   */
  getTontineHistory: (groupId: string) =>
    request<{
      tontines: Array<{
        id: string;
        // V231 — Nom libre choisi à la création (peut être null pour
        // les tontines historiques sans nom).
        name?: string | null;
        frequency: string;
        currency: string;
        status: string;
        contributionAmount: string;
        startDate: string;
        completedAt: string | null;
        // V219.C — Champs optionnels (peuvent ne pas exister si V219.C
        // n'a pas encore migré le schema). On les déclare optionnels pour
        // que le frontend puisse les afficher si présents.
        cancelledAt?: string | null;
        cancellationReason?: string | null;
        cancelledBy?: { id: string; displayName: string } | null;
        turns: Array<{
          id: string;
          turnNumber: number;
          beneficiary: { id: string; displayName: string; avatar: string | null };
          dueDate: string;
          scheduledDate: string | null;
          distributedAt: string | null;
          status: string;
          // V219.D — Lieu du tour (peut être null pour les tontines
          // anciennes / sans réunion physique).
          location?: string | null;
          totalReceived: string;
          currency: string;
          contributorCount: number;
          paidCount: number;
          // V219.D — Contributions détaillées pour la vue read-only.
          contributions?: Array<{
            id: string;
            contributorUserId: string;
            contributor: { id: string; displayName: string };
            amountDue: string;
            status: "PENDING" | "PAID" | "CONFIRMED";
            paymentMethod: string | null;
            paidAt: string | null;
            confirmedAt: string | null;
          }>;
        }>;
      }>;
    }>("GET", `/groups/${groupId}/tontine/history`),

  createTontine: (
    groupId: string,
    input: {
      contributionAmount: string;
      currency?: string;
      frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
      startDate: string;
      orderMode?: "RANDOM" | "MANUAL" | "AUCTION";
      centralizedPot?: boolean;
      notes?: string;
      // V231 — Nom libre de la tontine (« Tontine Été 2026 »…)
      name?: string;
      // V229 — Sous-ensemble de membres participants (≥ 2). Si omis,
      // tous les membres du groupe participent (comportement historique).
      participantUserIds?: string[];
    },
  ) =>
    request<{ id: string; status: string }>(
      "POST",
      `/groups/${groupId}/tontine`,
      input,
    ),

  // V116 — `alreadyServedUserIds` permet d'enregistrer une tontine qui
  // tournait déjà hors BMD : la liste doit être un préfixe de
  // `beneficiaryOrder` (les N premiers ont déjà reçu le pot). Les N
  // premiers turns sont créés directement en COMPLETED, le suivant en
  // IN_PROGRESS — la roue rotative reflète immédiatement l'état réel.
  // V229 — `participantUserIds` permet d'inscrire uniquement un sous-
  // ensemble des membres du groupe à la tontine.
  activateTontine: (
    tontineId: string,
    beneficiaryOrder?: string[],
    alreadyServedUserIds?: string[],
    participantUserIds?: string[],
  ) =>
    request<{ id: string; status: string }>(
      "POST",
      `/tontines/${tontineId}/activate`,
      { beneficiaryOrder, alreadyServedUserIds, participantUserIds },
    ),

  cancelTontine: (tontineId: string) =>
    request<{ id: string; status: string }>(
      "POST",
      `/tontines/${tontineId}/cancel`,
    ),

  /**
   * V219.C — L'admin demande la suppression de la tontine. Raison >=10 chars
   * obligatoire. Retourne `deleted=true` si suppression immédiate (aucun
   * paiement reçu), `requiresVote=true` sinon (vote unanime en cours).
   */
  requestTontineCancellation: (
    groupId: string,
    tontineId: string,
    reason: string,
  ) =>
    request<{
      deleted: boolean;
      requiresVote: boolean;
      status: "ACTIVE" | "DRAFT" | "CANCELLED" | "COMPLETED";
    }>(
      "POST",
      `/groups/${groupId}/tontines/${tontineId}/cancel`,
      { reason },
    ),

  /**
   * V219.C — Un membre vote sur la demande de suppression.
   * vote=true approuve ; vote=false refuse (rejet immédiat de la demande).
   */
  voteTontineCancellation: (
    groupId: string,
    tontineId: string,
    vote: boolean,
    reason?: string,
  ) =>
    request<{
      status: "PROPOSED" | "APPROVED" | "REJECTED";
      approvedCount: number;
      totalRequired: number;
    }>(
      "POST",
      `/groups/${groupId}/tontines/${tontineId}/cancel/vote`,
      { vote, reason },
    ),

  markContributionPaid: (
    contributionId: string,
    paymentMethod?: string,
    paymentReference?: string,
    /** V141 — Date effective du paiement (ISO 8601). Optionnel — défaut now. */
    paidAt?: string,
  ) =>
    request<{ id: string; status: string; paidAt: string | null }>(
      "POST",
      `/tontine-contributions/${contributionId}/mark-paid`,
      { paymentMethod, paymentReference, paidAt },
    ),

  confirmContribution: (contributionId: string) =>
    request<{ id: string; status: string; confirmedAt: string | null }>(
      "POST",
      `/tontine-contributions/${contributionId}/confirm`,
    ),

  // V136.C — Le bénéficiaire (ou admin) déclare avoir reçu un paiement
  // proactivement (sans attendre que le payeur clique "J'ai payé").
  // Transition PENDING → CONFIRMED en une étape.
  declareContributionReceived: (
    contributionId: string,
    paymentMethod: string,
    paidAt?: Date,
  ) =>
    request<{
      id: string;
      status: string;
      paidAt: string | null;
      confirmedAt: string | null;
      paymentMethod: string | null;
    }>(
      "POST",
      `/tontine-contributions/${contributionId}/declare-received`,
      { paymentMethod, paidAt: paidAt ? paidAt.toISOString() : undefined },
    ),

  distributeTurn: (turnId: string) =>
    request<{ id: string; status: string }>(
      "POST",
      `/tontine-turns/${turnId}/distribute`,
    ),

  /** Bénéficiaire ou admin : fixe la date exacte du tour (±15j de dueDate). */
  scheduleTurn: (turnId: string, scheduledDate: Date) =>
    request<{ id: string; scheduledDate: string }>(
      "POST",
      `/tontine-turns/${turnId}/schedule`,
      { scheduledDate: scheduledDate.toISOString() },
    ),

  /** N'importe quel membre : accuse réception de la date choisie. */
  acknowledgeTurn: (turnId: string) =>
    request<{ acknowledged: boolean }>(
      "POST",
      `/tontine-turns/${turnId}/acknowledge`,
    ),

  /**
   * V136.D — Bénéficiaire ou admin édite location + meetingTime + notes du tour.
   * `null` efface explicitement le champ, `undefined` ne le touche pas.
   */
  updateTurnDetails: (
    turnId: string,
    input: {
      location?: string | null;
      meetingTime?: string | null;
      notes?: string | null;
      /** V138 — Date du tour. ISO 8601 avec offset. Doit rester dans le mois
       * du dueDate (validé côté serveur). */
      scheduledDate?: string | null;
    },
  ) =>
    request<{
      id: string;
      scheduledDate: string | null;
      location: string | null;
      meetingTime: string | null;
      notes: string | null;
    }>("PATCH", `/tontine-turns/${turnId}/details`, input),

  /**
   * V138 — Un admin propose un changement de date/lieu/heure pour le tour
   * d'un autre membre. La proposition reste PENDING jusqu'à l'accept/reject
   * du bénéficiaire concerné.
   */
  proposeTurnUpdate: (
    turnId: string,
    input: {
      proposedScheduledDate?: string | null;
      proposedLocation?: string | null;
      proposedMeetingTime?: string | null;
      proposedNotes?: string | null;
      message?: string | null;
    },
  ) =>
    request<{ id: string; status: string }>(
      "POST",
      `/tontine-turns/${turnId}/proposals`,
      input,
    ),

  /**
   * V138 — Le bénéficiaire accepte ou refuse une proposition admin.
   */
  respondToTurnProposal: (
    proposalId: string,
    input: { decision: "ACCEPT" | "REJECT"; rejectionReason?: string | null },
  ) =>
    request<{ status: "ACCEPTED" | "REJECTED"; proposalId: string }>(
      "POST",
      `/tontine-turn-proposals/${proposalId}/respond`,
      input,
    ),

  /** Liste les acks d'un tour (qui a confirmé, qui pas). */
  listTurnAcks: (turnId: string) =>
    request<{
      turnId: string;
      scheduledDate: string | null;
      members: Array<{
        userId: string;
        displayName: string;
        acknowledged: boolean;
        isBeneficiary: boolean;
      }>;
    }>("GET", `/tontine-turns/${turnId}/acks`),

  // ============ Tontines transfrontalières (spec §3.4 §4.4) ============

  /** Vue multi-devises des cotisations d'un tour : équivalent dans la devise de chaque membre. */
  getTurnContributionsCrossCurrency: (turnId: string) =>
    request<{
      turnId: string;
      tontineCurrency: string;
      contributions: Array<{
        contributorUserId: string;
        contributorName: string;
        status: string;
        tontineCurrency: string;
        amountInTontineCurrency: string;
        contributorCurrency: string;
        amountInContributorCurrency: string;
        hasConversion: boolean;
        appliedRate: number | null;
        ratedAt: string;
      }>;
    }>("GET", `/tontine-turns/${turnId}/contributions/cross-currency`),

  /** Pour MA cotisation : montant à envoyer dans MA devise locale. */
  getMyContributionLocalAmount: (contributionId: string) =>
    request<{
      amountInTontineCurrency: string;
      tontineCurrency: string;
      amountInMyCurrency: string;
      myCurrency: string;
      hasConversion: boolean;
      rate: number | null;
    }>("GET", `/tontine-contributions/${contributionId}/local-amount`),

  // ============ Hui / Enchères (spec §3.4) ============

  /** Liste les enchères d'un tour (mode AUCTION). */
  listTurnBids: (turnId: string) =>
    request<
      Array<{
        id: string;
        bidderId: string;
        amount: string;
        won: boolean;
        createdAt: string;
        bidder: { id: string; displayName: string; avatar: string | null };
      }>
    >("GET", `/tontine-turns/${turnId}/bids`),

  /** Pose ou met à jour son enchère. */
  placeBid: (turnId: string, amount: string) =>
    request<{ id: string; amount: string }>(
      "POST",
      `/tontine-turns/${turnId}/bids`,
      { amount },
    ),

  /** Retire son enchère. */
  withdrawBid: (turnId: string) =>
    request<{ withdrawn: boolean }>(
      "DELETE",
      `/tontine-turns/${turnId}/bids`,
    ),

  /** Clôture les enchères et déclare le gagnant (admin). */
  closeBidding: (turnId: string) =>
    request<{ winnerUserId: string; winningBid: string }>(
      "POST",
      `/tontine-turns/${turnId}/bids/close`,
    ),

  // ============ Settlements + mode invité (spec §3.5, §7.6) ============

  /** Crée un règlement explicite. */
  createSettlement: (
    groupId: string,
    body: {
      fromUserId: string;
      toUserId: string;
      amount: string;
      currency?: string;
    },
  ) => request<any>("POST", `/groups/${groupId}/settlements`, body),

  /** Génère un lien public de paiement pour mode invité. */
  createPaymentToken: (settlementId: string) =>
    request<{
      token: string;
      expiresAt: string;
    }>("POST", `/settlements/${settlementId}/payment-tokens`),

  /** Le créancier confirme avoir reçu le paiement. */
  confirmSettlement: (settlementId: string) =>
    request<any>("POST", `/settlements/${settlementId}/confirm`),

  /** Récupère les infos publiques d'un token de paiement (no auth). */
  getPayInfo: (token: string) =>
    request<{
      groupName: string;
      from: string;
      to: string;
      amount: string;
      currency: string;
      status: string;
    }>("GET", `/pay-info/${token}`),

  /**
   * Confirme le paiement via token (no auth — mode invité).
   *
   * V141 — Accepte désormais méthode + référence + date du paiement.
   * Si `Group.paymentConfirmationRequired === false`, le statut renvoyé
   * sera "CONFIRMED" directement ; sinon "PAID" en attente de confirmation
   * créancier.
   */
  confirmPayment: (
    token: string,
    input?: {
      paymentMethod?: string;
      paymentReference?: string | null;
      /** ISO 8601 avec offset. */
      paidAt?: string;
    },
  ) =>
    request<{ confirmed: boolean; status?: string }>(
      "POST",
      `/pay-confirm/${token}`,
      input ?? {},
    ),

  /**
   * Solde global de l'utilisateur sur tous ses groupes.
   * Affiché en haut du dashboard (style maquette BMD_site_web.html).
   *
   * Note : pas de conversion FX live (spec §4 non-implémentée MVP).
   * Si les groupes sont dans des devises différentes, byCurrency permet
   * d'afficher le détail par devise.
   */
  /**
   * Solde global — mémoïsé 30s. Appelé sur dashboard mount + après chaque
   * navigation back. Invalidé au création/suppression de dépense via SSE.
   */
  getMyGlobalBalance: () =>
    memoized("/me/global-balance", 30_000, () =>
      request<{
        net: string;
        owedToMe: string;
        iOwe: string;
        primaryCurrency: string;
        byCurrency: Record<
          string,
          { net: string; owedToMe: string; iOwe: string }
        >;
        groupCount: number;
      }>("GET", "/me/global-balance"),
    ),

  /**
   * V26 · Solde **par contrepartie** (vue par personne du dashboard).
   *
   * Retourne pour chaque personne avec qui l'utilisateur partage au moins un
   * groupe le net agrégé en devise utilisateur, plus un breakdown par groupe
   * pour drill-down. Les contreparties à net=0 sont incluses (UI affiche
   * un badge "à jour"). Ordre : créditeurs (net > 0) → débiteurs → à jour.
   *
   * Mémoïsé 30s côté client en plus du cache 30s côté serveur. Invalidé via
   * SSE quand un Settlement est confirmé ou qu'une Expense touche l'user.
   */
  getMyBalancesByPerson: () =>
    memoized("/me/balances/by-person", 30_000, () =>
      request<{
        primaryCurrency: string;
        hasConversion: boolean;
        people: Array<{
          counterpartyUserId: string;
          displayName: string;
          net: string;
          currency: string;
          sharedGroups: number;
          byGroup: Array<{
            groupId: string;
            groupName: string;
            net: string;
            currency: string;
            netInUserCurrency: string;
          }>;
        }>;
      }>("GET", "/me/balances/by-person"),
    ),

  /**
   * V30 · Crée un règlement multi-groupe en 1 tap.
   *
   * Le serveur crée 1 parent CrossGroupSettlement + N children Settlement
   * dans une transaction Prisma. Status initial : PROPOSED. Le créancier
   * net devra ensuite confirmer la réception via confirmCrossSettlement.
   */
  createCrossSettlement: (input: {
    counterpartyUserId: string;
    netDirection: "actorPays" | "actorReceives";
    totalAmount: string;
    currency: string;
    memo?: string;
    children: Array<{
      groupId: string;
      direction: "actorPays" | "actorReceives";
      amount: string;
      currency: string;
    }>;
  }) =>
    request<{ id: string; childrenIds: string[] }>(
      "POST",
      "/me/cross-settlements",
      input,
    ).then((r) => {
      // Invalider le cache local pour rafraîchir la vue par personne
      invalidateGenericCache("/me/balances/by-person");
      invalidateGenericCache("/me/global-balance");
      return r;
    }),

  /** V30 · Confirme un cross-settlement (créancier déclare avoir reçu). */
  confirmCrossSettlement: (id: string) =>
    request<{ ok: true }>("POST", `/cross-settlements/${id}/confirm`).then(
      (r) => {
        invalidateGenericCache("/me/balances/by-person");
        invalidateGenericCache("/me/global-balance");
        invalidateGenericCache("/groups");
        return r;
      },
    ),

  /** V30 · Annule un cross-settlement non encore confirmé. */
  cancelCrossSettlement: (id: string) =>
    request<{ ok: true }>("POST", `/cross-settlements/${id}/cancel`).then(
      (r) => {
        invalidateGenericCache("/me/balances/by-person");
        return r;
      },
    ),

  /** V30 · Liste les cross-settlements de l'utilisateur (50 derniers). */
  listMyCrossSettlements: () =>
    request<
      Array<{
        id: string;
        fromUser: { id: string; displayName: string };
        toUser: { id: string; displayName: string };
        totalAmount: string;
        currency: string;
        status: "PROPOSED" | "PAID" | "CONFIRMED" | "CANCELLED";
        proposedAt: string;
        confirmedByPayerAt: string | null;
        confirmedByPayeeAt: string | null;
        memo: string | null;
        children: Array<{
          id: string;
          groupId: string;
          groupName: string;
          amount: string;
          currency: string;
          status: "PROPOSED" | "PAID" | "CONFIRMED" | "CANCELLED";
        }>;
      }>
    >("GET", "/me/cross-settlements"),

  /**
   * Solde d'un groupe — mémoïsé 15s par id. Cache court car la donnée
   * change vite (nouvelles dépenses, règlements). Invalidé via SSE
   * `expense.created` / `settlement.confirmed` sur le useGroupEvents hook.
   */
  getBalance: (groupId: string) =>
    memoized(`/groups/${groupId}/balance`, 15_000, () =>
      request<{
        currency: string;
        balances: Array<{ userId: string; displayName: string; net: string }>;
        suggestions: Array<{
          fromUserId: string;
          fromName: string;
          toUserId: string;
          toName: string;
          amount: string;
          currency: string;
        }>;
      }>("GET", `/groups/${groupId}/balance`),
    ),

  // ============ DEBT SWAPS (M09) ============

  listSwaps: (groupId: string, includeResolved = false) =>
    request<any[]>(
      "GET",
      `/groups/${groupId}/debt-swaps?includeResolved=${includeResolved}`,
    ),

  proposeSwap: (groupId: string, description?: string) =>
    request<any>("POST", `/groups/${groupId}/debt-swaps`, { description }),

  acceptSwap: (swapId: string) =>
    request<any>("POST", `/debt-swaps/${swapId}/accept`),

  rejectSwap: (swapId: string) =>
    request<any>("POST", `/debt-swaps/${swapId}/reject`),

  cancelSwap: (swapId: string) =>
    request<{ id: string; status: string }>(
      "POST",
      `/debt-swaps/${swapId}/cancel`,
    ),

  // ============ DEBT TRANSFERS (bilatéral A→C / C↔B) ============

  /**
   * Liste les transferts de dette d'un groupe.
   * Par défaut on ne renvoie que les PROPOSED et ACTIVE (les en-cours).
   */
  listDebtTransfers: (groupId: string, includeFinished = false) =>
    request<any[]>(
      "GET",
      `/groups/${groupId}/debt-transfers${includeFinished ? "?includeFinished=1" : ""}`,
    ),

  /**
   * Propose : A demande à C de reprendre sa dette envers B.
   * Le proposer est typiquement A (fromUser), mais admin autorisé aussi.
   */
  proposeDebtTransfer: (
    groupId: string,
    input: {
      fromUserId: string;
      assumeUserId: string;
      creditorUserId: string;
      amount: string;
      currency?: string;
      reason?: string;
    },
  ) => request<any>("POST", `/groups/${groupId}/debt-transfers`, input),

  acceptDebtTransferAsAssumer: (id: string) =>
    request<any>("POST", `/debt-transfers/${id}/accept-assumer`),
  rejectDebtTransferAsAssumer: (id: string) =>
    request<any>("POST", `/debt-transfers/${id}/reject-assumer`),
  acceptDebtTransferAsCreditor: (id: string) =>
    request<any>("POST", `/debt-transfers/${id}/accept-creditor`),
  rejectDebtTransferAsCreditor: (id: string) =>
    request<any>("POST", `/debt-transfers/${id}/reject-creditor`),
  cancelDebtTransfer: (id: string) =>
    request<any>("POST", `/debt-transfers/${id}/cancel`),

  // ============ EXPENSE ITEMS (split par item) ============

  /** Liste les items d'une dépense + claims des membres. */
  listExpenseItems: (expenseId: string) =>
    request<
      Array<{
        id: string;
        position: number;
        description: string;
        quantity: string;
        unitPrice: string;
        totalPrice: string;
        category: string | null;
        claims: Array<{
          id: string;
          userId: string;
          share: string;
          user: { id: string; displayName: string; avatar: string | null };
        }>;
      }>
    >("GET", `/expenses/${expenseId}/items`),

  /**
   * Remplace tous les items d'une dépense (utilisé après scan OCR
   * ou édition manuelle). Réservé au payeur ou admin.
   */
  setExpenseItems: (
    expenseId: string,
    items: Array<{
      description: string;
      quantity?: number;
      unitPrice: string;
      totalPrice: string;
      category?: string;
      /**
       * V239.A — Users ayant consommé cet item. Si fourni, le backend crée
       * automatiquement les ExpenseItemClaim (share 1/N) et recalcule les
       * ExpenseShare en mode ITEMIZED pour que le détail affiche la vraie
       * répartition par articles.
       */
      assignedUserIds?: string[];
    }>,
  ) => request<any[]>("PUT", `/expenses/${expenseId}/items`, { items }),

  /** Calcule combien chaque membre doit payer en mode ITEMIZED. */
  getItemizedShares: (expenseId: string) =>
    request<
      Array<{
        userId: string;
        displayName: string;
        amountOwed: string;
        items: Array<{
          itemId: string;
          description: string;
          itemTotal: string;
          myShare: string;
          myAmount: string;
        }>;
      }>
    >("GET", `/expenses/${expenseId}/itemized-shares`),

  /**
   * Revendique un item.
   *  - claimItem(id) : pour soi-même
   *  - claimItem(id, undefined, userId) : assigne à un autre membre
   *    (autorisé si je suis le payeur ou admin)
   */
  claimItem: (itemId: string, share?: number, targetUserId?: string) =>
    request<any>("POST", `/expense-items/${itemId}/claim`, {
      ...(share !== undefined ? { share } : {}),
      ...(targetUserId ? { targetUserId } : {}),
    }),

  /** Je retire mon claim sur cet item. */
  unclaimItem: (itemId: string) =>
    request<{ unclaimed: boolean }>(
      "DELETE",
      `/expense-items/${itemId}/claim`,
    ),

  // ============ SPLIT PRESETS (M10) ============

  listPresets: (groupId: string) =>
    request<
      Array<{
        id: string;
        name: string;
        splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
        config: {
          participants: Array<{ userId: string; share?: number }>;
          paidByUserId?: string;
        };
        createdAt: string;
      }>
    >("GET", `/groups/${groupId}/split-presets`),

  createPreset: (
    groupId: string,
    input: {
      name: string;
      splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
      config: {
        participants: Array<{ userId: string; share?: number }>;
        paidByUserId?: string;
      };
    },
  ) => request<any>("POST", `/groups/${groupId}/split-presets`, input),

  deletePreset: (presetId: string) =>
    request<void>("DELETE", `/split-presets/${presetId}`),

  // ============ OCR · SCAN DE TICKETS (M14) ============

  /**
   * Scan une image de ticket. Retourne le marchand, le montant, la
   * devise, la date et la catégorie devinée par l'IA.
   * On utilise FormData (multipart) au lieu de JSON car on uploade un fichier.
   */
  scanReceipt: async (file: File, groupId?: string, receiptHash?: string) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    // V42 — hash SHA-256 du fichier optimisé pour permettre le check
    // anti-doublon côté backend (deux factures identiques même hash).
    if (receiptHash) formData.append("hash", receiptHash);

    // Sprint AB · si on scanne dans le contexte d'un groupe payant, on
    // passe le groupId pour permettre au backend de fallback sur le plan
    // de l'admin du groupe quand notre quota perso est épuisé.
    const url = groupId
      ? `${getApiUrl()}/receipts/scan?groupId=${encodeURIComponent(groupId)}`
      : `${getApiUrl()}/receipts/scan`;

    let r: Response;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          // PAS de content-type ici — le navigateur le génère avec
          // le boundary multipart automatiquement
        },
        body: formData,
      });
    } catch {
      throw new ApiError(
        0,
        "network_error",
        "Le serveur OCR ne répond pas 📡",
        {
          severity: "warning",
          tip: "Vérifie ta connexion et réessaie. Si le problème persiste, le service OCR est peut-être en maintenance.",
        },
      );
    }
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({ message: r.statusText }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
      );
    }
    return (await r.json()) as {
      merchant: string | null;
      amount: string | null;
      currency: string;
      date: string | null;
      category: string | null;
      confidence: number;
      rawText: string;
      /** Items détectés (mode split par item — voir feature ITEMIZED) */
      items: Array<{
        description: string;
        quantity: number;
        unitPrice: string;
        totalPrice: string;
      }>;
      /** V41.4 — Provider qui a effectué le scan, exposé pour UX premium
       *  ("Analysé par Mindee OCR / OpenAI Vision / Tesseract"). */
      provider?: "mindee" | "openai_vision" | "tesseract";
      /** V42 — Si le backend a détecté un doublon potentiel sur (hash | merchant+amount+date+group),
       *  il retourne la dépense existante pour qu'on affiche un warning UX. */
      potentialDuplicateOf?: {
        expenseId: string;
        description: string;
        amount: string;
        date: string;
      } | null;
      /** V42 — Hash SHA-256 du fichier optimisé, renvoyé pour stockage côté
       *  dépense créée (permet l'anti-doublon ex post sur les futures factures). */
      receiptHash?: string;
    };
  },

  // ============ PASSKEYS / WebAuthn (§7.5) ============

  /**
   * Démarre l'enrôlement d'un passkey. Retourne les options à passer
   * à `startRegistration()` du @simplewebauthn/browser.
   */
  passkeyRegisterOptions: (deviceName?: string) =>
    request<any>("POST", "/auth/passkey/register-options", {
      deviceName,
    }),

  /** Termine l'enrôlement après que le browser a généré la réponse. */
  passkeyRegisterFinish: (response: unknown, deviceName?: string) =>
    request<{ ok: true; passkey: { id: string; deviceName: string } }>(
      "POST",
      "/auth/passkey/register-finish",
      { response, deviceName },
    ),

  /**
   * Démarre une connexion par passkey. Si `contactValue` est fourni,
   * pré-fill la liste des credentialIds autorisés. Sinon, mode
   * "discoverable credentials" — le browser propose les passkeys
   * que le user a stocké pour ce site.
   */
  passkeyLoginOptions: (contactValue?: string) =>
    request<any>("POST", "/auth/passkey/login-options", {
      contactValue,
    }),

  /** Termine la connexion par passkey. Retourne le JWT. */
  passkeyLoginFinish: (response: unknown, device?: string) =>
    request<{
      token: string;
      expiresAt: string;
      userId: string;
      passkeyId: string;
    }>("POST", "/auth/passkey/login-finish", { response, device }),

  /** Liste les passkeys de l'utilisateur connecté. */
  listMyPasskeys: () =>
    request<{
      items: Array<{
        id: string;
        deviceName: string;
        createdAt: string;
        lastUsedAt: string | null;
        transports: string[] | undefined;
      }>;
    }>("GET", "/me/passkeys"),

  renameMyPasskey: (id: string, deviceName: string) =>
    request<{ ok: true }>("PATCH", `/me/passkeys/${id}`, {
      deviceName,
    }),

  deleteMyPasskey: (id: string) =>
    request<void>("DELETE", `/me/passkeys/${id}`),

  /**
   * AI parsing — texte libre en langage naturel → dépense structurée.
   * Spec §3.8 : « ajoute 25 € resto avec Karim et Linda » →
   * { description, amount, currency, participantsHints, category }
   */
  // ============ NPS (§9.3) ============

  npsShouldShow: () =>
    request<{
      shouldShow: boolean;
      reasons: { accountAgeOk: boolean; lastRespOk: boolean; usageOk: boolean };
    }>("GET", "/nps/should-show"),

  npsSubmit: (score: number, comment?: string) =>
    request<{ id: string; score: number; thankYou: string }>(
      "POST",
      "/nps",
      { score, comment, source: "in_app" },
    ),

  parseExpenseAi: (text: string, groupId?: string) =>
    request<{
      description: string;
      amount: number | null;
      currency: string | null;
      participantsHints: string[];
      category: string | null;
      confidence: number;
      source: "llm" | "heuristic";
      // Sprint AC · enrichis si groupId fourni
      paidByUserId?: string | null;
      participantIds?: string[];
      splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED" | null;
      shares?: Record<string, number>;
    }>("POST", "/ai/parse-expense", { text, groupId }),

  /**
   * V56 · Génère un message de relance personnalisé via OpenAI GPT-4o-mini.
   * Le message est dans la langue `locale` et le ton choisi (sympa/ferme/humour/pro).
   */
  generateReminderMessage: (input: {
    debtorName: string;
    debtorUserId?: string;
    amount: string;
    currency: string;
    tone: "sympa" | "ferme" | "humour" | "pro";
    locale: string;
    groupNames?: string[];
  }) =>
    request<{ message: string }>("POST", "/ai/reminder-message", input),

  /**
   * Sprint AC · Voice → Expense en un seul appel.
   * Pipeline : audio (multipart) → Whisper (transcription) → parseExpenseSmart
   *            (LLM ou heuristique) → JSON structuré pour pré-remplir le form.
   *
   * Usage : pour iOS/Safari où l'API Web Speech navigateur ne marche pas, ou
   * pour bénéficier de la précision Whisper sur tous les devices.
   *
   * @param blob Audio enregistré côté navigateur (MediaRecorder)
   * @param language Code ISO 2 lettres optionnel (boost précision Whisper)
   */
  voiceToExpense: async (
    blob: Blob,
    options?: { language?: string; groupId?: string },
  ) => {
    const token = getToken();
    const formData = new FormData();
    // V70.1 — Filename + extension calés sur le mimeType réel du Blob.
    // Whisper (OpenAI API) se sert de l'extension pour identifier le
    // codec — un .webm sur du AAC casserait la transcription. Le wrapper
    // voice-recorder.ts normalise déjà audio/aac → audio/m4a, donc ici
    // on dérive simplement l'extension de blob.type.
    const ext = audioExtensionFromMime(blob.type);
    formData.append("file", blob, `voice.${ext}`);
    if (options?.language) formData.append("language", options.language);

    // Sprint AC · groupId via query string (multipart-friendly)
    const url = options?.groupId
      ? `${getApiUrl()}/ai/voice-to-expense?groupId=${encodeURIComponent(options.groupId)}`
      : `${getApiUrl()}/ai/voice-to-expense`;
    const r = await fetch(url, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({ message: r.statusText }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
      );
    }
    return (await r.json()) as {
      transcript: string;
      language: string | null;
      duration: number | null;
      parsed: {
        description: string;
        amount: number | null;
        currency: string | null;
        participantsHints: string[];
        category: string | null;
        confidence: number;
        source: "llm" | "heuristic";
        paidByUserId?: string | null;
        participantIds?: string[];
        splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED" | null;
        shares?: Record<string, number>;
      };
    };
  },

  /**
   * Sprint AC · Indique si Whisper API est configuré côté serveur.
   * Le composant <VoiceInput> utilise ça pour décider entre Web Speech
   * navigateur (gratuit, instantané, mais pas iOS) et Whisper (universel).
   */
  voiceAvailability: () =>
    request<{ available: boolean }>("GET", "/voice/availability"),

  /**
   * Suggestion de partage IA pour une nouvelle dépense (spec §3.7).
   * Apprend des patterns du groupe : mode + participants + payeur le
   * plus probable selon l'historique des 50 dernières dépenses.
   */
  /**
   * Détection d'anomalies sur une dépense (§3.8) : montant inhabituel,
   * doublon potentiel, retard récurrent. Retourne une liste de signalements
   * que l'UI peut afficher en banner sur la dépense.
   */
  expenseAnomalies: (expenseId: string) =>
    request<{
      anomalies: Array<{
        kind: string;
        severity: "info" | "warning" | "alert";
        message: string;
      }>;
    }>("GET", `/expenses/${expenseId}/anomalies`),

  suggestSplitAi: (groupId: string, category?: string) => {
    const qs = category
      ? `?category=${encodeURIComponent(category)}`
      : "";
    return request<{
      suggestion: {
        category: string | null;
        splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
        participantUserIds: string[];
        paidByUserId: string | null;
        confidence: number;
        basedOnCount: number;
        reason: string;
      } | null;
    }>("GET", `/groups/${groupId}/suggestions/split${qs}`);
  },

  // ============ RÈGLES DE PARTAGE PAR CATÉGORIE (§3.7) ============

  listCategoryRules: (groupId: string) =>
    request<
      Array<{
        id: string;
        category: string;
        defaultSplitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
        defaultParticipantUserIds: string[];
        defaultPaidByUserId: string | null;
        updatedAt: string;
      }>
    >("GET", `/groups/${groupId}/category-rules`),

  upsertCategoryRule: (
    groupId: string,
    category: string,
    rule: {
      defaultSplitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
      defaultParticipantUserIds: string[];
      defaultPaidByUserId?: string | null;
    },
  ) =>
    request<{ id: string; category: string }>(
      "PUT",
      `/groups/${groupId}/category-rules/${encodeURIComponent(category)}`,
      rule,
    ),

  deleteCategoryRule: (groupId: string, category: string) =>
    request<void>(
      "DELETE",
      `/groups/${groupId}/category-rules/${encodeURIComponent(category)}`,
    ),

  // ============ CHARTE GROUPE (§6.8) ============

  getGroupTheme: (groupId: string) =>
    request<{
      theme: {
        primaryColor: string;
        accentColor: string;
        logoUrl: string | null;
        preferredMode: "light" | "dark" | "system" | null;
        updatedAt: string;
      } | null;
    }>("GET", `/groups/${groupId}/theme`),

  setGroupTheme: (
    groupId: string,
    theme: {
      primaryColor: string;
      accentColor: string;
      logoUrl?: string | null;
      preferredMode?: "light" | "dark" | "system" | null;
    },
  ) =>
    request<{
      theme: {
        primaryColor: string;
        accentColor: string;
        logoUrl: string | null;
        preferredMode: "light" | "dark" | "system" | null;
        updatedAt: string;
      };
    }>("PUT", `/groups/${groupId}/theme`, theme),

  resetGroupTheme: (groupId: string) =>
    request<void>("DELETE", `/groups/${groupId}/theme`),

  // ============ FX rates (admin §6.5) ============

  adminListFxRates: () =>
    request<
      Array<{
        code: string;
        rateToEur: string;
        source: string;
        fetchedAt: string;
      }>
    >("GET", "/admin/fx-rates"),

  adminOverrideFxRate: (code: string, rateToEur: number, note?: string) =>
    request<{
      code: string;
      rateToEur: string;
      source: string;
      fetchedAt: string;
    }>("PATCH", `/admin/fx-rates/${code}`, { rateToEur, note }),

  adminClearFxOverride: (code: string) =>
    request<{ code: string; source: string }>(
      "DELETE",
      `/admin/fx-rates/${code}/override`,
    ),

  adminFxRateHistory: (code: string, limit = 50) =>
    request<
      Array<{
        id: string;
        previousRate: string;
        newRate: string;
        source: string;
        actorId: string | null;
        actorName: string | null;
        note: string | null;
        changedAt: string;
      }>
    >("GET", `/admin/fx-rates/${code}/history?limit=${limit}`),

  // ============ ADMIN (D) ============

  adminStats: () => request<any>("GET", "/admin/stats"),

  adminTimeseries: (days = 14) =>
    request<{
      points: Array<{
        date: string;
        signups: number;
        expenses: number;
        volume: number;
        groups: number;
      }>;
    }>("GET", `/admin/timeseries?days=${days}`),

  adminKpis: () =>
    request<{
      mrrCents: number;
      arpuCents: number;
      payingUsers: number;
      totalUsers: number;
      paidConversion: number;
      churnRate30d: number;
      arrCents: number;
      mrrByPlan: Record<string, number>;
    }>("GET", "/admin/kpis"),

  adminCohorts: (weeks = 8) =>
    request<{
      rows: Array<{
        cohortWeek: string;
        size: number;
        retention: number[];
      }>;
    }>("GET", `/admin/cohorts?weeks=${weeks}`),

  adminFunnel: (days?: number) =>
    request<{
      steps: Array<{
        key: string;
        label: string;
        count: number;
        conversionFromPrev: number;
        conversionFromTop: number;
      }>;
      scope: string;
    }>(
      "GET",
      days ? `/admin/funnel?days=${days}` : "/admin/funnel",
    ),

  adminListUsers: (query?: string, limit = 50, offset = 0) =>
    request<{
      items: any[];
      total: number;
      limit: number;
      offset: number;
    }>(
      "GET",
      `/admin/users?${new URLSearchParams({
        ...(query && { query }),
        limit: String(limit),
        offset: String(offset),
      }).toString()}`,
    ),

  adminGetUser: (id: string) =>
    request<any>("GET", `/admin/users/${id}`),

  adminSuspendUser: (id: string) =>
    request<{ suspended: boolean }>(
      "POST",
      `/admin/users/${id}/suspend`,
    ),

  adminUnsuspendUser: (id: string) =>
    request<{ suspended: boolean }>(
      "POST",
      `/admin/users/${id}/unsuspend`,
    ),

  /**
   * V95.C — Crée un user shadow (sans mot de passe, non vérifié) depuis
   * la console admin. Retourne le user + un message d'invitation prêt à
   * envoyer + URLs deeplink (WhatsApp / SMS / mailto).
   */
  adminCreateUser: (input: {
    contactType: "EMAIL" | "PHONE";
    contactValue: string;
    displayName?: string;
  }) =>
    request<{
      user: {
        id: string;
        displayName: string;
        planCode: string;
        createdAt: string;
        contacts: Array<{ type: string; value: string; isPrimary: boolean }>;
      };
      inviteMessage: string;
      inviteUrl: string;
      whatsappShareUrl: string;
      smsShareUrl: string | null;
      mailtoUrl: string | null;
    }>("POST", "/admin/users", input),

  /**
   * V95.C — Envoie l'invitation au user via Email ou SMS (serveur).
   * Le canal WhatsApp est géré côté client via `whatsappShareUrl`.
   */
  adminSendInvite: (id: string, input: { channel: "EMAIL" | "SMS"; message?: string }) =>
    request<{ ok: boolean; channel: "EMAIL" | "SMS"; to: string; error?: string }>(
      "POST",
      `/admin/users/${id}/send-invite`,
      input,
    ),

  adminListGroups: (limit = 50, offset = 0) =>
    request<{
      items: any[];
      total: number;
      limit: number;
      offset: number;
    }>(
      "GET",
      `/admin/groups?limit=${limit}&offset=${offset}`,
    ),

  /**
   * V95.B — Par défaut, exclut les users de test (E2E + seed fixture).
   * Passer `includeTests: true` pour les inclure (debug uniquement).
   */
  adminActivity: (params?: { includeTests?: boolean }) =>
    request<
      Array<{
        kind: "user_signup" | "expense" | "swap";
        at: string;
        label: string;
        id: string;
      }>
    >(
      "GET",
      `/admin/activity${params?.includeTests ? "?includeTests=1" : ""}`,
    ),

  /**
   * Audit log global — toutes les ActivityLog tous groupes confondus.
   * Spec §3.6 / §6.10 / §9.1 (chaîne hash immuable).
   */
  adminAuditLog: (opts?: {
    limit?: number;
    offset?: number;
    groupId?: string;
    kind?: string;
  }) =>
    request<{
      items: Array<{
        id: string;
        kind: string;
        groupId: string;
        groupName: string;
        actorId: string | null;
        actorName: string | null;
        payload: any;
        createdAt: string;
        hasHash: boolean;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(
      "GET",
      `/admin/audit-log?${new URLSearchParams({
        ...(opts?.limit && { limit: String(opts.limit) }),
        ...(opts?.offset && { offset: String(opts.offset) }),
        ...(opts?.groupId && { groupId: opts.groupId }),
        ...(opts?.kind && { kind: opts.kind }),
      }).toString()}`,
    ),

  // ============ CMS Traductions (spec §6.6) ============

  adminListTranslations: (opts?: { locale?: string; search?: string }) =>
    request<
      Array<{
        key: string;
        locale: string;
        value: string;
        context: string | null;
        updatedAt: string;
      }>
    >(
      "GET",
      `/admin/translations?${new URLSearchParams({
        ...(opts?.locale && { locale: opts.locale }),
        ...(opts?.search && { search: opts.search }),
      }).toString()}`,
    ),

  adminUpsertTranslation: (
    key: string,
    locale: string,
    body: { value: string; context?: string },
  ) =>
    request<{
      key: string;
      locale: string;
      value: string;
      context: string | null;
      updatedAt: string;
    }>(
      "PUT",
      `/admin/translations/${encodeURIComponent(key)}/${encodeURIComponent(locale)}`,
      body,
    ),

  adminDeleteTranslation: (key: string, locale: string) =>
    request<void>(
      "DELETE",
      `/admin/translations/${encodeURIComponent(key)}/${encodeURIComponent(locale)}`,
    ),

  /** % de complétude par langue (toutes les keys distincts en base). */
  adminTranslationsCoverage: () =>
    request<{
      totalKeys: number;
      locales: Array<{
        code: string;
        name: string;
        flag: string;
        isActive: boolean;
        present: number;
        missing: number;
        percent: number;
      }>;
    }>("GET", "/admin/translations/coverage"),

  /**
   * Auto-traduction IA (spec §6.6) — pré-remplit toutes les clés manquantes
   * d'une locale via GPT-4o-mini. Les traductions sont taggées
   * `context: "ia_draft"` pour qu'un relecteur natif les valide.
   */
  adminAutoTranslate: (
    fromLocale: string,
    toLocale: string,
    keys?: string[],
  ) =>
    request<{
      translated: number;
      skipped: number;
      errors: Array<{ key: string; message: string }>;
    }>("POST", "/admin/translations/auto-translate", {
      fromLocale,
      toLocale,
      keys,
    }),

  // ============ Locales (spec §6.6) ============

  adminListLocales: () =>
    request<
      Array<{
        code: string;
        name: string;
        flag: string;
        isActive: boolean;
        direction: string;
        displayOrder: number;
      }>
    >("GET", "/admin/locales"),

  adminUpdateLocale: (
    code: string,
    body: {
      isActive?: boolean;
      displayOrder?: number;
      name?: string;
      flag?: string;
      direction?: "ltr" | "rtl";
    },
  ) =>
    request<{
      code: string;
      name: string;
      flag: string;
      isActive: boolean;
      direction: string;
      displayOrder: number;
    }>("PATCH", `/admin/locales/${encodeURIComponent(code)}`, body),

  /** Crée une nouvelle langue dans le catalogue admin. */
  adminCreateLocale: (body: {
    code: string;
    name: string;
    flag: string;
    direction?: "ltr" | "rtl";
    displayOrder?: number;
  }) =>
    request<{
      code: string;
      name: string;
      flag: string;
      isActive: boolean;
      direction: string;
      displayOrder: number;
    }>("POST", "/admin/locales", body),

  /** Supprime une langue (et ses traductions) — sauf "fr". */
  adminDeleteLocale: (code: string) =>
    request<void>("DELETE", `/admin/locales/${encodeURIComponent(code)}`),

  // ============ Stats utilisateur (spec §3.11) ============

  getMyStats: (range: 6 | 12 | 24 = 6) =>
    request<{
      currency: string;
      rangeMonths: 6 | 12 | 24;
      totalSpent: number;
      totalSettled: number;
      expenseCount: number;
      groupCount: number;
      myNet: number;
      timeline: Array<{
        period: string;
        totalSpent: number;
        myNet: number;
        expenseCount: number;
      }>;
      topCategories: Array<{
        category: string;
        totalAmount: number;
        expenseCount: number;
        percent: number;
      }>;
      topPayers: Array<{
        userId: string;
        displayName: string;
        totalPaid: number;
        totalOwed: number;
        net: number;
        expenseCount: number;
      }>;
    }>("GET", `/me/stats?range=${range}`),

  /**
   * Change le forfait de l'utilisateur courant. MVP : appel direct sans
   * paiement (Stripe arrivera plus tard). Le serveur invalide tout cache.
   */
  changeMyPlan: async (planCode: string) => {
    const r = await request<{
      user: { id: string; displayName: string; planCode: string };
      plan: { code: string; name: string };
    }>("POST", "/auth/me/plan", { planCode });
    invalidateMeCache();
    return r;
  },

  /**
   * Endpoint public — liste des forfaits tarifaires actifs.
   *
   * Avec pricing régionalisé PPA (spec §6.3) : on peut passer un code pays
   * pour obtenir les prix dans la devise/région du visiteur. Si on ne passe
   * rien, le serveur tente de résoudre via le header Cloudflare CF-IPCountry,
   * sinon il renvoie EUROPE_NA (prix de base EUR).
   *
   * Le front peut détecter le pays côté client (Intl.DateTimeFormat,
   * navigator.language) avant d'appeler, ou laisser le serveur décider.
   */
  listPlans: (country?: string) => {
    const qs = country ? `?country=${encodeURIComponent(country)}` : "";
    // V71 — TTL réduit à 30 s (auparavant 5 min). Compromis : assez court
    // pour que l'admin voie son changement sur le portail dans l'onglet
    // user sans hard-reload, assez long pour éviter un fetch à chaque
    // navigation rapide. Pour l'invalidation immédiate (même onglet),
    // adminUpdatePlan / adminCreatePlan / adminDeletePlan appellent
    // explicitement invalidatePlansCache().
    return memoized(`/plans${qs}`, 30_000, () =>
      request<{
        regionCode: string;
        regionName: string;
        regionCurrency: string;
        detectedCountry: string | null;
        plans: Array<{
          code: string;
          name: string;
          priceCents: number;
          priceCentsYearly: number | null;
          currency: string;
          isRegionalPrice: boolean;
          description: string | null;
          limits: Record<string, any>;
          displayOrder: number;
          isActive: boolean;
        }>;
      }>("GET", `/plans${qs}`),
    );
  },

  /**
   * V47 · Pack IA Booster — état des packs actifs du user.
   */
  listBoosters: () =>
    request<{
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
    }>("GET", "/me/boosters"),

  /** V47 · Crée un PaymentIntent Stripe pour acheter le Pack IA Booster.
   *  Utile pour intégration future avec Stripe Elements custom. */
  createBoosterCheckoutIntent: () =>
    request<{
      clientSecret: string;
      amount: number;
      currency: string;
      mock?: boolean;
    }>("POST", "/me/boosters/checkout-intent", {}),

  /** V49 · Crée une Stripe Checkout Session hostée pour acheter le Pack
   *  IA Booster. Le frontend redirige avec `window.location.href = url`.
   *  Plus simple que Elements et pas de dépendance Stripe.js. */
  createBoosterCheckoutSession: () =>
    request<{
      url: string;
      sessionId: string;
      mock?: boolean;
    }>("POST", "/me/boosters/checkout-session", {}),

  /** V47 · Confirme l'achat après succès Stripe (ou mock dev). */
  confirmBoosterPurchase: (stripePaymentIntentId: string, amountCents?: number) =>
    request<{
      ok: true;
      pack: { id: string; scansAdded: number; expiresAt: string };
    }>("POST", "/me/boosters/confirm-purchase", {
      stripePaymentIntentId,
      amountCents,
    }),

  /** V47 · État de consommation Whisper voix du user. */
  getVoiceUsage: () =>
    request<{ used: number; max: number; resetsAt: string }>(
      "GET",
      "/me/voice-usage",
    ),

  /** Endpoint public — liste des langues activées (pour sélecteur front). */
  listLocales: () =>
    // Cache 30 min — admin active/désactive rarement les langues
    memoized("/locales", 30 * 60_000, () =>
      request<
        Array<{
          code: string;
          name: string;
          flag: string;
          direction: string;
        }>
      >("GET", "/locales"),
    ),

  // ============ Codes promo & parrainage (spec §6.9) ============

  getMyReferralCode: () =>
    request<{ code: string; totalReferred: number; totalRedeemed: number }>(
      "GET",
      "/me/referral-code",
    ),

  redeemPromoCode: (code: string) =>
    request<{
      ok: true;
      code: string;
      type: "DISCOUNT" | "REFERRAL";
      appliedValue: string;
      appliedKind: "PERCENT" | "FIXED";
      message: string;
    }>("POST", "/me/redeem-code", { code }),

  listMyRedemptions: () =>
    request<
      Array<{
        id: string;
        code: string;
        type: string;
        description: string | null;
        appliedValue: string;
        appliedKind: string;
        redeemedAt: string;
      }>
    >("GET", "/me/redemptions"),

  // ============ Admin promo codes (spec §6.9) ============

  adminListPromoCodes: () =>
    request<
      Array<{
        code: string;
        type: string;
        discountValue: string;
        discountKind: string;
        description: string | null;
        maxUses: number | null;
        uses: number;
        expiresAt: string | null;
        isActive: boolean;
        ownerUserId: string | null;
        createdAt: string;
      }>
    >("GET", "/admin/promo-codes"),

  adminCreatePromoCode: (body: {
    code: string;
    discountValue: number;
    discountKind: "PERCENT" | "FIXED";
    description?: string;
    maxUses?: number;
    expiresInDays?: number;
  }) => request<any>("POST", "/admin/promo-codes", body),

  adminUpdatePromoCode: (
    code: string,
    body: { isActive?: boolean; description?: string; maxUses?: number | null },
  ) =>
    request<any>(
      "PATCH",
      `/admin/promo-codes/${encodeURIComponent(code)}`,
      body,
    ),

  adminDeletePromoCode: (code: string) =>
    request<void>(
      "DELETE",
      `/admin/promo-codes/${encodeURIComponent(code)}`,
    ),

  // ============ SIM swap detection (spec §7.5) ============

  listMySimSwapEvents: () =>
    request<
      Array<{
        id: string;
        riskScore: number;
        signals: any;
        contactValueAttempted: string | null;
        contactTypeAttempted: string | null;
        country: string;
        userAgent: string | null;
        status: string;
        verifiedAt: string | null;
        createdAt: string;
      }>
    >("GET", "/me/sim-swap-events"),

  verifySimSwapEvent: (id: string) =>
    request<{ id: string; status: string; verifiedAt: string | null }>(
      "POST",
      `/me/sim-swap-events/${id}/verify`,
    ),

  adminListSimSwapEvents: (status?: string) =>
    request<
      Array<{
        id: string;
        userId: string;
        userName: string;
        riskScore: number;
        signals: any;
        contactValueAttempted: string | null;
        contactTypeAttempted: string | null;
        country: string;
        userAgent: string | null;
        status: string;
        verifiedAt: string | null;
        resolvedAt: string | null;
        resolutionNote: string | null;
        createdAt: string;
      }>
    >(
      "GET",
      `/admin/sim-swap-events${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),

  adminResolveSimSwapEvent: (
    id: string,
    body: { note?: string; action?: "resolve" | "dismiss" },
  ) =>
    request<{ id: string; status: string }>(
      "POST",
      `/admin/sim-swap-events/${id}/resolve`,
      body,
    ),

  // ============ Moyens de paiement (spec §9.1) ============

  paymentMethodsConfig: () =>
    request<{ enabled: boolean; supportedTypes: string[] }>(
      "GET",
      "/me/payment-methods/config",
    ),

  listMyPaymentMethods: () =>
    request<
      Array<{
        id: string;
        type: string;
        typeLabel: string;
        typeEmoji: string;
        label: string;
        last4: string;
        defaultCurrency: string | null;
        lastUsedAt: string | null;
        createdAt: string;
      }>
    >("GET", "/me/payment-methods"),

  addPaymentMethod: (body: {
    type?: string;
    value: string;
    label: string;
    defaultCurrency?: string;
  }) =>
    request<{
      id: string;
      type: string;
      typeLabel: string;
      typeEmoji: string;
      label: string;
      last4: string;
      defaultCurrency: string | null;
      lastUsedAt: string | null;
      createdAt: string;
    }>("POST", "/me/payment-methods", body),

  /** Déchiffrement à la demande — la valeur en clair n'est en mémoire que ponctuellement. */
  revealPaymentMethod: (id: string) =>
    request<{
      id: string;
      type: string;
      label: string;
      value: string;
    }>("POST", `/me/payment-methods/${encodeURIComponent(id)}/reveal`),

  renamePaymentMethod: (id: string, label: string) =>
    request<{ ok: true }>(
      "PATCH",
      `/me/payment-methods/${encodeURIComponent(id)}`,
      { label },
    ),

  deletePaymentMethod: (id: string) =>
    request<void>(
      "DELETE",
      `/me/payment-methods/${encodeURIComponent(id)}`,
    ),

  /**
   * V137 — Scanne une image de RIB ou screenshot de coordonnées bancaires
   * via OpenAI Vision. L'image est jetée après extraction (jamais persistée).
   * Retourne IBAN/BIC/titulaire/banque/devise + un suggestedLabel pour le
   * formulaire d'ajout PaymentMethod.
   */
  ocrPaymentMethodRib: (body: {
    imageBase64: string;
    mimeType:
      | "image/jpeg"
      | "image/jpg"
      | "image/png"
      | "image/webp"
      | "image/heic"
      | "image/heif";
  }) =>
    request<{
      type: string;
      iban: string | null;
      bic: string | null;
      holder: string | null;
      bank: string | null;
      phone: string | null;
      email: string | null;
      currency: string | null;
      confidence: number;
      ibanValid: boolean | null;
      suggestedLabel: string | null;
    }>("POST", "/me/payment-methods/ocr-rib", body),

  // ============ CMS Pages (spec §6.7) ============

  getPublishedCmsPage: (slug: string) =>
    request<{
      slug: string;
      title: string;
      blocks: any[];
      publishedAt: string | null;
    }>("GET", `/cms/${encodeURIComponent(slug)}`),

  adminListCmsPages: () =>
    request<
      Array<{
        id: string;
        slug: string;
        title: string;
        isActive: boolean;
        publishedAt: string | null;
        hasUnpublishedChanges: boolean;
        createdAt: string;
        updatedAt: string;
      }>
    >("GET", "/admin/cms-pages"),

  adminCreateCmsPage: (body: { slug: string; title: string }) =>
    request<{ id: string; slug: string; title: string }>(
      "POST",
      "/admin/cms-pages",
      body,
    ),

  adminGetCmsPage: (id: string) =>
    request<{
      id: string;
      slug: string;
      title: string;
      draftBlocks: any[];
      publishedBlocks: any[];
      publishedAt: string | null;
      isActive: boolean;
      hasUnpublishedChanges: boolean;
    }>("GET", `/admin/cms-pages/${encodeURIComponent(id)}`),

  adminSaveCmsDraft: (
    id: string,
    body: { blocks: any[]; title?: string },
  ) =>
    request<{ id: string; updatedAt: string }>(
      "PATCH",
      `/admin/cms-pages/${encodeURIComponent(id)}`,
      body,
    ),

  adminPublishCmsPage: (id: string, note?: string) =>
    request<{
      id: string;
      publishedAt: string;
      versionNumber: number;
    }>(
      "POST",
      `/admin/cms-pages/${encodeURIComponent(id)}/publish`,
      { note },
    ),

  adminToggleCmsPage: (id: string, isActive: boolean) =>
    request<{ ok: true }>(
      "POST",
      `/admin/cms-pages/${encodeURIComponent(id)}/active`,
      { isActive },
    ),

  adminListCmsVersions: (id: string) =>
    request<
      Array<{
        id: string;
        versionNumber: number;
        note: string | null;
        publishedAt: string;
      }>
    >("GET", `/admin/cms-pages/${encodeURIComponent(id)}/versions`),

  adminRevertCmsPage: (id: string, versionId: string) =>
    request<{
      id: string;
      restoredVersion: number;
      newVersionNumber: number;
    }>(
      "POST",
      `/admin/cms-pages/${encodeURIComponent(id)}/revert/${encodeURIComponent(versionId)}`,
    ),

  adminDeleteCmsPage: (id: string) =>
    request<void>(
      "DELETE",
      `/admin/cms-pages/${encodeURIComponent(id)}`,
    ),

  /** Vérifie l'intégrité hash-chain de tous les groupes (long, à appeler sur demande). */
  adminVerifyAllAuditChains: () =>
    request<{
      checkedAt: string;
      totalGroups: number;
      validGroups: number;
      brokenGroups: Array<{
        groupId: string;
        groupName: string;
        valid: boolean;
        count: number;
        brokenAt?: number;
      }>;
      results: Array<{
        groupId: string;
        groupName: string;
        valid: boolean;
        count: number;
        brokenAt?: number;
      }>;
    }>("GET", "/admin/audit-log/verify-all"),

  /** Liste les plans tarifaires (spec §6.3 — admin). */
  adminListPlans: () =>
    request<
      Array<{
        code: string;
        name: string;
        priceCents: number;
        priceCentsYearly: number | null;
        description: string | null;
        limits: Record<string, any>;
        displayOrder: number;
        isActive: boolean;
        userCount: number;
        createdAt: string;
        updatedAt: string;
      }>
    >("GET", "/admin/plans"),

  /**
   * Met à jour un plan (admin uniquement). Modifications appliquées en
   * temps réel à tous les utilisateurs sur ce plan.
   */
  adminUpdatePlan: async (
    code: string,
    body: {
      name?: string;
      priceCents?: number;
      priceCentsYearly?: number | null;
      description?: string | null;
      limits?: Record<string, any>;
      isActive?: boolean;
      displayOrder?: number;
    },
  ) => {
    const r = await request<any>("PATCH", `/admin/plans/${code}`, body);
    // V71 — invalidation cache portail (listPlans est mémoizé 5 min).
    // Sans ça, l'admin voit ses changements mais pas le portail user.
    invalidatePlansCache();
    return r;
  },

  /** Crée un nouveau plan tarifaire (admin only, spec §6.3). */
  adminCreatePlan: async (body: {
    code: string;
    name: string;
    priceCents?: number;
    priceCentsYearly?: number | null;
    description?: string;
    limits?: Record<string, any>;
    displayOrder?: number;
  }) => {
    const r = await request<any>("POST", "/admin/plans", body);
    invalidatePlansCache(); // V71
    return r;
  },

  /** Supprime un plan (refus si users encore dessus). */
  adminDeletePlan: async (code: string) => {
    const r = await request<void>("DELETE", `/admin/plans/${code}`);
    invalidatePlansCache(); // V71
    return r;
  },

  /** Change le plan d'un utilisateur. */
  adminChangeUserPlan: (userId: string, planCode: string) =>
    request<{ id: string; displayName: string; planCode: string }>(
      "POST",
      `/admin/users/${userId}/change-plan`,
      { planCode },
    ),

  /**
   * V72 — Rentabilité par client (LIVE).
   * Revenu plan vs coût RÉEL agrégé depuis UsageEvent (1 ligne = 1 appel
   * IA/SMS/email facturable, avec son coût calculé au moment de l'appel).
   */
  adminProfitability: (params?: {
    sort?: "margin_asc" | "margin_desc" | "revenue_desc" | "cost_desc";
    limit?: number;
    search?: string;
    days?: number;
    /** V95.B — par défaut, exclut users de test. */
    includeTests?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.search) qs.set("search", params.search);
    if (params?.days) qs.set("days", String(params.days));
    if (params?.includeTests) qs.set("includeTests", "1");
    const url = `/admin/profitability${qs.toString() ? "?" + qs.toString() : ""}`;
    type KindAgg = { count: number; costCents: number };
    type KindAggWithSeconds = KindAgg & { seconds?: number };
    return request<{
      period: { start: string; end: string; days: number; label: string };
      summary: {
        totalRevenueCents: number;
        totalCostCents: number;
        totalMarginCents: number;
        totalOcr: number;
        totalVoice: number;
        totalMeetings: number;
        totalLlm: number;
        totalSms: number;
        totalVerify: number;
        totalWhatsapp: number;
        totalEmail: number;
        userCount: number;
        payingUsers: number;
        unprofitableUsers: number;
      };
      rows: Array<{
        userId: string;
        displayName: string;
        primaryContact: { type: string; value: string } | null;
        planCode: string;
        planName: string;
        createdAt: string;
        revenueCents: number;
        ocr: KindAgg;
        voice: KindAggWithSeconds;
        meeting: KindAggWithSeconds;
        llm: KindAgg;
        sms: KindAgg;
        verify: KindAgg;
        whatsapp: KindAgg;
        email: KindAgg;
        costCents: number;
        marginCents: number;
        isUnprofitable: boolean;
      }>;
      truncated: boolean;
      totalRows: number;
    }>("GET", url);
  },

  /** V72 — Série temporelle du coût quotidien (chart timeseries 30j). */
  adminUsageTimeseries: (days = 30) =>
    request<{
      days: number;
      points: Array<{ day: string; costCents: number; count: number }>;
    }>("GET", `/admin/usage/timeseries?days=${days}`),

  /** V72 — Ventilation du coût par (kind, provider) — "où part l'argent". */
  adminUsageBreakdown: (days = 30) =>
    request<{
      period: { start: string; end: string; days: number };
      totalCostCents: number;
      breakdown: Array<{
        kind: string;
        provider: string;
        count: number;
        costCents: number;
        units: number;
      }>;
    }>("GET", `/admin/usage/breakdown?days=${days}`),

  // ============ Exports (spec §3.11 / Premium feature) ============

  /**
   * Télécharge un fichier Excel (.xlsx) côté serveur du groupe — différent
   * du CSV client : 3 feuilles (Résumé, Dépenses avec formule SUM live,
   * Soldes), formats devise/date, freeze panes. Premium-only.
   */
  downloadGroupXlsx: async (groupId: string) => {
    const token = getToken();
    const r = await fetch(
      `${getApiUrl()}/groups/${groupId}/export/xlsx`,
      {
        method: "GET",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    );
    if (!r.ok) {
      const errBody = await r
        .json()
        .catch(() => ({ message: r.statusText, error: "unknown" }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
        errBody.details,
      );
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bmd-group-${groupId}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Télécharge le PDF de reçu fiscal pour une dépense (don) précise.
   * Réservé aux groupes type association (PARISH / CLUB) avec plan
   * COMMUNITY. Conforme Article 200 CGI.
   */
  downloadTaxReceiptPdf: async (expenseId: string) => {
    const token = getToken();
    const r = await fetch(
      `${getApiUrl()}/expenses/${expenseId}/tax-receipt`,
      {
        method: "GET",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    );
    if (!r.ok) {
      const errBody = await r
        .json()
        .catch(() => ({ message: r.statusText, error: "unknown" }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
        errBody.details,
      );
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recu-fiscal-${expenseId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Télécharge un PDF du résumé d'un groupe (Premium-only).
   * Le PDF inclut : entête BMD, soldes par membre, liste des dépenses,
   * total. Pixel-perfect, parfait pour archivage / pièce comptable.
   */
  downloadGroupPdf: async (groupId: string) => {
    const token = getToken();
    const r = await fetch(
      `${getApiUrl()}/groups/${groupId}/export/pdf`,
      {
        method: "GET",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    );
    if (!r.ok) {
      const errBody = await r
        .json()
        .catch(() => ({ message: r.statusText, error: "unknown" }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
        errBody.details,
      );
    }
    const blob = await r.blob();
    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bmd-group-${groupId}-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // ============ Stripe payments (spec §6.3) ============

  /**
   * Démarre une session Checkout Stripe pour upgrader vers un plan.
   * Renvoie l'URL de redirection — le front fait `window.location = url`.
   */
  createCheckoutSession: (input: {
    planCode: string;
    interval?: "month" | "year";
  }) =>
    request<{ url: string; sessionId: string }>(
      "POST",
      "/me/checkout-session",
      input,
    ),

  /**
   * Pour les commerciaux : démarre l'onboarding Stripe Connect (KYC + RIB).
   * Renvoie l'URL Stripe vers laquelle rediriger le user.
   */
  startConnectOnboarding: () =>
    request<{ url: string }>("POST", "/me/connect-onboarding", {}),

  // ============ Affiliate / Referral V2 (spec §6.9) ============

  /** Mon code de parrainage + stats */
  getReferralInfo: () =>
    request<{
      code: string;
      totalReferred: number;
      totalActiveReferred: number;
      totalCreditCents: number;
      nextMilestone: {
        count: number;
        bonusCents: number;
        badge?: string;
      } | null;
    }>("GET", "/me/referral-info"),

  applyReferralCode: (code: string) =>
    request<{
      parentId: string;
      parentType: "REGULAR" | "AFFILIATE";
      discount: { kind: "PERCENT"; value: number; durationMonths: number };
    }>("POST", "/me/apply-referral-code", { code }),

  /** V177.B — Infos parrain actuel (acquis à vie) + avantage obtenu */
  getMyReferrer: () =>
    request<{
      referrer: {
        id: string;
        displayName: string;
        avatar: string | null;
        codeUsed: string | null;
        isAffiliate: boolean;
        parentType: "REGULAR" | "AFFILIATE";
      } | null;
      appliedAt: string | null;
      discount: {
        kind: "PERCENT";
        value: number;
        durationMonths: number;
      } | null;
      remainingDays: number;
      canApply: boolean;
      daysToApply: number;
    }>("GET", "/me/referrer"),

  /** Réseau détaillé du commercial : L1 + commissions récentes */
  getAffiliateNetwork: () =>
    request<{
      network: Array<{
        id: string;
        displayName: string;
        avatar: string | null;
        defaultCurrency: string;
        planCode: string;
        subscriptionStatus: string;
        joinedAt: string;
        subL2Count: number;
        totalPendingCents: number;
        totalPayableCents: number;
        totalPaidCents: number;
        // V177.C — Avantage obtenu par le filleul (estimation centimes EUR)
        discountSavedCents?: number;
        hasPayingPlan?: boolean;
      }>;
      recentCommissions: Array<{
        id: string;
        payer: { id: string; displayName: string; avatar: string | null };
        level: number;
        percent: number;
        sourceCurrency: string;
        sourceAmountCents: number;
        payoutCurrency: string;
        payoutAmountCents: number;
        status: string;
        createdAt: string;
        paidAt: string | null;
      }>;
    }>("GET", "/me/affiliate-network"),

  /** Si je suis commercial : dashboard de mes commissions */
  getAffiliateDashboard: () =>
    request<{
      isAffiliate: boolean;
      affiliateCode: string | null;
      kycStatus: string;
      l1Count: number;
      l2Count: number;
      l3Count: number;
      pendingCents: number;
      payableCents: number;
      paidCents: number;
    }>("GET", "/me/affiliate-dashboard"),

  getReferralRewards: () =>
    request<
      Array<{
        id: string;
        kind: string;
        amountCents: number;
        payoutCurrency: string;
        payoutAmountCents: number;
        status: string;
        description: string | null;
        createdAt: string;
      }>
    >("GET", "/me/referral-rewards"),

  /** État de souscription (ACTIVE / GRACE / WARN / DOWNGRADED / CANCELLED) */
  getSubscriptionInfo: () =>
    request<{
      status: string;
      expiresAt: string | null;
      graceEndsAt: string | null;
      readOnlyAt: string | null;
      daysUntilWarn: number | null;
      daysUntilReadOnly: number | null;
      lockedGroupCount: number;
    }>("GET", "/me/subscription-info"),

  // Admin
  adminGetAffiliateProgram: () =>
    request<any>("GET", "/admin/affiliate-program"),
  adminUpdateAffiliateProgram: (body: any) =>
    request<any>("PATCH", "/admin/affiliate-program", body),
  adminGetDowngradePolicy: () =>
    request<any>("GET", "/admin/downgrade-policy"),
  adminUpdateDowngradePolicy: (body: any) =>
    request<any>("PATCH", "/admin/downgrade-policy", body),
  adminPromoteAffiliate: (userId: string) =>
    request<{ affiliateCode: string }>(
      "POST",
      `/admin/users/${userId}/promote-affiliate`,
      {},
    ),
  adminSetAffiliateKyc: (
    userId: string,
    status: "NONE" | "PENDING" | "VERIFIED" | "REJECTED",
  ) =>
    request<any>("POST", `/admin/users/${userId}/affiliate-kyc`, { status }),

  // ============ Tarifs régionalisés PPA (spec §6.3) ============

  /**
   * Liste les régions tarifaires + leurs prix par plan (matrice complète
   * pour l'admin).
   */
  adminListRegions: () =>
    request<
      Array<{
        code: string;
        name: string;
        defaultCurrency: string;
        countryCodes: string[];
        description: string | null;
        ppaIndex: number;
        displayOrder: number;
        isActive: boolean;
        priceTiers: Array<{
          planCode: string;
          currency: string;
          priceCents: number;
          priceCentsYearly: number | null;
        }>;
      }>
    >("GET", "/admin/regions"),

  adminCreateRegion: (body: {
    code: string;
    name: string;
    defaultCurrency: string;
    countryCodes: string[];
    description?: string;
    ppaIndex?: number;
    displayOrder?: number;
  }) => request<any>("POST", "/admin/regions", body),

  adminUpdateRegion: (
    code: string,
    body: {
      name?: string;
      defaultCurrency?: string;
      countryCodes?: string[];
      description?: string | null;
      ppaIndex?: number;
      displayOrder?: number;
      isActive?: boolean;
    },
  ) => request<any>("PATCH", `/admin/regions/${code}`, body),

  adminDeleteRegion: (code: string) =>
    request<void>("DELETE", `/admin/regions/${code}`),

  /** Définit / met à jour un prix régional (upsert plan × région). */
  adminSetPlanTier: async (body: {
    planCode: string;
    regionCode: string;
    currency: string;
    priceCents: number;
    priceCentsYearly?: number | null;
    stripePriceId?: string | null;
    stripePriceIdYearly?: string | null;
    notes?: string | null;
  }) => {
    const r = await request<any>("PUT", "/admin/plan-tiers", body);
    // Invalide le cache plans côté client : les visiteurs verront les
    // nouveaux tarifs au prochain fetch (pas de besoin de reload).
    invalidateGenericCache();
    return r;
  },

  /** Supprime un tier (le plan tombera sur le prix de base EUR). */
  adminDeletePlanTier: async (planCode: string, regionCode: string) => {
    await request<void>(
      "DELETE",
      `/admin/plan-tiers/${planCode}/${regionCode}`,
    );
    invalidateGenericCache();
  },

  // ============ Rôles admin custom (spec §6.10) ============

  adminListRoles: () =>
    request<
      Array<{
        code: string;
        name: string;
        description: string | null;
        permissions: Record<string, string[]>;
        createdAt: string;
        updatedAt: string;
      }>
    >("GET", "/admin/roles"),

  adminCreateRole: (body: {
    code: string;
    name: string;
    description?: string;
    permissions?: Record<string, string[]>;
  }) => request<any>("POST", "/admin/roles", body),

  adminUpdateRole: (
    code: string,
    body: {
      name?: string;
      description?: string | null;
      permissions?: Record<string, string[]>;
    },
  ) => request<any>("PATCH", `/admin/roles/${code}`, body),

  adminDeleteRole: (code: string) =>
    request<void>("DELETE", `/admin/roles/${code}`),

  adminAssignRole: (userId: string, roleCode: string | null) =>
    request<{
      id: string;
      displayName: string;
      adminRoleCode: string | null;
    }>("POST", `/admin/users/${userId}/admin-role`, { roleCode }),

  // ============ Module Publicités (spec §6.4) ============

  adminGetAdsConfig: () =>
    request<{
      id: string;
      enabled: boolean;
      enabledNetworks: string[];
      allowedCategories: string[];
      blockedCategories: string[];
      maxPerUserPerDay: number;
      interstitialEverySessions: number;
      enabledFormats: string[];
      updatedAt: string;
    }>("GET", "/admin/ads-config"),

  adminUpdateAdsConfig: (body: {
    enabled?: boolean;
    enabledNetworks?: string[];
    allowedCategories?: string[];
    blockedCategories?: string[];
    maxPerUserPerDay?: number;
    interstitialEverySessions?: number;
    enabledFormats?: string[];
  }) => request<any>("PATCH", "/admin/ads-config", body),

  // V23 — Configuration site public (emails de contact, WhatsApp, URL)
  // V200 — Étendu avec flags projectFundsEnabled / vote threshold.
  adminGetSiteConfig: () =>
    request<{
      id: string;
      supportEmail: string;
      privacyEmail: string;
      securityEmail: string;
      whatsappNumber: string | null;
      siteUrl: string;
      projectFundsEnabled: boolean;
      projectFundsVoteThresholdEur: string;
      updatedAt: string;
    }>("GET", "/admin/site-config"),

  adminUpdateSiteConfig: (body: {
    supportEmail?: string;
    privacyEmail?: string;
    securityEmail?: string;
    whatsappNumber?: string;
    siteUrl?: string;
    // V200 — Kill switch + seuil vote module Caisses Projet
    projectFundsEnabled?: boolean;
    projectFundsVoteThresholdEur?: number;
  }) => {
    invalidateGenericCache("/site-config");
    return request<any>("PATCH", "/admin/site-config", body);
  },

  // ============ NOTIFICATIONS ============

  /**
   * Liste les notifications de l'utilisateur connecté.
   *
   * V53.C1 — Mémoize 15s : un user qui ouvre la page notif puis revient
   * 5s plus tard ne re-fetch pas. Invalidé sur mark-read et delete.
   */
  listNotifications: (unreadOnly = false, limit = 50) =>
    memoized(
      `/notifications?${unreadOnly ? "u=1&" : ""}l=${limit}`,
      15_000,
      () =>
        request<
          Array<{
            id: string;
            kind: string;
            title: string;
            body: string | null;
            link: string | null;
            payload: any;
            readAt: string | null;
            createdAt: string;
          }>
        >(
          "GET",
          `/notifications?${unreadOnly ? "unread=1&" : ""}limit=${limit}`,
        ),
    ),

  /**
   * Compte des notifications non-lues (pour le badge).
   *
   * V53.C1 — Mémoize 30s : le badge se rafraîchit via le hook realtime
   * (WebSocket / polling) sur le bell icon, donc 30s d'écart est OK.
   */
  // V175.H — TTL étendu à 60 s (vs 30 s) pour réduire le polling mobile.
  // Le compteur est invalidé explicitement par mark-read / mark-unread / delete,
  // donc on peut se permettre un cache plus long sans rater des updates locales.
  // Le SSE dispatch également un refresh côté composant après réception event.
  unreadNotificationsCount: () =>
    memoized("/notifications/unread-count", 60_000, () =>
      request<{ count: number }>("GET", "/notifications/unread-count"),
    ),

  // V53.C1 — Invalide les caches notifications après mutation pour que la
  // prochaine listNotifications retourne l'état frais (mark read/unread/delete).
  markNotificationRead: async (id: string) => {
    const r = await request<{ updated: number }>(
      "POST",
      `/notifications/${id}/read`,
    );
    invalidateNotificationsCache();
    return r;
  },

  markNotificationUnread: async (id: string) => {
    const r = await request<{ updated: number }>(
      "POST",
      `/notifications/${id}/unread`,
    );
    invalidateNotificationsCache();
    return r;
  },

  markAllNotificationsRead: async () => {
    const r = await request<{ updated: number }>(
      "POST",
      "/notifications/read-all",
    );
    invalidateNotificationsCache();
    return r;
  },

  deleteNotification: async (id: string) => {
    const r = await request<void>("DELETE", `/notifications/${id}`);
    invalidateNotificationsCache();
    return r;
  },

  /**
   * V98 — Détail d'une notification (avec sender, ownership check).
   * Inclut toutes les colonnes V98 : senderUserId, respondedAt,
   * responseKind, responseEmoji, responseText, acknowledgedAt.
   */
  getNotificationDetail: (id: string) =>
    request<{
      id: string;
      userId: string;
      senderUserId: string | null;
      kind: string;
      title: string;
      body: string | null;
      link: string | null;
      payload: any;
      readAt: string | null;
      createdAt: string;
      respondedAt: string | null;
      responseKind: "ACK" | "EMOJI" | "TEXT" | null;
      responseEmoji: string | null;
      responseText: string | null;
      acknowledgedAt: string | null;
      sender: {
        id: string;
        displayName: string;
        avatar: string | null;
      } | null;
    }>("GET", `/notifications/${id}`),

  /**
   * V98 — Le destinataire répond à une notif (ACK / EMOJI / TEXT).
   * Side-effect serveur : une notif retour est envoyée à l'émetteur.
   */
  respondToNotification: async (
    id: string,
    input: { kind: "ACK" | "EMOJI" | "TEXT"; emoji?: string; text?: string },
  ) => {
    const r = await request<{ ok: boolean; alreadyResponded: boolean }>(
      "POST",
      `/notifications/${id}/respond`,
      input,
    );
    invalidateNotificationsCache();
    return r;
  },

  /**
   * V98 — L'émetteur acknowledge la notif retour (« Compris »).
   * Marque acknowledgedAt + readAt sur la notif NOTIF_RESPONSE.
   */
  acknowledgeNotification: async (id: string) => {
    const r = await request<{ ok: boolean }>(
      "POST",
      `/notifications/${id}/acknowledge`,
    );
    invalidateNotificationsCache();
    return r;
  },

  // ============ EXPENSE ATTACHMENTS ============

  /**
   * Liste les pièces jointes d'une dépense (visibles par tous les membres).
   *
   * Sprint AC-2 — `kind` distingue ticket / photo / preuve audio / doc.
   * `transcript` est rempli pour les `AUDIO_PROOF` (transcription Whisper).
   */
  listAttachments: (expenseId: string) =>
    request<
      Array<{
        id: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        uploadedById: string;
        uploadedBy: { id: string; displayName: string };
        createdAt: string;
        kind?: "RECEIPT" | "PHOTO" | "AUDIO_PROOF" | "DOCUMENT";
        transcript?: string | null;
        transcriptLanguage?: string | null;
      }>
    >("GET", `/expenses/${expenseId}/attachments`),

  /**
   * Upload une pièce jointe (multipart). Le navigateur génère le boundary.
   * Permission backend : payeur OU admin uniquement.
   *
   * Sprint AC-2 — `kind` permet d'envoyer une preuve audio de marché
   * ("AUDIO_PROOF"). Auto-déduit côté serveur si non fourni mais on le passe
   * explicitement depuis l'UI quand l'utilisateur enregistre depuis le bouton
   * 🎙️ "Preuve audio" plutôt que depuis l'input fichier classique.
   */
  uploadAttachment: async (
    expenseId: string,
    file: File,
    options?: { kind?: "RECEIPT" | "PHOTO" | "AUDIO_PROOF" | "DOCUMENT" },
  ) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    if (options?.kind) formData.append("kind", options.kind);
    let r: Response;
    try {
      r = await fetch(`${getApiUrl()}/expenses/${expenseId}/attachments`, {
        method: "POST",
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
    } catch {
      throw new ApiError(
        0,
        "network_error",
        "Le fichier n'a pas pu être envoyé 📤",
        {
          severity: "warning",
          tip: "Vérifie ta connexion et la taille du fichier (max 10 Mo).",
        },
      );
    }
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({ message: r.statusText }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
      );
    }
    return (await r.json()) as {
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      uploadedBy: { id: string; displayName: string };
      createdAt: string;
      kind?: "RECEIPT" | "PHOTO" | "AUDIO_PROOF" | "DOCUMENT";
    };
  },

  /**
   * Construit l'URL de téléchargement (à utiliser dans <a href> ou <img src>).
   * Le token est passé en query-string car les <img> ne peuvent pas
   * envoyer de header authorization (alternative : data URL côté client).
   * On utilise plutôt fetch + blob pour les images dans l'UI.
   */
  attachmentDownloadUrl: (attachmentId: string) =>
    `${getApiUrl()}/attachments/${attachmentId}/download`,

  /**
   * Récupère le binaire d'un attachment en blob (pour previews d'image).
   * Authentifié via header (impossible avec <img src> direct).
   */
  fetchAttachmentBlob: async (attachmentId: string) => {
    const token = getToken();
    const r = await fetch(
      `${getApiUrl()}/attachments/${attachmentId}/download`,
      {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      },
    );
    if (!r.ok) {
      throw new ApiError(
        r.status,
        "fetch_failed",
        `Impossible de charger la pièce jointe (${r.status})`,
      );
    }
    return r.blob();
  },

  deleteAttachment: (attachmentId: string) =>
    request<void>("DELETE", `/attachments/${attachmentId}`),

  // ============ FX & devises (spec §4) ============

  listCurrencies: () =>
    // Cache 30 min — la liste change uniquement si admin active/désactive
    memoized("/currencies", 30 * 60_000, () =>
      request<
        Array<{
          code: string;
          name: string;
          symbol: string;
          region: string | null;
          flag: string | null;
          decimals: number;
          isFixedToEur: boolean;
        }>
      >("GET", "/currencies"),
    ),

  /**
   * V23 — Configuration publique du site (emails de contact, WhatsApp).
   * Cache 5 min côté client (le serveur cache 5 min aussi).
   *
   * Si la config admin n'est pas joignable (ex: API offline), on retombe
   * sur des valeurs par défaut hardcodées pour ne PAS casser le site
   * vitrine (FAQ contactNudge etc. continuent d'afficher hello@…).
   */
  getSiteConfig: () =>
    memoized("/site-config", 5 * 60_000, () =>
      request<{
        supportEmail: string;
        privacyEmail: string;
        securityEmail: string;
        whatsappNumber: string;
        siteUrl: string;
      }>("GET", "/site-config"),
    ),

  getFxRates: () =>
    // Cache 60s côté client (le serveur lui-même cache 60s). Combinaison =
    // 1-2 min de fraîcheur effective, suffit largement pour conversions UX.
    memoized("/fx-rates", 60_000, () =>
      request<{
        base: "EUR";
        rates: Record<string, number>;
        fetchedAt: string;
      }>("GET", "/fx-rates"),
    ),

  /**
   * Sprint AB · Récupère l'état de consommation OCR du user (compteur visible).
   * Utilisé pour : (a) le badge dashboard, (b) le compteur dans le formulaire
   * de scan, (c) le déclencheur de trial 14 jours au 4e scan.
   */
  getOcrUsage: () =>
    request<{
      used: number;
      max: number; // -1 = illimité
      resetsAt: string;
      planCode: string;
      hasPaidGroup: boolean;
      trialEligible: boolean;
      trialActive: boolean;
      trialEndsAt: string | null;
    }>("GET", "/me/ocr-usage"),

  /**
   * V169 — État de consommation RDD du user (compteur visible pour push upgrade).
   */
  getDebtsUsage: () =>
    request<{
      used: number;
      max: number; // -1 = illimité ; 0 = bloqué
      resetsAt: string;
      planCode: string;
      signaturesSimpleIncluded: number;
      signaturesAdvancedIncluded: number;
    }>("GET", "/me/debts-usage"),

  /**
   * Sprint AB · Active un essai gratuit 14 jours du plan PREMIUM.
   * One-shot par user (anti-fraude). Disponible seulement si plan FREE et
   * trialUsedAt = null. Le trial expire naturellement après 14 j (lazy revert).
   */
  startPremiumTrial: () =>
    request<{ trialPlanCode: string; trialEndsAt: string }>(
      "POST",
      "/me/start-trial",
      {},
    ),

  convertFx: (from: string, to: string, amount: number) =>
    request<{
      from: string;
      to: string;
      amount: number;
      converted: number;
      formatted: string;
    }>(
      "GET",
      `/fx-convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`,
    ),

  // ============ Web Push (spec §3.12 §8.5) ============

  pushVapidPublicKey: () =>
    request<{ key: string | null; enabled: boolean }>(
      "GET",
      "/push/vapid-public-key",
    ),

  pushSubscribe: (input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }) =>
    request<{ id: string; reused: boolean }>(
      "POST",
      "/push/subscribe",
      input,
    ),

  pushUnsubscribe: (input: { endpoint: string }) =>
    request<{ removed: number }>("DELETE", "/push/subscribe", input),

  pushListSubscriptions: () =>
    request<
      Array<{
        id: string;
        endpointShort: string;
        userAgent: string | null;
        createdAt: string;
        lastSuccessAt: string | null;
      }>
    >("GET", "/push/subscriptions"),

  pushTest: () =>
    request<{
      web: { ok: boolean; delivered: number; pruned: number; errors: number };
      native: { delivered: number; failed: number; skipped: number };
    }>("POST", "/push/test"),

  // V132 — Push natif (Capacitor APNs/FCM)
  pushRegisterNative: (input: {
    platform: "ios" | "android";
    token: string;
    deviceName?: string;
    appVersion?: string;
    capacitorDeviceId?: string;
  }) =>
    request<{ id: string; reused: boolean }>(
      "POST",
      "/push/register-native",
      input,
    ),

  pushUnregisterNative: (input: { token?: string; id?: string }) =>
    request<{ removed: number }>("DELETE", "/push/unregister-native", input),

  pushListNativeDevices: () =>
    request<
      Array<{
        id: string;
        platform: string;
        deviceName: string | null;
        appVersion: string | null;
        createdAt: string;
        lastSeenAt: string;
        lastSuccessAt: string | null;
      }>
    >("GET", "/push/native-devices"),

  // V135 — Méthodes de paiement visibles d'un autre membre (co-groupe).
  // Retourne les valeurs en clair (IBAN complet, numéro Wave, email PayPal…)
  // car co-membre du même groupe = consentement implicite à exposer.
  listVisiblePaymentMethods: (userId: string) =>
    request<
      Array<{
        id: string;
        type: string;
        typeLabel: string;
        typeEmoji: string;
        label: string;
        value: string;
        last4: string;
        defaultCurrency: string | null;
      }>
    >("GET", `/users/${encodeURIComponent(userId)}/payment-methods/visible`),

  // ============ RGPD (spec §9.1 §11) ============

  /** Export complet de mes données au format JSON (portabilité RGPD). */
  gdprExportMe: () => request<unknown>("GET", "/gdpr/export-me"),

  /**
   * Droit à l'oubli — supprime définitivement mon compte.
   * Demande un OTP envoyé sur le contact principal pour confirmation.
   */
  gdprDeleteMeRequest: () =>
    request<{ sent: true; expiresAt: string }>(
      "POST",
      "/gdpr/delete-me/request",
    ),

  gdprDeleteMeConfirm: (code: string) =>
    request<{ deleted: true }>("POST", "/gdpr/delete-me/confirm", { code }),

  // ============ MEETINGS · réunions enregistrées (Sprint AC-2) ============

  /**
   * Etat du quota de réunions pour un groupe — l'UI affiche
   * "il te reste 2/4 réunions ce mois-ci" + le coût de l'addon si dépassé.
   */
  getMeetingUsage: (groupId: string) =>
    request<{
      used: number;
      max: number; // -1 = illimité
      planCode: string;
      addonCents: number;
      willChargeAddon: boolean;
      resetsAt: string;
      // Sprint AC-3 — durées paramétrables (par plan + override régional)
      maxDurationSeconds: number;
      warnAtSeconds: number;
      audioProofMaxSeconds: number;
    }>("GET", `/groups/${groupId}/meetings/usage`),

  /**
   * Liste des réunions d'un groupe (du plus récent au plus ancien).
   */
  listMeetings: (groupId: string) =>
    request<
      Array<{
        id: string;
        title: string;
        occurredAt: string;
        status:
          | "PENDING"
          | "TRANSCRIBING"
          | "EXTRACTING"
          | "REVIEW"
          | "APPLIED"
          | "CANCELLED"
          | "FAILED";
        summary: string | null;
        durationSeconds: number | null;
        addonCents: number;
        createdAt: string;
        appliedAt: string | null;
        createdBy: { id: string; displayName: string };
      }>
    >("GET", `/groups/${groupId}/meetings`),

  /**
   * Upload audio pour démarrer une nouvelle réunion. Retourne immédiatement
   * le MeetingRecord en status PENDING — la transcription tourne en arrière-
   * plan, le frontend pollse `getMeeting()` pour suivre la progression.
   */
  uploadMeeting: async (
    groupId: string,
    audio: Blob,
    options: {
      title: string;
      occurredAt?: string;
      acceptAddon?: boolean;
      filename?: string;
    },
  ) => {
    const token = getToken();
    const formData = new FormData();
    formData.append(
      "file",
      audio,
      options.filename ?? `meeting.${(audio.type.split("/")[1] || "webm").split(";")[0]}`,
    );
    formData.append("title", options.title);
    if (options.occurredAt) formData.append("occurredAt", options.occurredAt);
    if (options.acceptAddon) formData.append("acceptAddon", "true");
    let r: Response;
    try {
      r = await fetch(`${getApiUrl()}/groups/${groupId}/meetings`, {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
    } catch {
      throw new ApiError(
        0,
        "network_error",
        "L'enregistrement n'a pas pu être envoyé 📤",
        {
          severity: "warning",
          tip: "Vérifie ta connexion. Le fichier reste sur ton téléphone, tu peux retenter.",
        },
      );
    }
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({ message: r.statusText }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
        errBody,
      );
    }
    return (await r.json()) as { id: string; status: string };
  },

  /** Détail d'une réunion (transcript + decisions extraites). */
  getMeeting: (meetingId: string) =>
    request<{
      id: string;
      title: string;
      occurredAt: string;
      status:
        | "PENDING"
        | "TRANSCRIBING"
        | "EXTRACTING"
        | "REVIEW"
        | "APPLIED"
        | "CANCELLED"
        | "FAILED";
      summary: string | null;
      durationSeconds: number | null;
      addonCents: number;
      createdAt: string;
      appliedAt: string | null;
      createdBy: { id: string; displayName: string };
      transcript: string | null;
      language: string | null;
      extractedJson: {
        summary: string;
        decisions: any[];
        minutes?: string;
        // V218.H — 5 sections structurées (rétrocompat préservée)
        detailedReport?: string;
        nextSteps?: Array<{
          text: string;
          ownerUserId?: string | null;
          ownerName?: string | null;
          dueHint?: string | null;
        }>;
      } | null;
      // V162 — Compte rendu narratif détaillé (Markdown léger) + traçabilité
      minutes: string | null;
      // V218.H — Champs dédiés pour le compte rendu structuré 5 sections
      detailedReport: string | null;
      nextSteps: Array<{
        text: string;
        ownerUserId?: string | null;
        ownerName?: string | null;
        dueHint?: string | null;
      }>;
      manuallyEditedAt: string | null;
      errorMessage: string | null;
      audioMimeType: string;
      audioSizeBytes: number;
      audioPurged: boolean;
      group: {
        id: string;
        name: string;
        members: Array<{
          userId: string;
          role: string;
          user: { id: string; displayName: string };
        }>;
      };
    }>("GET", `/meetings/${meetingId}`),

  /**
   * V162 — Édite manuellement les outputs IA d'une réunion. Tous les champs
   * optionnels — n'envoie que ce qui change. Bloqué après APPLIED.
   * Retourne le détail à jour.
   *
   * V221 — Étendu pour accepter `title` (titre éditable) et `transcript`
   * (correction manuelle de la transcription verbatim Whisper).
   */
  editMeeting: async (
    meetingId: string,
    patch: {
      // V221 — Titre éditable de la réunion
      title?: string;
      summary?: string;
      minutes?: string;
      // V218.H — Nouveau canal (alias de minutes côté backend)
      detailedReport?: string;
      nextSteps?: Array<{
        text: string;
        ownerUserId?: string | null;
        ownerName?: string | null;
        dueHint?: string | null;
      }>;
      // V221 — Transcription verbatim éditable
      transcript?: string;
      decisions?: any[];
    },
  ) => {
    const r = await request<any>("PATCH", `/meetings/${meetingId}`, patch);
    return r;
  },

  /**
   * V221 — Alias plus explicite de editMeeting. Le wording « update » est plus
   * naturel quand on patch des champs simples (title, summary, etc.) sans
   * toucher aux décisions IA. La signature et le comportement sont identiques.
   */
  updateMeeting: async (
    meetingId: string,
    patch: {
      title?: string;
      summary?: string;
      minutes?: string;
      detailedReport?: string;
      nextSteps?: Array<{
        text: string;
        ownerUserId?: string | null;
        ownerName?: string | null;
        dueHint?: string | null;
      }>;
      transcript?: string;
    },
  ) => {
    return await request<any>("PATCH", `/meetings/${meetingId}`, patch);
  },

  /**
   * V221 — Récupère le fichier audio d'une réunion en tant que Blob URL utilisable
   * directement dans une balise <audio src=…>. On passe par fetch + Bearer
   * pour gérer l'authentification (impossible avec une balise audio classique
   * qui n'envoie pas de headers). Retourne null si l'audio a été purgé.
   *
   * Important : le caller DOIT appeler URL.revokeObjectURL(url) au unmount
   * pour libérer la mémoire.
   */
  getMeetingAudioBlobUrl: async (meetingId: string): Promise<string | null> => {
    const token = getToken();
    let r: Response;
    try {
      r = await fetch(`${getApiUrl()}/meetings/${meetingId}/audio`, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      return null;
    }
    if (r.status === 404) return null;
    if (!r.ok) return null;
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  },

  /**
   * V162 — Exporte le compte rendu en PDF brandé BMD. L'utilisateur choisit
   * les sections à inclure. Retourne directement un Blob (téléchargement).
   */
  exportMeetingPdf: async (
    meetingId: string,
    sections: {
      // V218.H — 5 sections structurées
      summary?: boolean;
      decisions?: boolean;
      nextSteps?: boolean;
      minutes?: boolean;
      transcript?: boolean;
    },
  ): Promise<Blob> => {
    const url = `${getApiUrl()}/meetings/${meetingId}/export-pdf`;
    const token = getToken();
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sections }),
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({ message: r.statusText }));
      throw new ApiError(
        r.status,
        errBody.error ?? "unknown",
        errBody.message ?? `HTTP ${r.status}`,
        errBody,
      );
    }
    return await r.blob();
  },

  /**
   * Applique les décisions validées d'une réunion. L'UI envoie la liste finale
   * (potentiellement éditée). Le serveur crée Expenses / Settlements /
   * TontineContribution correspondantes et passe la réunion à APPLIED.
   */
  applyMeeting: async (
    meetingId: string,
    decisions: any[],
  ) => {
    const r = await request<{
      meetingId: string;
      expensesCreated: number;
      settlementsCreated: number;
      contributionsCreated: number;
      notesCount: number;
    }>("POST", `/meetings/${meetingId}/apply`, { decisions });
    // Invalide les caches affectés par les nouvelles dépenses créées
    invalidateGenericCache("/groups");
    return r;
  },

  /** Annule une réunion (pas applicable si déjà APPLIED). */
  cancelMeeting: (meetingId: string) =>
    request<void>("POST", `/meetings/${meetingId}/cancel`),

  /** Relance le pipeline en cas de FAILED. */
  retryMeeting: (meetingId: string) =>
    request<{ retrying: boolean }>("POST", `/meetings/${meetingId}/retry`),

  /** Purge le fichier audio (RGPD / ménage). */
  purgeMeetingAudio: (meetingId: string) =>
    request<void>("DELETE", `/meetings/${meetingId}/audio`),

  // ============ V164 — COMMERCIAL (Ambassadeur + Commercial agréé) ============

  /** Statut ambassadeur de l'utilisateur courant. */
  getAmbassadorStatus: () =>
    request<{
      isAmbassador: boolean;
      isCommercialAgreed: boolean;
      promotedAt: string | null;
      referralCode: string | null;
      benefits: {
        freePremiumMonthsOnPromo: number;
        ocrCreditsMonthly: number;
        voiceCreditsMonthly: number;
        badgeLabel: string;
        earlyAccessEnabled: boolean;
        quarterlyGiftEnabled: boolean;
      };
    }>("GET", "/ambassador/me/status"),

  /** Liste des filleuls directs (1 niveau, anti-pyramidal). */
  getAmbassadorNetwork: () =>
    request<
      Array<{
        id: string;
        displayName: string;
        avatar: string | null;
        planCode: string;
        isPaid: boolean;
        joinedAt: string;
        hasVerifiedEmail: boolean;
      }>
    >("GET", "/ambassador/me/network"),

  /** Stats agrégées du réseau. */
  getAmbassadorStats: () =>
    request<{
      total: number;
      paid: number;
      free: number;
      conversionRate: number;
      estimatedMonthlyRevenueCents: number;
    }>("GET", "/ambassador/me/stats"),

  /** Estimation gains potentiels si je devenais commercial agréé. */
  getPotentialEarnings: () =>
    request<{
      rateBps: number;
      rateLabel: string;
      durationMonths: number;
      monthlyCommissionCents: number;
      annualCommissionCents: number;
      networkPaid: number;
    }>("GET", "/ambassador/me/potential-earnings"),

  /** Statut commercial agréé (KYC, contrat, etc.). */
  getCommercialStatus: () =>
    request<{
      isCommercialAgreed: boolean;
      commercialContractAcceptedAt: string | null;
      commercialContractFileUrl: string | null;
      commercialSiret: string | null;
      commercialCompanyName: string | null;
      commercialAddress: string | null;
      stripeConnectAccountId: string | null;
      commission: {
        rateBps: number;
        rateLabel: string;
        durationMonths: number;
      };
    }>("GET", "/commercial/me/status"),

  /** Lignes de commission du commercial agréé (12 derniers mois par défaut). */
  getMyCommissions: (months?: number) =>
    request<{
      lines: Array<{
        id: string;
        billingMonth: string;
        baseRevenueCents: number;
        commissionCents: number;
        rateBpsApplied: number;
        payoutStatus: "PENDING" | "PAID" | "CANCELLED";
        paidAt: string | null;
        stripeTransferId: string | null;
        referredUser: { id: string; displayName: string; planCode: string };
      }>;
      totalPendingCents: number;
      totalPaidCents: number;
    }>(
      "GET",
      `/commercial/me/commissions${months ? `?months=${months}` : ""}`,
    ),

  /** Recalcule les commissions du mois courant (commercial agréé only). */
  recomputeMyCommissions: () =>
    request<{ recomputed: number }>("POST", "/commercial/me/recompute"),

  /**
   * V164.H4 — Démarre Stripe Connect Express onboarding pour recevoir les
   * payouts. Retourne l'URL où le commercial doit compléter KYC + RIB.
   */
  startStripeConnectOnboarding: (country?: string) =>
    request<{ url: string; accountId: string }>(
      "POST",
      "/commercial/me/stripe-connect/onboard",
      country ? { country } : {},
    ),

  /**
   * V164.H5 — Avantages parrain (utilisateur lambda) : config admin + état.
   */
  getReferralBenefits: () =>
    request<{
      enabled: {
        freeMonths: boolean;
        aiCredits: boolean;
        discount: boolean;
        points: boolean;
        badges: boolean;
      };
      stats: {
        paidReferrals: number;
        freeReferrals: number;
        totalReferrals: number;
      };
      earned: {
        freeMonths: number;
        freeMonthsCap: number;
        ocrCredits: number;
        voiceCredits: number;
        points: number;
        discountPercent: number;
        badge: "NONE" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
      };
      perReferral: {
        freeMonths: number;
        ocr: number;
        voice: number;
        discountPercent: number;
        pointsPaid: number;
        pointsFree: number;
      };
      badgeThresholds: {
        bronze: number;
        silver: number;
        gold: number;
        platinum: number;
      };
    }>("GET", "/referral/me/benefits"),

  /** Envoie un message à un filleul direct (in-app + email). */
  sendNetworkMessage: (input: {
    recipientUserId: string;
    templateKey?: "RELANCE" | "MOTIVATION" | "WELCOME" | "CUSTOM";
    subject?: string;
    body?: string;
    channels?: "INAPP" | "EMAIL" | "BOTH";
  }) => request<any>("POST", "/network-messages", input),

  /** Liste des messages envoyés au réseau. */
  listNetworkMessages: () =>
    request<
      Array<{
        id: string;
        templateKey: string;
        subject: string;
        body: string;
        channels: string;
        emailSentAt: string | null;
        inAppSentAt: string | null;
        readAt: string | null;
        createdAt: string;
        recipient: { id: string; displayName: string; avatar: string | null };
      }>
    >("GET", "/network-messages/sent"),

  // ============ V164 ADMIN ============

  adminListAmbassadors: () =>
    request<any[]>("GET", "/admin/ambassadors"),

  adminPromoteAmbassador: (userId: string) =>
    request<any>("POST", `/admin/users/${userId}/promote-ambassador`),

  adminRevokeAmbassador: (userId: string) =>
    request<void>("DELETE", `/admin/users/${userId}/ambassador`),

  adminPromoteCommercial: (
    userId: string,
    input: {
      contractFileUrl: string;
      siret: string;
      companyName: string;
      address: string;
    },
  ) =>
    request<any>(
      "POST",
      `/admin/users/${userId}/promote-commercial`,
      input,
    ),

  adminRevokeCommercial: (userId: string) =>
    request<void>("DELETE", `/admin/users/${userId}/commercial`),

  adminListCommercials: () =>
    request<
      Array<{
        id: string;
        displayName: string;
        avatar: string | null;
        commercialContractAcceptedAt: string | null;
        commercialSiret: string | null;
        commercialCompanyName: string | null;
        stripeConnectAccountId: string | null;
        _count: { referrals: number };
        last3Months: { baseRevenueCents: number; commissionCents: number };
      }>
    >("GET", "/admin/commercials"),

  adminGetCommissionConfig: () =>
    request<any>("GET", "/admin/commission-config"),

  adminUpdateCommissionConfig: (patch: {
    rateBps?: number;
    durationMonths?: number;
    basedOnCollected?: boolean;
    maxMonthlyPayoutCents?: number | null;
    notes?: string | null;
  }) => request<any>("PUT", "/admin/commission-config", patch),

  adminGetAmbassadorConfig: () =>
    request<any>("GET", "/admin/ambassador-config"),

  adminUpdateAmbassadorConfig: (patch: Record<string, unknown>) =>
    request<any>("PUT", "/admin/ambassador-config", patch),

  adminGetReferralConfig: () =>
    request<any>("GET", "/admin/referral-config"),

  adminUpdateReferralConfig: (patch: Record<string, unknown>) =>
    request<any>("PUT", "/admin/referral-config", patch),

  adminMarkLinePaid: (
    lineId: string,
    input: { stripeTransferId?: string | null; adminNotes?: string | null },
  ) =>
    request<any>(
      "POST",
      `/admin/commission-lines/${lineId}/pay`,
      input,
    ),

  // ============ V163 — CUSTOM LOGO PDF ============

  /** Récupère le statut + pricing du logo personnalisé pour un groupe. */
  getCustomLogoStatus: (groupId: string) =>
    request<{
      hasLogo: boolean;
      logoUrl: string | null;
      active: boolean;
      activeUntil: string | null;
      stripeSubId: string | null;
      pricing: {
        currency: string;
        monthlyPriceCents: number;
        monthlyPriceFormatted: string;
        enabled: boolean;
      };
    }>("GET", `/groups/${groupId}/custom-logo`),

  /** Upload d'une image base64 (data URL) comme logo personnalisé. */
  uploadCustomLogo: async (groupId: string, imageDataUrl: string) => {
    const r = await request<{ ok: true; bytes: number }>(
      "POST",
      `/groups/${groupId}/custom-logo`,
      { imageDataUrl },
    );
    return r;
  },

  /** Retire le logo personnalisé (l'abonnement reste actif). */
  removeCustomLogo: (groupId: string) =>
    request<void>("DELETE", `/groups/${groupId}/custom-logo`),

  /** Lance Stripe Checkout pour activer le logo perso 9,99€/mois (squelette V163). */
  startCustomLogoCheckout: (groupId: string) =>
    request<{
      ready: boolean;
      message?: string;
      url?: string;
      pricing: {
        currency: string;
        monthlyPriceCents: number;
        monthlyPriceFormatted: string;
      };
      mockActivateEndpoint?: string;
    }>("POST", `/groups/${groupId}/custom-logo/checkout`),

  /** SuperAdmin only — active 30 jours sans Stripe (assistance/tests). */
  mockActivateCustomLogo: (groupId: string) =>
    request<{ activated: true; until: string }>(
      "POST",
      `/groups/${groupId}/custom-logo/mock-activate`,
    ),

  /** Liste tous les tarifs custom logo (SuperAdmin). */
  listCustomLogoPricing: () =>
    request<
      Array<{
        id: string;
        currency: string;
        monthlyPriceCents: number;
        enabled: boolean;
        notes: string | null;
        updatedAt: string;
        createdAt: string;
      }>
    >("GET", `/custom-logo-pricing`),

  /** Upsert un tarif custom logo (SuperAdmin). */
  upsertCustomLogoPricing: (input: {
    currency: string;
    monthlyPriceCents: number;
    enabled?: boolean;
    notes?: string;
  }) =>
    request<{
      id: string;
      currency: string;
      monthlyPriceCents: number;
      enabled: boolean;
    }>("PUT", `/custom-logo-pricing`, input),

  // ============ SEARCH (Sprint AC-3) ============

  /**
   * Recherche unifiée dans les transcripts (audio proofs, réunions),
   * les libellés de dépense, et les résumés de réunion. Scope = groupes
   * du user uniquement.
   */
  searchAll: (q: string, opts?: { limit?: number; offset?: number }) =>
    request<{
      results: Array<{
        kind: "EXPENSE" | "ATTACHMENT_TRANSCRIPT" | "MEETING";
        id: string;
        groupId: string;
        groupName: string;
        snippet: string;
        link: string;
        occurredAt: string;
      }>;
      total: number;
    }>(
      "GET",
      `/me/search?q=${encodeURIComponent(q)}${opts?.limit ? `&limit=${opts.limit}` : ""}${opts?.offset ? `&offset=${opts.offset}` : ""}`,
    ),

  // ============ V201 — CAISSES PROJET (Project Funds) ============
  //
  // BMD agit en REGISTRE — jamais en dépositaire de fonds. Le trésorier
  // détient l'argent physiquement (compte bancaire perso, mobile money,
  // espèces, etc.). BMD trace uniquement les déclarations pour assurer la
  // transparence entre contributeurs.
  //
  // Kill switch : `feature-gate` est interrogé au mount des pages Caisses.
  // Si `{ enabled: false }` → on masque toute l'UI et on n'affiche aucune
  // erreur réseau (le module est désactivé, pas en panne).

  /**
   * V201 — Indique si le module Caisses Projet est activé globalement.
   * Endpoint public (pas d'auth requise) pour permettre au front de cacher
   * l'onglet « Caisses » sans déclencher d'erreur réseau visible.
   */
  projectFundsFeatureGate: () =>
    request<{ enabled: boolean }>("GET", "/project-funds/feature-gate"),

  /**
   * V212 — Mode test (ajout direct de membre sans approbation).
   * Lit le flag SiteConfig.testModeEnabled. Si OFF, l'UI cache le bouton
   * « + Membre test » dans la vue Membres.
   *
   * V214 — Endpoint déplacé vers /auth/test-mode-gate (public, sans auth)
   * pour que la page /login puisse l'appeler avant que l'user ait un token.
   * L'ancien /groups/test-mode-gate était protégé par le hook global auth
   * du module groups → 401 sur /login → bouton « Login direct » invisible.
   */
  testModeGate: () =>
    request<{ enabled: boolean }>("GET", "/auth/test-mode-gate"),

  /**
   * V214 — Connexion directe en mode test (bypass OTP).
   * Crée le user si introuvable. Retourne un JWT directement.
   * Marche uniquement si SiteConfig.testModeEnabled = true (sinon 403).
   */
  testLogin: (input: {
    contactType: "EMAIL" | "PHONE";
    contactValue: string;
    displayName?: string;
  }) =>
    request<{
      token: string;
      expiresAt: string;
      user: {
        id: string;
        displayName: string;
        avatar: string | null;
        defaultCurrency: string;
        defaultLocale: string;
        createdAt: string;
      };
    }>("POST", "/auth/test-login", input),

  /**
   * V212 — Ajoute directement un membre fictif (sans flow d'invitation).
   * Gate côté serveur : SiteConfig.testModeEnabled + ADMIN/créateur du groupe.
   */
  addTestMember: (
    groupId: string,
    input: {
      displayName: string;
      contactType?: "EMAIL" | "PHONE";
      contactValue?: string;
      role?: "MEMBER" | "ADMIN" | "TREASURER" | "OBSERVER";
    },
  ) =>
    request<{
      id: string;
      role: string;
      joinedAt: string;
      user: {
        id: string;
        displayName: string;
        avatar: string | null;
        isTestUser: boolean;
      };
    }>("POST", `/groups/${groupId}/members/test-add`, input),

  /**
   * V201 — Liste les caisses d'un groupe (avec soldes calculés).
   */
  listProjectFunds: (groupId: string) =>
    request<
      Array<{
        id: string;
        publicCode: string;
        name: string;
        template: "EVENT" | "PROJECT" | "SOLIDARITY" | "ASSOCIATION" | "GIFT";
        status: "DRAFT" | "ACTIVE" | "ARCHIVED" | "CLOSED";
        targetAmount: string | null;
        currency: string;
        deadline: string | null;
        createdAt: string;
        closedAt: string | null;
        treasurerUserId: string | null;
        treasurer: {
          id: string;
          displayName: string;
          avatar: string | null;
        } | null;
        contributed: number;
        spent: number;
        balance: number;
        contributorsCount: number;
      }>
    >("GET", `/groups/${groupId}/project-funds`),

  /**
   * V201 — Crée une nouvelle caisse dans un groupe.
   * Le créateur devient trésorier par défaut sauf si `treasurerUserId`
   * désigne quelqu'un d'autre (qui doit être membre du groupe).
   */
  createProjectFund: (
    groupId: string,
    input: {
      name: string;
      description?: string;
      template?: "EVENT" | "PROJECT" | "SOLIDARITY" | "ASSOCIATION" | "GIFT";
      targetAmount?: number;
      currency?: string;
      deadline?: string;
      treasurerUserId?: string;
      voteThreshold?: number;
      voteApprovalRatio?: number;
      /**
       * V215.C1 — Fréquence de versement attendue de chaque contributeur.
       * Par défaut ONE_SHOT. Pour MONTHLY/WEEKLY/BIWEEKLY le backend calcule
       * automatiquement l'échéancier (numberOfInstallments + installmentAmount)
       * à partir de la deadline + targetAmount. Pour CUSTOM, passer aussi
       * numberOfInstallments.
       */
      frequency?: "ONE_SHOT" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM";
      numberOfInstallments?: number;
      /**
       * V218.G — Mode de contribution. FREE (défaut) = chacun cotise ce qu'il
       * veut. FIXED = montant imposé strictement égal à `contributionAmount`.
       */
      contributionMode?: "FREE" | "FIXED";
      /**
       * V218.G — Montant fixe par versement (devise de la caisse). Obligatoire
       * si `contributionMode === "FIXED"`, ignoré sinon.
       */
      contributionAmount?: number;
    },
  ) =>
    request<{ id: string; publicCode: string }>(
      "POST",
      `/groups/${groupId}/project-funds`,
      input,
    ),

  /**
   * V201 — Détail complet d'une caisse : metadata + contributions +
   * dépenses + soldes calculés. Servir le hero + tabs en un seul fetch.
   */
  getProjectFund: (fundId: string) =>
    request<{
      fund: {
        id: string;
        groupId: string;
        publicCode: string;
        name: string;
        description: string | null;
        template: "EVENT" | "PROJECT" | "SOLIDARITY" | "ASSOCIATION" | "GIFT";
        status: "DRAFT" | "ACTIVE" | "ARCHIVED" | "CLOSED";
        targetAmount: string | null;
        currency: string;
        deadline: string | null;
        voteThreshold: string | null;
        voteApprovalRatio: string;
        createdByUserId: string;
        treasurerUserId: string | null;
        createdAt: string;
        closedAt: string | null;
        group: { id: string; name: string };
      };
      contributions: Array<{
        id: string;
        contributorUserId: string;
        amount: string;
        currency: string;
        amountInFundCurrency: string;
        exchangeRate: string | null;
        method:
          | "TRANSFER"
          | "MOBILE_MONEY"
          | "CASH"
          | "CARD"
          | "OTHER";
        note: string | null;
        proofUrl: string | null;
        status: "PENDING" | "VALIDATED" | "REJECTED";
        validatedAt: string | null;
        rejectionReason: string | null;
        createdAt: string;
        contributor: {
          id: string;
          displayName: string;
          avatar: string | null;
        };
      }>;
      expenses: Array<{
        id: string;
        createdByUserId: string;
        motive: string;
        amount: string;
        currency: string;
        beneficiary: string | null;
        proofUrl: string | null;
        status: "PENDING_VOTE" | "APPROVED" | "REJECTED" | "EXECUTED";
        voteRequired: boolean;
        votesFor: number;
        votesAgainst: number;
        voteClosesAt: string | null;
        createdAt: string;
        executedAt: string | null;
      }>;
      balance: {
        contributed: number;
        spent: number;
        balance: number;
        contributorsCount: number;
      };
    }>("GET", `/project-funds/${fundId}`),

  /**
   * V201 — Déclare une cotisation. Le contributeur indique le montant,
   * la devise, la méthode de paiement et un lien vers la preuve
   * (justificatif de virement, capture mobile money, etc.). La cotisation
   * est en statut PENDING tant que le trésorier ne l'a pas validée.
   */
  contributeToProjectFund: (
    fundId: string,
    input: {
      amount: number;
      currency: string;
      method?: "TRANSFER" | "MOBILE_MONEY" | "CASH" | "CARD" | "OTHER";
      note?: string;
      proofUrl?: string;
    },
  ) =>
    request<{ id: string; status: "PENDING"; createdAt: string }>(
      "POST",
      `/project-funds/${fundId}/contribute`,
      input,
    ),

  /**
   * V201 — Trésorier valide une cotisation (statut PENDING → VALIDATED).
   * Compte alors dans le solde de la caisse.
   */
  validateProjectFundContribution: (fundId: string, contributionId: string) =>
    request<{ id: string; status: "VALIDATED" }>(
      "POST",
      `/project-funds/${fundId}/contributions/${contributionId}/validate`,
    ),

  /**
   * V201 — Trésorier rejette une cotisation (raison libre). La cotisation
   * ne compte pas dans le solde. Action définitive (le contributeur
   * doit en déclarer une nouvelle s'il veut réessayer).
   */
  rejectProjectFundContribution: (
    fundId: string,
    contributionId: string,
    reason?: string,
  ) =>
    request<{ id: string; status: "REJECTED" }>(
      "POST",
      `/project-funds/${fundId}/contributions/${contributionId}/reject`,
      { reason },
    ),

  /**
   * V201 — Trésorier propose une dépense sur la caisse. Si le montant
   * dépasse le seuil de vote (caisse ou global), passe en PENDING_VOTE
   * avec 72h pour voter. Sinon, APPROVED directement.
   */
  proposeProjectFundExpense: (
    fundId: string,
    input: {
      motive: string;
      amount: number;
      beneficiary?: string;
      proofUrl?: string;
    },
  ) =>
    request<{
      id: string;
      status: "PENDING_VOTE" | "APPROVED";
      voteRequired: boolean;
    }>("POST", `/project-funds/${fundId}/expenses`, input),

  /**
   * V201 — Vote oui/non sur une dépense en attente. Réservé aux
   * contributeurs ayant au moins 1 cotisation VALIDATED dans la caisse
   * (« 1 contributeur = 1 voix »). Peut changer son vote tant que la
   * période est ouverte.
   */
  voteOnProjectFundExpense: (
    fundId: string,
    expenseId: string,
    vote: boolean,
    comment?: string,
  ) =>
    request<{ votesFor: number; votesAgainst: number }>(
      "POST",
      `/project-funds/${fundId}/expenses/${expenseId}/vote`,
      { vote, comment },
    ),

  /**
   * V201 — Trésorier marque une dépense APPROVED comme EXECUTED (l'argent
   * a été versé au bénéficiaire). Vérifie que le solde de la caisse est
   * suffisant. Action définitive et tracée.
   */
  executeProjectFundExpense: (fundId: string, expenseId: string) =>
    request<{ id: string; status: "EXECUTED" }>(
      "POST",
      `/project-funds/${fundId}/expenses/${expenseId}/execute`,
    ),

  /**
   * V201 — Clôture une caisse (statut → CLOSED). Plus de cotisations ni
   * de dépenses possibles. Seul le créateur ou le trésorier peut clôturer.
   */
  closeProjectFund: (fundId: string) =>
    request<{ id: string; status: "CLOSED" }>(
      "POST",
      `/project-funds/${fundId}/close`,
    ),

  /**
   * V201 — Journal d'audit complet de la caisse (hash chaîné SHA-256).
   * Lisible par tout membre du groupe. Sert de preuve de transparence
   * vis-à-vis des contributeurs et, le cas échéant, du régulateur.
   */
  getProjectFundAuditLog: (fundId: string) =>
    request<
      Array<{
        id: string;
        kind:
          | "FUND_CREATED"
          | "FUND_UPDATED"
          | "TREASURER_NAMED"
          | "CONTRIBUTION_DECLARED"
          | "CONTRIBUTION_VALIDATED"
          | "CONTRIBUTION_REJECTED"
          | "EXPENSE_PROPOSED"
          | "EXPENSE_VOTED"
          | "EXPENSE_APPROVED"
          | "EXPENSE_REJECTED"
          | "EXPENSE_EXECUTED"
          | "FUND_CLOSED"
          | "FUND_ARCHIVED";
        payload: Record<string, unknown>;
        actorUserId: string | null;
        previousHash: string | null;
        hash: string;
        createdAt: string;
      }>
    >("GET", `/project-funds/${fundId}/audit-log`),

  /**
   * V202.E — Met à jour les metadata d'une caisse (nom, description,
   * objectif, deadline, trésorier, seuil de vote, ratio).
   * Seul le créateur ou le trésorier peut éditer.
   */
  updateProjectFund: (
    fundId: string,
    input: {
      name?: string;
      description?: string | null;
      targetAmount?: number | null;
      deadline?: string | null;
      treasurerUserId?: string | null;
      voteThreshold?: number | null;
      voteApprovalRatio?: number;
    },
  ) =>
    request<{ id: string }>("PATCH", `/project-funds/${fundId}`, input),

  /**
   * V202.F — Accès public read-only à une caisse par son code public.
   * Pas d'auth requise. Renvoie metadata + balance + contributeurs anonymisés.
   * Utilisé pour partager une caisse avec des contributeurs externes.
   */
  getPublicProjectFund: (publicCode: string) =>
    request<{
      fund: {
        id: string;
        publicCode: string;
        name: string;
        description: string | null;
        template: string;
        status: string;
        targetAmount: string | null;
        currency: string;
        deadline: string | null;
        createdAt: string;
        closedAt: string | null;
        group: { name: string };
        treasurer: { displayName: string } | null;
      };
      balance: {
        contributed: number;
        spent: number;
        balance: number;
        contributorsCount: number;
      };
      contributors: Array<{ firstName: string }>;
    }>("GET", `/public/project-funds/${publicCode}`),

  /**
   * V202.G — Lien direct vers le PDF récap (download forcé).
   * Le token JWT est ajouté en query string pour que la balise <a download>
   * fonctionne sans intercepteur (le navigateur ouvre direct).
   */
  projectFundPdfReceiptUrl: (fundId: string) => {
    const url = getApiUrl();
    const token = getToken();
    return `${url}/project-funds/${fundId}/pdf-receipt${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },

  /**
   * V204.C — Upload d'une preuve photo (data URL → Cloudinary HTTPS).
   * Si Cloudinary n'est pas configuré côté serveur, renvoie la data URL
   * inchangée (mode inline DB). L'appelant utilise simplement `url`
   * comme valeur de `proofUrl` lors de la contribution.
   */
  uploadProjectFundProof: (dataUrl: string) =>
    request<{ url: string }>("POST", "/project-funds/upload-proof", {
      dataUrl,
    }),

  /**
   * V222.C — Statut de cotisation par membre et par période.
   * Permet d'afficher la grille « qui à jour vs en retard » sur les caisses
   * à fréquence régulière (MONTHLY/WEEKLY/BIWEEKLY) en mode FIXED.
   *
   * Pour les caisses FREE ou ONE_SHOT/CUSTOM, `expectedTotal` est null et
   * `periods` est vide → le front affiche juste la liste des versements par
   * membre, sans notion de retard.
   */
  getFundContributionsStatus: (groupId: string, fundId: string) =>
    request<{
      fund: {
        id: string;
        name: string;
        frequency: "ONE_SHOT" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM";
        contributionMode: "FREE" | "FIXED";
        contributionAmount: number | null;
        currency: string;
        startDate: string;
      };
      periods: Array<{ start: string; end: string; label: string }>;
      membersStatus: Array<{
        userId: string;
        displayName: string;
        avatar: string | null;
        contributedTotal: number;
        pendingTotal: number;
        expectedTotal: number | null;
        late: number;
        ahead: number;
        upToDate: boolean;
        contributionsCount: number;
        contributionsByPeriod: Record<
          string,
          {
            amount: number;
            status: "PENDING" | "VALIDATED";
            contributionId: string;
            currency: string;
          }
        >;
      }>;
      totals: {
        collected: number;
        expected: number | null;
        membersUpToDate: number;
        membersTotal: number;
      };
    }>(
      "GET",
      `/groups/${groupId}/funds/${fundId}/contributions-status`,
    ),
};
