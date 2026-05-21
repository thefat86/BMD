-- Sprint AC-2 · Multi-payeurs + Réunions enregistrées (procès-verbaux audio)

--
-- Cette migration ajoute trois capacités majeures :
--   1. Multi-payeurs sur une dépense (ExpensePayer)
--   2. Audio proof + transcription sur les pièces jointes (kind, transcript)
--   3. Réunions enregistrées (MeetingRecord) avec extraction LLM

-- ========== 1. ExpensePayer (multi-payeurs) ==========
CREATE TABLE "ExpensePayer" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,4),
    "percent" DECIMAL(6,3),

    CONSTRAINT "ExpensePayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpensePayer_expenseId_userId_key" ON "ExpensePayer"("expenseId", "userId");
CREATE INDEX "ExpensePayer_userId_idx" ON "ExpensePayer"("userId");

ALTER TABLE "ExpensePayer" ADD CONSTRAINT "ExpensePayer_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpensePayer" ADD CONSTRAINT "ExpensePayer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ========== 2. ExpenseAttachment (audio proof + transcription) ==========
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'PHOTO', 'AUDIO_PROOF', 'DOCUMENT');

ALTER TABLE "ExpenseAttachment"
    ADD COLUMN "kind" "AttachmentKind" NOT NULL DEFAULT 'RECEIPT',
    ADD COLUMN "transcript" TEXT,
    ADD COLUMN "transcriptLanguage" TEXT;

CREATE INDEX "ExpenseAttachment_expenseId_kind_idx" ON "ExpenseAttachment"("expenseId", "kind");

-- ========== 3. MeetingRecord (procès-verbaux audio) ==========
CREATE TYPE "MeetingStatus" AS ENUM (
    'PENDING',
    'TRANSCRIBING',
    'EXTRACTING',
    'REVIEW',
    'APPLIED',
    'CANCELLED',
    'FAILED'
);

CREATE TABLE "MeetingRecord" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PENDING',
    "audioStorageKey" TEXT NOT NULL,
    "audioMimeType" TEXT NOT NULL,
    "audioSizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "transcript" TEXT,
    "language" TEXT,
    "extractedJson" JSONB,
    "summary" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "addonCents" INTEGER NOT NULL DEFAULT 0,
    "addonStripeId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingRecord_groupId_occurredAt_idx" ON "MeetingRecord"("groupId", "occurredAt");
CREATE INDEX "MeetingRecord_createdById_idx" ON "MeetingRecord"("createdById");
CREATE INDEX "MeetingRecord_status_idx" ON "MeetingRecord"("status");

ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ========== 4. Expense.meetingRecordId (audit trail) ==========
ALTER TABLE "Expense"
    ADD COLUMN "meetingRecordId" TEXT;

CREATE INDEX "Expense_meetingRecordId_idx" ON "Expense"("meetingRecordId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_meetingRecordId_fkey"
    FOREIGN KEY ("meetingRecordId") REFERENCES "MeetingRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
