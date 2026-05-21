-- AlterTable
ALTER TABLE "User" ADD COLUMN     "contactsLastChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SimSwapEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "contactValueAttempted" TEXT,
    "contactTypeAttempted" TEXT,
    "userAgent" TEXT,
    "country" TEXT NOT NULL DEFAULT '??',
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "verifiedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimSwapEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimSwapEvent_userId_createdAt_idx" ON "SimSwapEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SimSwapEvent_status_createdAt_idx" ON "SimSwapEvent"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SimSwapEvent" ADD CONSTRAINT "SimSwapEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
