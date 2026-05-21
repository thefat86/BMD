-- V215.F2 — Tontine : autoriser plusieurs tontines par groupe au fil du temps
-- ============================================================================
-- Avant : un groupe ne pouvait avoir qu'une seule tontine (Tontine.groupId
-- était @unique). Conséquence : impossible de relancer une nouvelle tontine
-- après qu'une précédente ait été annulée ou terminée.
--
-- Après : on retire l'index unique. La règle métier « une seule tontine
-- ACTIVE ou DRAFT à la fois par groupe » est désormais appliquée côté
-- service (`createTontine` fait un findFirst filtré sur status IN (DRAFT,
-- ACTIVE) avant de créer). Les anciennes COMPLETED/CANCELLED restent en
-- BDD comme historique consultable.
-- ============================================================================

-- Drop l'unique constraint historique
DROP INDEX IF EXISTS "Tontine_groupId_key";

-- Index composite pour findFirst rapide par (groupId, status)
CREATE INDEX "Tontine_groupId_status_idx" ON "Tontine"("groupId", "status");
