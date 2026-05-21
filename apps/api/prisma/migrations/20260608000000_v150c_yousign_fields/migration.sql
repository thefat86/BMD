-- V150.C — Signature électronique qualifiée Yousign (eIDAS).
-- Champs préparés mais inactifs tant que YOUSIGN_API_KEY n'est pas configuré.

ALTER TABLE "DebtAgreement"
  ADD COLUMN IF NOT EXISTS "yousignProcedureId"  TEXT,
  ADD COLUMN IF NOT EXISTS "yousignStatus"       TEXT,
  ADD COLUMN IF NOT EXISTS "yousignLastEventAt"  TIMESTAMP(3);

ALTER TABLE "DebtParty"
  ADD COLUMN IF NOT EXISTS "yousignSignerId" TEXT;

-- Index pour retrouver rapidement un contrat depuis un webhook Yousign.
CREATE INDEX IF NOT EXISTS "DebtAgreement_yousignProcedureId_idx"
  ON "DebtAgreement" ("yousignProcedureId");
CREATE INDEX IF NOT EXISTS "DebtParty_yousignSignerId_idx"
  ON "DebtParty" ("yousignSignerId");
