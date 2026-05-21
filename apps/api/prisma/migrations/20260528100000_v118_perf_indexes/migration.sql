-- V118.A — Indexes Postgres pour accélérer les queries hot du dashboard.
--
-- 1. Settlement(groupId, status) :
--    `balance.service` filtre systématiquement par (groupId, status) pour
--    calculer les règlements en cours d'un groupe. Avant cet index, le
--    planner Postgres faisait scan-then-filter sur la table entière.
--
-- 2. Expense(groupId, paidById) :
--    `listGroupsForUser` (cf. groups.service.ts) filtre par
--    (groupId, paidById = userId) pour agréger "ce que j'ai avancé".
--    Sur des tables >10k expenses, scan-then-filter au lieu d'index seek.
--
-- IF NOT EXISTS pour rester idempotent (utile en dev / replay).

CREATE INDEX IF NOT EXISTS "Settlement_groupId_status_idx"
  ON "Settlement" ("groupId", "status");

CREATE INDEX IF NOT EXISTS "Expense_groupId_paidById_idx"
  ON "Expense" ("groupId", "paidById");
