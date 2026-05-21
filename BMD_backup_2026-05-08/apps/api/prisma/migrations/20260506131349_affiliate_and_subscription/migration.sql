/*
  Warnings:

  - A unique constraint covering the columns `[affiliateCode]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "affiliateCode" TEXT,
ADD COLUMN     "affiliateKycStatus" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralCreditCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "planCodeReference" TEXT NOT NULL DEFAULT 'FREE',
    "expiresAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "readOnlyAt" TIMESTAMP(3),
    "lockedGroupIds" JSONB NOT NULL DEFAULT '[]',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "lastNotifiedKind" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDowngradePolicy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "graceDays" INTEGER NOT NULL DEFAULT 14,
    "warnDays" INTEGER NOT NULL DEFAULT 7,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyBeforeDays" JSONB NOT NULL DEFAULT '[7, 3, 1]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanDowngradePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "l1Percent" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "l1DurationMonths" INTEGER NOT NULL DEFAULT -1,
    "l2Percent" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "l2DurationMonths" INTEGER NOT NULL DEFAULT 12,
    "l3Percent" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "l3DurationMonths" INTEGER NOT NULL DEFAULT 6,
    "holdDays" INTEGER NOT NULL DEFAULT 30,
    "minPayoutCents" INTEGER NOT NULL DEFAULT 2000,
    "maxL1ReferralsPerMonth" INTEGER NOT NULL DEFAULT 50,
    "milestoneBonuses" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "sourceAmountCents" INTEGER NOT NULL,
    "payoutCurrency" TEXT NOT NULL,
    "payoutAmountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourcePaymentRef" TEXT,
    "payoutRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "childUserId" TEXT,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "payoutCurrency" TEXT NOT NULL,
    "payoutAmountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREDITED',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionState_userId_key" ON "SubscriptionState"("userId");

-- CreateIndex
CREATE INDEX "SubscriptionState_status_idx" ON "SubscriptionState"("status");

-- CreateIndex
CREATE INDEX "SubscriptionState_readOnlyAt_idx" ON "SubscriptionState"("readOnlyAt");

-- CreateIndex
CREATE INDEX "AffiliateCommission_beneficiaryId_status_idx" ON "AffiliateCommission"("beneficiaryId", "status");

-- CreateIndex
CREATE INDEX "AffiliateCommission_payerId_idx" ON "AffiliateCommission"("payerId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_status_createdAt_idx" ON "AffiliateCommission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralReward_parentUserId_status_idx" ON "ReferralReward"("parentUserId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_kind_createdAt_idx" ON "ReferralReward"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_affiliateCode_key" ON "User"("affiliateCode");

-- AddForeignKey
ALTER TABLE "SubscriptionState" ADD CONSTRAINT "SubscriptionState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_childUserId_fkey" FOREIGN KEY ("childUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
