-- V165 — RDD rétroactive + registre personnel + paiements déjà reçus.

ALTER TABLE "DebtAgreement"
  ADD COLUMN "isRetroactive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isPersonalLedger" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "DebtAgreement_isPersonalLedger_idx" ON "DebtAgreement"("isPersonalLedger");

CREATE TABLE "DebtSchedulePayment" (
  "id" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "paidAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "method" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DebtSchedulePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtSchedulePayment_debtId_paidAt_idx"
  ON "DebtSchedulePayment"("debtId", "paidAt");

ALTER TABLE "DebtSchedulePayment"
  ADD CONSTRAINT "DebtSchedulePayment_debt_fkey"
    FOREIGN KEY ("debtId") REFERENCES "DebtAgreement"("id") ON DELETE CASCADE;
