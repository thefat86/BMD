#!/usr/bin/env bash
# V93.2 — Backup pg_dump compressé de la BDD bmd_dev.
#
# Sauvegarde dans bmd-app/backups/bmd_dev-YYYY-MM-DD_HHMM.sql.gz.
# Garde les 14 derniers backups. Le dossier `backups/` est dans .gitignore.
#
# Usage :
#   bash scripts/backup-db.sh             # backup ad-hoc
#   bash scripts/backup-db.sh --auto      # mode silencieux (cron-friendly)
#
# Restauration :
#   bash scripts/restore-db.sh <fichier>
set -euo pipefail

CONTAINER="bmd-db"
DB_NAME="bmd_dev"
DB_USER="bmd"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
QUIET=0

if [ "${1:-}" = "--auto" ]; then QUIET=1; fi

mkdir -p "$BACKUP_DIR"

# Vérifie que le container tourne
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}\$"; then
  echo "❌ Container $CONTAINER pas en route. Démarre : docker compose up -d db" >&2
  exit 1
fi

OUTFILE="$BACKUP_DIR/${DB_NAME}-${TIMESTAMP}.sql.gz"
[ $QUIET -eq 0 ] && echo "💾 Backup $DB_NAME → $OUTFILE..."

# pg_dump → gzip dans le container, puis docker cp
docker exec -u postgres "$CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner \
  | gzip -9 > "$OUTFILE"

SIZE="$(du -h "$OUTFILE" | cut -f1)"
[ $QUIET -eq 0 ] && echo "✅ Backup terminé ($SIZE) : $OUTFILE"

# Garbage collection : ne garde que les 14 derniers backups (chronologiques)
KEEP=14
TO_DELETE=$(ls -1t "$BACKUP_DIR"/${DB_NAME}-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) || true)
if [ -n "$TO_DELETE" ]; then
  echo "🗑  Purge des backups au-delà des $KEEP derniers..."
  echo "$TO_DELETE" | xargs rm -f
fi

[ $QUIET -eq 0 ] && {
  TOTAL="$(ls -1 "$BACKUP_DIR"/${DB_NAME}-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
  echo "📁 Total backups en stock : $TOTAL"
}
