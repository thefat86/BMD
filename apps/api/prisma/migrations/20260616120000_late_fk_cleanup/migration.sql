-- DropForeignKey
ALTER TABLE "DebtBoosterPack" DROP CONSTRAINT "DebtBoosterPack_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExpensePayer" DROP CONSTRAINT "ExpensePayer_userId_fkey";

-- DropForeignKey
ALTER TABLE "GroupInvitation" DROP CONSTRAINT "GroupInvitation_invitedById_fkey";

-- DropForeignKey
ALTER TABLE "MeetingRecord" DROP CONSTRAINT "MeetingRecord_createdById_fkey";

-- DropForeignKey
ALTER TABLE "SignatureCharge" DROP CONSTRAINT "SignatureCharge_debtId_fkey";

-- DropForeignKey
ALTER TABLE "SignatureCharge" DROP CONSTRAINT "SignatureCharge_userId_fkey";

-- DropForeignKey
ALTER TABLE "TontineTurnProposal" DROP CONSTRAINT "TontineTurnProposal_decidedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TontineTurnProposal" DROP CONSTRAINT "TontineTurnProposal_proposedByUserId_fkey";

-- DropIndex
DROP INDEX "DebtAgreement_yousignProcedureId_idx";

-- DropIndex
DROP INDEX "DebtParty_yousignSignerId_idx";

-- CreateIndex
CREATE INDEX "GroupInvitation_token_idx" ON "GroupInvitation"("token");

-- AddForeignKey
ALTER TABLE "ExpensePayer" ADD CONSTRAINT "ExpensePayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurnProposal" ADD CONSTRAINT "TontineTurnProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurnProposal" ADD CONSTRAINT "TontineTurnProposal_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtBoosterPack" ADD CONSTRAINT "DebtBoosterPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureCharge" ADD CONSTRAINT "SignatureCharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureCharge" ADD CONSTRAINT "SignatureCharge_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "DebtAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
