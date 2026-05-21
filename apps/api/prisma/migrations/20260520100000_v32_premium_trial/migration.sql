-- Sprint AB · Trial 14 jours Premium (one-shot par user)
--
-- Ajoute 3 colonnes nullable sur User :
--  - trialPlanCode  : code du plan offert pendant le trial (ex: "PREMIUM")
--  - trialEndsAt    : date d'expiration (auto-revert vers planCode après)
--  - trialUsedAt    : date à laquelle le user a démarré son trial (anti-fraude :
--                     un user ne peut activer un trial qu'une seule fois)

ALTER TABLE "User" ADD COLUMN "trialPlanCode" TEXT;
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trialUsedAt" TIMESTAMP(3);
