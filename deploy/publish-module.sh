#!/usr/bin/env bash
# Publish the server module to hosted SpacetimeDB (maincloud) as `grantguard`
# (T21). Clients connect to wss://maincloud.spacetimedb.com, database
# `grantguard`. Only the identity that created the database can republish it
# (@ethan's `spacetime login`). Data is kept; pass --reset to wipe it and
# reload the fixtures.
# CI runs this on every push to main that changes server/
# (.github/workflows/publish-module.yml), so you rarely need to run it by hand.
set -euo pipefail
cd "$(dirname "$0")/../server"
command -v spacetime >/dev/null || { echo "Install the SpacetimeDB CLI: curl -sSf https://install.spacetimedb.com | sh"; exit 1; }
reset=()
[ "${1:-}" = "--reset" ] && reset=(--delete-data=always)
spacetime publish --server maincloud -p . --yes ${reset[@]+"${reset[@]}"} grantguard
echo "── published grantguard on maincloud (https://spacetimedb.com/grantguard)"
