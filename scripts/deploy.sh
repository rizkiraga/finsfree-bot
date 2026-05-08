#!/bin/bash
# deploy.sh - Production deployment script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Starting Deployment ===${NC}"

# 1. Pull latest code
echo -e "\n${BLUE}[1/3] Pulling latest code from main...${NC}"
git pull origin main

# 2. Install production dependencies
echo -e "\n${BLUE}[2/3] Installing production dependencies...${NC}"
npm install --production

# 3. Reload PM2 process
echo -e "\n${BLUE}[3/3] Reloading PM2 ecosystem...${NC}"
if pm2 status | grep -q "telegram-bot"; then
    pm2 reload ecosystem.config.js --env production
else
    echo -e "${RED}Process 'telegram-bot' not found. Starting for the first time...${NC}"
    pm2 start ecosystem.config.js --env production
fi

echo -e "\n${GREEN}=== Deployment Successful! ===${NC}"
pm2 status telegram-bot
