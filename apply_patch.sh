#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/Downloads/sports-tracker}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Could not find project folder: $PROJECT_DIR"
  echo "Usage: ./apply_patch.sh /path/to/sports-tracker"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo "This does not look like the sports-tracker project folder: $PROJECT_DIR"
  echo "No package.json found."
  exit 1
fi

echo "Applying Scores tab patch to: $PROJECT_DIR"

mkdir -p "$PROJECT_DIR/app" "$PROJECT_DIR/components"

cp "$PATCH_DIR/app/page.tsx" "$PROJECT_DIR/app/page.tsx"
cp "$PATCH_DIR/app/globals.css" "$PROJECT_DIR/app/globals.css"
cp "$PATCH_DIR/components/LeaguesView.tsx" "$PROJECT_DIR/components/LeaguesView.tsx"
cp "$PATCH_DIR/components/AppSettingsButton.tsx" "$PROJECT_DIR/components/AppSettingsButton.tsx"

echo "Patch files copied."
echo "Next run:"
echo "  cd \"$PROJECT_DIR\""
echo "  npm run build"
echo "  git add ."
echo "  git commit -m \"scores tab update\""
echo "  git push origin main"
