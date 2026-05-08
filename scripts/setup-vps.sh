#!/bin/bash
# setup-vps.sh - Automated VPS Setup for Finsfree Bot
# Target OS: Ubuntu 22.04

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting Finsfree Bot VPS Setup ===${NC}"

# 1. Update system
echo -e "\n${BLUE}[1/6] Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y
echo -e "${GREEN}System updated successfully.${NC}"

# 2. Install Git
if ! command -v git &> /dev/null; then
    echo -e "\n${BLUE}[2/6] Installing Git...${NC}"
    sudo apt install git -y
    echo -e "${GREEN}Git installed.${NC}"
else
    echo -e "\n${BLUE}[2/6] Git is already installed.${NC}"
fi

# 3. Install Node.js 20
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    echo -e "\n${BLUE}[3/6] Installing Node.js 20 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo -e "${GREEN}Node.js $(node -v) installed.${NC}"
else
    echo -e "\n${BLUE}[3/6] Node.js 20 is already installed ($(node -v)).${NC}"
fi

# 4. Install PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "\n${BLUE}[4/6] Installing PM2...${NC}"
    sudo npm install -g pm2
    echo -e "${GREEN}PM2 installed.${NC}"
else
    echo -e "\n${BLUE}[4/6] PM2 is already installed.${NC}"
fi

# 5. Create botuser
if ! id "botuser" &> /dev/null; then
    echo -e "\n${BLUE}[5/6] Creating 'botuser'...${NC}"
    sudo adduser --disabled-password --gecos "" botuser
    sudo usermod -aG sudo botuser
    echo -e "${GREEN}User 'botuser' created with sudo privileges.${NC}"
    echo -e "${BLUE}NOTE: Please set a password for 'botuser' manually using 'sudo passwd botuser' or use SSH keys.${NC}"
else
    echo -e "\n${BLUE}[5/6] User 'botuser' already exists.${NC}"
fi

# 6. Setup Firewall (UFW)
echo -e "\n${BLUE}[6/7] Configuring UFW Firewall...${NC}"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo "y" | sudo ufw enable
echo -e "${GREEN}Firewall enabled (SSH, HTTP, HTTPS).${NC}"

# 7. Setup Fail2Ban
echo -e "\n${BLUE}[7/8] Installing and Configuring Fail2Ban...${NC}"
sudo apt install fail2ban -y
sudo bash -c 'cat <<EOT > /etc/fail2ban/jail.local
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
EOT'
sudo systemctl restart fail2ban
echo -e "${GREEN}Fail2Ban installed and configured (maxretry: 3, bantime: 1h).${NC}"

# 8. Setup Automatic Security Updates
echo -e "\n${BLUE}[8/8] Configuring Automatic Security Updates...${NC}"
sudo apt install unattended-upgrades -y
# Configure to only allow security patches
sudo bash -c 'cat <<EOT > /etc/apt/apt.conf.d/50unattended-upgrades
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Package-Blacklist {
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::InstallOnShutdown "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOT'
# Enable non-interactively
echo "unattended-upgrades unattended-upgrades/enable_auto_updates boolean true" | sudo debconf-set-selections
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
echo -e "${GREEN}Automatic security updates enabled (security patches only).${NC}"

echo -e "\n${GREEN}=== Setup Complete! ===${NC}"
echo -e "Next steps:"
echo -e "1. Switch to botuser: ${BLUE}su - botuser${NC}"
echo -e "2. Create secure .env file:"
echo -e "   ${BLUE}cat <<EOT > .env
NODE_ENV=production
LOG_LEVEL=info
TELEGRAM_BOT_TOKEN=...
TELEGRAM_GROUP_ID=...
OPENAI_API_KEY=...
ADMIN_USER_IDS=...
EOT${NC}"
echo -e "3. Set .env permissions: ${BLUE}chmod 600 .env${NC}"
echo -e "4. Clone your project and start with PM2."
