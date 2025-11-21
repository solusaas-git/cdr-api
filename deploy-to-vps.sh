#!/bin/bash

# CDR API VPS Deployment Script
# This script automates the deployment of CDR API to your VPS

set -e  # Exit on error

echo "=========================================="
echo "CDR API VPS Deployment Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="${VPS_HOST:-88.99.195.187}"
VPS_USER="${VPS_USER:-root}"
APP_DIR="/var/www/cdr-api"
DOMAIN="cdrs.ovoky.io"

echo -e "${YELLOW}Configuration:${NC}"
echo "  VPS Host: $VPS_HOST"
echo "  VPS User: $VPS_USER"
echo "  App Directory: $APP_DIR"
echo "  Domain: $DOMAIN"
echo ""

# Function to run commands on VPS
run_remote() {
    ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" "$@"
}

# Function to check if command exists on VPS
command_exists() {
    run_remote "command -v $1 >/dev/null 2>&1"
}

echo -e "${YELLOW}Step 1: Checking VPS connection...${NC}"
if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" "echo 'Connected'" >/dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to VPS. Please check:${NC}"
    echo "  1. VPS IP address is correct: $VPS_HOST"
    echo "  2. SSH key is configured"
    echo "  3. VPS is running"
    exit 1
fi
echo -e "${GREEN}✅ Connected to VPS${NC}"
echo ""

echo -e "${YELLOW}Step 2: Checking installed software...${NC}"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(run_remote "node --version")
    echo -e "${GREEN}✅ Node.js installed: $NODE_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js not found. Installing Node.js 20 LTS...${NC}"
    run_remote "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
    echo -e "${GREEN}✅ Node.js installed${NC}"
fi

# Check PM2
if command_exists pm2; then
    echo -e "${GREEN}✅ PM2 installed${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 not found. Installing PM2...${NC}"
    run_remote "sudo npm install -g pm2"
    echo -e "${GREEN}✅ PM2 installed${NC}"
fi

# Check Nginx
if command_exists nginx; then
    echo -e "${GREEN}✅ Nginx installed${NC}"
else
    echo -e "${YELLOW}⚠️  Nginx not found. Installing Nginx...${NC}"
    run_remote "sudo apt update && sudo apt install -y nginx"
    run_remote "sudo systemctl start nginx && sudo systemctl enable nginx"
    echo -e "${GREEN}✅ Nginx installed${NC}"
fi

# Check Git
if command_exists git; then
    echo -e "${GREEN}✅ Git installed${NC}"
else
    echo -e "${YELLOW}⚠️  Git not found. Installing Git...${NC}"
    run_remote "sudo apt install -y git"
    echo -e "${GREEN}✅ Git installed${NC}"
fi

echo ""
echo -e "${YELLOW}Step 3: Deploying CDR API...${NC}"

# Check if app directory exists
if run_remote "[ -d $APP_DIR ]"; then
    echo -e "${YELLOW}⚠️  App directory exists. Updating...${NC}"
    run_remote "cd $APP_DIR && git pull"
else
    echo -e "${YELLOW}📦 Cloning repository...${NC}"
    run_remote "sudo mkdir -p /var/www && cd /var/www && sudo git clone https://github.com/solusaas-git/cdr-api.git"
    run_remote "sudo chown -R $VPS_USER:$VPS_USER $APP_DIR"
fi

echo -e "${GREEN}✅ Code deployed${NC}"
echo ""

echo -e "${YELLOW}Step 4: Installing dependencies and building...${NC}"
run_remote "cd $APP_DIR && npm install"
run_remote "cd $APP_DIR && npm run build"
echo -e "${GREEN}✅ Build completed${NC}"
echo ""

echo -e "${YELLOW}Step 5: Configuring environment...${NC}"
run_remote "cat > $APP_DIR/.env << 'EOF'
# PostgreSQL Replica Connection (LOCAL)
DATABASE_URL=postgres://replica_monitor:q8uScn\$72*xPsR#t@localhost:5432/sippy

# Database components
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sippy
DB_USER=replica_monitor
DB_PASSWORD=q8uScn\$72*xPsR#t
DB_MAX_CONNECTIONS=20

# API Configuration
API_PORT=3002
API_HOST=0.0.0.0

# CORS - Production domains only
ALLOWED_ORIGINS=https://app.ovoky.io,https://ovoky.io

# Authentication (same secret as OVO app)
API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=

# Node Environment
NODE_ENV=production
EOF"

run_remote "chmod 600 $APP_DIR/.env"
echo -e "${GREEN}✅ Environment configured${NC}"
echo ""

echo -e "${YELLOW}Step 6: Starting application with PM2...${NC}"

# Stop if already running
if run_remote "pm2 list | grep -q cdr-api"; then
    echo -e "${YELLOW}⚠️  Stopping existing instance...${NC}"
    run_remote "pm2 stop cdr-api"
    run_remote "pm2 delete cdr-api"
fi

run_remote "cd $APP_DIR && pm2 start ecosystem.config.js"
run_remote "pm2 save"

# Setup PM2 startup (if not already done)
run_remote "pm2 startup systemd -u $VPS_USER --hp /home/$VPS_USER" || true

echo -e "${GREEN}✅ Application started${NC}"
echo ""

echo -e "${YELLOW}Step 7: Configuring Nginx...${NC}"

# Create Nginx configuration
run_remote "sudo tee /etc/nginx/sites-available/cdr-api > /dev/null << 'EOF'
server {
    listen 80;
    server_name $DOMAIN;

    # Security headers
    add_header X-Frame-Options \"SAMEORIGIN\" always;
    add_header X-Content-Type-Options \"nosniff\" always;
    add_header X-XSS-Protection \"1; mode=block\" always;

    # Logging
    access_log /var/log/nginx/cdr-api-access.log;
    error_log /var/log/nginx/cdr-api-error.log;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts for long-running queries
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF"

# Enable site
run_remote "sudo ln -sf /etc/nginx/sites-available/cdr-api /etc/nginx/sites-enabled/"

# Test and reload Nginx
if run_remote "sudo nginx -t"; then
    run_remote "sudo systemctl reload nginx"
    echo -e "${GREEN}✅ Nginx configured${NC}"
else
    echo -e "${RED}❌ Nginx configuration error${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 8: Testing deployment...${NC}"

# Wait a moment for the app to start
sleep 3

# Test health endpoint
if run_remote "curl -s http://localhost:3002/health | grep -q 'ok'"; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo -e "${YELLOW}Checking logs:${NC}"
    run_remote "pm2 logs cdr-api --lines 20 --nostream"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "✅ Deployment completed successfully!"
echo "==========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Configure DNS A record:"
echo "   Type: A"
echo "   Name: cdrs"
echo "   Value: $VPS_HOST"
echo "   TTL: 300"
echo ""
echo "2. Install SSL certificate (after DNS is configured):"
echo "   ssh $VPS_USER@$VPS_HOST"
echo "   sudo apt install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d $DOMAIN"
echo ""
echo "3. Update OVO app environment variable in Vercel:"
echo "   CDR_API_URL=https://$DOMAIN"
echo ""
echo "4. Test the API:"
echo "   curl http://$DOMAIN/health"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:    ssh $VPS_USER@$VPS_HOST 'pm2 logs cdr-api'"
echo "  Restart app:  ssh $VPS_USER@$VPS_HOST 'pm2 restart cdr-api'"
echo "  Check status: ssh $VPS_USER@$VPS_HOST 'pm2 status'"
echo ""
echo -e "${GREEN}💰 Cost savings: \$100/month (Vercel Static IPs)${NC}"
echo ""

