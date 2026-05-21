-- V242 — Texte libre éditable sur RDD (préambule + clauses + footer)
ALTER TABLE "DebtAgreement" ADD COLUMN "preamble" TEXT;
ALTER TABLE "DebtAgreement" ADD COLUMN "additionalClauses" TEXT;
ALTER TABLE "DebtAgreement" ADD COLUMN "footerNote" TEXT;
