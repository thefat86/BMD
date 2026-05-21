-- V215.D2 — Nom placeholder pour les membres non-inscrits
-- ============================================================================
-- Lorsqu'un inviteur ajoute un contact qui n'est pas encore sur BMD, il peut
-- saisir un nom temporaire qui devient le nom affiché dans le groupe jusqu'à
-- ce que l'invité s'inscrive et personnalise son profil. Champ nullable —
-- les membres existants gardent leur User.displayName comme avant.
-- ============================================================================

ALTER TABLE "GroupMember"
  ADD COLUMN "displayNameOverride" VARCHAR(60);
