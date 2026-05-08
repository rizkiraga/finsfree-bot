#!/bin/bash
# rollback.sh - Emergency rollback script

set -e

# Colors for output
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${YELLOW}=== Starting Rollback ===${NC}"

# 1. Revert to previous commit
echo -e "\n${BLUE}[1/2] Reverting to previous commit (HEAD@{1})...${NC}"
git checkout HEAD@{1}

# 2. Reload PM2 process
echo -e "\n${BLUE}[2/2] Reloading PM2 ecosystem...${NC}"
pm2 reload ecosystem.config.js --env production

echo -e "\n${GREEN}=== Rollback Complete! ===${NC}"
echo -e "Current commit: $(git rev-parse --short HEAD)"
pm2 status telegram-bot
