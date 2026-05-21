-- CreateTable
CREATE TABLE "PartnerApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerWebhook" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "lastDeliveryAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTheme" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#e8a33d',
    "accentColor" TEXT NOT NULL DEFAULT '#b54732',
    "logoUrl" TEXT,
    "preferredMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupCategoryRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultSplitMode" TEXT NOT NULL DEFAULT 'EQUAL',
    "defaultParticipantUserIds" JSONB NOT NULL DEFAULT '[]',
    "defaultPaidByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationOutreach" (
    "id" TEXT NOT NULL,
    "inviteTokenId" TEXT NOT NULL,
    "contactType" "ContactType" NOT NULL,
    "contactValue" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'sympa',
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvitationOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRateHistory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "previousRate" DECIMAL(18,8) NOT NULL,
    "newRate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApiToken_tokenHash_key" ON "PartnerApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PartnerApiToken_createdById_idx" ON "PartnerApiToken"("createdById");

-- CreateIndex
CREATE INDEX "PartnerApiToken_revokedAt_idx" ON "PartnerApiToken"("revokedAt");

-- CreateIndex
CREATE INDEX "PartnerWebhook_tokenId_idx" ON "PartnerWebhook"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupTheme_groupId_key" ON "GroupTheme"("groupId");

-- CreateIndex
CREATE INDEX "GroupCategoryRule_groupId_idx" ON "GroupCategoryRule"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupCategoryRule_groupId_category_key" ON "GroupCategoryRule"("groupId", "category");

-- CreateIndex
CREATE INDEX "InvitationOutreach_inviteTokenId_idx" ON "InvitationOutreach"("inviteTokenId");

-- CreateIndex
CREATE INDEX "InvitationOutreach_contactValue_idx" ON "InvitationOutreach"("contactValue");

-- CreateIndex
CREATE INDEX "InvitationOutreach_status_lastSentAt_idx" ON "InvitationOutreach"("status", "lastSentAt");

-- CreateIndex
CREATE INDEX "FxRateHistory_code_changedAt_idx" ON "FxRateHistory"("code", "changedAt");

-- AddForeignKey
ALTER TABLE "PartnerWebhook" ADD CONSTRAINT "PartnerWebhook_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "PartnerApiToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTheme" ADD CONSTRAINT "GroupTheme_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupCategoryRule" ADD CONSTRAINT "GroupCategoryRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationOutreach" ADD CONSTRAINT "InvitationOutreach_inviteTokenId_fkey" FOREIGN KEY ("inviteTokenId") REFERENCES "GroupInviteToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRateHistory" ADD CONSTRAINT "FxRateHistory_code_fkey" FOREIGN KEY ("code") REFERENCES "FxRate"("code") ON DELETE CASCADE ON UPDATE CASCADE;
