#!/usr/bin/env bash
# Regenerate the TypeScript client bindings from this module. Run after any
# change to server/src (or after pulling one). Writes generated code only.
set -euo pipefail
cd "$(dirname "$0")/.."
for out in ../agents/src/module_bindings ../web/src/module_bindings; do
  [ -d "$(dirname "$out")" ] || continue
  spacetime generate --lang typescript --out-dir "$out" -y
done
