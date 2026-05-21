-- V151 — Tarification signatures eIDAS par niveau × pays.

CREATE TABLE IF NOT EXISTS "SignatureLevelPricing" (
  "id"           TEXT PRIMARY KEY,
  "level"        TEXT NOT NULL,
  "countryCode"  TEXT NOT NULL,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "costCents"    INTEGER NOT NULL,
  "priceCents"   INTEGER NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'EUR',
  "yousignLevel" TEXT NOT NULL DEFAULT 'advanced_electronic_signature',
  "notes"        TEXT,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "SignatureLevelPricing_level_countryCode_key"
  ON "SignatureLevelPricing" ("level", "countryCode");

CREATE INDEX IF NOT EXISTS "SignatureLevelPricing_level_enabled_idx"
  ON "SignatureLevelPricing" ("level", "enabled");

CREATE INDEX IF NOT EXISTS "SignatureLevelPricing_countryCode_idx"
  ON "SignatureLevelPricing" ("countryCode");

-- Seed initial : tarifs par défaut globaux ("*") + ajustements pays clés BMD.
-- Format : centimes EUR.
-- Coûts indicatifs Yousign (à valider sur leur page tarification) :
--   SES : ~100c / AES : ~300c / QES : ~1500c
-- Marges visées : 50-70% selon niveau et zone géographique.

INSERT INTO "SignatureLevelPricing"
  ("id", "level", "countryCode", "enabled", "costCents", "priceCents", "currency", "yousignLevel", "notes", "updatedAt")
VALUES
  -- === Tarifs globaux ("*") - défaut si pas de surcharge pays ===
  (gen_random_uuid(), 'SIMPLE',    '*', true,  100,  250,  'EUR', 'electronic_signature',                 'Tarif par défaut SES (signature simple)', NOW()),
  (gen_random_uuid(), 'ADVANCED',  '*', true,  300,  750,  'EUR', 'advanced_electronic_signature',        'Tarif par défaut AES (équivalent manuscrite)', NOW()),
  (gen_random_uuid(), 'NOTARIZED', '*', true, 1500, 3900,  'EUR', 'qualified_electronic_signature',       'Tarif par défaut QES (force exécutoire UE)', NOW()),

  -- === France (FR) - tarif standard zone Euro ===
  (gen_random_uuid(), 'SIMPLE',    'FR', true,  100,  250,  'EUR', 'electronic_signature',           'France · SES', NOW()),
  (gen_random_uuid(), 'ADVANCED',  'FR', true,  300,  750,  'EUR', 'advanced_electronic_signature',  'France · AES recommandé', NOW()),
  (gen_random_uuid(), 'NOTARIZED', 'FR', true, 1500, 3900,  'EUR', 'qualified_electronic_signature', 'France · QES contrats > 50K€', NOW()),

  -- === Luxembourg (LU) - pouvoir d'achat plus élevé, +20% ===
  (gen_random_uuid(), 'SIMPLE',    'LU', true,  100,  300,  'EUR', 'electronic_signature',           'Luxembourg · SES (premium)', NOW()),
  (gen_random_uuid(), 'ADVANCED',  'LU', true,  300,  900,  'EUR', 'advanced_electronic_signature',  'Luxembourg · AES (premium)', NOW()),
  (gen_random_uuid(), 'NOTARIZED', 'LU', true, 1500, 4500,  'EUR', 'qualified_electronic_signature', 'Luxembourg · QES (premium)', NOW()),

  -- === Côte d'Ivoire (CI) - accessibilité diaspora, -30% ===
  (gen_random_uuid(), 'SIMPLE',    'CI', true,  100,  175,  'EUR', 'electronic_signature',           'Côte d''Ivoire · SES (accessible)', NOW()),
  (gen_random_uuid(), 'ADVANCED',  'CI', true,  300,  525,  'EUR', 'advanced_electronic_signature',  'Côte d''Ivoire · AES (accessible)', NOW()),
  (gen_random_uuid(), 'NOTARIZED', 'CI', false, 1500, 2700, 'EUR', 'qualified_electronic_signature', 'Côte d''Ivoire · QES désactivée (coûteuse, peu de demande)', NOW()),

  -- === Cameroun (CM) - accessibilité diaspora, -30% ===
  (gen_random_uuid(), 'SIMPLE',    'CM', true,  100,  175,  'EUR', 'electronic_signature',           'Cameroun · SES (accessible)', NOW()),
  (gen_random_uuid(), 'ADVANCED',  'CM', true,  300,  525,  'EUR', 'advanced_electronic_signature',  'Cameroun · AES (accessible)', NOW()),
  (gen_random_uuid(), 'NOTARIZED', 'CM', false, 1500, 2700, 'EUR', 'qualified_electronic_signature', 'Cameroun · QES désactivée par défaut', NOW())
ON CONFLICT ("level", "countryCode") DO NOTHING;
