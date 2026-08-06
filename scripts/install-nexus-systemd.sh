#!/usr/bin/env bash
set -euo pipefail

# Run once after pulling this change, from the production host.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sudo install -m 0644 "$ROOT_DIR/systemd/nexus.service" /etc/systemd/system/nexus.service
sudo install -m 0644 "$ROOT_DIR/systemd/nexus.timer" /etc/systemd/system/nexus.timer
sudo install -m 0644 "$ROOT_DIR/systemd/nexus-oom-alert.service" /etc/systemd/system/nexus-oom-alert.service
sudo systemctl daemon-reload
sudo systemctl disable --now nexus.service
sudo systemctl enable --now nexus.timer
# OOM 감시: 컨테이너 OOM-kill 시 Discord OPERATION 채널로 알림.
sudo systemctl enable --now nexus-oom-alert.service

echo "Installed nexus.timer. It restores existing containers 20 seconds after WSL starts."
echo "Installed nexus-oom-alert.service. It alerts Discord when a container is OOM-killed."
