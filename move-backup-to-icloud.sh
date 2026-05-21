#!/usr/bin/env bash
# BMD · Script de copie de la sauvegarde vers iCloud Drive.
# À exécuter depuis Terminal sur le Mac (PAS dans Cowork — le sandbox n'a pas
# accès à iCloud Drive).
#
# Usage :
#   cd <ton_repo_bmd-app>
#   bash move-backup-to-icloud.sh
#
# Le script :
#   1. Vérifie que le dossier BMD_backup_2026-05-08/ existe localement
#   2. Crée la destination iCloud si nécessaire
#   3. Utilise rsync (préserve permissions, atomique, idempotent)
#   4. Vérifie le nombre de fichiers copiés

set -euo pipefail

BACKUP_NAME="BMD_backup_2026-05-08"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/$BACKUP_NAME"
DEST_PARENT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/2 - Investissement/11 - Entreprenariat - FT/2 - Projets Entreprenariaux/3 - Dev WEB/8 - BMD - Back Mes Do/0 - Developpement appli/1 - Projet Initial Claude/1 - Backup Initial"
DEST="$DEST_PARENT/$BACKUP_NAME"

echo "→ Source      : $SRC"
echo "→ Destination : $DEST"
echo ""

if [ ! -d "$SRC" ]; then
  echo "✗ Source introuvable : $SRC"
  echo "  Vérifie que tu lances le script depuis le repo bmd-app/."
  exit 1
fi

mkdir -p "$DEST_PARENT"

echo "→ Copie en cours (rsync)…"
rsync -av --progress "$SRC/" "$DEST/"

COUNT_SRC=$(find "$SRC" -type f | wc -l | tr -d ' ')
COUNT_DEST=$(find "$DEST" -type f | wc -l | tr -d ' ')
SIZE=$(du -sh "$DEST" | cut -f1)

echo ""
echo "✓ Sauvegarde copiée vers iCloud"
echo "  Fichiers  : $COUNT_DEST  (source : $COUNT_SRC)"
echo "  Taille    : $SIZE"
echo "  Chemin    : $DEST"

if [ "$COUNT_DEST" -ne "$COUNT_SRC" ]; then
  echo ""
  echo "⚠ Le nombre de fichiers dans la destination ne matche pas la source."
  echo "  Vérifie manuellement (filtre invisible iCloud peut-être ?)."
  exit 2
fi
