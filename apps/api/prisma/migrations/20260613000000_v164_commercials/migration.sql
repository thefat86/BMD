-- V164 — Module Commercial : 2 statuts (Ambassadeur + Commercial agréé)
-- Pas de système pyramidal, 1 niveau, 20% 1ère année configurable.

-- 1) Flags sur User
ALTER TABLE "User"
  ADD COLUMN "isAmbassador" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ambassadorPromotedAt" TIMESTAMP(3),
  ADD COLUMN "ambassadorPromotedById" TEXT,
  ADD COLUMN "isCommercialAgreed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commercialContractAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "commercialContractFileUrl" TEXT,
  ADD COLUMN "commercialSiret" TEXT,
  ADD COLUMN "commercialCompanyName" TEXT,
  ADD COLUMN "commercialAddress" TEXT;

CREATE INDEX "User_isAmbassador_idx" ON "User"("isAmbassador") WHERE "isAmbassador" = true;
CREATE INDEX "User_isCommercialAgreed_idx" ON "User"("isCommercialAgreed") WHERE "isCommercialAgreed" = true;

-- 2) CommercialCommissionConfig (singleton)
CREATE TABLE "CommercialCommissionConfig" (
  "id" TEXT NOT NULL,
  "rateBps" INTEGER NOT NULL DEFAULT 2000,
  "durationMonths" INTEGER NOT NULL DEFAULT 12,
  "basedOnCollected" BOOLEAN NOT NULL DEFAULT true,
  "maxMonthlyPayoutCents" INTEGER,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialCommissionConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CommercialCommissionConfig" ("id","rateBps","durationMonths","basedOnCollected","notes","updatedAt","createdAt")
VALUES (gen_random_uuid()::text, 2000, 12, true, 'Seed V164 — 20% la première année', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3) AmbassadorBenefitConfig (singleton)
CREATE TABLE "AmbassadorBenefitConfig" (
  "id" TEXT NOT NULL,
  "freePremiumMonthsOnPromo" INTEGER NOT NULL DEFAULT 12,
  "ocrCreditsMonthly" INTEGER NOT NULL DEFAULT 500,
  "voiceCreditsMonthly" INTEGER NOT NULL DEFAULT 300,
  "quarterlyGiftEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quarterlyGiftMaxCents" INTEGER NOT NULL DEFAULT 10000,
  "badgeLabel" TEXT NOT NULL DEFAULT 'Pionnier BMD',
  "earlyAccessEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmbassadorBenefitConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AmbassadorBenefitConfig" ("id","updatedAt","createdAt")
VALUES (gen_random_uuid()::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 4) ReferralBenefitConfig (singleton, 5 mécaniques A-E)
CREATE TABLE "ReferralBenefitConfig" (
  "id" TEXT NOT NULL,
  "freeMonthsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "freeMonthsPerReferral" INTEGER NOT NULL DEFAULT 1,
  "freeMonthsCap" INTEGER NOT NULL DEFAULT 12,
  "aiCreditsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "ocrCreditsPerReferralPaid" INTEGER NOT NULL DEFAULT 50,
  "voiceCreditsPerReferralPaid" INTEGER NOT NULL DEFAULT 30,
  "discountEnabled" BOOLEAN NOT NULL DEFAULT false,
  "discountPercentPerReferral" INTEGER NOT NULL DEFAULT 20,
  "pointsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "pointsPerReferralPaid" INTEGER NOT NULL DEFAULT 10,
  "pointsPerReferralFree" INTEGER NOT NULL DEFAULT 1,
  "badgesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "badgeBronzeThreshold" INTEGER NOT NULL DEFAULT 1,
  "badgeSilverThreshold" INTEGER NOT NULL DEFAULT 3,
  "badgeGoldThreshold" INTEGER NOT NULL DEFAULT 10,
  "badgePlatinumThreshold" INTEGER NOT NULL DEFAULT 30,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralBenefitConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ReferralBenefitConfig" ("id","updatedAt","createdAt")
VALUES (gen_random_uuid()::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 5) CommercialCommissionLine (audit mensuel)
CREATE TABLE "CommercialCommissionLine" (
  "id" TEXT NOT NULL,
  "commercialUserId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "billingMonth" TIMESTAMP(3) NOT NULL,
  "baseRevenueCents" INTEGER NOT NULL,
  "commissionCents" INTEGER NOT NULL,
  "rateBpsApplied" INTEGER NOT NULL,
  "payoutStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "stripeTransferId" TEXT,
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialCommissionLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialCommissionLine_unique"
  ON "CommercialCommissionLine"("commercialUserId","referredUserId","billingMonth");
CREATE INDEX "CommercialCommissionLine_commercial_month_idx"
  ON "CommercialCommissionLine"("commercialUserId","billingMonth");
CREATE INDEX "CommercialCommissionLine_status_idx" ON "CommercialCommissionLine"("payoutStatus");
CREATE INDEX "CommercialCommissionLine_month_idx" ON "CommercialCommissionLine"("billingMonth");

ALTER TABLE "CommercialCommissionLine"
  ADD CONSTRAINT "CommercialCommissionLine_commercial_fkey"
    FOREIGN KEY ("commercialUserId") REFERENCES "User"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "CommercialCommissionLine_referred_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE;

-- 6) NetworkMessage (messagerie ambassadeur/commercial → réseau)
CREATE TABLE "NetworkMessage" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL DEFAULT 'CUSTOM',
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "channels" TEXT NOT NULL DEFAULT 'BOTH',
  "emailSentAt" TIMESTAMP(3),
  "inAppSentAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NetworkMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NetworkMessage_sender_created_idx" ON "NetworkMessage"("senderId","createdAt");
CREATE INDEX "NetworkMessage_recipient_read_idx" ON "NetworkMessage"("recipientId","readAt");

ALTER TABLE "NetworkMessage"
  ADD CONSTRAINT "NetworkMessage_sender_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "NetworkMessage_recipient_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE;
