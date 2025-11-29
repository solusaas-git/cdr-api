# Request Queue with Circuit Breaker - Implementation Guide

## 🎯 Problem Solved

When PostgreSQL replica is slow, recovering from WAL replay, or temporarily unavailable:
- **Before:** API crashes, requests fail immediately, users see errors
- **After:** Requests are queued, processed when DB recovers, graceful degradation

## 🏗️ Architecture

```
Incoming Request
      ↓
  Queue Layer (Circuit Breaker)
      ↓
   ┌─ CLOSED (healthy) → Process immediately
   ├─ OPEN (unhealthy) → Queue and wait
   └─ HALF_OPEN (testing) → Try processing, monitor results
      ↓
  Database Query
      ↓
  Response to Client
```

## 🔄 Circuit Breaker States

### 1. **CLOSED** (Normal Operation)
- Database is healthy
- Requests process immediately
- No queuing delay

### 2. **OPEN** (Database Problems)
- Too many failures detected (default: 5 consecutive failures)
- All requests are queued
- No database calls made
- Waits for reset timeout (default: 60 seconds)

### 3. **HALF_OPEN** (Recovery Testing)
- After reset timeout expires
- Gradually tests if database recovered
- Success threshold: 3 consecutive successes → back to CLOSED
- Any failure → back to OPEN

## 📊 How It Works

### Request Flow

```typescript
// When a request comes in:
1. Check if queue is full → Reject with 503 if overloaded
2. Add request to FIFO queue
3. Process queue in order
4. Track success/failure for circuit breaker
5. Automatically adjust based on database health
```

### Queue Processing

```typescript
// Queue automatically:
- Processes requests one by one (FIFO)
- Cleans up expired requests (>2 minutes old)
- Pauses when circuit is OPEN
- Resumes when circuit moves to HALF_OPEN or CLOSED
- Implements exponential backoff
```

## ⚙️ Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Queue Configuration (all optional, these are defaults)
QUEUE_MAX_SIZE=200                    # Max requests in queue
QUEUE_REQUEST_TIMEOUT=30000           # Request timeout (30s)
QUEUE_FAILURE_THRESHOLD=5             # Failures before circuit opens
QUEUE_SUCCESS_THRESHOLD=3             # Successes to close circuit
QUEUE_CIRCUIT_RESET_TIMEOUT=60000     # Time before retry (60s)
QUEUE_MAX_REQUEST_AGE=120000          # Max time in queue (2min)
```

### Tuning Recommendations

#### High Traffic Site (many concurrent users)
```bash
QUEUE_MAX_SIZE=500
QUEUE_REQUEST_TIMEOUT=45000
QUEUE_CIRCUIT_RESET_TIMEOUT=30000
```

#### Low Traffic Site (fewer users, prefer stability)
```bash
QUEUE_MAX_SIZE=100
QUEUE_REQUEST_TIMEOUT=60000
QUEUE_CIRCUIT_RESET_TIMEOUT=120000
```

#### Replica with frequent WAL delays
```bash
QUEUE_FAILURE_THRESHOLD=10
QUEUE_CIRCUIT_RESET_TIMEOUT=120000
QUEUE_MAX_REQUEST_AGE=180000
```

## 🔍 Monitoring

### Check Queue Stats

```bash
curl http://localhost:3001/queue/stats
```

Response:
```json
{
  "success": true,
  "queueLength": 5,
  "maxQueueSize": 200,
  "circuitState": "CLOSED",
  "failureCount": 0,
  "successCount": 0,
  "isProcessing": true,
  "utilizationPercent": 2,
  "timestamp": "2025-11-29T15:30:00.000Z"
}
```

### Health Check (includes queue stats)

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-11-29T15:30:00.000Z",
  "environment": "local",
  "queue": {
    "queueLength": 0,
    "maxQueueSize": 200,
    "circuitState": "CLOSED",
    "failureCount": 0,
    "successCount": 0,
    "isProcessing": false,
    "utilizationPercent": 0
  }
}
```

## 🚨 Error Responses

### Queue Overloaded (503)

When queue is full:

```json
{
  "success": false,
  "error": "Service temporarily overloaded. Please try again in a moment.",
  "queue_overload": true
}
```

**What to do:**
- Retry after a few seconds
- Consider increasing `QUEUE_MAX_SIZE`
- Check if database is extremely slow

### Request Timeout

When request waits too long in queue:

```json
{
  "success": false,
  "error": "Request timeout - queued too long"
}
```

**What to do:**
- Increase `QUEUE_MAX_REQUEST_AGE`
- Check database performance
- Consider adding more replicas

## 📈 Performance Impact

### Overhead
- **Normal operation (CLOSED):** ~1-2ms per request
- **Queued operation (OPEN):** Depends on queue length and DB recovery
- **Memory usage:** ~1KB per queued request

### Benefits
- **Zero downtime** during replica recovery
- **Graceful degradation** instead of crashes
- **Automatic recovery** when DB comes back online
- **Better user experience** - requests succeed instead of failing

## 🧪 Testing

### Test Circuit Breaker

1. **Stop PostgreSQL replica:**
```bash
sudo systemctl stop postgresql
```

2. **Make requests - they should queue:**
```bash
curl http://localhost:3001/cdrs?i_account=123
# Should queue and eventually timeout if DB doesn't recover
```

3. **Check circuit state:**
```bash
curl http://localhost:3001/queue/stats
# Should show "circuitState": "OPEN"
```

4. **Start PostgreSQL:**
```bash
sudo systemctl start postgresql
```

5. **Wait for circuit reset (60s default)**
```bash
# Circuit will move to HALF_OPEN, then CLOSED
curl http://localhost:3001/queue/stats
```

## 📝 Logs to Watch

### Normal Operation
```
📥 Request queued (1 in queue, circuit: CLOSED)
⚡ Query executed in 45ms - returned 100 rows
✅ REQUEST COMPLETE
```

### Circuit Opening
```
❌ Request failed (5/5): the database system is not yet accepting connections
🔴 Circuit breaker: CLOSED -> OPEN (too many failures)
⏸️  Circuit breaker OPEN - pausing queue processing (12 requests waiting)
```

### Circuit Recovery
```
🔄 Circuit breaker: OPEN -> HALF_OPEN (attempting recovery)
✅ Success in HALF_OPEN state (1/3)
✅ Success in HALF_OPEN state (2/3)
✅ Success in HALF_OPEN state (3/3)
🟢 Circuit breaker: HALF_OPEN -> CLOSED (recovered!)
```

## 🔧 Advanced Usage

### Manual Circuit Reset (for emergencies)

If you need to force reset the circuit breaker (not recommended in production):

```typescript
import { requestQueue } from './queue';

// Force reset
requestQueue.resetCircuit();
```

### Custom Queue Configuration

```typescript
import { RequestQueue } from './queue';

const customQueue = new RequestQueue({
  maxQueueSize: 1000,
  requestTimeout: 60000,
  failureThreshold: 10,
  successThreshold: 5,
  circuitResetTimeout: 120000,
  maxRequestAge: 180000,
});
```

## 🎓 Best Practices

1. **Monitor queue stats regularly**
   - Set up alerts if `utilizationPercent > 80%`
   - Watch for circuit state changes

2. **Tune based on your traffic**
   - Start with defaults
   - Adjust based on monitoring data

3. **Don't make queue too large**
   - Large queues = longer wait times
   - Better to reject fast than queue forever

4. **Set appropriate timeouts**
   - Match to your typical query duration
   - Add buffer for slow queries

5. **Log and alert on circuit state changes**
   - OPEN state = database problems
   - Investigate root cause

## 🚀 Deployment

After pulling changes:

```bash
cd /var/www/cdr-api
git pull
npm install
npm run build
pm2 restart cdr-api
pm2 logs cdr-api
```

Watch for:
```
✅ Database is ready
🚀 CDR API Server is running!
```

## 📊 Monitoring Dashboard Ideas

Track these metrics:
- Queue length over time
- Circuit state changes (CLOSED/OPEN/HALF_OPEN)
- Request success/failure rates
- Average time in queue
- Queue utilization percentage

Example Grafana query (if you add metrics):
```promql
rate(queue_requests_total[5m])
queue_length
circuit_state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)
```

---

**Status:** ✅ Production Ready  
**Last Updated:** November 29, 2025

