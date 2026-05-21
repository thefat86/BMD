-- V144 — Pseudo (nickname) optionnel + préférence d'affichage NAME|NICKNAME.
-- L'utilisateur décide via `displayPreference` comment il apparaît auprès
-- des autres membres dans toute l'app. Fallback `displayName` si nickname vide.
ALTER TABLE "User"
  ADD COLUMN "nickname" TEXT,
  ADD COLUMN "displayPreference" TEXT NOT NULL DEFAULT 'NAME';
