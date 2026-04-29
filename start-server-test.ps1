# ==========================================
# ClinikAuto - Serveur de Test Local (PowerShell)
# Script pour lancer le serveur et accéder au site
# ==========================================

Write-Host "`n╔════════════════════════════════════════════════════════════════╗"
Write-Host "║          ClinikAuto - Démarrage du serveur de test             ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝`n"

# Vérifier que Node.js est installé
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js détecté: $nodeVersion`n"
} catch {
    Write-Host "❌ ERREUR: Node.js n'est pas installé ou pas dans le PATH`n" -ForegroundColor Red
    Write-Host "Veuillez installer Node.js depuis: https://nodejs.org/`n"
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

# Arrêter tout processus sur le port 3000
Write-Host "[1/4] Arrêt des processus sur le port 3000..."
$pids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($pids) {
    $pids | ForEach-Object { 
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Host "Processus arrêté (PID: $_)"
    }
}
Start-Sleep -Milliseconds 500

# Vérifier que package.json existe
if (-not (Test-Path "package.json")) {
    Write-Host "❌ ERREUR: package.json introuvable" -ForegroundColor Red
    Write-Host "Le script doit être lancé depuis le dossier racine du projet ClinikAuto`n"
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

Write-Host "✓ Dossier du projet trouvé`n"

# Vérifier que node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "[2/4] Installation des dépendances (npm install)..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
        Read-Host "Appuyez sur Entrée pour quitter"
        exit 1
    }
    Write-Host "✓ Dépendances installées`n"
} else {
    Write-Host "[2/4] Dépendances déjà installées"
    Write-Host "✓ node_modules trouvé`n"
}

# Démarrer le serveur
Write-Host "[3/4] Démarrage du serveur sur le port 3000..."
Write-Host ""
Write-Host "⏳ Attente de la réponse du serveur...`n"

# Lancer le serveur en arrière-plan
$serverProcess = Start-Process -FilePath "node" -ArgumentList "backend/server.js" -PassThru

# Attendre que le serveur soit prêt
Start-Sleep -Seconds 3

Write-Host "[4/4] Ouverture du navigateur...`n"

# Ouvrir le navigateur
Start-Process "http://localhost:3000/"

Write-Host "╔════════════════════════════════════════════════════════════════╗"
Write-Host "║                    ✓ SERVEUR LANCÉ                            ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝`n"

Write-Host "📍 Accès local: http://localhost:3000/`n"

Write-Host "🌐 Pages disponibles:"
Write-Host "   • Accueil:        http://localhost:3000/"
Write-Host "   • Login:          http://localhost:3000/login.html"
Write-Host "   • Espace client:  http://localhost:3000/espace-client.html"
Write-Host "   • Admin:          http://localhost:3000/admin.html`n"

Write-Host "⚠️  IMPORTANT: n'ouvrez pas les fichiers HTML en file://"
Write-Host "   Utilisez toujours les URLs http://localhost:3000/...`n"

Write-Host "👤 Client de test:"
Write-Host "   Email:    looptest_1777363293@test.local`n"

Write-Host "🛑 Pour arrêter le serveur:"
Write-Host "   Fermez la fenêtre ou appuyez sur Ctrl+C`n"

Write-Host "ℹ️  Appuyez sur Entrée pour continuer..."
Read-Host ""

# Garder le processus actif jusqu'à fermeture
Wait-Process -Id $serverProcess.Id
