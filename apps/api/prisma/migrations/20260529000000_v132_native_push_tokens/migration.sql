-- V132 — Push notifications natifs (APNs iOS + FCM Android).
--
-- Table dédiée distincte de PushSubscription (= Web Push VAPID navigateur)
-- car APNs/FCM utilisent un token opaque, pas un endpoint URL + clés.
--
-- L'unicité est sur le token (chaque device + app a un token unique).
-- Le re-binding via @unique permet à un device partagé de changer de user
-- sans laisser de stale row.

CREATE TABLE "NativePushToken" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "platform"          TEXT NOT NULL,
  "token"             TEXT NOT NULL,
  "deviceName"        TEXT,
  "appVersion"        TEXT,
  "capacitorDeviceId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSuccessAt"     TIMESTAMP(3),

  CONSTRAINT "NativePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NativePushToken_token_key" ON "NativePushToken"("token");
CREATE INDEX "NativePushToken_userId_idx" ON "NativePushToken"("userId");
CREATE INDEX "NativePushToken_capacitorDeviceId_idx" ON "NativePushToken"("capacitorDeviceId");

ALTER TABLE "NativePushToken"
  ADD CONSTRAINT "NativePushToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
