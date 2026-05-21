-- V212 — Mode test temporaire pour ajout direct de membres sans approbation.
-- À retirer une fois la phase de test interne terminée. Les 2 flags sont OFF
-- par défaut donc zéro impact en prod si on oublie d'activer.

-- Flag global qui autorise l'endpoint POST /groups/:id/members/test-add.
ALTER TABLE "SiteConfig"
  ADD COLUMN "testModeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Marqueur sur User pour identifier les comptes créés via test-add. Permet
-- de filtrer/purger en bloc plus tard quand on retirera le mode test.
ALTER TABLE "User"
  ADD COLUMN "isTestUser" BOOLEAN NOT NULL DEFAULT false;
