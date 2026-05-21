CREATE TABLE "WebVitalsMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rating" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "locale" TEXT,
    "connectionType" TEXT,
    "userAgent" TEXT,
    "navigationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebVitalsMetric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebVitalsMetric_name_createdAt_idx" ON "WebVitalsMetric"("name", "createdAt");
CREATE INDEX "WebVitalsMetric_page_name_createdAt_idx" ON "WebVitalsMetric"("page", "name", "createdAt");
CREATE INDEX "WebVitalsMetric_userId_createdAt_idx" ON "WebVitalsMetric"("userId", "createdAt");
ALTER TABLE "WebVitalsMetric" ADD CONSTRAINT "WebVitalsMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
