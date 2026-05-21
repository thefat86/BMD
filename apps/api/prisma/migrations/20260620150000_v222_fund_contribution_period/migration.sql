-- V222.C — Versements par fréquence : rattacher chaque cotisation à une période
-- ============================================================================
-- Objectif : permettre aux membres de savoir qui est à jour vs en retard sur
-- une caisse à fréquence régulière (MONTHLY, WEEKLY, etc.). Chaque contribution
-- est désormais rattachée à la période qu'elle couvre (ex : « mai 2026 »).
--
-- Calcul auto côté service à l'insertion (cf. project-funds.service.ts) :
--   - frequency = ONE_SHOT / CUSTOM  → periodStart/End restent NULL
--   - frequency = WEEKLY / BIWEEKLY / MONTHLY → calcul depuis fund.startDate
--     (fallback createdAt) + fund.frequency + paidAt (fallback createdAt).
--
-- Back-fill des contributions existantes :
--   On ne peut pas faire le calcul périodique précis en SQL pur (logique de
--   bornes calendaires). Le back-fill se fera côté service au prochain accès
--   (lazy) via le helper computePeriodFor — les nouvelles contributions sont
--   tracées, les anciennes restent NULL jusqu'à recalcul explicit (script à
--   lancer si besoin : `pnpm --filter @bmd/api ts-node scripts/backfill-fund-periods.ts`).
-- ============================================================================

ALTER TABLE "FundContribution"
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd"   TIMESTAMP(3);

-- Index combiné pour la requête "membres à jour vs en retard" : on filtre
-- par caisse + contributeur + on agrège par période.
CREATE INDEX "FundContribution_fundId_contributorUserId_periodStart_idx"
  ON "FundContribution"("fundId", "contributorUserId", "periodStart");
