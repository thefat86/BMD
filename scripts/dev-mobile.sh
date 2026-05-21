#!/usr/bin/env bash
# ============================================================
# BMD · dev-mobile — Synchronise iOS + Android sans friction (V146)
# ============================================================
# Usage :
#   ./scripts/dev-mobile.sh           # sync iOS + Android en DEV (défaut) + IDE
#   ./scripts/dev-mobile.sh --ios     # iOS uniquement
#   ./scripts/dev-mobile.sh --android # Android uniquement
#   ./scripts/dev-mobile.sh --sync    # sync sans ouvrir les IDE
#   ./scripts/dev-mobile.sh --prod    # build PROD (app.backmesdo.com)
#   ./scripts/dev-mobile.sh --staging # build STAGING
#   ./scripts/dev-mobile.sh --ngrok URL # tunnel ngrok (4G ou autre Wi-Fi)
#
# V146 — Tout est automatique :
#  - Défaut DEV (plus jamais d'erreur DNS "app.backmesdo.com" introuvable)
#  - IP LAN auto-détectée à chaque run (via dev-up.sh ou ipconfig à la volée)
#  - Si l'IP a changé (changement de Wi-Fi), elle est mise à jour
#  - L'app native charge ton dev server LAN sans config manuelle
#
# Mode prod réservé aux builds destinés aux stores (--prod explicite).
# ============================================================

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# === Flags ===
TARGET="both"     # both | ios | android
OPEN_IDE=true
MODE="dev"        # dev | staging | production
NGROK_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ios)     TARGET="ios" ;;
    --android) TARGET="android" ;;
    --sync)    OPEN_IDE=false ;;
    --prod|--production) MODE="production" ;;
    --staging) MODE="staging" ;;
    --ngrok)
      MODE="dev"
      NGROK_URL="$2"
      shift
      ;;
  esac
  shift
done

# === Couleurs ===
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${BLUE}▶${NC} ${1}"; }
ok()   { echo -e "  ${GREEN}✓${NC} ${1}"; }
warn() { echo -e "  ${YELLOW}⚠${NC} ${1}"; }
fail() { echo -e "  ${RED}✗${NC} ${1}"; }

echo -e "${BLUE}╭───────────────────────────────────────────╮${NC}"
echo -e "${BLUE}│${NC}  ${GREEN}BMD · dev-mobile${NC} — Sync Capacitor     ${BLUE}│${NC}"
echo -e "${BLUE}╰───────────────────────────────────────────╯${NC}"
echo "  Cible : $TARGET · Mode : $MODE · Ouvre IDE : $OPEN_IDE"

# === 1. Détection / mise à jour IP LAN ===
step "1/4 · Configuration host (auto-détection)"
if [ "$MODE" = "dev" ]; then
  if [ -n "$NGROK_URL" ]; then
    # Mode ngrok explicite : on enlève le https:// si fourni
    HOST="${NGROK_URL#https://}"
    HOST="${HOST#http://}"
    HOST="${HOST%/*}"
    cat > "$ROOT/.bmd-dev-config.json" <<EOF
{
  "lanIp": "$HOST",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    ok "Mode ngrok : ${GREEN}$HOST${NC}"
  else
    # Auto-détection IP LAN macOS
    LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [ -z "$LAN_IP" ]; then
      LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
    fi
    if [ -z "$LAN_IP" ]; then
      LAN_IP="$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)"
    fi
    if [ -n "$LAN_IP" ]; then
      cat > "$ROOT/.bmd-dev-config.json" <<EOF
{
  "lanIp": "$LAN_IP",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
      ok "IP LAN détectée : ${GREEN}$LAN_IP${NC}"
      HOST="$LAN_IP"
    else
      warn "Pas d'IP LAN trouvée — fallback localhost (simulateur uniquement)"
      HOST="localhost"
    fi
  fi
  # Vérification que le dev server tourne
  if curl -sf "http://${HOST}:3000" > /dev/null 2>&1 || curl -sf "https://${HOST}" > /dev/null 2>&1; then
    ok "Dev server joignable sur $HOST"
  else
    warn "Dev server pas joignable sur $HOST:3000 — lance 'npm run up' dans un autre terminal"
  fi
elif [ "$MODE" = "production" ]; then
  warn "Mode PRODUCTION : l'app pointera sur https://app.backmesdo.com"
  warn "Assure-toi que ce domaine est bien déployé (sinon erreur DNS au lancement)"
elif [ "$MODE" = "staging" ]; then
  ok "Mode STAGING : staging.backmesdo.com"
fi

# === 2. Build web (uniquement en prod/staging — en dev on charge en remote) ===
step "2/4 · Vérification build web"
if [ "$MODE" = "dev" ]; then
  ok "Mode dev : pas de build statique (chargement remote depuis dev server)"
else
  if [ ! -d "$ROOT/apps/web/.next" ]; then
    warn "Pas de build Next.js trouvé — lancement"
    echo "  ⏳ next build (1-2 min)..."
    cd "$ROOT/apps/web"
    npm run build
    cd "$ROOT"
  fi
  ok "Build web disponible"
fi

# === 3. Capacitor sync (avec les bonnes env vars) ===
step "3/4 · Capacitor sync"
cd "$ROOT/apps/mobile"
export BMD_MOBILE_ENV="$MODE"
if [ "$TARGET" = "both" ] || [ "$TARGET" = "ios" ]; then
  echo "  ⏳ cap sync ios..."
  npx cap sync ios
  ok "iOS synchronisé"
fi
if [ "$TARGET" = "both" ] || [ "$TARGET" = "android" ]; then
  echo "  ⏳ cap sync android..."
  npx cap sync android
  ok "Android synchronisé"
fi
cd "$ROOT"

# === 4. Ouvre les IDE ===
if [ "$OPEN_IDE" = true ]; then
  step "4/4 · Ouverture IDE natif"
  cd "$ROOT/apps/mobile"
  if [ "$TARGET" = "both" ] || [ "$TARGET" = "ios" ]; then
    echo "  → Ouverture Xcode (iOS)..."
    npx cap open ios &
    ok "Xcode lancé"
  fi
  if [ "$TARGET" = "both" ] || [ "$TARGET" = "android" ]; then
    echo "  → Ouverture Android Studio..."
    npx cap open android &
    ok "Android Studio lancé"
  fi
  cd "$ROOT"
else
  step "4/4 · Ouverture IDE"
  echo "  ⏭  skip (mode --sync)"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Mobile prêt · mode $MODE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
if [ "$MODE" = "dev" ] && [ -n "$HOST" ]; then
  echo "  📱 L'app chargera : http://$HOST:3000/login"
  echo "  ⚠️  Ton téléphone doit être sur le MÊME Wi-Fi que ton Mac"
fi
echo "  → Xcode : ▶ Run sur simulateur ou device"
echo "  → Android Studio : ▶ Run sur émulateur ou device"
echo "  → Dev server doit tourner en parallèle : ${GREEN}npm run up${NC}"
echo ""
