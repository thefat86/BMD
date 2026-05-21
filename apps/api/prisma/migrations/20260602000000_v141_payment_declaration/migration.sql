-- V141 — Refonte transversale du flow de déclaration de paiement.
--
-- 1. Ajoute Group.paymentConfirmationRequired : permet à un admin de
--    désactiver l'étape de confirmation receveur pour son groupe (le
--    paiement déclaré passe alors directement CONFIRMED). Default true.
--
-- 2. Étend Settlement avec les champs déjà présents sur TontineContribution :
--    paymentMethod, paymentReference, paidAt. Cela uniformise le flow entre
--    tontine et settlement (même UI, même service, même payload).

ALTER TABLE "Group"
  ADD COLUMN "paymentConfirmationRequired" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Settlement"
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3);
