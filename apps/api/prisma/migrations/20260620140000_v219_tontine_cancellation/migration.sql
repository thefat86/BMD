-- V219.C — Workflow de suppression d'une tontine
--
-- Règle métier :
--   * Admin du groupe peut demander la suppression d'une tontine ACTIVE ou DRAFT
--   * Si aucune contribution CONFIRMED → suppression directe (cancellationStatus=APPROVED)
--   * Sinon → demande de vote (cancellationStatus=PROPOSED), unanimité requise pour
--     passer en CANCELLED, un seul refus suffit pour passer REJECTED.

-- 1. Enum statut de demande de suppression
CREATE TYPE "TontineCancellationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- 2. Champs cancellation* sur Tontine
ALTER TABLE "Tontine"
  ADD COLUMN "cancellationReason"       TEXT,
  ADD COLUMN "cancellationRequestedAt"  TIMESTAMP(3),
  ADD COLUMN "cancellationRequestedById" TEXT,
  ADD COLUMN "cancellationStatus"       "TontineCancellationStatus";

-- Pas de FK stricte sur cancellationRequestedById pour rester souple
-- (User peut être soft-deleted, on garde l'audit).

-- 3. Nouvelle table TontineCancellationVote
CREATE TABLE "TontineCancellationVote" (
  "id"          TEXT NOT NULL,
  "tontineId"   TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "vote"        BOOLEAN NOT NULL,
  "reason"      TEXT,
  "votedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TontineCancellationVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TontineCancellationVote_tontineId_userId_key"
  ON "TontineCancellationVote"("tontineId", "userId");

CREATE INDEX "TontineCancellationVote_tontineId_idx"
  ON "TontineCancellationVote"("tontineId");

ALTER TABLE "TontineCancellationVote"
  ADD CONSTRAINT "TontineCancellationVote_tontineId_fkey"
    FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TontineCancellationVote"
  ADD CONSTRAINT "TontineCancellationVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Nouvelles valeurs d'enum NotificationKind
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'TONTINE_CANCELLATION_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'TONTINE_CANCELLATION_APPROVED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'TONTINE_CANCELLATION_REJECTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'TONTINE_CANCELLED_DIRECT';
