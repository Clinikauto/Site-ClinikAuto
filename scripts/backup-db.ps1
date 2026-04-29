param(
  [string]$destFolder = "backups"
)

if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder | Out-Null }
$ts = Get-Date -Format yyyyMMdd_HHmmss
$src = Join-Path -Path "backend" -ChildPath "database.db"
if (Test-Path $src) {
  $dst = Join-Path -Path $destFolder -ChildPath "database_$ts.db.bak"
  Copy-Item -Path $src -Destination $dst -Force
  Write-Output "Database copied to $dst"
} else {
  Write-Output "No database found at $src"
}
