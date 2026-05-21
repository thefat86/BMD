-- ============================================================================
-- V200 — Module Caisses Projet (Project Funds)
-- ============================================================================
-- Crée :
--   - SiteConfig flag projectFundsEnabled (kill switch global)
--   - 6 enums (FundTemplate, FundStatus, FundPaymentMethod,
--     FundContributionStatus, FundExpenseStatus, FundEventKind)
--   - 5 tables (ProjectFund, FundContribution, FundExpense,
--     FundExpenseVote, FundEvent)
--   - Indexes performance
--
-- Note : tous les `id` et FK sont en TEXT (pas UUID Postgres) pour rester
-- cohérent avec le reste du schéma BMD (Prisma `String @id @default(uuid())`
-- → TEXT côté Postgres, valeur générée par Prisma client à l'insertion).
-- ============================================================================

-- ============================================================================
-- 1. SiteConfig flags (kill switch + seuil vote global)
-- ============================================================================
ALTER TABLE "SiteConfig"
  ADD COLUMN "projectFundsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "projectFundsVoteThresholdEur" DECIMAL(14, 2) NOT NULL DEFAULT 500;

-- ============================================================================
-- 2. Enums
-- ============================================================================
CREATE TYPE "FundTemplate" AS ENUM (
  'EVENT', 'PROJECT', 'SOLIDARITY', 'ASSOCIATION', 'GIFT'
);

CREATE TYPE "FundStatus" AS ENUM (
  'DRAFT', 'ACTIVE', 'ARCHIVED', 'CLOSED'
);

CREATE TYPE "FundPaymentMethod" AS ENUM (
  'TRANSFER', 'MOBILE_MONEY', 'CASH', 'CARD', 'OTHER'
);

CREATE TYPE "FundContributionStatus" AS ENUM (
  'PENDING', 'VALIDATED', 'REJECTED'
);

CREATE TYPE "FundExpenseStatus" AS ENUM (
  'PENDING_VOTE', 'APPROVED', 'REJECTED', 'EXECUTED'
);

CREATE TYPE "FundEventKind" AS ENUM (
  'FUND_CREATED', 'FUND_UPDATED', 'TREASURER_NAMED',
  'CONTRIBUTION_DECLARED', 'CONTRIBUTION_VALIDATED', 'CONTRIBUTION_REJECTED',
  'EXPENSE_PROPOSED', 'EXPENSE_VOTED', 'EXPENSE_APPROVED',
  'EXPENSE_REJECTED', 'EXPENSE_EXECUTED',
  'FUND_CLOSED', 'FUND_ARCHIVED'
);

-- ============================================================================
-- 3. ProjectFund (caisse principale)
-- ============================================================================
CREATE TABLE "ProjectFund" (
  "id"                 TEXT           NOT NULL,
  "groupId"            TEXT           NOT NULL,
  "createdByUserId"    TEXT           NOT NULL,
  "treasurerUserId"    TEXT,
  "name"               VARCHAR(160)   NOT NULL,
  "description"        TEXT,
  "template"           "FundTemplate" NOT NULL DEFAULT 'EVENT',
  "status"             "FundStatus"   NOT NULL DEFAULT 'ACTIVE',
  "targetAmount"       DECIMAL(14, 2),
  "currency"           TEXT           NOT NULL DEFAULT 'EUR',
  "deadline"           TIMESTAMP(3),
  "voteThreshold"      DECIMAL(14, 2),
  "voteApprovalRatio"  DECIMAL(3, 2)  NOT NULL DEFAULT 0.5,
  "publicCode"         TEXT           NOT NULL,
  "createdAt"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)   NOT NULL,
  "closedAt"           TIMESTAMP(3),

  CONSTRAINT "ProjectFund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectFund_publicCode_key" UNIQUE ("publicCode"),
  CONSTRAINT "ProjectFund_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectFund_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectFund_treasurerUserId_fkey"
    FOREIGN KEY ("treasurerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ProjectFund_groupId_status_idx"      ON "ProjectFund"("groupId", "status");
CREATE INDEX "ProjectFund_treasurerUserId_idx"     ON "ProjectFund"("treasurerUserId");
CREATE INDEX "ProjectFund_deadline_idx"            ON "ProjectFund"("deadline");
CREATE INDEX "ProjectFund_status_createdAt_idx"    ON "ProjectFund"("status", "createdAt");

-- ============================================================================
-- 4. FundContribution (cotisations)
-- ============================================================================
CREATE TABLE "FundContribution" (
  "id"                    TEXT           NOT NULL,
  "fundId"                TEXT           NOT NULL,
  "contributorUserId"     TEXT           NOT NULL,
  "amount"                DECIMAL(14, 2) NOT NULL,
  "currency"              TEXT           NOT NULL,
  "amountInFundCurrency"  DECIMAL(14, 2) NOT NULL,
  "exchangeRate"          DECIMAL(12, 6),
  "method"                "FundPaymentMethod"      NOT NULL DEFAULT 'TRANSFER',
  "note"                  TEXT,
  "proofUrl"              TEXT,
  "status"                "FundContributionStatus" NOT NULL DEFAULT 'PENDING',
  "validatedAt"           TIMESTAMP(3),
  "validatedByUserId"     TEXT,
  "rejectionReason"       TEXT,
  "createdAt"             TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FundContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FundContribution_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "ProjectFund"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FundContribution_contributorUserId_fkey"
    FOREIGN KEY ("contributorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FundContribution_validatedByUserId_fkey"
    FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FundContribution_fundId_status_idx"       ON "FundContribution"("fundId", "status");
CREATE INDEX "FundContribution_contributorUserId_idx"   ON "FundContribution"("contributorUserId");
CREATE INDEX "FundContribution_fundId_createdAt_idx"    ON "FundContribution"("fundId", "createdAt");

-- ============================================================================
-- 5. FundExpense (dépenses)
-- ============================================================================
CREATE TABLE "FundExpense" (
  "id"               TEXT           NOT NULL,
  "fundId"           TEXT           NOT NULL,
  "createdByUserId"  TEXT           NOT NULL,
  "motive"           VARCHAR(240)   NOT NULL,
  "amount"           DECIMAL(14, 2) NOT NULL,
  "currency"         TEXT           NOT NULL,
  "beneficiary"      VARCHAR(240),
  "proofUrl"         TEXT,
  "status"           "FundExpenseStatus" NOT NULL DEFAULT 'PENDING_VOTE',
  "voteRequired"     BOOLEAN        NOT NULL DEFAULT false,
  "votesFor"         INTEGER        NOT NULL DEFAULT 0,
  "votesAgainst"     INTEGER        NOT NULL DEFAULT 0,
  "voteClosesAt"     TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executedAt"       TIMESTAMP(3),

  CONSTRAINT "FundExpense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FundExpense_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "ProjectFund"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FundExpense_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FundExpense_fundId_status_idx"     ON "FundExpense"("fundId", "status");
CREATE INDEX "FundExpense_fundId_createdAt_idx"  ON "FundExpense"("fundId", "createdAt");

-- ============================================================================
-- 6. FundExpenseVote (votes sur dépenses)
-- ============================================================================
CREATE TABLE "FundExpenseVote" (
  "id"           TEXT    NOT NULL,
  "expenseId"    TEXT    NOT NULL,
  "voterUserId"  TEXT    NOT NULL,
  "vote"         BOOLEAN NOT NULL,
  "comment"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FundExpenseVote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FundExpenseVote_expenseId_voterUserId_key" UNIQUE ("expenseId", "voterUserId"),
  CONSTRAINT "FundExpenseVote_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "FundExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FundExpenseVote_voterUserId_fkey"
    FOREIGN KEY ("voterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FundExpenseVote_expenseId_idx" ON "FundExpenseVote"("expenseId");

-- ============================================================================
-- 7. FundEvent (audit log inviolable, hash chaîné)
-- ============================================================================
CREATE TABLE "FundEvent" (
  "id"           TEXT    NOT NULL,
  "fundId"       TEXT    NOT NULL,
  "kind"         "FundEventKind" NOT NULL,
  "payload"      JSONB   NOT NULL,
  "actorUserId"  TEXT,
  "previousHash" TEXT,
  "hash"         TEXT    NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FundEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FundEvent_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "ProjectFund"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FundEvent_fundId_createdAt_idx" ON "FundEvent"("fundId", "createdAt");
CREATE INDEX "FundEvent_kind_createdAt_idx"   ON "FundEvent"("kind", "createdAt");

-- ============================================================================
-- FIN V200
-- ============================================================================
-- Activation post-migration :
--   UPDATE "SiteConfig" SET "projectFundsEnabled" = true WHERE id = 'default';
-- Désactivation (kill switch instantané, réversible) :
--   UPDATE "SiteConfig" SET "projectFundsEnabled" = false WHERE id = 'default';
-- ============================================================================
