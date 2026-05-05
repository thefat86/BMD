#!/usr/bin/env bash
# ===============================================================
# BMD · Script de setup automatique (Mac & Linux)
# ===============================================================
# Vérifie les prérequis, installe les dépendances, démarre la DB,
# applique les migrations et lance l'app.
#
# Usage : ./setup.sh
# ===============================================================

set -e  # arrête le script à la première erreur

# ----- Couleurs pour la lisibilité -----
GOLD='\033[38;5;214m'
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # no color

# ----- Helpers -----
say()  { echo -e "${GOLD}▸${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${RED}✗${NC} $1"; }
sep()  { echo -e "${GRAY}────────────────────────────────────────────────────────${NC}"; }
title() {
  echo ""
  echo -e "${BOLD}${GOLD}=== $1 ===${NC}"
  sep
}

# ----- Banner -----
clear
echo -e "${GOLD}${BOLD}"
cat << 'EOF'
   ____  __  __ ____
  | __ )|  \/  |  _ \
  |  _ \| |\/| | | | |
  | |_) | |  | | |_| |
  |____/|_|  |_|____/

  Back · Mes · Do
  Setup automatique
EOF
echo -e "${NC}"
sep

# ===============================================================
# 1. VÉRIFICATIONS DES PRÉREQUIS
# ===============================================================
title "1/5 · Vérification des prérequis"

MISSING=0

# --- Node.js ---
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node.js $NODE_VERSION détecté"
  else
    warn "Node.js $NODE_VERSION détecté, mais il faut au moins v20"
    echo "   → Mets à jour ici : https://nodejs.org"
    MISSING=1
  fi
else
  warn "Node.js n'est pas installé"
  echo "   → Télécharge la version LTS ici : https://nodejs.org"
  MISSING=1
fi

# --- npm ---
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  ok "npm $NPM_VERSION détecté"
else
  warn "npm n'est pas installé (devrait venir avec Node.js)"
  MISSING=1
fi

# --- Docker ---
if command -v docker &> /dev/null; then
  DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  ok "Docker $DOCKER_VERSION détecté"

  # Vérifier que Docker tourne
  if docker info &> /dev/null; then
    ok "Docker est en cours d'exécution"
  else
    warn "Docker est installé mais pas démarré"
    echo "   → Lance Docker Desktop (icône baleine dans la barre du haut)"
    echo "   → Puis relance ce script"
    exit 1
  fi
else
  warn "Docker n'est pas installé"
  echo "   → Télécharge Docker Desktop ici : https://www.docker.com/products/docker-desktop/"
  MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
  echo ""
  warn "Installe les outils manquants ci-dessus, puis relance ce script."
  exit 1
fi

# ===============================================================
# 2. INSTALL DES DÉPENDANCES
# ===============================================================
title "2/5 · Installation des dépendances npm"
say "Cela prend ~2 minutes la première fois…"
npm install
ok "Dépendances installées"

# ===============================================================
# 3. CONFIGURATION DE L'ENV
# ===============================================================
title "3/5 · Configuration des variables d'environnement"

if [ -f "apps/api/.env" ]; then
  ok "Fichier apps/api/.env déjà présent (conservé)"
else
  cp apps/api/.env.example apps/api/.env
  ok "Fichier apps/api/.env créé depuis le template"
fi

# ===============================================================
# 4. DATABASE
# ===============================================================
title "4/5 · Démarrage de la base Postgres (Docker)"
npm run db:up
say "Attente que la base soit prête…"
sleep 3

# Petit check de santé
RETRIES=10
until docker compose exec -T db pg_isready -U bmd &> /dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    warn "La base n'est pas prête après 30 secondes."
    echo "   → Vérifie avec : docker compose ps"
    exit 1
  fi
  sleep 3
done
ok "Postgres tourne sur le port 5433"

say "Application des migrations Prisma…"
npm run db:migrate -- --name init || npm run db:migrate
ok "Schéma de base créé"

# ===============================================================
# 5. PRÊT
# ===============================================================
title "5/5 · Tout est prêt"

echo ""
echo -e "${GREEN}${BOLD}✓ Setup terminé avec succès.${NC}"
echo ""
echo -e "${BOLD}Pour lancer l'application :${NC}"
echo ""
echo -e "   ${GOLD}npm run dev${NC}"
echo ""
echo -e "${BOLD}Puis ouvre ton navigateur sur :${NC}"
echo ""
echo -e "   ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "${GRAY}En mode dev, le code OTP s'affiche dans cette console quand tu te connectes.${NC}"
echo ""
sep
echo ""

# Demander si on lance tout de suite
read -p "$(echo -e ${GOLD}Lancer l\'application maintenant ? \(o/n\)${NC} )" -n 1 -r
echo ""
if [[ $REPLY =~ ^[Oo]$ ]]; then
  echo ""
  say "Lancement de BMD… (Ctrl+C pour arrêter)"
  echo ""
  npm run dev
fi
