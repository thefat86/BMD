-- V150.A — Nouveaux NotificationKind pour le workflow négociation RDD.
-- Ils sont émis lors des transitions DRAFT → PROPOSED → ACCEPTED/REJECTED.

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_PROPOSED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_ACCEPTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_REJECTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_COUNTER_PROPOSED';
