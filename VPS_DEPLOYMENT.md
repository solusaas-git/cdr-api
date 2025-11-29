# CDR API v2.0.0 - VPS Deployment

## 🎯 Overview

CDR API is now **VPS-hosted only** (no longer using Vercel serverless). This provides:
- ✅ Better performance (persistent connections)
- ✅ Lower latency (no cold starts)
- ✅ Full control over resources
- ✅ Simpler deployment
- ✅ Direct database connection

## 🚀 Quick Deploy

```bash
cd /var/www/cdr-api
git pull
npm install
npm run build
pm2 restart cdr-api
```

## 📋 Environment Variables

Create/update `.env` file:

```bash
# Application
NODE_ENV=production
API_PORT=3001
API_HOST=0.0.0.0
API_SECRET=your-secret-key-here

# Database (PostgreSQL Replica)
DATABASE_URL=postgresql://replicator:password@localhost:5432/sippy
# OR use individual params:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sippy
DB_USER=replicator
DB_PASSWORD=your-password
DB_MAX_CONNECTIONS=20

# Queue Configuration
QUEUE_MAX_SIZE=200
QUEUE_REQUEST_TIMEOUT=30000
QUEUE_FAILURE_THRESHOLD=5
QUEUE_SUCCESS_THRESHOLD=3
QUEUE_CIRCUIT_RESET_TIMEOUT=60000
QUEUE_MAX_REQUEST_AGE=120000

# Health Monitor
DB_HEALTH_CHECK_INTERVAL=2000
DB_HEALTH_CHECK_TIMEOUT=5000

# Security
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Logging
LOG_LEVEL=info
LOG_PRETTY=false
```

## 🔧 PM2 Configuration

The `ecosystem.config.js` is already configured for VPS:

```javascript
module.exports = {
  apps: [{
    name: 'cdr-api',
    script: './dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    max_restarts: 10,
    restart_delay: 5000,
    exp_backoff_restart_delay: 100,
  }],
};
```

## 📊 PM2 Commands

```bash
# Start the API
pm2 start ecosystem.config.js

# Restart
pm2 restart cdr-api

# Stop
pm2 stop cdr-api

# View logs
pm2 logs cdr-api

# Monitor
pm2 monit

# Status
pm2 status

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

## 🏥 Health Checks

```bash
# Main health check
curl http://localhost:3001/health

# Database health
curl http://localhost:3001/db/health

# Queue stats
curl http://localhost:3001/queue/stats

# Service info
curl http://localhost:3001/
```

## 🔒 Nginx Configuration

```nginx
# /etc/nginx/sites-available/cdr-api

upstream cdr_api {
    least_conn;
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Logging
    access_log /var/log/nginx/cdr-api-access.log;
    error_log /var/log/nginx/cdr-api-error.log;
    
    location / {
        proxy_pass http://cdr_api;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts (CDR queries can be long)
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # Buffering
        proxy_buffering off;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Health check endpoint (no auth required)
    location /health {
        proxy_pass http://cdr_api/health;
        access_log off;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/cdr-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔐 SSL Certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d api.yourdomain.com
```

## 📦 System Service (Alternative to PM2)

If you prefer systemd over PM2:

```ini
# /etc/systemd/system/cdr-api.service

[Unit]
Description=CDR API Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/cdr-api
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /var/www/cdr-api/dist/index.js
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=cdr-api

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cdr-api
sudo systemctl start cdr-api
sudo systemctl status cdr-api
```

View logs:
```bash
sudo journalctl -u cdr-api -f
```

## 🔄 Deployment Workflow

### Automated Deployment Script

The included `deploy-fix.sh` script handles everything:

```bash
./deploy-fix.sh
```

### Manual Deployment

```bash
# 1. Pull latest changes
cd /var/www/cdr-api
git pull

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Restart service
pm2 restart cdr-api

# 5. Check status
pm2 status
pm2 logs cdr-api --lines 50

# 6. Test health
curl http://localhost:3001/health
```

## 🧪 Testing After Deployment

```bash
# 1. Service is running
pm2 status | grep cdr-api

# 2. Health check passes
curl -s http://localhost:3001/health | jq

# 3. Database connected
curl -s http://localhost:3001/db/health | jq

# 4. Queue operational
curl -s http://localhost:3001/queue/stats | jq

# 5. CDR endpoint works (with auth)
curl -H "Authorization: Bearer $API_SECRET" \
  "http://localhost:3001/cdrs?i_account=123&limit=10"
```

## 📊 Monitoring

### PM2 Web Interface

```bash
pm2 web
# Access at http://your-server:9615
```

### Log Rotation

PM2 handles log rotation automatically, but you can configure it:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### Monitoring with Monit

Install monit:
```bash
sudo apt install monit
```

Configure `/etc/monit/conf.d/cdr-api`:
```
check process cdr-api with pidfile /home/user/.pm2/pids/cdr-api-0.pid
  start program = "/usr/bin/pm2 start cdr-api"
  stop program = "/usr/bin/pm2 stop cdr-api"
  if failed port 3001 protocol http request /health
    with timeout 10 seconds
    then restart
  if 5 restarts within 5 cycles then timeout
```

## 🚨 Troubleshooting

### API Won't Start
```bash
# Check logs
pm2 logs cdr-api

# Check if port is in use
sudo lsof -i :3001

# Check database connection
psql -U replicator -h localhost -d sippy -c "SELECT 1"

# Rebuild
cd /var/www/cdr-api
npm run build
pm2 restart cdr-api
```

### High Memory Usage
```bash
# Check memory
pm2 status

# Restart to clear memory
pm2 restart cdr-api

# Adjust PM2 config if needed (reduce instances)
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check replication status
curl http://localhost:3001/replication-status

# Check database health
curl http://localhost:3001/db/health
```

## 📈 Performance Tuning

### Node.js Options

Add to PM2 config:
```javascript
node_args: '--max-old-space-size=2048'
```

### Database Connection Pool

Adjust in `.env`:
```bash
DB_MAX_CONNECTIONS=50  # Increase if needed
```

### Queue Size

Adjust in `.env`:
```bash
QUEUE_MAX_SIZE=500  # Increase for high traffic
```

## 🔄 Zero-Downtime Deployment

```bash
# Deploy with reload instead of restart
cd /var/www/cdr-api
git pull
npm install
npm run build
pm2 reload cdr-api  # Graceful reload
```

## 📝 Maintenance

### Regular Tasks

```bash
# Weekly: Check logs for errors
pm2 logs cdr-api --lines 1000 | grep -i error

# Weekly: Check database performance
curl http://localhost:3001/queue/stats

# Monthly: Update dependencies
npm audit
npm update
npm run build
pm2 restart cdr-api

# Monthly: Clean up old logs
pm2 flush
```

---

**VPS Hosting Benefits:**
- ✅ No cold starts
- ✅ Persistent connections
- ✅ Better performance
- ✅ Full control
- ✅ Simpler architecture
- ✅ Lower costs at scale

**Status:** ✅ Production Ready  
**Version:** 2.0.0  
**Last Updated:** November 29, 2025

