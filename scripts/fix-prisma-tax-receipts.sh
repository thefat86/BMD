#!/usr/bin/env bash
# ------------------------------------------------------------------
# V131.B — Fix bug 500 sur POST /groups et PATCH /groups/:id
#
# Symptômes (logs API) :
#   PrismaClientValidationError: Unknown argument `taxReceiptsEnabled`
#
# Cause :
#   - Le champ Group.taxReceiptsEnabled a été ajouté au schema Prisma (V111)
#   - La migration `20260528000000_v111_group_tax_receipts` existe
#   - MAIS le client Prisma n'a pas été régénéré localement
#   - ET la migration n'a probablement pas été appliquée à la DB dev
#
# Ce script remet les deux d'aplomb. Idempotent — peut être relancé.
# ------------------------------------------------------------------
set -euo pipefail

# Aller à la racine du repo (le script est dans bmd-app/scripts/)
cd "$(dirname "$0")/.."

echo "==> 1. État actuel des migrations Prisma"
cd apps/api
npx prisma migrate status || true

echo ""
echo "==> 2. Appliquer les migrations manquantes (dont V111)"
npx prisma migrate deploy

echo ""
echo "==> 3. Régénérer le client Prisma (avec taxReceiptsEnabled)"
npx prisma generate

echo ""
echo "==> 4. Vérifier que le champ est bien dans le client généré"
if grep -q "taxReceiptsEnabled" ../../node_modules/.prisma/client/schema.prisma; then
  echo "    OK — taxReceiptsEnabled trouvé dans le client généré."
else
  echo "    ERREUR — champ toujours absent. Lancer manuellement :"
  echo "      cd apps/api && npx prisma generate"
  exit 1
fi

echo ""
echo "==> Terminé. Redémarre l'API (Ctrl-C puis npm run dev) pour recharger Prisma."
