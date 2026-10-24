#!/usr/bin/env bash
# Regenerate the TypeScript client bindings from this module. Run after any
# change to server/src (or after pulling one). Writes generated code only.
# A client package gets bindings once it depends on `spacetimedb` (the
# generated code imports it); until then it is skipped.
set -euo pipefail
cd "$(dirname "$0")/.."
for pkg in ../agents ../web; do
  [ -f "$pkg/package.json" ] || continue
  if ! grep -q '"spacetimedb"' "$pkg/package.json"; then
    echo "── skipping $pkg: add \"spacetimedb\": \"2.13.0\" to its package.json to get bindings"
    continue
  fi
  spacetime generate --lang typescript --module-path . --out-dir "$pkg/src/module_bindings" -y
done
