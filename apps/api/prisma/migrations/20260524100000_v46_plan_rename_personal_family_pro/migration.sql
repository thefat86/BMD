-- V46 · Bascule des planCode vers la nouvelle nomenclature
--
-- Mapping :
--   PREMIUM    → PERSONAL   (3,99 €/mois ou 39 €/an, ~même limites)
--   COMMUNITY  → FAMILY     (5,99 €/mois ou 69 €/an, +linkedAccounts=5)
--   PARISH     → PRO        (16,99 €/mois ou 199 €/an, IA premium prioritaire)
--   EVENT      → PERSONAL   (les anciens one-shot deviennent perso, ils
--                            peuvent acheter Pack Booster 4,99 € s'ils
--                            ont besoin du quota événementiel)
--   trialPlanCode idem.
--
-- Idempotent : si déjà migré, ne fait rien.
-- Les anciens codes restent dans la table Plan (avec _hidden=true) pour
-- ne pas casser les contraintes FK existantes sur Subscription/etc.

UPDATE "User"
SET "planCode" = 'PERSONAL'
WHERE "planCode" IN ('PREMIUM', 'EVENT');

UPDATE "User"
SET "planCode" = 'FAMILY'
WHERE "planCode" = 'COMMUNITY';

UPDATE "User"
SET "planCode" = 'PRO'
WHERE "planCode" = 'PARISH';

-- Trials en cours
UPDATE "User"
SET "trialPlanCode" = 'PERSONAL'
WHERE "trialPlanCode" IN ('PREMIUM', 'EVENT');

UPDATE "User"
SET "trialPlanCode" = 'FAMILY'
WHERE "trialPlanCode" = 'COMMUNITY';

UPDATE "User"
SET "trialPlanCode" = 'PRO'
WHERE "trialPlanCode" = 'PARISH';

-- SubscriptionState : `planCodeReference` (plan à restaurer après paiement)
UPDATE "SubscriptionState"
SET "planCodeReference" = 'PERSONAL'
WHERE "planCodeReference" IN ('PREMIUM', 'EVENT');

UPDATE "SubscriptionState"
SET "planCodeReference" = 'FAMILY'
WHERE "planCodeReference" = 'COMMUNITY';

UPDATE "SubscriptionState"
SET "planCodeReference" = 'PRO'
WHERE "planCodeReference" = 'PARISH';

-- Log de l'opération pour audit
-- (Aucun cron à faire, c'est un one-shot)
