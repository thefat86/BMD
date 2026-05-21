-- Sprint AC-2 · Nouvelles valeurs d'enum NotificationKind pour les réunions.
--
-- PostgreSQL impose que `ALTER TYPE ... ADD VALUE` soit exécuté EN-DEHORS
-- d'un bloc transactionnel. On isole donc ces deux statements dans leur
-- propre migration pour que la suivante (création de tables MeetingRecord)
-- puisse rester transactionnelle.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'MEETING_READY';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'MEETING_APPLIED';
