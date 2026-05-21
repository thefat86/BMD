-- DropForeignKey
ALTER TABLE "CommercialCommissionLine" DROP CONSTRAINT "CommercialCommissionLine_commercial_fkey";

-- DropForeignKey
ALTER TABLE "CommercialCommissionLine" DROP CONSTRAINT "CommercialCommissionLine_referred_fkey";

-- DropForeignKey
ALTER TABLE "DebtSchedulePayment" DROP CONSTRAINT "DebtSchedulePayment_debt_fkey";

-- DropForeignKey
ALTER TABLE "NetworkMessage" DROP CONSTRAINT "NetworkMessage_recipient_fkey";

-- DropForeignKey
ALTER TABLE "NetworkMessage" DROP CONSTRAINT "NetworkMessage_sender_fkey";

-- CreateIndex
CREATE INDEX "Group_createdById_createdAt_idx" ON "Group"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "CommercialCommissionLine" ADD CONSTRAINT "CommercialCommissionLine_commercialUserId_fkey" FOREIGN KEY ("commercialUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialCommissionLine" ADD CONSTRAINT "CommercialCommissionLine_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkMessage" ADD CONSTRAINT "NetworkMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkMessage" ADD CONSTRAINT "NetworkMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSchedulePayment" ADD CONSTRAINT "DebtSchedulePayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "DebtAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CommercialCommissionLine_commercial_month_idx" RENAME TO "CommercialCommissionLine_commercialUserId_billingMonth_idx";

-- RenameIndex
ALTER INDEX "CommercialCommissionLine_month_idx" RENAME TO "CommercialCommissionLine_billingMonth_idx";

-- RenameIndex
ALTER INDEX "CommercialCommissionLine_status_idx" RENAME TO "CommercialCommissionLine_payoutStatus_idx";

-- RenameIndex
ALTER INDEX "CommercialCommissionLine_unique" RENAME TO "CommercialCommissionLine_commercialUserId_referredUserId_bi_key";

-- RenameIndex
ALTER INDEX "NetworkMessage_recipient_read_idx" RENAME TO "NetworkMessage_recipientId_readAt_idx";

-- RenameIndex
ALTER INDEX "NetworkMessage_sender_created_idx" RENAME TO "NetworkMessage_senderId_createdAt_idx";
