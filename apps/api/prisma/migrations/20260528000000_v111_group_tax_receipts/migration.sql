-- V111 — Gating de la fonctionnalité « reçu fiscal » au groupe.
-- Ajoute Group.taxReceiptsEnabled : seuls les groupes type association/à but
-- non lucratif activeront cette option. Tous les groupes existants partent
-- en `false` (le flag est admin-only, opt-in explicite via le wizard ou les
-- réglages du groupe).
ALTER TABLE "Group"
  ADD COLUMN "taxReceiptsEnabled" BOOLEAN NOT NULL DEFAULT false;
