-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRoleCode" TEXT,
ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "AdminRole" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "SettlementPaymentToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementPaymentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TontineBid" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TontineBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledNetworks" JSONB NOT NULL DEFAULT '[]',
    "allowedCategories" JSONB NOT NULL DEFAULT '[]',
    "blockedCategories" JSONB NOT NULL DEFAULT '["crypto","gambling","predatory_credit","alcohol"]',
    "maxPerUserPerDay" INTEGER NOT NULL DEFAULT 3,
    "interstitialEverySessions" INTEGER NOT NULL DEFAULT 5,
    "enabledFormats" JSONB NOT NULL DEFAULT '["banner"]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrLoginRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "device" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrLoginRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementPaymentToken_token_key" ON "SettlementPaymentToken"("token");

-- CreateIndex
CREATE INDEX "SettlementPaymentToken_token_idx" ON "SettlementPaymentToken"("token");

-- CreateIndex
CREATE INDEX "SettlementPaymentToken_settlementId_idx" ON "SettlementPaymentToken"("settlementId");

-- CreateIndex
CREATE INDEX "TontineBid_turnId_amount_idx" ON "TontineBid"("turnId", "amount");

-- CreateIndex
CREATE UNIQUE INDEX "TontineBid_turnId_bidderId_key" ON "TontineBid"("turnId", "bidderId");

-- CreateIndex
CREATE UNIQUE INDEX "QrLoginRequest_token_key" ON "QrLoginRequest"("token");

-- CreateIndex
CREATE INDEX "QrLoginRequest_token_idx" ON "QrLoginRequest"("token");

-- CreateIndex
CREATE INDEX "QrLoginRequest_expiresAt_idx" ON "QrLoginRequest"("expiresAt");

-- AddForeignKey
ALTER TABLE "SettlementPaymentToken" ADD CONSTRAINT "SettlementPaymentToken_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPaymentToken" ADD CONSTRAINT "SettlementPaymentToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineBid" ADD CONSTRAINT "TontineBid_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "TontineTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineBid" ADD CONSTRAINT "TontineBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrLoginRequest" ADD CONSTRAINT "QrLoginRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
