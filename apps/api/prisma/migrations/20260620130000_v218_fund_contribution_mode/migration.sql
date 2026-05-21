-- V218.G — Mode de contribution caisse projet (libre vs imposé)
-- =============================================================================
-- Permet au créateur d'une caisse de choisir si chaque versement doit être
-- d'un montant strictement égal à `contributionAmount` (FIXED) ou si chaque
-- membre cotise librement (FREE, défaut historique).
--
-- Rétro-compat : toutes les caisses existantes basculent en FREE sans
-- changer leur comportement (montant libre comme avant).

-- 1. Nouveau enum FundContributionMode
CREATE TYPE "FundContributionMode" AS ENUM ('FREE', 'FIXED');

-- 2. Champs sur ProjectFund
ALTER TABLE "ProjectFund"
  ADD COLUMN "contributionMode" "FundContributionMode" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "contributionAmount" DECIMAL(14, 2);
