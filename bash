[0;34m╭───────────────────────────────────────────╮[0m
[0;34m│[0m  [0;32mBMD · dev-up[0m — Démarrage tout-en-un  [0;34m│[0m
[0;34m╰───────────────────────────────────────────╯[0m
  Working dir: /Users/fabricetsakou/Library/Mobile Documents/com~apple~CloudDocs/2 - Investissement/11 - Entreprenariat - FT/2 - Projets Entreprenariaux/3 - Dev WEB/8 - BMD - Back Mes Do/0 - Developpement appli/bmd-app

[0;34m▶[0m 1/7 · Kill processus zombies (ports 3000 / 4000)
  [0;32m✓[0m Ports libérés

[0;34m▶[0m 2/7 · Docker Desktop
  [0;32m✓[0m Docker prêt

[0;34m▶[0m 3/7 · Postgres (docker compose)
time="2026-05-20T13:38:05+02:00" level=warning msg="/Users/fabricetsakou/Library/Mobile Documents/com~apple~CloudDocs/2 - Investissement/11 - Entreprenariat - FT/2 - Projets Entreprenariaux/3 - Dev WEB/8 - BMD - Back Mes Do/0 - Developpement appli/bmd-app/docker-compose.yml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion"
 Container bmd-db Running 
  [0;32m✓[0m Container bmd-db démarré

[0;34m▶[0m 4/7 · Attente que Postgres accepte les connexions
  ⏳ pg_isready
  [0;32m✓[0m Postgres accepte les connexions

[0;34m▶[0m 5/7 · Prisma · migrate deploy + generate
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "bmd_dev", schema "public" at "localhost:5433"

64 migrations found in prisma/migrations


No pending migrations to apply.
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
