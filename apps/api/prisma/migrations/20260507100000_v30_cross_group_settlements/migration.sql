-- V30 · Cross-group settlements (règlement multi-groupe en 1 tap)
--
-- Ajoute un modèle parent `CrossGroupSettlement` qui regroupe N child
-- settlements existants. Confirmation atomique : quand le parent passe
-- à CONFIRMED, tous les enfants suivent en 1 transaction Prisma.
--
-- Migration purement additive — aucun settlement existant n'est touché
-- (`crossGroupId` est nullable et reste null pour les anciens records).

-- 1. Nouvelle table CrossGroupSettlement
CREATE TABLE "CrossGroupSettlement" (
  "id"                 TEXT NOT NULL,
  "fromUserId"         TEXT NOT NULL,
  "toUserId"           TEXT NOT NULL,
  "totalAmount"        DECIMAL(14, 4) NOT NULL,
  "currency"           TEXT NOT NULL,
  "status"             "SettlementStatus" NOT NULL DEFAULT 'PROPOSED',
  "proposedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedByPayerAt" TIMESTAMP(3),
  "confirmedByPayeeAt" TIMESTAMP(3),
  "memo"               TEXT,

  CONSTRAINT "CrossGroupSettlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrossGroupSettlement_fromUserId_idx" ON "CrossGroupSettlement"("fromUserId");
CREATE INDEX "CrossGroupSettlement_toUserId_idx" ON "CrossGroupSettlement"("toUserId");
CREATE INDEX "CrossGroupSettlement_status_idx" ON "CrossGroupSettlement"("status");

ALTER TABLE "CrossGroupSettlement"
  ADD CONSTRAINT "CrossGroupSettlement_fromUserId_fkey"
  FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CrossGroupSettlement"
  ADD CONSTRAINT "CrossGroupSettlement_toUserId_fkey"
  FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Champ optionnel sur Settlement
ALTER TABLE "Settlement" ADD COLUMN "crossGroupId" TEXT;

CREATE INDEX "Settlement_crossGroupId_idx" ON "Settlement"("crossGroupId");

ALTER TABLE "Settlement"
  ADD CONSTRAINT "Settlement_crossGroupId_fkey"
  FOREIGN KEY ("crossGroupId") REFERENCES "CrossGroupSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
