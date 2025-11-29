# Testing CDR API Endpoints

## 🧪 Quick Test Guide

After deploying, test all endpoints to ensure they work correctly.

## 1. Root Endpoint
```bash
curl http://localhost:3001/

# Expected response:
# {
#   "service": "CDR API",
#   "version": "2.0.0",
#   "status": "running",
#   "environment": "production"
# }
```

## 2. Health Check
```bash
curl http://localhost:3001/health

# Expected response includes:
# - status: "ok"
# - database: "connected"
# - queue stats
# - dbHealth stats
```

## 3. Database Health
```bash
curl http://localhost:3001/db/health

# Expected response:
# {
#   "success": true,
#   "healthy": true,
#   "consecutiveSuccesses": 150,
#   "uptimePercent": 99.8,
#   "summary": "✅ Healthy (150 consecutive successes)"
# }
```

## 4. Queue Statistics
```bash
curl http://localhost:3001/queue/stats

# Expected response:
# {
#   "success": true,
#   "queueLength": 0,
#   "maxQueueSize": 200,
#   "circuitState": "CLOSED",
#   "utilizationPercent": 0
# }
```

## 5. CDR Endpoint (requires auth)
```bash
# Set your API secret
export API_SECRET="your-secret-here"

# Test CDR endpoint
curl -H "Authorization: Bearer $API_SECRET" \
  "http://localhost:3001/cdrs?i_account=123&limit=10"

# Expected response:
# {
#   "success": true,
#   "data": [...],
#   "limit": 10,
#   "offset": 0,
#   "duration_ms": 45
# }
```

## 6. Consumption Endpoint (requires auth)
```bash
curl -H "Authorization: Bearer $API_SECRET" \
  "http://localhost:3001/consumption?i_account=123"

# Expected response:
# {
#   "success": true,
#   "data": {
#     "totalCost": 12.34,
#     "totalCalls": 100,
#     "totalMinutes": 50.5
#   }
# }
```

## 7. Replication Status (requires auth)
```bash
curl -H "Authorization: Bearer $API_SECRET" \
  "http://localhost:3001/replication-status"

# Expected response:
# {
#   "success": true,
#   "replication": {
#     "lagSeconds": 0.5,
#     "isHealthy": true
#   }
# }
```

## 🔧 Troubleshooting

### 404 Not Found
If you get 404 errors, check:
```bash
# Check if server is running
pm2 status

# Check logs for errors
pm2 logs cdr-api --lines 50

# Restart if needed
pm2 restart cdr-api
```

### Connection Refused
```bash
# Check if port 3001 is listening
sudo lsof -i :3001

# Check if API is bound to correct host
# Should be 0.0.0.0 in .env for external access
```

### Authentication Failed (401)
```bash
# Verify API_SECRET in .env
cat /var/www/cdr-api/.env | grep API_SECRET

# Test without auth first (health endpoint)
curl http://localhost:3001/health
```

### Database Errors
```bash
# Check database connection
curl http://localhost:3001/db/health

# Check queue state
curl http://localhost:3001/queue/stats

# If circuit is OPEN, wait 60s for auto-recovery
```

## 📊 All Endpoints Summary

| Endpoint | Auth Required | Method | Purpose |
|----------|---------------|--------|---------|
| `/` | No | GET | Service info |
| `/health` | No | GET | Overall health check |
| `/db/health` | No | GET | Database health status |
| `/queue/stats` | No | GET | Queue statistics |
| `/cdrs` | Yes | GET | Query CDR data |
| `/cdrs/stats` | Yes | GET | CDR statistics |
| `/cdrs/top-destinations` | Yes | GET | Top destinations |
| `/consumption` | Yes | GET | Consumption data |
| `/replication-status` | Yes | GET | Replication lag info |

## ✅ Success Criteria

All these should return 200 OK:
```bash
curl -w "\n%{http_code}\n" http://localhost:3001/
curl -w "\n%{http_code}\n" http://localhost:3001/health
curl -w "\n%{http_code}\n" http://localhost:3001/db/health
curl -w "\n%{http_code}\n" http://localhost:3001/queue/stats
```

With auth (should return 200):
```bash
curl -w "\n%{http_code}\n" \
  -H "Authorization: Bearer $API_SECRET" \
  "http://localhost:3001/cdrs?i_account=123&limit=1"
```

## 🚀 Quick Test Script

Save as `test-all-endpoints.sh`:
```bash
#!/bin/bash

echo "Testing CDR API Endpoints..."
echo ""

# Test public endpoints
echo "1. Root endpoint:"
curl -s http://localhost:3001/ | jq -r '.status' || echo "FAILED"
echo ""

echo "2. Health check:"
curl -s http://localhost:3001/health | jq -r '.status' || echo "FAILED"
echo ""

echo "3. DB Health:"
curl -s http://localhost:3001/db/health | jq -r '.summary' || echo "FAILED"
echo ""

echo "4. Queue Stats:"
curl -s http://localhost:3001/queue/stats | jq -r '.circuitState' || echo "FAILED"
echo ""

echo "✅ All public endpoints tested!"
```

Run it:
```bash
chmod +x test-all-endpoints.sh
./test-all-endpoints.sh
```

