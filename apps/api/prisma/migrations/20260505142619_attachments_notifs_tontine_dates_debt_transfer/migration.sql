-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('GROUP_INVITED', 'MEMBER_JOINED', 'EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'SETTLEMENT_PROPOSED', 'SETTLEMENT_CONFIRMED', 'TONTINE_CREATED', 'TONTINE_ACTIVATED', 'TONTINE_TURN_DUE', 'TONTINE_TURN_DISTRIBUTED', 'TONTINE_DATE_CHANGED', 'SWAP_PROPOSED', 'SWAP_ACCEPTED', 'SWAP_REJECTED', 'DEBT_TRANSFER_PROPOSED', 'DEBT_TRANSFER_ACCEPTED', 'DEBT_TRANSFER_REJECTED', 'ROLE_CHANGED', 'GROUP_DELETED', 'ATTACHMENT_ADDED');

-- CreateEnum
CREATE TYPE "DebtTransferStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "TontineTurn" ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "scheduledDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TontineTurnAck" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TontineTurnAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtTransfer" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "assumeUserId" TEXT NOT NULL,
    "creditorUserId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DebtTransferStatus" NOT NULL DEFAULT 'PROPOSED',
    "acceptedByAssumer" TIMESTAMP(3),
    "acceptedByCreditor" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "DebtTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseAttachment_expenseId_idx" ON "ExpenseAttachment"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "TontineTurnAck_turnId_userId_key" ON "TontineTurnAck"("turnId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DebtTransfer_groupId_status_idx" ON "DebtTransfer"("groupId", "status");

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurnAck" ADD CONSTRAINT "TontineTurnAck_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "TontineTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurnAck" ADD CONSTRAINT "TontineTurnAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_assumeUserId_fkey" FOREIGN KEY ("assumeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_creditorUserId_fkey" FOREIGN KEY ("creditorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
