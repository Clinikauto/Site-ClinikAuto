# Script de sauvegarde automatique ClinikAuto vers D:\sauvgarde
# Exécution: PowerShell -ExecutionPolicy Bypass -File backup-to-d-drive.ps1

$ErrorActionPreference = 'Stop'

$src = "C:\Users\gualt\OneDrive\Bureau\Clinikauto\site-clinikauto-clean"
$dst = "D:\sauvgarde\site-clinikauto-clean"
$logFile = "C:\Users\gualt\OneDrive\Bureau\Clinikauto\site-clinikauto-clean\backup.log"

# Fonction de journalisation
function Log-Message {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Write-Output $logEntry
    Add-Content -Path $logFile -Value $logEntry -Encoding UTF8
}

Log-Message "=== Début sauvegarde ClinikAuto ==="

# Vérifier que source existe
if (-not (Test-Path $src)) {
    Log-Message "ERREUR: Dossier source introuvable: $src"
    exit 1
}

# Créer le répertoire destination s'il n'existe pas
if (-not (Test-Path $dst)) {
    Log-Message "Création du répertoire destination: $dst"
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
}

# Lancer Robocopy avec exclusions appropriées
Log-Message "Robocopy: $src => $dst"
robocopy $src $dst /MIR /R:2 /W:2 /XD node_modules .git .vscode dist "clinikauto-agenda\vendor" /XF "*.log" | Out-Null

$robocopyCode = $LASTEXITCODE

# Robocopy codes: 0-7 = succès, 8+ = erreur
if ($robocopyCode -le 7) {
    Log-Message "Sauvegarde réussie (code Robocopy: $robocopyCode)"
    Log-Message "=== Fin sauvegarde ClinikAuto (OK) ==="
    exit 0
} else {
    Log-Message "ERREUR Robocopy code: $robocopyCode"
    Log-Message "=== Fin sauvegarde ClinikAuto (ERREUR) ==="
    exit 1
}
