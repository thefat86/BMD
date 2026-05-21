-- Sprint AC-3 · Limites régionales sur PlanPriceTier
--
-- On ajoute un champ JSON `limitsOverride` qui permet d'override les
-- quotas du plan parent par région. Exemple : 4 réunions/mois en
-- AFRICA_FR au lieu de 1 par défaut, pour le même prix régionalisé.
ALTER TABLE "PlanPriceTier"
    ADD COLUMN "limitsOverride" JSONB;
