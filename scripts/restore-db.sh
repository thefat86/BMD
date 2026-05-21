#!/usr/bin/env bash
# V93.2 — Restaure un backup BDD bmd_dev créé par backup-db.sh.
#
# DEMANDE CONFIRMATION INTERACTIVE car restore est destructif (les données
# actuelles seront REMPLACÉES par celles du backup).
#
# Usage :
#   bash scripts/restore-db.sh backups/bmd_dev-2026-05-14_120000.sql.gz
#   bash scripts/restore-db.sh --latest   # le dernier backup en date
set -euo pipefail

CONTAINER="bmd-db"
DB_NAME="bmd_dev"
DB_USER="bmd"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"

if [ $# -eq 0 ]; then
  echo "❌ Usage : bash scripts/restore-db.sh <fichier.sql.gz>"
  echo "         OU bash scripts/restore-db.sh --latest"
  echo ""
  echo "Backups disponibles :"
  ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  (aucun)"
  exit 1
fi

if [ "$1" = "--latest" ]; then
  BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/${DB_NAME}-*.sql.gz 2>/dev/null | head -1 || true)"
  if [ -z "$BACKUP_FILE" ]; then
    echo "❌ Aucun backup trouvé dans $BACKUP_DIR" >&2
    exit 1
  fi
else
  BACKUP_FILE="$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Fichier introuvable : $BACKUP_FILE" >&2
  exit 1
fi

# Container check
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}\$"; then
  echo "❌ Container $CONTAINER pas en route. Démarre : docker compose up -d db" >&2
  exit 1
fi

# Confirmation interactive
SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo ""
echo "⚠️  RESTAURATION DESTRUCTIVE"
echo "    Source  : $BACKUP_FILE ($SIZE)"
echo "    Cible   : $DB_NAME (toutes les données actuelles seront ÉCRASÉES)"
echo ""
read -p "Taper EXACTEMENT 'JE CONFIRME' pour continuer : " CONFIRM
if [ "$CONFIRM" != "JE CONFIRME" ]; then
  echo "❌ Annulé."
  exit 1
fi

echo ""
echo "💾 Backup de sécurité de l'état actuel AVANT restore..."
bash "$ROOT_DIR/scripts/backup-db.sh"

echo ""
echo "🔄 Restauration en cours..."
gunzip -c "$BACKUP_FILE" \
  | docker exec -i -u postgres "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"

echo ""
echo "✅ Restauration terminée."
echo "   Pour vérifier : cd apps/api && npx tsx scripts/check-data.ts"
