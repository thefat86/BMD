#!/usr/bin/env bash
# V93.1 — Initialise la BDD `bmd_test` à côté de `bmd_dev` dans le même
# container Postgres Docker. Idempotent : peut être relancé sans risque.
#
# Pourquoi : le setup vitest API truncate la BDD pointée par DATABASE_URL.
# Sans BDD séparée, ça wipe les données de dev. Cette BDD bmd_test est
# isolée et peut être truncate à volonté par les tests.
#
# Usage : bash scripts/init-test-db.sh
set -euo pipefail

CONTAINER="bmd-db"
DB_NAME="bmd_test"
DB_USER="bmd"

echo "🔍 Vérification du container Docker $CONTAINER..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}\$"; then
  echo "❌ Le container $CONTAINER ne tourne pas. Démarre-le d'abord :"
  echo "   docker compose up -d db"
  exit 1
fi

echo "🔍 Vérification existence de la BDD $DB_NAME..."
if docker exec -u postgres "$CONTAINER" psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "✓  BDD $DB_NAME existe déjà — skip création."
else
  echo "🆕 Création BDD $DB_NAME..."
  docker exec -u postgres "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";"
  echo "✅ BDD $DB_NAME créée."
fi

echo ""
echo "🔍 Applique le schéma Prisma (migrations) sur $DB_NAME..."
cd "$(dirname "$0")/../apps/api"

# Utilise DATABASE_URL temporaire pointé sur bmd_test pour prisma migrate deploy
DATABASE_URL="postgres://${DB_USER}:bmd@localhost:5433/${DB_NAME}" \
  npx prisma migrate deploy

echo ""
echo "✅ BDD test prête à l'emploi."
echo ""
echo "Pour lancer les tests vitest API en isolation :"
echo "  cd apps/api"
echo "  DATABASE_URL=\"postgres://bmd:bmd@localhost:5433/bmd_test\" npx vitest run"
echo ""
echo "Ou via le wrapper sûr (configure .env.test) :"
echo "  npm run test:api:safe"
