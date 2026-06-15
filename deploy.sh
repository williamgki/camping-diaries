#!/usr/bin/env bash
# Publish dist/ to the gh-pages branch. Uses a fresh throwaway repo with NO
# .gitignore and `git add -A`, so every asset (incl. the 216 MB scans/ folder)
# is included — the gh-pages npm tool otherwise inherits the repo's .gitignore,
# whose unanchored `scans/` pattern silently drops the diary page images.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

npm run build

REMOTE="$(git remote get-url origin)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp -R dist/. "$TMP/"          # includes .nojekyll; dist has no .gitignore
cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.email=deploy@local -c user.name=deploy commit -qm "deploy $STAMP"
git push -qf "$REMOTE" gh-pages

echo "Published $(find "$TMP" -type f -not -path '*/.git/*' | wc -l | tr -d ' ') files to gh-pages ($STAMP)"
