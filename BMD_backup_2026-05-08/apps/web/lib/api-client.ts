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
}

/**
 * Détails structurés renvoyés par le backend pour rendre l'UI parlante.
 * Voir apps/api/src/lib/errors.ts → AppErrorDetails.
 */
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
  try {
    r = await fetch(`${getApiUrl()}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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
    defaultCurrency?: string;
    defaultLocale?: string;
    avatar?: string | null;
    /** Tonalité des rappels (spec §3.8) : sympa | ferme | humour | pro */
    reminderTone?: "sympa" | "ferme" | "humour" | "pro";
  }) => {
    const r = await request<{ user: any }>("PATCH", "/auth/me", input);
    // Invalide le cache pour que la prochaine lecture reflète la modif
    invalidateMeCache();
    // Si la devise change, on doit invalider TOUS les caches de soldes :
    // le serveur renvoie les balances dans la nouvelle defaultCurrency,
    // donc les soldes mémoïsés (30s TTL) sont périmés. Sans cette ligne,
    // l'utilisateur voit son ancien solde dans l'ancienne devise jusqu'à
    // expiration du cache → bug "la conversion ne se fait pas en temps réel".
    if (input.defaultCurrency) {
      invalidateGenericCache("/me/global-balance");
      invalidateGenericCache("/me/balances/by-person");
      invalidateGenericCache("/groups");
      // Tous les /groups/{id}/balance ont été créés à la volée, on purge tout
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

  createGroup: async (input: {
    name: string;
    type: string;
    defaultCurrency?: string;
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
   * Invite plusieurs contacts d'un coup. Utilisé après le Contact Picker.
   * Réponse : { added: [...], failed: [...{contactValue, reason}] }
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
        memberId: string;
        userId: string;
        displayName: string;
      }>;
      failed: Array<{
        contactValue: string;
        reason: string;
      }>;
    }>("POST", `/groups/${groupId}/members/batch`, { invitations }),

  listExpenses: (groupId: string) =>
    request<any[]>("GET", `/groups/${groupId}/expenses`),

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
    },
  ) => {
    const r = await request<any>("POST", `/groups/${groupId}/expenses`, input);
    // Invalide les caches affectés par la création
    invalidateGenericCache("/groups");
    invalidateGenericCache(`/groups/${groupId}`);
    invalidateGenericCache(`/groups/${groupId}/balance`);
    invalidateGenericCache("/me/global-balance");
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
    input: { name?: string; defaultCurrency?: string },
  ) => request<any>("PATCH", `/groups/${groupId}`, input),

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

  /** Feed d'activité d'un groupe (50 derniers événements). */
  listActivity: (groupId: string) =>
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

  // ============ TONTINES (M08) ============

  getTontine: (groupId: string) =>
    request<{ tontine: any | null }>("GET", `/groups/${groupId}/tontine`),

  /**
   * Historique des tontines du groupe (gains par bénéficiaire + dates effectives).
   * Pour le suivi long terme (2+ ans, plusieurs tontines successives).
   */
  getTontineHistory: (groupId: string) =>
    request<{
      tontines: Array<{
        id: string;
        frequency: string;
        currency: string;
        status: string;
        contributionAmount: string;
        startDate: string;
        completedAt: string | null;
        turns: Array<{
          id: string;
          turnNumber: number;
          beneficiary: { id: string; displayName: string; avatar: string | null };
          dueDate: string;
          scheduledDate: string | null;
          distributedAt: string | null;
          status: string;
          totalReceived: string;
          currency: string;
          contributorCount: number;
          paidCount: number;
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
    },
  ) =>
    request<{ id: string; status: string }>(
      "POST",
      `/groups/${groupId}/tontine`,
      input,
    ),

  activateTontine: (tontineId: string, beneficiaryOrder?: string[]) =>
    request<{ id: string; status: string }>(
      "POST",
      `/tontines/${tontineId}/activate`,
      { beneficiaryOrder },
    ),

  cancelTontine: (tontineId: string) =>
    request<{ id: string; status: string }>(
      "POST",
      `/tontines/${tontineId}/cancel`,
    ),

  markContributionPaid: (
    contributionId: string,
    paymentMethod?: string,
    paymentReference?: string,
  ) =>
    request<{ id: string; status: string; paidAt: string | null }>(
      "POST",
      `/tontine-contributions/${contributionId}/mark-paid`,
      { paymentMethod, paymentReference },
    ),

  confirmContribution: (contributionId: string) =>
    request<{ id: string; status: string; confirmedAt: string | null }>(
      "POST",
      `/tontine-contributions/${contributionId}/confirm`,
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

  /** Confirme le paiement via token (no auth — mode invité). */
  confirmPayment: (token: string) =>
    request<{ confirmed: boolean }>("POST", `/pay-confirm/${token}`),

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
  scanReceipt: async (file: File, groupId?: string) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

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
    formData.append("file", blob, "voice.webm");
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

  adminActivity: () =>
    request<
      Array<{
        kind: "user_signup" | "expense" | "swap";
        at: string;
        label: string;
        id: string;
      }>
    >("GET", "/admin/activity"),

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
    // Cache 5 min — les plans changent peu (admin modif rare). Si l'admin
    // édite la matrice tarifaire, il faut appeler invalidateGenericCache().
    return memoized(`/plans${qs}`, 5 * 60_000, () =>
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
  adminUpdatePlan: (
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
  ) => request<any>("PATCH", `/admin/plans/${code}`, body),

  /** Crée un nouveau plan tarifaire (admin only, spec §6.3). */
  adminCreatePlan: (body: {
    code: string;
    name: string;
    priceCents?: number;
    priceCentsYearly?: number | null;
    description?: string;
    limits?: Record<string, any>;
    displayOrder?: number;
  }) => request<any>("POST", "/admin/plans", body),

  /** Supprime un plan (refus si users encore dessus). */
  adminDeletePlan: (code: string) =>
    request<void>("DELETE", `/admin/plans/${code}`),

  /** Change le plan d'un utilisateur. */
  adminChangeUserPlan: (userId: string, planCode: string) =>
    request<{ id: string; displayName: string; planCode: string }>(
      "POST",
      `/admin/users/${userId}/change-plan`,
      { planCode },
    ),

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
  adminGetSiteConfig: () =>
    request<{
      id: string;
      supportEmail: string;
      privacyEmail: string;
      securityEmail: string;
      whatsappNumber: string | null;
      siteUrl: string;
      updatedAt: string;
    }>("GET", "/admin/site-config"),

  adminUpdateSiteConfig: (body: {
    supportEmail?: string;
    privacyEmail?: string;
    securityEmail?: string;
    whatsappNumber?: string;
    siteUrl?: string;
  }) => {
    invalidateGenericCache("/site-config");
    return request<any>("PATCH", "/admin/site-config", body);
  },

  // ============ NOTIFICATIONS ============

  /** Liste les notifications de l'utilisateur connecté. */
  listNotifications: (unreadOnly = false, limit = 50) =>
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

  /** Compte des notifications non-lues (pour le badge). */
  unreadNotificationsCount: () =>
    request<{ count: number }>("GET", "/notifications/unread-count"),

  markNotificationRead: (id: string) =>
    request<{ updated: number }>("POST", `/notifications/${id}/read`),

  markAllNotificationsRead: () =>
    request<{ updated: number }>("POST", "/notifications/read-all"),

  deleteNotification: (id: string) =>
    request<void>("DELETE", `/notifications/${id}`),

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
      ok: boolean;
      delivered: number;
      pruned: number;
      errors: number;
    }>("POST", "/push/test"),

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
      } | null;
      errorMessage: string | null;
      audioMimeType: string;
      audioSizeBytes: number;
      audioPurged: boolean;
      group: { id: string; name: string };
    }>("GET", `/meetings/${meetingId}`),

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
};
