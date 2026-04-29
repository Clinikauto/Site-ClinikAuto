param()
$ErrorActionPreference = 'Stop'
$src = "frontend"
$dist = "dist/frontend"
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Path $dist | Out-Null
Copy-Item -Recurse -Force -Path "$src\*" -Destination $dist

if (Get-Command npx -ErrorAction SilentlyContinue) {
    Write-Host "Minification: JS via terser, CSS via clean-css-cli (if installed)"
    Get-ChildItem -Path $dist -Recurse -Filter *.js | ForEach-Object {
        & npx terser $_.FullName -c -m -o $_.FullName 2>$null || Write-Host "terser failed for $($_.FullName)"
    }
    Get-ChildItem -Path $dist -Recurse -Filter *.css | ForEach-Object {
        & npx cleancss -o $_.FullName $_.FullName 2>$null || Write-Host "cleancss failed for $($_.FullName)"
    }
}

Write-Host "Build complet: $dist"
