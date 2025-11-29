# CDR API PostgreSQL Replica Fix - Summary

## Problem Solved
Fixed the issue where CDR API fails to start on PostgreSQL replica with error:
> "the database system is not yet accepting connections"

## Files Modified

### 1. `src/db.ts`
**Added:** `waitForPostgres()` function
- Retries database connection up to 30 times (60 seconds total)
- 2-second delay between retries
- Clear logging of retry attempts
- Graceful error handling

### 2. `src/index.ts`
**Modified:** `start()` function
- Now calls `waitForPostgres()` before starting server
- Ensures database is ready before accepting connections

### 3. `ecosystem.config.js`
**Added:** PM2 restart optimization
- `restart_delay: 5000` - 5 second delay between restarts
- `exp_backoff_restart_delay: 100` - Exponential backoff for retries
- Prevents rapid restart loops during database startup

### 4. `dist/*` (Built Files)
**Rebuilt:** All TypeScript files compiled to JavaScript

## New Files Created

### 1. `REPLICA_STARTUP_FIX.md`
Complete documentation of the fix, usage, and deployment instructions

### 2. `deploy-fix.sh`
Automated deployment script for VPS:
```bash
./deploy-fix.sh
```

### 3. `test-connection.sh`
Quick test script to verify database connectivity:
```bash
./test-connection.sh
```

## How It Works

### Before
```
API starts → Tries to connect → Database not ready → CRASH
PM2 restarts immediately → Same issue → CRASH (repeat)
```

### After
```
API starts → Tries to connect → Database not ready → WAIT 2s
→ Retry → Still not ready → WAIT 2s
→ Retry → Database ready! → START SERVER ✅
```

## Deployment Steps

1. **Pull changes on VPS:**
   ```bash
   cd /var/www/cdr-api
   git pull
   ```

2. **Run deployment script:**
   ```bash
   ./deploy-fix.sh
   ```

3. **Verify it's working:**
   ```bash
   ./test-connection.sh
   ```

## Expected Behavior

When you restart the API (or the server reboots), you'll see:

```
⏳ Waiting for PostgreSQL to become ready...
⏳ Database not ready yet (the database system is not yet accepting connections) — retrying in 2000ms... (30 retries left)
⏳ Database not ready yet (the database system is not yet accepting connections) — retrying in 2000ms... (29 retries left)
[... may continue for several attempts ...]
✅ Database is ready
✅ Connected to PostgreSQL replica
🚀 CDR API Server is running!
📡 Listening on: http://localhost:3001
```

## Configuration Options

### Adjust Retry Behavior
In `src/index.ts`, modify the `waitForPostgres()` call:

```typescript
// More retries, longer delay
await waitForPostgres(60, 3000); // 60 retries, 3 seconds each = 3 minutes

// Fewer retries, shorter delay
await waitForPostgres(15, 1000); // 15 retries, 1 second each = 15 seconds
```

### Adjust PM2 Restart Delay
In `ecosystem.config.js`:

```javascript
restart_delay: 10000, // Wait 10 seconds between restarts
```

## Monitoring

After deployment, monitor the logs:

```bash
# Watch live logs
pm2 logs cdr-api

# Check PM2 status
pm2 status

# View recent logs only
pm2 logs cdr-api --lines 50 --nostream
```

## Troubleshooting

### If API still fails to start:
1. Check PostgreSQL replica status: `systemctl status postgresql`
2. Verify replication is working: Check PostgreSQL logs
3. Increase retry count in `waitForPostgres()` call
4. Check database credentials in `.env`

### If API starts but health check fails:
1. Test database directly: `psql -U replicator -h localhost -d sippy`
2. Check if user has SELECT permissions
3. Verify DATABASE_URL or DB_* environment variables

## Testing

Test the health endpoint:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-11-29T15:30:00.000Z",
  "environment": "local"
}
```

---

**Date:** November 29, 2025  
**Status:** ✅ Complete and Ready to Deploy

