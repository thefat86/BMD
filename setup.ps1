# ===============================================================
# BMD · Script de setup automatique (Windows · PowerShell)
# ===============================================================
# Usage : ouvre PowerShell dans le dossier bmd-app, puis :
#   .\setup.ps1
#
# Si Windows bloque l'exécution, lance d'abord (1 fois) :
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# ===============================================================

$ErrorActionPreference = "Stop"

function Say($msg)   { Write-Host "▸ $msg" -ForegroundColor Yellow }
function Ok($msg)    { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "✗ $msg" -ForegroundColor Red }
function Title($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Yellow
    Write-Host "────────────────────────────────────────────────────────" -ForegroundColor DarkGray
}

# ----- Banner -----
Clear-Host
Write-Host @"

   ____  __  __ ____
  | __ )|  \/  |  _ \
  |  _ \| |\/| | | | |
  | |_) | |  | | |_| |
  |____/|_|  |_|____/

  Back · Mes · Do
  Setup automatique
"@ -ForegroundColor Yellow
Write-Host "────────────────────────────────────────────────────────" -ForegroundColor DarkGray

# ===============================================================
# 1. VÉRIFICATIONS DES PRÉREQUIS
# ===============================================================
Title "1/5 · Vérification des prérequis"

$missing = $false

# --- Node.js ---
try {
    $nodeVersion = (node --version) -replace 'v', ''
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -ge 20) {
        Ok "Node.js $nodeVersion détecté"
    } else {
        Warn "Node.js $nodeVersion détecté, mais il faut au moins v20"
        Write-Host "   → Mets à jour ici : https://nodejs.org" -ForegroundColor DarkGray
        $missing = $true
    }
} catch {
    Warn "Node.js n'est pas installé"
    Write-Host "   → Télécharge la version LTS ici : https://nodejs.org" -ForegroundColor DarkGray
    $missing = $true
}

# --- npm ---
try {
    $npmVersion = npm --version
    Ok "npm $npmVersion détecté"
} catch {
    Warn "npm n'est pas installé (devrait venir avec Node.js)"
    $missing = $true
}

# --- Docker ---
try {
    $dockerVersion = (docker --version) -replace '.*version (\S+).*', '$1'
    Ok "Docker $dockerVersion détecté"

    docker info > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Ok "Docker est en cours d'exécution"
    } else {
        Warn "Docker est installé mais pas démarré"
        Write-Host "   → Lance Docker Desktop depuis le menu Démarrer" -ForegroundColor DarkGray
        Write-Host "   → Puis relance ce script" -ForegroundColor DarkGray
        exit 1
    }
} catch {
    Warn "Docker n'est pas installé"
    Write-Host "   → Télécharge Docker Desktop ici : https://www.docker.com/products/docker-desktop/" -ForegroundColor DarkGray
    $missing = $true
}

if ($missing) {
    Write-Host ""
    Warn "Installe les outils manquants ci-dessus, puis relance ce script."
    exit 1
}

# ===============================================================
# 2. INSTALL DES DÉPENDANCES
# ===============================================================
Title "2/5 · Installation des dépendances npm"
Say "Cela prend ~2 minutes la première fois…"
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }
Ok "Dépendances installées"

# ===============================================================
# 3. CONFIGURATION DE L'ENV
# ===============================================================
Title "3/5 · Configuration des variables d'environnement"

if (Test-Path "apps/api/.env") {
    Ok "Fichier apps/api/.env déjà présent (conservé)"
} else {
    Copy-Item "apps/api/.env.example" "apps/api/.env"
    Ok "Fichier apps/api/.env créé depuis le template"
}

# ===============================================================
# 4. DATABASE
# ===============================================================
Title "4/5 · Démarrage de la base Postgres (Docker)"
npm run db:up
if ($LASTEXITCODE -ne 0) { exit 1 }
Say "Attente que la base soit prête…"
Start-Sleep -Seconds 5

$retries = 10
do {
    docker compose exec -T db pg_isready -U bmd > $null 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    $retries--
    if ($retries -le 0) {
        Warn "La base n'est pas prête après 30 secondes."
        Write-Host "   → Vérifie avec : docker compose ps" -ForegroundColor DarkGray
        exit 1
    }
    Start-Sleep -Seconds 3
} while ($true)
Ok "Postgres tourne sur le port 5433"

Say "Application des migrations Prisma…"
npm run db:migrate
if ($LASTEXITCODE -ne 0) { exit 1 }
Ok "Schéma de base créé"

# ===============================================================
# 5. PRÊT
# ===============================================================
Title "5/5 · Tout est prêt"

Write-Host ""
Write-Host "✓ Setup terminé avec succès." -ForegroundColor Green
Write-Host ""
Write-Host "Pour lancer l'application :"
Write-Host ""
Write-Host "   npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "Puis ouvre ton navigateur sur :"
Write-Host ""
Write-Host "   http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "En mode dev, le code OTP s'affiche dans cette console quand tu te connectes." -ForegroundColor DarkGray
Write-Host ""
Write-Host "────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

$reply = Read-Host "Lancer l'application maintenant ? (o/n)"
if ($reply -match '^[Oo]') {
    Write-Host ""
    Say "Lancement de BMD… (Ctrl+C pour arrêter)"
    Write-Host ""
    npm run dev
}
