"use client";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ message: r.statusText }));
    throw new Error(err.message ?? `HTTP ${r.status}`);
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
};
