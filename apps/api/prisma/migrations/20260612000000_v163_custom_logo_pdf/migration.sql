-- V163 — Logo personnalisé sur les PDF générés (RDD, comptes rendus, reçus,
-- récaps). Feature payante 9,99 €/mois récurrent par groupe.
--
-- 1) Ajout de 3 colonnes sur Group pour stocker l'état du logo perso.
-- 2) Nouvelle table CustomLogoPricing pour le prix paramétrable depuis l'admin
--    (singleton par devise, défaut seedé à 999 c€ = 9,99 €).

ALTER TABLE "Group"
  ADD COLUMN "customLogoUrl" TEXT,
  ADD COLUMN "customLogoActiveUntil" TIMESTAMP(3),
  ADD COLUMN "customLogoStripeSubId" TEXT;

CREATE TABLE "CustomLogoPricing" (
  "id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "monthlyPriceCents" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomLogoPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomLogoPricing_currency_key" ON "CustomLogoPricing"("currency");
CREATE INDEX "CustomLogoPricing_enabled_idx" ON "CustomLogoPricing"("enabled");

-- Seed initial : 9,99 €/mois (decision V163 Fabrice)
INSERT INTO "CustomLogoPricing" ("id", "currency", "monthlyPriceCents", "enabled", "notes", "updatedAt", "createdAt")
VALUES (
  gen_random_uuid()::text,
  'EUR',
  999,
  true,
  'Seed V163 — Lancement logo personnalisé PDF',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
