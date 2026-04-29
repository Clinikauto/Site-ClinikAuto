@echo off
REM ==========================================
REM ClinikAuto - Serveur de Test Local
REM Script pour lancer le serveur et accéder au site
REM ==========================================

chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║          ClinikAuto - Démarrage du serveur de test             ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Vérifier que Node.js est installé
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERREUR: Node.js n'est pas installé ou pas dans le PATH
    echo.
    echo Veuillez installer Node.js depuis: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✓ Node.js détecté: 
node --version
echo.

REM Arrêter tout processus sur le port 3000
echo [1/4] Arrêt des processus sur le port 3000...
powershell -Command "$pids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Host 'Processus arrêté (PID: $_)' } }" 2>nul
timeout /t 1 /nobreak >nul

REM Vérifier que package.json existe
if not exist package.json (
    echo ❌ ERREUR: package.json introuvable
    echo Le script doit être lancé depuis le dossier racine du projet ClinikAuto
    echo.
    pause
    exit /b 1
)

echo ✓ Dossier du projet trouvé
echo.

REM Vérifier que node_modules existe
if not exist node_modules (
    echo [2/4] Installation des dépendances (npm install)...
    call npm install
    if errorlevel 1 (
        echo ❌ Erreur lors de l'installation des dépendances
        pause
        exit /b 1
    )
    echo ✓ Dépendances installées
) else (
    echo [2/4] Dépendances déjà installées
    echo ✓ node_modules trouvé
)
echo.

REM Démarrer le serveur
echo [3/4] Démarrage du serveur sur le port 3000...
echo.
echo ⏳ Attente de la réponse du serveur...
echo.

REM Lancer le serveur en arrière-plan et attendre
start "ClinikAuto Server" cmd /k "node backend/server.js"

REM Attendre que le serveur soit prêt
timeout /t 3 /nobreak >nul

echo.
echo [4/4] Ouverture du navigateur...
echo.

REM Essayer d'ouvrir avec le navigateur par défaut
start http://localhost:3000/

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                    ✓ SERVEUR LANCÉ                            ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 📍 Accès local: http://localhost:3000/
echo.
echo 🌐 Pages disponibles:
echo    • Accueil:        http://localhost:3000/
echo    • Login:          http://localhost:3000/login.html
echo    • Espace client:  http://localhost:3000/espace-client.html
echo    • Admin:          http://localhost:3000/admin.html
echo.
echo ⚠️  IMPORTANT: n'ouvrez pas les fichiers HTML en file://
echo    Utilisez toujours les URLs http://localhost:3000/...
echo.
echo 👤 Client de test:
echo    Email:    looptest_1777363293@test.local
echo.
echo 🛑 Pour arrêter le serveur:
echo    Fermez la fenêtre du serveur ou appuyez sur Ctrl+C
echo.
echo ℹ️  Cette fenêtre peut rester ouverte (elle sert juste à l'info)
echo.
pause
