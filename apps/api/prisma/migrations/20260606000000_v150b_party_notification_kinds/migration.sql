-- V150.B — Nouveaux NotificationKind pour témoins & garants RDD.

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_WITNESS_ADDED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DEBT_GUARANTOR_ADDED';
