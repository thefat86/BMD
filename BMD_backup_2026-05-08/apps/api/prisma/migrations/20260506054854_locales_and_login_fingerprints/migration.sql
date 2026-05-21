-- CreateTable
CREATE TABLE "Locale" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "direction" TEXT NOT NULL DEFAULT 'ltr',
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locale_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "LoginFingerprint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '??',
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginFingerprint_userId_lastSeenAt_idx" ON "LoginFingerprint"("userId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoginFingerprint_userId_browser_os_country_key" ON "LoginFingerprint"("userId", "browser", "os", "country");

-- AddForeignKey
ALTER TABLE "LoginFingerprint" ADD CONSTRAINT "LoginFingerprint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
