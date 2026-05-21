-- V42 · Anti-doublon scan facture
--
-- Ajoute le champ `receiptHash` sur Expense + un index composite (groupId,
-- receiptHash) pour permettre la détection rapide d'une facture déjà scannée
-- dans le même groupe.
--
-- Stratégie :
--  - Le frontend (image-preprocessor.ts) calcule un SHA-256 du fichier
--    OPTIMISÉ (post compression/resize) et l'envoie avec le scan.
--  - Au moment de créer la dépense via scan, le backend stocke ce hash.
--  - Pour les futurs scans dans le même groupe, on lookup d'abord par
--    hash exact (collision impossible → match certain), puis fallback
--    sur match flou (merchant + amount + date ± 2 jours).
--
-- Le hash est NULL pour toutes les dépenses créées avant cette migration
-- ou par saisie manuelle / voix. Aucun backfill nécessaire.

ALTER TABLE "Expense" ADD COLUMN "receiptHash" TEXT;

CREATE INDEX "Expense_groupId_receiptHash_idx" ON "Expense"("groupId", "receiptHash");
