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
# setup.sh writes the env file only once; keep its lab grant list in step, so
# a new cut script's grant is read from the list (T74).
ENV_FILE=/etc/grantguard/agents.env
want=$(grep -m1 '^GG_LAB_GRANTS=' deploy/agent-worker/setup.sh || true)
if [ -n "$want" ] && sudo grep -q '^GG_LAB_GRANTS=' "$ENV_FILE" && ! sudo grep -qxF "$want" "$ENV_FILE"; then
  sudo sed -i "s/^GG_LAB_GRANTS=.*/$want/" "$ENV_FILE"
  echo "── updated GG_LAB_GRANTS in $ENV_FILE"
fi
sudo systemctl restart grantguard-agents
# "Active" alone passes a crash loop (Restart=always, RestartSec=5), so also
# fail if systemd restarted the worker while we watched it connect and subscribe.
restarts() { systemctl show -p NRestarts --value grantguard-agents; }
before=$(restarts)
sleep 15
after=$(restarts)
if ! systemctl is-active --quiet grantguard-agents || [ "$after" -gt "$before" ]; then
  echo "── agent worker is not staying up (restarted $((after - before)) times in 15 s)"
  sudo journalctl -u grantguard-agents -n 40 --no-pager
  exit 1
fi
echo "── agent worker running $(git rev-parse --short HEAD)"
