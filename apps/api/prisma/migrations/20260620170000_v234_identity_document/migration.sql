-- V234 — Identité officielle scannée par IA (pour RDD, contrats Yousign, etc.)
-- Cf. apps/api/prisma/schema.prisma — modèle IdentityDocument.
-- 1 identité par user (unique userId), cascade delete depuis User pour RGPD.

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "IdentityDocumentType" AS ENUM (
  'ID_CARD',
  'PASSPORT',
  'RESIDENCE',
  'DRIVER',
  'OTHER'
);

CREATE TYPE "IdentityVerificationStatus" AS ENUM (
  'PENDING',
  'VERIFIED',
  'REJECTED'
);

-- ============================================================
-- TABLE IdentityDocument
-- ============================================================

CREATE TABLE "IdentityDocument" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "type"           "IdentityDocumentType" NOT NULL,

  "firstName"      TEXT,
  "lastName"       TEXT,
  "birthDate"      TIMESTAMP(3),
  "birthPlace"     TEXT,
  "documentNumber" TEXT,
  "issueDate"      TIMESTAMP(3),
  "expiryDate"     TIMESTAMP(3),
  "issuingCountry" TEXT,

  "fileUrl"        TEXT,
  "fileType"       TEXT,
  "fileSizeBytes"  INTEGER,

  "status"         "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "scannedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt"     TIMESTAMP(3),
  "aiConfidence"   DOUBLE PRECISION,

  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdentityDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityDocument_userId_key" ON "IdentityDocument"("userId");
CREATE INDEX "IdentityDocument_userId_idx" ON "IdentityDocument"("userId");
CREATE INDEX "IdentityDocument_status_idx" ON "IdentityDocument"("status");

ALTER TABLE "IdentityDocument"
  ADD CONSTRAINT "IdentityDocument_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
