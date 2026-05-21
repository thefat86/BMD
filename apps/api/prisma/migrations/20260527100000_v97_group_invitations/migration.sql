-- V97 — Invitations de groupe avec cycle de consentement explicite
-- (PENDING → ACCEPTED / DECLINED / EXPIRED / REVOKED).
--
-- Différent de GroupInviteToken (lien magique partage) et
-- InvitationOutreach (relances auto). Ici on modélise l'invitation
-- nominative qu'un admin envoie à un contact précis : l'invité doit
-- explicitement accepter (et est créé comme GroupMember à ce moment-là)
-- ou refuser avec un motif obligatoire.

-- 1. Enum InvitationStatus
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- 2. Table GroupInvitation
CREATE TABLE "GroupInvitation" (
  "id"             TEXT NOT NULL,
  "groupId"        TEXT NOT NULL,
  "invitedById"    TEXT NOT NULL,
  "inviteeUserId"  TEXT,
  "contactType"    "ContactType" NOT NULL,
  "contactValue"   TEXT NOT NULL,
  "displayName"    TEXT,
  "token"          TEXT NOT NULL,
  "status"         "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "declineReason"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "respondedAt"    TIMESTAMP(3),

  CONSTRAINT "GroupInvitation_pkey" PRIMARY KEY ("id")
);

-- 3. Unique : 1 seule invitation par couple (groupe, contact)
CREATE UNIQUE INDEX "GroupInvitation_groupId_contactType_contactValue_key"
  ON "GroupInvitation"("groupId", "contactType", "contactValue");

-- 4. Unique : token URL-safe (lookup public)
CREATE UNIQUE INDEX "GroupInvitation_token_key"
  ON "GroupInvitation"("token");

-- 5. Index secondaires (lookup par invité + scheduler EXPIRED)
CREATE INDEX "GroupInvitation_inviteeUserId_idx"
  ON "GroupInvitation"("inviteeUserId");

CREATE INDEX "GroupInvitation_status_expiresAt_idx"
  ON "GroupInvitation"("status", "expiresAt");

-- 6. Foreign keys
ALTER TABLE "GroupInvitation"
  ADD CONSTRAINT "GroupInvitation_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupInvitation"
  ADD CONSTRAINT "GroupInvitation_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "GroupInvitation"
  ADD CONSTRAINT "GroupInvitation_inviteeUserId_fkey"
  FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Extension de l'enum ActivityKind pour tracer les invitations dans le
--    journal d'audit du groupe (séparé de MEMBER_JOINED qui ne se produit
--    plus qu'après acceptation explicite).
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'MEMBER_INVITED';
