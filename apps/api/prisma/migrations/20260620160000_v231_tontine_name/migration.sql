-- V231 — Ajoute un champ `name` libre à la tontine pour que l'utilisateur
-- puisse nommer ses tontines (« Tontine Été 2026 », « Tontine famille », …).
-- La devise (`currency`) existe déjà sur le modèle Tontine, donc cette
-- migration ajoute uniquement `name`. Nullable car les tontines historiques
-- n'avaient pas de nom — l'UI affichera un fallback type « Tontine du
-- {{date}} » quand ce champ est null.
ALTER TABLE "Tontine" ADD COLUMN "name" TEXT;
