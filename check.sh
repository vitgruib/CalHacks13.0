#!/usr/bin/env bash
# Repo-wide check (AGENTS.md §0): must pass before every push.
# Runs each package's own `npm run check`, installing deps on a fresh clone.
set -euo pipefail
cd "$(dirname "$0")"
for pkg in server agents web; do
  [ -f "$pkg/package.json" ] || continue
  echo "── check: $pkg"
  [ -d "$pkg/node_modules" ] || npm --prefix "$pkg" ci --silent
  npm --prefix "$pkg" run check
done
echo "── check: all passed"
