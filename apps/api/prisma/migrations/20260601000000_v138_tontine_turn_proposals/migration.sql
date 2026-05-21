-- V138 — Workflow de modification d'un tour de tontine avec validation.
--
-- Quand l'admin du groupe veut changer la date/lieu/heure d'un tour dont
-- il n'est PAS le bénéficiaire, il doit créer une `TontineTurnProposal`
-- en statut PENDING. Le bénéficiaire la valide (ACCEPTED) ou la refuse
-- (REJECTED). Tant qu'elle est PENDING, les valeurs proposées n'écrasent
-- PAS celles du tour réel, et les autres membres ne voient rien.
--
-- Une fois acceptée, les valeurs sont appliquées sur TontineTurn et tous
-- les membres reçoivent push + email.
--
-- Si admin == bénéficiaire → pas de proposition, modif directe (logique
-- côté service).

-- CreateEnum
CREATE TYPE "TontineTurnProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TontineTurnProposal" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "status" "TontineTurnProposalStatus" NOT NULL DEFAULT 'PENDING',
    "proposedScheduledDate" TIMESTAMP(3),
    "proposedLocation" TEXT,
    "proposedMeetingTime" TEXT,
    "proposedNotes" TEXT,
    "message" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TontineTurnProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — pour récupérer rapidement la proposition PENDING d'un turn
CREATE INDEX "TontineTurnProposal_turnId_status_idx" ON "TontineTurnProposal"("turnId", "status");

-- CreateIndex — pour afficher l'historique des propositions d'un admin
CREATE INDEX "TontineTurnProposal_proposedByUserId_idx" ON "TontineTurnProposal"("proposedByUserId");

-- AddForeignKey
ALTER TABLE "TontineTurnProposal" ADD CONSTRAINT "TontineTurnProposal_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "TontineTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurnProposal" ADD CONSTRAINT "TontineTurnProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineTurnProposal" ADD CONSTRAINT "TontineTurnProposal_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
