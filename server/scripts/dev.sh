#!/usr/bin/env bash
# Local run (AGENTS.md §0): start SpacetimeDB if needed, publish the module
# as `grantguard`, and regenerate the TypeScript client bindings for the
# agent worker and the web app. Pass --reset to wipe the local data.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=grantguard
command -v spacetime >/dev/null || { echo "Install the SpacetimeDB CLI: curl -sSf https://install.spacetimedb.com | sh"; exit 1; }
if ! spacetime server ping local >/dev/null 2>&1; then
  echo "── starting local SpacetimeDB (log: .spacetime.log)"
  nohup spacetime start >.spacetime.log 2>&1 &
  for _ in $(seq 1 30); do spacetime server ping local >/dev/null 2>&1 && break; sleep 1; done
fi
reset=()
[ "${1:-}" = "--reset" ] && reset=(--delete-data -y)
spacetime publish --server local "${reset[@]}" "$DB"
./scripts/generate.sh
echo "── published $DB on local; bindings regenerated"
