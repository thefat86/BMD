-- V216.C — Ajoute le champ `location` (libre, optionnel) à Expense.
-- Permet de noter le lieu d'une dépense (ex. « Boulanger rue Lafayette »).
-- Saisi dans le drawer de création/édition, visible dans la timeline et le détail.
-- Réutilisable plus tard par un détecteur OCR de lieu sur reçu.
ALTER TABLE "Expense" ADD COLUMN "location" TEXT;
