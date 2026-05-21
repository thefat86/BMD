-- V215.C1 — Caisses : fréquence de versement intelligente
-- ============================================================================
-- Ajoute au modèle ProjectFund la possibilité de définir un échéancier
-- (mensuel / hebdo / bi-mensuel / unique / custom) pour les versements
-- attendus de chaque contributeur, en plus du montant cible et de la deadline.
-- L'app calcule automatiquement le nombre de versements et le montant par
-- versement selon la deadline + la fréquence choisie.
-- ============================================================================

-- Nouvel enum FundFrequency
CREATE TYPE "FundFrequency" AS ENUM ('ONE_SHOT', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM');

-- Colonnes sur ProjectFund (ONE_SHOT par défaut pour ne pas casser l'existant)
ALTER TABLE "ProjectFund"
  ADD COLUMN "frequency" "FundFrequency" NOT NULL DEFAULT 'ONE_SHOT',
  ADD COLUMN "numberOfInstallments" INTEGER,
  ADD COLUMN "installmentAmount" DECIMAL(14, 2),
  ADD COLUMN "nextPaymentDate" TIMESTAMP(3);

-- Index pour les jobs de rappels (cron qui cherche les caisses dont la
-- prochaine échéance approche).
CREATE INDEX "ProjectFund_nextPaymentDate_idx" ON "ProjectFund"("nextPaymentDate");
