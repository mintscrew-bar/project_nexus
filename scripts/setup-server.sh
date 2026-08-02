#!/bin/bash
set -e

# Project Nexus - Server Initial Setup Script
# Run this script on a fresh Ubuntu Server installation

echo "======================================"
echo "Project Nexus - Server Setup"
echo "======================================"

# Color codes
GREEN='\033[0;32m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

# Update system
log_info "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install basic tools
log_info "Installing basic tools..."
sudo apt install -y curl wget git vim htop net-tools ufw

# Setup firewall
log_info "Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 4000/tcp
sudo ufw --force enable

# Install Docker
log_info "Installing Docker..."
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
sudo usermod -aG docker $USER

# Install Node.js via NVM
log_info "Installing Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20
nvm alias default 20

# Install pnpm
log_info "Installing pnpm..."
npm install -g pnpm

# Create project directories
log_info "Creating project directories..."
sudo mkdir -p /opt/nexus
sudo mkdir -p /opt/nexus-data/{postgres,redis,logs,backups}
sudo chown -R $USER:$USER /opt/nexus
sudo chown -R $USER:$USER /opt/nexus-data

# Set timezone
log_info "Setting timezone to Asia/Seoul..."
sudo timedatectl set-timezone Asia/Seoul

# Generate SSH key for GitHub
log_info "Generating SSH key..."
ssh-keygen -t ed25519 -C "nexus-server" -f ~/.ssh/id_ed25519 -N ""
echo ""
echo "======================================"
echo "Add this SSH key to GitHub as Deploy Key:"
echo "======================================"
cat ~/.ssh/id_ed25519.pub
echo ""

# Setup complete
echo ""
echo "======================================"
echo "Server setup complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Add the SSH key above to your GitHub repository"
echo "2. Log out and log back in (for docker group)"
echo "3. Clone your repository to /opt/nexus"
echo "4. Copy .env.example to .env and fill in values"
echo "5. Run: cd /opt/nexus && ./scripts/deploy.sh"
echo ""
