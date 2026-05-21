-- V218.H — Refonte compte rendu réunion en 5 sections structurées
-- ------------------------------------------------------------------
-- Ajout de deux colonnes optionnelles sur MeetingRecord :
--   * nextSteps      JSONB : liste des actions à prendre (Partie 3 du CR)
--                            [{ text, ownerUserId?, ownerName?, dueHint? }]
--   * detailedReport TEXT  : compte rendu narratif détaillé (Partie 4 du CR)
--                            Variante longue de l'ancien `minutes`.
--
-- Rétrocompat : les colonnes existantes `summary`, `minutes`, `transcript` sont
-- conservées et continuent à servir pour les anciennes réunions. Le service
-- copie automatiquement `minutes` → `detailedReport` côté lecture si vide.

ALTER TABLE "MeetingRecord"
  ADD COLUMN IF NOT EXISTS "nextSteps"      JSONB,
  ADD COLUMN IF NOT EXISTS "detailedReport" TEXT;
