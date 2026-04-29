#!/usr/bin/env bash
set -euo pipefail
SRC=frontend
DIST=dist/frontend
rm -rf "$DIST"
mkdir -p "$DIST"
cp -r "$SRC"/* "$DIST"/

if command -v npx >/dev/null 2>&1; then
  echo "Minification: JS via terser, CSS via clean-css-cli (if installed)"
  find "$DIST" -type f -name "*.js" -print0 | xargs -0 -I{} sh -c 'npx terser "{}" -c -m -o "{}" || echo "terser failed for {}"'
  find "$DIST" -type f -name "*.css" -print0 | xargs -0 -I{} sh -c 'npx cleancss -o "{}" "{}" || echo "cleancss failed for {}"'
fi

echo "Build complet: $DIST"
