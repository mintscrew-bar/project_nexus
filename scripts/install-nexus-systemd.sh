#!/usr/bin/env bash
set -euo pipefail

# Run once after pulling this change, from the production host.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sudo install -m 0644 "$ROOT_DIR/systemd/nexus.service" /etc/systemd/system/nexus.service
sudo install -m 0644 "$ROOT_DIR/systemd/nexus.timer" /etc/systemd/system/nexus.timer
sudo systemctl daemon-reload
sudo systemctl disable --now nexus.service
sudo systemctl enable --now nexus.timer

echo "Installed nexus.timer. It restores existing containers 20 seconds after WSL starts."
