-- V47 · Création de la table PlanBoosterPurchase (Pack IA Booster 4,99 €)

CREATE TABLE "PlanBoosterPurchase" (
  "id"                    TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "packCode"              TEXT NOT NULL DEFAULT 'IA_BOOSTER_100',
  "scansAdded"            INTEGER NOT NULL DEFAULT 100,
  "scansUsed"             INTEGER NOT NULL DEFAULT 0,
  "expiresAt"             TIMESTAMP(3) NOT NULL,
  "stripePaymentIntentId" TEXT,
  "pricePaidCents"        INTEGER NOT NULL DEFAULT 499,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanBoosterPurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanBoosterPurchase_userId_expiresAt_idx"
  ON "PlanBoosterPurchase"("userId", "expiresAt");

CREATE INDEX "PlanBoosterPurchase_expiresAt_idx"
  ON "PlanBoosterPurchase"("expiresAt");

ALTER TABLE "PlanBoosterPurchase"
  ADD CONSTRAINT "PlanBoosterPurchase_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
