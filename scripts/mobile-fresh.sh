#!/usr/bin/env bash
# ============================================================
# BMD · mobile:fresh — relance dev avec ZÉRO cache (test mobile)
# ============================================================
# Usage : npm run mobile:fresh
#
# À utiliser quand tu testes sur iPhone via ngrok et que tu
# ne vois pas tes modifs prises en compte. Ce script garantit
# une fresh version à 100 % :
#   1. Kill tous les processus dev en cours (turbo, next, fastify)
#   2. Clear le cache de build Next.js (.next/cache, .next/static)
#   3. Clear le cache turbo (.turbo/)
#   4. Clear le cache node_modules/.cache
#   5. Affiche les instructions pour vider Safari iOS / WebView
#   6. Relance `npm run dev` sur le port habituel
# ============================================================

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🧹 BMD mobile:fresh — clear all caches"
echo "Working dir: $ROOT"
echo ""

# === 1. Kill dev servers en cours ===
echo "🛑 Kill running dev servers (next, fastify, turbo)..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "turbo run dev" 2>/dev/null || true
# Laisse 1s pour que les ports se libèrent
sleep 1
echo "   done."
echo ""

# === 2. Clear Next.js build cache ===
echo "🗑  Clear Next.js build cache (.next/)..."
rm -rf apps/web/.next/cache 2>/dev/null || true
rm -rf apps/web/.next/static 2>/dev/null || true
rm -rf apps/web/.next/server 2>/dev/null || true
echo "   done."
echo ""

# === 3. Clear Turbo cache ===
echo "🗑  Clear Turbo cache (.turbo/)..."
rm -rf .turbo 2>/dev/null || true
rm -rf apps/web/.turbo 2>/dev/null || true
rm -rf apps/api/.turbo 2>/dev/null || true
echo "   done."
echo ""

# === 4. Clear node_modules cache ===
echo "🗑  Clear node_modules/.cache..."
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf apps/web/node_modules/.cache 2>/dev/null || true
rm -rf apps/api/node_modules/.cache 2>/dev/null || true
echo "   done."
echo ""

# === 5. Instructions iPhone ===
cat <<'EOF'
═════════════════════════════════════════════════════════════
📱 SUR TON IPHONE — fais ces étapes AVANT de retester :
═════════════════════════════════════════════════════════════

  Si tu testes via Safari iOS :
    1. Réglages > Safari > Effacer historique et données
    2. (ou) Mode privé : Safari > onglet → mode privé

  Si tu testes via l'app Capacitor (depuis Xcode) :
    1. Stop l'app dans Xcode (carré rouge ⏹)
    2. Sur l'iPhone : maintiens l'icône BMD > Supprimer l'app
    3. Dans Xcode : Product > Clean Build Folder (⌘⇧K)
    4. Run (▶) — l'app sera réinstallée fresh
    5. (optionnel pour être ultra-sûr)
       Réglages iPhone > Général > Stockage iPhone > BMD > Décharger l'app

  Sur ton Mac :
    1. Ferme tous les onglets BMD ouverts dans Chrome/Safari
    2. Ouvre une fenêtre privée pour tester rapidement

═════════════════════════════════════════════════════════════

EOF

# === 6. Relance dev ===
echo "🚀 Lancement de npm run dev (Ctrl+C pour stopper)..."
echo ""
exec npm run dev
