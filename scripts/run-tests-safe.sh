#!/usr/bin/env bash
# V93.3 — Wrapper sûr pour `npm test`.
#
# Garanties offertes :
#   1. Backup automatique de bmd_dev AVANT d'exécuter quoi que ce soit
#   2. Vérifie que la BDD test (bmd_test) existe ; sinon propose l'init
#   3. Lance vitest avec DATABASE_URL=bmd_test (isolation des tests)
#   4. Exécute aussi les autres `turbo run test` (web i18n, etc.)
#
# Si le user veut vraiment lancer les tests sur la BDD dev (déconseillé),
# il peut faire `npm run test:unsafe` (bypass).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="bmd-db"
DB_USER="bmd"
TEST_DB="bmd_test"
DEV_DB="bmd_dev"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  BMD · Test runner sécurisé                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"

# === 1. Container check
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}\$"; then
  echo ""
  echo "❌ Container $CONTAINER pas en route."
  echo "   Démarre-le : npm run db:up"
  exit 1
fi

# === 2. Backup auto de bmd_dev AVANT toute opération
echo ""
echo "💾 Backup automatique de $DEV_DB (sécurité avant tests)..."
bash "$ROOT_DIR/scripts/backup-db.sh" --auto
echo "✓  Backup OK (sauvegardé dans backups/)"

# === 3. Vérifie que bmd_test existe ; sinon l'initialise
echo ""
echo "🔍 Vérification BDD test $TEST_DB..."
if ! docker exec -u postgres "$CONTAINER" psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$TEST_DB"; then
  echo "⚠️  BDD $TEST_DB n'existe pas encore."
  read -p "    Veux-tu la créer maintenant ? [O/n] " yn
  case "$yn" in
    [Nn]* )
      echo ""
      echo "❌ Tests annulés. Pour initialiser plus tard :"
      echo "   npm run db:init-test"
      exit 1
      ;;
    * )
      echo ""
      echo "🆕 Création + migrations sur $TEST_DB..."
      bash "$ROOT_DIR/scripts/init-test-db.sh"
      ;;
  esac
else
  echo "✓  BDD $TEST_DB existe."
fi

# === 4. Lance les tests avec DATABASE_URL=bmd_test
echo ""
echo "🧪 Lancement des tests avec DATABASE_URL pointé sur $TEST_DB..."
echo "    (la BDD $DEV_DB n'est PAS touchée — isolation garantie)"
echo ""

cd "$ROOT_DIR"
DATABASE_URL="postgres://${DB_USER}:bmd@localhost:5433/${TEST_DB}" \
  turbo run test

echo ""
echo "✅ Tests terminés. BDD dev intacte (backup dans backups/)."
