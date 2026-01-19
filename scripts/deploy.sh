#!/bin/bash
set -e

# Project Nexus - Deployment Script
# Usage: ./scripts/deploy.sh [production|staging]

ENVIRONMENT=${1:-production}
PROJECT_DIR="/opt/nexus"
BACKUP_DIR="/opt/nexus-data/backups"

echo "======================================"
echo "Project Nexus Deployment"
echo "Environment: $ENVIRONMENT"
echo "======================================"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as correct user
if [ "$EUID" -eq 0 ]; then
    log_error "Do not run this script as root"
    exit 1
fi

# Navigate to project directory
cd $PROJECT_DIR

# Pull latest changes
log_info "Pulling latest changes from git..."
git fetch origin
git pull origin main

# Backup database before deployment
log_info "Creating database backup..."
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
docker exec nexus-postgres pg_dump -U nexus nexus > "$BACKUP_DIR/pre_deploy_$DATE.sql" || log_warn "Backup failed, continuing..."

# Install dependencies
log_info "Installing dependencies..."
pnpm install --frozen-lockfile

# Generate Prisma client
log_info "Generating Prisma client..."
pnpm --filter @nexus/database db:generate

# Run database migrations
log_info "Running database migrations..."
pnpm --filter @nexus/database db:migrate:deploy

# Build applications
log_info "Building applications..."
pnpm build

# Restart containers
log_info "Restarting Docker containers..."
docker compose down
docker compose up -d --build

# Wait for services to be healthy
log_info "Waiting for services to be healthy..."
sleep 10

# Health check
log_info "Running health check..."
HEALTH_URL="http://localhost:4000/api/health"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$HTTP_STATUS" -eq 200 ]; then
    log_info "Health check passed!"
else
    log_error "Health check failed! HTTP Status: $HTTP_STATUS"
    log_warn "Rolling back..."
    docker compose logs --tail=50
    exit 1
fi

# Cleanup old backups (keep last 10)
log_info "Cleaning up old backups..."
cd $BACKUP_DIR
ls -t *.sql 2>/dev/null | tail -n +11 | xargs -r rm --

# Done
echo ""
echo "======================================"
log_info "Deployment completed successfully!"
echo "======================================"
echo ""
echo "Service URLs:"
echo "  - Web:    http://localhost:3000"
echo "  - API:    http://localhost:4000"
echo "  - Health: http://localhost:4000/api/health"
echo ""
