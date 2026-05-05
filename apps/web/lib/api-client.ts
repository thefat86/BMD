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

/**
 * Détecte une erreur "plan insuffisant" (HTTP 402) — l'UI peut alors
 * afficher un CTA d'upgrade plutôt qu'un message d'erreur générique.
 */
export function isPlanRequired(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    (e.status === 402 || e.code === "plan_required")
  );
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
      user: { id: string; displayName: string };
    }>("POST", "/auth/otp/verify", input),

  me: () => request<{ user: any }>("GET", "/auth/me"),

  updateMe: (input: {
    displayName?: string;
    defaultCurrency?: string;
    defaultLocale?: string;
    avatar?: string | null;
    /** Tonalité des rappels (spec §3.8) : sympa | ferme | humour | pro */
    reminderTone?: "sympa" | "ferme" | "humour" | "pro";
  }) => request<{ user: any }>("PATCH", "/auth/me", input),

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

  logout: () => request<void>("POST", "/auth/logout"),

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

  createExpense: (
    groupId: string,
    input: {
      description: string;
      amount: string;
      splitMode: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
      paidByUserId?: string;
      participants: Array<{ userId: string; share?: number }>;
    },
  ) => request<any>("POST", `/groups/${groupId}/expenses`, input),

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
  updateExpense: (
    expenseId: string,
    input: {
      description?: string;
      amount?: string;
      splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";
      paidByUserId?: string;
      participants?: Array<{ userId: string; share?: number }>;
    },
  ) => request<any>("PATCH", `/expenses/${expenseId}`, input),

  /** Supprime une dépense. Cascade auto sur les ExpenseShare. */
  deleteExpense: (expenseId: string) =>
    request<void>("DELETE", `/expenses/${expenseId}`),

  // ============ GROUP SETTINGS / MEMBERS ============

  /** Renomme le groupe ou change la devise par défaut. */
  updateGroup: (
    groupId: string,
    input: { name?: string; defaultCurrency?: string },
  ) => request<any>("PATCH", `/groups/${groupId}`, input),

  /** Supprime un groupe (admin uniquement, cascade sur tout). */
  deleteGroup: (groupId: string) =>
    request<void>("DELETE", `/groups/${groupId}`),

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

  /** Liste les tokens actifs d'un groupe (admin/trésorier). */
  listInviteTokens: (groupId: string) =>
    request<
      Array<{
        id: string;
        token: string;
        expiresAt: string;
        maxUses: number | null;
        uses: number;
        revokedAt: string | null;
        createdAt: string;
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

  /** Je revendique cet item (rééquilibrage automatique des shares). */
  claimItem: (itemId: string, share?: number) =>
    request<any>(
      "POST",
      `/expense-items/${itemId}/claim`,
      share !== undefined ? { share } : {},
    ),

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
      /** Items détectés (mode split par item — voir feature ITEMIZED) */
      items: Array<{
        description: string;
        quantity: number;
        unitPrice: string;
        totalPrice: string;
      }>;
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
    },
  ) => request<any>("PATCH", `/admin/plans/${code}`, body),

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
      }>
    >("GET", `/expenses/${expenseId}/attachments`),

  /**
   * Upload une pièce jointe (multipart). Le navigateur génère le boundary.
   * Permission backend : payeur OU admin uniquement.
   */
  uploadAttachment: async (expenseId: string, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
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
        "Impossible d'envoyer le fichier",
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
};
