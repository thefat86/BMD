"use client";

/**
 * URL de l'API · résolution intelligente :
 *  1. Si NEXT_PUBLIC_API_URL est défini (build prod), on l'utilise
 *  2. Sinon, on dérive de window.location → utile pour l'accès mobile
 *     via le Wi-Fi local (l'iPhone connaît l'IP du Mac, pas localhost)
 *  3. Fallback SSR : localhost
 */
function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
}

const TOKEN_KEY = "bmd_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
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
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
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
      "Impossible de contacter le serveur. Vérifie ta connexion.",
    );
  }
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
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const api = {
  requestOtp: (contactType: "PHONE" | "EMAIL", contactValue: string) =>
    request<{ sent: true; expiresAt: string }>("POST", "/auth/otp/request", {
      contactType,
      contactValue,
    }),

  verifyOtp: (input: {
    contactType: "PHONE" | "EMAIL";
    contactValue: string;
    code: string;
    displayName?: string;
  }) =>
    request<{
      token: string;
      expiresAt: string;
      user: { id: string; displayName: string };
    }>("POST", "/auth/otp/verify", input),

  me: () => request<{ user: any }>("GET", "/auth/me"),

  updateMe: (input: {
    displayName?: string;
    defaultCurrency?: string;
    defaultLocale?: string;
    avatar?: string | null;
  }) => request<{ user: any }>("PATCH", "/auth/me", input),

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

  logout: () => request<void>("POST", "/auth/logout"),

  listGroups: () =>
    request<
      Array<{
        id: string;
        name: string;
        type: string;
        defaultCurrency: string;
        membersCount: number;
        createdAt: string;
      }>
    >("GET", "/groups"),

  createGroup: (input: { name: string; type: string; defaultCurrency?: string }) =>
    request<{ id: string; name: string }>("POST", "/groups", input),

  getGroup: (id: string) => request<any>("GET", `/groups/${id}`),

  inviteMember: (groupId: string, contactType: "PHONE" | "EMAIL", contactValue: string) =>
    request<any>("POST", `/groups/${groupId}/members`, { contactType, contactValue }),

  listExpenses: (groupId: string) =>
    request<any[]>("GET", `/groups/${groupId}/expenses`),

  createExpense: (
    groupId: string,
    input: {
      description: string;
      amount: string;
      splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE";
      paidByUserId?: string;
      participants: Array<{ userId: string; share?: number }>;
    },
  ) => request<any>("POST", `/groups/${groupId}/expenses`, input),

  // ============ TONTINES (M08) ============

  getTontine: (groupId: string) =>
    request<{ tontine: any | null }>("GET", `/groups/${groupId}/tontine`),

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

  getBalance: (groupId: string) =>
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

  // ============ SPLIT PRESETS (M10) ============

  listPresets: (groupId: string) =>
    request<
      Array<{
        id: string;
        name: string;
        splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE";
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
      splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE";
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
  scanReceipt: async (file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    let r: Response;
    try {
      r = await fetch(`${getApiUrl()}/receipts/scan`, {
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
        "Impossible de contacter le serveur OCR",
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
    };
  },

  // ============ ADMIN (D) ============

  adminStats: () => request<any>("GET", "/admin/stats"),

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
};
