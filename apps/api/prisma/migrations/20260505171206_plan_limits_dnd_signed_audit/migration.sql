-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "selfHash" TEXT;

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "doNotDisturb" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reminderTone" TEXT NOT NULL DEFAULT 'sympa';
