# CDR API Security Update - Deployment Steps

## Prerequisites
- SSH access to replica server (88.99.195.187)
- CDR API currently running on the server
- Git repository access

## Step-by-Step Deployment

### 1. Connect to Replica Server

```bash
ssh root@88.99.195.187
# Or: ssh your-user@88.99.195.187
```

### 2. Navigate to CDR API Directory

```bash
cd /path/to/cdr-api
# Find the current directory with: pm2 list
# Or: ps aux | grep node
```

### 3. Backup Current Version (Optional but Recommended)

```bash
# Create a backup of current code
cp -r . ../cdr-api-backup-$(date +%Y%m%d-%H%M%S)

# Backup current .env file
cp .env .env.backup
```

### 4. Pull Latest Changes

```bash
# Stash any local changes (if any)
git stash

# Pull the latest code
git pull origin main

# If you have uncommitted changes to .env, restore them
git stash pop
```

### 5. Verify/Update Environment Variables

Check if `API_SECRET` is set in your `.env` file:

```bash
cat .env | grep API_SECRET
```

If not present or empty, add it:

```bash
nano .env
# Or: vim .env
```

Add this line (use the same secret as in your OVO app):
```env
API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
```

**Full .env configuration should include:**
```env
# PostgreSQL Replica Connection
DATABASE_URL=postgres://replica_monitor:q8uScn%2472%2AxPsR%23t@88.99.195.187:5432/sippy

# API Configuration
API_PORT=3002
API_HOST=0.0.0.0

# CORS - Production domains only
ALLOWED_ORIGINS=https://app.ovoky.io,https://ovoky.io

# Authentication (REQUIRED!)
API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=

# Node Environment
NODE_ENV=production
```

Save and exit (Ctrl+X, then Y, then Enter for nano).

### 6. Install Dependencies (if package.json changed)

```bash
npm install
```

### 7. Build the TypeScript Code

```bash
npm run build
```

You should see:
```
> cdr-api@1.0.0 build
> tsc
```

### 8. Test the Build (Optional)

```bash
# Quick syntax check
node dist/index.js --help 2>&1 | head -5
```

### 9. Restart the CDR API Service

#### If using PM2:

```bash
# Check current status
pm2 list

# Restart the CDR API
pm2 restart cdr-api

# Or if the process has a different name:
pm2 restart <process-id-or-name>

# Check logs to verify it started correctly
pm2 logs cdr-api --lines 50
```

#### If using systemd:

```bash
sudo systemctl restart cdr-api
sudo systemctl status cdr-api
sudo journalctl -u cdr-api -f
```

#### If running directly with node:

```bash
# Stop the current process (find PID first)
ps aux | grep "node.*cdr-api"
kill <PID>

# Start new process
npm start &
```

### 10. Verify the Service is Running

```bash
# Check if the service is listening on port 3002
netstat -tlnp | grep 3002
# Or: ss -tlnp | grep 3002

# Test health endpoint (should work without auth)
curl http://localhost:3002/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-11-21T...",
  "environment": "local"
}
```

### 11. Test Authentication

#### Test 1: Request without authentication (should fail)
```bash
curl -i http://localhost:3002/cdrs?i_account=123
```

Expected: `401 Unauthorized`
```json
{"success":false,"error":"Unauthorized: Missing Authorization header"}
```

#### Test 2: Request with wrong secret (should fail)
```bash
curl -i http://localhost:3002/cdrs?i_account=123 \
  -H "Authorization: Bearer wrong-secret"
```

Expected: `401 Unauthorized`
```json
{"success":false,"error":"Unauthorized: Invalid API secret"}
```

#### Test 3: Request with valid secret (should succeed)
```bash
curl -i http://localhost:3002/cdrs?i_account=123&limit=1 \
  -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
```

Expected: `200 OK`
```json
{
  "success": true,
  "data": [...],
  "limit": 1,
  "offset": 0,
  "duration_ms": ...
}
```

#### Run Automated Test Suite:
```bash
./test-auth.sh
```

All 6 tests should pass.

### 12. Check Logs for Errors

```bash
# PM2 logs
pm2 logs cdr-api --lines 100

# systemd logs
sudo journalctl -u cdr-api -n 100 -f

# Look for these messages:
# ✅ "Request authenticated" - Good!
# ⚠️  "WARNING: API_SECRET not configured" - BAD! Fix .env
# ❌ "Authentication failed" - Check if OVO app has correct secret
```

### 13. Update OVO App Environment (if not done already)

On your OVO app server, ensure `.env.production` has:

```env
CDR_API_URL=https://cdrs.ovoky.io
CDR_API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
```

Then restart OVO app:
```bash
cd /path/to/ovo
pm2 restart ovo
```

### 14. Test End-to-End from OVO App

1. Log into your OVO app: https://ovoky.io
2. Navigate to CDR/Call History page
3. Verify CDRs are loading correctly
4. Check browser console for any 401 errors

### 15. Monitor for Issues

```bash
# Watch logs in real-time
pm2 logs cdr-api --lines 0

# Look for:
# - Authentication success messages
# - Any 401 errors
# - Database connection issues
```

## Troubleshooting

### Issue: "API_SECRET not configured" warning in logs

**Solution:**
```bash
cd /path/to/cdr-api
echo "API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=" >> .env
pm2 restart cdr-api
```

### Issue: OVO app shows "CDR API error: Unauthorized"

**Solution:**
1. Check OVO app has `CDR_API_SECRET` set
2. Verify both secrets match exactly
3. Restart OVO app: `pm2 restart ovo`

### Issue: CDR API won't start after update

**Solution:**
```bash
# Check for syntax errors
npm run build

# Check logs
pm2 logs cdr-api --err

# Restore backup if needed
cd ..
rm -rf cdr-api
mv cdr-api-backup-XXXXXX cdr-api
cd cdr-api
pm2 restart cdr-api
```

### Issue: Port 3002 already in use

**Solution:**
```bash
# Find process using port 3002
lsof -i :3002
# Or: netstat -tlnp | grep 3002

# Kill old process
kill -9 <PID>

# Restart
pm2 restart cdr-api
```

## Rollback Procedure (if needed)

If something goes wrong:

```bash
# Stop current version
pm2 stop cdr-api

# Restore backup
cd /path/to
rm -rf cdr-api
mv cdr-api-backup-XXXXXX cdr-api
cd cdr-api

# Restore .env
cp .env.backup .env

# Restart
pm2 restart cdr-api
```

## Post-Deployment Checklist

- [ ] CDR API is running (check with `pm2 list` or `systemctl status`)
- [ ] Health endpoint responds: `curl http://localhost:3002/health`
- [ ] Unauthorized requests return 401
- [ ] Authorized requests return 200
- [ ] All 6 authentication tests pass
- [ ] OVO app can fetch CDRs successfully
- [ ] No errors in CDR API logs
- [ ] No 401 errors in OVO app logs
- [ ] Database connection is healthy

## Security Notes

✅ **What's Protected:**
- All CDR endpoints require authentication
- API secret is required in Authorization header
- Endpoint listing is hidden from public

✅ **What's Public:**
- `/health` - For monitoring/health checks
- `/` - Basic service info (no endpoints listed)

⚠️ **Important:**
- Never commit `.env` files to git
- Use strong, random API secrets
- Rotate secrets periodically (every 90 days)
- Monitor logs for unauthorized access attempts

## Quick Reference Commands

```bash
# Check service status
pm2 list
pm2 logs cdr-api

# Restart service
pm2 restart cdr-api

# Test authentication
./test-auth.sh

# View recent logs
pm2 logs cdr-api --lines 50

# Check if API is responding
curl http://localhost:3002/health

# Test with authentication
curl http://localhost:3002/cdrs?i_account=123&limit=1 \
  -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
```

## Support

If you encounter issues:
1. Check logs: `pm2 logs cdr-api`
2. Verify .env configuration
3. Test authentication with curl commands above
4. Review `AUTHENTICATION_IMPLEMENTATION.md` for detailed guide
5. Check `SECURITY_FIX.md` for troubleshooting tips

