-- V136.D — Ajoute location + meetingTime + notes au TontineTurn.
-- Le bénéficiaire (ou un admin) peut renseigner où ET quand aura lieu la
-- réunion (adresse physique, lien Zoom, heure de RDV) et des notes libres
-- pour le tour. Ces infos sont visibles à tout le groupe pour s'organiser.

ALTER TABLE "TontineTurn"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "meetingTime" TEXT,
  ADD COLUMN "notes" TEXT;
