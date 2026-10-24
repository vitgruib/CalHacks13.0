#!/usr/bin/env bash
# One-time setup of the agent worker on a fresh Ubuntu VM (T26). Run on the VM
# as the admin user (it uses sudo):
#   curl -fsSL https://raw.githubusercontent.com/vitgruib/CalHacks13.0/main/deploy/agent-worker/setup.sh | bash
# It stops and asks for the Anthropic key before the first start. Safe to re-run. Later updates come from deploy/agent-worker/update.sh (CI).
set -euo pipefail
REPO=${GG_REPO:-https://github.com/vitgruib/CalHacks13.0.git}
APP=/opt/grantguard
ENV_FILE=/etc/grantguard/agents.env

# 1 GB VMs run out of memory during npm ci without swap.
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! node --version 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs git
fi

if [ ! -d "$APP/.git" ]; then
  sudo mkdir -p "$APP" && sudo chown "$USER:" "$APP"
  git clone "$REPO" "$APP"
fi

if [ ! -f "$ENV_FILE" ]; then
  sudo mkdir -p "$(dirname "$ENV_FILE")"
  sudo tee "$ENV_FILE" >/dev/null <<'EOF'
# Agent worker settings (see agents/README.md). This file holds secrets:
# readable by root and the service only.
ANTHROPIC_API_KEY=
GG_DB=spacetime
GG_SPACETIME_URI=wss://maincloud.spacetimedb.com
GG_SPACETIME_DB=grantguard
GG_CLAUDE=cached
# Agent tokens and caches live outside the checkout, so git pull never
# conflicts with them and restarts keep the same three identities.
GG_STATE_DIR=/var/lib/grantguard-agents/state
GG_CACHE_DIR=/var/lib/grantguard-agents/cache
GG_CLAUDE_CACHE_DIR=/var/lib/grantguard-agents/cache/claude
EOF
  sudo chmod 600 "$ENV_FILE"
fi

sed "s/@USER@/$USER/" "$APP/deploy/agent-worker/grantguard-agents.service" \
  | sudo tee /etc/systemd/system/grantguard-agents.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable grantguard-agents >/dev/null

# Don't start without the key: the first start claims the three agent roles
# on maincloud, and without Claude they'd act on fallbacks.
if ! sudo grep -q '^ANTHROPIC_API_KEY=.' "$ENV_FILE"; then
  echo "── installed. Now: sudo nano $ENV_FILE (fill in ANTHROPIC_API_KEY), then: $APP/deploy/agent-worker/update.sh"
  exit 0
fi
"$APP/deploy/agent-worker/update.sh"
