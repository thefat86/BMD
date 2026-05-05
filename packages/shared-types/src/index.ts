/**
 * @bmd/shared-types
 * Types partagés entre le backend, le client web et (à venir) les apps mobiles.
 * Ces types reflètent le contrat d'API public — ne pas mélanger avec les types Prisma internes.
 */

// === ENUMS ===

export type ContactType = "PHONE" | "EMAIL";

export type GroupType =
  | "TONTINE"
  | "COLOC"
  | "TRAVEL"
  | "EVENT"
  | "CLUB"
  | "PARISH"
  | "GENERIC";

export type MemberRole = "ADMIN" | "TREASURER" | "MEMBER" | "OBSERVER";

export type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE";

export type SettlementStatus = "PROPOSED" | "PAID" | "CONFIRMED" | "CANCELLED";

// === DTO PUBLICS ===

export interface UserPublic {
  id: string;
  displayName: string;
  avatar: string | null;
  defaultCurrency: string;
  defaultLocale: string;
}

export interface ContactPublic {
  id: string;
  type: ContactType;
  value: string;
  isVerified: boolean;
  isPrimary: boolean;
  verifiedAt: string | null;
}

export interface GroupPublic {
  id: string;
  name: string;
  type: GroupType;
  defaultCurrency: string;
  createdAt: string;
  membersCount: number;
}

export interface GroupMemberPublic {
  id: string;
  user: UserPublic;
  role: MemberRole;
  joinedAt: string;
}

export interface ExpenseSharePublic {
  userId: string;
  displayName: string;
  amountOwed: string; // decimal as string for precision
}

export interface ExpensePublic {
  id: string;
  groupId: string;
  description: string;
  amount: string;
  currency: string;
  category: string | null;
  paidBy: UserPublic;
  splitMode: SplitMode;
  occurredAt: string;
  shares: ExpenseSharePublic[];
}

export interface BalancePublic {
  userId: string;
  displayName: string;
  net: string; // positive = owed to you, negative = you owe
  currency: string;
}

export interface SuggestedSettlementPublic {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: string;
  currency: string;
}

// === REQUESTS ===

export interface RequestOtpBody {
  contactType: ContactType;
  contactValue: string;
  channel?: "SMS" | "WHATSAPP" | "EMAIL";
}

export interface VerifyOtpBody {
  contactType: ContactType;
  contactValue: string;
  code: string;
  displayName?: string;
}

export interface CreateGroupBody {
  name: string;
  type: GroupType;
  defaultCurrency?: string;
}

export interface InviteMemberBody {
  contactType: ContactType;
  contactValue: string;
  role?: MemberRole;
}

export interface CreateExpenseBody {
  description: string;
  amount: string;
  currency?: string;
  category?: string;
  paidByUserId?: string; // defaults to current user
  splitMode: SplitMode;
  participants: Array<{ userId: string; share?: number }>; // share = weight or percent depending on splitMode
  occurredAt?: string;
}

// === RESPONSES ===

export interface AuthResponse {
  token: string;
  user: UserPublic;
  expiresAt: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

// === VALIDATORS ===
export * from "./validators";
