#!/usr/bin/env bash
# ============================================================
# BMD · dev-up — Démarre tout en 1 commande
# ============================================================
# Usage :
#   ./scripts/dev-up.sh           # démarrage normal
#   ./scripts/dev-up.sh --reset   # purge caches + reset complet
#
# Enchaîne :
#   1. Kill processus zombies sur 3000 / 4000
#   2. Démarre Docker Desktop si pas déjà actif (attend qu'il soit prêt)
#   3. Démarre Postgres via docker compose
#   4. Attend que la DB soit prête (pg_isready)
#   5. Applique les migrations Prisma + regen client
#   6. (Optionnel --reset) nettoie .next / .turbo / cache
#   7. Lance `npm run dev` (turbo : web + api en parallèle)
#
# Réutilisable : peut être relancé sans risque, idempotent.
# ============================================================

set -e

# === Configuration ===
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RESET=false
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
  esac
done

# === Couleurs pour la lisibilité ===
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

step() { echo -e "\n${BLUE}▶${NC} ${1}"; }
ok()   { echo -e "  ${GREEN}✓${NC} ${1}"; }
warn() { echo -e "  ${YELLOW}⚠${NC} ${1}"; }
fail() { echo -e "  ${RED}✗${NC} ${1}"; }

echo -e "${BLUE}╭───────────────────────────────────────────╮${NC}"
echo -e "${BLUE}│${NC}  ${GREEN}BMD · dev-up${NC} — Démarrage tout-en-un  ${BLUE}│${NC}"
echo -e "${BLUE}╰───────────────────────────────────────────╯${NC}"
echo "  Working dir: $ROOT"
[ "$RESET" = true ] && warn "Mode --reset : purge caches + reset complet"

# === 1. Kill processus zombies ===
step "1/7 · Kill processus zombies (ports 3000 / 4000)"
lsof -ti:3000,4000 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "turbo run dev" 2>/dev/null || true
sleep 1
ok "Ports libérés"

# === 2. Docker Desktop ===
step "2/7 · Docker Desktop"
if ! docker info > /dev/null 2>&1; then
  warn "Docker non démarré, lancement..."
  open -a Docker || { fail "Docker Desktop introuvable. Installe-le sur https://docker.com/products/docker-desktop"; exit 1; }
  echo -n "  ⏳ Attente Docker"
  WAIT_DOCKER=0
  while ! docker info > /dev/null 2>&1; do
    echo -n "."
    sleep 2
    WAIT_DOCKER=$((WAIT_DOCKER + 2))
    if [ "$WAIT_DOCKER" -gt 90 ]; then
      echo ""
      fail "Docker Desktop ne démarre pas après 90s. Lance-le manuellement et relance ce script."
      exit 1
    fi
  done
  echo ""
fi
ok "Docker prêt"

# === 3. Postgres ===
step "3/7 · Postgres (docker compose)"
docker compose up -d db 2>&1 | grep -v "^WARN\[" || true
ok "Container bmd-db démarré"

# === 4. Attente DB prête ===
step "4/7 · Attente que Postgres accepte les connexions"
echo -n "  ⏳ pg_isready"
WAIT_DB=0
until docker exec bmd-db pg_isready -U bmd > /dev/null 2>&1; do
  echo -n "."
  sleep 1
  WAIT_DB=$((WAIT_DB + 1))
  if [ "$WAIT_DB" -gt 30 ]; then
    echo ""
    fail "Postgres pas prête après 30s. Check logs : docker logs bmd-db"
    exit 1
  fi
done
echo ""
ok "Postgres accepte les connexions"

# === 5. Prisma : migrate deploy + generate ===
step "5/7 · Prisma · migrate deploy + generate"
cd "$ROOT/apps/api"
npx prisma migrate deploy
npx prisma generate
cd "$ROOT"
ok "Schéma BDD à jour + client Prisma régénéré"

# === 6. Reset caches (optionnel) ===
if [ "$RESET" = true ]; then
  step "6/7 · Reset caches (--reset)"
  rm -rf "$ROOT/apps/web/.next/cache" 2>/dev/null || true
  rm -rf "$ROOT/apps/web/.next/static" 2>/dev/null || true
  rm -rf "$ROOT/.turbo" 2>/dev/null || true
  rm -rf "$ROOT/apps/web/node_modules/.cache" 2>/dev/null || true
  rm -rf "$ROOT/apps/api/node_modules/.cache" 2>/dev/null || true
  ok "Caches Next.js / Turbo / node_modules purgés"
else
  step "6/7 · Reset caches"
  echo "  ⏭  skip (utilise --reset pour purger)"
fi

# === 7. Détection IP LAN pour le mobile ===
step "7/8 · Détection IP LAN (pour app mobile)"
# V146 — On détecte l'IP LAN sur macOS via ipconfig (Wi-Fi en0, Ethernet en1).
# Cette IP est persistée dans .bmd-dev-config.json à la racine, ce qui permet
# à capacitor.config.ts de la lire automatiquement à chaque `npm run mobile`.
# Plus jamais à exporter BMD_MOBILE_DEV_HOST=192.168.x.x à la main.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [ -z "$LAN_IP" ]; then
  # Fallback : scanne toutes les interfaces actives
  LAN_IP="$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)"
fi
if [ -n "$LAN_IP" ]; then
  cat > "$ROOT/.bmd-dev-config.json" <<EOF
{
  "lanIp": "$LAN_IP",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
  ok "IP LAN détectée : ${GREEN}$LAN_IP${NC} (sauvée dans .bmd-dev-config.json)"
else
  warn "Pas d'IP LAN détectée — l'app mobile utilisera 'localhost' (test uniquement sur simulateur)"
fi

# === 8. Lancement dev ===
step "8/8 · Lancement npm run dev (turbo web + api)"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Tout est prêt — lancement du dev server${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo "  → Web         : http://localhost:3000"
echo "  → API         : http://localhost:4000"
if [ -n "$LAN_IP" ]; then
  echo "  → Mobile LAN  : http://$LAN_IP:3000 (même Wi-Fi requis)"
fi
echo "  → Stop : Ctrl+C"
echo ""

exec npm run dev
