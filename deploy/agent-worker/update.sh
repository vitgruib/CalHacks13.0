#!/usr/bin/env bash
# Bring the VM's agent worker up to date with main and restart it (T26). Run on
# the VM; CI runs it over SSH on every push that changes agents/, server/ or sim/.
set -euo pipefail
APP=/opt/grantguard
STATE=/var/lib/grantguard-agents
cd "$APP"
git pull --ff-only --quiet
npm ci --prefix server --no-audit --no-fund --loglevel=error
npm ci --prefix agents --no-audit --no-fund --loglevel=error
# Seed the writable caches with the committed saved answers; keep what the VM
# has already saved.
sudo mkdir -p "$STATE/state" "$STATE/cache"
sudo chown -R "$USER:" "$STATE"
cp -r --update=none agents/cache/. "$STATE/cache/"
sudo systemctl restart grantguard-agents
sleep 5
systemctl is-active --quiet grantguard-agents || { sudo journalctl -u grantguard-agents -n 40 --no-pager; exit 1; }
echo "── agent worker running $(git rev-parse --short HEAD)"
