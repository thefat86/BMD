-- V23 — Configuration publique du site (singleton, id="default")
-- Éditable depuis la console admin via PATCH /admin/site-config.
-- Lue par le site vitrine via GET /site-config (cache 5min).

CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "supportEmail" TEXT NOT NULL DEFAULT 'hello@backmesdo.com',
    "privacyEmail" TEXT NOT NULL DEFAULT 'privacy@backmesdo.com',
    "securityEmail" TEXT NOT NULL DEFAULT 'security@backmesdo.com',
    "whatsappNumber" TEXT DEFAULT '',
    "siteUrl" TEXT NOT NULL DEFAULT 'https://www.backmesdo.com',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- Insère la config par défaut (idempotent : ne fait rien si déjà présente)
INSERT INTO "SiteConfig" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
