#!/usr/bin/env bash
set -euo pipefail

# Run once after pulling this change, from the production host.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sudo install -m 0644 "$ROOT_DIR/systemd/nexus.service" /etc/systemd/system/nexus.service
sudo systemctl daemon-reload
sudo systemctl enable nexus.service

echo "Installed nexus.service. It will restore existing containers without pulling or building on reboot."
