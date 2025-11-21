# CDR API Deployment Guide

Complete step-by-step guide to deploy the CDR API with PostgreSQL replication.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [PostgreSQL Replication Setup](#postgresql-replication-setup)
3. [API Server Setup](#api-server-setup)
4. [Nginx Reverse Proxy](#nginx-reverse-proxy)
5. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Prerequisites

### Hardware Requirements

**Replica Server (Minimum):**
- CPU: 4 cores
- RAM: 8GB (16GB recommended)
- Storage: SSD with 2x the size of your CDR database
- Network: Low latency connection to Sippy server

### Software Requirements

- Ubuntu 22.04 LTS (or similar)
- PostgreSQL 16
- Node.js 20 LTS
- PM2 (process manager)
- Nginx (optional, for reverse proxy)

---

## PostgreSQL Replication Setup

### Step 1: Configure Master (Sippy Server)

SSH into your Sippy server:

```bash
ssh user@sippy-server
```

#### 1.1 Edit PostgreSQL Configuration

```bash
sudo vi /usr/local/pgsql/data/postgresql.conf
```

Add/modify these lines:

```ini
# Replication Settings
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB
max_replication_slots = 10
hot_standby = on
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/16/archive/%f && cp %p /var/lib/postgresql/16/archive/%f'
```

#### 1.2 Create Replication User

```bash
sudo -u postgres psql
```

```sql
-- Create replication user
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'STRONG_PASSWORD_HERE';

-- Grant necessary permissions
GRANT CONNECT ON DATABASE sippy TO replicator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replicator;
GRANT USAGE ON SCHEMA public TO replicator;

-- Create replication slot
SELECT * FROM pg_create_physical_replication_slot('replica_slot_1');

-- Verify
\du replicator
```

#### 1.3 Configure Client Authentication

```bash
sudo vi /usr/local/pgsql/data/pg_hba.conf
```

Add these lines (replace `REPLICA_SERVER_IP` with your replica server IP):

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
host    replication     replicator      REPLICA_SERVER_IP/32    scram-sha-256
host    sippy           replicator      REPLICA_SERVER_IP/32    scram-sha-256
```

#### 1.4 Restart PostgreSQL

```bash
# FreeBSD
sudo service postgresql restart

# Verify it's running
sudo service postgresql status
```

#### 1.5 Test Connection from Replica Server

From your replica server, test the connection:

```bash
psql -h SIPPY_SERVER_IP -U replicator -d sippy -c "SELECT version();"
```

---

### Step 2: Setup Replica Server

SSH into your replica server:

```bash
ssh user@replica-server
```

#### 2.1 Install PostgreSQL 16

```bash
# Add PostgreSQL repository
sudo apt update
sudo apt install -y wget gnupg2
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# Install PostgreSQL 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# Stop PostgreSQL
sudo systemctl stop postgresql
```

#### 2.2 Create Base Backup

```bash
# Remove default data directory
sudo rm -rf /var/lib/postgresql/16/main/*

# Create base backup from master
sudo -u postgres pg_basebackup \
  -h SIPPY_SERVER_IP \
  -D /var/lib/postgresql/16/main \
  -U replicator \
  -P \
  -v \
  -R \
  -X stream \
  -C \
  -S replica_slot_1

# Enter the replicator password when prompted
```

**Flags explained:**
- `-h`: Master server hostname/IP
- `-D`: Data directory
- `-U`: Replication user
- `-P`: Show progress
- `-v`: Verbose output
- `-R`: Create standby.signal and configure replication
- `-X stream`: Stream WAL during backup
- `-C`: Create replication slot
- `-S`: Replication slot name

#### 2.3 Configure Replica

The `-R` flag automatically creates the configuration, but verify it:

```bash
# Check standby.signal exists
ls -la /var/lib/postgresql/16/main/standby.signal

# Check auto configuration
cat /var/lib/postgresql/16/main/postgresql.auto.conf
```

You should see something like:

```ini
primary_conninfo = 'user=replicator password=PASSWORD host=SIPPY_SERVER_IP port=5432 sslmode=prefer'
primary_slot_name = 'replica_slot_1'
```

#### 2.4 Optimize Replica Settings

Edit PostgreSQL configuration:

```bash
sudo vi /etc/postgresql/16/main/postgresql.conf
```

Add/modify these settings:

```ini
# Performance Settings
shared_buffers = 2GB                    # 25% of RAM
effective_cache_size = 6GB              # 75% of RAM
work_mem = 64MB
maintenance_work_mem = 512MB
max_connections = 100

# Replica-specific
hot_standby = on
max_standby_streaming_delay = 30s
wal_receiver_status_interval = 10s
hot_standby_feedback = on

# Logging
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_line_prefix = '%m [%p] %u@%d '
log_min_duration_statement = 1000       # Log slow queries (>1s)
```

#### 2.5 Start Replica

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Check status
sudo systemctl status postgresql
```

#### 2.6 Verify Replication

```bash
# Check replication status
sudo -u postgres psql -c "SELECT * FROM pg_stat_wal_receiver;"

# Check if it's in recovery mode (should return 't')
sudo -u postgres psql -c "SELECT pg_is_in_recovery();"

# Check replication lag
sudo -u postgres psql -c "
SELECT 
  CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
    THEN 0
    ELSE EXTRACT (EPOCH FROM now() - pg_last_xact_replay_timestamp())
  END AS replication_lag_seconds;
"
```

#### 2.7 Create Indexes for CDR Queries

Connect to the replica and create indexes:

```bash
sudo -u postgres psql sippy
```

```sql
-- Create indexes for optimal CDR query performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xdrs_account_time 
  ON xdrs(i_account, connect_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xdrs_connect_time 
  ON xdrs(connect_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xdrs_disconnect_cause 
  ON xdrs(disconnect_cause);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xdrs_cli 
  ON xdrs(cli);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xdrs_cld 
  ON xdrs(cld);

-- Verify indexes
\di+ idx_xdrs_*
```

---

## API Server Setup

### Step 3: Install Node.js and Dependencies

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version

# Install PM2 globally
sudo npm install -g pm2

# Install pino-pretty for better logs
sudo npm install -g pino-pretty
```

### Step 4: Deploy CDR API

```bash
# Create application directory
sudo mkdir -p /opt/cdr-api
sudo chown $USER:$USER /opt/cdr-api

# Clone or copy your API code
cd /opt/cdr-api
# (Upload your cdr-api files here)

# Install dependencies
npm install

# Create .env file
cp .env.example .env
nano .env
```

Edit `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sippy
DB_USER=replicator
DB_PASSWORD=YOUR_REPLICATOR_PASSWORD
DB_MAX_CONNECTIONS=20

API_PORT=3001
API_HOST=0.0.0.0

ALLOWED_ORIGINS=http://localhost:3000,https://your-nextjs-domain.com
```

### Step 5: Build and Start API

```bash
# Build TypeScript
npm run build

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs cdr-api

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions printed by the command above
```

### Step 6: Test API

```bash
# Health check
curl http://localhost:3001/health

# Test CDR query (replace with your account ID)
curl "http://localhost:3001/cdrs?i_account=14&limit=10"

# Test stats endpoint
curl "http://localhost:3001/cdrs/stats?i_account=14"
```

---

## Nginx Reverse Proxy

### Step 7: Setup Nginx (Optional but Recommended)

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/cdr-api
```

Add this configuration:

```nginx
upstream cdr_api {
    least_conn;
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name cdr-api.yourdomain.com;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=cdr_limit:10m rate=10r/s;
    limit_req zone=cdr_limit burst=20 nodelay;

    # Logging
    access_log /var/log/nginx/cdr-api-access.log;
    error_log /var/log/nginx/cdr-api-error.log;

    location / {
        proxy_pass http://cdr_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for large requests
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
```

Enable the site:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/cdr-api /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Step 8: Setup SSL with Let's Encrypt (Production)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d cdr-api.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## Monitoring & Maintenance

### Step 9: Setup Monitoring

#### Monitor Replication Lag

Create a monitoring script:

```bash
sudo nano /usr/local/bin/check-replication-lag.sh
```

```bash
#!/bin/bash
LAG=$(sudo -u postgres psql -t -c "
SELECT 
  CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
    THEN 0
    ELSE EXTRACT (EPOCH FROM now() - pg_last_xact_replay_timestamp())
  END AS lag;
")

echo "Replication lag: ${LAG} seconds"

# Alert if lag > 60 seconds
if (( $(echo "$LAG > 60" | bc -l) )); then
    echo "WARNING: Replication lag is high!"
    # Add your alerting logic here (email, Slack, etc.)
fi
```

```bash
sudo chmod +x /usr/local/bin/check-replication-lag.sh

# Add to crontab (check every 5 minutes)
crontab -e
```

Add:

```
*/5 * * * * /usr/local/bin/check-replication-lag.sh >> /var/log/replication-lag.log 2>&1
```

#### Monitor API Performance

```bash
# PM2 monitoring
pm2 monit

# Or use PM2 Plus (free tier available)
pm2 link YOUR_PM2_PLUS_KEY
```

### Step 10: Backup Strategy

Even though this is a replica, set up backups:

```bash
# Create backup script
sudo nano /usr/local/bin/backup-replica.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup using pg_dump (logical backup)
sudo -u postgres pg_dump sippy | gzip > $BACKUP_DIR/sippy_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "sippy_*.sql.gz" -mtime +7 -delete

echo "Backup completed: sippy_$DATE.sql.gz"
```

```bash
sudo chmod +x /usr/local/bin/backup-replica.sh

# Schedule daily backups at 2 AM
sudo crontab -e
```

Add:

```
0 2 * * * /usr/local/bin/backup-replica.sh >> /var/log/postgresql-backup.log 2>&1
```

---

## Performance Tuning

### PostgreSQL

```sql
-- Analyze tables for query optimization
ANALYZE xdrs;

-- Check index usage
SELECT 
  schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND tablename = 'xdrs'
ORDER BY idx_scan DESC;

-- Check table statistics
SELECT * FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = 'xdrs';
```

### API Server

- Adjust `DB_MAX_CONNECTIONS` based on load
- Use PM2 cluster mode (already configured in ecosystem.config.js)
- Monitor memory usage: `pm2 monit`

---

## Troubleshooting

### Replication Not Working

```bash
# Check master logs
tail -f /usr/local/pgsql/data/log/postgresql-*.log

# Check replica logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# Check network connectivity
telnet SIPPY_SERVER_IP 5432

# Verify replication slot on master
sudo -u postgres psql -c "SELECT * FROM pg_replication_slots;"
```

### High Replication Lag

- Check network bandwidth
- Verify master server isn't overloaded
- Increase `wal_keep_size` on master
- Check disk I/O on replica

### API Performance Issues

```bash
# Check PostgreSQL slow queries
sudo -u postgres psql sippy -c "
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
"

# Monitor API logs
pm2 logs cdr-api --lines 100

# Check system resources
htop
iotop
```

---

## Security Checklist

- [ ] Firewall configured (only allow necessary ports)
- [ ] PostgreSQL only accepts connections from localhost
- [ ] Strong passwords for database users
- [ ] SSL/TLS enabled for API (Nginx with Let's Encrypt)
- [ ] Rate limiting enabled (Nginx)
- [ ] Regular security updates: `sudo apt update && sudo apt upgrade`
- [ ] Monitoring and alerting configured
- [ ] Backups tested and verified

---

## Next Steps

1. Update your Next.js app to use the new API endpoint
2. Implement authentication middleware in the API
3. Set up monitoring dashboards (Grafana + Prometheus)
4. Configure log aggregation (ELK stack or similar)
5. Plan for scaling (load balancer, multiple replicas)

---

## Support

For issues or questions:
- Check logs: `pm2 logs cdr-api`
- PostgreSQL logs: `/var/log/postgresql/`
- Nginx logs: `/var/log/nginx/`

