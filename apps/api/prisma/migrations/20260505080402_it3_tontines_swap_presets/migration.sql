-- CreateEnum
CREATE TYPE "TontineFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TontineStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BeneficiaryOrderMode" AS ENUM ('RANDOM', 'MANUAL', 'AUCTION');

-- CreateEnum
CREATE TYPE "TurnStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DISTRIBUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'PAID', 'CONFIRMED', 'MISSED');

-- CreateEnum
CREATE TYPE "DebtSwapStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tontine" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contributionAmount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "frequency" "TontineFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "TontineStatus" NOT NULL DEFAULT 'DRAFT',
    "orderMode" "BeneficiaryOrderMode" NOT NULL DEFAULT 'MANUAL',
    "centralizedPot" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Tontine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TontineTurn" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "beneficiaryUserId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "distributedAt" TIMESTAMP(3),
    "status" "TurnStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "TontineTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TontineContribution" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "contributorUserId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,

    CONSTRAINT "TontineContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtSwap" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "status" "DebtSwapStatus" NOT NULL DEFAULT 'PROPOSED',
    "description" TEXT,
    "totalSavedAmount" DECIMAL(14,4) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DebtSwap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtSwapParticipant" (
    "id" TEXT NOT NULL,
    "swapId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "DebtSwapParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtSwapLeg" (
    "id" TEXT NOT NULL,
    "swapId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "DebtSwapLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitPreset" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "splitMode" "SplitMode" NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tontine_groupId_key" ON "Tontine"("groupId");

-- CreateIndex
CREATE INDEX "TontineTurn_beneficiaryUserId_idx" ON "TontineTurn"("beneficiaryUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TontineTurn_tontineId_turnNumber_key" ON "TontineTurn"("tontineId", "turnNumber");

-- CreateIndex
CREATE INDEX "TontineContribution_contributorUserId_idx" ON "TontineContribution"("contributorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TontineContribution_turnId_contributorUserId_key" ON "TontineContribution"("turnId", "contributorUserId");

-- CreateIndex
CREATE INDEX "DebtSwap_groupId_status_idx" ON "DebtSwap"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DebtSwapParticipant_swapId_userId_key" ON "DebtSwapParticipant"("swapId", "userId");

-- CreateIndex
CREATE INDEX "SplitPreset_groupId_idx" ON "SplitPreset"("groupId");

-- AddForeignKey
ALTER TABLE "Tontine" ADD CONSTRAINT "Tontine_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurn" ADD CONSTRAINT "TontineTurn_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurn" ADD CONSTRAINT "TontineTurn_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineContribution" ADD CONSTRAINT "TontineContribution_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "TontineTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineContribution" ADD CONSTRAINT "TontineContribution_contributorUserId_fkey" FOREIGN KEY ("contributorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSwap" ADD CONSTRAINT "DebtSwap_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSwapParticipant" ADD CONSTRAINT "DebtSwapParticipant_swapId_fkey" FOREIGN KEY ("swapId") REFERENCES "DebtSwap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSwapParticipant" ADD CONSTRAINT "DebtSwapParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSwapLeg" ADD CONSTRAINT "DebtSwapLeg_swapId_fkey" FOREIGN KEY ("swapId") REFERENCES "DebtSwap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPreset" ADD CONSTRAINT "SplitPreset_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
