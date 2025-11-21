# CDR API VPS Deployment Guide

Complete guide to deploy the CDR API on your VPS (88.99.195.187)

## Prerequisites Check

SSH into your VPS and check what's installed:

```bash
# Check Node.js
node --version  # Need v18 or higher

# Check npm
npm --version

# Check PM2
pm2 --version

# Check nginx
nginx -v

# Check git
git --version
```

## Step 1: Install Required Software (if needed)

### Install Node.js 20 LTS (if not installed or old version)

```bash
# Remove old Node.js if exists
sudo apt remove nodejs npm -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### Install PM2 (if not installed)

```bash
sudo npm install -g pm2

# Setup PM2 to start on boot
pm2 startup
# Follow the command it gives you (usually: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u YOUR_USER --hp /home/YOUR_USER)

pm2 save
```

### Install Nginx (if not installed)

```bash
sudo apt update
sudo apt install -y nginx

# Start and enable nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

### Install Git (if not installed)

```bash
sudo apt install -y git
```

## Step 2: Deploy CDR API

### Clone the repository

```bash
# Create directory for apps
sudo mkdir -p /var/www
cd /var/www

# Clone the CDR API
sudo git clone https://github.com/solusaas-git/cdr-api.git
sudo chown -R $USER:$USER /var/www/cdr-api
cd cdr-api
```

### Install dependencies and build

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify build
ls -la dist/
```

### Configure environment

```bash
# Create production .env file
cat > .env << 'EOF'
# PostgreSQL Replica Connection (LOCAL)
DATABASE_URL=postgres://replica_monitor:q8uScn$72*xPsR#t@localhost:5432/sippy

# Database components
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sippy
DB_USER=replica_monitor
DB_PASSWORD=q8uScn$72*xPsR#t
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
EOF

# Secure the .env file
chmod 600 .env
```

### Test the API locally

```bash
# Test run
npm start

# In another terminal, test the API
curl http://localhost:3002/health

# If it works, stop it (Ctrl+C) and continue
```

## Step 3: Start with PM2

```bash
cd /var/www/cdr-api

# Start with PM2
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs cdr-api

# Save PM2 configuration
pm2 save
```

## Step 4: Configure Nginx Reverse Proxy

### Create Nginx configuration

```bash
sudo nano /etc/nginx/sites-available/cdr-api
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name cdrs.ovoky.io;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/cdr-api-access.log;
    error_log /var/log/nginx/cdr-api-error.log;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running queries
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

### Enable the site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/cdr-api /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

## Step 5: Configure DNS

Add an A record in your DNS provider:

```
Type: A
Name: cdrs
Value: 88.99.195.187
TTL: 300 (or auto)
```

Wait a few minutes for DNS propagation.

## Step 6: Setup SSL with Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d cdrs.ovoky.io

# Follow the prompts:
# - Enter your email
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (option 2)

# Test auto-renewal
sudo certbot renew --dry-run
```

## Step 7: Test the Deployment

```bash
# Test health endpoint
curl http://cdrs.ovoky.io/health

# Or with SSL (after certbot)
curl https://cdrs.ovoky.io/health

# Test CDR endpoint (with authentication)
curl -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=" \
  "https://cdrs.ovoky.io/cdrs?limit=10"
```

## Step 8: Update OVO App Environment Variables

In your OVO app (Vercel), update the environment variable:

```bash
CDR_API_URL=https://cdrs.ovoky.io
```

Redeploy the OVO app on Vercel for the changes to take effect.

## Useful PM2 Commands

```bash
# View logs
pm2 logs cdr-api

# Restart
pm2 restart cdr-api

# Stop
pm2 stop cdr-api

# Start
pm2 start cdr-api

# Monitor
pm2 monit

# View detailed info
pm2 info cdr-api

# Update after code changes
cd /var/www/cdr-api
git pull
npm install
npm run build
pm2 restart cdr-api
```

## Monitoring and Maintenance

### Check API status

```bash
# PM2 status
pm2 status

# View logs
pm2 logs cdr-api --lines 100

# Nginx logs
sudo tail -f /var/log/nginx/cdr-api-access.log
sudo tail -f /var/log/nginx/cdr-api-error.log
```

### Database connection test

```bash
# Test PostgreSQL connection
psql -h localhost -U replica_monitor -d sippy -c "SELECT COUNT(*) FROM cdr;"
```

## Troubleshooting

### API not starting

```bash
# Check logs
pm2 logs cdr-api

# Check if port 3002 is in use
sudo lsof -i :3002

# Restart PM2
pm2 restart cdr-api
```

### Nginx errors

```bash
# Check nginx error log
sudo tail -f /var/log/nginx/error.log

# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

### Database connection issues

```bash
# Test connection
psql -h localhost -U replica_monitor -d sippy

# Check PostgreSQL is running
sudo systemctl status postgresql

# Check pg_hba.conf allows local connections
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Should have: host sippy replica_monitor 127.0.0.1/32 md5
```

## Security Checklist

- ✅ .env file has restricted permissions (600)
- ✅ API_SECRET is set and matches OVO app
- ✅ CORS is configured for production domains only
- ✅ SSL certificate is installed (Let's Encrypt)
- ✅ Nginx security headers are enabled
- ✅ PostgreSQL user has read-only access
- ✅ Firewall allows only necessary ports (80, 443, 22)

## Performance Optimization

### Enable Nginx caching (optional)

```bash
sudo nano /etc/nginx/sites-available/cdr-api
```

Add inside the `server` block:

```nginx
# Cache configuration
proxy_cache_path /var/cache/nginx/cdr-api levels=1:2 keys_zone=cdr_cache:10m max_size=100m inactive=60m;

location / {
    # ... existing proxy settings ...
    
    # Cache GET requests for 1 minute
    proxy_cache cdr_cache;
    proxy_cache_valid 200 1m;
    proxy_cache_methods GET HEAD;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    add_header X-Cache-Status $upstream_cache_status;
}
```

## Backup and Updates

### Update CDR API

```bash
cd /var/www/cdr-api
git pull
npm install
npm run build
pm2 restart cdr-api
```

### Backup configuration

```bash
# Backup .env file
cp /var/www/cdr-api/.env ~/cdr-api-env-backup

# Backup nginx config
sudo cp /etc/nginx/sites-available/cdr-api ~/cdr-api-nginx-backup
```

## Cost Savings

By deploying on your VPS instead of Vercel with Static IPs:
- **Saved: $100/month** (Vercel Static IPs)
- **Cost: $0** (using existing VPS)
- **Bonus: Better performance** (local database connection)

---

## Quick Reference

**API URL:** https://cdrs.ovoky.io
**API Port:** 3002 (internal)
**Database:** localhost:5432/sippy
**PM2 App Name:** cdr-api
**Nginx Config:** /etc/nginx/sites-available/cdr-api
**App Directory:** /var/www/cdr-api
**Logs:** `pm2 logs cdr-api` or `/var/log/nginx/cdr-api-*.log`

