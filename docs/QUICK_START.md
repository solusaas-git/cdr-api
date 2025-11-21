# CDR API - Quick Start Checklist

Fast-track guide to get your CDR API with PostgreSQL replication up and running.

## 📋 Pre-Flight Checklist

### Access Requirements
- [ ] SSH access to Sippy server (FreeBSD)
- [ ] Root/sudo access on Sippy server
- [ ] A separate server for the replica (Ubuntu/Debian recommended)
- [ ] Network connectivity between servers (port 5432)

### Information Needed
- [ ] Sippy server IP address: `_________________`
- [ ] Replica server IP address: `_________________`
- [ ] Sippy PostgreSQL database name (usually `sippy`)
- [ ] Sippy PostgreSQL port (usually `5432`)
- [ ] CDR table name (usually `xdrs`)

---

## 🚀 Quick Setup (30 minutes)

### Phase 1: Master Configuration (10 min)

**On Sippy Server:**

```bash
# 1. Edit PostgreSQL config
sudo vi /usr/local/pgsql/data/postgresql.conf
```

Add these lines:
```ini
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB
max_replication_slots = 10
hot_standby = on
```

```bash
# 2. Create replication user
sudo -u postgres psql << EOF
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'YOUR_STRONG_PASSWORD';
GRANT CONNECT ON DATABASE sippy TO replicator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replicator;
SELECT * FROM pg_create_physical_replication_slot('replica_slot_1');
EOF

# 3. Allow replica connection
echo "host replication replicator REPLICA_IP/32 scram-sha-256" | sudo tee -a /usr/local/pgsql/data/pg_hba.conf
echo "host sippy replicator REPLICA_IP/32 scram-sha-256" | sudo tee -a /usr/local/pgsql/data/pg_hba.conf

# 4. Restart PostgreSQL
sudo service postgresql restart

# 5. Verify
sudo service postgresql status
```

✅ **Test from replica server:**
```bash
psql -h SIPPY_IP -U replicator -d sippy -c "SELECT version();"
```

---

### Phase 2: Replica Setup (15 min)

**On Replica Server:**

```bash
# 1. Install PostgreSQL 16
sudo apt update
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-16

# 2. Stop and clear data directory
sudo systemctl stop postgresql
sudo rm -rf /var/lib/postgresql/16/main/*

# 3. Create base backup
sudo -u postgres pg_basebackup \
  -h SIPPY_IP \
  -D /var/lib/postgresql/16/main \
  -U replicator \
  -P -v -R -X stream \
  -C -S replica_slot_1

# 4. Start replica
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 5. Verify replication
sudo -u postgres psql -c "SELECT * FROM pg_stat_wal_receiver;"
sudo -u postgres psql -c "SELECT pg_is_in_recovery();"  # Should return 't'
```

✅ **Replication is working!**

```bash
# 6. Create indexes for performance
sudo -u postgres psql sippy << EOF
CREATE INDEX CONCURRENTLY idx_xdrs_account_time ON xdrs(i_account, connect_time DESC);
CREATE INDEX CONCURRENTLY idx_xdrs_connect_time ON xdrs(connect_time DESC);
CREATE INDEX CONCURRENTLY idx_xdrs_disconnect_cause ON xdrs(disconnect_cause);
CREATE INDEX CONCURRENTLY idx_xdrs_cli ON xdrs(cli);
CREATE INDEX CONCURRENTLY idx_xdrs_cld ON xdrs(cld);
EOF
```

---

### Phase 3: API Deployment (5 min)

**On Replica Server:**

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 2. Deploy API
sudo mkdir -p /opt/cdr-api
sudo chown $USER:$USER /opt/cdr-api
cd /opt/cdr-api

# Upload your cdr-api files here (scp, git clone, etc.)

# 3. Install dependencies
npm install

# 4. Configure
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
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
```

```bash
# 5. Build and start
npm run build
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions

# 6. Test
curl http://localhost:3001/health
curl "http://localhost:3001/cdrs?i_account=14&limit=10"
```

✅ **API is running!**

---

## 🧪 Testing & Validation

### 1. Test Replication Lag

```bash
sudo -u postgres psql -c "
SELECT 
  CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
    THEN 0
    ELSE EXTRACT (EPOCH FROM now() - pg_last_xact_replay_timestamp())
  END AS lag_seconds;
"
```

**Expected:** < 1 second

### 2. Test API Performance

```bash
# Small query (should be < 1 second)
time curl "http://localhost:3001/cdrs?i_account=14&limit=500"

# Medium query (should be < 5 seconds)
time curl "http://localhost:3001/cdrs?i_account=14&limit=10000"

# Large query (should be < 30 seconds)
time curl "http://localhost:3001/cdrs?i_account=14&limit=100000"
```

### 3. Test Data Consistency

```bash
# On master (Sippy)
sudo -u postgres psql sippy -c "SELECT COUNT(*) FROM xdrs WHERE i_account = 14;"

# On replica
sudo -u postgres psql sippy -c "SELECT COUNT(*) FROM xdrs WHERE i_account = 14;"
```

**Expected:** Same count (or very close if actively inserting)

---

## 🔗 Next.js Integration

### Update Your Next.js App

1. **Add environment variable:**
```bash
# ovo/.env.local
NEXT_PUBLIC_CDR_API_URL=http://REPLICA_IP:3001
```

2. **Copy the service file:**
```bash
# Copy from cdr-api/NEXTJS_INTEGRATION.md
# Create: ovo/src/services/cdrApiService.ts
```

3. **Update API routes:**
```bash
# Update: ovo/src/app/api/sippy/account/[id]/cdrs/route.ts
# Update: ovo/src/app/api/admin/cdrs/route.ts
```

4. **Test:**
```bash
cd ovo
npm run dev

# Open http://localhost:3000/cdrs
# Check browser console for performance logs
```

---

## 📊 Performance Benchmarks

### Expected Results

| Records | Old (Sippy API) | New (CDR API) | Improvement |
|---------|-----------------|---------------|-------------|
| 500     | 30-60s          | 0.5-2s        | **30x**     |
| 10,000  | 120-180s        | 2-5s          | **40x**     |
| 50,000  | 300-600s        | 10-20s        | **30x**     |
| 100,000 | Timeout         | 20-40s        | **∞**       |
| 1M      | Impossible      | 60-120s       | **∞**       |

---

## 🔒 Security Hardening (Production)

### 1. Firewall Rules

```bash
# On replica server
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (if using Nginx)
sudo ufw allow 443/tcp     # HTTPS (if using Nginx)
sudo ufw allow from YOUR_NEXTJS_IP to any port 3001  # API (restrict to your app)
sudo ufw enable
```

### 2. PostgreSQL Security

```bash
# Edit postgresql.conf
sudo vi /etc/postgresql/16/main/postgresql.conf
```

Change:
```ini
listen_addresses = 'localhost'  # Only listen on localhost
```

```bash
sudo systemctl restart postgresql
```

### 3. Setup Nginx + SSL (Optional but recommended)

```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config (see DEPLOYMENT.md for full config)
sudo nano /etc/nginx/sites-available/cdr-api

# Enable site
sudo ln -s /etc/nginx/sites-available/cdr-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d cdr-api.yourdomain.com
```

---

## 🔍 Monitoring Setup (5 min)

### 1. Replication Lag Monitor

```bash
# Create monitoring script
sudo tee /usr/local/bin/check-replication-lag.sh > /dev/null << 'EOF'
#!/bin/bash
LAG=$(sudo -u postgres psql -t -c "
SELECT COALESCE(
  EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()),
  0
)::int;
")
echo "$(date): Replication lag: ${LAG}s"
if [ "$LAG" -gt 60 ]; then
  echo "WARNING: High replication lag!"
fi
EOF

sudo chmod +x /usr/local/bin/check-replication-lag.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/check-replication-lag.sh >> /var/log/replication-lag.log 2>&1") | crontab -
```

### 2. API Health Monitor

```bash
# Create health check script
sudo tee /usr/local/bin/check-api-health.sh > /dev/null << 'EOF'
#!/bin/bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)
if [ "$RESPONSE" != "200" ]; then
  echo "$(date): API health check failed! Status: $RESPONSE"
  # Restart API
  pm2 restart cdr-api
fi
EOF

sudo chmod +x /usr/local/bin/check-api-health.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/check-api-health.sh >> /var/log/api-health.log 2>&1") | crontab -
```

---

## 🐛 Troubleshooting

### Replication Not Working

```bash
# Check master logs
ssh sippy-server "tail -100 /usr/local/pgsql/data/log/postgresql-*.log"

# Check replica logs
sudo tail -100 /var/log/postgresql/postgresql-16-main.log

# Check network
telnet SIPPY_IP 5432

# Check replication slot
ssh sippy-server "sudo -u postgres psql -c 'SELECT * FROM pg_replication_slots;'"
```

### API Not Responding

```bash
# Check PM2 status
pm2 status
pm2 logs cdr-api --lines 100

# Check database connection
sudo -u postgres psql sippy -c "SELECT 1;"

# Restart API
pm2 restart cdr-api
```

### Slow Queries

```bash
# Check indexes
sudo -u postgres psql sippy -c "\d+ xdrs"

# Check query performance
sudo -u postgres psql sippy -c "EXPLAIN ANALYZE SELECT * FROM xdrs WHERE i_account = 14 LIMIT 1000;"

# Analyze table
sudo -u postgres psql sippy -c "ANALYZE xdrs;"
```

---

## 📚 Additional Resources

- **Full Deployment Guide:** See `DEPLOYMENT.md`
- **Next.js Integration:** See `NEXTJS_INTEGRATION.md`
- **API Documentation:** See `README.md`

---

## ✅ Success Criteria

You're done when:

- [ ] Replication lag < 1 second
- [ ] API health check returns 200
- [ ] Can fetch 100K records in < 30 seconds
- [ ] Next.js app shows improved performance
- [ ] Monitoring scripts are running
- [ ] PM2 auto-starts on boot

---

## 🎉 You're Ready!

Your high-performance CDR API is now live. Enjoy the 10-50x speed improvement! 🚀

**Need help?** Check the logs:
- Replication: `/var/log/postgresql/`
- API: `pm2 logs cdr-api`
- Monitoring: `/var/log/replication-lag.log`

