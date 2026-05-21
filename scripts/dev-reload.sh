#!/usr/bin/env bash
# ============================================================
# BMD · dev-reload — Reset complet après une mise à jour de code
# ============================================================
# Usage :
#   ./scripts/dev-reload.sh
#
# À utiliser quand :
#   - tu viens de modifier le schema Prisma (nouvelle migration)
#   - tu as installé une nouvelle dépendance npm
#   - tu as fait un git pull et veux repartir clean
#   - le dev server est "coincé" et ne reflète pas tes modifs
#
# Enchaîne :
#   1. Kill TOUT (web, api, turbo, tsx)
#   2. npm install (au cas où package.json a changé)
#   3. Relance via dev-up.sh --reset (purge caches + DB ready + migrate)
# ============================================================

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╭───────────────────────────────────────────╮${NC}"
echo -e "${BLUE}│${NC}  ${GREEN}BMD · dev-reload${NC} — Reset complet      ${BLUE}│${NC}"
echo -e "${BLUE}╰───────────────────────────────────────────╯${NC}"

# === 1. Kill agressif ===
echo -e "\n${BLUE}▶${NC} Kill tous les processus dev en cours"
lsof -ti:3000,4000,8081 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "turbo run dev" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
sleep 1
echo -e "  ${GREEN}✓${NC} Processus arrêtés"

# === 2. npm install ===
echo -e "\n${BLUE}▶${NC} npm install (au cas où des deps ont changé)"
npm install --silent
echo -e "  ${GREEN}✓${NC} Dépendances synchronisées"

# === 3. Délègue à dev-up --reset ===
echo -e "\n${BLUE}▶${NC} Délègue à dev-up.sh --reset pour la suite"
echo ""
exec "$ROOT/scripts/dev-up.sh" --reset
