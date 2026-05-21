-- V150.D — Nouveaux NotificationKind pour la médiation/litige RDD.

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_DISPUTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_DISPUTE_RESOLVED';
