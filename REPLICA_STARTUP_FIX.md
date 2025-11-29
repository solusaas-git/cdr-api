# PostgreSQL Replica Startup Fix

## Problem
When the CDR API runs on a PostgreSQL replica server, it fails with the error:
```
"error": "the database system is not yet accepting connections"
```

This happens because PostgreSQL replicas start in recovery mode and must:
1. Connect to the primary server
2. Download WAL (Write-Ahead Logs)
3. Only then accept read-only connections

## Solution
Added a retry mechanism that waits for PostgreSQL to become ready before starting the API server.

### Changes Made

#### 1. Database Module (`src/db.ts`)
Added `waitForPostgres()` function:
- Retries up to 30 times (default)
- Waits 2 seconds between retries (default)
- Tests connection with `SELECT NOW()` query
- Provides clear console logging during startup
- Throws error if database doesn't become ready after all retries

#### 2. Main Server (`src/index.ts`)
Modified the `start()` function to:
- Call `waitForPostgres()` before starting the Fastify server
- Only listen for connections after database is confirmed ready

## Usage

The API will now automatically wait for the database to be ready on startup:

```bash
npm start
```

You'll see console output like:
```
⏳ Waiting for PostgreSQL to become ready...
⏳ Database not ready yet (the database system is not yet accepting connections) — retrying in 2000ms... (30 retries left)
⏳ Database not ready yet (the database system is not yet accepting connections) — retrying in 2000ms... (29 retries left)
...
✅ Database is ready
🚀 CDR API Server is running!
```

## Configuration

You can customize the retry behavior by modifying the `waitForPostgres()` call in `src/index.ts`:

```typescript
// Wait longer (60 retries, 3 seconds between each)
await waitForPostgres(60, 3000);
```

### PM2 Configuration
The `ecosystem.config.js` has been updated with improved restart behavior:
- `restart_delay: 5000` - Waits 5 seconds between restart attempts
- `exp_backoff_restart_delay: 100` - Uses exponential backoff (doubles delay each time)
- `max_restarts: 10` - Limits restart attempts to prevent infinite loops
- `min_uptime: '10s'` - Only counts as successful start if running for 10+ seconds

This ensures PM2 doesn't rapidly restart the app if the database takes time to become ready.

## Deployment

### Quick Deploy (Recommended)

Copy the deployment script to your VPS and run it:

```bash
# On your VPS
cd /var/www/cdr-api
chmod +x deploy-fix.sh
./deploy-fix.sh
```

### Manual Deployment

If you prefer to deploy manually:

```bash
cd /var/www/cdr-api
git pull
npm install
npm run build
pm2 restart cdr-api
pm2 logs cdr-api --lines 20
```

The API will now handle replica startup delays gracefully.

## What You'll See

### Before the Fix
```
❌ Health check failed: the database system is not yet accepting connections
PM2 rapidly restarts the service
Service appears unhealthy
```

### After the Fix
```
⏳ Waiting for PostgreSQL to become ready...
⏳ Database not ready yet (the database system is not yet accepting connections) — retrying in 2000ms... (30 retries left)
⏳ Database not ready yet (the database system is not yet accepting connections) — retrying in 2000ms... (29 retries left)
✅ Database is ready
🚀 CDR API Server is running!
📡 Listening on: http://localhost:3001
```

## Testing

After deployment, test the health endpoint:

```bash
curl http://localhost:3001/health
```

You should get:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-11-29T15:30:00.000Z",
  "environment": "local"
}
```

