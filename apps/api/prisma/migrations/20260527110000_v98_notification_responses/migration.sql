-- V98 — Notifications interactives (réponses + accusé de réception)
--
-- Permet à chaque destinataire de réagir/répondre à une notif (ACK,
-- emoji ou texte court). Une notif retour est envoyée à l'émetteur,
-- qui peut l'« acknowledger » pour fermer la boucle.

-- 1. Nouvelle valeur dans NotificationKind
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'NOTIF_RESPONSE';

-- 2. Colonnes additionnelles sur Notification
ALTER TABLE "Notification"
  ADD COLUMN "senderUserId"   TEXT,
  ADD COLUMN "respondedAt"    TIMESTAMP(3),
  ADD COLUMN "responseKind"   TEXT,
  ADD COLUMN "responseEmoji"  TEXT,
  ADD COLUMN "responseText"   TEXT,
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

-- 3. Foreign key vers le sender (SetNull si user supprimé pour ne pas
--    perdre les notifs orphelines).
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Index utile pour récupérer rapidement les notifs émises par un user
--    (utilisé dans la page "mes notifs envoyées" + tracking réponses).
CREATE INDEX "Notification_senderUserId_createdAt_idx"
  ON "Notification"("senderUserId", "createdAt");
