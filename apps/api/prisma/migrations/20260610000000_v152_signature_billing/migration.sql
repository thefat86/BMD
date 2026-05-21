-- V152.A — Facturation des signatures électroniques RDD.
-- Deux nouvelles tables : DebtBoosterPack (packs prépayés) + SignatureCharge
-- (paiement à l'unité). Aligné sur le pattern PlanBoosterPurchase existant.

CREATE TABLE IF NOT EXISTS "DebtBoosterPack" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL,
  "packCode"              TEXT NOT NULL,
  "advancedIncluded"      INTEGER NOT NULL DEFAULT 0,
  "notarizedIncluded"     INTEGER NOT NULL DEFAULT 0,
  "advancedUsed"          INTEGER NOT NULL DEFAULT 0,
  "notarizedUsed"         INTEGER NOT NULL DEFAULT 0,
  "expiresAt"             TIMESTAMP(3) NOT NULL,
  "stripePaymentIntentId" TEXT,
  "pricePaidCents"        INTEGER NOT NULL,
  "currency"              TEXT NOT NULL DEFAULT 'EUR',
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DebtBoosterPack_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DebtBoosterPack_userId_expiresAt_idx"
  ON "DebtBoosterPack" ("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "DebtBoosterPack_expiresAt_idx"
  ON "DebtBoosterPack" ("expiresAt");
CREATE INDEX IF NOT EXISTS "DebtBoosterPack_packCode_idx"
  ON "DebtBoosterPack" ("packCode");

CREATE TABLE IF NOT EXISTS "SignatureCharge" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL,
  "debtId"                TEXT NOT NULL,
  "level"                 TEXT NOT NULL,
  "pricePaidCents"        INTEGER NOT NULL,
  "currency"              TEXT NOT NULL DEFAULT 'EUR',
  "countryCode"           TEXT,
  "stripePaymentIntentId" TEXT,
  "status"                TEXT NOT NULL DEFAULT 'PENDING',
  "fromPackId"            TEXT,
  "paidAt"                TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureCharge_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "SignatureCharge_debtId_fkey" FOREIGN KEY ("debtId")
    REFERENCES "DebtAgreement" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SignatureCharge_userId_createdAt_idx"
  ON "SignatureCharge" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SignatureCharge_debtId_idx"
  ON "SignatureCharge" ("debtId");
CREATE INDEX IF NOT EXISTS "SignatureCharge_status_idx"
  ON "SignatureCharge" ("status");
CREATE INDEX IF NOT EXISTS "SignatureCharge_stripePaymentIntentId_idx"
  ON "SignatureCharge" ("stripePaymentIntentId");
