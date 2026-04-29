@echo off
chcp 65001 >nul
setlocal

echo.
echo ================================================
echo   ClinikAuto - Lancement en 1 clic
echo ================================================
echo.

cd /d "%~dp0"

if not exist package.json (
  echo ERREUR: lancez ce fichier depuis le dossier du projet.
  pause
  exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
  echo ERREUR: Node.js non installe. https://nodejs.org/
  pause
  exit /b 1
)

echo [1/4] Verification Node.js OK
echo [2/4] Arret d'un ancien serveur (si present)
taskkill /F /IM node.exe >nul 2>nul

echo [3/4] Installation des dependances si necessaire
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    echo ERREUR pendant npm install
    pause
    exit /b 1
  )
)

echo [4/4] Demarrage serveur + ouverture navigateur
start "ClinikAuto Server" cmd /k "cd /d %~dp0 && node backend/server.js"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000/"

echo.
echo Site lance. Utilisez ces liens:
echo - http://localhost:3000/
echo - http://localhost:3000/login.html
echo - http://localhost:3000/espace-client.html
echo - http://localhost:3000/admin.html
echo.
echo IMPORTANT: ne pas ouvrir les pages en file://
echo.
pause
