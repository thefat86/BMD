-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('GROUP_CREATED', 'MEMBER_JOINED', 'MEMBER_LEFT', 'MEMBER_REMOVED', 'ROLE_CHANGED', 'EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'TONTINE_CREATED', 'TONTINE_TURN_DISTRIBUTED', 'SWAP_PROPOSED', 'SWAP_ACCEPTED', 'SWAP_REJECTED', 'GROUP_RENAMED', 'GROUP_DELETED', 'INVITE_LINK_CREATED');

-- CreateTable
CREATE TABLE "GroupInviteToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "GroupInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" "ActivityKind" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupInviteToken_token_key" ON "GroupInviteToken"("token");

-- CreateIndex
CREATE INDEX "GroupInviteToken_groupId_idx" ON "GroupInviteToken"("groupId");

-- CreateIndex
CREATE INDEX "GroupInviteToken_token_idx" ON "GroupInviteToken"("token");

-- CreateIndex
CREATE INDEX "ActivityLog_groupId_createdAt_idx" ON "ActivityLog"("groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "GroupInviteToken" ADD CONSTRAINT "GroupInviteToken_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInviteToken" ADD CONSTRAINT "GroupInviteToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
