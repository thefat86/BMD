# Sécurité base de données — Procédures BMD

Document écrit suite à l'incident V93 (mai 2026) : la BDD `bmd_dev` a été wipée par les tests vitest qui tournaient sur la même BDD que le développement.

## Architecture des BDDs locales

Le container Docker `bmd-db` (Postgres 16-alpine, port 5433) héberge deux bases distinctes :

| BDD          | Usage                          | Effacée par tests ? |
|--------------|--------------------------------|---------------------|
| `bmd_dev`    | Développement local quotidien  | **NON** (protégée)  |
| `bmd_test`   | Tests vitest API isolés        | **OUI** (avant chaque test file) |

## Commandes sûres

### Lancer les tests sans risque

```bash
npm test
```

Ce script (`scripts/run-tests-safe.sh`) :
1. Backup automatique de `bmd_dev` dans `backups/` AVANT les tests
2. Crée `bmd_test` si elle n'existe pas (avec migrations appliquées)
3. Lance vitest avec `DATABASE_URL=…bmd_test` (isolation)
4. La BDD `bmd_dev` n'est jamais touchée

### Backup manuel

```bash
npm run db:backup
# → écrit backups/bmd_dev-YYYY-MM-DD_HHMMSS.sql.gz
# Garde les 14 derniers, purge les autres
```

### Restauration

```bash
# Liste les backups disponibles
ls -lh backups/

# Restaure le dernier en date (demande confirmation)
npm run db:restore -- --latest

# Restaure un backup spécifique
npm run db:restore backups/bmd_dev-2026-05-14_120000.sql.gz
```

La restauration **demande de taper « JE CONFIRME »** et fait un backup de l'état actuel AVANT de restaurer (sécurité en cascade).

### Initialiser la BDD test (premier setup)

```bash
npm run db:init-test
```

Crée `bmd_test` dans le container et applique toutes les migrations.

## Commandes dangereuses

⚠️ Les commandes suivantes effacent des données. À utiliser avec extrême prudence.

```bash
# Reset complet de bmd_dev (DROP + migrations from scratch)
npm run db:reset

# Bypass de la garde anti-truncate vitest (tests sur bmd_dev !)
npm run test:unsafe
# OU :
VITEST_ALLOW_NON_TEST_DB=1 cd apps/api && npx vitest run
```

## Gardes de sécurité en place

### 1. Garde vitest setup (`apps/api/tests/setup.ts`)

Au top du module, `assertSafeTestDb()` lit `DATABASE_URL` et **throw une erreur fatale** si le nom de la BDD ne contient pas `test`. Bypass possible avec `VITEST_ALLOW_NON_TEST_DB=1`.

```
[vitest-setup] REFUSE DE TRUNCATE : DATABASE_URL pointe sur « bmd_dev » qui ne
ressemble pas à une BDD de test (nom doit contenir "test").
```

### 2. Wrapper `npm test` (`scripts/run-tests-safe.sh`)

Force `DATABASE_URL=…bmd_test` pour le run vitest, peu importe ce qui est dans `apps/api/.env`. Backup de `bmd_dev` avant exécution.

### 3. Confirmation interactive sur `restore-db.sh`

Demande à l'utilisateur de taper exactement « JE CONFIRME » et fait un backup de sécurité AVANT de restaurer.

## Procédure de récupération en cas d'incident

Si tu remarques qu'une BDD a été wipée :

```bash
# 1. STOP : ne lance plus aucune commande de test
pkill -f "vitest"
pkill -f "playwright"

# 2. Vérifie l'état actuel
cd apps/api
npx tsx scripts/check-data.ts

# 3. Liste les backups dispo
ls -lh ../../backups/

# 4. Restaure le dernier backup avant l'incident
cd ../..
npm run db:restore -- --latest
# Puis confirme avec "JE CONFIRME"

# 5. Si pas de backup utilisable, seed les comptes critiques
cd apps/api
npx tsx scripts/seed-fabrice-accounts.ts
```

## Recommandations long terme

1. **Backup nightly automatique** : ajouter une entrée launchd (macOS) ou cron qui exécute `npm run db:backup` chaque nuit à 2 h.
2. **Backup vers iCloud** : `backups/` dans iCloud Drive synchronise automatiquement vers tes autres devices (mais hors git).
3. **Audit pre-deploy** : avant tout déploiement prod, vérifier que la garde vitest est toujours en place via grep `assertSafeTestDb`.
4. **Migration prod backup** : créer un job CI/CD qui dump la prod avant chaque `prisma migrate deploy`.

## Historique des incidents

| Date       | Cause                              | Impact                          | Fix          |
|------------|------------------------------------|---------------------------------|--------------|
| 2026-05-05 | `docker compose down -v` accidentel | Volume Docker effacé             | Recréation manuelle |
| 2026-05-14 | `npm test` × 2 (vitest TRUNCATE)  | `bmd_dev` wipée 2 fois          | V93 (this doc) |

**Action après V93** : tester `npm test` une fois, vérifier que `bmd_dev` est intacte. Si tout marche, plus jamais ce genre d'incident.
