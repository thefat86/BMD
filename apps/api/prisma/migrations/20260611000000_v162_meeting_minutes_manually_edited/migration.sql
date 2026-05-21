-- V162 — Ajout du champ `minutes` (compte rendu narratif détaillé)
-- et `manuallyEditedAt` (date de la dernière édition manuelle) sur MeetingRecord.
--
-- `minutes` : Markdown léger, généré par le LLM en même temps que summary+decisions.
-- Max ~10 000 chars (limite applicative). NULLABLE (rétro-compat sur les vieilles réunions).
-- `manuallyEditedAt` : DateTime nullable. Permet d'afficher "✎ Édité manuellement le …".

ALTER TABLE "MeetingRecord"
  ADD COLUMN "minutes" TEXT,
  ADD COLUMN "manuallyEditedAt" TIMESTAMP(3);
