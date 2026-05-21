-- V149 — Module reconnaissance de dette (RDD)
-- Tables : DebtAgreement, DebtParty, DebtSchedule, DebtAmendment, DebtEvent
-- + enums Postgres pour status, frequency, signature level, party role,
--   signature status, schedule status.

-- === Enums ===
CREATE TYPE "DebtStatus" AS ENUM (
  'DRAFT', 'PROPOSED', 'NEGOTIATING', 'SIGNED', 'ACTIVE',
  'COMPLETED', 'DEFAULTED', 'DISPUTED', 'CANCELLED'
);

CREATE TYPE "DebtFrequency" AS ENUM (
  'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'
);

CREATE TYPE "DebtSignatureLevel" AS ENUM (
  'SIMPLE', 'ADVANCED', 'NOTARIZED'
);

CREATE TYPE "DebtPartyRole" AS ENUM (
  'CREDITOR', 'DEBTOR', 'WITNESS', 'GUARANTOR'
);

CREATE TYPE "DebtSignatureStatus" AS ENUM (
  'PENDING', 'SIGNED', 'DECLINED', 'EXPIRED'
);

CREATE TYPE "DebtScheduleStatus" AS ENUM (
  'PENDING', 'PAID', 'CONFIRMED', 'LATE', 'MISSED'
);

-- === DebtAgreement ===
CREATE TABLE "DebtAgreement" (
  "id" TEXT NOT NULL,
  "publicCode" TEXT NOT NULL,
  "status" "DebtStatus" NOT NULL DEFAULT 'DRAFT',
  "creatorUserId" TEXT NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "interestRate" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "purpose" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3) NOT NULL,
  "frequency" "DebtFrequency" NOT NULL DEFAULT 'MONTHLY',
  "totalInstallments" INTEGER NOT NULL DEFAULT 1,
  "signatureLevel" "DebtSignatureLevel" NOT NULL DEFAULT 'ADVANCED',
  "jurisdictionCode" TEXT NOT NULL DEFAULT 'FR',
  "pdfUrl" TEXT,
  "pdfHash" TEXT,
  "timestampToken" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "signedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "DebtAgreement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DebtAgreement_publicCode_key" ON "DebtAgreement"("publicCode");
CREATE INDEX "DebtAgreement_creatorUserId_status_idx" ON "DebtAgreement"("creatorUserId", "status");
CREATE INDEX "DebtAgreement_status_expiresAt_idx" ON "DebtAgreement"("status", "expiresAt");
CREATE INDEX "DebtAgreement_endDate_idx" ON "DebtAgreement"("endDate");

ALTER TABLE "DebtAgreement" ADD CONSTRAINT "DebtAgreement_creatorUserId_fkey"
  FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- === DebtParty ===
CREATE TABLE "DebtParty" (
  "id" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "userId" TEXT,
  "inviteContact" TEXT,
  "displayName" TEXT NOT NULL,
  "role" "DebtPartyRole" NOT NULL,
  "signatureStatus" "DebtSignatureStatus" NOT NULL DEFAULT 'PENDING',
  "signedAt" TIMESTAMP(3),
  "signatureProof" TEXT,
  "guarantorCoverage" DECIMAL(5, 2),
  "guarantorTriggerDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DebtParty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtParty_debtId_role_idx" ON "DebtParty"("debtId", "role");
CREATE INDEX "DebtParty_userId_idx" ON "DebtParty"("userId");

ALTER TABLE "DebtParty" ADD CONSTRAINT "DebtParty_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "DebtAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtParty" ADD CONSTRAINT "DebtParty_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- === DebtSchedule ===
CREATE TABLE "DebtSchedule" (
  "id" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "expectedAmount" DECIMAL(14, 2) NOT NULL,
  "capitalAmount" DECIMAL(14, 2) NOT NULL,
  "interestAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "status" "DebtScheduleStatus" NOT NULL DEFAULT 'PENDING',
  "paidAmount" DECIMAL(14, 2),
  "paidAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "paymentMethod" TEXT,
  "paymentReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DebtSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DebtSchedule_debtId_sequenceNumber_key" ON "DebtSchedule"("debtId", "sequenceNumber");
CREATE INDEX "DebtSchedule_debtId_status_idx" ON "DebtSchedule"("debtId", "status");
CREATE INDEX "DebtSchedule_dueDate_status_idx" ON "DebtSchedule"("dueDate", "status");

ALTER TABLE "DebtSchedule" ADD CONSTRAINT "DebtSchedule_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "DebtAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === DebtAmendment ===
CREATE TABLE "DebtAmendment" (
  "id" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "proposedByUserId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "previousValue" TEXT NOT NULL,
  "newValue" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),

  CONSTRAINT "DebtAmendment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtAmendment_debtId_status_idx" ON "DebtAmendment"("debtId", "status");

ALTER TABLE "DebtAmendment" ADD CONSTRAINT "DebtAmendment_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "DebtAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === DebtEvent ===
CREATE TABLE "DebtEvent" (
  "id" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "kind" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DebtEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtEvent_debtId_createdAt_idx" ON "DebtEvent"("debtId", "createdAt");
CREATE INDEX "DebtEvent_kind_createdAt_idx" ON "DebtEvent"("kind", "createdAt");

ALTER TABLE "DebtEvent" ADD CONSTRAINT "DebtEvent_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "DebtAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
